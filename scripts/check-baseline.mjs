/**
 * baseline.json과 그 값을 직접 읽을 수 없는 소비자의 일치를 검사한다.
 *
 * - `packages/typescript-config/library.json`: tsconfig는 다른 파일의 값을 읽을 수 없으므로 `target`과 `lib`이
 *   `esTarget`과 같은지 검사한다.
 * - `apps/demo/vite.config.ts`: `baseline.json`을 import하는지 검사한다(값을 직접 적으면 단일 출처가 깨진다).
 * - `esTarget`에 대응하는 es-x 프리셋(`scripts/escompat-rules.mjs`가 이름을 만든다)이 실제로 있는지 검사한다.
 *   표의 규칙 이름 검증은 `scripts/test/escompat-rules.test.mjs`가 맡는다.
 * - `packages/legacy-browser-smoke/src/run.mjs`: `scripts/baseline.mjs`를 import하는지 검사한다(값을
 *   직접 적으면 revision 단일 출처가 깨진다).
 * - `packages/legacy-browser-smoke/Dockerfile`: `chromium.version`·`chromium.revision`·`chromium.sha256`
 *   값이 리터럴로 없는지 검사한다(값은 `--build-arg`로만 들어간다).
 *
 * 자체 테스트가 결과를 판정할 수 있게 검사를 export하고, 직접 실행일 때만 종료 코드를 설정한다.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import esX from "eslint-plugin-es-x";
import { loadBaseline } from "./baseline.mjs";
import { presetName } from "./escompat-rules.mjs";

/** 이 스크립트가 속한 저장소의 루트. */
const defaultRepoRoot = fileURLToPath(new URL("..", import.meta.url));

const LIBRARY_TSCONFIG = "packages/typescript-config/library.json";
const DEMO_VITE_CONFIG = "apps/demo/vite.config.ts";
const SMOKE_RUNNER = "packages/legacy-browser-smoke/src/run.mjs";
const SMOKE_DOCKERFILE = "packages/legacy-browser-smoke/Dockerfile";

/** 줄 맨 앞의 import 문만 센다. 주석이나 문자열에서 파일 이름을 언급한 것은 import가 아니다. */
const BASELINE_IMPORT =
  /^\s*import\b[^;]*?\bfrom\s+["'][^"']*baseline\.json["']/m;
const BASELINE_MJS_IMPORT =
  /^\s*import\b[^;]*?\bfrom\s+["'][^"']*baseline\.mjs["']/m;

/**
 * 주석이 있는 JSON(tsconfig)을 읽는다. 한 줄 주석과 블록 주석을 걷어내고 `JSON.parse`한다.
 * 문자열 안의 주석 기호는 보존한다. tsconfig가 허용하는 후행 쉼표는 지원하지 않는다.
 *
 * @param {string} text
 */
export function parseJsonc(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
    } else if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      if (end === -1) throw new Error("닫히지 않은 블록 주석이 있다");
      i = end + 2;
    } else {
      out += ch;
      i += 1;
    }
  }
  return JSON.parse(out);
}

/**
 * 검사를 실행한다. 통과·실패를 종료 코드가 아니라 결과 객체로 돌려준다.
 *
 * @param {string} [repoRoot]
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function runBaselineCheck(repoRoot = defaultRepoRoot) {
  let baseline;
  try {
    baseline = loadBaseline(repoRoot);
  } catch (error) {
    // baseline.json 자체가 잘못됐으면 다른 검사의 기준이 없으므로 그 문제만 보고한다.
    return { ok: false, problems: [error.message] };
  }
  const { esTarget } = baseline;
  const target = esTarget.toLowerCase();
  const problems = [];

  const libraryPath = join(repoRoot, LIBRARY_TSCONFIG);
  if (!existsSync(libraryPath)) {
    problems.push(`${LIBRARY_TSCONFIG}이 없다`);
  } else {
    try {
      const options =
        parseJsonc(readFileSync(libraryPath, "utf8")).compilerOptions ?? {};
      const actualTarget = options.target;
      if (
        typeof actualTarget !== "string" ||
        actualTarget.toLowerCase() !== target
      ) {
        problems.push(
          `${LIBRARY_TSCONFIG}의 target(${JSON.stringify(actualTarget)})이 baseline.json의 esTarget(${esTarget})과 다르다`,
        );
      }
      const lib = options.lib;
      const libMatches =
        Array.isArray(lib) &&
        lib.length === 1 &&
        typeof lib[0] === "string" &&
        lib[0].toLowerCase() === target;
      if (!libMatches) {
        problems.push(
          `${LIBRARY_TSCONFIG}의 lib(${JSON.stringify(lib)})이 [${esTarget}]가 아니다`,
        );
      }
    } catch (error) {
      problems.push(`${LIBRARY_TSCONFIG}을 읽을 수 없다: ${error.message}`);
    }
  }

  const vitePath = join(repoRoot, DEMO_VITE_CONFIG);
  if (!existsSync(vitePath)) {
    problems.push(`${DEMO_VITE_CONFIG}가 없다`);
  } else if (!BASELINE_IMPORT.test(readFileSync(vitePath, "utf8"))) {
    problems.push(
      `${DEMO_VITE_CONFIG}가 baseline.json을 import하지 않는다(chromeFloor를 직접 적으면 단일 출처가 깨진다)`,
    );
  }

  const preset = presetName(esTarget);
  if (!esX.configs[preset]) {
    problems.push(
      `esTarget(${esTarget})에 대응하는 es-x 프리셋 ${preset}이 없다`,
    );
  }

  const runnerPath = join(repoRoot, SMOKE_RUNNER);
  if (!existsSync(runnerPath)) {
    problems.push(`${SMOKE_RUNNER}이 없다`);
  } else if (!BASELINE_MJS_IMPORT.test(readFileSync(runnerPath, "utf8"))) {
    problems.push(
      `${SMOKE_RUNNER}가 baseline.mjs를 import하지 않는다(chromium 값을 직접 적으면 단일 출처가 깨진다)`,
    );
  }

  const dockerfilePath = join(repoRoot, SMOKE_DOCKERFILE);
  if (!existsSync(dockerfilePath)) {
    problems.push(`${SMOKE_DOCKERFILE}이 없다`);
  } else {
    const dockerfileText = readFileSync(dockerfilePath, "utf8");
    const literalKeys = ["version", "revision", "sha256"].filter((key) =>
      dockerfileText.includes(String(baseline.chromium[key])),
    );
    if (literalKeys.length > 0) {
      problems.push(
        `${SMOKE_DOCKERFILE}에 chromium.${literalKeys.join(", chromium.")} 값이 리터럴로 있다(--build-arg로만 받는다)`,
      );
    }
  }

  return { ok: problems.length === 0, problems };
}

// 직접 실행할 때만 종료 코드를 설정한다(테스트에서 import해도 프로세스 상태를 바꾸지 않는다).
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = runBaselineCheck();
  if (result.ok) {
    console.log("check:baseline 통과: baseline.json과 소비자 설정이 일치한다");
  } else {
    console.error("check:baseline 실패:");
    for (const problem of result.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
  }
}
