/**
 * `id/random-id-options.ts`(무작위 ID 옵션의 읽기·검증·정규화)를 검증한다.
 * 이 파일이 다루는 소스는 mutation 대상이 아니라서 `describe`로 묶어도 된다.
 *
 * 검증 대상: 옵션 읽기 규칙(한 번 읽기, `undefined` 값, 알 수 없는 키, 비객체), 값 검증, 상호 배타·종속 규칙,
 * 기본값, preset 표 적용, `bits`→길이 변환, `startWithLetter` 규칙, 정규화 결과의 형태.
 * 조립·재시도는 이 파일의 범위가 아니다.
 *
 * `bits` 변환의 기대값은 구현과 무관하게 BigInt로 계산한다(`n^length >= 2^bits`이고 `n^(length-1) < 2^bits`).
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  readRandomIdFactoryOptions,
  readRandomIdOptions,
  type RandomIdFactoryOptions,
  type RandomIdOptions,
  type RandomIdPreset,
  type ResolvedRandomIdOptions,
} from "../../src/id/random-id-options.js";
import { captureThrown } from "../helpers/capture-thrown.js";

/** base64url 문자 집합. 구현의 상수를 가져오지 않고 다시 적어 기본 preset이 바뀌면 실패하게 한다. */
const BASE64URL =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** ASCII 영문자 52자(대문자 뒤 소문자). `startWithLetter`가 base64url에서 고르는 글자다. */
const BASE64URL_LETTERS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** 옵션을 주지 않았을 때의 정규화 결과. 나머지 테스트가 이 값을 기준으로 한 항목씩 바꾼다. */
const defaults: ResolvedRandomIdOptions = {
  chars: Array.from(BASE64URL),
  length: 21,
  letters: undefined,
  prefix: undefined,
  separator: "_",
  timestamp: false,
  now: undefined,
  group: undefined,
  groupSeparator: "-",
  isTaken: undefined,
  maxAttempts: 10,
  randomBytes: undefined,
};

/** 일회성 `randomId`가 받는 옵션 키 13개. */
const oneShotKeys: (keyof RandomIdOptions)[] = [
  "prefix",
  "separator",
  "length",
  "bits",
  "preset",
  "alphabet",
  "case",
  "group",
  "groupSeparator",
  "startWithLetter",
  "timestamp",
  "isTaken",
  "maxAttempts",
];

/** 팩토리만 받는 주입 키 2개. */
const injectionKeys: (keyof RandomIdFactoryOptions)[] = ["randomBytes", "now"];

/** 두 진입점을 같은 표로 돌리기 위한 목록. 팩토리 전용 키가 있는 표는 팩토리만 쓴다. */
const readers: [label: string, read: (options?: unknown) => unknown][] = [
  ["randomId", (options) => readRandomIdOptions(options)],
  ["팩토리", (options) => readRandomIdFactoryOptions(options)],
];

/** 정수 옵션이 거부해야 하는 값(범위와 무관하게 타입·형태가 틀린 값). */
const nonIntegers: [label: string, value: unknown][] = [
  ["숫자 문자열", "8"],
  ["소수", 1.5],
  ["NaN", Number.NaN],
  ["Infinity", Number.POSITIVE_INFINITY],
  ["-Infinity", Number.NEGATIVE_INFINITY],
  ["null", null],
  ["빈 객체", {}],
  ["배열", [8]],
  ["boolean", true],
  ["bigint", 8n],
  ["valueOf를 가진 객체", { valueOf: () => 8 }],
  ["safe integer 초과", 2 ** 53],
];

/** 문자열 옵션이 거부해야 하는 값. */
const nonStrings: [label: string, value: unknown][] = [
  ["null", null],
  ["숫자", 1],
  ["boolean", true],
  ["빈 객체", {}],
  ["배열", ["-"]],
  ["String 객체", new String("-")],
  ["symbol", Symbol("-")],
];

/** boolean 옵션이 거부해야 하는 값. */
const nonBooleans: [label: string, value: unknown][] = [
  ["null", null],
  ["문자열 true", "true"],
  ["숫자 1", 1],
  ["숫자 0", 0],
  ["빈 문자열", ""],
  ["빈 객체", {}],
  ["Boolean 객체", new Boolean(true)],
];

/** 함수 옵션이 거부해야 하는 값. */
const nonFunctions: [label: string, value: unknown][] = [
  ["null", null],
  ["숫자", 1],
  ["문자열", "isTaken"],
  ["boolean", true],
  ["빈 객체", {}],
  ["배열", []],
];

/** 검증을 통과하는 `isTaken`. 옵션 정규화는 함수를 호출하지 않아 반환값은 쓰지 않는다. */
const isTakenStub = (): boolean => false;

/** 검증을 통과하는 주입 난수원. */
const randomBytesStub = (length: number): Uint8Array => new Uint8Array(length);

/** 검증을 통과하는 주입 시계. */
const nowStub = (): number => 0;

/** 코드 포인트가 겹치지 않는 크기 `size`의 문자 집합을 만든다(짝 없는 서로게이트 없음). */
function makeAlphabet(size: number): string {
  let out = "";
  for (let i = 0; i < size; i += 1) {
    out += String.fromCodePoint(0x41 + i);
  }
  return out;
}

/** ASCII 영문자가 정확히 `letters`개이고 크기가 `size`인 문자 집합을 만든다. */
function makeAlphabetWithLetters(size: number, letters: number): string {
  let out = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".slice(
    0,
    letters,
  );
  for (let i = 0; i < size - letters; i += 1) {
    out += String.fromCodePoint(0xc0 + i);
  }
  return out;
}

/**
 * BigInt로 계산한 최소 길이 표(인덱스 = bits). 구현과 독립적인 기준이다.
 * `first`가 `undefined`이면 모든 자리가 `size`개 중 하나이고(경우의 수 `size^length`),
 * 숫자이면 첫 자리가 `first`개로 제한된다(경우의 수 `first * size^(length-1)`).
 * 최소 길이는 경우의 수가 `2^bits` 이상이 되는 첫 길이다.
 */
function minimalLengths(
  size: number,
  maxBits: number,
  first: number | undefined,
): number[] {
  const factor = BigInt(size);
  let capacity = first === undefined ? 1n : BigInt(first);
  let length = first === undefined ? 0 : 1;
  const out: number[] = [];
  for (let bits = 1; bits <= maxBits; bits += 1) {
    const target = 1n << BigInt(bits);
    while (capacity < target) {
      capacity *= factor;
      length += 1;
    }
    out[bits] = length;
  }
  return out;
}

/** 길이를 돌려주거나 `RangeError`로 실패하면 문자열 `"RangeError"`를 돌려준다(표 순회용). */
function lengthOrError(action: () => ResolvedRandomIdOptions): number | string {
  try {
    return action().length;
  } catch (error) {
    return error instanceof RangeError ? "RangeError" : String(error);
  }
}

describe("기본값", () => {
  it("옵션이 없으면 base64url 21자에 기본 구분자를 쓴다", () => {
    expect(readRandomIdOptions(undefined)).toStrictEqual(defaults);
  });

  it("빈 객체는 옵션 없음과 같다", () => {
    expect(readRandomIdOptions({})).toStrictEqual(defaults);
  });

  it("팩토리도 같은 기본값을 쓴다(주입 없음)", () => {
    expect(readRandomIdFactoryOptions(undefined)).toStrictEqual(defaults);
    expect(readRandomIdFactoryOptions({})).toStrictEqual(defaults);
  });

  it("기본 문자 집합은 base64url 64자다", () => {
    expect(readRandomIdOptions(undefined).chars).toEqual(Array.from(BASE64URL));
    expect(readRandomIdOptions(undefined).chars).toHaveLength(64);
  });
});

describe("타입", () => {
  it("RandomIdOptions의 필드가 명세와 같다", () => {
    expectTypeOf<RandomIdOptions>().toEqualTypeOf<{
      prefix?: string;
      separator?: string;
      length?: number;
      bits?: number;
      preset?: RandomIdPreset;
      alphabet?: string;
      case?: "lower" | "upper";
      group?: number;
      groupSeparator?: string;
      startWithLetter?: boolean;
      timestamp?: boolean;
      isTaken?: (id: string) => boolean;
      maxAttempts?: number;
    }>();
  });

  it("RandomIdFactoryOptions는 주입 두 개를 더한 타입이다", () => {
    expectTypeOf<RandomIdFactoryOptions>().toEqualTypeOf<{
      prefix?: string;
      separator?: string;
      length?: number;
      bits?: number;
      preset?: RandomIdPreset;
      alphabet?: string;
      case?: "lower" | "upper";
      group?: number;
      groupSeparator?: string;
      startWithLetter?: boolean;
      timestamp?: boolean;
      isTaken?: (id: string) => boolean;
      maxAttempts?: number;
      randomBytes?: (length: number) => Uint8Array;
      now?: () => number;
    }>();
  });

  it("RandomIdPreset은 다섯 이름의 유니온이다", () => {
    expectTypeOf<RandomIdPreset>().toEqualTypeOf<
      "base64url" | "base62" | "base36" | "digits" | "readable"
    >();
  });
});

describe("옵션 읽기 규칙", () => {
  it.each(readers)("%s: 알 수 없는 키는 RangeError다", (_label, read) => {
    expect(captureThrown(() => read({ typo: 1 }))).toBeInstanceOf(RangeError);
    expect(captureThrown(() => read({ length: 8, Length: 8 }))).toBeInstanceOf(
      RangeError,
    );
    expect(captureThrown(() => read({ typo: undefined }))).toBeInstanceOf(
      RangeError,
    );
  });

  it.each(oneShotKeys)("%s의 값이 undefined이면 생략과 같다", (key) => {
    expect(readRandomIdOptions({ [key]: undefined })).toStrictEqual(defaults);
  });

  it.each(injectionKeys)(
    "팩토리에서 %s의 값이 undefined이면 생략과 같다",
    (key) => {
      expect(readRandomIdFactoryOptions({ [key]: undefined })).toStrictEqual(
        defaults,
      );
    },
  );

  it.each(oneShotKeys)("%s의 값이 null이면 RangeError다", (key) => {
    expect(
      captureThrown(() => readRandomIdOptions({ [key]: null })),
    ).toBeInstanceOf(RangeError);
  });

  it.each(injectionKeys)(
    "팩토리에서 %s의 값이 null이면 RangeError다",
    (key) => {
      expect(
        captureThrown(() =>
          readRandomIdFactoryOptions({ [key]: null, timestamp: true }),
        ),
      ).toBeInstanceOf(RangeError);
    },
  );
});

describe("주입 옵션의 진입점 구분", () => {
  it.each(injectionKeys)("일회성 옵션의 %s는 알 수 없는 키다", (key) => {
    expect(
      captureThrown(() =>
        readRandomIdOptions({ [key]: () => 0, timestamp: true }),
      ),
    ).toBeInstanceOf(RangeError);
  });

  it("팩토리는 주입한 함수를 그대로 담는다", () => {
    const resolved = readRandomIdFactoryOptions({
      randomBytes: randomBytesStub,
      now: nowStub,
      timestamp: true,
    });
    expect(resolved.randomBytes).toBe(randomBytesStub);
    expect(resolved.now).toBe(nowStub);
    expect(resolved.timestamp).toBe(true);
  });

  it.each(nonFunctions)(
    "randomBytes가 %s이면 RangeError다",
    (_label, value) => {
      expect(
        captureThrown(() => readRandomIdFactoryOptions({ randomBytes: value })),
      ).toBeInstanceOf(RangeError);
    },
  );

  it.each(nonFunctions)("now가 %s이면 RangeError다", (_label, value) => {
    expect(
      captureThrown(() =>
        readRandomIdFactoryOptions({ now: value, timestamp: true }),
      ),
    ).toBeInstanceOf(RangeError);
  });

  it("주입 옵션을 검증할 때 함수를 호출하지 않는다", () => {
    let calls = 0;
    readRandomIdFactoryOptions({
      timestamp: true,
      randomBytes: (length: number) => {
        calls += 1;
        return new Uint8Array(length);
      },
      now: () => {
        calls += 1;
        return 0;
      },
      isTaken: () => {
        calls += 1;
        return false;
      },
    });
    expect(calls).toBe(0);
  });
});

describe("문자열·boolean·함수 옵션", () => {
  it("prefix는 결과에 그대로 담긴다", () => {
    expect(readRandomIdOptions({ prefix: "usr" }).prefix).toBe("usr");
  });

  it("빈 prefix는 RangeError다", () => {
    expect(
      captureThrown(() => readRandomIdOptions({ prefix: "" })),
    ).toBeInstanceOf(RangeError);
  });

  it.each(nonStrings)("prefix가 %s이면 RangeError다", (_label, value) => {
    expect(
      captureThrown(() => readRandomIdOptions({ prefix: value })),
    ).toBeInstanceOf(RangeError);
  });

  it.each(nonStrings)("separator가 %s이면 RangeError다", (_label, value) => {
    expect(
      captureThrown(() =>
        readRandomIdOptions({ prefix: "usr", separator: value }),
      ),
    ).toBeInstanceOf(RangeError);
  });

  it.each(nonStrings)(
    "groupSeparator가 %s이면 RangeError다",
    (_label, value) => {
      expect(
        captureThrown(() =>
          readRandomIdOptions({ group: 4, groupSeparator: value }),
        ),
      ).toBeInstanceOf(RangeError);
    },
  );

  it("separator와 groupSeparator는 빈 문자열도 받는다", () => {
    const resolved = readRandomIdOptions({
      prefix: "usr",
      separator: "",
      group: 4,
      groupSeparator: "",
    });
    expect(resolved.separator).toBe("");
    expect(resolved.groupSeparator).toBe("");
  });

  it("구분자는 문자 집합과 겹쳐도 된다", () => {
    const resolved = readRandomIdOptions({
      prefix: "usr",
      separator: "_",
      group: 4,
      groupSeparator: "-",
    });
    expect(resolved.separator).toBe("_");
    expect(resolved.groupSeparator).toBe("-");
  });

  it.each(nonBooleans)("timestamp가 %s이면 RangeError다", (_label, value) => {
    expect(
      captureThrown(() => readRandomIdOptions({ timestamp: value })),
    ).toBeInstanceOf(RangeError);
  });

  it.each(nonBooleans)(
    "startWithLetter가 %s이면 RangeError다",
    (_label, value) => {
      expect(
        captureThrown(() => readRandomIdOptions({ startWithLetter: value })),
      ).toBeInstanceOf(RangeError);
    },
  );

  it.each(nonFunctions)("isTaken이 %s이면 RangeError다", (_label, value) => {
    expect(
      captureThrown(() => readRandomIdOptions({ isTaken: value })),
    ).toBeInstanceOf(RangeError);
  });

  it("isTaken은 결과에 같은 참조로 담긴다", () => {
    expect(readRandomIdOptions({ isTaken: isTakenStub }).isTaken).toBe(
      isTakenStub,
    );
  });
});

describe("정수 옵션", () => {
  it.each(nonIntegers)("length가 %s이면 RangeError다", (_label, value) => {
    expect(
      captureThrown(() => readRandomIdOptions({ length: value })),
    ).toBeInstanceOf(RangeError);
  });

  it.each([
    ["0", 0],
    ["-0", -0],
    ["음수", -1],
    ["상한 초과(1025)", 1025],
  ] as [label: string, value: number][])(
    "length가 %s이면 RangeError다",
    (_label, value) => {
      expect(
        captureThrown(() => readRandomIdOptions({ length: value })),
      ).toBeInstanceOf(RangeError);
    },
  );

  it.each([1, 2, 21, 1023, 1024])("length %i는 그대로 쓴다", (length) => {
    expect(readRandomIdOptions({ length }).length).toBe(length);
  });

  it.each(nonIntegers)("bits가 %s이면 RangeError다", (_label, value) => {
    expect(
      captureThrown(() => readRandomIdOptions({ bits: value })),
    ).toBeInstanceOf(RangeError);
  });

  it.each([
    ["0", 0],
    ["음수", -1],
    ["상한 초과(4097)", 4097],
  ] as [label: string, value: number][])(
    "bits가 %s이면 RangeError다",
    (_label, value) => {
      expect(
        captureThrown(() => readRandomIdOptions({ bits: value })),
      ).toBeInstanceOf(RangeError);
    },
  );

  it("bits 1과 4096은 받는다", () => {
    expect(readRandomIdOptions({ bits: 1 }).length).toBe(1);
    expect(readRandomIdOptions({ bits: 4096 }).length).toBe(683);
  });

  it.each(nonIntegers)("maxAttempts가 %s이면 RangeError다", (_label, value) => {
    expect(
      captureThrown(() =>
        readRandomIdOptions({ isTaken: isTakenStub, maxAttempts: value }),
      ),
    ).toBeInstanceOf(RangeError);
  });

  it.each([
    ["0", 0],
    ["음수", -1],
    ["상한 초과(1001)", 1001],
  ] as [label: string, value: number][])(
    "maxAttempts가 %s이면 RangeError다",
    (_label, value) => {
      expect(
        captureThrown(() =>
          readRandomIdOptions({ isTaken: isTakenStub, maxAttempts: value }),
        ),
      ).toBeInstanceOf(RangeError);
    },
  );

  it.each([1, 10, 999, 1000])("maxAttempts %i는 그대로 쓴다", (maxAttempts) => {
    expect(
      readRandomIdOptions({ isTaken: isTakenStub, maxAttempts }).maxAttempts,
    ).toBe(maxAttempts);
  });

  it("maxAttempts의 기본값은 10이다", () => {
    expect(readRandomIdOptions({ isTaken: isTakenStub }).maxAttempts).toBe(10);
  });

  it.each(nonIntegers)("group이 %s이면 RangeError다", (_label, value) => {
    expect(
      captureThrown(() => readRandomIdOptions({ group: value })),
    ).toBeInstanceOf(RangeError);
  });

  it.each([
    ["0", 0],
    ["음수", -1],
  ] as [label: string, value: number][])(
    "group이 %s이면 RangeError다",
    (_label, value) => {
      expect(
        captureThrown(() => readRandomIdOptions({ group: value })),
      ).toBeInstanceOf(RangeError);
    },
  );

  it("group은 무작위 부분 길이 이하여야 한다", () => {
    expect(readRandomIdOptions({ length: 10, group: 10 }).group).toBe(10);
    expect(
      captureThrown(() => readRandomIdOptions({ length: 10, group: 11 })),
    ).toBeInstanceOf(RangeError);
    expect(readRandomIdOptions({ group: 21 }).group).toBe(21);
    expect(
      captureThrown(() => readRandomIdOptions({ group: 22 })),
    ).toBeInstanceOf(RangeError);
  });

  it("group의 상한은 bits로 변환한 길이를 따른다", () => {
    // digits 20비트는 7자다(10^7 >= 2^20 > 10^6).
    expect(readRandomIdOptions({ preset: "digits", bits: 20 }).length).toBe(7);
    expect(
      readRandomIdOptions({ preset: "digits", bits: 20, group: 7 }).group,
    ).toBe(7);
    expect(
      captureThrown(() =>
        readRandomIdOptions({ preset: "digits", bits: 20, group: 8 }),
      ),
    ).toBeInstanceOf(RangeError);
  });
});

describe("상호 배타 규칙", () => {
  it("length와 bits는 함께 쓸 수 없다", () => {
    expect(
      captureThrown(() => readRandomIdOptions({ length: 8, bits: 64 })),
    ).toBeInstanceOf(RangeError);
  });

  it("preset과 alphabet은 함께 쓸 수 없다", () => {
    expect(
      captureThrown(() =>
        readRandomIdOptions({ preset: "base62", alphabet: "abc" }),
      ),
    ).toBeInstanceOf(RangeError);
  });

  it("한쪽이 undefined이면 배타 규칙에 걸리지 않는다", () => {
    expect(readRandomIdOptions({ length: 8, bits: undefined }).length).toBe(8);
    expect(
      readRandomIdOptions({ preset: "base62", alphabet: undefined }).chars,
    ).toHaveLength(62);
  });
});

describe("종속 규칙", () => {
  const violations: [label: string, options: unknown][] = [
    ["separator만 지정", { separator: "-" }],
    ["separator + timestamp: false", { separator: "-", timestamp: false }],
    ["groupSeparator만 지정", { groupSeparator: "." }],
    ["maxAttempts만 지정", { maxAttempts: 3 }],
    ["case + 기본 preset", { case: "upper" }],
    ["case + base64url", { preset: "base64url", case: "lower" }],
    ["case + base62", { preset: "base62", case: "upper" }],
    ["case + digits", { preset: "digits", case: "upper" }],
    ["case + alphabet", { alphabet: "abcdef", case: "upper" }],
  ];

  it.each(violations)("%s는 RangeError다", (_label, options) => {
    expect(captureThrown(() => readRandomIdOptions(options))).toBeInstanceOf(
      RangeError,
    );
  });

  it("preset이 case를 허용하지 않고 case 값의 타입도 잘못됐으면 게이트 오류를 먼저 던진다", () => {
    expect(() => readRandomIdOptions({ case: 1 })).toThrow(
      "case is only allowed with the base36 and readable presets",
    );
  });

  const factoryViolations: [label: string, options: unknown][] = [
    ["now만 지정", { now: nowStub }],
    ["now + timestamp: false", { now: nowStub, timestamp: false }],
  ];

  it.each(factoryViolations)(
    "팩토리에서 %s는 RangeError다",
    (_label, options) => {
      expect(
        captureThrown(() => readRandomIdFactoryOptions(options)),
      ).toBeInstanceOf(RangeError);
    },
  );

  const allowed: [label: string, options: RandomIdOptions][] = [
    ["separator + prefix", { prefix: "usr", separator: "-" }],
    ["separator + timestamp", { timestamp: true, separator: "-" }],
    ["groupSeparator + group", { group: 4, groupSeparator: "." }],
    ["maxAttempts + isTaken", { isTaken: isTakenStub, maxAttempts: 3 }],
    ["case + base36", { preset: "base36", case: "upper" }],
    ["case + readable", { preset: "readable", case: "lower" }],
  ];

  it.each(allowed)("%s는 허용한다", (_label, options) => {
    expect(() => readRandomIdOptions(options)).not.toThrow();
  });

  it("now는 timestamp: true일 때만 쓸 수 있다", () => {
    expect(
      readRandomIdFactoryOptions({ timestamp: true, now: nowStub }).now,
    ).toBe(nowStub);
  });
});

describe("preset과 alphabet", () => {
  const presets: [preset: RandomIdPreset, size: number, alphabet: string][] = [
    ["base64url", 64, BASE64URL],
    [
      "base62",
      62,
      "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
    ],
    ["base36", 36, "0123456789abcdefghijklmnopqrstuvwxyz"],
    ["digits", 10, "0123456789"],
    ["readable", 32, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"],
  ];

  it.each(presets)("%s는 %i자 문자 집합이다", (preset, size, alphabet) => {
    const resolved = readRandomIdOptions({ preset });
    expect(resolved.chars).toEqual(Array.from(alphabet));
    expect(resolved.chars).toHaveLength(size);
  });

  it("base36의 case: upper는 대문자 표를 쓴다", () => {
    expect(
      readRandomIdOptions({ preset: "base36", case: "upper" }).chars,
    ).toEqual(Array.from("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"));
  });

  it("base36의 case: lower는 기본값과 같다", () => {
    expect(
      readRandomIdOptions({ preset: "base36", case: "lower" }).chars,
    ).toEqual(Array.from("0123456789abcdefghijklmnopqrstuvwxyz"));
  });

  it("readable의 case: lower는 소문자 표를 쓴다", () => {
    expect(
      readRandomIdOptions({ preset: "readable", case: "lower" }).chars,
    ).toEqual(Array.from("abcdefghjklmnpqrstuvwxyz23456789"));
  });

  it("readable의 case: upper는 기본값과 같다", () => {
    expect(
      readRandomIdOptions({ preset: "readable", case: "upper" }).chars,
    ).toEqual(Array.from("ABCDEFGHJKLMNPQRSTUVWXYZ23456789"));
  });

  const invalidPresets: [label: string, value: unknown][] = [
    ["없는 이름", "base64"],
    ["대문자 표기", "BASE36"],
    ["공백이 붙은 이름", " digits"],
    ["빈 문자열", ""],
    ["숫자", 36],
    ["boolean", true],
    ["배열", ["digits"]],
    ["빈 객체", {}],
    ["String 객체", new String("digits")],
  ];

  it.each(invalidPresets)("preset이 %s이면 RangeError다", (_label, value) => {
    expect(
      captureThrown(() => readRandomIdOptions({ preset: value })),
    ).toBeInstanceOf(RangeError);
  });

  const invalidCases: [label: string, value: unknown][] = [
    ["대문자 표기", "Upper"],
    ["mixed", "mixed"],
    ["빈 문자열", ""],
    ["공백이 붙은 값", " upper"],
    ["숫자", 1],
    ["boolean", true],
    ["배열", ["upper"]],
    ["String 객체", new String("upper")],
  ];

  it.each(invalidCases)("case가 %s이면 RangeError다", (_label, value) => {
    expect(
      captureThrown(() =>
        readRandomIdOptions({ preset: "base36", case: value }),
      ),
    ).toBeInstanceOf(RangeError);
  });

  it("사용자 alphabet은 코드 포인트 단위로 나뉜다", () => {
    expect(readRandomIdOptions({ alphabet: "abc" }).chars).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("이모지 alphabet을 받는다(코드 포인트 단위)", () => {
    const resolved = readRandomIdOptions({ alphabet: "😀😁😂" });
    expect(resolved.chars).toEqual(["😀", "😁", "😂"]);
    expect(resolved.chars).toHaveLength(3);
  });

  it("alphabet 크기 2와 256은 받는다", () => {
    expect(
      readRandomIdOptions({ alphabet: makeAlphabet(2) }).chars,
    ).toHaveLength(2);
    expect(
      readRandomIdOptions({ alphabet: makeAlphabet(256) }).chars,
    ).toHaveLength(256);
  });

  const invalidAlphabets: [label: string, value: unknown][] = [
    ["빈 문자열", ""],
    ["한 글자", "a"],
    ["257자", makeAlphabet(257)],
    ["중복 글자", "aab"],
    ["이모지 중복", "😀😀"],
    ["짝 없는 상위 서로게이트", "\ud800ab"],
    ["짝 없는 하위 서로게이트", "ab\udc00"],
    ["null", null],
    ["숫자", 123],
    ["배열", ["a", "b"]],
    ["String 객체", new String("ab")],
  ];

  it.each(invalidAlphabets)(
    "alphabet이 %s이면 RangeError다",
    (_label, value) => {
      expect(
        captureThrown(() => readRandomIdOptions({ alphabet: value })),
      ).toBeInstanceOf(RangeError);
    },
  );
});

describe("bits 변환", () => {
  const table: [label: string, options: RandomIdOptions, length: number][] = [
    ["base64url 126비트는 21자다", { bits: 126 }, 21],
    ["base64url 128비트는 22자다", { bits: 128 }, 22],
    ["base64url 1비트는 1자다", { bits: 1 }, 1],
    ["base64url 6비트는 1자다(경계)", { bits: 6 }, 1],
    ["base64url 7비트는 2자다(경계)", { bits: 7 }, 2],
    ["digits 20비트는 7자다", { preset: "digits", bits: 20 }, 7],
    ["readable 50비트는 10자다", { preset: "readable", bits: 50 }, 10],
    ["base36 64비트는 13자다", { preset: "base36", bits: 64 }, 13],
    ["크기 2 alphabet 8비트는 8자다", { alphabet: "ab", bits: 8 }, 8],
    [
      "base64url 126비트 + startWithLetter는 22자다",
      { bits: 126, startWithLetter: true },
      22,
    ],
    [
      "base64url 126비트 + startWithLetter + prefix는 21자다(무작위 부분에 제약이 없다)",
      { bits: 126, startWithLetter: true, prefix: "usr" },
      21,
    ],
    [
      "정수 경계가 가까운 경우(크기 177, 2651비트)는 356자다",
      { alphabet: makeAlphabet(177), bits: 2651 },
      356,
    ],
    [
      "정수 경계가 가까운 경우(크기 109, 영문자 3, 3785비트)는 560자다",
      {
        alphabet: makeAlphabetWithLetters(109, 3),
        bits: 3785,
        startWithLetter: true,
      },
      560,
    ],
    [
      "정수 경계를 막 넘는 경우(크기 245, 영문자 33, 2140비트)는 271자다",
      {
        alphabet: makeAlphabetWithLetters(245, 33),
        bits: 2140,
        startWithLetter: true,
      },
      271,
    ],
  ];

  it.each(table)("%s", (_label, options, length) => {
    expect(readRandomIdOptions(options).length).toBe(length);
  });

  it("변환한 길이가 1024를 넘으면 RangeError다", () => {
    expect(readRandomIdOptions({ alphabet: "ab", bits: 1024 }).length).toBe(
      1024,
    );
    expect(
      captureThrown(() => readRandomIdOptions({ alphabet: "ab", bits: 1025 })),
    ).toBeInstanceOf(RangeError);
  });

  it("모든 문자 집합 크기(2~256)와 bits 1~512에서 BigInt 기준 최소 길이와 같다", () => {
    const mismatches: string[] = [];
    for (let size = 2; size <= 256; size += 1) {
      const alphabet = makeAlphabet(size);
      const expected = minimalLengths(size, 512, undefined);
      for (let bits = 1; bits <= 512; bits += 1) {
        const actual = readRandomIdOptions({ alphabet, bits }).length;
        if (actual !== expected[bits]) {
          mismatches.push(
            `size=${size} bits=${bits} ${actual}!=${expected[bits]}`,
          );
        }
      }
    }
    expect(mismatches.slice(0, 10)).toEqual([]);
  });

  it("큰 bits에서도 BigInt 기준 최소 길이와 같다(1024 초과는 RangeError)", () => {
    const mismatches: string[] = [];
    const largeBits = [1000, 1024, 2048, 3000, 4095, 4096];
    for (let size = 2; size <= 256; size += 1) {
      const alphabet = makeAlphabet(size);
      const expectedLengths = minimalLengths(size, 4096, undefined);
      for (const bits of largeBits) {
        const minimal = expectedLengths[bits] ?? 0;
        const expected: number | string =
          minimal > 1024 ? "RangeError" : minimal;
        const actual = lengthOrError(() =>
          readRandomIdOptions({ alphabet, bits }),
        );
        if (actual !== expected) {
          mismatches.push(
            `size=${size} bits=${bits} ${String(actual)}!=${String(expected)}`,
          );
        }
      }
    }
    expect(mismatches.slice(0, 10)).toEqual([]);
  });

  // size 2~256 × letters 4종 × bits 1~512의 BigInt 기준값 계산이 기본 타임아웃(5초) 경계에 있다.
  it(
    "startWithLetter 보정도 bits 1~512에서 BigInt 기준 최소 길이와 같다",
    { timeout: 20_000 },
    () => {
      const mismatches: string[] = [];
      for (let size = 2; size <= 256; size += 1) {
        for (const letters of [1, 2, 26, 52]) {
          if (letters > Math.min(size, 52)) continue;
          const alphabet = makeAlphabetWithLetters(size, letters);
          const expected = minimalLengths(size, 512, letters);
          for (let bits = 1; bits <= 512; bits += 1) {
            const actual = readRandomIdOptions({
              alphabet,
              bits,
              startWithLetter: true,
            }).length;
            if (actual !== expected[bits]) {
              mismatches.push(
                `size=${size} letters=${letters} bits=${bits} ${actual}!=${expected[bits]}`,
              );
            }
          }
        }
      }
      expect(mismatches.slice(0, 10)).toEqual([]);
    },
  );
});

describe("startWithLetter", () => {
  it("기본값은 제한 없음이다", () => {
    expect(readRandomIdOptions({}).letters).toBeUndefined();
    expect(
      readRandomIdOptions({ startWithLetter: false }).letters,
    ).toBeUndefined();
  });

  it("prefix도 timestamp도 없으면 무작위 부분의 첫 글자를 영문자로 제한한다", () => {
    const resolved = readRandomIdOptions({ startWithLetter: true });
    expect(resolved.letters).toEqual(Array.from(BASE64URL_LETTERS));
    expect(resolved.letters).toHaveLength(52);
  });

  it("영문자 배열은 문자 집합의 순서를 유지한 부분집합이다", () => {
    const resolved = readRandomIdOptions({
      startWithLetter: true,
      alphabet: "9aZ0b😀",
    });
    expect(resolved.letters).toEqual(["a", "Z", "b"]);
    expect(resolved.chars).toEqual(["9", "a", "Z", "0", "b", "😀"]);
  });

  it("readable의 영문자는 24자다", () => {
    expect(
      readRandomIdOptions({ preset: "readable", startWithLetter: true })
        .letters,
    ).toEqual(Array.from("ABCDEFGHJKLMNPQRSTUVWXYZ"));
  });

  it("prefix가 있으면 무작위 부분에는 제약이 없다", () => {
    const resolved = readRandomIdOptions({
      startWithLetter: true,
      prefix: "usr",
    });
    expect(resolved.letters).toBeUndefined();
  });

  const validPrefixes = ["u", "usr", "Z9", "aBc"];

  it.each(validPrefixes)(
    "prefix %s는 첫 글자가 ASCII 영문자라서 받는다",
    (prefix) => {
      expect(() =>
        readRandomIdOptions({ startWithLetter: true, prefix }),
      ).not.toThrow();
    },
  );

  const invalidPrefixes: [label: string, prefix: string][] = [
    ["숫자로 시작", "1usr"],
    ["밑줄로 시작", "_usr"],
    ["하이픈으로 시작", "-usr"],
    ["공백으로 시작", " usr"],
    ["한글로 시작", "사용자"],
    ["이모지로 시작", "😀usr"],
    ["전각 영문자로 시작", "ａbc"],
  ];

  it.each(invalidPrefixes)(
    "startWithLetter에서 prefix가 %s이면 RangeError다",
    (_label, prefix) => {
      expect(
        captureThrown(() =>
          readRandomIdOptions({ startWithLetter: true, prefix }),
        ),
      ).toBeInstanceOf(RangeError);
    },
  );

  it("prefix 없이 timestamp가 있으면 RangeError다", () => {
    expect(
      captureThrown(() =>
        readRandomIdOptions({ startWithLetter: true, timestamp: true }),
      ),
    ).toBeInstanceOf(RangeError);
  });

  it("prefix가 있으면 timestamp와 함께 쓸 수 있다", () => {
    const resolved = readRandomIdOptions({
      startWithLetter: true,
      timestamp: true,
      prefix: "req",
    });
    expect(resolved.letters).toBeUndefined();
    expect(resolved.timestamp).toBe(true);
  });

  it("영문자가 없는 문자 집합은 RangeError다", () => {
    expect(
      captureThrown(() =>
        readRandomIdOptions({ preset: "digits", startWithLetter: true }),
      ),
    ).toBeInstanceOf(RangeError);
    expect(
      captureThrown(() =>
        readRandomIdOptions({ alphabet: "0123456789", startWithLetter: true }),
      ),
    ).toBeInstanceOf(RangeError);
    expect(
      captureThrown(() =>
        readRandomIdOptions({ alphabet: "가나다라", startWithLetter: true }),
      ),
    ).toBeInstanceOf(RangeError);
  });

  it("영문자가 하나뿐인 문자 집합은 받는다", () => {
    expect(
      readRandomIdOptions({ alphabet: "0123a", startWithLetter: true }).letters,
    ).toEqual(["a"]);
  });

  it("startWithLetter: false면 영문자가 없는 문자 집합도 받는다", () => {
    expect(
      readRandomIdOptions({ preset: "digits", startWithLetter: false }).letters,
    ).toBeUndefined();
  });
});

describe("정규화 결과", () => {
  it("모든 옵션을 준 경우의 결과가 조립에 필요한 값을 담는다", () => {
    const resolved = readRandomIdFactoryOptions({
      prefix: "usr",
      separator: ".",
      length: 12,
      preset: "readable",
      case: "lower",
      group: 4,
      groupSeparator: "/",
      startWithLetter: true,
      timestamp: true,
      isTaken: isTakenStub,
      maxAttempts: 5,
      randomBytes: randomBytesStub,
      now: nowStub,
    });
    expect(resolved).toStrictEqual({
      chars: Array.from("abcdefghjklmnpqrstuvwxyz23456789"),
      length: 12,
      letters: undefined,
      prefix: "usr",
      separator: ".",
      timestamp: true,
      now: nowStub,
      group: 4,
      groupSeparator: "/",
      isTaken: isTakenStub,
      maxAttempts: 5,
      randomBytes: randomBytesStub,
    });
  });

  it("결과의 문자 배열은 호출마다 새로 만든다", () => {
    const first = readRandomIdOptions({});
    const second = readRandomIdOptions({});
    expect(first.chars).not.toBe(second.chars);
    expect(first.chars).toEqual(second.chars);
  });
});
