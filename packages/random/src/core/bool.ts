import { assertProbability } from "../internal/validate.js";
import { float } from "./float.js";
import { assertRandomSource, type RandomSource } from "./random-source.js";

/**
 * 참/거짓을 뽑는다. `p`를 생략하면 `source`를 1회 호출해 최상위 비트(`word >>> 31`)로 판정하고(각 50%),
 * `p`를 주면 `float(source) < p`로 판정한다(참일 확률 `p`, word 2개). 두 경로는 서로 다른 추출이라
 * `bool(s)`와 `bool(s, 0.5)`의 결과 열은 같지 않다. `p`가 `undefined`면 생략과 같다.
 * 최하위 비트를 쓰지 않는 이유: helper는 source를 가리지 않는데 사용자 정의 source(LCG, xoshiro128+ 등)는
 * 하위 비트의 품질이 낮은 경우가 흔하다. `float`도 같은 이유로 하위 비트를 버린다.
 *
 * @param p 참일 확률. `[0, 1]`의 number. 0이면 항상 거짓, 1이면 항상 참이다.
 * @throws {RangeError} `source`가 함수가 아닐 때(다른 인자 검증보다 먼저). `p`가 `[0, 1]`의 number가 아닐 때.
 */
export function bool(source: RandomSource, p?: number): boolean {
  assertRandomSource(source);
  if (p === undefined) {
    return source() >>> 31 === 1;
  }

  const probability = assertProbability(p);
  return float(source) < probability;
}
