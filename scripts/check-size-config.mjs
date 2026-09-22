/**
 * 번들 한도 설정 검사.
 *
 * 배포 대상 패키지의 각 subpath(`exports`의 `default` 대상 dist 파일)를 실제로 import해 값 export 이름을 열거하고,
 * 그 패키지의 `.size-limit.json`에 export마다 항목(`path`가 그 dist 파일, `import`가 `{ 이름 }`)과 `limit`이 있는지 검사한다.
 * 새 export가 한도 없이 추가되는 것을 막는다. export가 없는 상태에서는 설정 파일 없이도 통과한다.
 * 한도 수치 자체를 검사하는 것은 `pnpm size`(size-limit)다.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { listPublishablePackages } from "./workspace-packages.mjs";

/** 이 스크립트가 속한 저장소의 루트. */
const defaultRepoRoot = fileURLToPath(new URL("..", import.meta.url));

const CONFIG_FILE = ".size-limit.json";

/** 경로 앞의 `./`를 없앤다. */
const normalize = (path) => path.replace(/^\.\//, "");

/**
 * 검사를 실행한다. 통과·실패를 종료 코드가 아니라 결과 객체로 돌려준다.
 *
 * @param {string} [repoRoot]
 * @returns {Promise<{ ok: boolean, problems: string[], exports: { package: string, path: string, name: string }[] }>}
 */
export async function runSizeConfigCheck(repoRoot = defaultRepoRoot) {
  const targets = listPublishablePackages(repoRoot);
  const problems = [];
  const enumerated = [];

  if (targets.length === 0) {
    problems.push(
      "검사할 배포 대상 패키지(packages/* 중 private가 아닌 것)가 없다",
    );
  }

  for (const pkg of targets) {
    const exportsField = pkg.packageJson.exports ?? {};

    // 1. subpath마다 dist를 import해 값 export를 열거한다.
    const found = [];
    for (const [key, value] of Object.entries(exportsField)) {
      const target = typeof value === "string" ? value : value?.default;
      if (typeof target !== "string") {
        problems.push(`${pkg.name}: exports[${key}]에 default 대상이 없다`);
        continue;
      }
      const path = normalize(target);
      const file = join(pkg.dir, path);
      if (!existsSync(file)) {
        problems.push(
          `${pkg.name}: ${path}가 없다. \`pnpm build\` 뒤에 실행한다`,
        );
        continue;
      }
      const namespace = await import(
        `${pathToFileURL(file).href}?size-config=${Date.now()}`
      );
      for (const name of Object.keys(namespace)) {
        found.push({ package: pkg.name, path, name });
      }
    }
    enumerated.push(...found);
    if (found.length === 0) continue;

    // 2. 설정 파일을 읽는다.
    const configPath = join(pkg.dir, CONFIG_FILE);
    if (!existsSync(configPath)) {
      problems.push(
        `${pkg.relDir}/${CONFIG_FILE}가 없다. 값 export ${found.length}개에 번들 한도 항목이 필요하다`,
      );
      continue;
    }
    let entries;
    try {
      entries = JSON.parse(readFileSync(configPath, "utf8"));
    } catch (error) {
      problems.push(
        `${pkg.relDir}/${CONFIG_FILE}을 읽을 수 없다: ${error.message}`,
      );
      continue;
    }
    if (!Array.isArray(entries)) {
      problems.push(`${pkg.relDir}/${CONFIG_FILE}은 항목의 배열이어야 한다`);
      continue;
    }

    // 3. export마다 항목이 있고 limit이 있는지 확인한다.
    for (const { path, name } of found) {
      const entry = entries.find(
        (candidate) =>
          typeof candidate?.path === "string" &&
          normalize(candidate.path) === path &&
          candidate.import === `{ ${name} }`,
      );
      if (!entry) {
        problems.push(
          `${pkg.name}: ${path}의 export ${name}에 번들 한도 항목(import: "{ ${name} }")이 없다`,
        );
      } else if (typeof entry.limit !== "string" || entry.limit === "") {
        problems.push(
          `${pkg.name}: ${path}의 export ${name} 항목에 limit이 없다`,
        );
      }
    }
  }

  return { ok: problems.length === 0, problems, exports: enumerated };
}

// 직접 실행할 때만 종료 코드를 설정한다(테스트에서 import해도 프로세스 상태를 바꾸지 않는다).
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = await runSizeConfigCheck();
  if (result.ok) {
    console.log(
      `check:size-config 통과: 값 export ${result.exports.length}개가 모두 번들 한도 항목을 가진다`,
    );
  } else {
    console.error("check:size-config 실패:");
    for (const problem of result.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
  }
}
