import { defineConfig } from "vite";
import baseline from "../../baseline.json" with { type: "json" };

export default defineConfig({
  build: {
    // 브라우저 하한은 baseline.json의 chromeFloor 한 곳에서만 선언한다. 산출물 문법을 이 버전에 맞춘다.
    target: `chrome${baseline.chromeFloor}`,
  },
});
