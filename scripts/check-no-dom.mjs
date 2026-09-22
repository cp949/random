import { fileURLToPath, pathToFileURL } from "node:url";
import { runTsc } from "./tsc.mjs";

/** 이 스크립트가 속한 저장소의 루트. */
const defaultRepoRoot = fileURLToPath(new URL("..", import.meta.url));

/** fixture가 쓰는 DOM·Node 전역. 각각이 컴파일 오류로 검출돼야 한다. */
export const REQUIRED_IDENTIFIERS = ["document", "window", "crypto"];

/**
 * "Cannot find name" 계열 진단 코드. TypeScript는 lib에 없는 흔한 전역을 알릴 때 코드를 달리 낸다
 * (`document`는 TS2584, `window`·`crypto`는 TS2304, node 전역은 TS2591).
 */
const CANNOT_FIND_NAME_CODES = new Set(["TS2304", "TS2584", "TS2591"]);

/** `--pretty false` 출력의 진단 줄을 해석한다. */
function parseDiagnostics(output) {
  const diagnostics = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /\berror (TS\d+): (.+)$/.exec(line);
    if (!match) continue;
    const [, code, message] = match;
    const identifier = /^Cannot find name '([^']+)'/.exec(message)?.[1];
    diagnostics.push({ code, message, identifier });
  }
  return diagnostics;
}

/**
 * DOM 전역을 쓰는 fixture가 "올바른 이유로" 컴파일에 실패하는지 검사한다.
 * 설정 오류처럼 다른 이유로 실패하는 fixture가 통과하지 않도록 진단 코드와 식별자를 확인한다.
 *
 * @param {{ repoRoot?: string, project?: string }} [options] project는 repoRoot 기준 경로
 */
export function runNoDomCheck({
  repoRoot = defaultRepoRoot,
  project = "fixtures/dom-usage",
} = {}) {
  const result = runTsc(["--noEmit", "--pretty", "false", "-p", project], {
    cwd: repoRoot,
  });
  const output = result.stdout + result.stderr;
  const diagnostics = parseDiagnostics(output);
  const reasons = [];

  if (result.error) {
    reasons.push(`tsc를 실행하지 못했다: ${result.error.message}`);
  } else if (result.exitCode === 0) {
    reasons.push(
      "컴파일이 성공했다. DOM 전역을 쓰는 fixture는 컴파일에 실패해야 한다",
    );
  } else if (diagnostics.length === 0) {
    reasons.push(
      `tsc가 종료 코드 ${result.exitCode}로 실패했지만 진단을 해석하지 못했다`,
    );
  }

  const unexpected = diagnostics.filter(
    (d) => !CANNOT_FIND_NAME_CODES.has(d.code),
  );
  for (const d of unexpected) {
    reasons.push(`예상하지 못한 진단 ${d.code}: ${d.message}`);
  }

  const identifiers = [
    ...new Set(
      diagnostics
        .filter((d) => CANNOT_FIND_NAME_CODES.has(d.code) && d.identifier)
        .map((d) => d.identifier),
    ),
  ];
  const missing = REQUIRED_IDENTIFIERS.filter(
    (id) => !identifiers.includes(id),
  );
  if (missing.length > 0 && result.exitCode !== 0 && !result.error) {
    reasons.push(`컴파일 오류로 검출되지 않은 식별자: ${missing.join(", ")}`);
  }

  return {
    ok: reasons.length === 0,
    reasons,
    exitCode: result.exitCode,
    diagnostics,
    identifiers,
    output,
  };
}

// 직접 실행할 때만 종료 코드를 설정한다(테스트에서 import해도 프로세스 상태를 바꾸지 않는다).
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = runNoDomCheck();
  if (result.ok) {
    console.log(
      `check:no-dom 통과: fixtures/dom-usage가 ${result.identifiers.join(", ")} 모두에서 컴파일에 실패했다`,
    );
  } else {
    console.error("check:no-dom 실패:");
    for (const reason of result.reasons) console.error(`- ${reason}`);
    console.error(`\ntsc 출력:\n${result.output}`);
    process.exitCode = 1;
  }
}
