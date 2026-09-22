import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "scripts",
    environment: "node",
    include: ["test/**/*.test.mjs"],
    // 전역 stub과 spy를 테스트마다 자동으로 되돌린다(packages/random과 같은 설정).
    unstubGlobals: true,
    restoreMocks: true,
  },
});
