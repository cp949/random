import { defaultRandomBytes } from "../internal/bytes.js";
import { SECURE_MAX_LENGTH, assertSafeInt } from "../internal/validate.js";

/**
 * 보안 난수 바이트를 만든다.
 *
 * `globalThis.crypto.getRandomValues`만 쓰며, 쓸 수 없으면 `SecureRandomUnavailableError`를 던진다.
 * `Math.random` 등 다른 난수원으로 대체하지 않는다. `getRandomValues`의 호출당 65,536바이트 제한은
 * 나눠서 채우는 방식으로 처리한다. 결과는 호출마다 새 `ArrayBuffer`를 쓴다.
 *
 * 실패 순서: 인자 검증(`RangeError`), 지원 확인(`SecureRandomUnavailableError`), 바이트 생성.
 * `length`가 0이어도 지원 확인은 한다. `getRandomValues`가 던진 오류는 그대로 전파하고 부분 결과는 없다.
 *
 * @param length 바이트 수. 0 이상 1,048,576(2^20) 이하의 정수. 그 밖의 값(문자열, 소수, `NaN`, `undefined` 포함)은 `RangeError`다.
 * @returns 무작위 바이트. 값은 매번 다르며 재현할 수 없다(계약이 아니다).
 */
export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  assertSafeInt(length, "length", 0, SECURE_MAX_LENGTH);
  return defaultRandomBytes(length);
}
