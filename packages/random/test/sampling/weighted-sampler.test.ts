/**
 * `createWeightedSampler(items, weights)`를 검증한다. 가중치 검증(WT-1~WT-7)의 경계는
 * `internal/weights.test.ts`가 확인하므로 여기서는 생성 시 검증 순서, sampler 격리, word 소비,
 * `weightedChoice`와의 일치성, 관측 비율을 확인한다.
 *
 * 이 파일은 `describe`를 쓰지 않는다(`weighted-sampler.ts`가 mutation 대상, TRP-004).
 */
import { expect, it } from "vitest";
import { createWeightedSampler } from "../../src/sampling/weighted-sampler.js";
import { weightedChoice } from "../../src/sampling/weighted-choice.js";
import { createXoshiro128Source } from "../../src/core/xoshiro128.js";
import { chiSquare, chiSquareCritical } from "../helpers/chi-square.js";

it("생성 시 items가 배열이 아니면 RangeError다", () => {
  expect(() => createWeightedSampler("ab" as never, [1, 1])).toThrow(
    RangeError,
  );
});

it("생성 시 weights가 잘못되면 RangeError다(WT-2, WT-4)", () => {
  expect(() => createWeightedSampler(["a", "b"], [1])).toThrow(RangeError);
  expect(() => createWeightedSampler(["a", "b"], [0, 0])).toThrow(RangeError);
});

it("생성 검증 순서: items -> weights", () => {
  // items가 배열이 아니면 weights가 유효해도 items 오류가 먼저 난다(메시지로 items를 가리킨다).
  expect(() => createWeightedSampler("ab" as never, [1, 1])).toThrow(/items/);
});

it("호출 시 source가 함수가 아니면 RangeError다", () => {
  const sampler = createWeightedSampler(["a", "b"], [1, 1]);
  expect(() => sampler("not a function" as never)).toThrow(RangeError);
});

it("생성 후 원본 items·weights를 바꿔도 sampler 결과가 그대로다", () => {
  const items = ["a", "b"];
  const weights = [0, 1];
  const sampler = createWeightedSampler(items, weights);
  items[1] = "changed";
  weights[0] = 100;
  weights[1] = 0;
  const source = () => 0; // threshold=0
  expect(sampler(source)).toBe("b");
});

it("sampler는 상태가 없다: 다른 sampler 호출이 끼어들어도 같은 word 시퀀스는 같은 결과다", () => {
  const samplerA = createWeightedSampler(["a", "b", "c"], [1, 2, 3]);
  const samplerB = createWeightedSampler(["x", "y"], [1, 1]);
  const wordsA = [10, 20, 30, 40, 50, 60, 70, 80];
  function wordSource(words: number[]): () => number {
    let index = 0;
    return () => words[index++]!;
  }
  const resultsA1 = Array.from({ length: 4 }, () =>
    samplerA(wordSource(wordsA)),
  );
  // samplerB를 여러 번 호출해도 samplerA는 상태를 갖지 않으므로 영향받지 않는다.
  for (let i = 0; i < 10; i += 1) samplerB(() => i);
  const resultsA2 = Array.from({ length: 4 }, () =>
    samplerA(wordSource(wordsA)),
  );
  expect(resultsA2).toEqual(resultsA1);
});

it("word 2개를 소비한다", () => {
  const sampler = createWeightedSampler(["a", "b"], [1, 1]);
  let calls = 0;
  const source = () => {
    calls += 1;
    return 0;
  };
  sampler(source);
  expect(calls).toBe(2);
});

it("weightedChoice와 같은 source 상태에서 같은 원소를 돌려준다(가중치 [1,2,3,4])", () => {
  const items = ["a", "b", "c", "d"];
  const weights = [1, 2, 3, 4];
  const sampler = createWeightedSampler(items, weights);
  const sourceChoice = createXoshiro128Source("weighted-consistency-1");
  const sourceSampler = createXoshiro128Source("weighted-consistency-1");
  for (let i = 0; i < 1000; i += 1) {
    expect(sampler(sourceSampler)).toBe(
      weightedChoice(sourceChoice, items, weights),
    );
  }
});

it("weightedChoice와 같은 source 상태에서 같은 원소를 돌려준다(0 가중치 포함)", () => {
  const items = ["a", "b", "c"];
  const weights = [0, 5, 0];
  const sampler = createWeightedSampler(items, weights);
  const sourceChoice = createXoshiro128Source("weighted-consistency-zero");
  const sourceSampler = createXoshiro128Source("weighted-consistency-zero");
  for (let i = 0; i < 1000; i += 1) {
    expect(sampler(sourceSampler)).toBe(
      weightedChoice(sourceChoice, items, weights),
    );
  }
});

it("weightedChoice와 같은 source 상태에서 같은 원소를 돌려준다(부동소수점 가중치)", () => {
  const items = ["a", "b", "c"];
  const weights = [0.1, 0.2, 0.3];
  const sampler = createWeightedSampler(items, weights);
  const sourceChoice = createXoshiro128Source("weighted-consistency-float");
  const sourceSampler = createXoshiro128Source("weighted-consistency-float");
  for (let i = 0; i < 1000; i += 1) {
    expect(sampler(sourceSampler)).toBe(
      weightedChoice(sourceChoice, items, weights),
    );
  }
});

it("관측 비율이 이론 비율의 허용 오차 안에 든다(가중치 [1, 2, 3, 4])", () => {
  const items = [0, 1, 2, 3];
  const weights = [1, 2, 3, 4];
  const total = 10;
  const trials = 20_000;
  const sampler = createWeightedSampler(items, weights);
  const source = createXoshiro128Source("weighted-sampler-ratio");
  const observed = new Array(items.length).fill(0) as number[];
  for (let i = 0; i < trials; i += 1) {
    const value = sampler(source);
    observed[value] = observed[value]! + 1;
  }
  const expected = weights.map((w) => (trials * w) / total);
  expect(chiSquare(observed, expected)).toBeLessThan(
    chiSquareCritical(items.length - 1),
  );
});
