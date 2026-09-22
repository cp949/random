/**
 * 샘플링 6개의 non-regression 스냅샷. 결과값은 계약이 아니다(`docs/api/sampling.md` "계약 표").
 * 특정 시점의 결과를 고정해 인덱스 추출·word 소비가 의도치 않게 바뀌는 것을 잡는다. 바꿀 때는
 * CHANGELOG에 기록하고 `vitest -u`로 갱신한다.
 *
 * 이 파일은 `describe`를 쓰지 않는다(TRP-004).
 */
import { expect, it } from "vitest";
import { choice } from "../../src/sampling/choice.js";
import { permutation } from "../../src/sampling/permutation.js";
import { sample } from "../../src/sampling/sample.js";
import { shuffle } from "../../src/sampling/shuffle.js";
import { weightedChoice } from "../../src/sampling/weighted-choice.js";
import { createWeightedSampler } from "../../src/sampling/weighted-sampler.js";
import { createXoshiro128Source } from "../../src/core/xoshiro128.js";

const ITEMS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const WEIGHTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

it("noreg: seed 42의 choice", () => {
  const source = createXoshiro128Source(42);
  expect(choice(source, ITEMS)).toMatchInlineSnapshot(`5`);
});

it("noreg: seed 42의 shuffle", () => {
  const source = createXoshiro128Source(42);
  expect(shuffle(source, ITEMS)).toMatchInlineSnapshot(`
    [
      8,
      4,
      3,
      9,
      7,
      6,
      1,
      2,
      0,
      5,
    ]
  `);
});

it("noreg: seed 42의 sample(k=3)", () => {
  const source = createXoshiro128Source(42);
  expect(sample(source, ITEMS, 3)).toMatchInlineSnapshot(`
    [
      5,
      1,
      4,
    ]
  `);
});

it("noreg: seed 42의 permutation(5)", () => {
  const source = createXoshiro128Source(42);
  expect(permutation(source, 5)).toMatchInlineSnapshot(`
    [
      3,
      1,
      4,
      2,
      0,
    ]
  `);
});

it("noreg: seed 42의 weightedChoice", () => {
  const source = createXoshiro128Source(42);
  expect(weightedChoice(source, ITEMS, WEIGHTS)).toMatchInlineSnapshot(`9`);
});

it("noreg: seed 42의 createWeightedSampler 3회", () => {
  const source = createXoshiro128Source(42);
  const next = createWeightedSampler(ITEMS, WEIGHTS);
  expect([next(source), next(source), next(source)]).toMatchInlineSnapshot(`
    [
      9,
      6,
      6,
    ]
  `);
});
