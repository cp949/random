import { createBaseConfig } from "./base.js";

/**
 * 저장소 스크립트(`scripts/**`)용 oxlint 설정. Node 전역을 허용한다.
 * `scripts/`는 turbo 작업(캐시 해시 대상)이 아니라서 환경변수 선언 규칙(`turbo/no-undeclared-env-vars`)을 끈다.
 *
 * @returns {import("oxlint").OxlintConfig}
 */
export const createNodeConfig = () => {
  const base = createBaseConfig();
  return {
    ...base,
    env: { node: true },
    rules: { ...base.rules, "turbo/no-undeclared-env-vars": "off" },
  };
};
