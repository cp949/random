import globals from "globals";
import { config as baseConfig } from "./base.js";

/**
 * 저장소 스크립트(`scripts/**`)용 ESLint 설정. Node 전역을 허용한다.
 * `scripts/`는 turbo 작업(캐시 해시 대상)이 아니라서 환경변수 선언 규칙(`turbo/no-undeclared-env-vars`)을 끈다.
 *
 * @type {import("eslint").Linter.Config[]}
 * */
export const nodeConfig = [
  ...baseConfig,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "turbo/no-undeclared-env-vars": "off",
    },
  },
];
