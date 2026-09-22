/**
 * `shuffle(source, items)`를 검증한다. 산식은 `fisherYatesInPlace`를 snapshot 위에서 쓴다
 * (`shuffle-in-place.test.ts`와 같은 word 시나리오). 여기서는 snapshot 계약(입력 불변, 새 참조)과
 * 경계 정책만 추가로 확인한다.
 *
 * 이 파일은 `describe`를 쓰지 않는다(`shuffle.ts`가 mutation 대상, TRP-004).
 */
import { expect, it } from "vitest";
import { shuffle } from "../../src/sampling/shuffle.js";
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
  expect(() => shuffle("not a function" as never, [1, 2, 3])).toThrow(
    RangeError,
  );
});

it("items가 배열이 아니면 RangeError다", () => {
  const source = wordSource([0]);
  for (const invalid of ["abc", new Uint8Array(3), { length: 3 }, null]) {
    expect(() => shuffle(source, invalid as never)).toThrow(/items/);
  }
});

it("인자 검증에 실패하면 source를 호출하지 않는다", () => {
  let calls = 0;
  const source = () => {
    calls += 1;
    return 0;
  };
  expect(() => shuffle(source, "abc" as never)).toThrow(RangeError);
  expect(calls).toBe(0);
});

it("빈 배열은 새 []를 돌려준다(오류 아님). word 소비 0", () => {
  const items: number[] = [];
  const result = shuffle(wordSource([]), items);
  expect(result).toEqual([]);
  expect(result).not.toBe(items);
});

it("입력을 바꾸지 않고 새 참조를 돌려준다", () => {
  const items = [0, 1, 2, 3];
  const original = [...items];
  const result = shuffle(wordSource([2, 0, 1]), items);
  expect(items).toEqual(original);
  expect(result).not.toBe(items);
});

it("word 주입: n=4에 [2, 0, 1]을 주입하면 [3, 1, 0, 2]다(shuffleInPlace와 같은 산식)", () => {
  expect(shuffle(wordSource([2, 0, 1]), [0, 1, 2, 3])).toEqual([3, 1, 0, 2]);
});

it("원소를 보존한다: 정렬본이 입력의 정렬본과 같다", () => {
  const source = createXoshiro128Source("shuffle-preserve");
  const items = [1, 1, 2, 5, 8];
  const result = shuffle(source, items);
  expect([...result].sort()).toEqual([...items].sort());
});

it("위치별 균등성이 카이제곱 검정을 통과한다", () => {
  const source = createXoshiro128Source("shuffle-position-frequency");
  const n = 8;
  const matrix = positionFrequencyMatrix(
    () => shuffle(source, [0, 1, 2, 3, 4, 5, 6, 7]),
    n,
    20_000,
  );
  expect(allPositionsUniform(matrix, n)).toBe(true);
});
