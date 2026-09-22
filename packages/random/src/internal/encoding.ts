/**
 * base64url 알파벳(RFC 4648 5절). 표준 base64의 `+`, `/`를 `-`, `_`로 바꾼 것이다.
 * 64자 문자 집합의 단일 출처다. base64url 인코더와 `./id`의 `nanoid`가 이 문자열을 같이 쓴다.
 */
export const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/**
 * 바이트를 소문자 hex로 바꾼다. 바이트마다 두 자리이며 앞의 0을 유지한다.
 * 256개 lookup table은 모듈 최상위에서 만들지 않는다(최상위에서는 호출 없이 선언만 한다).
 * `Buffer`에 의존하지 않는다.
 */
export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

/** 24비트 `group`의 상위 6비트부터 `charCount`개를 base64url 문자로 바꾼다. */
function encodeGroup(group: number, charCount: number): string {
  let out = "";
  for (let i = 0; i < charCount; i += 1) {
    out += BASE64URL_ALPHABET.charAt((group >> (18 - 6 * i)) & 63);
  }
  return out;
}

/**
 * 바이트를 padding 없는 base64url로 바꾼다. 3바이트를 4문자로 바꾸고, 남은 1바이트는 2문자, 2바이트는 3문자가 된다.
 * 결과 길이는 `ceil(바이트 수 * 4 / 3)`이다. `btoa`와 `Buffer`에 의존하지 않는다.
 */
export function toBase64url(bytes: Uint8Array): string {
  const fullLength = bytes.length - (bytes.length % 3);
  let out = "";
  for (let i = 0; i < fullLength; i += 3) {
    out += encodeGroup(
      (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!,
      4,
    );
  }

  const remaining = bytes.length - fullLength;
  if (remaining === 1) {
    out += encodeGroup(bytes[fullLength]! << 16, 2);
  } else if (remaining === 2) {
    out += encodeGroup(
      (bytes[fullLength]! << 16) | (bytes[fullLength + 1]! << 8),
      3,
    );
  }
  return out;
}
