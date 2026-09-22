/**
 * 번들 한도 검사(size-limit) 래퍼.
 *
 * 배포 대상 패키지마다 `.size-limit.json`에 항목이 있으면 그 패키지 디렉터리에서 size-limit을 실행한다.
 * 항목이 없거나 설정 파일이 없으면 건너뛴다. size-limit은 빈 설정을 오류(`Size Limit config must not be empty`)로 보므로
 * 값 export가 아직 없는 상태(R0)에서도 `pnpm size`가 의미를 갖도록 래퍼가 그 경우를 처리한다.
 * 항목이 있어야 하는지는 `check:size-config`가 강제하고, 한도 수치를 검사하는 것은 이 래퍼가 실행하는 size-limit이다.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { listPublishablePackages } from "./workspace-packages.mjs";

/** 이 스크립트가 속한 저장소의 루트. size-limit은 이 저장소의 devDependencies에서 실행한다. */
const defaultRepoRoot = fileURLToPath(new URL("..", import.meta.url));
const SIZE_LIMIT_BIN = join(defaultRepoRoot, "node_modules/.bin/size-limit");
const CONFIG_FILE = ".size-limit.json";

/**
 * 실행한다. 통과·실패를 종료 코드가 아니라 결과 객체로 돌려준다.
 *
 * @param {string} [repoRoot]
 * @returns {{ ok: boolean, problems: string[], measured: string[], skipped: string[] }}
 */
export function runSize(repoRoot = defaultRepoRoot) {
  const targets = listPublishablePackages(repoRoot);
  const problems = [];
  const measured = [];
  const skipped = [];

  if (targets.length === 0) {
    problems.push(
      "검사할 배포 대상 패키지(packages/* 중 private가 아닌 것)가 없다",
    );
  }

  for (const pkg of targets) {
    const configPath = join(pkg.dir, CONFIG_FILE);
    let entries = [];
    if (existsSync(configPath)) {
      try {
        entries = JSON.parse(readFileSync(configPath, "utf8"));
      } catch (error) {
        problems.push(
          `${pkg.name}: ${CONFIG_FILE}을 읽을 수 없다: ${error.message}`,
        );
        continue;
      }
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      skipped.push(pkg.name);
      continue;
    }

    const result = spawnSync(SIZE_LIMIT_BIN, [], {
      cwd: pkg.dir,
      encoding: "utf8",
    });
    if (result.status !== 0) {
      const output = `${result.stdout}${result.stderr}`
        .split(/\r?\n/)
        .filter((line) => line.trim() !== "")
        .slice(0, 20)
        .join("\n");
      problems.push(
        `${pkg.name}: size-limit이 실패했다(종료 코드 ${result.status}):\n${output}`,
      );
    } else {
      measured.push(pkg.name);
    }
  }

  return { ok: problems.length === 0, problems, measured, skipped };
}

// 직접 실행할 때만 종료 코드를 설정한다(테스트에서 import해도 프로세스 상태를 바꾸지 않는다).
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = runSize();
  for (const name of result.skipped) {
    console.log(
      `size: ${name}: 번들 한도 항목이 없어 건너뛴다(값 export 없음)`,
    );
  }
  if (result.ok) {
    console.log(
      `size 통과: 측정 ${result.measured.length}개 패키지, 건너뜀 ${result.skipped.length}개`,
    );
  } else {
    console.error("size 실패:");
    for (const problem of result.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
  }
}
