import { vi } from "vitest";

/**
 * `Date.now`와 `performance.now`를 호출되면 예외를 던지는 함수로 바꾼다. 테스트가 끝나면 vitest 설정(`restoreMocks`)이 복원한다.
 * 시계를 쓰지 않는 생성기가 호출·`peek`·`reset`에서도 시계를 읽지 않는지 실행 시점에 잡는 방어선이다.
 */
export function trapClock() {
  const fail = (): never => {
    throw new Error("시계가 읽혔다. 이 생성기는 시계를 쓰지 않는다");
  };
  return {
    dateNow: vi.spyOn(Date, "now").mockImplementation(fail),
    performanceNow: vi.spyOn(performance, "now").mockImplementation(fail),
  };
}
