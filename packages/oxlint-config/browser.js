import { createBaseConfig } from "./base.js";

/**
 * 브라우저 대상 코드(데모)용 oxlint 설정. 타입 인식 규칙은 패키지의 `tsconfig.json`을 쓴다.
 *
 * @returns {import("oxlint").OxlintConfig}
 */
export const createBrowserConfig = () => ({
  ...createBaseConfig({ typeAware: true }),
  env: { browser: true },
});
