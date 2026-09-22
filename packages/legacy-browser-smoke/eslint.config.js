import globals from "globals";
import esX from "eslint-plugin-es-x";
import { config as baseConfig } from "@repo/eslint-config/base";
import { loadBaseline } from "../../scripts/baseline.mjs";
import { presetName, rulesAllowedAt } from "../../scripts/escompat-rules.mjs";

const SRC_FILES = ["src/**/*.{js,mjs}", "test/**/*.{js,mjs}"];
const PAGE_FILES = ["page/**/*.{js,mjs}"];

const baseline = loadBaseline();
const preset = esX.configs[presetName(baseline.esTarget)];
if (!preset) {
  throw new Error(
    `es-x에 프리셋 ${presetName(baseline.esTarget)}이 없다(escompat-rules.mjs와 불일치)`,
  );
}

/**
 * runner·서버·컨테이너 entry(`src/**`, `test/**`)는 Node 환경, smoke 페이지(`page/**`)는
 * 브라우저 환경 + Chrome 75(`baseline.json`의 chromeFloor) 문법 제한을 적용한다.
 * 페이지가 floor를 넘는 문법을 쓰면 실제 실행 전에 lint가 먼저 잡는다(최종 판정은 실행).
 *
 * @type {import("eslint").Linter.Config[]}
 */
export default [
  ...baseConfig,
  {
    files: SRC_FILES,
    languageOptions: { globals: { ...globals.node } },
    rules: { "turbo/no-undeclared-env-vars": "off" },
  },
  {
    files: PAGE_FILES,
    languageOptions: {
      globals: { ...globals.browser },
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },
  {
    files: PAGE_FILES,
    ...preset,
    rules: { ...preset.rules, ...rulesAllowedAt(baseline.chromeFloor) },
  },
];
