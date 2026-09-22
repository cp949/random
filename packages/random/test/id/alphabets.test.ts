/**
 * `id/alphabets.ts`(무작위 ID의 preset 문자 집합 표)를 검증한다.
 * 이 파일이 다루는 소스는 mutation 대상이 아니라서 `describe`로 묶어도 된다.
 *
 * 기대 문자열은 구현의 상수를 가져오지 않고 여기에 다시 적는다. 표가 바뀌면 이 파일이 실패해야 한다.
 * 예외는 base64url인데, 인코더와 같은 상수를 재사용하는지가 검증 대상이라 `internal/encoding.ts`의 상수를 함께 본다.
 */
import { describe, expect, it } from "vitest";
import {
  RANDOM_ID_PRESETS,
  isRandomIdPreset,
  presetAlphabet,
  type RandomIdPreset,
} from "../../src/id/alphabets.js";
import { BASE64URL_ALPHABET } from "../../src/internal/encoding.js";

/** preset과 `case`(대문자 여부)별 기대 문자 집합. 순서와 글자가 모두 계약이다. */
const expected: [preset: RandomIdPreset, upper: boolean, alphabet: string][] = [
  [
    "base64url",
    false,
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_",
  ],
  [
    "base64url",
    true,
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_",
  ],
  [
    "base62",
    false,
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  ],
  [
    "base62",
    true,
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  ],
  ["base36", false, "0123456789abcdefghijklmnopqrstuvwxyz"],
  ["base36", true, "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
  ["digits", false, "0123456789"],
  ["digits", true, "0123456789"],
  ["readable", true, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"],
  ["readable", false, "abcdefghjklmnpqrstuvwxyz23456789"],
];

/** preset별 기대 크기(글자 수). */
const expectedSizes: [preset: RandomIdPreset, size: number][] = [
  ["base64url", 64],
  ["base62", 62],
  ["base36", 36],
  ["digits", 10],
  ["readable", 32],
];

/** `case`를 받지 않는 preset. `upper`가 결과를 바꾸지 않아야 한다. */
const caseInsensitivePresets: RandomIdPreset[] = [
  "base64url",
  "base62",
  "digits",
];

describe("RANDOM_ID_PRESETS", () => {
  it("preset 이름은 다섯 개이고 순서가 고정이다", () => {
    expect([...RANDOM_ID_PRESETS]).toEqual([
      "base64url",
      "base62",
      "base36",
      "digits",
      "readable",
    ]);
  });
});

describe("isRandomIdPreset", () => {
  it.each(RANDOM_ID_PRESETS)("%s는 preset 이름이다", (name) => {
    expect(isRandomIdPreset(name)).toBe(true);
  });

  const others: [label: string, value: unknown][] = [
    ["base64(하이픈 없는 이름)", "base64"],
    ["대문자 표기", "BASE36"],
    ["공백이 붙은 이름", " digits"],
    ["빈 문자열", ""],
    ["null", null],
    ["undefined", undefined],
    ["숫자", 36],
    ["boolean", true],
    ["배열", ["digits"]],
    ["String 객체", new String("digits")],
  ];

  it.each(others)("%s는 preset 이름이 아니다", (_label, value) => {
    expect(isRandomIdPreset(value)).toBe(false);
  });
});

describe("presetAlphabet", () => {
  it.each(expected)(
    "%s(upper=%s)의 문자 집합이 표와 같다",
    (preset, upper, alphabet) => {
      expect(presetAlphabet(preset, upper)).toBe(alphabet);
    },
  );

  it.each(expectedSizes)("%s의 크기는 %i이다", (preset, size) => {
    expect(presetAlphabet(preset, false).length).toBe(size);
    expect(presetAlphabet(preset, true).length).toBe(size);
  });

  it("base64url은 인코더와 같은 상수를 재사용한다(단일 출처)", () => {
    expect(presetAlphabet("base64url", false)).toBe(BASE64URL_ALPHABET);
  });

  it.each(caseInsensitivePresets)(
    "%s는 case의 영향을 받지 않는다",
    (preset) => {
      expect(presetAlphabet(preset, true)).toBe(presetAlphabet(preset, false));
    },
  );

  it.each(expected)(
    "%s(upper=%s)에 중복 글자가 없다",
    (preset, upper, alphabet) => {
      const chars = Array.from(presetAlphabet(preset, upper));
      expect(new Set(chars).size).toBe(chars.length);
      expect(chars.join("")).toBe(alphabet);
    },
  );

  it.each(expected)("%s(upper=%s)는 ASCII 글자만 쓴다", (preset, upper) => {
    for (const char of presetAlphabet(preset, upper)) {
      expect(char.charCodeAt(0)).toBeLessThan(128);
      expect(char.length).toBe(1);
    }
  });

  it("base36은 대소문자만 다른 같은 표다", () => {
    expect(presetAlphabet("base36", true).toLowerCase()).toBe(
      presetAlphabet("base36", false),
    );
  });

  it("readable은 대소문자만 다른 같은 표다", () => {
    expect(presetAlphabet("readable", true).toLowerCase()).toBe(
      presetAlphabet("readable", false),
    );
  });

  it.each([
    ["대문자", true, ["0", "1", "I", "O"]],
    ["소문자", false, ["0", "1", "i", "o"]],
  ] as [label: string, upper: boolean, excluded: string[]][])(
    "readable %s는 혼동되는 글자(%s)를 빼고 32자다",
    (_label, upper, excluded) => {
      const alphabet = presetAlphabet("readable", upper);
      for (const char of excluded) {
        expect(alphabet).not.toContain(char);
      }
      expect(alphabet.length).toBe(32);
    },
  );
});
