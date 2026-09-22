import type { RandomSource } from "../core/random-source.js";
import { float } from "../core/float.js";
import { assertArray } from "../internal/validate.js";
import {
  buildWeightedIndex,
  searchWeightedIndex,
  validateWeights,
} from "../internal/weights.js";

/** `createWeightedSampler`가 돌려주는 함수. 호출마다 `source`를 받아 원소 하나를 돌려준다. */
export type WeightedSampler<T> = (source: RandomSource) => T;

/**
 * `items`와 `weights`를 미리 검증·전처리해 두고 호출마다 `source`만 받는 sampler를 만든다.
 * 생성 시 `items`의 snapshot과 누적합 배열을 만들어 클로저에 보관하므로 이후 원본 `items`·
 * `weights`를 바꿔도 sampler에 영향이 없다. sampler는 상태가 없다(호출 사이의 결과는 독립,
 * 복원 추출).
 *
 * 돌려준 함수는 호출마다 `threshold = float(source) * total`을 계산해 누적합 배열에서
 * `threshold < cumulative[i]`인 최소 `i`를 이진 탐색으로 찾는다. 같은 source 상태에서
 * `weightedChoice(source, items, weights)`와 같은 원소를 돌려준다(같은 임계값 산식, 같은 선택
 * 조건, 같은 fallback). word 2개를 소비한다.
 *
 * @throws {RangeError} 생성 시: `items`가 배열이 아닐 때. `weights`가 배열이 아니거나 `items`와
 * 길이가 다르거나 유한한 0 이상의 수가 아니거나 합계가 `Infinity`로 넘치거나 `0`일 때(6절
 * WT-1~WT-7). 호출 시: `source`가 함수가 아닐 때.
 */
export function createWeightedSampler<T>(
  items: readonly T[],
  weights: readonly number[],
): WeightedSampler<T> {
  assertArray(items, "items");
  const total = validateWeights(weights, items.length);

  const snapshot = items.slice();
  const index = buildWeightedIndex(weights);

  return (source: RandomSource): T => {
    const threshold = float(source) * total;
    return snapshot[searchWeightedIndex(index, threshold)]!;
  };
}
