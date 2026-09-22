import { assertRandomSource, type RandomSource } from "./random-source.js";

/** 2^26. 53-bit 조합에서 첫 word가 기여하는 상위 27비트의 자리값. */
const TWO_POW_26 = 67_108_864;

/** 2^53. 53-bit 조합의 전체 칸 수(`internal/uniform-int.ts`의 `TWO_POW_53`과 같은 값). */
const TWO_POW_53 = 9_007_199_254_740_992;

/**
 * `[0, 1)` 반개구간에서 53-bit 정밀도의 실수를 만든다. `source`를 2회 호출해 첫 word의 상위 27비트와
 * 둘째 word의 상위 26비트를 조합한다(`internal/uniform-int.ts`의 53비트 경로와 같은 조립 방식).
 *
 * @throws {RangeError} `source`가 함수가 아닐 때.
 */
export function float(source: RandomSource): number {
  assertRandomSource(source);

  const high = source() >>> 5;
  const low = source() >>> 6;
  return (high * TWO_POW_26 + low) / TWO_POW_53;
}
