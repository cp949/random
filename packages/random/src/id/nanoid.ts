import { defaultRandomBytes } from "../internal/bytes.js";
import { BASE64URL_ALPHABET } from "../internal/encoding.js";
import { assertLength } from "../internal/validate.js";

/**
 * base64url 64자(`A-Za-z0-9-_`)로 이루어진 URL-safe 무작위 ID를 만든다.
 *
 * 옵션 없이 길이만 받는 최소 진입점이다. 문자 집합은 바꿀 수 없고(커스텀 alphabet은 `@cp949/random/secure`의 `randomString`)
 * 난수원도 주입할 수 없다.
 * 바이트 하나가 문자 하나가 되며 64가 2의 거듭제곱이라 하위 6비트(`& 63`)만 쓰면 편향이 없다(rejection 없음).
 * 바이트는 `length`개를 한 번에 요청하고 앞에서부터 순서대로 소비한다. 호출 사이에 남는 상태가 없다.
 *
 * 실패 순서: 인자 검증(`RangeError`), 난수 생성(`SecureRandomUnavailableError`).
 * 검증이 먼저라서 잘못된 `length`는 `crypto`가 없는 환경에서도 `RangeError`다.
 *
 * @param length 결과의 문자 수. 1 이상 1,024 이하의 정수이며 `undefined`이면 기본값 21이다.
 *   그 밖의 값(0, 소수, `NaN`, 문자열, `null`, 객체 포함)은 `RangeError`다.
 * @returns 무작위 ID. 값은 매번 다르며 재현할 수 없다(계약이 아니다).
 */
export function nanoid(length = 21): string {
  assertLength(length);
  // 기본 난수원은 검증 wrapper 없이 직접 쓴다. 이 함수는 난수원을 주입받지 않는다.
  const bytes = defaultRandomBytes(length);
  let id = "";
  for (let i = 0; i < length; i += 1) {
    id += BASE64URL_ALPHABET.charAt(bytes[i]! & 63);
  }
  return id;
}
