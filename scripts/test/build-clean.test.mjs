import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

/** 실제 패키지의 build 스크립트 문자열. 이 문자열을 임시 패키지에서 그대로 실행한다. */
const buildScript = JSON.parse(
  readFileSync(join(repoRoot, "packages/random/package.json"), "utf8"),
).scripts.build;

const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * 실제 `dist`를 건드리지 않도록 임시 패키지를 만든다. 다른 테스트(`pnpm pack` 등)가 같은 `dist`를 병렬로 읽으므로
 * 테스트가 실제 산출물을 지우고 다시 만들면 경쟁 상태가 생긴다.
 */
function makePackage() {
  mkdirSync(join(repoRoot, "_tmp"), { recursive: true });
  const dir = mkdtempSync(join(repoRoot, "_tmp", "build-"));
  tempDirs.push(dir);
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src/index.ts"), "export const a = 1;\n");
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      extends: join(repoRoot, "packages/typescript-config/library.json"),
      compilerOptions: { outDir: "dist", rootDir: "src" },
      include: ["src"],
    }),
  );
  return dir;
}

/** 패키지의 build 스크립트를 셸에서 그대로 실행한다. `tsc`는 저장소의 것을 쓴다. */
function build(dir) {
  return spawnSync(buildScript, {
    cwd: dir,
    shell: true,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${join(repoRoot, "node_modules/.bin")}${delimiter}${process.env.PATH}`,
    },
  });
}

describe("@cp949/random의 build 스크립트", () => {
  it("dist에 남은 이전 산출물을 지우고 새로 만든다", () => {
    // tsc는 dist를 비우지 않아 소스를 지우거나 이름을 바꾸면 이전 산출물이 남아 tarball에 실린다.
    const dir = makePackage();
    mkdirSync(join(dir, "dist"));
    const stale = [
      join(dir, "dist/stale-from-old-build.js"),
      join(dir, "dist/stale-from-old-build.d.ts.map"),
    ];
    for (const file of stale) writeFileSync(file, "// 이전 빌드의 잔재\n");

    const result = build(dir);

    expect(result.status, result.stdout + result.stderr).toBe(0);
    for (const file of stale) expect(existsSync(file)).toBe(false);
    expect(existsSync(join(dir, "dist/index.js"))).toBe(true);
    expect(existsSync(join(dir, "dist/index.d.ts"))).toBe(true);
  }, 60_000);

  it("declarationMap을 껐으므로 .d.ts.map을 만들지 않는다", () => {
    const dir = makePackage();

    const result = build(dir);

    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(existsSync(join(dir, "dist/index.d.ts"))).toBe(true);
    expect(existsSync(join(dir, "dist/index.d.ts.map"))).toBe(false);
  }, 60_000);

  it("dist가 아직 없어도 빌드가 성공한다", () => {
    const dir = makePackage();

    const result = build(dir);

    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(existsSync(join(dir, "dist/index.js"))).toBe(true);
  }, 60_000);
});
