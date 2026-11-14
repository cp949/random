import { defineConfig } from "oxlint";
import esX from "eslint-plugin-es-x";
import { createNodeConfig } from "@repo/oxlint-config/node";
import { loadBaseline } from "../../scripts/baseline.mjs";
import { presetName, rulesAllowedAt } from "../../scripts/escompat-rules.mjs";

const baseline = loadBaseline();
const preset = esX.configs[presetName(baseline.esTarget)];
if (!preset) {
  throw new Error(
    `es-x에 프리셋 ${presetName(baseline.esTarget)}이 없다(escompat-rules.mjs와 불일치)`,
  );
}

const node = createNodeConfig();

/**
 * runner·서버·컨테이너 entry(`src/**`, `test/**`)는 Node 환경, smoke 페이지(`page/**`)와
 * Worker 진입 스크립트(`worker/**`)는 브라우저 환경 + Chrome 75(`baseline.json`의 chromeFloor) 문법 제한을 적용한다.
 * 페이지가 floor를 넘는 문법을 쓰면 실제 실행 전에 lint가 먼저 잡는다(최종 판정은 실행).
 */
export default defineConfig({
  ...node,
  // Node 전역은 src·test에만 허용하고 page에는 브라우저 전역을 준다.
  env: { builtin: true },
  overrides: [
    {
      files: ["src/**/*.{js,mjs}", "test/**/*.{js,mjs}"],
      env: { node: true },
    },
    {
      files: ["page/**/*.{js,mjs}", "worker/**/*.{js,mjs}"],
      env: { browser: true },
      jsPlugins: ["eslint-plugin-es-x"],
      rules: { ...preset.rules, ...rulesAllowedAt(baseline.chromeFloor) },
    },
  ],
});
