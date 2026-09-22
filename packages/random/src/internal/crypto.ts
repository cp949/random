import { SecureRandomUnavailableError } from "./errors.js";

/**
 * `getRandomValues`만 요구하는 최소 crypto 타입. DOM lib의 `Crypto`에 의존하지 않는다(DOM lib 없이
 * 빌드하는 소비자가 있다). `Uint8Array`는 바이트 경로(`fillRandom`, `createWordSource`)가,
 * `Uint32Array`는 `./state`의 seed 없는 상태가 word 4개를 한 번에 받을 때 쓴다.
 */
export interface CryptoLike {
  getRandomValues<T extends Uint8Array | Uint32Array>(array: T): T;
}

/**
 * 환경 진단용 타입. 어떤 값이 와도 검사할 수 있도록 모든 필드를 `unknown`인 선택 필드로 둔다.
 */
export interface CryptoProbe {
  getRandomValues?: unknown;
  randomUUID?: unknown;
  subtle?: unknown;
}

/**
 * `globalThis.crypto`를 읽는 유일한 접근점이다. 호출 시점에 조회하며 import 시점에는 접근하지 않는다.
 * 접근이 예외를 던지면(예: 권한 정책이 막은 환경) `undefined`로 바꿔 "없음"과 같게 다룬다.
 */
export function readCrypto(): CryptoProbe | undefined {
  try {
    // DOM lib이 없어 `globalThis`에 `crypto` 타입이 없다. `crypto`를 타입 리터럴의 키로 쓰면
    // `no-restricted-globals`가 전역 참조로 오탐하므로 `Record`로 좁힌다.
    return (globalThis as unknown as Record<string, CryptoProbe | undefined>)
      .crypto;
  } catch {
    return undefined;
  }
}

/**
 * `getRandomValues`를 쓸 수 있는 환경인지 판정한다.
 * `getCrypto`와 `getCryptoCapabilities`가 같은 판정을 쓰므로 두 결과가 어긋나지 않는다.
 */
export function canGetRandomValues(
  crypto: CryptoProbe | undefined,
): crypto is CryptoProbe & CryptoLike {
  return typeof crypto?.getRandomValues === "function";
}

/**
 * `getRandomValues`를 가진 crypto를 돌려준다. 쓸 수 없으면 `SecureRandomUnavailableError`를 던진다.
 * 돌려준 객체에서 `getRandomValues`를 메서드로 호출해야 한다. 메서드를 변수로 꺼내 호출하면
 * 브라우저에서 `Illegal invocation`이 난다.
 */
export function getCrypto(): CryptoLike {
  const crypto = readCrypto();
  if (!canGetRandomValues(crypto)) {
    throw new SecureRandomUnavailableError();
  }
  return crypto;
}
