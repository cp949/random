/**
 * 배포물 소비 검증.
 *
 * 배포 대상 패키지를 pack한 tarball을 일반 소비자와 같은 방식(`npm install`)으로 임시 프로젝트에 설치한 뒤
 * 1. `exports`의 모든 키를 import하는 파일이 `moduleResolution`이 `NodeNext`, `Bundler`인 두 설정에서 타입 검사를 통과하고
 *    (DOM 없는 ES2019 타입 환경, `skipLibCheck` 끔),
 * 2. 패키지별 사용 fixture(패키지당 여러 파일)가 있으면 lib.dom이 있는 같은 두 설정에서 컴파일되며
 *    (`@cp949/random`: `randomBytes` 결과를 `crypto.subtle.digest`에 캐스팅 없이 넘기고 `./id`의 값 export를 해석한다),
 * 3. Node로 모든 subpath를 import할 수 있고,
 * 4. `globalThis.crypto`가 없거나 접근이 예외를 던지는 환경에서도 import가 예외 없이 끝나며,
 * 5. 패키지별 런타임 smoke(패키지당 여러 파일)가 있으면 파일마다 설치된 패키지를 세 가지 crypto 상태에서 실제로 호출해
 *    통과하는지 확인한다.
 * 6. 사용성 사례 fixture는 기본 crypto 상태에서 한 번 실행해 한 식 호출의 결과 형식을 확인한다.
 * 1, 2는 컴파일러 lane마다 반복한다: 저장소의 TypeScript와 소비자 하한(5.7) TypeScript(devDependency alias)다.
 * 3~6은 소스가 아니라 빌드된 산출물을 확인한다. 3, 4는 import 시점에 crypto를 건드리지 않는다는 것을,
 * 5, 6은 컴파일된 ES2019 코드가 실제 `globalThis.crypto` 위에서 동작한다는 것을 확인한다.
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { packPackage } from "./pack.mjs";
import { DEFAULT_TYPESCRIPT, runTsc, tscVersion } from "./tsc.mjs";
import { listPublishablePackages } from "./workspace-packages.mjs";

/** 이 스크립트가 속한 저장소의 루트. 템플릿은 검사 대상 저장소가 아니라 이 저장소의 것을 쓴다. */
const defaultRepoRoot = fileURLToPath(new URL("..", import.meta.url));
const TEMPLATE_DIR = join(defaultRepoRoot, "fixtures/consumer");
const TEMPLATE_FILES = [
  "package.json",
  "tsconfig.nodenext.json",
  "tsconfig.bundler.json",
];

const TYPE_CHECKS = [
  { label: "NodeNext", config: "tsconfig.nodenext.json" },
  { label: "Bundler", config: "tsconfig.bundler.json" },
];

/**
 * 컴파일러 lane. 저장소의 TypeScript와 소비자 하한 TypeScript다.
 * 하한은 루트 `package.json`의 devDependency alias(`typescript-5.7`)로 고정한다. 하한 값을 바꾸려면 alias와
 * `docs/api/secure.md`의 "TypeScript 5.7 이상"을 함께 고친다.
 */
const TS_LANES = [DEFAULT_TYPESCRIPT, "typescript-5.7"];

/**
 * 패키지 이름별 사용 fixture 파일(절대 경로)의 배열. 파일은 작업 디렉터리에 같은 이름으로 복사되고
 * `USAGE_CHECKS`의 설정이 `usage-*.ts`를 모두 컴파일한다. 파일을 더할 때는 배열에 경로만 추가한다.
 * 이름이 `USAGE_NAME_RULE`과 다르면 컴파일되지 않고 조용히 빠지므로 등록 단계에서 실패로 보고한다.
 */
export const USAGE_FIXTURES = {
  "@cp949/random": [
    join(TEMPLATE_DIR, "usage-secure.ts"),
    join(TEMPLATE_DIR, "usage-id.ts"),
    join(TEMPLATE_DIR, "usage-random.ts"),
    join(TEMPLATE_DIR, "usage-state.ts"),
  ],
};

/** 사용 fixture의 파일 이름 규칙. `tsconfig.usage-*.json`의 `include`(`usage-*.ts`)와 같다. */
const USAGE_NAME_RULE = { pattern: /^usage-.*\.ts$/, text: "usage-*.ts" };

const USAGE_CHECKS = [
  { label: "NodeNext", config: "tsconfig.usage-nodenext.json" },
  { label: "Bundler", config: "tsconfig.usage-bundler.json" },
];

/**
 * 패키지 이름별 런타임 smoke 스크립트(절대 경로)의 배열. 설치된 패키지를 Node에서 실제로 호출한다.
 * 단위 테스트는 `src`를 import하므로 이 smoke와 사용성 사례가 빌드된 산출물의 실제 crypto 호출을 확인한다.
 * 스크립트는 작업 디렉터리에 같은 이름으로 복사해 파일마다 `IMPORT_SCENARIOS`의 세 상태에서 실행한다.
 * 스크립트는 인자로 mode를 받고, 실패하면 0이 아닌 종료 코드로 끝난다. 파일을 더할 때는 배열에 경로만 추가한다.
 */
export const SMOKE_FIXTURES = {
  "@cp949/random": [
    join(TEMPLATE_DIR, "smoke-secure.mjs"),
    join(TEMPLATE_DIR, "smoke-id.mjs"),
    join(TEMPLATE_DIR, "smoke-random.mjs"),
    join(TEMPLATE_DIR, "smoke-state.mjs"),
  ],
};

/** 사용성 사례는 실제 crypto가 있는 기본 상태에서만 실행한다. */
export const RECIPE_FIXTURES = {
  "@cp949/random": [join(TEMPLATE_DIR, "recipes-id.mjs")],
};

const IMPORT_SCENARIOS = [
  { label: "기본", mode: "present" },
  { label: "crypto 제거", mode: "absent" },
  { label: "crypto 접근 예외", mode: "throwing" },
];

/** Node로 모든 subpath를 import하는 스크립트. `mode`로 `globalThis.crypto` 상태를 바꾼다. */
function importScript(specifiers) {
  return [
    `const specifiers = ${JSON.stringify(specifiers)};`,
    "const mode = process.argv[2];",
    'if (mode === "absent") {',
    '  Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true, writable: true });',
    '} else if (mode === "throwing") {',
    '  Object.defineProperty(globalThis, "crypto", {',
    '    get() { throw new Error("crypto 접근이 거부되었다"); },',
    "    configurable: true,",
    "  });",
    "}",
    "for (const specifier of specifiers) await import(specifier);",
    "",
  ].join("\n");
}

/** 도구 출력의 앞부분만 보고용으로 남긴다. */
function head(text, lines = 15) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .slice(0, lines)
    .join("\n");
}

/** 등록부에서 패키지 이름의 fixture 파일 배열을 찾는다. 등록이 없으면 빈 배열이다(`constructor` 같은 이름이 상속 속성을 집지 않게 own 속성만 본다). */
function registered(registry, name, kind, problems) {
  if (!Object.hasOwn(registry, name)) return [];
  const files = registry[name];
  if (!Array.isArray(files)) {
    problems.push(`${name}: ${kind} fixture 등록은 파일 경로 배열이어야 한다`);
    return [];
  }
  if (files.length === 0) {
    problems.push(`${name}: ${kind} fixture 등록 배열이 비어 있다`);
  }
  return files;
}

/**
 * 등록한 fixture 파일 중 실행할 수 있는 파일만 돌려주고, 나머지는 문제로 `problems`에 더한다.
 * 파일이 없으면(예외로 죽는 대신 경로를 알려 준다), `nameRule`이 있는데 이름이 맞지 않으면(컴파일 대상에서 조용히 빠진다),
 * 앞선 파일과 이름이 겹치면(작업 디렉터리에 같은 이름으로 복사하므로 서로 덮어쓴다) 제외한다.
 * `nameRule`은 `{ pattern: RegExp, text: string }`이고 `text`는 문제 문구에 넣는 규칙 표기다.
 */
function usableFixtures(packageName, kind, files, problems, nameRule) {
  const usable = [];
  const names = new Set();
  for (const file of files) {
    const name = basename(file);
    if (!existsSync(file)) {
      problems.push(`${packageName}: ${kind} fixture 파일이 없다: ${file}`);
    } else if (nameRule && !nameRule.pattern.test(name)) {
      problems.push(
        `${packageName}: ${kind} fixture ${name}은 이름이 ${nameRule.text} 규칙과 달라 tsconfig가 컴파일하지 않는다`,
      );
    } else if (names.has(name)) {
      problems.push(
        `${packageName}: ${kind} fixture ${name}이 다른 fixture와 이름이 겹친다. 작업 디렉터리에 같은 이름으로 복사하므로 서로 덮어쓴다`,
      );
    } else {
      names.add(name);
      usable.push(file);
    }
  }
  return usable;
}

/**
 * 검사를 실행한다. 통과·실패를 종료 코드가 아니라 결과 객체로 돌려준다.
 *
 * @param {string} [repoRoot]
 * @param {{ lanes?: string[], usageFixtures?: Record<string, string[]>, smokeFixtures?: Record<string, string[]>, recipeFixtures?: Record<string, string[]> }} [options]
 *   `lanes`는 컴파일러 lane의 TypeScript 패키지 이름(기본 `TS_LANES`), `usageFixtures`·`smokeFixtures`는 패키지 이름별
 *   사용 fixture·smoke 스크립트의 절대 경로 배열(기본 `USAGE_FIXTURES`·`SMOKE_FIXTURES`).
 *   `recipeFixtures`는 기본 crypto 상태에서 실행할 사용성 사례 파일 배열(기본 `RECIPE_FIXTURES`)이다.
 * @returns {Promise<{ ok: boolean, problems: string[], checked: string[], lanes: string[], usageChecked: string[], usageFiles: string[], smokeChecked: string[], smokeFiles: string[], recipeChecked: string[], recipeFiles: string[] }>}
 *   `lanes`는 실제로 실행한 컴파일러 버전, `usageChecked`는 사용 fixture를 컴파일한 패키지 이름, `usageFiles`는 그 파일 이름,
 *   `smokeChecked`·`recipeChecked`는 각각 smoke·사용성 사례를 실행한 패키지 이름, `smokeFiles`·`recipeFiles`는 그 파일 이름이다.
 */
export async function runConsumerCheck(
  repoRoot = defaultRepoRoot,
  {
    lanes = TS_LANES,
    usageFixtures = USAGE_FIXTURES,
    smokeFixtures = SMOKE_FIXTURES,
    recipeFixtures = RECIPE_FIXTURES,
  } = {},
) {
  const targets = listPublishablePackages(repoRoot);
  const problems = [];
  const checked = [];
  const usageChecked = [];
  const usageFiles = [];
  const smokeChecked = [];
  const smokeFiles = [];
  const recipeChecked = [];
  const recipeFiles = [];

  if (targets.length === 0) {
    problems.push(
      "검사할 배포 대상 패키지(packages/* 중 private가 아닌 것)가 없다",
    );
  }

  // 설치되지 않은 lane은 스택 트레이스 대신 문제로 보고한다. 하한 lane이 조용히 빠지면 게이트가 의미를 잃는다.
  const compilers = [];
  for (const specifier of lanes) {
    try {
      compilers.push({ specifier, version: tscVersion(specifier) });
    } catch {
      problems.push(
        `컴파일러 lane의 TypeScript(${specifier})가 설치돼 있지 않다. \`pnpm install\`로 devDependency alias를 설치한다`,
      );
    }
  }

  for (const pkg of targets) {
    const packDir = mkdtempSync(join(tmpdir(), "consumer-pack-"));
    const workDir = mkdtempSync(join(tmpdir(), "consumer-work-"));
    try {
      const packed = packPackage(pkg.dir, packDir);
      const name = packed.manifest.name;
      const keys = Object.keys(packed.manifest.exports ?? {});
      const specifiers = keys.map((key) => `${name}${key.slice(1)}`);
      checked.push(...specifiers);

      for (const file of TEMPLATE_FILES) {
        copyFileSync(join(TEMPLATE_DIR, file), join(workDir, file));
      }
      const template = JSON.parse(
        readFileSync(join(workDir, "package.json"), "utf8"),
      );
      template.dependencies = { [name]: `file:${packed.tarball}` };
      writeFileSync(
        join(workDir, "package.json"),
        JSON.stringify(template, null, 2),
      );

      const install = spawnSync(
        "npm",
        [
          "install",
          "--ignore-scripts",
          "--no-audit",
          "--no-fund",
          "--loglevel=error",
        ],
        { cwd: workDir, encoding: "utf8" },
      );
      if (install.status !== 0) {
        problems.push(
          `${pkg.name}: npm install이 실패했다:\n${head(install.stderr + install.stdout)}`,
        );
        continue;
      }

      writeFileSync(
        join(workDir, "index.ts"),
        `${specifiers.map((s, i) => `import * as m${i} from "${s}";\nvoid m${i};`).join("\n")}\nexport {};\n`,
      );

      const usageScripts = usableFixtures(
        pkg.name,
        "사용",
        registered(usageFixtures, name, "사용", problems),
        problems,
        USAGE_NAME_RULE,
      );
      if (usageScripts.length > 0) {
        for (const file of usageScripts) {
          copyFileSync(file, join(workDir, basename(file)));
          usageFiles.push(basename(file));
        }
        for (const { config } of USAGE_CHECKS) {
          copyFileSync(join(TEMPLATE_DIR, config), join(workDir, config));
        }
        usageChecked.push(name);
      }

      for (const { specifier, version } of compilers) {
        const lane = `TypeScript ${version}`;
        const checks = [
          ...TYPE_CHECKS.map((check) => ({ ...check, what: "타입 해석" })),
          ...(usageScripts.length > 0
            ? USAGE_CHECKS.map((check) => ({ ...check, what: "사용 fixture" }))
            : []),
        ];
        for (const { label, config, what } of checks) {
          const result = runTsc(
            ["--noEmit", "--pretty", "false", "-p", config],
            { cwd: workDir, typescript: specifier },
          );
          if (result.exitCode !== 0) {
            problems.push(
              `${pkg.name}: [${lane}, ${label}] ${what} 실패:\n${head(result.stdout + result.stderr)}`,
            );
          }
        }
      }

      writeFileSync(join(workDir, "import-all.mjs"), importScript(specifiers));
      for (const { label, mode } of IMPORT_SCENARIOS) {
        const result = spawnSync(process.execPath, ["import-all.mjs", mode], {
          cwd: workDir,
          encoding: "utf8",
        });
        if (result.status !== 0) {
          problems.push(
            `${pkg.name}: [import, ${label}] 실패:\n${head(result.stderr + result.stdout)}`,
          );
        }
      }

      // 실행 종류별 등록부에도 같은 배열·누락·중복 검사를 적용한다.
      for (const [kind, registry, scenarios, checkedPackages, checkedFiles] of [
        ["smoke", smokeFixtures, IMPORT_SCENARIOS, smokeChecked, smokeFiles],
        [
          "recipe",
          recipeFixtures,
          [IMPORT_SCENARIOS[0]],
          recipeChecked,
          recipeFiles,
        ],
      ]) {
        const runtimeScripts = usableFixtures(
          pkg.name,
          kind,
          registered(registry, name, kind, problems),
          problems,
        );
        if (runtimeScripts.length > 0) checkedPackages.push(name);
        for (const script of runtimeScripts) {
          const file = basename(script);
          copyFileSync(script, join(workDir, file));
          checkedFiles.push(file);
          for (const { label, mode } of scenarios) {
            const result = spawnSync(process.execPath, [file, mode], {
              cwd: workDir,
              encoding: "utf8",
            });
            if (result.status !== 0) {
              problems.push(
                `${pkg.name}: [${kind} ${file}, ${label}] 실패:\n${head(result.stderr + result.stdout)}`,
              );
            }
          }
        }
      }
    } finally {
      rmSync(packDir, { recursive: true, force: true });
      rmSync(workDir, { recursive: true, force: true });
    }
  }

  return {
    ok: problems.length === 0,
    problems,
    checked,
    lanes: compilers.map(({ version }) => version),
    usageChecked,
    usageFiles,
    smokeChecked,
    smokeFiles,
    recipeChecked,
    recipeFiles,
  };
}

// 직접 실행할 때만 종료 코드를 설정한다(테스트에서 import해도 프로세스 상태를 바꾸지 않는다).
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = await runConsumerCheck();
  if (result.ok) {
    const grouped = (names, registry) =>
      names
        .map(
          (name) =>
            `${name}(${registry[name].map((file) => basename(file)).join(", ")})`,
        )
        .join(", ") || "없음";
    console.log(
      `check:consumer 통과: ${result.checked.join(", ")} (TypeScript ${result.lanes.join(", ")}: NodeNext, Bundler, 사용 fixture ${grouped(result.usageChecked, USAGE_FIXTURES)}; crypto 제거·접근 예외 import; 런타임 smoke ${grouped(result.smokeChecked, SMOKE_FIXTURES)}; 사용성 사례 ${grouped(result.recipeChecked, RECIPE_FIXTURES)})`,
    );
  } else {
    console.error("check:consumer 실패:");
    for (const problem of result.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
  }
}
