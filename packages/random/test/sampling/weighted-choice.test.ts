/**
 * `weightedChoice(source, items, weights)`를 검증한다. 가중치 검증(WT-1~WT-7)의 경계는
 * `internal/weights.test.ts`가 확인하므로 여기서는 검증 순서, 8.3 경계 정책, word 소비,
 * 관측 비율을 확인한다. sampler와의 일치성은 `weighted-sampler.test.ts`에 있다.
 *
 * 이 파일은 `describe`를 쓰지 않는다(`weighted-choice.ts`가 mutation 대상, TRP-004).
 */
import { expect, it } from "vitest";
import { weightedChoice } from "../../src/sampling/weighted-choice.js";
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
  expect(() =>
    weightedChoice("not a function" as never, ["a", "b"], [1, 1]),
  ).toThrow(RangeError);
});

it("items가 배열이 아니면 RangeError다", () => {
  const source = wordSource([0, 0]);
  expect(() => weightedChoice(source, "ab" as never, [1, 1])).toThrow(/items/);
});

it("source 검증이 items 검증보다 먼저다", () => {
  expect(() =>
    weightedChoice("not a function" as never, "not an array" as never, [1, 1]),
  ).toThrow(/source/);
});

it("빈 배열과 총합 0은 RangeError다(WT-4)", () => {
  const source = wordSource([0, 0]);
  expect(() => weightedChoice(source, [], [])).toThrow(RangeError);
  expect(() => weightedChoice(source, ["a", "b"], [0, 0])).toThrow(RangeError);
});

it("weights.length가 items.length와 다르면 RangeError다(WT-2)", () => {
  const source = wordSource([0, 0]);
  expect(() => weightedChoice(source, ["a", "b"], [1])).toThrow(RangeError);
});

it("음수·NaN·Infinity 가중치는 RangeError다(WT-3)", () => {
  const source = wordSource([0, 0]);
  expect(() => weightedChoice(source, ["a", "b"], [1, -1])).toThrow(RangeError);
  expect(() => weightedChoice(source, ["a", "b"], [1, Number.NaN])).toThrow(
    RangeError,
  );
  expect(() =>
    weightedChoice(source, ["a", "b"], [1, Number.POSITIVE_INFINITY]),
  ).toThrow(RangeError);
});

it("가중치 합이 Infinity로 넘치면 RangeError다(WT-4)", () => {
  const source = wordSource([0, 0]);
  expect(() =>
    weightedChoice(source, ["a", "b"], [Number.MAX_VALUE, Number.MAX_VALUE]),
  ).toThrow(RangeError);
});

it("검증 순서: source -> items -> weights -> source 호출. 실패하면 source를 호출하지 않는다", () => {
  let calls = 0;
  const source = () => {
    calls += 1;
    return 0;
  };
  expect(() => weightedChoice(source, "ab" as never, [1, 1])).toThrow(
    RangeError,
  );
  expect(() => weightedChoice(source, ["a", "b"], [1])).toThrow(RangeError);
  expect(calls).toBe(0);
});

it("가중치가 [0, 1]이면 항상 마지막 원소를 돌려주고 word 2개를 소비한다", () => {
  let calls = 0;
  const source = () => {
    calls += 1;
    return 0; // float(source)는 항상 0에 가까운 값 -> threshold=0
  };
  expect(weightedChoice(source, ["a", "b"], [0, 1])).toBe("b");
  expect(calls).toBe(2);
});

it("양수 가중치가 하나뿐이면 항상 그 원소다", () => {
  const source = createXoshiro128Source("weighted-choice-single-positive");
  for (let i = 0; i < 20; i += 1) {
    expect(weightedChoice(source, ["a", "b", "c"], [0, 5, 0])).toBe("b");
  }
});

it("관측 비율이 이론 비율의 허용 오차 안에 든다(가중치 [1, 2, 3, 4])", () => {
  const source = createXoshiro128Source("weighted-choice-ratio");
  const weights = [1, 2, 3, 4];
  const total = 10;
  const trials = 20_000;
  const items = [0, 1, 2, 3];
  const observed = new Array(items.length).fill(0) as number[];
  for (let i = 0; i < trials; i += 1) {
    const value = weightedChoice(source, items, weights);
    observed[value] = observed[value]! + 1;
  }
  const expected = weights.map((w) => (trials * w) / total);
  expect(chiSquare(observed, expected)).toBeLessThan(
    chiSquareCritical(items.length - 1),
  );
});
