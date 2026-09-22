/**
 * fail-closed 계약을 `getCryptoCapabilities`를 뺀 모든 공개 함수에 대해 검증한다.
 * `globalThis.crypto`가 없거나, `getRandomValues`가 함수가 아니거나, crypto 접근이 예외를 던지면
 * 모든 함수가 `SecureRandomUnavailableError`로 실패하고 `Math.random` 등 다른 난수원으로 대체하지 않는다.
 * 필요한 바이트가 0개이거나 결과가 정해진 호출(`randomBytes(0)`, `randomInt(5, 5)`)도 지원 여부를 확인해 같은 오류를 낸다.
 * 새 공개 함수를 추가하면 `secureCalls`에 호출을 한 줄 추가한다.
 * import 시점에 crypto를 건드리지 않는다는 계약은 `entries.test.ts`가 모든 entry에 대해 검증한다.
 */
import { describe, expect, it } from "vitest";
import {
  SecureRandomUnavailableError,
  createSecureSource,
  getCryptoCapabilities,
  randomBase64url,
  randomBytes,
  randomHex,
  randomInt,
  randomString,
} from "../../src/secure/index.js";
import { installCryptoStub, type CryptoMode } from "../helpers/crypto-stub.js";
import { trapMathRandom } from "../helpers/math-random-trap.js";

/** `getCryptoCapabilities`를 뺀 공개 함수의 호출. 필요 바이트가 0개인 호출을 포함한다. */
const secureCalls: [name: string, call: () => unknown][] = [
  ["randomBytes(0)", () => randomBytes(0)],
  ["randomBytes(16)", () => randomBytes(16)],
  ["randomInt(5, 5)", () => randomInt(5, 5)],
  ["randomInt(0, 9)", () => randomInt(0, 9)],
  ["randomHex()", () => randomHex()],
  ["randomBase64url()", () => randomBase64url()],
  ['randomString("ab", 1)', () => randomString("ab", 1)],
  ['randomString("abc", 10)', () => randomString("abc", 10)],
  ["createSecureSource()", () => createSecureSource()],
];

const unsupportedModes: CryptoMode[] = [
  "absent",
  "empty",
  "not-function",
  "throwing-accessor",
];

describe("fail-closed", () => {
  for (const mode of unsupportedModes) {
    for (const [name, call] of secureCalls) {
      it(`crypto가 ${mode}이면 ${name}은 SecureRandomUnavailableError를 던진다`, () => {
        installCryptoStub({ mode });

        expect(call).toThrow(SecureRandomUnavailableError);
      });
    }
  }

  it("미지원 환경에서도 Math.random을 호출하지 않는다", () => {
    const trap = trapMathRandom();

    for (const mode of unsupportedModes) {
      installCryptoStub({ mode });
      for (const [, call] of secureCalls) {
        expect(call).toThrow(SecureRandomUnavailableError);
      }
    }

    expect(trap).not.toHaveBeenCalled();
  });

  describe("지원 판정 일치", () => {
    // getCryptoCapabilities().getRandomValues가 false인 상태와 공개 함수가 실패하는 상태가 같아야 한다.
    const allModes: CryptoMode[] = ["present", ...unsupportedModes];

    for (const mode of allModes) {
      for (const [name, call] of secureCalls) {
        it(`crypto가 ${mode}일 때 ${name}의 성공 여부가 getRandomValues 보고와 같다`, () => {
          installCryptoStub({ mode });

          const supported = getCryptoCapabilities().getRandomValues;

          expect(supported).toBe(mode === "present");
          if (supported) {
            expect(call).not.toThrow();
          } else {
            expect(call).toThrow(SecureRandomUnavailableError);
          }
        });
      }
    }
  });
});
