import { canGetRandomValues, readCrypto } from "../internal/crypto.js";

/** `getCryptoCapabilities`가 보고하는 환경 진단 결과. 세 필드 모두 boolean이다. */
export interface CryptoCapabilities {
  /** `globalThis.crypto.getRandomValues`를 쓸 수 있는가. `false`이면 공개 함수가 `SecureRandomUnavailableError`로 실패한다. */
  getRandomValues: boolean;
  /** `globalThis.crypto.randomUUID`가 함수인가. 이 라이브러리는 사용하지 않고 보고만 한다. */
  randomUUID: boolean;
  /** `globalThis.crypto.subtle`이 객체인가. 이 라이브러리는 사용하지 않고 보고만 한다. */
  subtle: boolean;
}

/**
 * 실행 환경의 crypto 지원 여부를 보고한다. 진단 전용이며 어떤 환경에서도 예외를 던지지 않는다.
 *
 * `getRandomValues` 필드는 공개 함수가 지원 확인에 쓰는 판정과 같은 함수를 쓴다.
 * 그래서 이 값이 `false`인 상태와 공개 함수가 `SecureRandomUnavailableError`로 실패하는 상태가 일치한다.
 * `globalThis.crypto` 접근이 예외를 던지는 환경도 세 필드가 모두 `false`다.
 */
export function getCryptoCapabilities(): CryptoCapabilities {
  const crypto = readCrypto();
  return {
    getRandomValues: canGetRandomValues(crypto),
    randomUUID: typeof crypto?.randomUUID === "function",
    subtle: typeof crypto?.subtle === "object" && crypto.subtle !== null,
  };
}
