/**
 * `permutation(source, length)`를 검증한다. 산식은 `[0..length-1]`을 만들어 `fisherYatesInPlace`를
 * 적용한다(`shuffle`·`shuffleInPlace`와 같다). 여기서는 `length` 검증과 경계 정책을 확인한다.
 *
 * 이 파일은 `describe`를 쓰지 않는다(`permutation.ts`가 mutation 대상, TRP-004).
 */
import { expect, it } from "vitest";
import { permutation } from "../../src/sampling/permutation.js";
import { createXoshiro128Source } from "../../src/core/xoshiro128.js";
import {
  allPositionsUniform,
  positionFrequencyMatrix,
} from "../helpers/position-frequency.js";

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
  expect(() => permutation("not a function" as never, 4)).toThrow(RangeError);
});

it("source 검증이 length 검증보다 먼저다", () => {
  expect(() => permutation("not a function" as never, -1)).toThrow(/source/);
});

it("음수, 비정수, 2^32를 넘는 length는 RangeError다", () => {
  const source = wordSource([0]);
  expect(() => permutation(source, -1)).toThrow(/length/);
  expect(() => permutation(source, 1.5)).toThrow(/length/);
  expect(() => permutation(source, 2 ** 32)).toThrow(/between/);
});

it("인자 검증에 실패하면 source를 호출하지 않는다", () => {
  let calls = 0;
  const source = () => {
    calls += 1;
    return 0;
  };
  expect(() => permutation(source, -1)).toThrow(RangeError);
  expect(calls).toBe(0);
});

it("length 0이면 []를 돌려주고 word를 소비하지 않는다", () => {
  expect(permutation(wordSource([]), 0)).toEqual([]);
});

it("length 1이면 [0]을 돌려주고 word를 소비하지 않는다", () => {
  expect(permutation(wordSource([]), 1)).toEqual([0]);
});

it("word 주입: length=4에 [2, 0, 1]을 주입하면 [3, 1, 0, 2]다(shuffle과 같은 산식)", () => {
  expect(permutation(wordSource([2, 0, 1]), 4)).toEqual([3, 1, 0, 2]);
});

it("배열 overload가 없다: 두 번째 인자는 항상 length(number)로 해석된다", () => {
  expect(() => permutation(wordSource([0]), [1, 2, 3] as never)).toThrow(
    RangeError,
  );
});

it("위치별 균등성이 카이제곱 검정을 통과한다", () => {
  const source = createXoshiro128Source("permutation-position-frequency");
  const n = 8;
  const matrix = positionFrequencyMatrix(
    () => permutation(source, n),
    n,
    20_000,
  );
  expect(allPositionsUniform(matrix, n)).toBe(true);
});
