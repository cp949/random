import { describe, expect, it } from "vitest";
import { trapMathRandom } from "./helpers/math-random-trap.js";

describe("trapMathRandom", () => {
  const originalRandom = Math.random;

  it("설치 뒤 Math.random을 호출하면 예외를 던진다", () => {
    trapMathRandom();

    expect(() => Math.random()).toThrow(/Math\.random/);
  });

  it("호출 횟수를 spy로 확인할 수 있다", () => {
    const trap = trapMathRandom();
    expect(() => Math.random()).toThrow();

    expect(trap).toHaveBeenCalledTimes(1);
  });

  it("다음 테스트에서 Math.random이 복원된다", () => {
    expect(Math.random).toBe(originalRandom);
    expect(Math.random()).toBeGreaterThanOrEqual(0);
  });
});
