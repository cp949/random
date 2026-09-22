/** 2^32. `getRandomValues`로 얻는 word(부호 없는 32비트)가 가질 수 있는 값의 개수다. */
const TWO_POW_32 = 4_294_967_296;

/** 2^53. 두 word에서 조립하는 53비트 값이 가질 수 있는 값의 개수다. */
const TWO_POW_53 = 9_007_199_254_740_992;

/**
 * `[0, n)`에서 균등하게 정수를 뽑는다. rejection sampling으로 modulo 편향을 없앤다.
 * `n`은 `1 <= n <= 2^53 - 1`인 정수여야 하며 검증은 호출자가 한다.
 * `nextUint32`는 `[0, 2^32)`의 정수를 돌려주는 함수다. 결정적 테스트에서 경계 값을 주입할 수 있도록 인자로 받는다.
 *
 * - `n === 1`: word를 소비하지 않고 0을 돌려준다.
 * - `n <= 2^32`: word 하나를 뽑아 `limit = 2^32 - (2^32 % n)` 미만이면 `word % n`을 돌려준다.
 * - `n > 2^32`: 첫 word의 상위 21비트와 둘째 word 32비트로 53비트 값을 조립해 `limit = 2^53 - (2^53 % n)` 미만이면 `x % n`을 돌려준다.
 *
 * `limit`은 `n`의 배수라 `%` 결과가 균등하다. 한 번의 시도에서 수용될 확률은 항상 50% 이상이다.
 * BigInt를 쓰지 않는다. 53비트 이하의 정수는 `number`로 정확하게 표현되고 `%`도 정확하다.
 * 반복 횟수에 상한이 없다. 정상적인 난수원에서 연속 k회 거부될 확률은 2^-k 이하다.
 */
export function uniformInt(nextUint32: () => number, n: number): number {
  if (n === 1) return 0;

  if (n <= TWO_POW_32) {
    const limit32 = TWO_POW_32 - (TWO_POW_32 % n);
    for (;;) {
      const word = nextUint32();
      if (word < limit32) return word % n;
    }
  }

  const limit53 = TWO_POW_53 - (TWO_POW_53 % n);
  for (;;) {
    const x = (nextUint32() >>> 11) * TWO_POW_32 + nextUint32();
    if (x < limit53) return x % n;
  }
}
