import { assertSafeInt } from "../internal/validate.js";

/** timestamp 접두사의 고정 폭(base36 9자). 9자면 36^9 - 1까지 담는다. */
const TIMESTAMP_LENGTH = 9;

/** 9자 base36이 담는 최댓값(36^9 - 1). 유닉스 시각으로 서기 5138년이다. */
const MAX_TIMESTAMP_MS = 101_559_956_668_415;

/**
 * 밀리초 값을 정렬 가능한 timestamp 접두사(base36 소문자 9자, 앞을 0으로 채운 고정 폭)로 바꾼다.
 * 고정 폭이라 문자열 사전순이 시간순과 같다. 옵션의 `case`와 무관하게 항상 소문자다.
 *
 * @param value 시계가 돌려준 밀리초. 0 이상 36^9 미만의 정수여야 한다.
 *   소수, `NaN`, `Infinity`, 음수, 상한 이상, 숫자가 아닌 값은 `RangeError`다.
 * @returns 9자 문자열.
 * @throws {RangeError} `value`가 쓸 수 있는 밀리초가 아닐 때.
 */
export function encodeTimestamp(value: unknown): string {
  const ms = assertSafeInt(value, "now()", 0, MAX_TIMESTAMP_MS);
  // `toString(36)`은 10 이상의 자릿수를 소문자로 쓴다. 짧은 값은 앞을 0으로 채워 폭을 맞춘다.
  return ms.toString(36).padStart(TIMESTAMP_LENGTH, "0");
}
