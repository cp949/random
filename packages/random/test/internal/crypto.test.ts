/**
 * `internal/crypto.ts`의 `globalThis.crypto` 접근과 지원 판정을 검증한다.
 * `readCrypto`가 유일한 접근점이고 `canGetRandomValues`, `getCrypto`가 같은 판정을 써야
 * `getCryptoCapabilities`와 공개 함수의 "지원 여부"가 어긋나지 않는다.
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  canGetRandomValues,
  getCrypto,
  readCrypto,
} from "../../src/internal/crypto.js";
import { SecureRandomUnavailableError } from "../../src/internal/errors.js";
import { installCryptoStub, type CryptoMode } from "../helpers/crypto-stub.js";
import { trapMathRandom } from "../helpers/math-random-trap.js";

/** `getRandomValues`를 쓸 수 없는 `globalThis.crypto` 상태. */
const unsupportedModes: CryptoMode[] = [
  "absent",
  "empty",
  "not-function",
  "throwing-accessor",
];

/** stub 설치 뒤 `globalThis.crypto`를 `null`로 바꾼다. 복원은 stub 하니스가 맡는다. */
function setCryptoToNull(): void {
  installCryptoStub({ mode: "absent" });
  Object.defineProperty(globalThis, "crypto", {
    value: null,
    writable: true,
    configurable: true,
    enumerable: true,
  });
}

describe("readCrypto", () => {
  it("globalThis.crypto가 있으면 그 객체를 돌려준다", () => {
    installCryptoStub();

    expect(readCrypto()).toBe(globalThis.crypto);
  });

  it("globalThis.crypto가 없으면 undefined를 돌려준다", () => {
    installCryptoStub({ mode: "absent" });

    expect(readCrypto()).toBeUndefined();
  });

  it("globalThis.crypto 접근이 예외를 던져도 예외 없이 undefined를 돌려준다", () => {
    installCryptoStub({ mode: "throwing-accessor" });

    expect(() => readCrypto()).not.toThrow();
    expect(readCrypto()).toBeUndefined();
  });

  it("호출 시점에 조회하므로 이후에 교체한 crypto를 반영한다", () => {
    installCryptoStub({ mode: "absent" });
    expect(readCrypto()).toBeUndefined();

    installCryptoStub();

    expect(readCrypto()).toBe(globalThis.crypto);
  });
});

describe("canGetRandomValues", () => {
  it("getRandomValues가 함수이면 true다", () => {
    expect(canGetRandomValues({ getRandomValues: () => undefined })).toBe(true);
  });

  it("crypto가 없으면 false다", () => {
    expect(canGetRandomValues(undefined)).toBe(false);
  });

  it("getRandomValues가 없으면 false다", () => {
    expect(canGetRandomValues({})).toBe(false);
  });

  it("getRandomValues가 함수가 아니면 false다", () => {
    expect(canGetRandomValues({ getRandomValues: "함수가 아니다" })).toBe(
      false,
    );
  });
});

describe("getCrypto", () => {
  it("지원되는 환경에서는 globalThis.crypto 객체를 그대로 돌려준다", () => {
    installCryptoStub();

    expect(getCrypto()).toBe(globalThis.crypto);
  });

  it("돌려준 객체의 getRandomValues를 메서드로 호출할 수 있다", () => {
    // stub은 this가 crypto가 아니면 "Illegal invocation"을 던진다. 메서드를 떼어 낸 함수를 돌려주면 실패한다.
    const stub = installCryptoStub();

    const view = getCrypto().getRandomValues(new Uint8Array(4));

    expect(view).toHaveLength(4);
    expect(stub.calls).toEqual([4]);
  });

  for (const mode of unsupportedModes) {
    it(`crypto가 ${mode}이면 SecureRandomUnavailableError를 던진다`, () => {
      installCryptoStub({ mode });

      expect(() => getCrypto()).toThrow(SecureRandomUnavailableError);
    });
  }

  it("crypto가 null이면 SecureRandomUnavailableError를 던진다", () => {
    setCryptoToNull();

    expect(() => getCrypto()).toThrow(SecureRandomUnavailableError);
  });

  it("미지원 판정 뒤에 crypto가 생기면 다음 호출은 정상 동작한다", () => {
    installCryptoStub({ mode: "absent" });
    expect(() => getCrypto()).toThrow(SecureRandomUnavailableError);

    installCryptoStub();

    expect(() => getCrypto()).not.toThrow();
  });

  it("미지원 환경에서도 Math.random으로 대체하지 않는다", () => {
    const trap = trapMathRandom();
    installCryptoStub({ mode: "empty" });

    expect(() => getCrypto()).toThrow(SecureRandomUnavailableError);
    expect(trap).not.toHaveBeenCalled();
  });

  it("getRandomValues는 Uint8Array와 Uint32Array를 모두 같은 타입으로 돌려준다", () => {
    installCryptoStub();
    const crypto = getCrypto();

    expectTypeOf(crypto.getRandomValues(new Uint32Array(4))).toEqualTypeOf<
      Uint32Array<ArrayBuffer>
    >();
    expectTypeOf(crypto.getRandomValues(new Uint8Array(4))).toEqualTypeOf<
      Uint8Array<ArrayBuffer>
    >();
  });
});
