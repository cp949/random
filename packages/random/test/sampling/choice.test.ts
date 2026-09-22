/**
 * `choice(source, items)`를 검증한다. 인덱스 추출은 `internal/uniform-int.ts`의 `uniformInt`를
 * 그대로 거치므로(rejection sampling 경계는 `uniform-int.test.ts`가 검증한다) 여기서는 검증 순서,
 * 경계 정책(design spec 8.3), 균등성만 확인한다.
 *
 * 이 파일은 `describe`를 쓰지 않는다(`choice.ts`가 mutation 대상, TRP-004).
 */
import { expect, it } from "vitest";
import { choice } from "../../src/sampling/choice.js";
import { createXoshiro128Source } from "../../src/core/xoshiro128.js";
import { chiSquare, chiSquareCritical } from "../helpers/chi-square.js";

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
  expect(() => choice("not a function" as never, [1, 2, 3])).toThrow(
    RangeError,
  );
});

it("source 검증이 items 검증보다 먼저다", () => {
  expect(() =>
    choice("not a function" as never, "not an array" as never),
  ).toThrow(/source/);
});

it("items가 배열이 아니면 RangeError다", () => {
  const source = wordSource([0]);
  for (const invalid of [
    "abc",
    new Uint8Array(3),
    { length: 3 },
    null,
    undefined,
  ]) {
    expect(() => choice(source, invalid as never)).toThrow(/items/);
  }
});

it("빈 배열은 RangeError다", () => {
  expect(() => choice(wordSource([]), [])).toThrow(/empty/);
});

it("인자 검증에 실패하면 source를 호출하지 않는다", () => {
  let calls = 0;
  const source = () => {
    calls += 1;
    return 0;
  };
  expect(() => choice(source, [])).toThrow(RangeError);
  expect(calls).toBe(0);
});

it("길이 1이면 word를 소비하지 않고 items[0]을 돌려준다", () => {
  const source = wordSource([]);
  expect(choice(source, ["only"])).toBe("only");
});

it("word 주입: uniformInt(source, n)을 그대로 거친다", () => {
  // n=4는 2^32를 나누므로 거부 없이 word % 4를 쓴다. word=2 -> items[2].
  const source = wordSource([2]);
  expect(choice(source, ["a", "b", "c", "d"])).toBe("c");
});

it("균등성이 카이제곱 검정을 통과한다", () => {
  const source = createXoshiro128Source("choice-chi-square");
  const n = 8;
  const trials = 20_000;
  const items = Array.from({ length: n }, (_, i) => i);
  const observed = new Array(n).fill(0) as number[];
  for (let i = 0; i < trials; i += 1) {
    const value = choice(source, items);
    observed[value] = observed[value]! + 1;
  }
  expect(chiSquare(observed)).toBeLessThan(chiSquareCritical(n - 1));
});
