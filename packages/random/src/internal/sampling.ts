import type { ByteSource } from "./bytes.js";

/**
 * `chars`에서 `length`개를 균등하게 뽑아 이어 붙인 문자열을 돌려준다. `chars`는 서로 다른 글자 2~256개이며
 * 검증은 호출자가 한다(`parseAlphabet`).
 *
 * 바이트 하나로 글자 위치를 정하므로 rejection sampling으로 modulo 편향을 없앤다.
 * `cutoff = 256 - (256 % n)` 미만의 바이트만 `% n`으로 쓰고 그 이상은 버린다.
 * 크기가 2의 거듭제곱이면 `cutoff`가 256이라 모든 바이트를 수용한다.
 *
 * 난수원에는 수용 확률의 기댓값에서 정한 바이트 수를 요청한다: `ceil(remaining * 256 / cutoff)`.
 * 거부가 많아 모자라면 남은 글자 수로 같은 식을 다시 계산해 요청한다. 여유 계수를 곱하지 않는다.
 * 계수는 정확성과 무관하고 `source` 호출 횟수만 바꾼다. 한 라운드에서 필요한 글자를 채우면 남는 바이트는 버린다.
 * 반복 횟수에 상한이 없다. 정상적인 난수원에서 연속 k회 거부될 확률은 2^-k 이하다.
 *
 * `source`가 요청보다 적은 바이트를 돌려주는 경우는 처리하지 않는다. 그 검증은 `source`를 주입받는 쪽의 몫이다.
 */
export function pickChars(
  chars: readonly string[],
  length: number,
  source: ByteSource,
): string {
  const size = chars.length;
  const cutoff = 256 - (256 % size);
  let out = "";
  let remaining = length;
  while (remaining > 0) {
    const bytes = source(Math.ceil((remaining * 256) / cutoff));
    for (const byte of bytes) {
      if (byte < cutoff) {
        out += chars[byte % size]!;
        remaining -= 1;
        // 필요한 글자를 채웠으면 이 요청의 남는 바이트는 버린다.
        if (remaining === 0) break;
      }
    }
  }
  return out;
}
