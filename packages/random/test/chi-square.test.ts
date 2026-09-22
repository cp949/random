/**
 * 테스트 헬퍼 `chiSquare`와 `chiSquareCritical`을 검증한다.
 * 통계 테스트는 통계량을 임계값과 비교해 균등성을 판정하므로, 통계량 계산이나 임계값 표가 틀리면
 * 편향된 구현도 통과하거나 정상 구현이 실패한다.
 */
import { describe, expect, it } from "vitest";
import { chiSquare, chiSquareCritical } from "./helpers/chi-square.js";
import { seededBytes } from "./helpers/seeded-bytes.js";

describe("chiSquare", () => {
  it("모든 칸이 같으면 통계량은 0이다", () => {
    expect(chiSquare([10, 10, 10, 10])).toBe(0);
  });

  it("기대 빈도를 생략하면 합계를 칸 수로 나눈 균등 분포를 기대한다", () => {
    // 합계 60, 기대 20씩: (0 + 100 + 100) / 20
    expect(chiSquare([20, 10, 30])).toBeCloseTo(10, 12);
  });

  it("주사위 예시의 통계량을 손으로 계산한 값과 같게 돌려준다", () => {
    // 기대 10씩: (25 + 4 + 1 + 4 + 0 + 100) / 10
    expect(chiSquare([5, 8, 9, 8, 10, 20])).toBeCloseTo(13.4, 12);
  });

  it("기대 빈도를 지정하면 칸마다 그 기대로 계산한다", () => {
    expect(chiSquare([18, 22], [20, 20])).toBeCloseTo(0.4, 12);
    // 기대가 서로 다르다: 25 / 25 + 25 / 75
    expect(chiSquare([30, 70], [25, 75])).toBeCloseTo(4 / 3, 12);
  });

  it("균등 기대를 명시한 결과와 생략한 결과가 같다", () => {
    const observed = [7, 12, 9, 13, 4];

    expect(chiSquare(observed, [9, 9, 9, 9, 9])).toBeCloseTo(
      chiSquare(observed),
      12,
    );
  });

  it("칸 순서를 바꿔도 통계량이 같다", () => {
    expect(chiSquare([1, 5, 9, 2])).toBeCloseTo(chiSquare([9, 2, 1, 5]), 12);
  });

  it("입력 배열을 바꾸지 않는다", () => {
    const observed = [3, 9, 6];
    const expected = [6, 6, 6];

    chiSquare(observed, expected);

    expect(observed).toEqual([3, 9, 6]);
    expect(expected).toEqual([6, 6, 6]);
  });

  it("칸이 2개인 최소 입력도 계산한다", () => {
    expect(chiSquare([4, 6])).toBeCloseTo(0.4, 12);
  });

  it("칸이 2개 미만이면 RangeError로 거부한다", () => {
    expect(() => chiSquare([])).toThrow(RangeError);
    expect(() => chiSquare([5])).toThrow(RangeError);
  });

  it("기대 빈도의 칸 수가 관측과 다르면 RangeError로 거부한다", () => {
    expect(() => chiSquare([5, 5, 5], [7, 8])).toThrow(RangeError);
    expect(() => chiSquare([5, 5], [5, 5, 5])).toThrow(RangeError);
  });

  it("기대 빈도가 0 이하이거나 유한하지 않으면 RangeError로 거부한다", () => {
    expect(() => chiSquare([5, 5], [10, 0])).toThrow(RangeError);
    expect(() => chiSquare([5, 5], [11, -1])).toThrow(RangeError);
    expect(() => chiSquare([5, 5], [Number.NaN, 10])).toThrow(RangeError);
    expect(() => chiSquare([5, 5], [Number.POSITIVE_INFINITY, 10])).toThrow(
      RangeError,
    );
  });

  it("관측 빈도가 음수이거나 유한하지 않으면 RangeError로 거부한다", () => {
    expect(() => chiSquare([-1, 11])).toThrow(RangeError);
    expect(() => chiSquare([Number.NaN, 5])).toThrow(RangeError);
    expect(() => chiSquare([Number.POSITIVE_INFINITY, 5])).toThrow(RangeError);
  });

  it("관측이 모두 0이라 균등 기대가 0이면 RangeError로 거부한다", () => {
    // 표본이 하나도 없는 통계량을 0으로 돌려주면 통계 테스트가 아무것도 검증하지 못하고 통과한다.
    expect(() => chiSquare([0, 0, 0])).toThrow(RangeError);
  });

  it("관측과 기대의 합계가 다르면 RangeError로 거부한다", () => {
    // 기대를 확률(합 1)로 넘기는 실수를 막는다.
    expect(() => chiSquare([10, 10], [0.5, 0.5])).toThrow(RangeError);
    expect(() => chiSquare([10, 10], [5, 5])).toThrow(RangeError);
  });

  it("부동소수점 오차 수준의 합계 차이는 허용한다", () => {
    const expected = [0.1 * 30, 0.2 * 30, 0.7 * 30];

    expect(() => chiSquare([3, 6, 21], expected)).not.toThrow();
  });

  it("고정 seed의 균등 바이트는 자유도 255의 임계값을 넘지 않는다", () => {
    const counts = new Array<number>(256).fill(0);
    for (const value of seededBytes(1)(256 * 256)) {
      counts[value] = (counts[value] ?? 0) + 1;
    }

    expect(chiSquare(counts)).toBeLessThan(chiSquareCritical(255));
  });

  it("modulo 편향이 있는 분포는 임계값을 크게 넘는다", () => {
    // 0~255를 200개 칸에 % 200으로 나눈 뒤 100번 반복한 빈도다. 앞 56칸이 두 배로 나온다.
    const counts = Array.from({ length: 200 }, (_, i) => (i < 56 ? 200 : 100));

    // 기대 128씩: 56 * (72² / 128) + 144 * (28² / 128) = 3150
    expect(chiSquare(counts)).toBeCloseTo(3150, 9);
    expect(chiSquare(counts)).toBeGreaterThan(chiSquareCritical(199) * 5);
  });
});

/** 표준 카이제곱 분포표의 상위 꼬리 확률 0.001 값. 자유도 → 임계값. */
const publishedCriticalValues: [df: number, value: number][] = [
  [1, 10.828],
  [2, 13.816],
  [3, 16.266],
  [4, 18.467],
  [5, 20.515],
  [9, 27.877],
  [10, 29.588],
  [15, 37.697],
  [20, 45.315],
  [30, 59.703],
  [40, 73.402],
  [50, 86.661],
  [60, 99.607],
  [100, 149.449],
];

describe("chiSquareCritical", () => {
  for (const [df, value] of publishedCriticalValues) {
    it(`자유도 ${df}의 임계값(p=0.001)은 표준 분포표의 ${value}이다`, () => {
      expect(chiSquareCritical(df)).toBe(value);
    });
  }

  it("자유도 61은 약 100.9, 255는 약 330.5이며 기존 문자 빈도 테스트가 쓰는 값과 맞는다", () => {
    expect(chiSquareCritical(61)).toBeCloseTo(100.9, 1);
    expect(chiSquareCritical(255)).toBeCloseTo(330.5, 1);
  });

  it("alphabet 크기 2~256에 해당하는 자유도 1~255를 모두 덮는다", () => {
    for (let df = 1; df <= 255; df += 1) {
      expect(Number.isFinite(chiSquareCritical(df))).toBe(true);
    }
  });

  it("자유도가 늘수록 임계값이 엄격하게 커진다", () => {
    for (let df = 1; df < 255; df += 1) {
      expect(chiSquareCritical(df + 1)).toBeGreaterThan(chiSquareCritical(df));
    }
  });

  it("자유도 10 이상에서는 Wilson-Hilferty 근사와 0.7% 안에서 맞는다", () => {
    // 표 값 하나가 잘못 옮겨졌는지 표와 독립된 식으로 점검한다. z는 표준정규분포의 상위 꼬리 0.001 값이다.
    const z = 3.0902323061678132;
    for (let df = 10; df <= 255; df += 1) {
      const k = 2 / (9 * df);
      const approximation = df * (1 - k + z * Math.sqrt(k)) ** 3;

      expect(
        Math.abs(approximation - chiSquareCritical(df)) / chiSquareCritical(df),
      ).toBeLessThan(0.007);
    }
  });

  it("표에 없는 자유도는 RangeError로 거부한다", () => {
    for (const df of [0, -1, 256, 1000, 1.5, Number.NaN]) {
      expect(() => chiSquareCritical(df)).toThrow(RangeError);
    }
  });
});
