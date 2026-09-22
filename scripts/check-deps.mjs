/**
 * 런타임 의존성 0 검사.
 *
 * 배포 대상 패키지의 소스 `package.json`과 실제로 pack한 tarball 안의 `package.json`에서
 * `dependencies`, `peerDependencies`, `optionalDependencies`, `bundledDependencies`(별칭 `bundleDependencies`)가
 * 모두 없거나 비어 있어야 한다. `devDependencies`는 허용한다.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { packPackage } from "./pack.mjs";
import { listPublishablePackages } from "./workspace-packages.mjs";

/** 이 스크립트가 속한 저장소의 루트. */
const defaultRepoRoot = fileURLToPath(new URL("..", import.meta.url));

export const DEPENDENCY_FIELDS = [
  "dependencies",
  "peerDependencies",
  "optionalDependencies",
  "bundledDependencies",
  "bundleDependencies",
];

/**
 * 비어 있지 않은 런타임 의존성 필드를 찾는다.
 *
 * @param {Record<string, unknown>} manifest
 * @returns {{ field: string, names: string[] }[]}
 */
export function findRuntimeDependencies(manifest) {
  const found = [];
  for (const field of DEPENDENCY_FIELDS) {
    const value = manifest[field];
    if (value === true) {
      // bundledDependencies: true는 dependencies 전부를 번들한다는 뜻이다.
      found.push({ field, names: ["(전부)"] });
    } else if (Array.isArray(value) && value.length > 0) {
      found.push({ field, names: value });
    } else if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length > 0
    ) {
      found.push({ field, names: Object.keys(value) });
    }
  }
  return found;
}

/**
 * 검사를 실행한다. 통과·실패를 종료 코드가 아니라 결과 객체로 돌려준다.
 *
 * @param {string} [repoRoot]
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function runDepsCheck(repoRoot = defaultRepoRoot) {
  const targets = listPublishablePackages(repoRoot);
  const problems = [];

  if (targets.length === 0) {
    problems.push(
      "검사할 배포 대상 패키지(packages/* 중 private가 아닌 것)가 없다",
    );
  }

  for (const pkg of targets) {
    for (const { field, names } of findRuntimeDependencies(pkg.packageJson)) {
      problems.push(
        `${pkg.relDir}/package.json: ${field}에 런타임 의존성이 있다: ${names.join(", ")}`,
      );
    }

    const out = mkdtempSync(join(tmpdir(), "deps-pack-"));
    try {
      const { manifest } = packPackage(pkg.dir, out);
      for (const { field, names } of findRuntimeDependencies(manifest)) {
        problems.push(
          `${pkg.relDir} tarball의 package.json: ${field}에 런타임 의존성이 있다: ${names.join(", ")}`,
        );
      }
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }

  return { ok: problems.length === 0, problems };
}

// 직접 실행할 때만 종료 코드를 설정한다(테스트에서 import해도 프로세스 상태를 바꾸지 않는다).
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = runDepsCheck();
  if (result.ok) {
    console.log("check:deps 통과: 배포 대상 패키지에 런타임 의존성이 없다");
  } else {
    console.error("check:deps 실패:");
    for (const problem of result.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
  }
}
