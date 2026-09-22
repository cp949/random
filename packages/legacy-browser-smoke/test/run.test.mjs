/**
 * runner(`src/run.mjs`)가 export하는 순수 함수 테스트. 인자 파싱, chrome 버전 문자열 파싱,
 * exports 타입 맵 구성, `--dump-dom` 출력에서 결과 회수, 판정, 요약 줄 형식을 다룬다.
 * 컨테이너·브라우저를 띄우는 테스트는 없다(단위 테스트만, spec 3.1).
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildExpectedExports,
  extractResult,
  formatSummary,
  judge,
  parseArgs,
  parseChromeVersion,
} from "../src/run.mjs";

describe("parseArgs", () => {
  it("--target container를 읽는다", () => {
    expect(parseArgs(["--target", "container"])).toEqual({
      target: "container",
      chrome: "google-chrome",
    });
  });

  it("--target local과 --chrome 경로를 함께 읽는다", () => {
    expect(
      parseArgs(["--target", "local", "--chrome", "/usr/bin/chrome"]),
    ).toEqual({
      target: "local",
      chrome: "/usr/bin/chrome",
    });
  });

  it("--target이 없으면 거부한다", () => {
    expect(() => parseArgs([])).toThrow(/--target/);
  });

  it("--target이 container·local이 아니면 거부한다", () => {
    expect(() => parseArgs(["--target", "remote"])).toThrow(/--target/);
  });

  it("알 수 없는 인자는 거부한다", () => {
    expect(() => parseArgs(["--target", "local", "--unknown"])).toThrow(
      /알 수 없는 인자/,
    );
  });
});

describe("parseChromeVersion", () => {
  it.each([
    ["Google Chrome 152.0.7977.64\n", "152.0.7977.64"],
    ["Chromium 75.0.3765.0\n", "75.0.3765.0"],
  ])("%s에서 버전 문자열을 뽑는다", (stdout, expected) => {
    expect(parseChromeVersion(stdout)).toBe(expected);
  });

  it("버전 문자열이 없으면 거부한다", () => {
    expect(() => parseChromeVersion("not a version")).toThrow(/버전/);
  });
});

const tempDirs = [];

/**
 * 가짜 dist를 가진 임시 패키지 디렉터리를 만든다. `buildExpectedExports`는 실제 라이브러리
 * 빌드에 의존하지 않아야 하므로 값 하나(`number`)와 함수 하나(`function`)만 내보내는
 * 최소 모듈로 검사한다.
 */
function makeFakePackage() {
  const dir = mktempPackageDir();
  mkdirSync(join(dir, "dist", "secure"), { recursive: true });
  writeFileSync(
    join(dir, "dist", "index.js"),
    "export const a = 1;\nexport function f() {}\n",
  );
  writeFileSync(
    join(dir, "dist", "secure", "index.js"),
    "export const b = {};\n",
  );
  return dir;
}

/** 테스트가 끝나면 지울 임시 디렉터리를 만들고 목록에 등록한다. */
function mktempPackageDir() {
  const dir = mkdtempSync(join(tmpdir(), "fake-package-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("buildExpectedExports", () => {
  it("manifest의 exports 키마다 export 이름→typeof 맵을 만든다", async () => {
    const dir = makeFakePackage();
    const manifest = {
      exports: {
        ".": { default: "./dist/index.js" },
        "./secure": { default: "./dist/secure/index.js" },
      },
    };

    await expect(buildExpectedExports(dir, manifest)).resolves.toEqual({
      ".": { a: "number", f: "function" },
      "./secure": { b: "object" },
    });
  });

  it("exports 값이 문자열이면 그대로 경로로 쓴다", async () => {
    const dir = makeFakePackage();
    const manifest = { exports: { ".": "./dist/index.js" } };

    await expect(buildExpectedExports(dir, manifest)).resolves.toEqual({
      ".": { a: "number", f: "function" },
    });
  });
});

describe("extractResult", () => {
  it("인코딩된 JSON을 디코딩해 돌려준다", () => {
    const payload = {
      ok: true,
      assertions: [{ id: "A1", ok: true, detail: "" }],
    };
    const dom = `<html><body><pre id="result">${encodeURIComponent(JSON.stringify(payload))}</pre></body></html>`;

    expect(extractResult(dom)).toEqual(payload);
  });

  it("결과 요소가 없으면 null이다", () => {
    expect(extractResult("<html><body></body></html>")).toBeNull();
  });

  it("JSON이 아니면 null이다", () => {
    const dom = '<pre id="result">not-json</pre>';

    expect(extractResult(dom)).toBeNull();
  });

  it("인코딩된 <·& 문자를 복원한다", () => {
    const payload = {
      ok: false,
      assertions: [{ id: "A1", ok: false, detail: "a < b & c" }],
    };
    const dom = `<pre id="result">${encodeURIComponent(JSON.stringify(payload))}</pre>`;

    expect(extractResult(dom)).toEqual(payload);
  });
});

describe("judge", () => {
  it("결과가 null이면 FAIL이다", () => {
    expect(judge(null)).toBe(false);
  });

  it("모든 assertion이 ok이면 PASS다", () => {
    expect(judge({ assertions: [{ ok: true }, { ok: true }] })).toBe(true);
  });

  it("하나라도 실패하면 FAIL이다", () => {
    expect(judge({ assertions: [{ ok: true }, { ok: false }] })).toBe(false);
  });

  it("assertion이 0건이면 FAIL이다(결과가 있어도 비어 있으면 신뢰하지 않는다)", () => {
    expect(judge({ assertions: [] })).toBe(false);
  });
});

describe("formatSummary", () => {
  it("spec 4.4의 한 줄 형식과 정확히 같다", () => {
    const line = formatSummary({
      target: "container",
      chrome: "75.0.3765.0",
      platform: "Linux_x64",
      os: "Linux x86_64",
      date: "2026-09-22",
      passed: 13,
      total: 13,
      result: "PASS",
    });

    expect(line).toBe(
      "smoke: target=container chrome=75.0.3765.0 platform=Linux_x64 os=Linux x86_64 headless=true date=2026-09-22 assertions=13/13 result=PASS",
    );
  });
});
