/**
 * `bool(source, p?)`를 검증한다. `p`를 생략하면 source를 1회 호출해 최상위 비트(`word >>> 31`)로 판정하고,
 * `p`를 주면 `float(source) < p`(word 2개)로 판정한다. 두 경로는 서로 다른 추출이다.
 * 최하위 비트를 쓰지 않는 이유: helper는 source를 가리지 않는데 사용자 정의 source(LCG, xoshiro128+ 등)는
 * 하위 비트의 품질이 낮은 경우가 흔하다. `float`도 같은 이유로 하위 비트를 버린다.
 * seed 0의 결과 열은 재현성 계약이라 golden vector로 고정한다(raw word는 `xoshiro128.test.ts`).
 * 이 파일은 `describe`를 쓰지 않는다(`internal/uniform-int.test.ts` 참고).
 */
import { expect, it } from "vitest";
import { bool } from "../../src/core/bool.js";
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

/** 호출 횟수를 세는 source. */
function countingSource(): { source: () => number; calls: () => number } {
  let calls = 0;
  return {
    source: () => {
      calls += 1;
      return 0;
    },
    calls: () => calls,
  };
}

it("source가 함수가 아니면 RangeError다", () => {
  expect(() => bool("not a function" as never)).toThrow(RangeError);
  expect(() => bool("not a function" as never)).toThrow(/source/);
  expect(() => bool("not a function" as never, 0.5)).toThrow(RangeError);
});

it("source 검증이 p 검증보다 먼저다", () => {
  expect(() => bool("not a function" as never, 2)).toThrow(/source/);
});

it("최상위 비트가 0이면 false다", () => {
  expect(bool(wordSource([0]))).toBe(false);
  expect(bool(wordSource([1]))).toBe(false);
  expect(bool(wordSource([0x7fffffff]))).toBe(false);
});

it("최상위 비트가 1이면 true다", () => {
  expect(bool(wordSource([0x80000000]))).toBe(true);
  expect(bool(wordSource([0xfffffffe]))).toBe(true);
  expect(bool(wordSource([0xffffffff]))).toBe(true);
});

it("p를 생략하면 word를 1회만 소비한다", () => {
  const source = wordSource([1, 999]);
  bool(source);
  expect(source()).toBe(999);
});

it("p가 undefined면 생략과 같다(최상위 비트, word 1개)", () => {
  const source = wordSource([0x80000000, 999]);
  expect(bool(source, undefined)).toBe(true);
  expect(source()).toBe(999);
});

const invalidProbabilities: [label: string, value: unknown][] = [
  ["-0.1", -0.1],
  ["1.1", 1.1],
  ["NaN", Number.NaN],
  ["Infinity", Number.POSITIVE_INFINITY],
  ["숫자 문자열", "0.5"],
  ["null", null],
  ["객체", {}],
];
for (const [label, value] of invalidProbabilities) {
  it(`p가 ${label}이면 RangeError다`, () => {
    expect(() => bool(wordSource([0, 0]), value as never)).toThrow(RangeError);
    expect(() => bool(wordSource([0, 0]), value as never)).toThrow(/p/);
  });
}

it("p 검증에 실패하면 source를 호출하지 않는다", () => {
  const { source, calls } = countingSource();
  expect(() => bool(source, 2)).toThrow(RangeError);
  expect(calls()).toBe(0);
});

it("p를 주면 word 2개를 소비한다", () => {
  const source = wordSource([0, 0, 999]);
  bool(source, 0.5);
  expect(source()).toBe(999);
});

it("p = 0이면 float이 0이어도 false다", () => {
  expect(bool(wordSource([0, 0]), 0)).toBe(false);
});

it("p = 1이면 float의 최댓값에서도 true다", () => {
  expect(bool(wordSource([0xffffffff, 0xffffffff]), 1)).toBe(true);
});

it("p = 0.5: float < 0.5, 즉 첫 word의 최상위 비트가 0이면 true다", () => {
  expect(bool(wordSource([0, 0]), 0.5)).toBe(true);
  expect(bool(wordSource([0x7fffffff, 0xffffffff]), 0.5)).toBe(true);
  expect(bool(wordSource([0x80000000, 0]), 0.5)).toBe(false);
});

it("경계: float === p이면 false다(엄격한 미만)", () => {
  // (0, 64)는 float 2^-53이다.
  expect(bool(wordSource([0, 64]), 2 ** -53)).toBe(false);
  expect(bool(wordSource([0, 0]), 2 ** -53)).toBe(true);
});

it("golden vector: seed 0의 첫 5개 bool은 계약이다", () => {
  const source = createXoshiro128Source(0);
  expect(Array.from({ length: 5 }, () => bool(source))).toEqual([
    false,
    true,
    true,
    true,
    false,
  ]);
});

it("golden vector: seed 0에서 bool(source, 0.5)의 첫 2개는 계약이다", () => {
  const source = createXoshiro128Source(0);
  expect([bool(source, 0.5), bool(source, 0.5)]).toEqual([true, false]);
});

it("카이제곱 검정: true/false 빈도가 균등하다", () => {
  const source = createXoshiro128Source("bool-chi-square");
  let trueCount = 0;
  let falseCount = 0;
  for (let i = 0; i < 20_000; i += 1) {
    if (bool(source)) trueCount += 1;
    else falseCount += 1;
  }
  expect(chiSquare([trueCount, falseCount])).toBeLessThan(chiSquareCritical(1));
});

it("카이제곱 검정: p = 0.25의 true 비율이 이론값 안에 든다", () => {
  const source = createXoshiro128Source("bool-p-chi-square");
  const trials = 20_000;
  let trueCount = 0;
  for (let i = 0; i < trials; i += 1) {
    if (bool(source, 0.25)) trueCount += 1;
  }
  const expectedTrue = trials * 0.25;
  const expectedFalse = trials * 0.75;
  const statistic =
    (trueCount - expectedTrue) ** 2 / expectedTrue +
    (trials - trueCount - expectedFalse) ** 2 / expectedFalse;
  expect(statistic).toBeLessThan(chiSquareCritical(1));
});
