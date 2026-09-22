import { getCrypto } from "../internal/crypto.js";
import { uniformInt } from "../internal/uniform-int.js";
import { assertSafeIntRange } from "../internal/validate.js";
import { createWordSource } from "./word-source.js";

/**
 * `[min, max]`(양끝 포함)에서 균등하게 정수를 뽑는다. rejection sampling으로 modulo 편향이 없다.
 *
 * `globalThis.crypto.getRandomValues`만 쓰며, 쓸 수 없으면 `SecureRandomUnavailableError`를 던진다.
 * 실패 순서: 인자 검증(`RangeError`), 지원 확인(`SecureRandomUnavailableError`), 값 생성.
 * 범위 크기가 1이라 결과가 정해진 호출(`randomInt(5, 5)`)에서도 지원 확인은 한다.
 * 정상적인 난수원에서 연속 k회 거부될 확률은 2^-k 이하이며, 반복 횟수에 상한은 없다.
 *
 * @param min 최솟값. safe integer.
 * @param max 최댓값. safe integer이고 `min` 이상이어야 한다.
 * @returns `min` 이상 `max` 이하의 정수. `-0`은 나오지 않는다. 값은 재현할 수 없다(계약이 아니다).
 * @throws {RangeError} 인자가 safe integer가 아니거나(문자열, 소수, `NaN`, `undefined` 포함), `min > max`이거나,
 * 범위 크기(`max - min + 1`)가 `Number.MAX_SAFE_INTEGER`를 넘을 때. 환경과 무관하게 같다.
 * @throws {SecureRandomUnavailableError} `getRandomValues`를 쓸 수 없을 때.
 */
export function randomInt(min: number, max: number): number {
  assertSafeIntRange(min, max);

  // 범위 크기가 1이라 결과가 정해진 호출도 지원 확인은 한다.
  const crypto = getCrypto();
  const size = max - min + 1;

  // 범위 크기가 1이면 `uniformInt`가 word를 받지 않고 0을 돌려주므로 `getRandomValues`를 호출하지 않는다.
  // `min + 0`은 `-0`을 `0`으로 정규화한다.
  return min + uniformInt(createWordSource(crypto), size);
}
