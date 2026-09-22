/**
 * `createSecureSource`를 검증한다. word 조립은 `randomInt`와 공유하는 `secure/word-source.ts`의
 * `createWordSource`(32바이트 버퍼, big-endian, 8 word 소진 후 재요청)이며 같은 방식으로 확인한다.
 * 지원 확인은 `createSecureSource()` 호출 시점에 eager하게 일어난다 — 첫 word 호출까지 미루지
 * 않는다는 것이 이 테스트의 핵심이다.
 *
 * 이 파일은 `describe`를 쓰지 않는다. 바이트 조립 코드가 mutation 대상일 수 있어서다
 * (`internal/uniform-int.test.ts`, `secure/random-int.test.ts` 머리말 참고).
 */
import { expect, expectTypeOf, it } from "vitest";
import { SecureRandomUnavailableError } from "../../src/internal/errors.js";
import * as secureEntry from "../../src/secure/index.js";
import type { RandomSource } from "../../src/secure/index.js";
import { createSecureSource } from "../../src/secure/secure-source.js";
import { installCryptoStub, type CryptoMode } from "../helpers/crypto-stub.js";
import { trapMathRandom } from "../helpers/math-random-trap.js";
import { wordFill } from "../helpers/word-fill.js";

it("./secure가 createSecureSource를 내보내고 타입은 () => RandomSource다", () => {
  expect(secureEntry.createSecureSource).toBe(createSecureSource);
  expectTypeOf(createSecureSource).toEqualTypeOf<() => RandomSource>();
});

it("getRandomValues가 던지면 그대로 전파하고 다음 호출은 다시 채우기를 시도한다", () => {
  let fail = true;
  const stub = installCryptoStub({
    fill: (view) => {
      if (fail) throw new Error("getRandomValues 실패");
      view.fill(7);
    },
  });
  const source = createSecureSource();

  expect(() => source()).toThrow("getRandomValues 실패");
  fail = false;
  expect(source()).toBe(0x07070707);
  expect(stub.calls).toEqual([32, 32]);
});

it("바이트를 big-endian word로 읽는다", () => {
  // 0x0001e240 = 123456. little-endian으로 읽으면 다른 값이 나온다.
  installCryptoStub({ fill: (view) => view.set([0x00, 0x01, 0xe2, 0x40]) });

  const source = createSecureSource();

  expect(source()).toBe(123456);
});

it("첫 word 호출에서 32바이트를 한 번 요청한다", () => {
  const stub = installCryptoStub();

  createSecureSource()();

  expect(stub.calls).toEqual([32]);
});

it("버퍼의 8번째 word까지는 새로 요청하지 않는다", () => {
  const stub = installCryptoStub();
  const source = createSecureSource();

  for (let i = 0; i < 8; i += 1) source();

  expect(stub.calls).toEqual([32]);
});

it("9번째 word를 위해 새로 32바이트를 요청한다", () => {
  const stub = installCryptoStub();
  const source = createSecureSource();

  for (let i = 0; i < 9; i += 1) source();

  expect(stub.calls).toEqual([32, 32]);
});

it("서로 다른 source는 버퍼를 공유하지 않는다", () => {
  const stub = installCryptoStub();

  const a = createSecureSource();
  const b = createSecureSource();
  a(); // a의 버퍼에서 1 word만 소비 — 나머지 7 word가 남는다
  b(); // b는 자기 버퍼가 없어 새로 32바이트를 요청한다(a의 나머지를 재사용하지 않는다)

  expect(stub.calls).toEqual([32, 32]);
});

it("word는 항상 [0, 2^32)의 정수다", () => {
  installCryptoStub();
  const source = createSecureSource();

  for (let i = 0; i < 200; i += 1) {
    const word = source();
    expect(Number.isInteger(word)).toBe(true);
    expect(word).toBeGreaterThanOrEqual(0);
    expect(word).toBeLessThan(2 ** 32);
  }
});

it("고정 word 주입: 거부값 없이도 buffer가 순서대로 word를 내준다", () => {
  installCryptoStub({ fill: wordFill([1, 2, 3]) });
  const source = createSecureSource();

  expect([source(), source(), source()]).toEqual([1, 2, 3]);
});

const unsupportedModes: CryptoMode[] = [
  "absent",
  "empty",
  "not-function",
  "throwing-accessor",
];

for (const mode of unsupportedModes) {
  it(`crypto가 ${mode}이면 createSecureSource() 호출 시점(생성)에 즉시 실패한다`, () => {
    installCryptoStub({ mode });

    expect(() => createSecureSource()).toThrow(SecureRandomUnavailableError);
  });
}

it("미지원 환경에서도 Math.random을 호출하지 않는다", () => {
  const trap = trapMathRandom();

  for (const mode of unsupportedModes) {
    installCryptoStub({ mode });
    expect(() => createSecureSource()).toThrow(SecureRandomUnavailableError);
  }

  expect(trap).not.toHaveBeenCalled();
});
