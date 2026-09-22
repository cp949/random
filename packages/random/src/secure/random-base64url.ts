import { defaultRandomBytes } from "../internal/bytes.js";
import { toBase64url } from "../internal/encoding.js";
import { SECURE_MAX_LENGTH, assertSafeInt } from "../internal/validate.js";

/**
 * 보안 난수를 padding 없는 base64url 문자열(`A-Za-z0-9-_`)로 만든다.
 * 결과 길이는 `ceil(byteLength * 4 / 3)`이다.
 *
 * `globalThis.crypto.getRandomValues`만 쓰며, 쓸 수 없으면 `SecureRandomUnavailableError`를 던진다.
 * 실패 순서: 인자 검증(`RangeError`), 지원 확인(`SecureRandomUnavailableError`), 바이트 생성.
 * `getRandomValues`가 던진 오류는 그대로 전파한다.
 *
 * @param byteLength 인코딩 전 엔트로피 바이트 수(결과 문자 수가 아니다). 1 이상 1,048,576(2^20) 이하의 정수.
 * `undefined`이면 기본값 32(256비트, 43자)다.
 * @returns padding(`=`)이 없는 base64url 문자열. 값은 재현할 수 없다(계약이 아니다).
 * @throws {RangeError} `byteLength`가 범위 안의 정수가 아닐 때(`null`, 문자열, 소수, `NaN` 포함). 환경과 무관하게 같다.
 * @throws {SecureRandomUnavailableError} `getRandomValues`를 쓸 수 없을 때.
 */
export function randomBase64url(byteLength = 32): string {
  assertSafeInt(byteLength, "byteLength", 1, SECURE_MAX_LENGTH);
  return toBase64url(defaultRandomBytes(byteLength));
}
