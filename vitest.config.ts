import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 루트 `pnpm test` 한 번으로 라이브러리 단위 테스트와 게이트 자체 테스트를 함께 실행한다.
    projects: ["packages/random", "packages/legacy-browser-smoke", "scripts"],
  },
});
