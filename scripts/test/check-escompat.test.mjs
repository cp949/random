import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createEscompatESLint, runEscompatGate } from "../check-escompat.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const eslint = createEscompatESLint();

/** 코드를 저장소 기준 `file` 위치의 dist 파일로 보고 lint한 메시지를 돌려준다. */
async function lint(
  code,
  file = "packages/random/dist/example.js",
  instance = eslint,
) {
  const [result] = await instance.lintText(code, {
    filePath: join(repoRoot, file),
  });
  return result.messages;
}

const rulesOf = (messages) => messages.map((message) => message.ruleId);

/** 파싱 오류(fatal)는 검출로 치지 않는다. */
const noFatal = (messages) => messages.every((message) => !message.fatal);

const atFloor = (chromeFloor) =>
  createEscompatESLint({ baseline: { chromeFloor, esTarget: "ES2019" } });

describe("createEscompatESLint: 위반 검출", () => {
  it.each([
    ["[].at(0);", "es-x/no-array-prototype-at", "배열 리터럴 at"],
    [
      "values.findLast((v) => v);",
      "es-x/no-array-prototype-findlast-findlastindex",
      "변수 receiver의 findLast(aggressive)",
    ],
    ['Object.hasOwn(o, "a");', "es-x/no-object-hasown", "Object.hasOwn"],
    [
      '"a".replaceAll("a", "b");',
      "es-x/no-string-prototype-replaceall",
      "replaceAll",
    ],
    ["Promise.allSettled([]);", "es-x/no-promise-all-settled", "Chrome 76"],
    ["a?.b;", "es-x/no-optional-chaining", "optional chaining(Chrome 80)"],
    ["a ?? b;", "es-x/no-nullish-coalescing-operators", "nullish(Chrome 80)"],
    ["await 1;", "es-x/no-top-level-await", "top-level await(Chrome 89)"],
    [
      "class A { static { } }",
      "es-x/no-class-static-block",
      "class static block(Chrome 94)",
    ],
    ["Math.random();", "no-restricted-properties", "Math.random"],
    [
      "const M = Math; M.random();",
      "no-restricted-syntax",
      "Math를 변수에 담는 우회",
    ],
    ["document.title;", "no-restricted-globals", "document"],
    ["window.location;", "no-restricted-globals", "window"],
    ["structuredClone(x);", "no-restricted-globals", "structuredClone"],
    [
      "crypto.getRandomValues(a);",
      "no-restricted-globals",
      "이름으로 참조한 crypto",
    ],
    ['import "node:fs";', "no-restricted-imports", "node: 내장 모듈"],
    ['import x from "left-pad"; x;', "no-restricted-imports", "외부 패키지"],
    ['import("left-pad");', "no-restricted-syntax", "외부 패키지 동적 import"],
    ["import(name);", "no-restricted-syntax", "계산된 동적 import"],
  ])("`%s`는 %s로 검출된다(%s)", async (code, ruleId) => {
    const messages = await lint(`${code}\n`);

    expect(noFatal(messages)).toBe(true);
    expect(rulesOf(messages)).toContain(ruleId);
  });

  it("dist 안의 eslint-disable 주석이 게이트를 우회하지 못한다", async () => {
    const blanket = await lint("/* eslint-disable */\n[].at(0);\n");
    const targeted = await lint(
      "// eslint-disable-next-line es-x/no-array-prototype-at\n[].at(0);\n",
    );

    expect(rulesOf(blanket)).toContain("es-x/no-array-prototype-at");
    expect(rulesOf(targeted)).toContain("es-x/no-array-prototype-at");
  });
});

describe("createEscompatESLint: 허용", () => {
  it.each([
    ["BigInt(1);", "BigInt(Chrome 67)"],
    ["globalThis.crypto;", "globalThis(Chrome 71)와 globalThis.crypto 접근"],
    ["export const n = 1_000;", "숫자 구분자(Chrome 75)"],
    ['"a".matchAll(/a/g);', "matchAll(Chrome 73)"],
    ["export const url = import.meta.url;", "import.meta(Chrome 64)"],
    ['export const lazy = import("./lazy.js");', "상대 경로 동적 import"],
    ['export * as ns from "./x.js";', "export * as ns(Chrome 72)"],
    [
      "export class A { x = 1; static y = 2; #z = 3; }",
      "클래스 인스턴스·정적·private 필드(Chrome 72~74)",
    ],
    ["#!/usr/bin/env node\nexport const a = 1;", "hashbang(Chrome 74)"],
    [
      "export const doubled = items.map((v) => v * 2).filter(Boolean);",
      "Iterator helper와 이름이 겹치는 배열 메서드",
    ],
    [
      "export const both = z.union([a, b]);",
      "Set 메서드와 이름이 겹치는 도메인 메서드",
    ],
  ])("`%s`는 통과한다(%s)", async (code) => {
    const messages = await lint(`${code}\n`);

    expect(messages).toEqual([]);
  });
});

describe("createEscompatESLint: capabilities 예외", () => {
  const usage = "export const a = c.randomUUID;\nexport const b = c.subtle;\n";

  it("dist/secure/capabilities.js에서만 randomUUID·subtle 참조가 허용된다", async () => {
    expect(
      await lint(usage, "packages/random/dist/secure/capabilities.js"),
    ).toEqual([]);

    const elsewhere = await lint(usage, "packages/random/dist/secure/other.js");
    expect(rulesOf(elsewhere)).toEqual([
      "no-restricted-properties",
      "no-restricted-properties",
    ]);
  });

  it("capabilities.js에서도 Math.random은 금지된다", async () => {
    const messages = await lint(
      "Math.random();\n",
      "packages/random/dist/secure/capabilities.js",
    );

    expect(rulesOf(messages)).toContain("no-restricted-properties");
  });
});

describe("createEscompatESLint: floor 변경이 허용 규칙에 반영된다", () => {
  it("numeric separators는 floor 74에서 실패하고 75에서 통과한다", async () => {
    const code = "export const n = 1_000;\n";

    expect(rulesOf(await lint(code, undefined, atFloor(74)))).toContain(
      "es-x/no-numeric-separators",
    );
    expect(await lint(code, undefined, atFloor(75))).toEqual([]);
  });

  it("optional chaining은 floor 79에서 실패하고 80에서 통과한다", async () => {
    const code = "export const v = a?.b;\n";

    expect(rulesOf(await lint(code, undefined, atFloor(79)))).toContain(
      "es-x/no-optional-chaining",
    );
    expect(await lint(code, undefined, atFloor(80))).toEqual([]);
  });

  it("private 필드는 floor 73에서 실패하고 74에서 통과한다", async () => {
    const code = "export class A { #x = 1; }\n";

    expect(rulesOf(await lint(code, undefined, atFloor(73)))).toContain(
      "es-x/no-class-private-fields",
    );
    expect(await lint(code, undefined, atFloor(74))).toEqual([]);
  });
});

const tempDirs = [];

/** 경로→내용 맵으로 임시 저장소 루트를 만든다. baseline.json과 workspace 설정은 기본으로 넣는다. */
function makeRepo(files, { baseline = { chromeFloor: 75 } } = {}) {
  const root = mkdtempSync(join(tmpdir(), "escompat-"));
  tempDirs.push(root);
  const all = {
    "pnpm-workspace.yaml": 'packages:\n  - "apps/*"\n  - "packages/*"\n',
    "baseline.json": JSON.stringify({
      esTarget: "ES2019",
      chromium: {
        version: "75.0.3765.0",
        revision: 650583,
        platform: "Linux_x64",
        sha256:
          "10ae4e05d9f01a8b646dd2ccc2ac1135e597c472abe5be71552aae7d8a35e2ac",
      },
      ...baseline,
    }),
    ...files,
  };
  for (const [path, content] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const manifest = (name, extra = {}) => JSON.stringify({ name, ...extra });

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("runEscompatGate", () => {
  const lib = { "packages/lib/package.json": manifest("lib") };

  it("정상 dist는 통과한다", async () => {
    const root = makeRepo({
      ...lib,
      "packages/lib/dist/index.js": "export const a = 1;\n",
      "packages/lib/dist/nested/deep.mjs": "export const b = 2;\n",
    });

    const result = await runEscompatGate(root);

    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.files).toHaveLength(2);
  });

  it("위반이 있으면 파일과 규칙을 알리며 실패한다", async () => {
    const root = makeRepo({
      ...lib,
      "packages/lib/dist/index.js": "export const a = [].at(0);\n",
    });

    const result = await runEscompatGate(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("packages/lib/dist/index.js");
    expect(result.problems.join("\n")).toContain("es-x/no-array-prototype-at");
  });

  it("하위 디렉터리의 .mjs·.cjs 위반도 검출한다", async () => {
    const root = makeRepo({
      ...lib,
      "packages/lib/dist/ok.js": "export const a = 1;\n",
      "packages/lib/dist/deep/x.mjs": "export const b = Math.random();\n",
      "packages/lib/dist/deep/y.cjs": "module.exports = document.title;\n",
    });

    const result = await runEscompatGate(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("deep/x.mjs");
    expect(result.problems.join("\n")).toContain("deep/y.cjs");
  });

  it("dist에 JS가 없으면 조용히 통과하지 않고 실패한다", async () => {
    const root = makeRepo({
      ...lib,
      "packages/lib/dist/index.d.ts": "export declare const a: number;\n",
    });

    const result = await runEscompatGate(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("0건");
  });

  it("dist 디렉터리가 없어도 실패한다", async () => {
    const root = makeRepo(lib);

    const result = await runEscompatGate(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("packages/lib/dist");
  });

  it("dist가 없는 private 패키지는 대상이 아니라서 건너뛴다", async () => {
    const root = makeRepo({
      ...lib,
      "packages/lib/dist/index.js": "export const a = 1;\n",
      "packages/config/package.json": manifest("config", { private: true }),
    });

    expect((await runEscompatGate(root)).ok).toBe(true);
  });

  it("배포 대상 패키지가 하나도 없으면 실패한다", async () => {
    const root = makeRepo({
      "packages/config/package.json": manifest("config", { private: true }),
    });

    const result = await runEscompatGate(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("배포 대상 패키지");
  });

  it("apps 아래의 dist는 검사 대상이 아니다", async () => {
    const root = makeRepo({
      ...lib,
      "packages/lib/dist/index.js": "export const a = 1;\n",
      "apps/site/package.json": manifest("site"),
      "apps/site/dist/bundle.js": "export const bad = [].at(0);\n",
    });

    expect((await runEscompatGate(root)).ok).toBe(true);
  });

  it("그 저장소의 baseline.json floor를 따른다", async () => {
    const files = {
      ...lib,
      "packages/lib/dist/index.js": "export const n = 1_000;\n",
    };

    expect((await runEscompatGate(makeRepo(files))).ok).toBe(true);
    expect(
      (
        await runEscompatGate(
          makeRepo(files, { baseline: { chromeFloor: 74 } }),
        )
      ).ok,
    ).toBe(false);
  });

  it("baseline.json이 없으면 오류로 실패한다", async () => {
    const root = makeRepo({
      ...lib,
      "packages/lib/dist/index.js": "export const a = 1;\n",
    });
    rmSync(join(root, "baseline.json"));

    await expect(runEscompatGate(root)).rejects.toThrow(/baseline\.json/);
  });
});
