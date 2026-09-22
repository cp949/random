/**
 * `position-frequency.ts` 자체 테스트. 올바른 Fisher-Yates는 통과시키고, R5 완료 조건의
 * 세 의도적 변형(shuffle 계열 off-by-one, Sattolo류, sample off-by-one)은 검출하는지 확인한다.
 * 변형 구현은 이 파일에만 있고 `src/`에는 두지 않는다.
 */
import { expect, it } from "vitest";
import { createXoshiro128Source } from "../../src/core/xoshiro128.js";
import { uniformInt } from "../../src/internal/uniform-int.js";
import { chiSquare, chiSquareCritical } from "./chi-square.js";
import {
  allPositionsUniform,
  positionFrequencyMatrix,
} from "./position-frequency.js";

const N = 8;
const TRIALS = 20_000;

/** 올바른 뒤에서 앞으로 가는 Fisher-Yates. `[0..n-1]`을 섞어 돌려준다. */
function correctShuffle(source: () => number, n: number): number[] {
  const items = Array.from({ length: n }, (_, i) => i);
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = uniformInt(source, i + 1);
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}

/** 변형 A: 루프를 `i = n - 2`에서 시작한다. 마지막 원소(와 그 자리)가 전혀 이동하지 않는다. */
function offByOneShuffle(source: () => number, n: number): number[] {
  const items = Array.from({ length: n }, (_, i) => i);
  for (let i = items.length - 2; i > 0; i -= 1) {
    const j = uniformInt(source, i + 1);
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}

/** 변형 B: `j = uniformInt(source, i)`(Sattolo류). 원소가 제자리에 남는 경우가 없다. */
function sattoloShuffle(source: () => number, n: number): number[] {
  const items = Array.from({ length: n }, (_, i) => i);
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = uniformInt(source, i);
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}

it("올바른 Fisher-Yates는 모든 위치가 균등성 검정을 통과한다", () => {
  const source = createXoshiro128Source("position-frequency-correct");
  const matrix = positionFrequencyMatrix(
    () => correctShuffle(source, N),
    N,
    TRIALS,
  );
  expect(allPositionsUniform(matrix, N)).toBe(true);
});

it("변형 A(마지막 원소 미이동)는 마지막 위치에서 균등성 검정에 실패한다", () => {
  const source = createXoshiro128Source("position-frequency-off-by-one");
  const matrix = positionFrequencyMatrix(
    () => offByOneShuffle(source, N),
    N,
    TRIALS,
  );
  expect(allPositionsUniform(matrix, N)).toBe(false);
  // 마지막 위치는 초기값(N - 1)에서 전혀 움직이지 않는다.
  expect(matrix[N - 1]![N - 1]).toBe(TRIALS);
});

it("변형 B(Sattolo, 제자리 불허)는 대각선 빈도가 0이라 균등성 검정에 실패한다", () => {
  const source = createXoshiro128Source("position-frequency-sattolo");
  const matrix = positionFrequencyMatrix(
    () => sattoloShuffle(source, N),
    N,
    TRIALS,
  );
  expect(allPositionsUniform(matrix, N)).toBe(false);
  for (let i = 0; i < N; i += 1) {
    expect(matrix[i]![i]).toBe(0);
  }
});

/**
 * 변형 C: `sample`에서 `uniformInt(source, pool.length - i - 1)`(정상은
 * `uniformInt(source, pool.length - i)`). 남은 pool의 마지막 인덱스가 교환 대상에서 항상 빠져
 * 그 자리의 원래 원소가 결코 선택되지 않는다.
 */
function offByOneSample(
  source: () => number,
  items: readonly number[],
  count: number,
): number[] {
  const pool = items.slice();
  for (let i = 0; i < count; i += 1) {
    const j = i + uniformInt(source, pool.length - i - 1);
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }
  pool.length = count;
  return pool;
}

it("변형 C(sample: pool.length - i - 1)는 마지막 원소가 결코 뽑히지 않아 포함 빈도 검정에 실패한다", () => {
  const source = createXoshiro128Source("position-frequency-sample-off-by-one");
  const count = 3;
  const trials = 20_000;
  const items = Array.from({ length: N }, (_, i) => i);

  const inclusionCounts = new Array(N).fill(0) as number[];
  for (let t = 0; t < trials; t += 1) {
    for (const value of offByOneSample(source, items, count)) {
      inclusionCounts[value] = inclusionCounts[value]! + 1;
    }
  }

  expect(inclusionCounts[N - 1]).toBe(0);
  const expectedInclusion = items.map(() => (trials * count) / N);
  expect(chiSquare(inclusionCounts, expectedInclusion)).toBeGreaterThanOrEqual(
    chiSquareCritical(N - 1),
  );
});
