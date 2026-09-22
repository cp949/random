/**
 * `float(source)`를 검증한다. `[0, 1)` 반개구간을 53-bit 정밀도로 만든다 —
 * `(w1 >>> 5) * 2^26 + (w2 >>> 6)) / 2^53` 조합이며 `internal/uniform-int.ts`의 53비트 경로와
 * 같은 word 조립 방식이다. seed 0의 결과 열은 재현성 계약이라 golden vector로 고정한다.
 * 이 파일은 `describe`를 쓰지 않는다(`internal/uniform-int.test.ts` 참고).
 */
import { expect, it } from "vitest";
import { float } from "../../src/core/float.js";
import { chiSquare, chiSquareCritical } from "../helpers/chi-square.js";
import { createXoshiro128Source } from "../../src/core/xoshiro128.js";

/** 주입한 word를 순서대로 돌려주는 source. */
function wordSource(words: number[]): () => number {
  let index = 0;
  return () => {
    const word = words[index];
    if (word === undefined) throw new Error("주입한 word를 모두 소비했다");
    index += 1;
    return word;
  };
}

it("source가 함수가 아니면 RangeError다", () => {
  expect(() => float("not a function" as never)).toThrow(RangeError);
  expect(() => float("not a function" as never)).toThrow(/source/);
});

it("word 쌍 (0, 0)은 0이다", () => {
  expect(float(wordSource([0, 0]))).toBe(0);
});

it("word 쌍 (0xFFFFFFFF, 0xFFFFFFFF)는 1보다 작은 최댓값이다", () => {
  const value = float(wordSource([0xffffffff, 0xffffffff]));
  expect(value).toBe((2 ** 53 - 1) / 2 ** 53);
  expect(value).toBeLessThan(1);
});

it("첫 word의 하위 5비트는 결과에 영향을 주지 않는다", () => {
  expect(float(wordSource([31, 0]))).toBe(0);
  expect(float(wordSource([32, 0]))).toBe(2 ** -27);
});

it("둘째 word의 하위 6비트는 결과에 영향을 주지 않는다", () => {
  expect(float(wordSource([0, 63]))).toBe(0);
  expect(float(wordSource([0, 64]))).toBe(2 ** -53);
});

it("word 2개를 순서대로 소비한다", () => {
  const source = wordSource([100, 200, 300, 400]);
  float(source);
  expect(float(source)).toBe(((300 >>> 5) * 2 ** 26 + (400 >>> 6)) / 2 ** 53);
});

it("golden vector: seed 0의 첫 2개 float은 계약이다", () => {
  // raw word [421714071, 3306423891, 3703563693, 2338474910]에서 조합한 값(`xoshiro128.test.ts`).
  const source = createXoshiro128Source(0);
  expect([float(source), float(source)]).toEqual([
    0.09818795896944998, 0.8623031194841013,
  ]);
});

it("카이제곱 검정: [0,1)을 10칸으로 나눈 분포가 균등하다", () => {
  const source = createXoshiro128Source("float-chi-square");
  const bins = new Array(10).fill(0) as number[];
  const trials = 20_000;
  for (let i = 0; i < trials; i += 1) {
    const bin = Math.min(9, Math.floor(float(source) * 10));
    bins[bin] = (bins[bin] ?? 0) + 1;
  }
  expect(chiSquare(bins)).toBeLessThan(chiSquareCritical(9));
});
