/**
 * root 격리 게이트.
 *
 * 배포 대상 패키지의 `exports` entry마다 dist default 파일의 값 export 전부를 import하는 entry를 Vite(rolldown)로
 * 번들하고, 번들 문자열에서 표식(minify 후에도 남는 프로퍼티 이름·오류 이름 문자열·전역)을 검사한다.
 * root(`.`)는 crypto·ID 표식이 없어야 하고(root leaf import가 `./state`·`./secure`·`./id` 코드를 끌어오지
 * 않는다), 다른 subpath는 자기 표식이 있어야 한다(표식 이름이 바뀌어 금지 검사가 공허해지는 것을 막는다).
 * root entry는 값 export 전부를 한 번에 import한다 — 전체가 표식을 안 담으면 부분집합도 안 담는다.
 * 규칙이 없는 entry와 entry가 없는 규칙은 실패다(새 subpath가 규칙을 선언하게 강제한다).
 * 번들 출력은 저장소 안 `_tmp/`(gitignore)에 두고 끝나면 지운다. Vite는 저장소 node_modules에서 찾는다.
 * dist는 빌드 산출물이라 `pnpm build` 뒤에 실행한다.
 * 검출력은 `scripts/test/check-root-isolation.test.mjs`가 고정한다. 직접 실행일 때만 종료 코드를 설정한다.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";
import { listPublishablePackages } from "./workspace-packages.mjs";

/** 이 스크립트가 속한 저장소의 루트. */
const defaultRepoRoot = fileURLToPath(new URL("..", import.meta.url));

/**
 * 패키지 이름 → exports 키 → 규칙. `forbidden`은 번들에 없어야 하는 표식, `required`는 있어야 하는 표식이다.
 * `getRandomValues`는 프로퍼티 접근, 오류 이름은 `this.name = "..."` 문자열, `Uint32Array`는 전역이라
 * minify 뒤에도 남는다. root dist는 넷 다 포함하지 않는다(`crypto`는 한글 주석에만 있고 주석은 사라진다).
 */
export const ISOLATION_RULES = {
  "@cp949/random": {
    ".": {
      forbidden: [
        "getRandomValues",
        "SecureRandomUnavailableError",
        "IdCollisionError",
        "Uint32Array",
      ],
    },
    "./state": { required: ["getRandomValues", "Uint32Array"] },
    "./secure": {
      required: ["getRandomValues", "SecureRandomUnavailableError"],
    },
    "./id": { required: ["getRandomValues", "IdCollisionError"] },
  },
};

/** 값 export 전부를 import하고 `console.log`로 살려 두는 entry 스크립트. */
export function entryScript(distFile, names) {
  const list = names.join(", ");
  return `import { ${list} } from ${JSON.stringify(pathToFileURL(distFile).href)};\nconsole.log(${list});\n`;
}

/** entry 하나를 번들해 출력 문자열을 돌려준다. `name`은 파일 이름에 쓸 수 있는 문자열이어야 한다. */
export async function bundleEntry({ workDir, name, distFile, exportNames }) {
  const entryFile = join(workDir, `${name}.entry.mjs`);
  writeFileSync(entryFile, entryScript(distFile, exportNames));
  const outDir = join(workDir, `${name}.out`);
  await build({
    configFile: false,
    logLevel: "silent",
    root: workDir,
    build: {
      lib: { entry: entryFile, formats: ["es"], fileName: () => "bundle.js" },
      outDir,
      emptyOutDir: true,
      minify: true,
      write: true,
    },
  });
  return readFileSync(join(outDir, "bundle.js"), "utf8");
}

/** 파일 이름에 쓸 수 있게 바꾼다(`@cp949/random` + `./state` → `cp949_random_state`). */
const fileSafe = (text) =>
  text.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "root";

/**
 * @param {string} [repoRoot]
 * @param {{ rules?: Record<string, Record<string, { forbidden?: string[], required?: string[] }>> }} [options]
 */
export async function runRootIsolationCheck(
  repoRoot = defaultRepoRoot,
  { rules = ISOLATION_RULES } = {},
) {
  const problems = [];
  const bundled = [];
  const targets = listPublishablePackages(repoRoot);
  if (targets.length === 0) {
    problems.push(
      "검사할 배포 대상 패키지(packages/* 중 private가 아닌 것)가 없다",
    );
  }

  mkdirSync(join(repoRoot, "_tmp"), { recursive: true });
  const workDir = mkdtempSync(join(repoRoot, "_tmp", "root-isolation-"));
  try {
    for (const pkg of targets) {
      const packageRules = rules[pkg.name];
      if (!packageRules) {
        problems.push(`${pkg.name}: ISOLATION_RULES에 규칙이 없다`);
        continue;
      }
      const exportsField = pkg.packageJson.exports ?? {};
      for (const key of Object.keys(packageRules)) {
        if (!(key in exportsField)) {
          problems.push(
            `${pkg.name}: 규칙의 entry ${key}가 exports에 없다(낡은 규칙)`,
          );
        }
      }
      for (const [key, value] of Object.entries(exportsField)) {
        const rule = packageRules[key];
        if (!rule) {
          problems.push(`${pkg.name}: exports[${key}]에 격리 규칙이 없다`);
          continue;
        }
        const target = typeof value === "string" ? value : value?.default;
        if (typeof target !== "string") {
          problems.push(`${pkg.name}: exports[${key}]에 default 대상이 없다`);
          continue;
        }
        const distFile = join(pkg.dir, normalize(target));
        if (!existsSync(distFile)) {
          problems.push(
            `${pkg.name}: ${normalize(target)}가 없다. \`pnpm build\` 뒤에 실행한다`,
          );
          continue;
        }
        const namespace = await import(
          `${pathToFileURL(distFile).href}?root-isolation=${Date.now()}`
        );
        const exportNames = Object.keys(namespace);
        if (exportNames.length === 0) {
          problems.push(`${pkg.name}: exports[${key}]에 값 export가 없다`);
          continue;
        }
        const code = await bundleEntry({
          workDir,
          name: fileSafe(`${pkg.name} ${key}`),
          distFile,
          exportNames,
        });
        bundled.push({ package: pkg.name, entry: key, bytes: code.length });
        for (const marker of rule.forbidden ?? []) {
          if (code.includes(marker)) {
            problems.push(
              `${pkg.name}: exports[${key}] 번들에 금지 표식 ${marker}가 있다`,
            );
          }
        }
        for (const marker of rule.required ?? []) {
          if (!code.includes(marker)) {
            problems.push(
              `${pkg.name}: exports[${key}] 번들에 필수 표식 ${marker}가 없다(표식이 바뀌었으면 규칙을 갱신한다)`,
            );
          }
        }
      }
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }

  return { ok: problems.length === 0, problems, bundled };
}

// 직접 실행할 때만 종료 코드를 설정한다(테스트에서 import해도 프로세스 상태를 바꾸지 않는다).
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = await runRootIsolationCheck();
  if (result.ok) {
    const list = result.bundled
      .map(({ package: name, entry }) =>
        entry === "." ? name : `${name}${entry.slice(1)}`,
      )
      .join(", ");
    console.log(`check:root-isolation 통과: ${list}`);
  } else {
    console.error("check:root-isolation 실패:");
    for (const problem of result.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
  }
}
