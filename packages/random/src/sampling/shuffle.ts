import {
  assertRandomSource,
  type RandomSource,
} from "../core/random-source.js";
import { assertArray } from "../internal/validate.js";
import { fisherYatesInPlace } from "./shuffle-in-place.js";

/**
 * `items`의 snapshot(`slice`)을 만들어 `fisherYatesInPlace`로 섞고 그 snapshot을 돌려준다.
 * 입력은 바뀌지 않는다. 빈 배열은 `[]`를 돌려준다(오류 아님). 길이 0·1이면 `source`를 호출하지 않는다.
 *
 * @throws {RangeError} `source`가 함수가 아닐 때(다른 인자 검증보다 먼저). `items`가 배열이
 * 아닐 때.
 */
export function shuffle<T>(source: RandomSource, items: readonly T[]): T[] {
  assertRandomSource(source);
  assertArray(items, "items");
  return fisherYatesInPlace(source, items.slice());
}
