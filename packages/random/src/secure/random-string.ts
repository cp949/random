import { defaultRandomBytes } from "../internal/bytes.js";
import { pickChars } from "../internal/sampling.js";
import {
  SECURE_MAX_LENGTH,
  assertSafeInt,
  parseAlphabet,
} from "../internal/validate.js";

/**
 * `alphabet`의 글자를 균등하게 뽑아 `length`글자 문자열을 만든다. rejection sampling으로 modulo 편향이 없다.
 *
 * 단위는 UTF-16 코드 유닛이 아니라 코드 포인트다. 이모지처럼 UTF-16에서 두 유닛인 글자도 한 글자로 센다.
 * 짝 없는 서로게이트를 alphabet에서 거부하므로 결과는 항상 올바른 UTF-16이다.
 * 결합 문자나 ZWJ 시퀀스는 코드 포인트마다 따로 뽑히므로 alphabet에 넣지 않는다.
 *
 * `globalThis.crypto.getRandomValues`만 쓰며, 쓸 수 없으면 `SecureRandomUnavailableError`를 던진다.
 * 실패 순서: 인자 검증(`RangeError`), 지원 확인(`SecureRandomUnavailableError`), 글자 생성.
 * `getRandomValues`가 던진 오류는 그대로 전파한다. 반복 횟수에 상한이 없다(정상 난수원에서 연속 k회 거부될 확률은 2^-k 이하).
 *
 * @param alphabet 뽑을 글자의 집합. 코드 포인트 2~256개이며 중복과 짝 없는 서로게이트가 없어야 한다.
 * @param length 결과의 글자(코드 포인트) 수. 1 이상 1,048,576(2^20) 이하의 정수.
 * @returns `alphabet`의 글자로 이루어진 문자열. 값은 재현할 수 없다(계약이 아니다).
 * @throws {RangeError} `alphabet`이 문자열이 아니거나 크기·중복·서로게이트 규칙을 어길 때, `length`가 범위 안의 정수가 아닐 때.
 * 환경과 무관하게 같다.
 * @throws {SecureRandomUnavailableError} `getRandomValues`를 쓸 수 없을 때.
 */
export function randomString(alphabet: string, length: number): string {
  const chars = parseAlphabet(alphabet);
  assertSafeInt(length, "length", 1, SECURE_MAX_LENGTH);
  // `length`가 1 이상이라 `pickChars`가 난수원을 적어도 한 번 호출하고, 그때 지원 확인이 이루어진다.
  return pickChars(chars, length, defaultRandomBytes);
}
