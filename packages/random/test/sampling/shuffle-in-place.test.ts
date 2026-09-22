/**
 * `shuffleInPlace(source, items)`를 검증한다. 산식(뒤에서 앞으로 가는 Fisher-Yates)은
 * `fisherYatesInPlace`가 가지며 `shuffle`·`permutation`과 공유한다(design spec FN-2).
 * 위치별 균등성은 `position-frequency.ts` helper로, off-by-one mutation 검출은
 * `position-frequency.test.ts`가 이미 확인했으므로 여기서는 정상 구현의 검정 통과만 확인한다.
 *
 * 이 파일은 `describe`를 쓰지 않는다(`shuffle-in-place.ts`가 mutation 대상, TRP-004).
 */
import { expect, it } from "vitest";
import { shuffleInPlace } from "../../src/sampling/shuffle-in-place.js";
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
  expect(() => shuffleInPlace("not a function" as never, [1, 2, 3])).toThrow(
    RangeError,
  );
});

it("items가 배열이 아니면 RangeError다", () => {
  const source = wordSource([0]);
  for (const invalid of ["abc", new Uint8Array(3), { length: 3 }, null]) {
    expect(() => shuffleInPlace(source, invalid as never)).toThrow(/items/);
  }
});

it("인자 검증에 실패하면 source를 호출하지 않는다", () => {
  let calls = 0;
  const source = () => {
    calls += 1;
    return 0;
  };
  expect(() => shuffleInPlace(source, "abc" as never)).toThrow(RangeError);
  expect(calls).toBe(0);
});

it("길이 0·1이면 word를 소비하지 않는다", () => {
  expect(shuffleInPlace(wordSource([]), [])).toEqual([]);
  expect(shuffleInPlace(wordSource([]), [1])).toEqual([1]);
});

it("같은 참조를 돌려주고 제자리에서 바꾼다", () => {
  const items = [0, 1, 2, 3];
  const result = shuffleInPlace(wordSource([2, 0, 1]), items);
  expect(result).toBe(items);
});

it("word 주입: n=4에 [2, 0, 1]을 주입하면 i=3,2,1에서 j=2,0,1이다", () => {
  // i=3,j=2: [0,1,3,2] -> i=2,j=0: [3,1,0,2] -> i=1,j=1(제자리): [3,1,0,2]
  const items = [0, 1, 2, 3];
  expect(shuffleInPlace(wordSource([2, 0, 1]), items)).toEqual([3, 1, 0, 2]);
});

it("위치별 균등성이 카이제곱 검정을 통과한다", () => {
  const source = createXoshiro128Source("shuffle-in-place-position-frequency");
  const n = 8;
  const matrix = positionFrequencyMatrix(
    () => shuffleInPlace(source, [0, 1, 2, 3, 4, 5, 6, 7]),
    n,
    20_000,
  );
  expect(allPositionsUniform(matrix, n)).toBe(true);
});
