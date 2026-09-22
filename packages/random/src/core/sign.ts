import { assertRandomSource, type RandomSource } from "./random-source.js";

/**
 * `1`과 `-1`을 균등한 확률로 돌려준다. `bool(source)`와 같이 `source`를 1회 호출해 최상위 비트로 판정한다
 * (`bool(source) ? 1 : -1`과 같은 값). `bool`을 호출하지 않고 직접 판정해 확률 인자 경로(`float`)를
 * 번들에 끌어오지 않는다.
 *
 * @throws {RangeError} `source`가 함수가 아닐 때.
 */
export function sign(source: RandomSource): 1 | -1 {
  assertRandomSource(source);

  return source() >>> 31 === 1 ? 1 : -1;
}
