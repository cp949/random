/**
 * oxlint CLI를 실행해 진단을 구조화해서 돌려주는 도우미.
 *
 * `check-escompat.mjs`(배포물 게이트)와 lint 규칙·게이트 자체 테스트가 같은 방식으로 oxlint를 호출하도록 모았다.
 * oxlint에는 ESLint의 `lintText` 같은 Node API가 없어 설정 파일을 디스크에 쓰고 CLI의 JSON 출력을 읽는다.
 */
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

/** oxlint 실행 파일. `oxlint/package.json`이 `bin` 위치를 알려 준다. */
const oxlintBin = join(
  dirname(require.resolve("oxlint/package.json")),
  "bin",
  "oxlint",
);

/** oxlint 진단 코드(`es-x(no-array-prototype-at)`)를 ESLint식 규칙 ID(`es-x/no-array-prototype-at`)로 바꾼다. */
export function toRuleId(code) {
  if (!code) return null;
  const match = /^([^()]+)\((.+)\)$/.exec(code);
  if (!match) return code;
  const [, plugin, rule] = match;
  // eslint 코어 규칙은 접두사 없이 쓴다(`no-restricted-globals`).
  return plugin === "eslint" ? rule : `${plugin}/${rule}`;
}

/**
 * 설정 객체를 `cwd` 아래 임시 JSON 파일로 쓰고 oxlint를 실행한다. 설정 파일은 실행 뒤 지운다.
 *
 * 설정의 `overrides[].files` 글롭은 설정 파일 위치 기준이라 `cwd`와 같은 디렉터리에 둔다.
 *
 * @param {{ cwd: string, config: object, targets: string[] }} options `targets`는 `cwd` 기준 또는 절대 경로.
 * @returns {Promise<{ filePath: string, line: number | null, column: number | null, ruleId: string | null, message: string, severity: string }[]>}
 */
export async function runOxlint({ cwd, config, targets }) {
  const configPath = join(
    cwd,
    `.oxlintrc.${randomBytes(6).toString("hex")}.json`,
  );
  writeFileSync(configPath, JSON.stringify(config));
  try {
    let stdout;
    try {
      ({ stdout } = await execFileAsync(
        process.execPath,
        [
          oxlintBin,
          "-c",
          configPath,
          "-f",
          "json",
          "--no-error-on-unmatched-pattern",
          ...targets,
        ],
        { cwd, maxBuffer: 64 * 1024 * 1024 },
      ));
    } catch (error) {
      // 진단이 있으면 종료 코드 1이지만 stdout에는 JSON이 있다. JSON이 없으면 oxlint 자체 실패다.
      if (
        typeof error.stdout !== "string" ||
        !error.stdout.trim().startsWith("{")
      ) {
        throw new Error(`oxlint 실행 실패: ${error.stderr || error.message}`, {
          cause: error,
        });
      }
      stdout = error.stdout;
    }
    const { diagnostics } = JSON.parse(stdout);
    return diagnostics.map((diagnostic) => {
      const span = diagnostic.labels?.[0]?.span;
      return {
        filePath: isAbsolute(diagnostic.filename)
          ? diagnostic.filename
          : resolve(cwd, diagnostic.filename),
        line: span?.line ?? null,
        column: span?.column ?? null,
        ruleId: toRuleId(diagnostic.code),
        message: diagnostic.message,
        severity: diagnostic.severity,
      };
    });
  } finally {
    rmSync(configPath, { force: true });
  }
}
