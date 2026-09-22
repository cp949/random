/**
 * `assertRandomSource`를 검증한다. `int`/`float`/`bool`/`sign`/`uniform`이 공유하는 첫 번째
 * 인자 검증이다 — 함수가 아닌 값을 거부한다는 계약만 여기서 확인하고, 각 공개 함수가 이 검증을
 * 실제로 호출하는지는 각 함수의 테스트 파일에서 확인한다.
 */
import { expect, it } from "vitest";
import { assertRandomSource } from "../../src/core/random-source.js";

it("함수는 통과시킨다", () => {
  expect(() => assertRandomSource(() => 0)).not.toThrow();
});

const invalidSources: [label: string, value: unknown][] = [
  ["undefined", undefined],
  ["null", null],
  ["숫자", 0],
  ["문자열", "source"],
  ["빈 객체", {}],
  ["배열", []],
  ["nextUint32 메서드를 가진 객체(함수 자체가 아님)", { nextUint32: () => 0 }],
];
for (const [label, source] of invalidSources) {
  it(`${label}은 RangeError다`, () => {
    expect(() => assertRandomSource(source)).toThrow(RangeError);
  });
}
