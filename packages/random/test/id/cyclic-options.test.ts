/**
 * 순환 ID 옵션의 읽기·검증·정규화를 검증한다(`cyclic-options.ts`, mutation 비대상이라 `describe`를 쓴다).
 * 검증 대상: preset 표, 기본값(`min` 0, `step` 1, `start`는 0 포함 여부), 배타·필수 규칙, 수치 검증, 옵션 읽기 규칙(한 번 읽기, 알 수 없는 키).
 * 생성기의 동작은 `cyclic.test.ts`가 맡는다.
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  CYCLIC_ID_PRESETS,
  readCounterIdOptions,
  readCyclicIdOptions,
  readStart,
  resolveRange,
  type CyclicIdOptions,
  type CyclicIdPreset,
  type CounterIdOptions,
} from "../../src/id/cyclic-options.js";

const MAX = Number.MAX_SAFE_INTEGER;

describe("preset 표", () => {
  const ranges: [CyclicIdPreset, number, number][] = [
    ["int8", -128, 127],
    ["uint8", 0, 255],
    ["int16", -32768, 32767],
    ["uint16", 0, 65535],
    ["int32", -2147483648, 2147483647],
    ["uint32", 0, 4294967295],
  ];
  for (const [preset, min, max] of ranges) {
    it(`${preset}은 [${min}, ${max}]이고 시작값 0, step 1이다`, () => {
      expect(readCyclicIdOptions({ preset })).toEqual({
        min,
        max,
        start: 0,
        step: 1,
      });
    });
  }
  it("preset 목록은 여섯 이름이다", () => {
    expect(CYCLIC_ID_PRESETS).toEqual([
      "int8",
      "uint8",
      "int16",
      "uint16",
      "int32",
      "uint32",
    ]);
    expectTypeOf<CyclicIdPreset>().toEqualTypeOf<
      "int8" | "uint8" | "int16" | "uint16" | "int32" | "uint32"
    >();
  });
  it("preset은 start·step과 함께 쓸 수 있다", () => {
    expect(
      readCyclicIdOptions({ preset: "uint8", start: 255, step: -1 }),
    ).toEqual({ min: 0, max: 255, start: 255, step: -1 });
  });
});

describe("기본값", () => {
  it("min은 0, step은 1, 범위가 0을 포함하면 start는 0이다", () => {
    expect(readCyclicIdOptions({ max: 5 })).toEqual({
      min: 0,
      max: 5,
      start: 0,
      step: 1,
    });
    expect(readCyclicIdOptions({ min: -3, max: 3 })).toEqual({
      min: -3,
      max: 3,
      start: 0,
      step: 1,
    });
  });
  it("범위가 0을 포함하지 않으면 start는 min이다", () => {
    expect(readCyclicIdOptions({ min: 10, max: 12 })).toEqual({
      min: 10,
      max: 12,
      start: 10,
      step: 1,
    });
    expect(readCyclicIdOptions({ min: -MAX, max: -1 })).toEqual({
      min: -MAX,
      max: -1,
      start: -MAX,
      step: 1,
    });
  });
  it("0 포함 판정의 경계: 상한이 0이면 start는 0이고, 하한이 1이면 start는 min이다", () => {
    expect(readCyclicIdOptions({ min: -5, max: 0 }).start).toBe(0);
    expect(readCyclicIdOptions({ min: 0, max: 5 }).start).toBe(0);
    expect(readCyclicIdOptions({ min: 1, max: 5 }).start).toBe(1);
    expect(readCyclicIdOptions({ min: -5, max: -1 }).start).toBe(-5);
  });
  it("범위 크기가 MAX_SAFE_INTEGER인 범위를 받는다", () => {
    expect(readCyclicIdOptions({ min: 0, max: MAX - 1 }).max).toBe(MAX - 1);
    expect(readCyclicIdOptions({ min: -MAX, max: -1 }).min).toBe(-MAX);
  });
  it("step은 범위보다 큰 절댓값과 safe integer 양 끝을 받는다", () => {
    expect(readCyclicIdOptions({ max: 4, step: 7 }).step).toBe(7);
    expect(readCyclicIdOptions({ max: 4, step: -MAX }).step).toBe(-MAX);
    expect(readCyclicIdOptions({ max: 4, step: MAX }).step).toBe(MAX);
  });
  it("CyclicIdOptions의 필드가 명세와 같다", () => {
    expectTypeOf<CyclicIdOptions>().toEqualTypeOf<{
      preset?: CyclicIdPreset;
      min?: number;
      max?: number;
      start?: number;
      step?: number;
    }>();
  });
});

describe("배타·필수 규칙", () => {
  it("preset과 min·max는 함께 쓸 수 없다", () => {
    expect(() => readCyclicIdOptions({ preset: "int32", max: 5 })).toThrow(
      RangeError,
    );
    expect(() => readCyclicIdOptions({ preset: "int32", min: 0 })).toThrow(
      RangeError,
    );
  });
  it("preset이 없으면 max가 필수다", () => {
    expect(() => readCyclicIdOptions(undefined)).toThrow(RangeError);
    expect(() => readCyclicIdOptions({})).toThrow(RangeError);
    expect(() => readCyclicIdOptions({ min: 0 })).toThrow(RangeError);
  });
  it("한쪽이 undefined이면 배타 규칙에 걸리지 않는다", () => {
    expect(readCyclicIdOptions({ preset: "int8", max: undefined })).toEqual({
      min: -128,
      max: 127,
      start: 0,
      step: 1,
    });
  });
});

describe("잘못된 값은 RangeError다", () => {
  const invalid: [string, unknown][] = [
    ["null 옵션", null],
    ["배열 옵션", []],
    ["문자열 옵션", "int32"],
    ["알 수 없는 키", { max: 5, typo: 1 }],
    ["값이 undefined인 알 수 없는 키", { max: 5, typo: undefined }],
    ["카운터 옵션 prefix는 순환 옵션이 아니다", { max: 5, prefix: "a" }],
    ["카운터 옵션 separator는 순환 옵션이 아니다", { max: 5, separator: "-" }],
    ["카운터 옵션 radix는 순환 옵션이 아니다", { max: 5, radix: 16 }],
    ["카운터 옵션 pad는 순환 옵션이 아니다", { max: 5, pad: 4 }],
    ["카운터 옵션 case는 순환 옵션이 아니다", { max: 5, case: "upper" }],
    ["preset 이름 아님", { preset: "int64" }],
    ["preset null", { preset: null }],
    ["max 문자열", { max: "5" }],
    ["max 소수", { max: 5.5 }],
    ["max NaN", { max: Number.NaN }],
    ["max Infinity", { max: Number.POSITIVE_INFINITY }],
    ["max safe integer 초과", { max: 2 ** 53 }],
    ["max null", { max: null }],
    ["max valueOf 객체", { max: { valueOf: () => 5 } }],
    ["min > max", { min: 5, max: 4 }],
    ["범위 크기 초과(양쪽)", { min: -1, max: MAX }],
    ["범위 크기 초과(MAX_SAFE_INTEGER + 1)", { min: -MAX, max: 0 }],
    ["start 범위 위", { max: 5, start: 6 }],
    ["start 범위 아래", { max: 5, start: -1 }],
    ["start 소수", { max: 5, start: 1.5 }],
    ["start null", { max: 5, start: null }],
    ["step 0", { max: 5, step: 0 }],
    ["step -0", { max: 5, step: -0 }],
    ["step 소수", { max: 5, step: 1.5 }],
    ["step 문자열", { max: 5, step: "1" }],
    ["step null", { max: 5, step: null }],
  ];
  for (const [title, options] of invalid) {
    it(title, () => {
      expect(() => readCyclicIdOptions(options)).toThrow(RangeError);
    });
  }
});

describe("resolveRange·readStart", () => {
  it("resolveRange는 기본 step·start를 채운다", () => {
    expect(resolveRange(0, 9, undefined, undefined)).toEqual({
      min: 0,
      max: 9,
      start: 0,
      step: 1,
    });
    expect(resolveRange(3, 9, undefined, -2)).toEqual({
      min: 3,
      max: 9,
      start: 3,
      step: -2,
    });
  });
  it("readStart는 범위 안의 safe integer만 돌려준다", () => {
    expect(readStart(5, 0, 5)).toBe(5);
    expect(readStart(-128, -128, 127)).toBe(-128);
    for (const value of [
      6,
      -1,
      1.5,
      "0",
      null,
      Number.NaN,
      undefined,
      2 ** 53,
    ]) {
      expect(() => readStart(value, 0, 5)).toThrow(RangeError);
    }
  });
});

describe("카운터 옵션 기본값", () => {
  it("옵션이 없으면 [0, MAX_SAFE_INTEGER - 1], 10진법, 패딩 0, 소문자, 접두사 없음이다", () => {
    expect(readCounterIdOptions(undefined)).toEqual({
      range: { min: 0, max: MAX - 1, start: 0, step: 1 },
      prefix: undefined,
      separator: "_",
      radix: 10,
      pad: 0,
      upper: false,
    });
    expect(readCounterIdOptions({})).toEqual(readCounterIdOptions(undefined));
  });
  it("prefix가 있으면 separator 기본값은 _이고 빈 문자열도 받는다", () => {
    expect(readCounterIdOptions({ prefix: "a" }).separator).toBe("_");
    expect(readCounterIdOptions({ prefix: "a", separator: "" }).separator).toBe(
      "",
    );
    expect(
      readCounterIdOptions({ prefix: "a", separator: "-" }).separator,
    ).toBe("-");
  });
  it("radix 2와 36, pad 0과 64를 받는다", () => {
    expect(readCounterIdOptions({ radix: 2 }).radix).toBe(2);
    expect(readCounterIdOptions({ radix: 36 }).radix).toBe(36);
    expect(readCounterIdOptions({ pad: 0 }).pad).toBe(0);
    expect(readCounterIdOptions({ pad: 64 }).pad).toBe(64);
  });
  it("min은 0과 MAX_SAFE_INTEGER를 받는다", () => {
    expect(readCounterIdOptions({ min: 0, max: 99 }).range).toEqual({
      min: 0,
      max: 99,
      start: 0,
      step: 1,
    });
    expect(readCounterIdOptions({ min: MAX, max: MAX }).range).toEqual({
      min: MAX,
      max: MAX,
      start: MAX,
      step: 1,
    });
  });
  it("case는 radix > 10일 때만 받고 upper만 true다", () => {
    expect(readCounterIdOptions({ radix: 11, case: "upper" }).upper).toBe(true);
    expect(readCounterIdOptions({ radix: 36, case: "lower" }).upper).toBe(
      false,
    );
    expect(readCounterIdOptions({ radix: 36 }).upper).toBe(false);
  });
  it("radix<=10에서 case 값의 타입도 잘못됐으면 게이트 오류를 먼저 던진다", () => {
    expect(() => readCounterIdOptions({ case: 1 })).toThrow(
      "case is only allowed when radix is greater than 10",
    );
  });
  it("min이 양수면 start는 min이고, 범위 규칙은 순환과 같다", () => {
    expect(readCounterIdOptions({ min: 5 }).range).toEqual({
      min: 5,
      max: MAX - 1,
      start: 5,
      step: 1,
    });
    expect(readCounterIdOptions({ max: 4294967295, step: -3 }).range).toEqual({
      min: 0,
      max: 4294967295,
      start: 0,
      step: -3,
    });
  });
  it("CounterIdOptions의 필드가 명세와 같다", () => {
    expectTypeOf<CounterIdOptions>().toEqualTypeOf<{
      prefix?: string;
      separator?: string;
      radix?: number;
      pad?: number;
      case?: "lower" | "upper";
      min?: number;
      max?: number;
      start?: number;
      step?: number;
    }>();
  });
});

describe("카운터 옵션의 잘못된 값은 RangeError다", () => {
  const invalid: [string, unknown][] = [
    ["null 옵션", null],
    ["배열 옵션", []],
    ["문자열 옵션", "36"],
    ["알 수 없는 키", { typo: 1 }],
    ["preset은 카운터 옵션이 아니다", { preset: "uint8" }],
    ["min 음수", { min: -1 }],
    ["min 음수(max 지정)", { min: -1, max: 5 }],
    ["min > max", { min: 5, max: 4 }],
    ["기본 min 0에서 max가 MAX_SAFE_INTEGER면 크기 초과", { max: MAX }],
    ["radix 1", { radix: 1 }],
    ["radix 37", { radix: 37 }],
    ["radix 소수", { radix: 10.5 }],
    ["radix 문자열", { radix: "36" }],
    ["radix null", { radix: null }],
    ["pad 음수", { pad: -1 }],
    ["pad 65", { pad: 65 }],
    ["pad 소수", { pad: 1.5 }],
    ["pad 문자열", { pad: "3" }],
    ["prefix 빈 문자열", { prefix: "" }],
    ["prefix 숫자", { prefix: 1 }],
    ["prefix null", { prefix: null }],
    ["prefix 없이 separator", { separator: "-" }],
    ["separator 숫자", { prefix: "a", separator: 1 }],
    ["radix 10에서 case upper", { case: "upper" }],
    ["radix 10에서 case lower", { radix: 10, case: "lower" }],
    ["case 잘못된 값", { radix: 36, case: "Upper" }],
    ["case null", { radix: 36, case: null }],
    ["step 0", { step: 0 }],
    ["start 범위 밖", { max: 5, start: 6 }],
  ];
  for (const [title, options] of invalid) {
    it(title, () => {
      expect(() => readCounterIdOptions(options)).toThrow(RangeError);
    });
  }
});
