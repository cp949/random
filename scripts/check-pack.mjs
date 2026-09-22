/**
 * 배포 tarball 검사.
 *
 * 배포 대상 패키지를 실제로 pack해 다음을 확인한다.
 * 1. 파일이 허용 집합(`package.json`, `LICENSE`, `README.md`, `dist/**`)에 속하고 `src/`, `test/`, `*.tsbuildinfo`,
 *    `*.map`이 없다.
 * 2. `README.md`·`LICENSE`가 tarball에 있다(npm/pnpm은 `files` 설정과 무관하게 항상 포함하지만, 저장소에
 *    파일 자체가 없으면 포함되지 않는다).
 * 3. `exports`의 모든 `types`·`default` 대상이 tarball 안에 있다.
 * 4. manifest에 배포 메타데이터(`publishConfig.access`, `repository.url`·`directory`, `homepage`,
 *    `bugs.url`, `keywords`, `license`)가 있다.
 * 5. `attw`(ESM 전용 profile)와 `publint`가 오류 없이 통과한다.
 * 6. tarball 크기가 `MAX_TARBALL_BYTES` 이하다(실수로 들어간 파일을 잡는 용도라 여유를 크게 둔다).
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { packPackage } from "./pack.mjs";
import { listPublishablePackages } from "./workspace-packages.mjs";

/** 이 스크립트가 속한 저장소의 루트. attw·publint는 이 저장소의 devDependencies에서 실행한다. */
const defaultRepoRoot = fileURLToPath(new URL("..", import.meta.url));

const ALLOWED_FILE = /^(?:package\.json|LICENSE|README\.md|dist\/.+)$/;
const REQUIRED_FILES = ["package.json", "LICENSE", "README.md"];

/**
 * tarball 크기 상한(bytes). 실수로 들어간 파일(예: node_modules 통째)을 잡는 용도라 여유를 크게 둔다.
 * `@cp949/random` 첫 측정값(71,491 B, 2026-09-22, DELTA-05 완료 시점, 배포 메타데이터·README 포함
 * 후 크기)의 1.5배를 1,000 B 단위로 올렸다.
 */
const MAX_TARBALL_BYTES = 108_000;

const FORBIDDEN = [
  { pattern: /^src\//, reason: "src/는 배포하지 않는다" },
  { pattern: /^test\//, reason: "test/는 배포하지 않는다" },
  { pattern: /\.tsbuildinfo$/, reason: "*.tsbuildinfo는 배포하지 않는다" },
  {
    pattern: /\.map$/,
    reason: "*.map은 src를 가리키는데 src가 배포되지 않아 끊어진 참조가 된다",
  },
];

/**
 * 모든 export가 선언해야 하는 조건. attw는 타입이 없는 패키지를 오류가 아니라 정보로만 보고하므로
 * 타입 제공(`types`)은 이 검사가 직접 강제한다.
 */
const REQUIRED_CONDITIONS = ["types", "default"];

/**
 * manifest에 있어야 하는 배포 메타데이터 필드. `read`는 manifest에서 검사 대상 값을 꺼내고,
 * `valid`는 그 값이 올바른지 본다.
 */
const REQUIRED_MANIFEST_FIELDS = [
  {
    path: "publishConfig.access",
    read: (m) => m.publishConfig?.access,
    valid: (v) => v === "public",
  },
  {
    path: "repository.url",
    read: (m) => m.repository?.url,
    valid: (v) => typeof v === "string" && v !== "",
  },
  {
    path: "repository.directory",
    read: (m) => m.repository?.directory,
    valid: (v) => typeof v === "string" && v !== "",
  },
  {
    path: "homepage",
    read: (m) => m.homepage,
    valid: (v) => typeof v === "string" && v !== "",
  },
  {
    path: "bugs.url",
    read: (m) => m.bugs?.url,
    valid: (v) => typeof v === "string" && v !== "",
  },
  {
    path: "keywords",
    read: (m) => m.keywords,
    valid: (v) => Array.isArray(v) && v.length > 0,
  },
  {
    path: "license",
    read: (m) => m.license,
    valid: (v) => typeof v === "string" && v !== "",
  },
];

/** 저장소의 도구를 실행하고 실패하면 출력 앞부분을 담은 문제 문자열을 돌려준다. */
function runTool(label, args) {
  const result = spawnSync("pnpm", ["exec", ...args], {
    cwd: defaultRepoRoot,
    encoding: "utf8",
  });
  if (result.status === 0) return undefined;
  const output = `${result.stdout}${result.stderr}`
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .slice(0, 20)
    .join("\n");
  return `${label}가 실패했다(종료 코드 ${result.status}):\n${output}`;
}

/**
 * 검사를 실행한다. 통과·실패를 종료 코드가 아니라 결과 객체로 돌려준다.
 *
 * @param {string} [repoRoot]
 * @param {{ runTools?: boolean, maxTarballBytes?: number }} [options] runTools를 끄면 attw·publint를
 *   건너뛴다(파일 검사만). maxTarballBytes는 테스트가 작은 상한을 주입할 때만 쓴다.
 * @returns {Promise<{ ok: boolean, problems: string[], tarballs: { name: string, size: number }[] }>}
 */
export async function runPackCheck(
  repoRoot = defaultRepoRoot,
  { runTools = true, maxTarballBytes = MAX_TARBALL_BYTES } = {},
) {
  const targets = listPublishablePackages(repoRoot);
  const problems = [];
  const tarballs = [];

  if (targets.length === 0) {
    problems.push(
      "검사할 배포 대상 패키지(packages/* 중 private가 아닌 것)가 없다",
    );
  }

  for (const pkg of targets) {
    const out = mkdtempSync(join(tmpdir(), "pack-check-"));
    try {
      const packed = packPackage(pkg.dir, out);
      tarballs.push({ name: pkg.name, size: packed.size });

      for (const required of REQUIRED_FILES) {
        if (!packed.files.includes(required)) {
          problems.push(`${pkg.name}: tarball에 ${required}가 없다`);
        }
      }

      for (const field of REQUIRED_MANIFEST_FIELDS) {
        if (!field.valid(field.read(packed.manifest))) {
          problems.push(`${pkg.name}: package.json에 ${field.path}가 없다`);
        }
      }

      if (packed.size > maxTarballBytes) {
        problems.push(
          `${pkg.name}: tarball 크기 ${packed.size} B가 상한 ${maxTarballBytes} B를 넘는다`,
        );
      }

      for (const file of packed.files) {
        const forbidden = FORBIDDEN.find((rule) => rule.pattern.test(file));
        if (forbidden) {
          problems.push(`${pkg.name}: ${file}: ${forbidden.reason}`);
        } else if (!ALLOWED_FILE.test(file)) {
          problems.push(
            `${pkg.name}: ${file}: 허용 집합(package.json, LICENSE, README.md, dist/**) 밖의 파일이다`,
          );
        }
      }

      const exportsField = packed.manifest.exports;
      if (exportsField === null || typeof exportsField !== "object") {
        problems.push(`${pkg.name}: tarball의 package.json에 exports가 없다`);
      } else {
        for (const [key, value] of Object.entries(exportsField)) {
          // 문자열 대상(`".": "./dist/index.js"`)은 default 조건만 가진 것으로 본다.
          const conditions =
            typeof value === "string" ? { default: value } : (value ?? {});
          for (const condition of REQUIRED_CONDITIONS) {
            const file = conditions[condition];
            if (typeof file !== "string") {
              problems.push(
                `${pkg.name}: exports[${key}]에 ${condition} 조건이 없다`,
              );
              continue;
            }
            const path = file.replace(/^\.\//, "");
            if (!packed.files.includes(path)) {
              problems.push(
                `${pkg.name}: exports[${key}].${condition}의 대상 ${path}가 tarball에 없다`,
              );
            }
          }
        }
      }

      if (runTools) {
        const attw = runTool("attw", [
          "attw",
          packed.tarball,
          "--profile",
          "esm-only",
          "--no-summary",
        ]);
        if (attw) problems.push(`${pkg.name}: ${attw}`);
        const publint = runTool("publint", ["publint", "run", packed.tarball]);
        if (publint) problems.push(`${pkg.name}: ${publint}`);
      }
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }

  return { ok: problems.length === 0, problems, tarballs };
}

// 직접 실행할 때만 종료 코드를 설정한다(테스트에서 import해도 프로세스 상태를 바꾸지 않는다).
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = await runPackCheck();
  for (const { name, size } of result.tarballs) {
    console.log(`check:pack: ${name} tarball ${size} bytes`);
  }
  if (result.ok) {
    console.log(
      "check:pack 통과: tarball 파일 집합, exports 대상, attw, publint",
    );
  } else {
    console.error("check:pack 실패:");
    for (const problem of result.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
  }
}
