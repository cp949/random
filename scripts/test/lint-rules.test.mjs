import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLibraryConfig } from "../../packages/eslint-config/library.js";
import { nodeConfig } from "../../packages/eslint-config/node.js";

const packageDir = fileURLToPath(
  new URL("../../packages/random", import.meta.url),
);
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

// 규칙이 packages/random 기준 경로(`src/**`, `test/**`)에 적용되는지까지 확인하려고 그 디렉터리를 cwd로 쓴다.
// tsconfigRootDir도 같은 디렉터리로 맞춘다(실제 eslint.config.js가 넘기는 값과 같다).
const eslint = new ESLint({
  cwd: packageDir,
  overrideConfigFile: true,
  overrideConfig: createLibraryConfig(packageDir),
});

// legacy project 모드(parserOptions.project)는 tsconfig의 include가 실제로 디스크에서 찾아낸
// 파일만 프로그램에 넣는다. lintText는 파일을 쓰지 않으므로 이 두 합성 경로는 tsconfig.json·
// tsconfig.test.json의 include에 걸리도록 자리표시자로 미리 만들어 둔다(실제 lint 대상 텍스트는
// lintText의 `code`가 쓰이므로 내용은 무관하다). 진짜 src/test 파일과 이름이 겹치지 않는다.
const PLACEHOLDER_FILES = ["src/example.ts", "test/example.test.ts"];

beforeAll(() => {
  for (const file of PLACEHOLDER_FILES) {
    writeFileSync(join(packageDir, file), "export {};\n");
  }
});

afterAll(() => {
  for (const file of PLACEHOLDER_FILES) {
    rmSync(join(packageDir, file), { force: true });
  }
});

/** 코드를 `file`(packages/random 기준 상대 경로) 위치의 파일로 보고 lint한 메시지를 돌려준다. */
async function lint(code, file = "src/example.ts") {
  const [result] = await eslint.lintText(code, {
    filePath: join(packageDir, file),
  });
  return result.messages;
}

/** 오류·경고 구분 없이 발생한 규칙 이름만 모은다(저장소는 onlyWarn으로 모두 경고가 된다). */
const rulesOf = (messages) => messages.map((message) => message.ruleId);

describe("libraryConfig: src의 금지 전역", () => {
  it.each([
    "window.location",
    "document.title",
    "navigator.userAgent",
    "self.name",
    "Buffer.alloc(1)",
    "process.env.NODE_ENV",
    'require("fs")',
    "structuredClone({})",
    "crypto.getRandomValues(new Uint8Array(1))",
  ])("`%s`는 no-restricted-globals로 실패한다", async (expression) => {
    const messages = await lint(`export const value = ${expression};\n`);

    expect(rulesOf(messages)).toContain("no-restricted-globals");
  });

  it("globalThis를 거친 crypto 접근은 internal/crypto.ts에서 허용된다", async () => {
    const messages = await lint(
      "export const value: unknown = globalThis.crypto;\n",
      "src/internal/crypto.ts",
    );

    expect(messages).toEqual([]);
  });

  it("globalThis를 거친 crypto 접근은 secure/capabilities.ts에서도 허용된다", async () => {
    const messages = await lint(
      "export const value: unknown = globalThis.crypto;\n",
      "src/secure/capabilities.ts",
    );

    expect(messages).toEqual([]);
  });
});

describe("libraryConfig: src의 Math.random", () => {
  it("직접 호출은 no-restricted-properties로 실패한다", async () => {
    const messages = await lint("export const value = Math.random();\n");

    expect(rulesOf(messages)).toContain("no-restricted-properties");
  });

  it("문자열 키 접근도 실패한다", async () => {
    const messages = await lint('export const value = Math["random"]();\n');

    expect(messages.length).toBeGreaterThan(0);
    expect(rulesOf(messages)).not.toContain(null);
  });

  it("변수 키로 계산된 접근은 no-restricted-syntax로 실패한다", async () => {
    const messages = await lint(
      'const key = "random";\nexport const value = Math[key]();\n',
    );

    expect(rulesOf(messages)).toContain("no-restricted-syntax");
  });

  it("Math를 다른 변수에 담으면 no-restricted-syntax로 실패한다", async () => {
    const messages = await lint(
      "const alias = Math;\nexport const value = alias.random();\n",
    );

    expect(rulesOf(messages)).toContain("no-restricted-syntax");
  });

  it("Math에서 random을 구조 분해하면 no-restricted-syntax로 실패한다", async () => {
    const messages = await lint(
      "const { random } = Math;\nexport const value = random();\n",
    );

    expect(rulesOf(messages)).toContain("no-restricted-syntax");
  });

  it("Math를 기존 변수에 재할당해도 no-restricted-syntax로 실패한다", async () => {
    const messages = await lint(
      "let alias;\nalias = Math;\nexport const value = alias;\n",
    );

    expect(rulesOf(messages)).toContain("no-restricted-syntax");
  });

  it("Math의 다른 함수는 허용된다", async () => {
    const messages = await lint(
      "export const value = Math.floor(1.5) + Math.max(1, 2);\n",
    );

    expect(messages).toEqual([]);
  });
});

describe("libraryConfig: randomUUID와 subtle", () => {
  it.each(["randomUUID", "subtle"])(
    "src에서 `.%s` 참조는 no-restricted-properties로 실패한다",
    async (property) => {
      const messages = await lint(
        `declare const c: { randomUUID: unknown; subtle: unknown };\nexport const value = c.${property};\n`,
      );

      expect(rulesOf(messages)).toContain("no-restricted-properties");
    },
  );

  it.each(["randomUUID", "subtle"])(
    "secure/capabilities.ts에서만 `.%s` 참조가 허용된다",
    async (property) => {
      const messages = await lint(
        `declare const c: { randomUUID: unknown; subtle: unknown };\nexport const value = c.${property};\n`,
        "src/secure/capabilities.ts",
      );

      expect(messages).toEqual([]);
    },
  );

  it("secure/capabilities.ts에서도 Math.random은 금지된다", async () => {
    const messages = await lint(
      "export const value = Math.random();\n",
      "src/secure/capabilities.ts",
    );

    expect(rulesOf(messages)).toContain("no-restricted-properties");
  });
});

describe("libraryConfig: src의 import", () => {
  it.each([
    ['import x from "left-pad";\nexport const value = x;', "정적 외부 패키지"],
    ['import "node:fs";\nexport const value = 1;', "node: 내장 모듈"],
    [
      'import type { X } from "some-types";\nexport type Value = X;',
      "타입 전용 외부 패키지",
    ],
    ['export * from "left-pad";', "외부 패키지 re-export"],
    ['export { a } from "left-pad";', "외부 패키지 이름 re-export"],
  ])("%s → no-restricted-imports로 실패한다", async (code) => {
    const messages = await lint(`${code}\n`);

    expect(rulesOf(messages)).toContain("no-restricted-imports");
  });

  it.each([
    ['export const value = import("left-pad");', "외부 패키지 동적 import"],
    [
      "declare const name: string;\nexport const value = import(name);",
      "계산된 동적 import",
    ],
  ])("%s → no-restricted-syntax로 실패한다", async (code) => {
    const messages = await lint(`${code}\n`);

    expect(rulesOf(messages)).toContain("no-restricted-syntax");
  });

  it("상대 경로 import는 허용된다", async () => {
    const messages = await lint(
      [
        'import { a } from "./a.js";',
        'import { b } from "../internal/b.js";',
        "export const value = [a, b];",
        "",
      ].join("\n"),
    );

    expect(messages).toEqual([]);
  });

  it("상대 경로 동적 import는 허용된다", async () => {
    const messages = await lint('export const value = import("./lazy.js");\n');

    expect(messages).toEqual([]);
  });
});

describe("libraryConfig: 허용되는 코드", () => {
  it("ES2019 lib의 내장 전역(Object.fromEntries, Reflect, 타입 배열)은 허용된다", async () => {
    // BigInt는 ES2020이라 이 패키지의 lib(ES2019, library.json)에 타입이 없어 예시에서 뺀다.
    const messages = await lint(
      [
        "export const table = Object.fromEntries([['a', 1]]);",
        "export const keys = Reflect.ownKeys({});",
        "export const bytes = new Uint8Array(4);",
        "",
      ].join("\n"),
    );

    expect(messages).toEqual([]);
  });

  it("TypeScript 유틸리티 타입 이름은 no-undef 오탐 없이 허용된다", async () => {
    const messages = await lint(
      [
        "export const table: Record<string, number> = {};",
        "export type Maybe = Partial<{ a: number }>;",
        "",
      ].join("\n"),
    );

    expect(messages).toEqual([]);
  });

  it("타입 위치에서만 쓰는 import는 no-unused-vars 오탐 없이 허용된다", async () => {
    // babel 파서는 타입 참조를 스코프 분석에 반영하지 않는다. 미사용 검사는 tsc(noUnusedLocals)가 맡는다.
    const messages = await lint(
      [
        'import type { Item } from "./item.js";',
        'import { type Mode } from "./mode.js";',
        "export type Table = Record<string, Item>;",
        "export declare const mode: Mode;",
        "",
      ].join("\n"),
    );

    expect(messages).toEqual([]);
  });
});

describe("libraryConfig: test", () => {
  it("JS 테스트 파일에서도 Node 전역을 허용한다", async () => {
    // TS 파일은 no-undef가 꺼져 있어 Node 전역 허용 설정과 무관하게 통과하므로 JS 파일로 확인한다.
    const messages = await lint(
      [
        "export const cwd = process.cwd();",
        "export const size = Buffer.alloc(1).length;",
        "",
      ].join("\n"),
      "test/helper.mjs",
    );

    expect(messages).toEqual([]);
  });

  it("Node 전역과 vitest를 허용한다", async () => {
    const messages = await lint(
      [
        'import { it } from "vitest";',
        "it.skip(process.cwd(), () => {});",
        "export const size = Buffer.alloc(1).length;",
        "",
      ].join("\n"),
      "test/example.test.ts",
    );

    expect(messages).toEqual([]);
  });
});

describe("nodeConfig: scripts", () => {
  const scriptsEslint = new ESLint({
    cwd: repoRoot,
    overrideConfigFile: true,
    overrideConfig: nodeConfig,
  });

  async function lintScript(code, file = "scripts/example.mjs") {
    const [result] = await scriptsEslint.lintText(code, {
      filePath: join(repoRoot, file),
    });
    return result.messages;
  }

  it("Node 전역과 환경변수 읽기를 허용한다(scripts는 turbo 작업이 아니라 환경변수 선언 규칙이 무의미하다)", async () => {
    const messages = await lintScript(
      "export const path = process.env.PATH;\nexport const cwd = process.cwd();\n",
    );

    expect(messages).toEqual([]);
  });

  it("미사용 변수는 여전히 경고한다", async () => {
    const messages = await lintScript("const unused = 1;\n");

    expect(rulesOf(messages)).toContain("no-unused-vars");
  });

  it("정의되지 않은 이름은 여전히 경고한다", async () => {
    const messages = await lintScript("export const value = noSuchGlobal;\n");

    expect(rulesOf(messages)).toContain("no-undef");
  });
});
