import { randomBytes } from "@cp949/random/secure";

/**
 * 소비자 사용 fixture: `randomBytes`의 결과를 lib.dom의 `SubtleCrypto`에 캐스팅 없이 넘길 수 있어야 한다.
 * 반환 타입이 `Uint8Array<ArrayBuffer>`가 아니면 `BufferSource`에 대입되지 않아 컴파일이 실패한다.
 */
export function digestOfRandomBytes(): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", randomBytes(16));
}
