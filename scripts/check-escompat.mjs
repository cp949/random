/**
 * 배포 산출물(dist) 호환성 게이트.
 *
 * 배포 대상 패키지(`packages/*` 중 private가 아닌 것)의 dist JS 전량을 baseline.json의 Chrome 하한(floor) 기준으로
 * 검사한다. oxlint의 JS 플러그인으로 eslint-plugin-es-x의 `restrict-to-<esTarget>` 프리셋을 깔고, ES2020 이후로
 * 분류되지만 floor에서 이미 지원되는 기능은 `escompat-rules.mjs` 표에서 파생해 푼다. 소스 문법은 tsc가 ES2019로
 * 낮추므로 이 게이트가 실제로 잡는 것은 런타임 API 사용이다. es-x는 ECMAScript 표준만 검사하므로 DOM·Node 전역,
 * `Math.random`, 외부 import는 `packages/oxlint-config/library.js`의 환경 규칙을 같은 엔진으로 적용한다.
 *
 * dist 안의 lint 지시 주석(`eslint-disable`, `oxlint-disable` 등)은 게이트를 우회하는 수단이라 주석이 있다는 사실
 * 자체를 실패로 처리한다(oxlint에는 인라인 지시를 전부 무시하는 옵션이 없다).
 *
 * 검사 대상이 0건이면 게이트가 조용히 무력화되므로 dist가 없거나 JS가 0건이면 실패한다. dist는 빌드 산출물이라
 * `pnpm build` 뒤에 실행한다.
 *
 * 게이트 자신의 검출력은 `scripts/test/check-escompat.test.mjs`가 고정한다. 그래서 대상 파생, oxlint 설정 생성,
 * 게이트 실행을 export하고 직접 실행일 때만 종료 코드를 설정한다.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import esX from "eslint-plugin-es-x";
import { restrictedSyntaxPlugin } from "../packages/oxlint-config/base.js";
import {
  capabilitiesRestrictedRules,
  restrictedRules,
} from "../packages/oxlint-config/library.js";
import { loadBaseline } from "./baseline.mjs";
import { presetName, rulesAllowedAt } from "./escompat-rules.mjs";
import { runOxlint } from "./oxlint-run.mjs";
import { listPublishablePackages } from "./workspace-packages.mjs";

/** 이 스크립트가 속한 저장소의 루트. */
const defaultRepoRoot = fileURLToPath(new URL("..", import.meta.url));

/**
 * aggressive 모드는 receiver를 보지 않아 이름이 겹치는 규칙이 오탐을 낸다. ES2025 Iterator helper(map, filter 등)는
 * 배열 메서드와, Set 메서드(union 등)는 도메인 메서드(`z.union`)와 겹친다. 소스의 `lib`이 ES2019라 이 API를 실제로 쓰면
 * 컴파일이 먼저 거부하므로 게이트에서 끄고 잃는 것이 없다.
 */
const COLLISION_PRONE_RULE = /^es-x\/no-(?:iterator|set)-prototype-/;

/** lint 지시 주석. dist에 있으면 게이트 우회 수단이 되므로 실패로 처리한다. */
const DIRECTIVE_COMMENT = /\b(?:eslint|oxlint|oxc)-(?:disable|enable)\b/;

/** eslint-plugin-es-x 패키지 진입점. oxlint가 JS 플러그인으로 로드하도록 절대 경로로 넘긴다. */
const esXPluginPath = fileURLToPath(import.meta.resolve("eslint-plugin-es-x"));

/**
 * 게이트가 쓰는 oxlint 설정(JSON으로 직렬화 가능한 객체). 자체 테스트가 같은 구성으로 위반 seed를 lint해
 * 검출력을 고정한다.
 *
 * @param {{ baseline?: { chromeFloor: number, esTarget: string }, repoRoot?: string }} [options]
 * @returns {import("oxlint").OxlintConfig}
 */
export function createEscompatConfig({
  repoRoot = defaultRepoRoot,
  baseline = loadBaseline(repoRoot),
} = {}) {
  const name = presetName(baseline.esTarget);
  const preset = esX.configs[name];
  if (!preset) {
    throw new Error(`es-x에 프리셋 ${name}이 없다`);
  }

  const collisionRules = Object.fromEntries(
    Object.keys(preset.rules ?? {})
      .filter((ruleId) => COLLISION_PRONE_RULE.test(ruleId))
      .map((ruleId) => [ruleId, "off"]),
  );

  return {
    // 저장소의 다른 oxlint 설정은 쓰지 않고 es-x 프리셋과 환경 규칙만 켠다.
    plugins: ["eslint"],
    categories: { correctness: "off" },
    options: { respectEslintDisableDirectives: false },
    jsPlugins: [esXPluginPath, restrictedSyntaxPlugin],
    // dist JS에는 타입 정보가 없어 기본 모드는 변수 receiver(`values.findLast()`)를 놓친다.
    // aggressive는 모든 member call을 보고한다.
    settings: { "es-x": { aggressive: true } },
    rules: {
      ...preset.rules,
      ...collisionRules,
      ...rulesAllowedAt(baseline.chromeFloor),
      ...restrictedRules,
    },
    overrides: [
      {
        // getCryptoCapabilities는 환경 진단 전용이라 randomUUID·subtle 참조만 허용한다.
        files: ["**/dist/secure/capabilities.js"],
        rules: capabilitiesRestrictedRules,
      },
    ],
  };
}

/**
 * `cwd` 기준 `targets`를 게이트 설정으로 lint한 진단을 돌려준다. 자체 테스트도 같은 경로를 쓴다.
 *
 * @param {{ cwd: string, targets: string[], baseline?: { chromeFloor: number, esTarget: string } }} options
 */
export function lintEscompat({ cwd, targets, baseline }) {
  return runOxlint({
    cwd,
    targets,
    config: createEscompatConfig({ repoRoot: cwd, baseline }),
  });
}

/** dist 아래의 JS 파일(.js/.mjs/.cjs)을 재귀 열거한다. 디렉터리가 없으면 0건으로 취급한다. */
function listDistJsFiles(directory) {
  let entries;
  try {
    entries = readdirSync(directory, { recursive: true, encoding: "utf8" });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => /\.(?:js|mjs|cjs)$/.test(entry))
    .map((entry) => join(directory, entry))
    .sort();
}

/**
 * 게이트를 실행한다. 통과·실패를 종료 코드가 아니라 결과 객체로 돌려줘 테스트가 판정할 수 있다.
 *
 * @param {string} [repoRoot]
 * @returns {Promise<{ ok: boolean, files: string[], problems: string[] }>}
 */
export async function runEscompatGate(repoRoot = defaultRepoRoot) {
  const baseline = loadBaseline(repoRoot);
  const targets = listPublishablePackages(repoRoot);
  const problems = [];
  const files = [];

  if (targets.length === 0) {
    problems.push(
      "검사할 배포 대상 패키지(packages/* 중 private가 아닌 것)가 없다",
    );
  }
  for (const pkg of targets) {
    const found = listDistJsFiles(join(pkg.dir, "dist"));
    if (found.length === 0) {
      problems.push(
        `${pkg.relDir}/dist: 검사할 JS가 0건이다. \`pnpm build\` 뒤에 실행한다`,
      );
    }
    files.push(...found);
  }

  if (files.length > 0) {
    for (const file of files) {
      if (DIRECTIVE_COMMENT.test(readFileSync(file, "utf8"))) {
        problems.push(
          `${relative(repoRoot, file)}: lint 지시 주석이 있다(dist에서는 게이트 우회 수단이라 허용하지 않는다)`,
        );
      }
    }
    const diagnostics = await lintEscompat({
      cwd: repoRoot,
      targets: files,
      baseline,
    });
    for (const diagnostic of diagnostics) {
      problems.push(
        `${relative(repoRoot, diagnostic.filePath)}:${diagnostic.line}:${diagnostic.column} ${diagnostic.ruleId ?? "parse-error"} ${diagnostic.message}`,
      );
    }
  }

  return { ok: problems.length === 0, files, problems };
}

// 직접 실행할 때만 게이트를 돌리고 종료 코드를 설정한다(테스트에서 import해도 프로세스 상태를 바꾸지 않는다).
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { chromeFloor, esTarget } = loadBaseline();
  const result = await runEscompatGate();
  if (result.ok) {
    console.log(
      `check:escompat 통과: ${result.files.length}개 파일이 Chrome ${chromeFloor} 이상(${esTarget}) 기준을 만족한다`,
    );
  } else {
    console.error("check:escompat 실패:");
    for (const problem of result.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
  }
}
