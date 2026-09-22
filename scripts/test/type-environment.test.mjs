import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { runTsc } from "../tsc.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** `tsc --showConfig`가 해석한 최종 설정을 돌려준다. */
function showConfig(project) {
  const result = runTsc(["--showConfig", "-p", project], { cwd: repoRoot });
  expect(result.exitCode, result.stdout + result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

describe("packages/random의 라이브러리 tsconfig", () => {
  let compilerOptions;
  beforeAll(() => {
    ({ compilerOptions } = showConfig("packages/random/tsconfig.json"));
  });

  it("target은 ES2019다", () => {
    expect(compilerOptions.target).toBe("es2019");
  });

  it("lib은 ES2019 하나이고 DOM lib을 포함하지 않는다", () => {
    expect(compilerOptions.lib).toEqual(["es2019"]);
  });

  it("전역 타입 패키지를 자동으로 끌어오지 않는다", () => {
    expect(compilerOptions.types).toEqual([]);
  });

  it("src를 배포하지 않으므로 declarationMap을 끈다", () => {
    expect(compilerOptions.declarationMap).toBe(false);
  });

  it("선언 파일은 생성한다", () => {
    expect(compilerOptions.declaration).toBe(true);
  });

  it("사용하지 않는 지역 변수와 매개변수를 컴파일러가 검사한다", () => {
    expect(compilerOptions.noUnusedLocals).toBe(true);
    expect(compilerOptions.noUnusedParameters).toBe(true);
  });
});

describe("packages/random의 테스트 tsconfig", () => {
  let config;
  beforeAll(() => {
    config = showConfig("packages/random/tsconfig.test.json");
  });

  it("node 타입을 켠다", () => {
    expect(config.compilerOptions.types).toEqual(["node"]);
  });

  it("src와 test를 모두 검사한다", () => {
    expect(config.include).toEqual(["src", "test"]);
  });

  it("산출물을 내보내지 않는다", () => {
    expect(config.compilerOptions.noEmit).toBe(true);
  });

  it("테스트 코드의 미사용 선언도 컴파일러가 검사한다", () => {
    expect(config.compilerOptions.noUnusedLocals).toBe(true);
    expect(config.compilerOptions.noUnusedParameters).toBe(true);
  });
});

describe("미사용 선언 검사(실제 컴파일)", () => {
  /** library.json을 상속하는 임시 프로젝트에서 소스를 컴파일해 진단 코드 목록을 돌려준다. */
  function compile(source) {
    mkdirSync(join(repoRoot, "_tmp"), { recursive: true });
    const dir = mkdtempSync(join(repoRoot, "_tmp", "unused-"));
    tempDirs.push(dir);
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src/index.ts"), source);
    writeFileSync(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        extends: "../../packages/typescript-config/library.json",
        compilerOptions: { noEmit: true },
        include: ["src"],
      }),
    );
    const result = runTsc(
      ["--noEmit", "--pretty", "false", "-p", relative(repoRoot, dir)],
      { cwd: repoRoot },
    );
    const codes = [
      ...(result.stdout + result.stderr).matchAll(/error (TS\d+):/g),
    ].map((match) => match[1]);
    return { exitCode: result.exitCode, codes };
  }

  it("사용하지 않는 지역 변수는 TS6133 오류가 된다", () => {
    const { exitCode, codes } = compile(
      "export function f(): number {\n  const unused = 1;\n  return 2;\n}\n",
    );

    expect(exitCode).not.toBe(0);
    expect(codes).toEqual(["TS6133"]);
  });

  it("사용하지 않는 매개변수는 TS6133 오류가 되고 밑줄로 시작하면 허용된다", () => {
    const { codes } = compile(
      "export function f(a: number, _b: number): number {\n  return 2;\n}\n",
    );

    expect(codes).toEqual(["TS6133"]);
  });

  it("타입 위치에서만 쓰는 선언은 미사용 오류가 아니다", () => {
    const { exitCode } = compile(
      [
        "type Item = { id: number };",
        "export type Table = Record<string, Item>;",
        "",
      ].join("\n"),
    );

    expect(exitCode).toBe(0);
  });
});
