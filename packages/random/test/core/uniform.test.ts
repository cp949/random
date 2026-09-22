/**
 * `uniform(source, min, max)`를 검증한다. `[min, max)` 반개구간이며 `min + float(source) * (max - min)`을
 * 계산한 뒤 결과가 `max` 이상이면 `max` 미만의 가장 큰 double로 보정한다. `min`/`max` 검증은
 * `internal/validate.ts`의 `assertFiniteRange`를 그대로 쓴다(그 함수 자체의 테스트는
 * `internal/validate.test.ts`가 한다). 이 파일은 `describe`를 쓰지 않는다(`internal/uniform-int.test.ts` 참고).
 */
import { expect, it } from "vitest";
import { uniform } from "../../src/core/uniform.js";
import { chiSquare, chiSquareCritical } from "../helpers/chi-square.js";
import { createXoshiro128Source } from "../../src/core/xoshiro128.js";

function wordSource(words: number[]): () => number {
  let index = 0;
  return () => {
    const word = words[index];
    if (word === undefined) throw new Error("주입한 word를 모두 소비했다");
    index += 1;
    return word;
  };
}

/** `float`이 최댓값 `1 - 2^-53`을 내는 word 쌍. */
const ALL_ONES = [0xffffffff, 0xffffffff];

it("source가 함수가 아니면 RangeError다", () => {
  expect(() => uniform("not a function" as never, 0, 1)).toThrow(RangeError);
  expect(() => uniform("not a function" as never, 0, 1)).toThrow(/source/);
});

it("source 검증이 min/max 검증보다 먼저다", () => {
  // min > max로 min/max도 위반이지만, source 위반 메시지가 나와야 순서가 맞다.
  // `float`도 source를 검증하므로 이 순서 보장이 `uniform` 자체 검증의 존재 이유다.
  expect(() => uniform("not a function" as never, 1, 0)).toThrow(/source/);
});

it("min > max는 RangeError다", () => {
  expect(() => uniform(wordSource([0, 0]), 1, 0)).toThrow(RangeError);
});

it("min === max는 빈 반개구간이라 RangeError다", () => {
  expect(() => uniform(wordSource([0, 0]), 5, 5)).toThrow(RangeError);
});

it("NaN·Infinity는 RangeError다", () => {
  expect(() => uniform(wordSource([0, 0]), Number.NaN, 1)).toThrow(RangeError);
  expect(() =>
    uniform(wordSource([0, 0]), 0, Number.POSITIVE_INFINITY),
  ).toThrow(RangeError);
});

it("max - min이 Infinity로 넘치면 RangeError다", () => {
  expect(() =>
    uniform(wordSource([0, 0]), -Number.MAX_VALUE, Number.MAX_VALUE),
  ).toThrow(RangeError);
});

it("인자 검증에 실패하면 source를 호출하지 않는다", () => {
  let calls = 0;
  const source = () => {
    calls += 1;
    return 0;
  };
  expect(() => uniform(source, 1, 0)).toThrow(RangeError);
  expect(() => uniform(source, 0, Number.NaN)).toThrow(RangeError);
  expect(calls).toBe(0);
});

it("word 쌍 (0, 0)은 min을 돌려준다", () => {
  expect(uniform(wordSource([0, 0]), 10, 20)).toBe(10);
});

it("[0, 1)에서 all-ones는 float의 최댓값이며 1보다 작다", () => {
  const value = uniform(wordSource(ALL_ONES), 0, 1);
  expect(value).toBe((2 ** 53 - 1) / 2 ** 53);
  expect(value).toBeLessThan(1);
});

it("[10, 20)에서 all-ones는 산식이 max로 반올림되므로 max 미만의 가장 큰 double로 보정한다", () => {
  // 10 + (1 - 2^-53) * 10 = 20 - 10 * 2^-53. 20 아래 double 간격은 2^-48이라 20으로 반올림된다.
  expect(10 + ((2 ** 53 - 1) / 2 ** 53) * 10).toBe(20);
  const value = uniform(wordSource(ALL_ONES), 10, 20);
  expect(value).toBe(20 - 2 ** -48);
  expect(value).toBeLessThan(20);
});

it("인접한 두 double 구간 [1, 1 + 2^-52)에서 all-ones는 min을 돌려준다", () => {
  expect(uniform(wordSource(ALL_ONES), 1, 1 + 2 ** -52)).toBe(1);
});

it("음수 max에서도 보정은 max 미만(더 작은 값) 방향이다", () => {
  // -17 + (1 - 2^-53) * 7 = -10 - 7 * 2^-53. -10 아래 double 간격은 2^-49라 -10으로 반올림된다.
  expect(-17 + ((2 ** 53 - 1) / 2 ** 53) * 7).toBe(-10);
  const value = uniform(wordSource(ALL_ONES), -17, -10);
  expect(value).toBe(-10 - 2 ** -49);
  expect(value).toBeLessThan(-10);
});

it("음수 max의 하위 32비트가 모두 1이면 상위 word로 올림해 보정한다", () => {
  // max = -(1.5 - 2^-52)의 비트 패턴은 0xBFF7FFFFFFFFFFFF. 다음 아래 double은 -1.5다.
  const min = -(2 - 2 ** -52);
  const max = -(1.5 - 2 ** -52);
  expect(min + ((2 ** 53 - 1) / 2 ** 53) * (max - min)).toBe(max);
  expect(uniform(wordSource(ALL_ONES), min, max)).toBe(-1.5);
});

it("max가 0이면 보정값은 -Number.MIN_VALUE다", () => {
  // subnormal 산술로 -MIN_VALUE + (1 - 2^-53) * MIN_VALUE가 0으로 반올림되는 경우다.
  const value = uniform(wordSource(ALL_ONES), -Number.MIN_VALUE, 0);
  expect(value).toBe(-Number.MIN_VALUE);
  expect(value).toBeLessThan(0);
});

it("보정이 필요 없는 all-ones 결과는 산식 그대로다", () => {
  expect(uniform(wordSource(ALL_ONES), -1, 0)).toBe(-(2 ** -53));
});

it("word 2개를 소비한다", () => {
  const source = wordSource([0, 0, 999]);
  uniform(source, 0, 1);
  expect(source()).toBe(999);
});

it("min/max에 실수를 허용한다", () => {
  const value = uniform(wordSource([12345, 67890]), -1.5, 2.5);
  expect(value).toBeGreaterThanOrEqual(-1.5);
  expect(value).toBeLessThan(2.5);
});

it("카이제곱 검정: [0,10)을 10칸으로 나눈 분포가 균등하다", () => {
  const source = createXoshiro128Source("uniform-chi-square");
  const bins = new Array(10).fill(0) as number[];
  const trials = 20_000;
  for (let i = 0; i < trials; i += 1) {
    const bin = Math.min(9, Math.floor(uniform(source, 0, 10)));
    bins[bin] = (bins[bin] ?? 0) + 1;
  }
  expect(chiSquare(bins)).toBeLessThan(chiSquareCritical(9));
});
