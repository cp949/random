import { vi } from "vitest";

/**
 * `Math.random`을 호출되면 예외를 던지는 함수로 바꾼다. 테스트가 끝나면 vitest 설정(`restoreMocks`)이 복원한다.
 * lint가 막지 못하는 우회(함수 인자로 넘긴 `Math` 등)도 실행 시점에 잡는 방어선이다.
 */
export function trapMathRandom() {
  return vi.spyOn(Math, "random").mockImplementation(() => {
    throw new Error(
      "Math.random이 호출되었다. 이 패키지는 Math.random을 쓰지 않는다",
    );
  });
}
