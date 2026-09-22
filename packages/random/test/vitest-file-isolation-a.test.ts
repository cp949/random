import { expect, it } from "vitest";

// 테스트 파일이 서로 격리된 컨텍스트에서 실행되는지 확인하는 한 쌍의 파일(a, b)이다.
// 각 파일은 자기 표식만 심고 상대 표식이 보이면 격리가 깨진 것이다.
Reflect.set(globalThis, "isolationMarkerA", true);

it("다른 테스트 파일이 남긴 전역 표식이 보이지 않는다", () => {
  expect(Reflect.get(globalThis, "isolationMarkerB")).toBeUndefined();
});
