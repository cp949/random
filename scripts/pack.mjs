import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";

/** tarball 안의 항목은 모두 `package/` 접두사를 가진다. */
const TARBALL_PREFIX = "package/";

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: "utf8", ...options });
}

/** tarball의 파일 목록을 `package/` 접두사 없이 정렬해 돌려준다. */
function listTarball(tarball) {
  const result = run("tar", ["-tzf", tarball]);
  if (result.status !== 0) {
    throw new Error(`tarball 목록을 읽지 못했다(${tarball}): ${result.stderr}`);
  }
  return result.stdout
    .split(/\r?\n/)
    .filter((entry) => entry !== "" && !entry.endsWith("/"))
    .map((entry) => entry.slice(TARBALL_PREFIX.length))
    .sort();
}

/** tarball 안의 파일 하나를 문자열로 읽는다. */
function readTarballFile(tarball, path) {
  const result = run("tar", ["-xzOf", tarball, `${TARBALL_PREFIX}${path}`]);
  if (result.status !== 0) {
    throw new Error(`tarball에서 ${path}를 읽지 못했다: ${result.stderr}`);
  }
  return result.stdout;
}

/**
 * 패키지를 `pnpm pack`해 `destination`에 tarball을 만든다. 배포 직전과 같은 파일 집합을 검증하려고 실제로 pack한다.
 *
 * @param {string} packageDir 패키지 디렉터리
 * @param {string} destination tarball을 만들 디렉터리
 * @returns {{ tarball: string, files: string[], manifest: Record<string, unknown>, size: number }}
 */
export function packPackage(packageDir, destination) {
  const result = run("pnpm", ["pack", "--pack-destination", destination], {
    cwd: packageDir,
  });
  if (result.status !== 0) {
    throw new Error(
      `pnpm pack이 실패했다(${packageDir}): ${result.stderr || result.stdout}`,
    );
  }

  const tarball = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.endsWith(".tgz"))
    .pop();
  if (!tarball) {
    throw new Error(
      `pnpm pack 출력에서 tarball 경로를 찾지 못했다: ${result.stdout}`,
    );
  }

  return {
    tarball,
    files: listTarball(tarball),
    manifest: JSON.parse(readTarballFile(tarball, "package.json")),
    size: statSync(tarball).size,
  };
}
