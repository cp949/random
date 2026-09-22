/**
 * `check-baseline.mjs`의 `parseJsonc`와 `runBaselineCheck` 테스트. baseline.json 파생 소비자
 * (tsconfig의 target·lib, demo vite 설정의 import, smoke runner의 baseline.mjs import, smoke
 * Dockerfile의 chromium 리터럴 부재)가 일치하는지 검사한다.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseJsonc, runBaselineCheck } from "../check-baseline.mjs";

describe("parseJsonc", () => {
  it("한 줄 주석과 블록 주석을 무시한다", () => {
    const text = '{\n  // 한 줄 주석\n  "a": 1, /* 블록\n주석 */ "b": 2\n}';

    expect(parseJsonc(text)).toEqual({ a: 1, b: 2 });
  });

  it("문자열 안의 주석 기호는 보존한다", () => {
    const text = '{ "url": "https://example.com/a//b", "c": "/* x */" }';

    expect(parseJsonc(text)).toEqual({
      url: "https://example.com/a//b",
      c: "/* x */",
    });
  });

  it("이스케이프된 따옴표가 있는 문자열도 처리한다", () => {
    expect(parseJsonc('{ "a": "따옴표 \\" // 뒤" }')).toEqual({
      a: '따옴표 " // 뒤',
    });
  });

  it("닫히지 않은 블록 주석은 실패한다", () => {
    expect(() => parseJsonc('{ /* 닫히지 않음 "a": 1 }')).toThrow(/블록 주석/);
  });

  it("주석을 걷어낸 뒤에도 JSON이 아니면 실패한다", () => {
    expect(() => parseJsonc("{ a: 1 }")).toThrow();
  });
});

const tempDirs = [];

const validFiles = {
  "baseline.json": JSON.stringify({
    chromeFloor: 75,
    esTarget: "ES2019",
    chromium: {
      version: "75.0.3765.0",
      revision: 650583,
      platform: "Linux_x64",
      sha256:
        "10ae4e05d9f01a8b646dd2ccc2ac1135e597c472abe5be71552aae7d8a35e2ac",
    },
  }),
  "packages/typescript-config/library.json": [
    "{",
    "  // Chrome 75 하한 라이브러리용",
    '  "extends": "./base.json",',
    '  "compilerOptions": { "target": "ES2019", "lib": ["ES2019"] }',
    "}",
    "",
  ].join("\n"),
  "apps/demo/vite.config.ts": [
    'import { defineConfig } from "vite";',
    'import baseline from "../../baseline.json" with { type: "json" };',
    "export default defineConfig({ build: { target: `chrome${baseline.chromeFloor}` } });",
    "",
  ].join("\n"),
  "packages/legacy-browser-smoke/src/run.mjs": [
    'import { loadBaseline } from "../../../scripts/baseline.mjs";',
    "",
    "const baseline = loadBaseline();",
    "",
  ].join("\n"),
  "packages/legacy-browser-smoke/Dockerfile": [
    "FROM node:24-bullseye-slim",
    "ARG CHROMIUM_PLATFORM",
    "ARG CHROMIUM_REVISION",
    "ARG CHROMIUM_SHA256",
    "",
  ].join("\n"),
};

/** 검사에 필요한 파일을 가진 임시 저장소를 만든다. `overrides`의 값이 null이면 그 파일을 만들지 않는다. */
function makeRepo(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "baseline-check-"));
  tempDirs.push(root);
  for (const [path, content] of Object.entries({
    ...validFiles,
    ...overrides,
  })) {
    if (content === null) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const libraryJson = (compilerOptions) =>
  JSON.stringify({ extends: "./base.json", compilerOptions });

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("runBaselineCheck", () => {
  it("실제 저장소는 통과한다", () => {
    const result = runBaselineCheck();

    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("주석이 있는 library.json을 가진 올바른 저장소는 통과한다", () => {
    const result = runBaselineCheck(makeRepo());

    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("target 대소문자는 구분하지 않는다(tsconfig 옵션은 대소문자 무관)", () => {
    const root = makeRepo({
      "packages/typescript-config/library.json": libraryJson({
        target: "es2019",
        lib: ["es2019"],
      }),
    });

    expect(runBaselineCheck(root).ok).toBe(true);
  });

  it("library.json의 target이 esTarget과 다르면 검출한다", () => {
    const root = makeRepo({
      "packages/typescript-config/library.json": libraryJson({
        target: "ES2020",
        lib: ["ES2019"],
      }),
    });

    const result = runBaselineCheck(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("target");
  });

  it("library.json의 lib이 [esTarget]이 아니면 검출한다", () => {
    const root = makeRepo({
      "packages/typescript-config/library.json": libraryJson({
        target: "ES2019",
        lib: ["ES2019", "DOM"],
      }),
    });

    const result = runBaselineCheck(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("lib");
  });

  it("library.json에 lib이 없으면 검출한다", () => {
    const root = makeRepo({
      "packages/typescript-config/library.json": libraryJson({
        target: "ES2019",
      }),
    });

    const result = runBaselineCheck(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("lib");
  });

  it("vite 설정이 baseline.json을 import하지 않으면 검출한다", () => {
    const root = makeRepo({
      "apps/demo/vite.config.ts":
        'import { defineConfig } from "vite";\nexport default defineConfig({ build: { target: "chrome75" } });\n',
    });

    const result = runBaselineCheck(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("vite.config.ts");
  });

  it("baseline.json을 언급만 하는 주석은 import로 치지 않는다", () => {
    const root = makeRepo({
      "apps/demo/vite.config.ts":
        '// baseline.json에서 읽어야 한다\nexport default { build: { target: "chrome75" } };\n',
    });

    expect(runBaselineCheck(root).ok).toBe(false);
  });

  it("import 속성 없이 baseline.json을 가져와도 통과한다", () => {
    const root = makeRepo({
      "apps/demo/vite.config.ts":
        'import baseline from "../../baseline.json";\nexport default { build: { target: `chrome${baseline.chromeFloor}` } };\n',
    });

    expect(runBaselineCheck(root).ok).toBe(true);
  });

  it("es-x에 없는 프리셋을 가리키는 esTarget이면 검출한다", () => {
    const root = makeRepo({
      "baseline.json": JSON.stringify({
        chromeFloor: 75,
        esTarget: "ES2099",
        chromium: {
          version: "75.0.3765.0",
          revision: 650583,
          platform: "Linux_x64",
          sha256:
            "10ae4e05d9f01a8b646dd2ccc2ac1135e597c472abe5be71552aae7d8a35e2ac",
        },
      }),
      "packages/typescript-config/library.json": libraryJson({
        target: "ES2099",
        lib: ["ES2099"],
      }),
    });

    const result = runBaselineCheck(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("프리셋");
  });

  it("library.json이 없으면 예외가 아니라 문제로 보고한다", () => {
    const root = makeRepo({ "packages/typescript-config/library.json": null });

    const result = runBaselineCheck(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("library.json");
  });

  it("vite 설정 파일이 없으면 문제로 보고한다", () => {
    const root = makeRepo({ "apps/demo/vite.config.ts": null });

    const result = runBaselineCheck(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("vite.config.ts");
  });

  it("smoke runner가 baseline.mjs를 import하지 않으면 검출한다", () => {
    const root = makeRepo({
      "packages/legacy-browser-smoke/src/run.mjs":
        'const chromium = { version: "75.0.3765.0" };\n',
    });

    const result = runBaselineCheck(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("run.mjs");
  });

  it("baseline.mjs를 주석으로만 언급하면 import로 치지 않는다", () => {
    const root = makeRepo({
      "packages/legacy-browser-smoke/src/run.mjs":
        "// baseline.mjs에서 읽어야 한다\nexport const x = 1;\n",
    });

    expect(runBaselineCheck(root).ok).toBe(false);
  });

  it("smoke runner 파일이 없으면 문제로 보고한다", () => {
    const root = makeRepo({
      "packages/legacy-browser-smoke/src/run.mjs": null,
    });

    const result = runBaselineCheck(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("run.mjs");
  });

  it("Dockerfile에 revision 리터럴이 있으면 검출한다", () => {
    const root = makeRepo({
      "packages/legacy-browser-smoke/Dockerfile":
        "FROM node:24-bullseye-slim\nRUN echo 650583\n",
    });

    const result = runBaselineCheck(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("Dockerfile");
    expect(result.problems.join("\n")).toContain("revision");
  });

  it("Dockerfile에 version 리터럴이 있으면 검출한다", () => {
    const root = makeRepo({
      "packages/legacy-browser-smoke/Dockerfile":
        "FROM node:24-bullseye-slim\nRUN echo 75.0.3765.0\n",
    });

    expect(runBaselineCheck(root).ok).toBe(false);
  });

  it("Dockerfile에 sha256 리터럴이 있으면 검출한다", () => {
    const root = makeRepo({
      "packages/legacy-browser-smoke/Dockerfile":
        "FROM node:24-bullseye-slim\nRUN echo 10ae4e05d9f01a8b646dd2ccc2ac1135e597c472abe5be71552aae7d8a35e2ac\n",
    });

    expect(runBaselineCheck(root).ok).toBe(false);
  });

  it("Dockerfile이 없으면 문제로 보고한다", () => {
    const root = makeRepo({ "packages/legacy-browser-smoke/Dockerfile": null });

    const result = runBaselineCheck(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("Dockerfile");
  });

  it("baseline.json이 잘못됐으면 다른 검사를 하지 않고 그 문제를 보고한다", () => {
    const root = makeRepo({ "baseline.json": '{ "chromeFloor": "75" }' });

    const result = runBaselineCheck(root);

    expect(result.ok).toBe(false);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain("baseline.json");
  });

  it("여러 불일치를 한 번에 모두 보고한다", () => {
    const root = makeRepo({
      "packages/typescript-config/library.json": libraryJson({
        target: "ES2020",
        lib: ["ES2020"],
      }),
      "apps/demo/vite.config.ts": "export default {};\n",
    });

    const { problems } = runBaselineCheck(root);

    expect(problems.length).toBeGreaterThanOrEqual(3);
  });
});
