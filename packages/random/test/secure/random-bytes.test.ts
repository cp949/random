/**
 * `randomBytes`의 공개 계약을 검증한다.
 * 인자 검증(`RangeError`)은 환경 확인보다 먼저이고, 큰 요청은 chunk로 나눠 빈틈없이 채우며,
 * `getRandomValues`가 던진 오류는 부분 결과 없이 그대로 전파된다.
 * 미지원 환경의 fail-closed 동작은 `fail-closed.test.ts`가 모든 공개 함수에 대해 검증한다.
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import { randomBytes } from "../../src/secure/index.js";
import { captureThrown } from "../helpers/capture-thrown.js";
import { installCryptoStub } from "../helpers/crypto-stub.js";
import { trapMathRandom } from "../helpers/math-random-trap.js";
import { firstMismatch, sequentialFill } from "../helpers/sequential-fill.js";

/** 요청 길이별로 기대하는 `getRandomValues` 호출 크기 열. */
const chunkCases: [length: number, calls: number[]][] = [
  [0, []],
  [1, [1]],
  [65_535, [65_535]],
  [65_536, [65_536]],
  [65_537, [65_536, 1]],
  [131_072, [65_536, 65_536]],
  [131_073, [65_536, 65_536, 1]],
];

/** `randomBytes`가 `RangeError`로 거부해야 하는 인자. */
const invalidLengths: [label: string, value: unknown][] = [
  ["음수", -1],
  ["소수", 1.5],
  ["NaN", Number.NaN],
  ["Infinity", Number.POSITIVE_INFINITY],
  ["숫자 문자열", "16"],
  ["undefined(필수 인자)", undefined],
  ["null", null],
  ["객체", {}],
  ["상한 초과(2^20 + 1)", 1_048_577],
  ["safe integer 초과", 2 ** 53],
];

describe("randomBytes", () => {
  it("시그니처가 (length: number) => Uint8Array<ArrayBuffer>다", () => {
    expectTypeOf(randomBytes).toEqualTypeOf<
      (length: number) => Uint8Array<ArrayBuffer>
    >();
  });

  it("요청한 길이의 Uint8Array를 돌려준다", () => {
    installCryptoStub();

    const bytes = randomBytes(16);

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes).toHaveLength(16);
  });

  it("getRandomValues가 채운 바이트를 그대로 돌려준다", () => {
    installCryptoStub({ fill: (view) => view.fill(0x5a) });

    expect([...randomBytes(4)]).toEqual([0x5a, 0x5a, 0x5a, 0x5a]);
  });

  for (const [length, calls] of chunkCases) {
    it(`길이 ${length}는 호출 크기 ${JSON.stringify(calls)}로 나눠 빈틈없이 채운다`, () => {
      const stub = installCryptoStub({ fill: sequentialFill() });

      const bytes = randomBytes(length);

      expect(bytes).toHaveLength(length);
      expect(stub.calls).toEqual(calls);
      expect(firstMismatch(bytes)).toBe(-1);
    });
  }

  it("길이 0은 getRandomValues를 호출하지 않고 빈 배열을 돌려준다", () => {
    const stub = installCryptoStub();

    expect(randomBytes(0)).toHaveLength(0);
    expect(stub.calls).toEqual([]);
  });

  it("상한 1,048,576바이트를 65,536바이트씩 16번 호출로 채운다", () => {
    const stub = installCryptoStub({ fill: sequentialFill() });

    const bytes = randomBytes(1_048_576);

    expect(stub.calls).toEqual(Array.from({ length: 16 }, () => 65_536));
    expect(firstMismatch(bytes)).toBe(-1);
  });

  for (const [label, value] of invalidLengths) {
    it(`${label}은 환경과 무관하게 RangeError로 거부한다`, () => {
      // 인자 검증이 지원 확인보다 먼저라 crypto가 없어도 같은 오류가 나야 한다.
      installCryptoStub({ mode: "absent" });
      expect(() => randomBytes(value as number)).toThrow(RangeError);

      const stub = installCryptoStub();
      expect(() => randomBytes(value as number)).toThrow(RangeError);
      expect(stub.calls).toEqual([]);
    });
  }

  it("호출마다 서로 다른 ArrayBuffer를 돌려준다", () => {
    installCryptoStub();

    const first = randomBytes(8);
    const second = randomBytes(8);
    first.fill(0);

    expect(second.buffer).not.toBe(first.buffer);
    expect(first.byteOffset).toBe(0);
    expect(first.buffer.byteLength).toBe(8);
  });

  it("두 번째 chunk에서 getRandomValues가 던진 오류를 그대로 전파하고 부분 결과를 돌려주지 않는다", () => {
    const failure = new Error("두 번째 호출 실패");
    let count = 0;
    installCryptoStub({
      fill: (view) => {
        count += 1;
        if (count === 2) throw failure;
        view.fill(0x22);
      },
    });
    let result: unknown = "반환되지 않음";

    const thrown = captureThrown(() => {
      result = randomBytes(131_073);
    });

    expect(thrown).toBe(failure);
    expect(result).toBe("반환되지 않음");
  });

  it("오류가 난 뒤의 다음 호출은 정상 동작한다", () => {
    // 모듈 수준 상태가 없으므로 실패가 다음 호출에 영향을 주지 않는다.
    let count = 0;
    installCryptoStub({
      fill: (view) => {
        count += 1;
        if (count === 1) throw new Error("첫 호출 실패");
        view.fill(0x33);
      },
    });
    expect(() => randomBytes(4)).toThrow();

    expect([...randomBytes(4)]).toEqual([0x33, 0x33, 0x33, 0x33]);
  });

  it("Math.random을 호출하지 않는다", () => {
    const trap = trapMathRandom();
    installCryptoStub();

    randomBytes(70_000);

    expect(trap).not.toHaveBeenCalled();
  });
});
