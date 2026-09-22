/**
 * `getCryptoCapabilities`의 진단 결과를 검증한다.
 * 보고 전용 함수라 어떤 환경에서도 예외를 던지지 않고 세 필드를 모두 boolean으로 돌려준다.
 * `getRandomValues` 필드가 공개 함수의 지원 판정과 일치하는지는 `fail-closed.test.ts`가 검증한다.
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  getCryptoCapabilities,
  type CryptoCapabilities,
} from "../../src/secure/index.js";
import { installCryptoStub, type CryptoMode } from "../helpers/crypto-stub.js";
import { trapMathRandom } from "../helpers/math-random-trap.js";

const allModes: CryptoMode[] = [
  "present",
  "absent",
  "empty",
  "not-function",
  "throwing-accessor",
];

/** 현재 `globalThis.crypto` 객체에 필드를 추가한다. stub이 객체를 설치한 상태(`present`, `empty` 등)에서만 쓴다. */
function addCryptoFields(fields: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(fields)) {
    Object.defineProperty(globalThis.crypto, key, {
      value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }
}

describe("getCryptoCapabilities", () => {
  it("세 필드가 모두 boolean인 CryptoCapabilities를 돌려준다", () => {
    expectTypeOf(getCryptoCapabilities).toEqualTypeOf<
      () => CryptoCapabilities
    >();
    expectTypeOf<CryptoCapabilities>().toEqualTypeOf<{
      getRandomValues: boolean;
      randomUUID: boolean;
      subtle: boolean;
    }>();
  });

  it("getRandomValues만 있는 crypto는 나머지를 false로 보고한다", () => {
    installCryptoStub();

    expect(getCryptoCapabilities()).toEqual({
      getRandomValues: true,
      randomUUID: false,
      subtle: false,
    });
  });

  it("randomUUID와 subtle이 있으면 true로 보고한다", () => {
    installCryptoStub();
    addCryptoFields({ randomUUID: () => "uuid", subtle: {} });

    expect(getCryptoCapabilities()).toEqual({
      getRandomValues: true,
      randomUUID: true,
      subtle: true,
    });
  });

  it("실제 Node의 crypto에서는 세 필드가 모두 true다", () => {
    // stub 없이 실제 환경을 읽는다. 실제 SubtleCrypto가 객체라는 가정을 확인한다.
    expect(getCryptoCapabilities()).toEqual({
      getRandomValues: true,
      randomUUID: true,
      subtle: true,
    });
  });

  it("getRandomValues 없이 randomUUID만 있으면 그 필드만 true다", () => {
    installCryptoStub({ mode: "empty" });
    addCryptoFields({ randomUUID: () => "uuid" });

    expect(getCryptoCapabilities()).toEqual({
      getRandomValues: false,
      randomUUID: true,
      subtle: false,
    });
  });

  it("getRandomValues 없이 subtle만 있으면 그 필드만 true다", () => {
    installCryptoStub({ mode: "empty" });
    addCryptoFields({ subtle: {} });

    expect(getCryptoCapabilities()).toEqual({
      getRandomValues: false,
      randomUUID: false,
      subtle: true,
    });
  });

  it("함수가 아닌 randomUUID와 객체가 아닌 subtle은 false로 보고한다", () => {
    installCryptoStub({ mode: "empty" });
    addCryptoFields({ randomUUID: "uuid", subtle: null });

    expect(getCryptoCapabilities()).toEqual({
      getRandomValues: false,
      randomUUID: false,
      subtle: false,
    });
  });

  it("함수인 subtle은 객체가 아니므로 false로 보고한다", () => {
    installCryptoStub({ mode: "empty" });
    addCryptoFields({ subtle: () => undefined });

    expect(getCryptoCapabilities().subtle).toBe(false);
  });

  for (const mode of ["absent", "empty", "not-function"] as const) {
    it(`crypto가 ${mode}이면 getRandomValues를 false로 보고한다`, () => {
      installCryptoStub({ mode });

      expect(getCryptoCapabilities().getRandomValues).toBe(false);
    });
  }

  it("globalThis.crypto 접근이 예외를 던져도 예외 없이 모두 false로 보고한다", () => {
    installCryptoStub({ mode: "throwing-accessor" });

    expect(() => getCryptoCapabilities()).not.toThrow();
    expect(getCryptoCapabilities()).toEqual({
      getRandomValues: false,
      randomUUID: false,
      subtle: false,
    });
  });

  for (const mode of allModes) {
    it(`crypto가 ${mode}여도 예외를 던지지 않고 세 필드가 boolean이다`, () => {
      installCryptoStub({ mode });

      const capabilities = getCryptoCapabilities();

      expect(Object.keys(capabilities).sort()).toEqual([
        "getRandomValues",
        "randomUUID",
        "subtle",
      ]);
      for (const value of Object.values(capabilities)) {
        expect(typeof value).toBe("boolean");
      }
    });
  }

  it("호출마다 새 객체를 돌려주며 결과를 바꿔도 다음 호출에 영향이 없다", () => {
    installCryptoStub();
    const first = getCryptoCapabilities();
    first.getRandomValues = false;

    const second = getCryptoCapabilities();

    expect(second).not.toBe(first);
    expect(second.getRandomValues).toBe(true);
  });

  it("호출 시점의 crypto 상태를 반영한다", () => {
    installCryptoStub({ mode: "absent" });
    expect(getCryptoCapabilities().getRandomValues).toBe(false);

    installCryptoStub();

    expect(getCryptoCapabilities().getRandomValues).toBe(true);
  });

  it("Math.random을 호출하지 않는다", () => {
    const trap = trapMathRandom();
    installCryptoStub({ mode: "empty" });

    getCryptoCapabilities();

    expect(trap).not.toHaveBeenCalled();
  });
});
