/**
 * `uuid/format-options.ts`(UUID 형식 옵션의 검증·정규화와 형식 위반의 throw)를 검증한다.
 * 이 파일은 오류 메시지 문구를 가진 비대상 파일이라서 `describe`를 써도 된다. mutation 대상인 `format.ts`를
 * 직접 커버하는 테스트는 `format.test.ts`(최상위 `it`)가 맡는다.
 * `uuidv4`·`uuidv7` 팩토리는 자기 옵션 키를 `readOptions`로 읽은 뒤 `dashes`·`case` 원시값을 `resolveUuidFormat`에 넘긴다.
 * 그 재사용 형태를 이 파일이 고정한다.
 */
import { describe, expect, it } from "vitest";
import {
  UUID_BYTE_LENGTH,
  UUID_FORMAT_KEYS,
  assertUuidBytes,
  assertUuidHex,
  readIsUuidOptions,
  readUuidFormat,
  resolveUuidFormat,
} from "../../../src/id/uuid/format-options.js";
import { readOptions } from "../../../src/internal/validate.js";
import { captureThrown } from "../../helpers/capture-thrown.js";

/** `RangeError`로 거부해야 하는 옵션 인자(객체가 아닌 값). `undefined`는 옵션 없음이라 유효하므로 넣지 않는다. */
const nonObjectOptions: [label: string, value: unknown][] = [
  ["null", null],
  ["배열", []],
  ["함수", () => ({})],
  ["문자열", "dashes"],
  ["숫자", 1],
  ["boolean", true],
  ["bigint", 1n],
  ["symbol", Symbol("options")],
];

/** `dashes`로 거부해야 하는 값. boolean만 허용한다. */
const invalidDashes: [label: string, value: unknown][] = [
  ["null", null],
  ["문자열 true", "true"],
  ["문자열 false", "false"],
  ["숫자 1", 1],
  ["숫자 0", 0],
  ["빈 문자열", ""],
  ["빈 객체", {}],
  ["배열", [true]],
  ["Boolean 객체", new Boolean(true)],
];

/** `case`로 거부해야 하는 값. `"lower"`, `"upper"` 두 문자열만 허용한다. */
const invalidCases: [label: string, value: unknown][] = [
  ["null", null],
  ["대문자 표기 Lower", "Lower"],
  ["대문자 표기 UPPER", "UPPER"],
  ["mixed", "mixed"],
  ["빈 문자열", ""],
  ["공백이 붙은 upper", " upper"],
  ["숫자", 1],
  ["boolean", true],
  ["배열", ["lower"]],
  ["String 객체", new String("lower")],
];

/** `version`으로 거부해야 하는 값. 1~8의 정수(숫자)만 허용한다. */
const invalidVersions: [label: string, value: unknown][] = [
  ["0", 0],
  ["9", 9],
  ["-1", -1],
  ["소수 4.5", 4.5],
  ["숫자 문자열 4", "4"],
  ["null", null],
  ["NaN", Number.NaN],
  ["Infinity", Number.POSITIVE_INFINITY],
  ["boolean", true],
  ["배열", [4]],
  ["빈 객체", {}],
  ["valueOf를 가진 객체", { valueOf: () => 4 }],
  ["bigint", 4n],
];

describe("UUID_FORMAT_KEYS", () => {
  it("형식 옵션의 키는 dashes와 case이다", () => {
    expect([...UUID_FORMAT_KEYS]).toEqual(["dashes", "case"]);
  });
});

describe("resolveUuidFormat", () => {
  it("둘 다 생략하면 대시 있는 소문자다", () => {
    expect(resolveUuidFormat(undefined, undefined)).toEqual({
      dashes: true,
      upper: false,
    });
  });

  it("dashes와 case의 네 조합을 정규화한다", () => {
    expect(resolveUuidFormat(true, "lower")).toEqual({
      dashes: true,
      upper: false,
    });
    expect(resolveUuidFormat(true, "upper")).toEqual({
      dashes: true,
      upper: true,
    });
    expect(resolveUuidFormat(false, "lower")).toEqual({
      dashes: false,
      upper: false,
    });
    expect(resolveUuidFormat(false, "upper")).toEqual({
      dashes: false,
      upper: true,
    });
  });

  it("한쪽만 지정하면 나머지는 기본값이다", () => {
    expect(resolveUuidFormat(false, undefined)).toEqual({
      dashes: false,
      upper: false,
    });
    expect(resolveUuidFormat(undefined, "upper")).toEqual({
      dashes: true,
      upper: true,
    });
  });

  for (const [label, value] of invalidDashes) {
    it(`dashes가 ${label}이면 RangeError다`, () => {
      expect(
        captureThrown(() => resolveUuidFormat(value, undefined)),
      ).toBeInstanceOf(RangeError);
    });
  }

  for (const [label, value] of invalidCases) {
    it(`case가 ${label}이면 RangeError다`, () => {
      expect(
        captureThrown(() => resolveUuidFormat(undefined, value)),
      ).toBeInstanceOf(RangeError);
    });
  }

  it("잘못된 값은 TypeError가 아니라 RangeError다", () => {
    for (const [, value] of invalidDashes) {
      expect(
        captureThrown(() => resolveUuidFormat(value, "lower")),
      ).not.toBeInstanceOf(TypeError);
    }
    for (const [, value] of invalidCases) {
      expect(
        captureThrown(() => resolveUuidFormat(true, value)),
      ).not.toBeInstanceOf(TypeError);
    }
  });
});

describe("readUuidFormat", () => {
  it("옵션이 없으면 기본 형식이다", () => {
    expect(readUuidFormat(undefined)).toEqual({ dashes: true, upper: false });
    expect(readUuidFormat({})).toEqual({ dashes: true, upper: false });
  });

  it("값이 undefined인 키는 생략과 같다", () => {
    expect(readUuidFormat({ dashes: undefined, case: undefined })).toEqual({
      dashes: true,
      upper: false,
    });
  });

  it("dashes와 case를 읽는다", () => {
    expect(readUuidFormat({ dashes: false, case: "upper" })).toEqual({
      dashes: false,
      upper: true,
    });
  });

  for (const [label, value] of nonObjectOptions) {
    it(`옵션이 ${label}이면 RangeError다`, () => {
      expect(captureThrown(() => readUuidFormat(value))).toBeInstanceOf(
        RangeError,
      );
    });
  }

  it("알 수 없는 키는 RangeError다(오타, 다른 옵션 종류의 키 포함)", () => {
    for (const options of [
      { dash: false },
      { Case: "upper" },
      { version: 4 },
      { randomBytes: () => new Uint8Array(16) },
      { dashes: true, extra: undefined },
    ]) {
      expect(captureThrown(() => readUuidFormat(options))).toBeInstanceOf(
        RangeError,
      );
    }
  });

  it("dashes가 잘못됐으면 RangeError다", () => {
    for (const [, value] of invalidDashes) {
      expect(
        captureThrown(() => readUuidFormat({ dashes: value })),
      ).toBeInstanceOf(RangeError);
    }
  });

  it("case가 잘못됐으면 RangeError다", () => {
    for (const [, value] of invalidCases) {
      expect(
        captureThrown(() => readUuidFormat({ case: value })),
      ).toBeInstanceOf(RangeError);
    }
  });
});

describe("팩토리 옵션에서의 재사용", () => {
  // `randomBytes`·`now`를 함께 받는 팩토리 옵션은 키 목록을 늘려 읽은 뒤 dashes·case 원시값을 넘긴다.
  const factoryKeys = [...UUID_FORMAT_KEYS, "randomBytes", "now"] as const;

  it("키 목록을 늘려 읽고 dashes·case 원시값을 resolveUuidFormat에 넘기면 같은 형식이 된다", () => {
    const raw = readOptions(
      { dashes: false, case: "upper", randomBytes: () => new Uint8Array(16) },
      factoryKeys,
    );

    expect(resolveUuidFormat(raw.dashes, raw.case)).toEqual({
      dashes: false,
      upper: true,
    });
    expect(typeof raw.randomBytes).toBe("function");
  });

  it("dashes·case를 생략한 팩토리 옵션은 기본 형식이다", () => {
    const raw = readOptions({ now: () => 0 }, factoryKeys);

    expect(resolveUuidFormat(raw.dashes, raw.case)).toEqual({
      dashes: true,
      upper: false,
    });
  });

  it("팩토리 옵션의 잘못된 dashes·case도 RangeError다", () => {
    const badDashes = readOptions({ dashes: "yes" }, factoryKeys);
    const badCase = readOptions({ case: "Upper" }, factoryKeys);

    expect(
      captureThrown(() => resolveUuidFormat(badDashes.dashes, badDashes.case)),
    ).toBeInstanceOf(RangeError);
    expect(
      captureThrown(() => resolveUuidFormat(badCase.dashes, badCase.case)),
    ).toBeInstanceOf(RangeError);
  });
});

describe("readIsUuidOptions", () => {
  it("옵션이 없으면 대시 있는 형식이고 version 제한이 없다", () => {
    for (const options of [
      undefined,
      {},
      { dashes: undefined, version: undefined },
    ]) {
      const read = readIsUuidOptions(options);

      expect(read.dashes).toBe(true);
      expect(read.version).toBeUndefined();
    }
  });

  it("dashes를 읽는다", () => {
    expect(readIsUuidOptions({ dashes: false }).dashes).toBe(false);
    expect(readIsUuidOptions({ dashes: true }).dashes).toBe(true);
  });

  for (const version of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`version ${version}을 읽는다`, () => {
      expect(readIsUuidOptions({ version }).version).toBe(version);
    });
  }

  for (const [label, value] of invalidVersions) {
    it(`version이 ${label}이면 RangeError다`, () => {
      expect(
        captureThrown(() => readIsUuidOptions({ version: value })),
      ).toBeInstanceOf(RangeError);
    });
  }

  for (const [label, value] of invalidDashes) {
    it(`dashes가 ${label}이면 RangeError다`, () => {
      expect(
        captureThrown(() => readIsUuidOptions({ dashes: value })),
      ).toBeInstanceOf(RangeError);
    });
  }

  for (const [label, value] of nonObjectOptions) {
    it(`옵션이 ${label}이면 RangeError다`, () => {
      expect(captureThrown(() => readIsUuidOptions(value))).toBeInstanceOf(
        RangeError,
      );
    });
  }

  it("알 수 없는 키는 RangeError다(case는 isUuid 옵션이 아니다)", () => {
    for (const options of [{ case: "upper" }, { ver: 4 }, { format: {} }]) {
      expect(captureThrown(() => readIsUuidOptions(options))).toBeInstanceOf(
        RangeError,
      );
    }
  });
});

describe("assertUuidHex", () => {
  it("문자열이면 통과한다", () => {
    expect(() =>
      assertUuidHex("0123456789abcdef0123456789abcdef"),
    ).not.toThrow();
  });

  it("undefined이면 RangeError다", () => {
    expect(captureThrown(() => assertUuidHex(undefined))).toBeInstanceOf(
      RangeError,
    );
  });
});

describe("UUID_BYTE_LENGTH", () => {
  it("UUID는 16바이트(128비트)이다", () => {
    expect(UUID_BYTE_LENGTH).toBe(16);
  });
});

describe("assertUuidBytes", () => {
  it("길이 16의 Uint8Array는 통과한다(하위 클래스, Buffer, byteOffset이 있는 view 포함)", () => {
    class TaggedBytes extends Uint8Array {}

    expect(() => assertUuidBytes(new Uint8Array(16))).not.toThrow();
    expect(() => assertUuidBytes(new TaggedBytes(16))).not.toThrow();
    expect(() => assertUuidBytes(Buffer.alloc(16))).not.toThrow();
    expect(() =>
      assertUuidBytes(new Uint8Array(32).subarray(8, 24)),
    ).not.toThrow();
  });

  const invalid: [label: string, value: unknown][] = [
    ["길이 15", new Uint8Array(15)],
    ["길이 17", new Uint8Array(17)],
    ["빈 Uint8Array", new Uint8Array(0)],
    ["숫자 Array(16)", new Array<number>(16).fill(0)],
    ["Uint16Array(16)", new Uint16Array(16)],
    ["null", null],
    ["undefined", undefined],
    ["문자열", "0123456789abcdef"],
  ];
  for (const [label, value] of invalid) {
    it(`${label}이면 RangeError다`, () => {
      const thrown = captureThrown(() => assertUuidBytes(value));

      expect(thrown).toBeInstanceOf(RangeError);
      expect(thrown).not.toBeInstanceOf(TypeError);
    });
  }
});
