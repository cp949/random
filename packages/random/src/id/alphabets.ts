import { BASE64URL_ALPHABET } from "../internal/encoding.js";

/**
 * 이름 있는 문자 집합. `randomId` 계열의 `preset` 옵션이 받는 값이다.
 * `alphabet`(사용자 정의 문자 집합)과 함께 쓸 수 없고, 대소문자 선택(`case`)은 `base36`과 `readable`에만 있다.
 */
export type RandomIdPreset =
  "base64url" | "base62" | "base36" | "digits" | "readable";

/** preset 이름 전부. 옵션 검증과 오류 메시지가 이 순서를 쓴다. */
export const RANDOM_ID_PRESETS: readonly RandomIdPreset[] = [
  "base64url",
  "base62",
  "base36",
  "digits",
  "readable",
];

/** base62. 숫자, 대문자, 소문자 순서다. */
const BASE62_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** base36 소문자(`case` 기본값). */
const BASE36_LOWER_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** base36 대문자(`case: "upper"`). */
const BASE36_UPPER_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** 숫자만. */
const DIGITS_ALPHABET = "0123456789";

/** 읽기 쉬운 32자(`case` 기본값). 혼동되는 `0`, `1`, `I`, `O`를 뺀 24자와 숫자 8자다. */
const READABLE_UPPER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 읽기 쉬운 32자의 소문자(`case: "lower"`). 대문자 표와 같은 순서다. */
const READABLE_LOWER_ALPHABET = "abcdefghjklmnpqrstuvwxyz23456789";

/** `value`가 preset 이름이면 `true`다. 옵션 검증이 이 판정으로 `preset` 값을 거른다. */
export function isRandomIdPreset(value: unknown): value is RandomIdPreset {
  return (
    typeof value === "string" &&
    (RANDOM_ID_PRESETS as readonly string[]).includes(value)
  );
}

/**
 * preset의 문자 집합을 돌려준다. 결과는 코드 포인트 단위로 나누기 전의 문자열이다(최상위에서 배열을 만들지 않는다).
 *
 * @param upper 대문자 표를 쓸지 여부. `base36`과 `readable`에만 영향을 준다. `base36`의 기본은 소문자,
 *   `readable`의 기본은 대문자이므로 호출자가 preset별 기본값을 정해 넘긴다.
 */
export function presetAlphabet(preset: RandomIdPreset, upper: boolean): string {
  switch (preset) {
    case "base64url":
      // base64url 64자는 인코더(`internal/encoding.ts`)와 같은 상수를 쓴다. 문자 집합의 단일 출처다.
      return BASE64URL_ALPHABET;
    case "base62":
      return BASE62_ALPHABET;
    case "base36":
      return upper ? BASE36_UPPER_ALPHABET : BASE36_LOWER_ALPHABET;
    case "digits":
      return DIGITS_ALPHABET;
    case "readable":
      return upper ? READABLE_UPPER_ALPHABET : READABLE_LOWER_ALPHABET;
  }
}
