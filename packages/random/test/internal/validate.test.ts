/**
 * `internal/validate.ts`의 인자 검증(`assertSafeInt`, `assertSafeIntRange`, `parseAlphabet`, `assertLength`,
 * `assertBytes`, `assertKnownKeys`, `readOptions`, `readRandomBytesOption`, `readNowOption`,
 * `readClockValue`, `assertUnixTsMs`, `assertFinite`)을 검증한다.
 * 검증 실패의 오류 클래스는 `RangeError` 하나이고 `TypeError`를 던지지 않는다.
 * 타입이 틀린 값(문자열, 객체, undefined 등)도 `RangeError`다.
 * alphabet의 단위는 UTF-16 코드 유닛이 아니라 코드 포인트다.
 */
import { runInNewContext } from "node:vm";
import { describe, expect, expectTypeOf, it } from "vitest";
import { captureThrown } from "../helpers/capture-thrown.js";
import { invalidBytes } from "../helpers/invalid-bytes.js";
import {
  DEFAULT_ID_SEPARATOR,
  ID_MAX_LENGTH,
  MAX_UNIX_TS_MS,
  SECURE_MAX_LENGTH,
  assertBytes,
  assertFinite,
  assertFiniteRange,
  assertKnownKeys,
  assertLength,
  assertProbability,
  assertSafeInt,
  assertSafeIntRange,
  assertUnixTsMs,
  parseAlphabet,
  readClockValue,
  readLetterCase,
  readNowOption,
  readOptions,
  readRandomBytesOption,
  readPrefix,
  readSeparator,
} from "../../src/internal/validate.js";

/** `assertSafeInt`가 거부해야 하는 값. 타입이 틀린 값과 safe integer가 아닌 숫자를 함께 둔다. */
const invalidValues: [label: string, value: unknown][] = [
  ["숫자 문자열", "5"],
  ["소수", 1.5],
  ["NaN", Number.NaN],
  ["Infinity", Number.POSITIVE_INFINITY],
  ["-Infinity", Number.NEGATIVE_INFINITY],
  ["객체", {}],
  ["배열", [5]],
  ["undefined", undefined],
  ["null", null],
  ["boolean", true],
  ["bigint", 5n],
  ["2^53(safe integer 초과)", 2 ** 53],
  ["-(2^53)", -(2 ** 53)],
];

describe("SECURE_MAX_LENGTH", () => {
  it("길이 상한은 2^20이다", () => {
    expect(SECURE_MAX_LENGTH).toBe(1_048_576);
  });
});

describe("assertSafeInt", () => {
  it("범위 안의 safe integer는 그대로 돌려준다", () => {
    expect(assertSafeInt(5, "count", 0, 10)).toBe(5);
  });

  it("경계값 min과 max를 허용한다", () => {
    expect(assertSafeInt(0, "count", 0, 10)).toBe(0);
    expect(assertSafeInt(10, "count", 0, 10)).toBe(10);
  });

  it("음수 범위도 검사한다", () => {
    expect(assertSafeInt(-3, "count", -5, -1)).toBe(-3);
    expect(() => assertSafeInt(0, "count", -5, -1)).toThrow(RangeError);
  });

  it("safe integer의 양 끝을 범위로 받는다", () => {
    const max = Number.MAX_SAFE_INTEGER;

    expect(assertSafeInt(max, "count", -max, max)).toBe(max);
    expect(assertSafeInt(-max, "count", -max, max)).toBe(-max);
  });

  for (const [label, value] of invalidValues) {
    it(`${label}은 RangeError로 거부한다`, () => {
      expect(() => assertSafeInt(value, "count", 0, 10)).toThrow(RangeError);
    });
  }

  it("min보다 작거나 max보다 크면 RangeError로 거부한다", () => {
    expect(() => assertSafeInt(-1, "count", 0, 10)).toThrow(RangeError);
    expect(() => assertSafeInt(11, "count", 0, 10)).toThrow(RangeError);
  });

  it("TypeError를 던지지 않는다", () => {
    for (const [, value] of invalidValues) {
      const thrown = captureThrown(() => assertSafeInt(value, "count", 0, 10));

      expect(thrown).not.toBeInstanceOf(TypeError);
    }
  });

  it("오류 메시지에 인자 이름을 넣는다", () => {
    expect(() => assertSafeInt(11, "byteLength", 0, 10)).toThrow(/byteLength/);
  });
});

/** 서로 다른 BMP 문자 `count`개로 만든 alphabet. 서로게이트 영역(U+D800~U+DFFF)은 피한다. */
function bmpAlphabet(count: number): string {
  return Array.from({ length: count }, (_, i) =>
    String.fromCharCode(0x100 + i),
  ).join("");
}

/** 서로 다른 보충 평면 문자(UTF-16에서 2유닛) `count`개로 만든 alphabet. */
function astralAlphabet(count: number): string {
  return Array.from({ length: count }, (_, i) =>
    String.fromCodePoint(0x1f600 + i),
  ).join("");
}

/** `parseAlphabet`이 `RangeError`로 거부해야 하는 문자열. */
const invalidAlphabets: [label: string, value: string][] = [
  ["빈 문자열", ""],
  ["크기 1", "a"],
  ["크기 1인 이모지", "😀"],
  ["크기 257(BMP)", bmpAlphabet(257)],
  ["크기 257(보충 평면)", astralAlphabet(257)],
  ["중복 문자", "aab"],
  ["중복 이모지", "😀😁😀"],
  ["끝에 짝 없는 앞 서로게이트", "ab\ud83d"],
  ["앞에 짝 없는 뒤 서로게이트", "\ude00ab"],
  ["중간에 짝 없는 앞 서로게이트", "a\ud83db"],
  ["순서가 뒤집힌 서로게이트 쌍", "\ude00\ud83d"],
];

/** 문자열이 아니라서 `RangeError`로 거부해야 하는 값. */
const nonStringAlphabets: [label: string, value: unknown][] = [
  ["undefined", undefined],
  ["null", null],
  ["숫자", 123],
  ["boolean", true],
  ["bigint", 1n],
  ["문자열 배열", ["a", "b"]],
  ["객체", {}],
  ["String 객체", new String("ab")],
  ["symbol", Symbol("ab")],
];

describe("parseAlphabet", () => {
  it("코드 포인트별 문자열 배열을 돌려준다", () => {
    expect(parseAlphabet("abc")).toEqual(["a", "b", "c"]);
  });

  it("한글도 코드 포인트 하나가 한 글자다", () => {
    expect(parseAlphabet("가나다")).toEqual(["가", "나", "다"]);
  });

  it("보충 평면 문자(이모지)는 UTF-16 유닛 둘이 한 글자다", () => {
    const chars = parseAlphabet("😀😁");

    expect(chars).toEqual(["😀", "😁"]);
    expect(chars[0]).toHaveLength(2);
  });

  it("BMP 문자와 보충 평면 문자를 섞을 수 있다", () => {
    expect(parseAlphabet("a😀b")).toEqual(["a", "😀", "b"]);
  });

  it("최소 크기 2를 허용한다", () => {
    expect(parseAlphabet("ab")).toEqual(["a", "b"]);
  });

  it("최대 크기 256을 허용한다", () => {
    expect(parseAlphabet(bmpAlphabet(256))).toHaveLength(256);
  });

  it("크기는 UTF-16 길이가 아니라 코드 포인트 수로 센다", () => {
    // UTF-16 길이는 400이지만 코드 포인트는 200개다.
    const alphabet = astralAlphabet(200);

    expect(alphabet).toHaveLength(400);
    expect(parseAlphabet(alphabet)).toHaveLength(200);
  });

  it("호출마다 새 배열을 돌려준다", () => {
    const first = parseAlphabet("abc");
    first.pop();

    expect(parseAlphabet("abc")).toEqual(["a", "b", "c"]);
  });

  for (const [label, value] of invalidAlphabets) {
    it(`${label}은 RangeError로 거부한다`, () => {
      expect(() => parseAlphabet(value)).toThrow(RangeError);
    });
  }

  for (const [label, value] of nonStringAlphabets) {
    it(`문자열이 아닌 ${label}은 TypeError가 아니라 RangeError로 거부한다`, () => {
      expect(() => parseAlphabet(value)).toThrow(RangeError);
    });
  }
});

describe("assertSafeIntRange", () => {
  const max = Number.MAX_SAFE_INTEGER;
  const validRanges: [min: number, max: number][] = [
    [0, 0],
    [-5, 5],
    [1, 6],
    [0, max - 1],
    [-max, -1],
    [max - 1, max],
    [-(2 ** 52), 2 ** 52 - 2],
  ];
  /** 범위 크기(max - min + 1)가 2^53이라 표현할 수 없는 범위. */
  const oversizeRanges: [min: number, max: number][] = [
    [0, max],
    [-max, 0],
    [-1, max - 1],
    [-max, max],
  ];

  for (const [min, upper] of validRanges) {
    it(`[${min}, ${upper}]는 통과한다`, () => {
      expect(() => assertSafeIntRange(min, upper)).not.toThrow();
    });
  }

  for (const [label, value] of invalidValues) {
    it(`min이 ${label}이면 RangeError로 거부하고 메시지에 min이 들어간다`, () => {
      expect(() => assertSafeIntRange(value, 0)).toThrow(RangeError);
      expect(() => assertSafeIntRange(value, 0)).toThrow(/min/);
    });

    it(`max가 ${label}이면 RangeError로 거부하고 메시지에 max가 들어간다`, () => {
      expect(() => assertSafeIntRange(0, value)).toThrow(RangeError);
      expect(() => assertSafeIntRange(0, value)).toThrow(/max/);
    });
  }

  it("min이 max보다 크면 RangeError로 거부한다", () => {
    expect(() => assertSafeIntRange(2, 1)).toThrow(RangeError);
    expect(() => assertSafeIntRange(0, -1)).toThrow(RangeError);
  });

  for (const [min, upper] of oversizeRanges) {
    it(`범위 크기 초과: [${min}, ${upper}]는 RangeError로 거부한다`, () => {
      expect(() => assertSafeIntRange(min, upper)).toThrow(RangeError);
    });
  }
});

describe("ID_MAX_LENGTH", () => {
  it("ID 길이 상한은 1024이고 secure 길이 상한과 다르다", () => {
    expect(ID_MAX_LENGTH).toBe(1024);
    expect(ID_MAX_LENGTH).not.toBe(SECURE_MAX_LENGTH);
  });
});

/** `assertLength`가 통과시켜야 하는 값. 하한 1과 상한 1024의 양 끝을 포함한다. */
const validLengths = [1, 2, 21, 64, 1023, 1024];

/** `assertLength`가 범위 때문에 거부해야 하는 값. 하한 0과 상한 1025 바로 바깥을 포함한다. */
const outOfRangeLengths = [0, -1, 1025, 1_048_576];

/** 값이 숫자로 변환되지만 `typeof`가 `"number"`가 아니라서 거부해야 하는 객체. */
const numberLikeObjects: [label: string, value: unknown][] = [
  ["valueOf가 숫자를 돌려주는 객체", { valueOf: () => 21 }],
  ["Number 객체", new Number(21)],
  [
    "getter만 있는 객체",
    {
      get length() {
        return 21;
      },
    },
  ],
];

describe("assertLength", () => {
  for (const length of validLengths) {
    it(`유효한 길이(${length})는 그대로 돌려준다`, () => {
      expect(assertLength(length)).toBe(length);
    });
  }

  for (const length of outOfRangeLengths) {
    it(`범위를 벗어난 길이(${length})는 RangeError로 거부한다`, () => {
      expect(() => assertLength(length)).toThrow(RangeError);
    });
  }

  for (const [label, value] of invalidValues) {
    it(`길이 인자(${label})는 RangeError로 거부한다`, () => {
      expect(() => assertLength(value)).toThrow(RangeError);
    });
  }

  for (const [label, value] of numberLikeObjects) {
    it(`숫자처럼 보이는 객체(${label})는 숫자로 변환하지 않고 RangeError로 거부한다`, () => {
      expect(() => assertLength(value)).toThrow(RangeError);
    });
  }

  it("TypeError를 던지지 않는다", () => {
    const rejected = [
      ...invalidValues.map(([, value]) => value),
      ...numberLikeObjects.map(([, value]) => value),
      ...outOfRangeLengths,
    ];
    for (const value of rejected) {
      const thrown = captureThrown(() => assertLength(value));

      expect(thrown).toBeInstanceOf(RangeError);
      expect(thrown).not.toBeInstanceOf(TypeError);
    }
  });
});

/** `Uint8Array`의 하위 클래스. 하위 타입도 `instanceof Uint8Array`라서 `assertBytes`를 통과해야 한다. */
class TaggedBytes extends Uint8Array {}

/** 요청 길이 4에 `assertBytes`가 통과시켜야 하는 값. 같은 길이의 `Uint8Array`와 그 하위 타입이다. */
const validBytes: [label: string, value: Uint8Array][] = [
  ["Uint8Array", Uint8Array.of(1, 2, 3, 4)],
  ["0으로 채운 Uint8Array", new Uint8Array(4)],
  ["Uint8Array 하위 클래스", new TaggedBytes(4)],
  ["Node Buffer", Buffer.alloc(4)],
  ["byteOffset이 있는 view", new Uint8Array(10).subarray(3, 7)],
];

describe("assertBytes", () => {
  for (const [label, value] of validBytes) {
    it(`길이가 같은 배열(${label})은 통과한다`, () => {
      expect(() => assertBytes(value, 4)).not.toThrow();
    });
  }

  it("길이 0을 요청하면 빈 Uint8Array를 통과시킨다", () => {
    expect(() => assertBytes(new Uint8Array(0), 0)).not.toThrow();
  });

  it("통과시킨 배열을 복사하거나 바꾸지 않는다", () => {
    const bytes = Uint8Array.of(9, 8, 7, 6);

    assertBytes(bytes, 4);

    expect([...bytes]).toEqual([9, 8, 7, 6]);
  });

  for (const [label, value] of invalidBytes) {
    it(`잘못된 값(${label})은 RangeError로 거부한다`, () => {
      expect(() => assertBytes(value, 4)).toThrow(RangeError);
    });
  }

  it("다른 realm의 배열은 길이가 같아도 거부한다", () => {
    const foreign = runInNewContext("new Uint8Array(4)") as Uint8Array;

    // 전제: 길이는 맞고 `instanceof`만 다르다.
    expect(foreign).toHaveLength(4);
    expect(foreign instanceof Uint8Array).toBe(false);
    expect(() => assertBytes(foreign, 4)).toThrow(RangeError);
  });

  it("대상 이름을 넘겨도 통과와 거부 판정은 같다", () => {
    // 이름은 메시지의 주어만 바꾼다. 난수원 결과가 아닌 값(`stringifyUuid`의 `bytes` 등)을 검사할 때 쓴다.
    expect(() => assertBytes(new Uint8Array(4), 4, "bytes")).not.toThrow();
    expect(captureThrown(() => assertBytes(null, 4, "bytes"))).toBeInstanceOf(
      RangeError,
    );
    expect(
      captureThrown(() => assertBytes(new Uint8Array(3), 4, "bytes")),
    ).toBeInstanceOf(RangeError);
  });

  it("길이가 요청과 1이라도 다르면 거부한다", () => {
    expect(() => assertBytes(new Uint8Array(4), 3)).toThrow(RangeError);
    expect(() => assertBytes(new Uint8Array(4), 5)).toThrow(RangeError);
    expect(() => assertBytes(new Uint8Array(0), 1)).toThrow(RangeError);
  });

  it("거부하는 값이 TypeError를 던지게 하지 않는다", () => {
    for (const [, value] of invalidBytes) {
      const thrown = captureThrown(() => assertBytes(value, 4));

      expect(thrown).toBeInstanceOf(RangeError);
      expect(thrown).not.toBeInstanceOf(TypeError);
    }
  });
});

describe("assertKnownKeys", () => {
  const known = ["length", "prefix"];

  it("알려진 키만 있으면 통과한다", () => {
    expect(() =>
      assertKnownKeys({ length: 8, prefix: "usr" }, known),
    ).not.toThrow();
  });

  it("키가 없는 객체와 알려진 키의 일부만 있는 객체는 통과한다", () => {
    expect(() => assertKnownKeys({}, known)).not.toThrow();
    expect(() => assertKnownKeys({ prefix: "usr" }, known)).not.toThrow();
  });

  it("알 수 없는 own 키가 있으면 RangeError로 거부한다", () => {
    expect(() => assertKnownKeys({ length: 8, extra: 1 }, known)).toThrow(
      RangeError,
    );
    expect(() => assertKnownKeys({ extra: 1 }, known)).toThrow(RangeError);
  });

  it("알려진 키와 대소문자만 다른 오타도 거부한다", () => {
    expect(() => assertKnownKeys({ Length: 8 }, known)).toThrow(RangeError);
    expect(() => assertKnownKeys({ lenght: 8 }, known)).toThrow(RangeError);
  });

  it("값이 undefined인 알 수 없는 키도 own 키라서 거부한다", () => {
    expect(() => assertKnownKeys({ extra: undefined }, known)).toThrow(
      RangeError,
    );
  });

  it("알려진 키 목록이 비어 있으면 어떤 own 키든 거부한다", () => {
    expect(() => assertKnownKeys({}, [])).not.toThrow();
    expect(() => assertKnownKeys({ length: 8 }, [])).toThrow(RangeError);
  });

  it("Symbol 키는 검사하지 않는다", () => {
    const options = { length: 8, [Symbol("extra")]: 1 };

    expect(() => assertKnownKeys(options, known)).not.toThrow();
  });

  it("상속된 알 수 없는 키는 검사하지 않는다", () => {
    const options = Object.create({ inherited: 1 }) as object;

    expect(() => assertKnownKeys(options, known)).not.toThrow();
  });

  it("enumerable이 아닌 own 키는 검사하지 않는다", () => {
    const options = {};
    Object.defineProperty(options, "hidden", { value: 1, enumerable: false });

    expect(() => assertKnownKeys(options, known)).not.toThrow();
  });

  it("값을 읽지 않으므로 getter를 호출하지 않는다", () => {
    let calls = 0;
    const options = {
      get length() {
        calls += 1;
        return 8;
      },
    };

    assertKnownKeys(options, known);

    expect(calls).toBe(0);
  });
});

/** 옵션 자리에 오면 `RangeError`로 거부해야 하는 값. `undefined`(옵션 없음)만 허용한다. */
const nonObjectOptions: [label: string, value: unknown][] = [
  ["null", null],
  ["빈 배열", []],
  ["배열", [{ length: 8 }]],
  ["함수", () => ({ length: 8 })],
  ["클래스", class Options {}],
  ["문자열", "length"],
  ["빈 문자열", ""],
  ["숫자", 8],
  ["0", 0],
  ["NaN", Number.NaN],
  ["true", true],
  ["false", false],
  ["bigint", 8n],
  ["symbol", Symbol("options")],
];

describe("readOptions", () => {
  const keys = ["length", "prefix", "group"] as const;

  it("undefined 옵션은 빈 복사본을 돌려준다", () => {
    expect(readOptions(undefined, keys)).toEqual({});
  });

  it("undefined 옵션에도 호출마다 새 객체를 돌려준다", () => {
    expect(readOptions(undefined, keys)).not.toBe(readOptions(undefined, keys));
  });

  for (const [label, value] of nonObjectOptions) {
    it(`옵션이 ${label}이면 RangeError로 거부한다`, () => {
      expect(() => readOptions(value, keys)).toThrow(RangeError);
    });
  }

  it("옵션이 비객체이면 TypeError가 아니라 RangeError다", () => {
    for (const [, value] of nonObjectOptions) {
      const thrown = captureThrown(() => readOptions(value, keys));

      expect(thrown).toBeInstanceOf(RangeError);
      expect(thrown).not.toBeInstanceOf(TypeError);
    }
  });

  it("알려진 필드를 복사본으로 돌려준다", () => {
    const options = { length: 8, prefix: "usr" };

    expect(readOptions(options, keys)).toEqual({ length: 8, prefix: "usr" });
  });

  it("빈 객체는 빈 복사본이다", () => {
    expect(readOptions({}, keys)).toEqual({});
  });

  it("원본과 다른 객체를 돌려주고 복사본을 바꿔도 원본은 그대로다", () => {
    const options: { length: number; prefix?: string } = { length: 8 };

    const copy = readOptions(options, keys);
    copy.prefix = "changed";

    expect(copy).not.toBe(options);
    expect(options).toEqual({ length: 8 });
  });

  it("읽은 뒤에 원본을 바꿔도 복사본은 그대로다", () => {
    const options = { length: 8 };

    const copy = readOptions(options, keys);
    options.length = 99;

    expect(copy.length).toBe(8);
  });

  it("falsy 값(0, false, 빈 문자열, NaN)도 값으로 남긴다", () => {
    const options = { length: 0, prefix: "", group: Number.NaN };

    const copy = readOptions(options, keys);

    expect(copy.length).toBe(0);
    expect(copy.prefix).toBe("");
    expect(copy.group).toBeNaN();
    expect(readOptions({ length: false }, keys).length).toBe(false);
  });

  it("값이 undefined인 키는 키가 없는 것과 같다", () => {
    const copy = readOptions({ length: undefined, prefix: "usr" }, keys);

    expect("length" in copy).toBe(false);
    expect(Object.keys(copy)).toEqual(["prefix"]);
  });

  it("값이 null인 키는 값으로 남겨 호출자가 검증하게 한다", () => {
    const copy = readOptions({ length: null }, keys);

    expect("length" in copy).toBe(true);
    expect(copy.length).toBeNull();
  });

  it("알려진 필드의 getter를 정확히 한 번씩 호출한다", () => {
    const calls = { length: 0, prefix: 0 };
    const options = {
      get length() {
        calls.length += 1;
        return 8;
      },
      get prefix() {
        calls.prefix += 1;
        return "usr";
      },
    };

    const copy = readOptions(options, keys);

    expect(calls).toEqual({ length: 1, prefix: 1 });
    expect(copy).toEqual({ length: 8, prefix: "usr" });
  });

  it("복사본을 읽어도 원본 getter를 다시 호출하지 않고 첫 값을 유지한다", () => {
    let calls = 0;
    const options = {
      get length() {
        calls += 1;
        return calls * 10;
      },
    };

    const copy = readOptions(options, keys);
    const first = copy.length;
    const second = copy.length;

    expect(calls).toBe(1);
    expect([first, second]).toEqual([10, 10]);
  });

  it("옵션에 없는 알려진 필드는 읽지 않아도 키를 만들지 않는다", () => {
    const copy = readOptions({ length: 8 }, keys);

    expect(Object.keys(copy)).toEqual(["length"]);
  });

  it("상속된 알려진 필드도 읽는다", () => {
    const options = Object.create({ length: 8, prefix: "usr" }) as object;

    expect(readOptions(options, keys)).toEqual({ length: 8, prefix: "usr" });
  });

  it("상속된 getter도 정확히 한 번 호출한다", () => {
    let calls = 0;
    const proto = {
      get length() {
        calls += 1;
        return 8;
      },
    };

    const copy = readOptions(Object.create(proto) as object, keys);

    expect(calls).toBe(1);
    expect(copy.length).toBe(8);
  });

  it("클래스 인스턴스의 접근자 프로퍼티도 읽는다", () => {
    class Options {
      get length() {
        return 8;
      }
    }

    expect(readOptions(new Options(), keys)).toEqual({ length: 8 });
  });

  it("프로토타입이 없는 객체도 읽는다", () => {
    const options = Object.assign(Object.create(null) as object, {
      length: 8,
    });

    expect(readOptions(options, keys)).toEqual({ length: 8 });
  });

  it("알 수 없는 키가 있으면 RangeError로 거부한다", () => {
    expect(() => readOptions({ length: 8, extra: 1 }, keys)).toThrow(
      RangeError,
    );
    expect(() => readOptions({ lenght: 8 }, keys)).toThrow(RangeError);
  });

  it("값이 undefined인 알 수 없는 키도 거부한다", () => {
    expect(() => readOptions({ extra: undefined }, keys)).toThrow(RangeError);
  });

  it("알 수 없는 키가 있으면 알려진 필드의 getter를 호출하기 전에 거부한다", () => {
    let calls = 0;
    const options = {
      extra: 1,
      get length() {
        calls += 1;
        return 8;
      },
    };

    expect(() => readOptions(options, keys)).toThrow(RangeError);
    expect(calls).toBe(0);
  });

  it("Symbol 키와 상속된 알 수 없는 키는 무시한다", () => {
    const options = Object.assign(Object.create({ inherited: 1 }) as object, {
      length: 8,
      [Symbol("extra")]: 1,
    });

    expect(readOptions(options, keys)).toEqual({ length: 8 });
  });

  it("enumerable이 아닌 알 수 없는 own 키는 무시한다", () => {
    const options = { length: 8 };
    Object.defineProperty(options, "hidden", { value: 1, enumerable: false });

    expect(readOptions(options, keys)).toEqual({ length: 8 });
  });

  it("알려진 필드의 getter가 던진 오류를 그대로 전파한다", () => {
    const failure = new Error("getter 실패");
    const options = {
      get length(): number {
        throw failure;
      },
    };

    expect(captureThrown(() => readOptions(options, keys))).toBe(failure);
  });

  it("알려진 키 목록이 비어 있으면 빈 객체만 받는다", () => {
    expect(readOptions({}, [])).toEqual({});
    expect(() => readOptions({ length: 8 }, [])).toThrow(RangeError);
  });

  it("복사본의 타입은 알려진 키 이름의 선택 필드이고 값은 unknown이다", () => {
    const copy = readOptions({}, keys);

    expectTypeOf(copy).toEqualTypeOf<
      Partial<Record<"length" | "prefix" | "group", unknown>>
    >();
  });
});

describe("readRandomBytesOption", () => {
  /** 함수가 아니라서 거부해야 하는 `randomBytes` 옵션 값. `undefined`는 주입 없음이라 유효하므로 넣지 않는다. */
  const nonFunctions: [label: string, value: unknown][] = [
    ["null", null],
    ["문자열", "randomBytes"],
    ["숫자", 16],
    ["boolean", true],
    ["bigint", 16n],
    ["symbol", Symbol("randomBytes")],
    ["빈 객체", {}],
    ["배열", []],
    ["call 메서드를 가진 객체", { call: () => new Uint8Array(16) }],
    ["Uint8Array", new Uint8Array(16)],
  ];

  it("undefined는 주입 없음이라 undefined를 돌려준다", () => {
    expect(readRandomBytesOption(undefined)).toBeUndefined();
  });

  it("함수는 감싸지 않고 같은 함수를 돌려준다", () => {
    const source = (length: number): Uint8Array => new Uint8Array(length);

    expect(readRandomBytesOption(source)).toBe(source);
  });

  it("화살표 함수, 일반 함수, async 함수, 클래스, 바인딩된 함수를 모두 함수로 본다", () => {
    const shapes: unknown[] = [
      () => new Uint8Array(16),
      function source() {
        return new Uint8Array(16);
      },
      // async 자체가 이 테스트 케이스의 대상이라 await 없이도 그대로 둔다.
      // eslint-disable-next-line @typescript-eslint/require-await
      async () => new Uint8Array(16),
      class Source {},
      (() => new Uint8Array(16)).bind(null),
    ];

    for (const shape of shapes) {
      expect(readRandomBytesOption(shape)).toBe(shape);
    }
  });

  it("함수를 호출하지 않는다(팩토리 생성은 난수원을 부르지 않는다)", () => {
    let calls = 0;
    const source = (length: number): Uint8Array => {
      calls += 1;
      return new Uint8Array(length);
    };

    readRandomBytesOption(source);

    expect(calls).toBe(0);
  });

  for (const [label, value] of nonFunctions) {
    it(`함수가 아닌 값(${label})은 TypeError가 아니라 RangeError로 거부한다`, () => {
      expect(captureThrown(() => readRandomBytesOption(value))).toBeInstanceOf(
        RangeError,
      );
    });
  }

  it("반환 타입은 난수원 함수 또는 undefined다", () => {
    expectTypeOf(readRandomBytesOption).returns.toEqualTypeOf<
      ((length: number) => Uint8Array) | undefined
    >();
  });
});

describe("readNowOption", () => {
  /** 함수가 아니라서 거부해야 하는 `now` 옵션 값. `undefined`는 주입 없음이라 유효하므로 넣지 않는다. */
  const nonFunctions: [label: string, value: unknown][] = [
    ["null", null],
    ["문자열", "Date.now"],
    ["숫자", 0],
    ["boolean", true],
    ["bigint", 0n],
    ["symbol", Symbol("now")],
    ["빈 객체", {}],
    ["배열", []],
    ["Date 객체", new Date(0)],
    ["valueOf를 가진 객체", { valueOf: () => 0 }],
  ];

  it("undefined는 주입 없음이라 undefined를 돌려준다", () => {
    expect(readNowOption(undefined)).toBeUndefined();
  });

  it("함수는 감싸지 않고 같은 함수를 돌려준다", () => {
    const clock = (): number => 0;

    expect(readNowOption(clock)).toBe(clock);
  });

  it("Date.now도 그대로 받는다", () => {
    expect(readNowOption(Date.now)).toBe(Date.now);
  });

  it("함수를 호출하지 않는다(팩토리 생성은 시계를 읽지 않는다)", () => {
    let calls = 0;
    const clock = (): number => {
      calls += 1;
      return 0;
    };

    readNowOption(clock);

    expect(calls).toBe(0);
  });

  for (const [label, value] of nonFunctions) {
    it(`함수가 아닌 값(${label})은 TypeError가 아니라 RangeError로 거부한다`, () => {
      expect(captureThrown(() => readNowOption(value))).toBeInstanceOf(
        RangeError,
      );
    });
  }

  it("반환 타입은 시계 함수 또는 undefined다", () => {
    expectTypeOf(readNowOption).returns.toEqualTypeOf<
      (() => number) | undefined
    >();
  });
});

describe("MAX_UNIX_TS_MS", () => {
  it("48비트 timestamp의 최댓값은 2^48 - 1이다", () => {
    expect(MAX_UNIX_TS_MS).toBe(2 ** 48 - 1);
    expect(MAX_UNIX_TS_MS).toBe(281_474_976_710_655);
  });
});

describe("readClockValue", () => {
  /** 시계가 돌려줘서는 안 되는 값. */
  const invalidClockValues: [label: string, value: unknown][] = [
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["음수", -1],
    ["소수", 1.5],
    ["2^48", 2 ** 48],
    ["2^53", 2 ** 53],
    ["숫자 문자열", "1700000000000"],
    ["null", null],
    ["undefined", undefined],
    ["boolean", true],
    ["bigint", 0n],
    ["Date 객체", new Date(0)],
    ["valueOf를 가진 객체", { valueOf: () => 1000 }],
  ];

  it("0 이상 2^48 미만의 정수는 그대로 돌려준다", () => {
    expect(readClockValue(0)).toBe(0);
    expect(readClockValue(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(readClockValue(MAX_UNIX_TS_MS)).toBe(MAX_UNIX_TS_MS);
  });

  for (const [label, value] of invalidClockValues) {
    it(`${label}은 TypeError가 아니라 RangeError로 거부한다`, () => {
      expect(captureThrown(() => readClockValue(value))).toBeInstanceOf(
        RangeError,
      );
    });
  }
});

describe("assertUnixTsMs", () => {
  it("범위 안의 timestamp는 그대로 돌려준다", () => {
    expect(assertUnixTsMs(0)).toBe(0);
    expect(assertUnixTsMs(MAX_UNIX_TS_MS)).toBe(MAX_UNIX_TS_MS);
  });

  it("2^48 이상이면 RangeError다(counter 고갈로 1ms를 앞세울 수 없는 경우)", () => {
    expect(
      captureThrown(() => assertUnixTsMs(MAX_UNIX_TS_MS + 1)),
    ).toBeInstanceOf(RangeError);
    expect(captureThrown(() => assertUnixTsMs(2 ** 53))).toBeInstanceOf(
      RangeError,
    );
  });

  it("음수와 정수가 아닌 값도 RangeError다", () => {
    expect(captureThrown(() => assertUnixTsMs(-1))).toBeInstanceOf(RangeError);
    expect(captureThrown(() => assertUnixTsMs(1.5))).toBeInstanceOf(RangeError);
    expect(captureThrown(() => assertUnixTsMs(Number.NaN))).toBeInstanceOf(
      RangeError,
    );
  });
});

describe("readPrefix·readSeparator", () => {
  it("readPrefix는 비어 있지 않은 문자열만 받고 생략은 undefined다", () => {
    expect(readPrefix(undefined)).toBeUndefined();
    expect(readPrefix("usr")).toBe("usr");
    for (const invalid of ["", 1, null, {}]) {
      expect(() => readPrefix(invalid)).toThrow(RangeError);
    }
  });
  it("readSeparator는 생략이면 fallback, 빈 문자열은 허용, 문자열이 아니면 RangeError다", () => {
    expect(readSeparator(undefined, "separator", "_")).toBe("_");
    expect(readSeparator("", "separator", "_")).toBe("");
    expect(readSeparator("-", "separator", "_")).toBe("-");
    for (const invalid of [1, null, {}]) {
      expect(() => readSeparator(invalid, "separator", "_")).toThrow(
        RangeError,
      );
    }
  });
});

describe("readLetterCase", () => {
  it("생략(undefined)이면 undefined를 돌려준다(기본값 결정은 호출자 몫)", () => {
    expect(readLetterCase(undefined)).toBeUndefined();
  });

  it('"lower"는 false, "upper"는 true를 돌려준다', () => {
    expect(readLetterCase("lower")).toBe(false);
    expect(readLetterCase("upper")).toBe(true);
  });

  const invalidLetterCases: [label: string, value: unknown][] = [
    ["대문자 표기", "Upper"],
    ["mixed", "mixed"],
    ["빈 문자열", ""],
    ["공백이 붙은 값", " upper"],
    ["숫자", 1],
    ["boolean", true],
    ["null", null],
    ["배열", ["upper"]],
    ["String 객체", new String("upper")],
  ];
  for (const [label, value] of invalidLetterCases) {
    it(`${label}은 RangeError다`, () => {
      expect(() => readLetterCase(value)).toThrow(RangeError);
      expect(() => readLetterCase(value)).toThrow(
        /case must be "lower" or "upper"/,
      );
    });
  }
});

describe("DEFAULT_ID_SEPARATOR", () => {
  it('"_"다', () => {
    expect(DEFAULT_ID_SEPARATOR).toBe("_");
  });
});

describe("assertFiniteRange", () => {
  const validRanges: [min: number, max: number][] = [
    [-5.5, 5.5],
    [0, 1],
    [0, Number.MAX_VALUE],
    [-Number.MAX_VALUE, 0],
    [1, 1 + Number.EPSILON],
    [-Number.MIN_VALUE, 0],
  ];
  /** 타입이 틀리거나 유한하지 않은 값. `assertSafeInt`와 달리 소수는 유효하다. */
  const invalidFiniteValues: [label: string, value: unknown][] = [
    ["숫자 문자열", "5"],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["객체", {}],
    ["배열", [5]],
    ["undefined", undefined],
    ["null", null],
    ["boolean", true],
    ["bigint", 5n],
  ];

  for (const [min, max] of validRanges) {
    it(`[${min}, ${max}]는 통과한다`, () => {
      expect(() => assertFiniteRange(min, max)).not.toThrow();
    });
  }

  for (const [label, value] of invalidFiniteValues) {
    it(`min이 ${label}이면 RangeError로 거부하고 메시지에 min이 들어간다`, () => {
      expect(() => assertFiniteRange(value, 0)).toThrow(RangeError);
      expect(() => assertFiniteRange(value, 0)).toThrow(/min/);
    });

    it(`max가 ${label}이면 RangeError로 거부하고 메시지에 max가 들어간다`, () => {
      expect(() => assertFiniteRange(0, value)).toThrow(RangeError);
      expect(() => assertFiniteRange(0, value)).toThrow(/max/);
    });
  }

  it("소수는 허용한다(safe integer 제약 없음)", () => {
    expect(() => assertFiniteRange(0.1, 0.9)).not.toThrow();
  });

  it("min이 max보다 크면 RangeError로 거부한다", () => {
    expect(() => assertFiniteRange(2, 1)).toThrow(RangeError);
    expect(() => assertFiniteRange(0.5, -0.5)).toThrow(RangeError);
  });

  it("min과 max가 같으면 빈 반개구간이라 RangeError로 거부한다", () => {
    expect(() => assertFiniteRange(0, 0)).toThrow(RangeError);
    expect(() => assertFiniteRange(1.5, 1.5)).toThrow(RangeError);
    expect(() => assertFiniteRange(-0, 0)).toThrow(RangeError);
  });

  it("max - min이 Infinity로 넘치면 RangeError로 거부한다", () => {
    expect(() =>
      assertFiniteRange(-Number.MAX_VALUE, Number.MAX_VALUE),
    ).toThrow(RangeError);
    expect(() =>
      assertFiniteRange(-Number.MAX_VALUE / 2, Number.MAX_VALUE),
    ).toThrow(RangeError);
  });
});

describe("assertProbability", () => {
  for (const value of [0, 1, 0.5, 2 ** -53, 1 - 2 ** -53]) {
    it(`${value}는 통과하고 그대로 돌려준다`, () => {
      expect(assertProbability(value)).toBe(value);
    });
  }

  it("-0은 통과한다", () => {
    expect(Object.is(assertProbability(-0), -0)).toBe(true);
  });

  const invalidProbabilities: [label: string, value: unknown][] = [
    ["-0.1", -0.1],
    ["1.1", 1.1],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["숫자 문자열", "0.5"],
    ["undefined", undefined],
    ["null", null],
    ["boolean", true],
    ["객체", {}],
    ["bigint", 1n],
  ];
  for (const [label, value] of invalidProbabilities) {
    it(`${label}은 RangeError로 거부하고 메시지에 이름이 들어간다`, () => {
      expect(() => assertProbability(value)).toThrow(RangeError);
      expect(() => assertProbability(value)).toThrow(/p must/);
      expect(() => assertProbability(value, "weight")).toThrow(/weight/);
    });
  }
});

/** `assertFinite`가 거부해야 하는, 타입이 틀리거나 유한하지 않은 값. */
const invalidFiniteArgs: [label: string, value: unknown][] = [
  ["NaN", Number.NaN],
  ["Infinity", Number.POSITIVE_INFINITY],
  ["-Infinity", Number.NEGATIVE_INFINITY],
  ["숫자 문자열", "1"],
  ["null", null],
  ["undefined", undefined],
  ["객체", {}],
  ["배열", []],
  ["boolean", true],
];

describe("assertFinite", () => {
  for (const value of [0, -0, 1.5, -1, Number.MAX_VALUE]) {
    it(`유한한 수(${value})는 그대로 돌려준다`, () => {
      expect(assertFinite(value, "mean")).toBe(value);
    });
  }

  for (const [label, value] of invalidFiniteArgs) {
    it(`${label}은 RangeError로 거부하고 메시지에 이름이 들어간다`, () => {
      expect(() => assertFinite(value, "mean")).toThrow(RangeError);
      expect(() => assertFinite(value, "mean")).toThrow(/mean/);
    });
  }
});
