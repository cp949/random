import { createRandomState, type RandomState } from "./random-state.js";

/**
 * module-level 상태 facade. `createRandomState()`(seed 없는 상태) 하나이며 모듈 인스턴스당 하나다
 * (같은 모듈 그래프의 import끼리 상태를 공유하고 Worker·realm마다 별개). 첫 word 호출에서 crypto로
 * 초기화하고 import 시점에는 crypto에 접근하지 않는다. 보안 용도가 아니며 token과 ID에는 `./secure`,
 * `./id`를 쓴다. 재seed할 수 없다. 별도 파일에 두고 `@__PURE__`로 표시해 `createRandomState`만 import한
 * 번들에서 제거된다.
 */
export const rand: RandomState = /* @__PURE__ */ createRandomState();
