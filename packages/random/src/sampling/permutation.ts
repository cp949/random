import {
  assertRandomSource,
  type RandomSource,
} from "../core/random-source.js";
import { assertSafeInt } from "../internal/validate.js";
import { fisherYatesInPlace } from "./shuffle-in-place.js";

/** 배열 최대 길이(2^32 - 1). vectra `MAX_COLLECTION_LENGTH`와 같은 값이다. */
const MAX_COLLECTION_LENGTH = 2 ** 32 - 1;

/**
 * `[0, 1, ..., length - 1]`을 만들어 `fisherYatesInPlace`로 섞어 돌려준다. `length`가 `0`이면
 * `[]`를 돌려주고 `source`를 호출하지 않는다. 배열 overload는 없다(`shuffle`이 담당한다).
 *
 * @throws {RangeError} `source`가 함수가 아닐 때(다른 인자 검증보다 먼저). `length`가
 * `0`~`2^32 - 1`(배열 최대 길이) 범위의 safe integer가 아닐 때.
 */
export function permutation(source: RandomSource, length: number): number[] {
  assertRandomSource(source);
  assertSafeInt(length, "length", 0, MAX_COLLECTION_LENGTH);

  const indices = Array.from({ length }, (_, i) => i);
  return fisherYatesInPlace(source, indices);
}
