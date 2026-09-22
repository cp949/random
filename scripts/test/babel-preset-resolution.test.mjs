/**
 * 공유 ESLint 설정의 Babel 파서가 루트 의존성 없이 TypeScript preset을 로드하는지 검증한다.
 */
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const execFileAsync = promisify(execFile);

describe("공유 Babel 파서", () => {
  it("루트에서 TypeScript 문법을 파싱한다", async () => {
    const code = `import("./packages/eslint-config/base.js").then(({ config }) => {
      const { parser, parserOptions } = config.find(
        (entry) => entry.languageOptions?.parser,
      ).languageOptions;
      parser.parseForESLint("export const value: number = 1;", {
        ...parserOptions,
        filePath: "scripts/example.ts",
      });
    }).catch((error) => { console.error(error.message); process.exitCode = 1; });`;
    await expect(
      execFileAsync(process.execPath, ["-e", code], {
        cwd: repoRoot,
        // Vitest가 설정한 Node 로더가 preset 탐색을 대신하지 않도록 격리한다.
        env: { PATH: process.env.PATH, HOME: process.env.HOME },
        timeout: 5000,
      }),
    ).resolves.toBeDefined();
  });
});
