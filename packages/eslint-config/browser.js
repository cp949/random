import globals from "globals";
import tseslint from "typescript-eslint";
import { config as baseConfig } from "./base.js";

const TS_FILES = ["**/*.{ts,mts,cts}"];

/**
 * 브라우저 대상 코드(라이브러리, 데모)용 ESLint 설정.
 *
 * `tsconfigRootDir`는 호출자가 넘긴다(`process.cwd()`는 이 모듈을 직접 import해 다른 cwd에서
 * `ESLint`를 돌리는 테스트 하네스에서 깨진다. `library.js`의 `createLibraryConfig`와 같은 이유).
 *
 * @param {string} tsconfigRootDir 대상 패키지 루트(보통 그 패키지 `eslint.config.js`의 `import.meta.dirname`).
 * @returns {import("eslint").Linter.Config[]}
 */
export const createBrowserConfig = (tsconfigRootDir) =>
  tseslint.config(
    ...baseConfig,
    {
      files: TS_FILES,
      extends: [tseslint.configs.recommendedTypeChecked],
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
    },
    {
      languageOptions: {
        globals: {
          ...globals.browser,
        },
      },
    },
  );
