/**
 * `randomHex`의 공개 계약을 검증한다.
 * `byteLength`는 인코딩 전 엔트로피 바이트 수이고 결과는 그 두 배 길이의 소문자 hex다.
 * 인자 검증(`RangeError`)이 환경 확인보다 먼저다. `undefined`만 기본값 32로 대체된다.
 * 인코더 자체는 `encoding.test.ts`가 검증한다.
 *
 * 이 파일은 `describe`를 쓰지 않는다(`uniform-int.test.ts` 머리말 참고). 분류는 제목 접두어로 한다.
 */
import { expect, expectTypeOf, it } from "vitest";
import { randomHex } from "../../src/secure/index.js";
import { captureThrown } from "../helpers/capture-thrown.js";
import { installCryptoStub } from "../helpers/crypto-stub.js";
import { trapMathRandom } from "../helpers/math-random-trap.js";
import { firstMismatch, sequentialFill } from "../helpers/sequential-fill.js";

/** `RangeError`로 거부해야 하는 `byteLength`. `undefined`는 기본값이 있어 유효하므로 넣지 않는다. */
const invalidByteLengths: [label: string, value: unknown][] = [
  ["0", 0],
  ["음수", -1],
  ["소수", 1.5],
  ["NaN", Number.NaN],
  ["Infinity", Number.POSITIVE_INFINITY],
  ["숫자 문자열", "32"],
  ["null", null],
  ["객체", {}],
  ["boolean", true],
  ["bigint", 32n],
  ["상한 초과(2^20 + 1)", 1_048_577],
  ["safe integer 초과", 2 ** 53],
];

it("시그니처가 (byteLength?: number) => string이다", () => {
  expectTypeOf(randomHex).toEqualTypeOf<(byteLength?: number) => string>();
});

it("기본값 32바이트는 소문자 hex 64자다", () => {
  const stub = installCryptoStub();

  expect(randomHex()).toMatch(/^[0-9a-f]{64}$/);
  expect(stub.calls).toEqual([32]);
});

it("undefined를 명시해도 기본값 32를 쓴다", () => {
  installCryptoStub();

  expect(randomHex(undefined)).toMatch(/^[0-9a-f]{64}$/);
});

it("바이트를 소문자 hex로 인코딩한다", () => {
  installCryptoStub({ fill: (view) => view.set([0x00, 0x0f, 0xff, 0xab]) });

  expect(randomHex(4)).toBe("000fffab");
});

for (const byteLength of [1, 2, 16, 33]) {
  it(`결과 길이는 byteLength의 두 배다: ${byteLength}바이트는 ${byteLength * 2}자`, () => {
    installCryptoStub();

    expect(randomHex(byteLength)).toMatch(
      new RegExp(`^[0-9a-f]{${byteLength * 2}}$`),
    );
  });
}

it("65,537바이트는 [65536, 1]로 나눠 채워 인코딩한다", () => {
  const stub = installCryptoStub({ fill: sequentialFill() });

  const hex = randomHex(65_537);

  expect(stub.calls).toEqual([65_536, 1]);
  expect(hex).toHaveLength(131_074);
  expect(firstMismatch(Buffer.from(hex, "hex"))).toBe(-1);
});

it("상한 1,048,576바이트는 65,536바이트씩 16번 요청하고 hex 2,097,152자다", () => {
  const stub = installCryptoStub({ fill: sequentialFill() });

  const hex = randomHex(1_048_576);

  expect(stub.calls).toEqual(Array.from({ length: 16 }, () => 65_536));
  expect(hex).toHaveLength(2_097_152);
  expect(firstMismatch(Buffer.from(hex, "hex"))).toBe(-1);
});

for (const [label, value] of invalidByteLengths) {
  it(`인자 검증: byteLength가 ${label}이면 환경과 무관하게 RangeError다`, () => {
    installCryptoStub({ mode: "absent" });
    expect(() => randomHex(value as number)).toThrow(RangeError);

    const stub = installCryptoStub();
    expect(() => randomHex(value as number)).toThrow(RangeError);
    expect(stub.calls).toEqual([]);
  });
}

it("getRandomValues가 던진 오류를 그대로 전파하고 다음 호출은 정상 동작한다", () => {
  const failure = new Error("난수 요청 실패");
  let count = 0;
  installCryptoStub({
    fill: (view) => {
      count += 1;
      if (count === 1) throw failure;
      view.fill(0xab);
    },
  });

  expect(captureThrown(() => randomHex(4))).toBe(failure);
  expect(randomHex(2)).toBe("abab");
});

it("Math.random을 호출하지 않는다", () => {
  const trap = trapMathRandom();
  installCryptoStub();

  randomHex();

  expect(trap).not.toHaveBeenCalled();
});
