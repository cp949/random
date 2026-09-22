/**
 * `validateWeights`(design spec 6절 WT-1~WT-7)와 인덱스 선택 helper(`scanWeightedIndex`,
 * `buildWeightedIndex`, `searchWeightedIndex`)를 검증한다. 두 선택 경로(스캔, 이진 탐색)가
 * 같은 threshold에서 항상 같은 인덱스를 돌려준다는 것(FN-7의 일치성 근거)을 직접 확인한다.
 *
 * 이 파일은 `describe`를 쓰지 않는다(`weights.ts`가 mutation 대상, TRP-004).
 */
import { expect, it } from "vitest";
import {
  buildWeightedIndex,
  scanWeightedIndex,
  searchWeightedIndex,
  validateWeights,
} from "../../src/internal/weights.js";

it("WT-1: weights가 배열이 아니면 RangeError다", () => {
  for (const invalid of ["abc", { length: 2 }, null, undefined, 5]) {
    expect(() => validateWeights(invalid, 2)).toThrow(/weights/);
  }
});

it("WT-2: weights.length가 expectedLength와 다르면 RangeError다", () => {
  expect(() => validateWeights([1], 2)).toThrow(/weights.length/);
  expect(() => validateWeights([1, 2, 3], 2)).toThrow(/weights.length/);
});

it("WT-3: 유한하지 않거나 음수인 원소는 RangeError다", () => {
  expect(() => validateWeights([1, Number.NaN], 2)).toThrow(/0 or greater/);
  expect(() => validateWeights([1, Number.POSITIVE_INFINITY], 2)).toThrow(
    /0 or greater/,
  );
  expect(() => validateWeights([5, -1], 2)).toThrow(/0 or greater/);
  expect(() => validateWeights([1, true], 2)).toThrow(/0 or greater/);
  expect(() => validateWeights([1, "2"], 2)).toThrow(/0 or greater/);
});

it("WT-4: 누적 중 Infinity로 넘치면 RangeError다", () => {
  expect(() =>
    validateWeights([Number.MAX_VALUE, Number.MAX_VALUE], 2),
  ).toThrow(/overflow/);
});

it("WT-4: 합계가 0이면 RangeError다(빈 배열, 전부 0 포함)", () => {
  expect(() => validateWeights([], 0)).toThrow(/greater than 0/);
  expect(() => validateWeights([0, 0, 0], 3)).toThrow(/greater than 0/);
});

it("WT-5·WT-6: 0 가중치는 허용되고 정규화하지 않은 합계를 그대로 돌려준다", () => {
  expect(validateWeights([0, 1, 2], 3)).toBe(3);
  expect(validateWeights([1, 2, 3, 4], 4)).toBe(10);
});

it("-0은 0으로 취급되어 통과한다", () => {
  expect(validateWeights([-0, 1], 2)).toBe(1);
});

it("scanWeightedIndex: threshold < cumulative[i]인 첫 인덱스를 돌려준다", () => {
  // weights=[1,2,3,4], cumulative=[1,3,6,10]
  const weights = [1, 2, 3, 4];
  expect(scanWeightedIndex(weights, 0)).toBe(0);
  expect(scanWeightedIndex(weights, 0.999)).toBe(0);
  expect(scanWeightedIndex(weights, 1)).toBe(1);
  expect(scanWeightedIndex(weights, 2.999)).toBe(1);
  expect(scanWeightedIndex(weights, 3)).toBe(2);
  expect(scanWeightedIndex(weights, 5.999)).toBe(2);
  expect(scanWeightedIndex(weights, 6)).toBe(3);
  expect(scanWeightedIndex(weights, 9.999)).toBe(3);
});

it("scanWeightedIndex: 0 가중치 원소는 뽑히지 않는다(cumulative가 그대로라 조건을 못 만족)", () => {
  // weights=[0, 0, 5], cumulative=[0, 0, 5]
  expect(scanWeightedIndex([0, 0, 5], 0)).toBe(2);
});

it("scanWeightedIndex: fallback은 가중치가 양수인 마지막 인덱스다", () => {
  // threshold가 total과 같으면(부동소수점 반올림 상황을 인위로 재현) 끝까지 조건을 못 만족한다.
  expect(scanWeightedIndex([1, 2], 3)).toBe(1);
  expect(scanWeightedIndex([1, 0], 1)).toBe(0);
});

it("빈 배열은 lastPositive 초기값 -1이 그대로 남는다(내부 helper 계약, validateWeights가 실사용에서는 빈 배열을 막는다)", () => {
  expect(scanWeightedIndex([], 0)).toBe(-1);
  expect(buildWeightedIndex([]).lastPositive).toBe(-1);
});

it("buildWeightedIndex: 누적합 배열과 마지막 양수 인덱스를 만든다", () => {
  expect(buildWeightedIndex([1, 2, 3])).toEqual({
    cumulative: [1, 3, 6],
    lastPositive: 2,
  });
  expect(buildWeightedIndex([0, 5, 0])).toEqual({
    cumulative: [0, 5, 5],
    lastPositive: 1,
  });
});

it("searchWeightedIndex는 scanWeightedIndex와 항상 같은 인덱스를 돌려준다", () => {
  const cases: readonly (readonly number[])[] = [
    [1, 2, 3, 4],
    [0, 1, 2],
    [0, 0, 5],
    [1, 0],
    [5],
  ];
  for (const weights of cases) {
    const index = buildWeightedIndex(weights);
    const total = weights.reduce((sum, w) => sum + w, 0);
    // 경계값(각 누적합 직전·직후)과 0, total(부동소수점 반올림 상황)을 모두 비교한다.
    const thresholds = [0, total];
    let cumulative = 0;
    for (const weight of weights) {
      cumulative += weight;
      thresholds.push(cumulative - 0.001, cumulative);
    }
    for (const threshold of thresholds) {
      expect(searchWeightedIndex(index, threshold)).toBe(
        scanWeightedIndex(weights, threshold),
      );
    }
  }
});
