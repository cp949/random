import { createBaseConfig } from "./base.js";

/**
 * 저장소 스크립트(`scripts/**`)용 oxlint 설정. Node 전역을 허용한다.
 *
 * @returns {import("oxlint").OxlintConfig}
 */
export const createNodeConfig = () => ({
  ...createBaseConfig(),
  env: { node: true },
});
