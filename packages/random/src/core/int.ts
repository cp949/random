import { uniformInt } from "../internal/uniform-int.js";
import { assertSafeIntRange } from "../internal/validate.js";
import { assertRandomSource, type RandomSource } from "./random-source.js";

/**
 * `[min, max]`(양끝 포함)에서 균등하게 정수를 뽑는다. rejection sampling으로 modulo 편향이 없다.
 * `seeded`, `secure`, custom source 어느 쪽을 넘기든 같은 `uniformInt` 경로를 탄다.
 *
 * @throws {RangeError} `source`가 함수가 아닐 때(다른 인자 검증보다 먼저). `min`/`max`가
 * safe integer가 아니거나 `min > max`이거나 범위 크기가 `Number.MAX_SAFE_INTEGER`를 넘을 때.
 * @returns `min` 이상 `max` 이하의 정수. `-0`은 나오지 않는다.
 */
export function int(source: RandomSource, min: number, max: number): number {
  assertRandomSource(source);
  assertSafeIntRange(min, max);

  const size = max - min + 1;
  return min + uniformInt(source, size);
}
