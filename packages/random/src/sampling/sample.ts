import {
  assertRandomSource,
  type RandomSource,
} from "../core/random-source.js";
import { assertArray, assertSafeInt } from "../internal/validate.js";
import { uniformInt } from "../internal/uniform-int.js";

/**
 * 비복원 추출. vectra `pickUnique`의 알고리즘: snapshot `pool` 위에서 `i = 0`부터 `i < count`인
 * 동안 `j = i + uniformInt(source, pool.length - i)`를 뽑아 `pool[i]`와 `pool[j]`를 바꾼다
 * (앞에서부터 가는 부분 Fisher-Yates). 결과는 `pool`의 앞 `count`개이며 선택 순서다(입력 순서
 * 보존 안 함). `count === items.length`면 결과는 `items`의 순열이다.
 *
 * `count`는 clamp하지 않는다 — `items.length`를 넘으면 `RangeError`다(vectra `pickUnique`의
 * strict 정책. clamp형 `sample`은 채택하지 않았다).
 *
 * @throws {RangeError} `source`가 함수가 아닐 때(다른 인자 검증보다 먼저). `items`가 배열이
 * 아닐 때. `count`가 `0`~`items.length` 범위의 safe integer가 아닐 때.
 */
export function sample<T>(
  source: RandomSource,
  items: readonly T[],
  count: number,
): T[] {
  assertRandomSource(source);
  assertArray(items, "items");
  assertSafeInt(count, "count", 0, items.length);

  const pool = items.slice();
  for (let i = 0; i < count; i += 1) {
    const j = i + uniformInt(source, pool.length - i);
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }
  pool.length = count;
  return pool;
}
