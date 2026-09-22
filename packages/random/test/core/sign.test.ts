/**
 * `sign(source)`를 검증한다. `bool(source) ? 1 : -1`이며 `bool`과 같이 최상위 비트를 본다.
 * seed 0의 결과 열은 재현성 계약이라 golden vector로 고정한다.
 * 이 파일은 `describe`를 쓰지 않는다(`internal/uniform-int.test.ts` 참고).
 */
import { expect, it } from "vitest";
import { sign } from "../../src/core/sign.js";
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

it("source가 함수가 아니면 RangeError다", () => {
  expect(() => sign("not a function" as never)).toThrow(RangeError);
  expect(() => sign("not a function" as never)).toThrow(/source/);
});

it("최상위 비트가 0이면 -1이다", () => {
  expect(sign(wordSource([0]))).toBe(-1);
  expect(sign(wordSource([0x7fffffff]))).toBe(-1);
});

it("최상위 비트가 1이면 1이다", () => {
  expect(sign(wordSource([0x80000000]))).toBe(1);
  expect(sign(wordSource([0xffffffff]))).toBe(1);
});

it("word를 1회만 소비한다", () => {
  const source = wordSource([0x80000000, 999]);
  sign(source);
  expect(source()).toBe(999);
});

it("golden vector: seed 0의 첫 5개 sign은 계약이다", () => {
  const source = createXoshiro128Source(0);
  expect(Array.from({ length: 5 }, () => sign(source))).toEqual([
    -1, 1, 1, 1, -1,
  ]);
});

it("카이제곱 검정: 1/-1 빈도가 균등하다", () => {
  const source = createXoshiro128Source("sign-chi-square");
  let positive = 0;
  let negative = 0;
  for (let i = 0; i < 20_000; i += 1) {
    if (sign(source) === 1) positive += 1;
    else negative += 1;
  }
  expect(chiSquare([positive, negative])).toBeLessThan(chiSquareCritical(1));
});
