import {
  assertRandomSource,
  type RandomSource,
} from "../core/random-source.js";
import { assertArray } from "../internal/validate.js";
import { uniformInt } from "../internal/uniform-int.js";

/**
 * `items`에서 균등하게 원소 하나를 뽑는다. `items[uniformInt(source, items.length)]`.
 * 길이 1이면 `source`를 호출하지 않고 `items[0]`을 돌려준다.
 *
 * @throws {RangeError} `source`가 함수가 아닐 때(다른 인자 검증보다 먼저). `items`가 배열이
 * 아니거나 비어 있을 때.
 */
export function choice<T>(source: RandomSource, items: readonly T[]): T {
  assertRandomSource(source);
  assertArray(items, "items");
  if (items.length === 0) {
    throw new RangeError("items must not be empty");
  }
  return items[uniformInt(source, items.length)]!;
}
