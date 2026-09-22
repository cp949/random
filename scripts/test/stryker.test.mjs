import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import baseConfig from "../../packages/random/stryker.config.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const strykerBin = join(repoRoot, "node_modules/.bin/stryker");

const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * 저장소 안 `_tmp`에 작은 TS 프로젝트를 만든다. `tsconfig.json`이 있다는 점이 중요하다.
 * Stryker 코어는 tsconfig.json을 만나면 TypeScript JS API로 다시 쓰려 하는데 TS 7에는 그 API가 없다.
 */
function makeProject({ tests }) {
  mkdirSync(join(repoRoot, "_tmp"), { recursive: true });
  const dir = mkdtempSync(join(repoRoot, "_tmp", "stryker-"));
  tempDirs.push(dir);
  mkdirSync(join(dir, "src"));
  mkdirSync(join(dir, "test"));

  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "stryker-fixture", private: true, type: "module" }),
  );
  // 자체 완결형이다: 상대 경로 extends는 샌드박스로 복사된 뒤 경로가 어긋나 원인이 섞인다.
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { target: "ES2019", strict: true, noEmit: true },
      include: ["src"],
    }),
  );
  writeFileSync(
    join(dir, "src/add.ts"),
    [
      "export function add(a: number, b: number): number {",
      "  return a + b;",
      "}",
      "",
      "export function isPositive(n: number): boolean {",
      "  return n > 0;",
      "}",
      "",
    ].join("\n"),
  );
  writeFileSync(join(dir, "test/add.test.ts"), tests);
  writeFileSync(
    join(dir, "vitest.config.ts"),
    'import { defineConfig } from "vitest/config";\nexport default defineConfig({ test: { include: ["test/**/*.test.ts"] } });\n',
  );
  // 패키지의 실제 설정을 그대로 쓰고 대상 파일과 리포터만 바꾼다.
  writeFileSync(
    join(dir, "stryker.config.mjs"),
    `export default ${JSON.stringify({
      ...baseConfig,
      mutate: ["src/**/*.ts"],
      reporters: ["json"],
      jsonReporter: { fileName: "reports/mutation/mutation.json" },
    })};\n`,
  );
  return dir;
}

/** Stryker를 실행하고 mutant 판정을 돌려준다. */
function runStryker(dir) {
  const result = spawnSync(strykerBin, ["run"], {
    cwd: dir,
    encoding: "utf8",
  });
  let mutants = [];
  try {
    const report = JSON.parse(
      readFileSync(join(dir, "reports/mutation/mutation.json"), "utf8"),
    );
    mutants = Object.values(report.files).flatMap((file) => file.mutants);
  } catch {
    // 리포트가 없으면 실행이 실패한 것이다. 호출부가 result.output으로 원인을 보여 준다.
  }
  return {
    status: result.status,
    output: result.stdout + result.stderr,
    mutants,
  };
}

const partialTests = [
  'import { expect, it } from "vitest";',
  'import { add, isPositive } from "../src/add.js";',
  'it("두 수를 더한다", () => { expect(add(2, 3)).toBe(5); });',
  'it("양수를 판정한다", () => { expect(isPositive(1)).toBe(true); });',
  "",
].join("\n");

const fullTests = [
  partialTests.trimEnd(),
  'it("0은 양수가 아니다", () => { expect(isPositive(0)).toBe(false); });',
  'it("음수는 양수가 아니다", () => { expect(isPositive(-1)).toBe(false); });',
  "",
].join("\n");

describe("packages/random의 Stryker 설정", () => {
  it("vitest 러너를 쓰고 mutate 대상을 핵심 파일로 한정한다", () => {
    expect(baseConfig.testRunner).toBe("vitest");
    expect(baseConfig.plugins).toContain("@stryker-mutator/vitest-runner");
    expect(baseConfig.mutate).toEqual([
      "src/internal/sampling.ts",
      "src/internal/uniform-int.ts",
      "src/internal/bytes.ts",
      "src/internal/encoding.ts",
      "src/secure/random-int.ts",
      "src/id/nanoid.ts",
      "src/id/random-id.ts",
      "src/id/uuid/format.ts",
      "src/id/uuid/v4.ts",
      "src/id/uuid/v7.ts",
      "src/id/cyclic.ts",
      "src/id/counter.ts",
      "src/core/seed.ts",
      "src/core/xoshiro128.ts",
      "src/secure/word-source.ts",
      "src/secure/secure-source.ts",
      "src/core/int.ts",
      "src/core/float.ts",
      "src/core/bool.ts",
      "src/core/sign.ts",
      "src/core/uniform.ts",
      "src/internal/weights.ts",
      "src/sampling/choice.ts",
      "src/sampling/shuffle-in-place.ts",
      "src/sampling/shuffle.ts",
      "src/sampling/sample.ts",
      "src/sampling/permutation.ts",
      "src/sampling/weighted-choice.ts",
      "src/sampling/weighted-sampler.ts",
      "src/state/random-state.ts",
    ]);
  });

  it("mutation 점수 하한(break)을 지정한다", () => {
    const { high, low, break: floor } = baseConfig.thresholds ?? {};

    expect(floor).toBeGreaterThanOrEqual(90);
    expect(floor).toBeLessThanOrEqual(low);
    expect(low).toBeLessThanOrEqual(high);
  });

  it("tsconfig.json 재작성(TS 7에 없는 API 호출)을 건너뛰도록 존재하지 않는 경로를 가리킨다", () => {
    expect(typeof baseConfig.tsconfigFile).toBe("string");
    expect(baseConfig.tsconfigFile).not.toBe("tsconfig.json");
  });
});

describe("Stryker + vitest 5 + TypeScript 7 (tsconfig.json이 있는 프로젝트)", () => {
  it("TS 소스에서 mutant를 만들어 죽이고, 테스트가 약한 판정은 살려 두며 점수 하한을 지키지 못하면 실패한다", () => {
    const dir = makeProject({ tests: partialTests });

    const result = runStryker(dir);

    expect(result.output).not.toContain("parseConfigFileTextToJson");
    // 테스트가 약해 점수가 하한(break) 아래다. 러너가 죽은 것이 아니라 하한 위반으로 실패함을 메시지로 구분한다.
    expect(result.status, result.output).not.toBe(0);
    expect(result.output).toMatch(/break/i);
    const byStatus = (status) =>
      result.mutants.filter((mutant) => mutant.status === status);
    expect(byStatus("Killed").length).toBeGreaterThan(0);
    // `n > 0`을 `n >= 0`으로 바꾼 mutant는 경계값 테스트가 없어 살아남아야 한다.
    expect(
      byStatus("Survived").some((mutant) => mutant.replacement === "n >= 0"),
    ).toBe(true);
  }, 180_000);

  it("경계값 테스트를 더하면 살아남는 mutant가 없다", () => {
    const dir = makeProject({ tests: fullTests });

    const result = runStryker(dir);

    expect(result.status, result.output).toBe(0);
    expect(
      result.mutants.filter((mutant) => mutant.status === "Survived"),
    ).toEqual([]);
  }, 180_000);
});
