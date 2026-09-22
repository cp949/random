import { getCrypto, type CryptoLike } from "./crypto.js";
import { assertBytes } from "./validate.js";

/**
 * 요청한 길이의 바이트를 돌려주는 난수원. 공개 secure API는 `defaultRandomBytes`를 쓰고,
 * 결정적 테스트는 경계 바이트를 주입하는 구현을 넘긴다.
 */
export type ByteSource = (length: number) => Uint8Array;

/** `getRandomValues`가 한 번에 받는 최대 바이트 수. 넘기면 브라우저가 `QuotaExceededError`를 던진다. */
const MAX_REQUEST_BYTES = 65_536;

/**
 * `buffer` 전체를 `crypto.getRandomValues`로 채운다. 65,536바이트를 넘으면 나눠서 호출한다.
 * 호출 크기는 65,537바이트에서 `[65536, 1]`, 131,073바이트에서 `[65536, 65536, 1]`이다.
 * `getRandomValues`를 메서드로 호출한다(변수로 꺼내 호출하면 브라우저에서 `Illegal invocation`이 난다).
 * `getRandomValues`가 던진 오류는 그대로 전파하며 이후 chunk는 요청하지 않는다.
 */
export function fillRandom(crypto: CryptoLike, buffer: Uint8Array): void {
  for (let from = 0; from < buffer.length; from += MAX_REQUEST_BYTES) {
    crypto.getRandomValues(
      buffer.subarray(from, Math.min(from + MAX_REQUEST_BYTES, buffer.length)),
    );
  }
}

/**
 * 보안 난수로 채운 `length`바이트를 돌려준다. 길이 검증은 호출자가 한다.
 * `length`가 0이어도 지원 여부는 확인하므로 미지원 환경에서는 `SecureRandomUnavailableError`를 던진다.
 * 결과는 호출마다 새 `ArrayBuffer`를 쓴다.
 */
export function defaultRandomBytes(length: number): Uint8Array<ArrayBuffer> {
  const crypto = getCrypto();
  const buffer = new Uint8Array(length);
  fillRandom(crypto, buffer);
  return buffer;
}

/**
 * 주입한 난수원을 감싸 호출마다 결과를 검사하는 난수원을 돌려준다. 감싼 함수는 호출 때마다 `source(length)`의 결과를
 * `assertBytes`로 검사하고 통과하면 같은 배열을 돌려준다(복사하지 않는다). 형식이나 길이가 틀리면 `RangeError`다.
 * `pickChars`는 빈 배열을 받으면 끝나지 않으므로 주입 난수원은 이 함수로 감싼 뒤 넘긴다.
 * 감쌀 때는 `source`를 호출하지 않는다. `source`가 던진 오류는 그대로 전파한다.
 * 기본 난수원(`defaultRandomBytes`)은 감싸지 않는다.
 */
export function guardSource(source: ByteSource): ByteSource {
  return (length) => {
    const bytes = source(length);
    assertBytes(bytes, length);
    return bytes;
  };
}
