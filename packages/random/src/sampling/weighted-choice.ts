import {
  assertRandomSource,
  type RandomSource,
} from "../core/random-source.js";
import { float } from "../core/float.js";
import { assertArray } from "../internal/validate.js";
import { scanWeightedIndex, validateWeights } from "../internal/weights.js";

/**
 * 가중치로 원소 하나를 뽑는다. 원소 `i`가 뽑힐 확률은 `weights[i] / total`이다(6절 가중치 규칙).
 * `threshold = float(source) * total`을 계산하고 왼쪽에서 오른쪽으로 누적합을 더하며
 * `threshold < cumulative[i]`인 첫 `i`의 `items[i]`를 돌려준다. 0 가중치 원소는 뽑히지 않는다.
 * word 2개(`float` 1회)를 소비한다.
 *
 * @throws {RangeError} `source`가 함수가 아닐 때(다른 인자 검증보다 먼저). `items`가 배열이
 * 아닐 때. `weights`가 배열이 아니거나 `items`와 길이가 다르거나 유한한 0 이상의 수가 아니거나
 * 합계가 `Infinity`로 넘치거나 `0`일 때(6절 WT-1~WT-7).
 */
export function weightedChoice<T>(
  source: RandomSource,
  items: readonly T[],
  weights: readonly number[],
): T {
  assertRandomSource(source);
  assertArray(items, "items");
  const total = validateWeights(weights, items.length);

  const threshold = float(source) * total;
  const index = scanWeightedIndex(weights, threshold);
  return items[index]!;
}
