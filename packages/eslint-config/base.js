import babelParser from "@babel/eslint-parser";
import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import turboPlugin from "eslint-plugin-turbo";
import onlyWarn from "eslint-plugin-only-warn";

/**
 * A shared ESLint configuration for the repository.
 *
 * @type {import("eslint").Linter.Config[]}
 * */
export const config = [
  js.configs.recommended,
  eslintConfigPrettier,
  {
    // files가 없으면 flat config는 .js/.mjs/.cjs만 검사하므로 TS 확장자를 명시한다.
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: ["@babel/preset-typescript"],
        },
      },
    },
    plugins: {
      turbo: turboPlugin,
    },
    rules: {
      "turbo/no-undeclared-env-vars": "warn",
    },
  },
  {
    // babel 파서는 TS 타입 참조를 스코프 분석에 반영하지 않아 `no-undef`는 `Record` 같은 타입 이름을,
    // `no-unused-vars`는 타입 위치에서만 쓰는 import를 오탐한다. 정의되지 않은 이름과 미사용 선언은
    // 컴파일러(`noUnusedLocals`, `noUnusedParameters`)가 정확히 검사하므로 TS 파일에서는 끈다.
    files: ["**/*.{ts,mts,cts}"],
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
    },
  },
  {
    plugins: {
      onlyWarn,
    },
  },
  {
    ignores: ["dist/**"],
  },
];
