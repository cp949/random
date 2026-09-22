/**
 * `stringifyUuid`, `parseUuid`, `isUuid`의 공개 계약을 검증한다. 세 함수는 난수와 무관한 순수 함수라서 결과값이 계약이다.
 * - `parseUuid`는 "UUID 형식의 128비트인가"를 묻는다: 대시 있는 8-4-4-4-12 또는 대시 없는 32자 hex, 대소문자 무관,
 *   version·variant는 검사하지 않는다(Nil UUID도 파싱한다).
 * - `isUuid`는 "RFC 9562 UUID인가"를 묻는다: 위 형식 중 `dashes` 옵션이 고른 하나이고, version 문자가 1~8,
 *   variant 문자가 8·9·a·b(대소문자 무관)여야 한다. Nil·Max UUID는 거부한다.
 * - `stringifyUuid`는 길이 16의 `Uint8Array`만 받고 version·variant를 검사하지 않는다.
 * 형식 옵션(`dashes`, `case`, `version`)의 읽기·검증 자체는 `format-options.test.ts`가 맡고, 이 파일은 세 함수가 그 옵션을
 * 실제로 적용하는지와 판정 로직(정규식, 문자 검사, 분기)을 검증한다.
 *
 * 이 파일은 `describe`를 쓰지 않는다. `format.ts`가 mutation 대상이라서다. Stryker 10.0.0의 vitest 러너는
 * `describe` 안의 테스트를 mutant 실행 때 선택하지 못한다(`uniform-int.test.ts` 머리말 참고). 분류는 제목 접두어로 한다.
 */
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { expect, expectTypeOf, it } from "vitest";
import {
  formatUuid,
  isUuid,
  parseUuid,
  stringifyUuid,
  type IsUuidOptions,
  type UuidFormat,
} from "../../../src/id/uuid/format.js";
import { captureThrown } from "../../helpers/capture-thrown.js";
import {
  installCryptoStub,
  type CryptoMode,
} from "../../helpers/crypto-stub.js";
import { trapMathRandom } from "../../helpers/math-random-trap.js";
import { seededBytes } from "../../helpers/seeded-bytes.js";

interface Vector {
  /** 출처(RFC 9562의 절). */
  source: string;
  version: number;
  /** RFC 원문 표기(대소문자 포함). */
  text: string;
}

/**
 * RFC 9562(2024) 부록 A의 예시 UUID(A.1~A.6)와 부록 B의 UUIDv8 예시 두 개(B.1, B.2)다. 표기는 원문 그대로다.
 * 부록 B의 v8은 "illustrative example"이지만 version·variant 자리를 실제로 채운 값이라 형식 검사에 쓸 수 있다.
 * 이 값들은 아래 자체 검증 테스트가 version·variant 자리, 이름 기반 해시, 시각을 다시 계산해 확인한다.
 */
const RFC_VECTORS: Vector[] = [
  {
    source: "A.1 UUIDv1",
    version: 1,
    text: "C232AB00-9414-11EC-B3C8-9F6BDECED846",
  },
  {
    source: "A.2 UUIDv3",
    version: 3,
    text: "5df41881-3aed-3515-88a7-2f4a814cf09e",
  },
  {
    source: "A.3 UUIDv4",
    version: 4,
    text: "919108f7-52d1-4320-9bac-f847db4148a8",
  },
  {
    source: "A.4 UUIDv5",
    version: 5,
    text: "2ed6657d-e927-568b-95e1-2665a8aea6a2",
  },
  {
    source: "A.5 UUIDv6",
    version: 6,
    text: "1EC9414C-232A-6B00-B3C8-9F6BDECED846",
  },
  {
    source: "A.6 UUIDv7",
    version: 7,
    text: "017F22E2-79B0-7CC3-98C4-DC0C0C07398F",
  },
  {
    source: "B.1 UUIDv8 시간 기반",
    version: 8,
    text: "2489E9AD-2EE2-8E00-8EC9-32D5F69181C0",
  },
  {
    source: "B.2 UUIDv8 이름 기반(SHA-256)",
    version: 8,
    text: "5c146b14-3c52-8afd-938a-375d0df1fbf6",
  },
];

/** RFC에 v2(DCE Security) 예시가 없어 A.1의 version 자리만 2로 바꾼 합성 벡터. 1~8 전부를 덮기 위해 쓴다. */
const SYNTHETIC_V2: Vector = {
  source: "합성 UUIDv2(A.1에서 version 자리만 변경)",
  version: 2,
  text: "C232AB00-9414-21EC-B3C8-9F6BDECED846",
};

const ALL_VECTORS: Vector[] = [...RFC_VECTORS, SYNTHETIC_V2];

/** 형식 위반 표를 만드는 기준 UUID(A.1의 소문자 표기)와 대시 없는 형식. */
const BASE = "c232ab00-9414-11ec-b3c8-9f6bdeced846";
const BASE_COMPACT = BASE.replaceAll("-", "");

const NIL = "00000000-0000-0000-0000-000000000000";
const MAX = "ffffffff-ffff-ffff-ffff-ffffffffffff";

/** 대시 있는 형식에서 그룹(8-4-4-4-12)의 `[시작 위치, 길이]`. */
const DASHED_GROUPS: [start: number, length: number][] = [
  [0, 8],
  [9, 4],
  [14, 4],
  [19, 4],
  [24, 12],
];

/** 대시 있는 형식에서 대시의 위치. */
const DASH_POSITIONS = [8, 13, 18, 23];

/** 각 자리에 넣어 보는 hex가 아닌 문자. 전각 숫자(U+FF11)와 대시·줄바꿈·NUL 같은 경계 문자를 포함한다. */
const NON_HEX_CHARS: [label: string, char: string][] = [
  ["g", "g"],
  ["z", "z"],
  ["공백", " "],
  ["전각 숫자 1", "\uff11"],
  ["언더스코어", "_"],
  ["대시", "-"],
  ["줄바꿈", "\n"],
  ["NUL", "\0"],
];

const unsupportedModes: CryptoMode[] = [
  "absent",
  "empty",
  "not-function",
  "throwing-accessor",
];

/** 한 글자를 바꾼 문자열. */
function replaceAt(text: string, index: number, char: string): string {
  return text.slice(0, index) + char + text.slice(index + 1);
}

/** 한 글자를 끼워 넣은 문자열. */
function insertAt(text: string, index: number, char: string): string {
  return text.slice(0, index) + char + text.slice(index);
}

/** 한 글자를 뺀 문자열. */
function removeAt(text: string, index: number): string {
  return text.slice(0, index) + text.slice(index + 1);
}

/** 두 글자의 자리를 바꾼 문자열. */
function swapAt(text: string, a: number, b: number): string {
  const chars = [...text];
  [chars[a], chars[b]] = [chars[b]!, chars[a]!];
  return chars.join("");
}

/** 표기에서 대시를 빼고 소문자로 바꾼 hex 32자. */
function hexOf(text: string): string {
  return text.replaceAll("-", "").toLowerCase();
}

/** 구현과 독립된 디코딩(Node `Buffer`)으로 만든 기대 바이트. */
function bytesOf(text: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hexOf(text), "hex"));
}

/** hex 32자를 8-4-4-4-12로 나눈다. */
function dashed(hex: string): string {
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

/** version 문자와 variant 문자만 바꾼 소문자 UUID(대시 있는 형식). 나머지 자리는 기준값이다. */
function uuidWith(versionChar: string, variantChar: string): string {
  return `c232ab00-9414-${versionChar}1ec-${variantChar}3c8-9f6bdeced846`;
}

/** `parseUuid(value)`가 던진 값. 던지지 않으면 `undefined`다(반복 표에서 어느 항목인지 메시지에 남기려는 용도). */
function parseError(value: unknown): unknown {
  try {
    parseUuid(value as string);
  } catch (error) {
    return error;
  }
  return undefined;
}

/**
 * UUID 형식이 아닌 값이 세 경로에서 모두 거부되는지 확인한다: `parseUuid`는 `RangeError`,
 * `isUuid`는 두 `dashes` 설정 모두에서 `false`(던지지 않는다).
 */
function expectMalformed(value: string, label: string): void {
  expect(value, `${label}: 기준 UUID와 달라야 한다`).not.toBe(BASE);
  expect(parseError(value), `${label}: parseUuid`).toBeInstanceOf(RangeError);
  expect(isUuid(value), `${label}: isUuid`).toBe(false);
  expect(
    isUuid(value, { dashes: false }),
    `${label}: isUuid dashes false`,
  ).toBe(false);
}

/** `stringifyUuid`에서 던진 값. 던지지 않으면 `undefined`. */
function stringifyError(bytes: unknown, format?: unknown): unknown {
  try {
    stringifyUuid(bytes as Uint8Array, format as UuidFormat);
  } catch (error) {
    return error;
  }
  return undefined;
}

/** 문자열이 아니라서 `parseUuid`는 `RangeError`, `isUuid`는 `false`여야 하는 값. 문자열로 변환하면 유효한 UUID가 되는 값을 포함한다. */
const nonStringValues: [label: string, value: unknown][] = [
  ["null", null],
  ["undefined", undefined],
  ["숫자", 123],
  ["boolean", true],
  ["bigint", 1n],
  ["symbol", Symbol("uuid")],
  ["빈 객체", {}],
  ["프로토타입 없는 객체", Object.create(null) as object],
  ["String 객체(값이 유효한 UUID)", new String(BASE)],
  ["배열(원소가 유효한 UUID)", [BASE]],
  ["toString이 유효한 UUID를 돌려주는 객체", { toString: () => BASE }],
  ["함수", () => BASE],
  ["16바이트 Uint8Array", new Uint8Array(16)],
];

// ---------------------------------------------------------------------------
// 시그니처
// ---------------------------------------------------------------------------

it("시그니처가 명세와 같다", () => {
  expectTypeOf(stringifyUuid).toEqualTypeOf<
    (bytes: Uint8Array, format?: UuidFormat) => string
  >();
  expectTypeOf(parseUuid).toEqualTypeOf<
    (value: string) => Uint8Array<ArrayBuffer>
  >();
  expectTypeOf(isUuid).toEqualTypeOf<
    (value: unknown, options?: IsUuidOptions) => value is string
  >();
});

it("타입: UuidFormat과 IsUuidOptions의 필드가 명세와 같다", () => {
  expectTypeOf<UuidFormat>().toEqualTypeOf<{
    dashes?: boolean;
    case?: "lower" | "upper";
  }>();
  expectTypeOf<IsUuidOptions>().toEqualTypeOf<{
    version?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
    dashes?: boolean;
  }>();
});

it("타입: isUuid는 unknown을 string으로 좁힌다", () => {
  const value: unknown = BASE;
  if (isUuid(value)) {
    expectTypeOf(value).toEqualTypeOf<string>();
  }
  expect(isUuid(value)).toBe(true);
});

// ---------------------------------------------------------------------------
// RFC 9562 예시 벡터의 자체 검증
// ---------------------------------------------------------------------------

it("RFC 벡터: version 자리와 variant 자리가 표기와 맞는다", () => {
  for (const { source, version, text } of ALL_VECTORS) {
    const bytes = bytesOf(text);

    expect(text, `${source}: 36자`).toHaveLength(36);
    expect(
      DASH_POSITIONS.map((i) => text[i]),
      `${source}: 대시 위치`,
    ).toEqual(["-", "-", "-", "-"]);
    expect(bytes, `${source}: 16바이트`).toHaveLength(16);
    // version은 7번째 바이트(인덱스 6)의 상위 4비트, variant는 9번째 바이트(인덱스 8)의 상위 2비트(0b10)다.
    expect(bytes[6]! >> 4, `${source}: version`).toBe(version);
    expect(bytes[8]! >> 6, `${source}: variant`).toBe(0b10);
  }
});

it("RFC 벡터: 이름 기반 v3·v5·v8은 DNS 네임스페이스와 이름 www.example.com의 해시로 다시 계산한 값과 같다", () => {
  // RFC 9562 6.6절의 DNS 네임스페이스. 이름 기반 UUID는 해시 앞 16바이트의 version·variant 자리를 덮어쓴 값이다.
  const namespace = Buffer.from("6ba7b8109dad11d180b400c04fd430c8", "hex");
  const recompute = (algorithm: string, version: number): string => {
    const digest = createHash(algorithm)
      .update(namespace)
      .update("www.example.com")
      .digest();
    const bytes = Buffer.from(digest.subarray(0, 16));
    bytes[6] = (bytes[6]! & 0x0f) | (version << 4);
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    return dashed(bytes.toString("hex"));
  };

  const byVersion = (source: string): string =>
    RFC_VECTORS.find((vector) => vector.source.startsWith(source))!.text;
  expect(recompute("md5", 3)).toBe(byVersion("A.2"));
  expect(recompute("sha1", 5)).toBe(byVersion("A.4"));
  expect(recompute("sha256", 8)).toBe(byVersion("B.2"));
});

it("RFC 벡터: 시간 기반 v1·v6·v7·v8은 모두 2022-02-22T19:22:22Z(14:22:22 GMT-05:00)를 가리킨다", () => {
  const expectedMs = BigInt(Date.UTC(2022, 1, 22, 19, 22, 22));
  const hex = (source: string): string =>
    hexOf(RFC_VECTORS.find((vector) => vector.source.startsWith(source))!.text);
  // 그레고리력 기점(1582-10-15)에서 유닉스 기점(1970-01-01)까지의 100 ns 간격 수.
  const gregorianToUnix = 122192928000000000n;

  // v1: time_low(32) + time_mid(16) + time_hi(12) 순서를 time_hi, time_mid, time_low로 이어 60비트 값을 만든다.
  const v1 = hex("A.1");
  const v1Timestamp = BigInt(
    `0x${v1.slice(13, 16)}${v1.slice(8, 12)}${v1.slice(0, 8)}`,
  );
  // v6: time_high(32) + time_mid(16) + time_low(12)가 이미 상위부터 정렬돼 있다.
  const v6 = hex("A.5");
  const v6Timestamp = BigInt(
    `0x${v6.slice(0, 8)}${v6.slice(8, 12)}${v6.slice(13, 16)}`,
  );
  // v8 시간 기반: custom_a(48) + custom_b(12)가 10 ns 간격의 60비트 값이다.
  const v8 = hex("B.1");
  const v8Timestamp = BigInt(`0x${v8.slice(0, 12)}${v8.slice(13, 16)}`);

  expect(v1Timestamp).toBe(0x1ec9414c232ab00n);
  expect(v6Timestamp).toBe(v1Timestamp);
  expect((v1Timestamp - gregorianToUnix) / 10_000n).toBe(expectedMs);
  expect(BigInt(`0x${hex("A.6").slice(0, 12)}`)).toBe(expectedMs);
  expect(v8Timestamp / 100_000n).toBe(expectedMs);
});

// ---------------------------------------------------------------------------
// parseUuid
// ---------------------------------------------------------------------------

for (const { source, text } of ALL_VECTORS) {
  it(`parseUuid: ${source} 벡터를 파싱한 바이트가 독립 디코딩과 같다(원문 표기, 소문자, 대시 없는 형식)`, () => {
    const expected = bytesOf(text);

    expect(parseUuid(text)).toEqual(expected);
    expect(parseUuid(text.toLowerCase())).toEqual(expected);
    expect(parseUuid(text.toUpperCase())).toEqual(expected);
    expect(parseUuid(hexOf(text))).toEqual(expected);
    expect(parseUuid(hexOf(text).toUpperCase())).toEqual(expected);
  });
}

it("parseUuid: 바이트를 앞에서부터 big-endian 순서 그대로 채운다", () => {
  const sequential = "00010203-0405-0607-0809-0a0b0c0d0e0f";

  expect([...parseUuid(sequential)]).toEqual([
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  ]);
  expect([...parseUuid("f0f1f2f3-f4f5-f6f7-f8f9-fafbfcfdfeff")]).toEqual([
    240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254,
    255,
  ]);
});

it("parseUuid: 대소문자를 섞어도 같은 바이트를 돌려준다", () => {
  const mixed = "C232ab00-9414-11Ec-b3C8-9f6BDECed846";

  expect(parseUuid(mixed)).toEqual(bytesOf(BASE));
  expect(parseUuid(mixed.replaceAll("-", ""))).toEqual(bytesOf(BASE));
});

it("parseUuid: version과 variant를 검사하지 않아 Nil·Max UUID와 임의의 자리도 파싱한다", () => {
  expect([...parseUuid(NIL)]).toEqual(new Array<number>(16).fill(0));
  expect([...parseUuid(MAX)]).toEqual(new Array<number>(16).fill(255));
  expect([...parseUuid(NIL.replaceAll("-", ""))]).toEqual(
    new Array<number>(16).fill(0),
  );
  // version 0·f, variant 0·f인 값도 형식만 맞으면 통과한다.
  expect(parseUuid(uuidWith("0", "0"))).toEqual(bytesOf(uuidWith("0", "0")));
  expect(parseUuid(uuidWith("f", "f"))).toEqual(bytesOf(uuidWith("f", "f")));
});

it("parseUuid: 결과는 길이 16의 Uint8Array이고 호출마다 새 ArrayBuffer를 쓴다", () => {
  const first = parseUuid(BASE);
  const second = parseUuid(BASE);

  expect(first).toBeInstanceOf(Uint8Array);
  expect(first).toHaveLength(16);
  expect(first.byteOffset).toBe(0);
  expect(first.buffer.byteLength).toBe(16);
  expect(first).not.toBe(second);
  expect(first.buffer).not.toBe(second.buffer);
});

it("parseUuid: 결과를 바꿔도 다음 호출의 결과에 영향이 없다", () => {
  const first = parseUuid(BASE);
  first.fill(0xee);

  expect(parseUuid(BASE)).toEqual(bytesOf(BASE));
});

it("parseUuid: 같은 입력을 연달아 파싱해도 결과가 같다(정규식에 상태가 없다)", () => {
  for (let i = 0; i < 5; i += 1) {
    expect(parseUuid(BASE)).toEqual(bytesOf(BASE));
    expect(parseUuid(BASE_COMPACT)).toEqual(bytesOf(BASE));
  }
});

for (const [label, value] of nonStringValues) {
  it(`parseUuid: 문자열이 아닌 값(${label})은 TypeError가 아니라 RangeError로 거부한다`, () => {
    const thrown = parseError(value);

    expect(thrown).toBeInstanceOf(RangeError);
    expect(thrown).not.toBeInstanceOf(TypeError);
  });
}

// ---------------------------------------------------------------------------
// 형식 위반: parseUuid는 RangeError, isUuid는 false
// ---------------------------------------------------------------------------

it("형식: 기준값 자체는 세 경로에서 모두 받아들인다(표가 공허하지 않다는 전제)", () => {
  expect(parseError(BASE)).toBeUndefined();
  expect(parseError(BASE_COMPACT)).toBeUndefined();
  expect(isUuid(BASE)).toBe(true);
  expect(isUuid(BASE_COMPACT, { dashes: false })).toBe(true);
});

for (const [label, char] of NON_HEX_CHARS) {
  it(`형식: 대시 있는 형식의 모든 자리를 ${label}로 바꾸면 거부한다`, () => {
    for (let i = 0; i < BASE.length; i += 1) {
      if (BASE[i] === char) continue; // 대시 자리에 대시를 넣으면 원본과 같다.
      expectMalformed(replaceAt(BASE, i, char), `${label}@${i}`);
    }
  });

  it(`형식: 대시 없는 32자 형식의 모든 자리를 ${label}로 바꾸면 거부한다`, () => {
    for (let i = 0; i < BASE_COMPACT.length; i += 1) {
      expectMalformed(replaceAt(BASE_COMPACT, i, char), `${label}@${i}`);
    }
  });
}

it("형식: 대시 자리를 hex 문자로 바꾸면 거부한다", () => {
  for (const i of DASH_POSITIONS) {
    for (const char of ["0", "f", "F"]) {
      expectMalformed(replaceAt(BASE, i, char), `${char}@${i}`);
    }
  }
});

it("형식: 길이가 1 모자라거나 넘치면 거부한다(대시 있는 형식의 앞뒤 끝과 그룹마다)", () => {
  const cases: [string, string][] = [
    ["빈 문자열", ""],
    ["끝에 한 글자 추가(37자)", `${BASE}0`],
    ["앞에 한 글자 추가(37자)", `0${BASE}`],
    ["끝 한 글자 제거(35자)", BASE.slice(0, -1)],
    ["앞 한 글자 제거(35자)", BASE.slice(1)],
  ];
  for (const [start, length] of DASHED_GROUPS) {
    // 그룹의 첫 자리에 hex를 끼우면 그 그룹만 길이 +1, 그룹의 첫 자리를 빼면 그 그룹만 길이 -1이다.
    cases.push([
      `그룹(${start}, ${length})에 한 글자 추가`,
      insertAt(BASE, start, "0"),
    ]);
    cases.push([
      `그룹(${start}, ${length})에서 한 글자 제거`,
      removeAt(BASE, start),
    ]);
    // 그룹의 끝 자리 뒤에도 끼워 본다.
    cases.push([
      `그룹(${start}, ${length})의 끝에 한 글자 추가`,
      insertAt(BASE, start + length, "0"),
    ]);
  }
  for (const [label, value] of cases) {
    expectMalformed(value, label);
  }
});

it("형식: 길이가 1 모자라거나 넘치면 거부한다(대시 없는 형식)", () => {
  const cases: [string, string][] = [
    ["끝에 한 글자 추가(33자)", `${BASE_COMPACT}0`],
    ["앞에 한 글자 추가(33자)", `0${BASE_COMPACT}`],
    ["가운데에 한 글자 추가(33자)", insertAt(BASE_COMPACT, 16, "0")],
    ["끝 한 글자 제거(31자)", BASE_COMPACT.slice(0, -1)],
    ["앞 한 글자 제거(31자)", BASE_COMPACT.slice(1)],
    ["가운데 한 글자 제거(31자)", removeAt(BASE_COMPACT, 16)],
    ["절반(16자)", BASE_COMPACT.slice(0, 16)],
    ["두 배(64자)", BASE_COMPACT + BASE_COMPACT],
  ];
  for (const [label, value] of cases) {
    expectMalformed(value, label);
  }
});

it("형식: 대시가 빠지거나 위치·개수가 틀리면 거부한다", () => {
  const cases: [string, string][] = [];
  for (const i of DASH_POSITIONS) {
    cases.push([`대시 하나 제거@${i}`, removeAt(BASE, i)]);
    cases.push([`대시를 앞 글자와 바꿈@${i}`, swapAt(BASE, i, i - 1)]);
    cases.push([`대시를 뒤 글자와 바꿈@${i}`, swapAt(BASE, i, i + 1)]);
    cases.push([`대시 연속@${i}`, insertAt(BASE, i, "-")]);
  }
  cases.push(
    ["대시 다섯 개", `${BASE.slice(0, 35)}-${BASE.slice(35)}`],
    ["끝에 대시", `${BASE}-`],
    ["앞에 대시", `-${BASE}`],
    ["대시 없는 형식 앞에 대시", `-${BASE_COMPACT}`],
    ["대시 없는 형식 뒤에 대시", `${BASE_COMPACT}-`],
    ["그룹 크기를 4-8-4-4-12로", "c232-ab009414-11ec-b3c8-9f6bdeced846"],
    ["그룹 크기를 8-4-4-8-8로", "c232ab00-9414-11ec-b3c89f6b-deced846"],
    ["그룹 크기를 8-4-4-4-4-8로", "c232ab00-9414-11ec-b3c8-9f6b-deced846"],
    ["대시 네 개가 한 칸씩 어긋남", "c232ab00-9414-11ec-b3c-89f6bdeced846"],
    ["대시 대신 언더스코어", BASE.replaceAll("-", "_")],
    ["대시 대신 공백", BASE.replaceAll("-", " ")],
    ["대시 대신 콜론", BASE.replaceAll("-", ":")],
    ["대시 대신 점", BASE.replaceAll("-", ".")],
    ["대시 대신 전각 하이픈(U+FF0D)", BASE.replaceAll("-", "\uff0d")],
    ["대시 대신 유니코드 하이픈(U+2010)", BASE.replaceAll("-", "\u2010")],
    ["대시 대신 마이너스(U+2212)", BASE.replaceAll("-", "\u2212")],
  );
  for (const [label, value] of cases) {
    expectMalformed(value, label);
  }
});

it("형식: 대시 있는 형식과 없는 형식을 섞으면 거부한다", () => {
  const cases: [string, string][] = [
    ["앞 그룹만 대시", `${BASE_COMPACT.slice(0, 8)}-${BASE_COMPACT.slice(8)}`],
    [
      "뒤 그룹만 대시",
      `${BASE_COMPACT.slice(0, 20)}-${BASE_COMPACT.slice(20)}`,
    ],
    ["첫 대시만 남김", BASE.replace(/-/g, "").replace(/^(.{8})/, "$1-")],
    [
      "대시 두 개만 남김",
      `${BASE_COMPACT.slice(0, 8)}-${BASE_COMPACT.slice(8, 12)}-${BASE_COMPACT.slice(12)}`,
    ],
    [
      "대시 세 개만 남김",
      dashed(BASE_COMPACT).replace("-", "").replace("-", "").replace("-", ""),
    ],
    ["두 UUID를 이어 붙임", BASE + BASE],
    ["두 UUID를 쉼표로 이음", `${BASE},${BASE}`],
  ];
  for (const [label, value] of cases) {
    expectMalformed(value, label);
  }
});

it("형식: 앞뒤에 다른 문자가 붙으면 거부한다(공백, 줄바꿈, 중괄호, urn 접두사)", () => {
  const cases: [string, string][] = [
    ["앞 공백", ` ${BASE}`],
    ["뒤 공백", `${BASE} `],
    ["앞 줄바꿈", `\n${BASE}`],
    ["뒤 줄바꿈", `${BASE}\n`],
    ["뒤 CRLF", `${BASE}\r\n`],
    ["앞 탭", `\t${BASE}`],
    ["뒤 NUL", `${BASE}\0`],
    ["중괄호", `{${BASE}}`],
    ["urn 접두사", `urn:uuid:${BASE}`],
    ["대시 없는 형식 앞 공백", ` ${BASE_COMPACT}`],
    ["대시 없는 형식 뒤 공백", `${BASE_COMPACT} `],
    ["대시 없는 형식 뒤 줄바꿈", `${BASE_COMPACT}\n`],
    ["대시 없는 형식 앞 줄바꿈", `\n${BASE_COMPACT}`],
    ["0x 접두사", `0x${BASE_COMPACT}`],
    ["앞에 hex 한 글자", `a${BASE}`],
  ];
  for (const [label, value] of cases) {
    expectMalformed(value, label);
  }
});

it("형식: 문자열이 비어 있거나 UUID와 무관하면 거부한다", () => {
  for (const value of [
    "",
    " ",
    "-",
    "uuid",
    "not-a-uuid",
    "0",
    "g".repeat(32),
  ]) {
    expectMalformed(value, JSON.stringify(value));
  }
});

// ---------------------------------------------------------------------------
// isUuid
// ---------------------------------------------------------------------------

for (const { source, version, text } of ALL_VECTORS) {
  it(`isUuid: ${source} 벡터를 받아들인다(원문 표기, 소문자, 대문자, 대시 없는 형식)`, () => {
    expect(isUuid(text)).toBe(true);
    expect(isUuid(text.toLowerCase())).toBe(true);
    expect(isUuid(text.toUpperCase())).toBe(true);
    expect(isUuid(hexOf(text), { dashes: false })).toBe(true);
    expect(isUuid(hexOf(text).toUpperCase(), { dashes: false })).toBe(true);
    // 대소문자를 섞은 표기도 받아들인다.
    expect(isUuid(text.replace(/[a-f]/g, (c) => c.toUpperCase()))).toBe(true);
    expect(isUuid(text, { version: version as IsUuidOptions["version"] })).toBe(
      true,
    );
  });
}

it("isUuid: Nil UUID와 Max UUID는 거부한다(두 형식, 대소문자)", () => {
  for (const value of [NIL, MAX, NIL.toUpperCase(), MAX.toUpperCase()]) {
    expect(isUuid(value), value).toBe(false);
    expect(isUuid(value.replaceAll("-", ""), { dashes: false }), value).toBe(
      false,
    );
  }
});

for (const versionChar of "12345678") {
  it(`isUuid: version 문자 ${versionChar}를 받아들인다(variant 8·9·a·b, 대소문자, 두 형식)`, () => {
    for (const variantChar of ["8", "9", "a", "b", "A", "B"]) {
      const text = uuidWith(versionChar, variantChar);

      expect(isUuid(text), text).toBe(true);
      expect(isUuid(text.toUpperCase()), text).toBe(true);
      expect(isUuid(text.replaceAll("-", ""), { dashes: false }), text).toBe(
        true,
      );
    }
  });
}

for (const versionChar of ["0", "9", "a", "b", "c", "d", "e", "f", "A", "F"]) {
  it(`isUuid: version 문자 ${versionChar}는 거부한다(두 형식, variant가 유효해도)`, () => {
    const text = uuidWith(versionChar, "8");

    expect(isUuid(text), text).toBe(false);
    expect(isUuid(text.replaceAll("-", ""), { dashes: false }), text).toBe(
      false,
    );
    // 형식은 맞으므로 parseUuid는 받아들인다(두 함수의 규칙이 다르다).
    expect(parseError(text)).toBeUndefined();
  });
}

for (const variantChar of "89abAB") {
  it(`isUuid: variant 문자 ${variantChar}를 받아들인다(version 1~8, 두 형식)`, () => {
    for (const versionChar of "12345678") {
      const text = uuidWith(versionChar, variantChar);

      expect(isUuid(text), text).toBe(true);
      expect(isUuid(text.replaceAll("-", ""), { dashes: false }), text).toBe(
        true,
      );
    }
  });
}

for (const variantChar of "01234567cdefCDEF") {
  it(`isUuid: variant 문자 ${variantChar}는 거부한다(두 형식, version이 유효해도)`, () => {
    const text = uuidWith("4", variantChar);

    expect(isUuid(text), text).toBe(false);
    expect(isUuid(text.replaceAll("-", ""), { dashes: false }), text).toBe(
      false,
    );
    expect(parseError(text)).toBeUndefined();
  });
}

it("isUuid: version은 세 번째 그룹의 첫 글자, variant는 네 번째 그룹의 첫 글자이고 다른 자리의 문자는 무관하다", () => {
  // version·variant 자리 밖의 문자가 0이든 f든 결과가 같아야 한다.
  expect(isUuid("0000000f-0000-1000-8000-00000000000f")).toBe(true);
  expect(isUuid("ffffffff-ffff-1fff-bfff-ffffffffffff")).toBe(true);
  expect(isUuid("ffffffff-ffff-8fff-8fff-ffffffffffff")).toBe(true);
  // 자리를 하나씩 어긋나게 읽으면 잘못 통과한다: 옆 글자가 유효한 값이어도 자리의 글자가 틀리면 거부한다.
  expect(isUuid("00000000-0000-0100-8000-000000000000")).toBe(false); // version 자리 0, 다음 글자 1
  expect(isUuid("00000000-0000-1000-0800-000000000000")).toBe(false); // variant 자리 0, 다음 글자 8
  expect(isUuid("c232ab00-9414-f1ec-b3c8-9f6bdeced846")).toBe(false); // version 자리 f
  expect(isUuid("c232ab00-9414-11ec-03c8-9f6bdeced846")).toBe(false); // variant 자리 0
});

it("isUuid: dashes 기본값 true는 대시 있는 형식만, false는 대시 없는 32자만 받아들인다", () => {
  expect(isUuid(BASE)).toBe(true);
  expect(isUuid(BASE, undefined)).toBe(true);
  expect(isUuid(BASE, {})).toBe(true);
  expect(isUuid(BASE, { dashes: undefined })).toBe(true);
  expect(isUuid(BASE, { dashes: true })).toBe(true);
  expect(isUuid(BASE_COMPACT)).toBe(false);
  expect(isUuid(BASE_COMPACT, { dashes: true })).toBe(false);
  expect(isUuid(BASE, { dashes: false })).toBe(false);
  expect(isUuid(BASE_COMPACT, { dashes: false })).toBe(true);
  expect(isUuid(BASE_COMPACT.toUpperCase(), { dashes: false })).toBe(true);
});

it("isUuid: version 옵션은 그 version만 받아들인다", () => {
  for (const wanted of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
    for (const actual of "12345678") {
      const text = uuidWith(actual, "9");
      const expected = String(wanted) === actual;

      expect(
        isUuid(text, { version: wanted }),
        `${text} version ${wanted}`,
      ).toBe(expected);
      expect(
        isUuid(text.replaceAll("-", ""), { version: wanted, dashes: false }),
        `${text} compact version ${wanted}`,
      ).toBe(expected);
    }
  }
});

it("isUuid: version 옵션이 undefined이면 생략과 같다", () => {
  expect(isUuid(uuidWith("3", "8"), { version: undefined })).toBe(true);
  expect(isUuid(uuidWith("3", "8"), { version: undefined, dashes: true })).toBe(
    true,
  );
});

it("isUuid: version 옵션을 줘도 형식·variant 위반은 거부한다", () => {
  expect(isUuid(uuidWith("4", "c"), { version: 4 })).toBe(false);
  expect(isUuid(BASE_COMPACT, { version: 1 })).toBe(false);
  expect(isUuid(NIL, { version: 1 })).toBe(false);
  expect(isUuid(uuidWith("4", "8").slice(1), { version: 4 })).toBe(false);
});

for (const [label, value] of [
  ["0", 0],
  ["9", 9],
  ["소수 4.5", 4.5],
  ["숫자 문자열 4", "4"],
  ["null", null],
  ["NaN", Number.NaN],
  ["음수", -1],
] as [string, unknown][]) {
  it(`isUuid: version 옵션이 ${label}이면 RangeError다(value와 무관하게)`, () => {
    const options = { version: value } as IsUuidOptions;

    expect(captureThrown(() => isUuid(BASE, options))).toBeInstanceOf(
      RangeError,
    );
    expect(captureThrown(() => isUuid("not a uuid", options))).toBeInstanceOf(
      RangeError,
    );
    expect(captureThrown(() => isUuid(null, options))).toBeInstanceOf(
      RangeError,
    );
  });
}

it("isUuid: 옵션이 잘못되면 value를 보기 전에 RangeError다(알 수 없는 키, 비객체, dashes 타입)", () => {
  const badOptions: [string, unknown][] = [
    ["알 수 없는 키", { typo: true }],
    ["case 키(UuidFormat의 옵션)", { case: "upper" }],
    ["null", null],
    ["배열", []],
    ["문자열", "dashes"],
    ["dashes가 문자열", { dashes: "false" }],
    ["dashes가 null", { dashes: null }],
    ["dashes가 숫자", { dashes: 0 }],
  ];
  for (const [label, options] of badOptions) {
    for (const value of [BASE, "not a uuid", null, 123]) {
      expect(
        captureThrown(() => isUuid(value, options as IsUuidOptions)),
        `${label} / ${String(value)}`,
      ).toBeInstanceOf(RangeError);
    }
  }
});

it("isUuid: 옵션의 getter를 정확히 한 번씩 읽는다", () => {
  const calls = { dashes: 0, version: 0 };
  const options = {
    get dashes() {
      calls.dashes += 1;
      return true;
    },
    get version() {
      calls.version += 1;
      return 1 as const;
    },
  };

  expect(isUuid(BASE, options)).toBe(true);
  expect(calls).toEqual({ dashes: 1, version: 1 });
});

for (const [label, value] of nonStringValues) {
  it(`isUuid: 문자열이 아닌 값(${label})은 던지지 않고 false다`, () => {
    expect(isUuid(value)).toBe(false);
    expect(isUuid(value, { dashes: false })).toBe(false);
    expect(isUuid(value, { version: 4 })).toBe(false);
  });
}

it("isUuid: 같은 값을 연달아 판정해도 결과가 같다(정규식에 상태가 없다)", () => {
  for (let i = 0; i < 5; i += 1) {
    expect(isUuid(BASE)).toBe(true);
    expect(isUuid(NIL)).toBe(false);
    expect(isUuid(BASE_COMPACT, { dashes: false })).toBe(true);
  }
});

// ---------------------------------------------------------------------------
// stringifyUuid
// ---------------------------------------------------------------------------

/** 0~15. 자리마다 값이 달라 바이트 순서 오류와 앞자리 0 누락을 잡는다. */
const SEQUENTIAL = Uint8Array.from({ length: 16 }, (_, i) => i);
/** 240~255. hex 문자 a~f의 대소문자 변환을 잡는다. */
const HIGH = Uint8Array.from({ length: 16 }, (_, i) => 240 + i);

it("stringifyUuid: 형식 옵션 없이 대시 있는 소문자 36자를 만든다", () => {
  expect(stringifyUuid(SEQUENTIAL)).toBe(
    "00010203-0405-0607-0809-0a0b0c0d0e0f",
  );
  expect(stringifyUuid(HIGH)).toBe("f0f1f2f3-f4f5-f6f7-f8f9-fafbfcfdfeff");
});

it("stringifyUuid: dashes와 case의 네 조합을 적용한다", () => {
  expect(stringifyUuid(HIGH, { dashes: true, case: "lower" })).toBe(
    "f0f1f2f3-f4f5-f6f7-f8f9-fafbfcfdfeff",
  );
  expect(stringifyUuid(HIGH, { dashes: true, case: "upper" })).toBe(
    "F0F1F2F3-F4F5-F6F7-F8F9-FAFBFCFDFEFF",
  );
  expect(stringifyUuid(HIGH, { dashes: false, case: "lower" })).toBe(
    "f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff",
  );
  expect(stringifyUuid(HIGH, { dashes: false, case: "upper" })).toBe(
    "F0F1F2F3F4F5F6F7F8F9FAFBFCFDFEFF",
  );
  expect(stringifyUuid(SEQUENTIAL, { dashes: false, case: "upper" })).toBe(
    "000102030405060708090A0B0C0D0E0F",
  );
});

it("stringifyUuid: 한 옵션만 주면 나머지는 기본값이다", () => {
  expect(stringifyUuid(HIGH, { dashes: false })).toBe(
    "f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff",
  );
  expect(stringifyUuid(HIGH, { case: "upper" })).toBe(
    "F0F1F2F3-F4F5-F6F7-F8F9-FAFBFCFDFEFF",
  );
});

it("stringifyUuid: 옵션을 생략한 형태(undefined, 빈 객체, undefined 값)는 모두 기본 형식이다", () => {
  const expected = "f0f1f2f3-f4f5-f6f7-f8f9-fafbfcfdfeff";

  expect(stringifyUuid(HIGH, undefined)).toBe(expected);
  expect(stringifyUuid(HIGH, {})).toBe(expected);
  expect(stringifyUuid(HIGH, { dashes: undefined, case: undefined })).toBe(
    expected,
  );
});

it("stringifyUuid: 앞자리가 0인 바이트도 두 자리로 채운다", () => {
  expect(stringifyUuid(new Uint8Array(16), { dashes: false })).toBe(
    "0".repeat(32),
  );
  expect(
    stringifyUuid(
      Uint8Array.of(1, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    ),
  ).toBe("01000a00-0000-0000-0000-000000000000");
});

it("stringifyUuid: version·variant를 검사하지 않아 Nil·Max와 임의의 바이트도 만든다", () => {
  expect(stringifyUuid(new Uint8Array(16))).toBe(NIL);
  expect(stringifyUuid(new Uint8Array(16).fill(255))).toBe(MAX);
  expect(stringifyUuid(new Uint8Array(16).fill(0xab), { dashes: false })).toBe(
    "ab".repeat(16),
  );
});

for (const { source, text } of ALL_VECTORS) {
  it(`stringifyUuid: ${source} 벡터의 바이트를 원래 표기로 되돌린다(네 조합)`, () => {
    const bytes = bytesOf(text);

    expect(stringifyUuid(bytes)).toBe(text.toLowerCase());
    expect(stringifyUuid(bytes, { case: "upper" })).toBe(text.toUpperCase());
    expect(stringifyUuid(bytes, { dashes: false })).toBe(hexOf(text));
    expect(stringifyUuid(bytes, { dashes: false, case: "upper" })).toBe(
      hexOf(text).toUpperCase(),
    );
  });
}

it("stringifyUuid: 입력 배열을 바꾸지 않는다", () => {
  const bytes = Uint8Array.from(HIGH);

  stringifyUuid(bytes);
  stringifyUuid(bytes, { dashes: false, case: "upper" });

  expect(bytes).toEqual(HIGH);
});

it("stringifyUuid: Uint8Array 하위 클래스, Node Buffer, byteOffset이 있는 view도 받는다", () => {
  class TaggedBytes extends Uint8Array {}
  const expected = "00010203-0405-0607-0809-0a0b0c0d0e0f";
  const backing = new Uint8Array(32);
  backing.set(SEQUENTIAL, 8);

  expect(stringifyUuid(TaggedBytes.from(SEQUENTIAL))).toBe(expected);
  expect(stringifyUuid(Buffer.from(SEQUENTIAL))).toBe(expected);
  // view는 배경 버퍼의 처음이 아니라 자기 범위(byteOffset 8, 길이 16)를 읽어야 한다.
  expect(stringifyUuid(backing.subarray(8, 24))).toBe(expected);
});

it("stringifyUuid: 형식 옵션이 잘못되면 RangeError다", () => {
  const badFormats: [string, unknown][] = [
    ["dashes가 문자열", { dashes: "true" }],
    ["dashes가 null", { dashes: null }],
    ["case가 Upper", { case: "Upper" }],
    ["case가 null", { case: null }],
    ["case가 mixed", { case: "mixed" }],
    ["알 수 없는 키", { typo: true }],
    ["옵션 null", null],
    ["옵션 배열", []],
    ["옵션 문자열", "upper"],
    ["옵션 함수", () => ({})],
    ["다른 옵션 종류의 키(version)", { version: 4 }],
  ];
  for (const [label, format] of badFormats) {
    expect(stringifyError(HIGH, format), label).toBeInstanceOf(RangeError);
  }
});

it("stringifyUuid: 형식 옵션의 getter를 정확히 한 번씩 읽는다", () => {
  const calls = { dashes: 0, case: 0 };
  const format = {
    get dashes() {
      calls.dashes += 1;
      return false;
    },
    get case() {
      calls.case += 1;
      return "upper" as const;
    },
  };

  expect(stringifyUuid(HIGH, format)).toBe("F0F1F2F3F4F5F6F7F8F9FAFBFCFDFEFF");
  expect(calls).toEqual({ dashes: 1, case: 1 });
});

/** `stringifyUuid`가 `RangeError`로 거부해야 하는 `bytes`. */
const invalidBytes: [label: string, value: unknown][] = [
  ["길이 15", new Uint8Array(15)],
  ["길이 17", new Uint8Array(17)],
  ["길이 0", new Uint8Array(0)],
  ["길이 32", new Uint8Array(32)],
  ["숫자 Array(16)", Array.from({ length: 16 }, () => 0)],
  ["Uint16Array(16)", new Uint16Array(16)],
  ["Uint8ClampedArray(16)", new Uint8ClampedArray(16)],
  ["Int8Array(16)", new Int8Array(16)],
  ["Uint32Array(4)(바이트 수는 16)", new Uint32Array(4)],
  ["ArrayBuffer(16)", new ArrayBuffer(16)],
  ["DataView(16)", new DataView(new ArrayBuffer(16))],
  ["null", null],
  ["undefined", undefined],
  ["길이 16 문자열", "0123456789abcdef"],
  ["UUID 문자열", BASE],
  ["숫자", 16],
  ["유사 객체", { length: 16 }],
  [
    "다른 realm의 Uint8Array(vm 컨텍스트)",
    runInNewContext("new Uint8Array(16)") as unknown,
  ],
];

for (const [label, value] of invalidBytes) {
  it(`stringifyUuid: 잘못된 bytes(${label})는 TypeError가 아니라 RangeError로 거부한다`, () => {
    const thrown = stringifyError(value);

    expect(thrown).toBeInstanceOf(RangeError);
    expect(thrown).not.toBeInstanceOf(TypeError);
  });
}

it("stringifyUuid: 다른 realm의 Uint8Array는 길이가 같아도 거부한다(instanceof 판정)", () => {
  const foreign = runInNewContext("new Uint8Array(16)") as Uint8Array;

  expect(foreign).toHaveLength(16);
  expect(foreign instanceof Uint8Array).toBe(false);
  expect(stringifyError(foreign)).toBeInstanceOf(RangeError);
});

// ---------------------------------------------------------------------------
// formatUuid (v4·v7이 검증된 형식으로 재사용하는 내부 함수)
// ---------------------------------------------------------------------------

it("formatUuid: 정규화된 형식대로 만든다(네 조합)", () => {
  expect(formatUuid(HIGH, { dashes: true, upper: false })).toBe(
    "f0f1f2f3-f4f5-f6f7-f8f9-fafbfcfdfeff",
  );
  expect(formatUuid(HIGH, { dashes: true, upper: true })).toBe(
    "F0F1F2F3-F4F5-F6F7-F8F9-FAFBFCFDFEFF",
  );
  expect(formatUuid(HIGH, { dashes: false, upper: false })).toBe(
    "f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff",
  );
  expect(formatUuid(HIGH, { dashes: false, upper: true })).toBe(
    "F0F1F2F3F4F5F6F7F8F9FAFBFCFDFEFF",
  );
  expect(formatUuid(SEQUENTIAL, { dashes: true, upper: false })).toBe(
    "00010203-0405-0607-0809-0a0b0c0d0e0f",
  );
});

// ---------------------------------------------------------------------------
// 왕복
// ---------------------------------------------------------------------------

const formats: [label: string, format: UuidFormat][] = [
  ["대시 있음·소문자", { dashes: true, case: "lower" }],
  ["대시 있음·대문자", { dashes: true, case: "upper" }],
  ["대시 없음·소문자", { dashes: false, case: "lower" }],
  ["대시 없음·대문자", { dashes: false, case: "upper" }],
];

for (const [label, format] of formats) {
  it(`왕복: parseUuid(stringifyUuid(bytes))가 원본 바이트와 같다(${label})`, () => {
    const source = seededBytes(0x1234abcd);
    const samples = [
      new Uint8Array(16),
      new Uint8Array(16).fill(255),
      SEQUENTIAL,
      HIGH,
      ...ALL_VECTORS.map(({ text }) => bytesOf(text)),
      ...Array.from({ length: 64 }, () => source(16)),
    ];

    for (const bytes of samples) {
      const text = stringifyUuid(bytes, format);

      expect(text, label).toHaveLength(format.dashes ? 36 : 32);
      expect(parseUuid(text), text).toEqual(bytes);
    }
  });

  it(`왕복: stringifyUuid(parseUuid(text), format)이 정규화한 표기와 같다(${label})`, () => {
    for (const { text } of ALL_VECTORS) {
      const normalized = format.dashes ? text : text.replaceAll("-", "");
      const expected =
        format.case === "upper"
          ? normalized.toUpperCase()
          : normalized.toLowerCase();

      expect(stringifyUuid(parseUuid(text), format)).toBe(expected);
    }
  });
}

it("왕복: 만든 문자열은 형식에 맞는 isUuid 옵션으로 RFC UUID로 인정된다(version·variant가 맞는 바이트일 때)", () => {
  const bytes = bytesOf(uuidWith("4", "a"));

  for (const [, format] of formats) {
    const text = stringifyUuid(bytes, format);

    expect(isUuid(text, { dashes: format.dashes, version: 4 }), text).toBe(
      true,
    );
  }
});

// ---------------------------------------------------------------------------
// 환경
// ---------------------------------------------------------------------------

for (const mode of ["present", ...unsupportedModes] as CryptoMode[]) {
  it(`환경: crypto 상태(${mode})와 무관하게 동작하고 getRandomValues를 호출하지 않는다`, () => {
    const stub = installCryptoStub({ mode });

    expect(stringifyUuid(SEQUENTIAL, { case: "upper" })).toBe(
      "00010203-0405-0607-0809-0A0B0C0D0E0F",
    );
    expect(parseUuid(BASE)).toEqual(bytesOf(BASE));
    expect(isUuid(BASE)).toBe(true);
    expect(stub.calls).toEqual([]);
  });
}

it("환경: Math.random을 호출하지 않는다", () => {
  const trap = trapMathRandom();

  stringifyUuid(HIGH, { dashes: false, case: "upper" });
  parseUuid(BASE);
  isUuid(BASE, { version: 1 });

  expect(trap).not.toHaveBeenCalled();
});
