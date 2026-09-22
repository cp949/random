/**
 * 재현 가능한 난수의 최소 계약. 호출마다 `[0, 2^32)`의 정수(word) 하나를 돌려준다.
 * 반환값이 이 범위를 벗어나거나 정수가 아니어도 라이브러리는 매 호출 검증하지 않는다.
 * 그런 source의 결과는 정의되지 않는다. source가 던진 예외는 감싸지 않고 그대로 전파한다.
 */
export type RandomSource = () => number;

/**
 * `source`가 함수인지 확인한다. `int`/`float`/`bool`/`sign`/`uniform`이 공유하는 첫 번째 검증이며
 * 다른 인자 검증보다 먼저 한다. 함수가 아니면 `RangeError`다.
 */
export function assertRandomSource(
  source: unknown,
): asserts source is RandomSource {
  if (typeof source !== "function") {
    throw new RangeError("source must be a function");
  }
}
