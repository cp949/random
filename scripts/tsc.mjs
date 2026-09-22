import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** 이 스크립트가 속한 저장소의 루트. */
const defaultRepoRoot = fileURLToPath(new URL("..", import.meta.url));

const require = createRequire(import.meta.url);

/** 저장소의 기본 TypeScript 패키지 이름. 다른 버전은 devDependency alias(예: `typescript-5.7`)로 설치한다. */
export const DEFAULT_TYPESCRIPT = "typescript";

/**
 * 저장소에 설치된 TypeScript 패키지의 `package.json` 경로.
 * 설치되지 않았으면 `require.resolve`의 오류가 그대로 전파된다.
 */
function resolveManifest(typescript) {
  return require.resolve(`${typescript}/package.json`);
}

/** 저장소에 설치된 TypeScript 패키지의 버전. 설치되지 않았으면 예외를 던진다. */
export function tscVersion(typescript = DEFAULT_TYPESCRIPT) {
  return JSON.parse(readFileSync(resolveManifest(typescript), "utf8")).version;
}

/**
 * 저장소의 TypeScript로 `tsc`를 실행한다. 게이트들이 같은 컴파일러를 쓰게 하는 공유 진입점이다.
 * `typescript`로 다른 버전의 패키지 이름(devDependency alias)을 지정하면 그 컴파일러로 실행한다.
 *
 * @param {string[]} args tsc 인자
 * @param {{ cwd?: string, typescript?: string }} [options]
 * @returns {{ exitCode: number | null, stdout: string, stderr: string, error?: Error }}
 */
export function runTsc(
  args,
  { cwd = defaultRepoRoot, typescript = DEFAULT_TYPESCRIPT } = {},
) {
  const tsc = join(dirname(resolveManifest(typescript)), "bin", "tsc");
  const result = spawnSync(process.execPath, [tsc, ...args], {
    cwd,
    encoding: "utf8",
  });
  return {
    exitCode: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };
}
