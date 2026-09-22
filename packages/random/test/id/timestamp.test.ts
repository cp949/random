/**
 * `id/timestamp.ts`(정렬 가능한 timestamp 접두사의 인코딩)를 검증한다.
 * 이 파일이 다루는 소스는 mutation 대상이 아니라서 `describe`로 묶어도 된다.
 *
 * 계약: 0 이상 36^9 미만의 정수를 base36 소문자 9자(앞을 0으로 채운 고정 폭)로 바꾼다. 그 밖의 값은 `RangeError`다.
 * 고정 폭이라 문자열 사전순이 값의 크기순과 같다. 기대값은 구현과 무관하게 BigInt로 따로 계산해 비교한다.
 */
import { describe, expect, it } from "vitest";
import { encodeTimestamp } from "../../src/id/timestamp.js";
import { captureThrown } from "../helpers/capture-thrown.js";

/** 36^9. 인코딩할 수 있는 값의 상한(제외)이다. */
const LIMIT = 36 ** 9;

/** base36 소문자 자릿수. 기대값 계산에 쓴다. */
const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

/** 구현과 무관하게 BigInt로 base36 9자를 만든다. */
function base36Fixed(value: number): string {
  let rest = BigInt(value);
  let out = "";
  while (rest > 0n) {
    out = DIGITS.charAt(Number(rest % 36n)) + out;
    rest /= 36n;
  }
  return out.padStart(9, "0");
}

/** 표로 고정하는 값과 기대 문자열. */
const table: [label: string, value: number, encoded: string][] = [
  ["0", 0, "000000000"],
  ["1", 1, "000000001"],
  ["35(한 자리 최댓값)", 35, "00000000z"],
  ["36(두 자리 시작)", 36, "000000010"],
  ["실제 시각(2022-02-22T19:22:22Z)", 1_645_557_742_000, "0kzyilbxs"],
  ["36^9 - 1(상한)", LIMIT - 1, "zzzzzzzzz"],
];

/** BigInt 교차 검증에 쓰는 값. 자릿수 경계와 실제 시각 범위를 섞는다. */
const crossCheckValues: number[] = [
  0,
  1,
  35,
  36,
  1295,
  1296,
  46_655,
  46_656,
  1_679_615,
  1_679_616,
  2_176_782_335,
  2_176_782_336,
  1_000_000_000_000,
  1_645_557_742_000,
  1_700_000_000_123,
  2_000_000_000_000,
  LIMIT - 2,
  LIMIT - 1,
];

/** `RangeError`로 거부해야 하는 값. */
const invalidValues: [label: string, value: unknown][] = [
  ["음수", -1],
  ["큰 음수", -1_645_557_742_000],
  ["소수", 1.5],
  ["시각에 가까운 소수", 1_645_557_742_000.5],
  ["NaN", Number.NaN],
  ["Infinity", Number.POSITIVE_INFINITY],
  ["-Infinity", Number.NEGATIVE_INFINITY],
  ["36^9(상한 초과)", LIMIT],
  ["36^9 + 1", LIMIT + 1],
  ["MAX_SAFE_INTEGER", Number.MAX_SAFE_INTEGER],
  ["safe integer 초과", 2 ** 53],
  ["숫자 문자열", "1645557742000"],
  ["null", null],
  ["undefined", undefined],
  ["빈 객체", {}],
  ["배열", [0]],
  ["boolean", true],
  ["bigint", 0n],
  ["valueOf를 가진 객체", { valueOf: () => 0 }],
  ["Date 객체", new Date(1_645_557_742_000)],
];

describe("encodeTimestamp", () => {
  it.each(table)("%s를 %i에서 %s로 인코딩한다", (_label, value, encoded) => {
    expect(encodeTimestamp(value)).toBe(encoded);
  });

  it.each(crossCheckValues)("%i의 인코딩이 BigInt 계산과 같다", (value) => {
    expect(encodeTimestamp(value)).toBe(base36Fixed(value));
  });

  it.each(crossCheckValues)("%i의 결과는 9자 고정 폭이다", (value) => {
    expect(encodeTimestamp(value)).toHaveLength(9);
  });

  it("-0은 0과 같게 인코딩한다", () => {
    expect(encodeTimestamp(-0)).toBe("000000000");
  });

  it("결과는 항상 소문자다", () => {
    for (const value of crossCheckValues) {
      const encoded = encodeTimestamp(value);
      expect(encoded).toBe(encoded.toLowerCase());
      expect(encoded).toMatch(/^[0-9a-z]{9}$/);
    }
  });

  it("사전순이 값의 크기순과 같다", () => {
    const sorted = [...crossCheckValues].sort((a, b) => a - b);
    const encoded = sorted.map((value) => encodeTimestamp(value));
    expect([...encoded].sort()).toEqual(encoded);
  });

  it.each(invalidValues)("%s는 RangeError다", (_label, value) => {
    expect(captureThrown(() => encodeTimestamp(value))).toBeInstanceOf(
      RangeError,
    );
  });
});
