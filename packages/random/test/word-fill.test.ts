/**
 * 테스트 헬퍼 `wordFill`과 `wordsForUint53`을 검증한다.
 * 경계 word를 주입하는 테스트가 이 헬퍼에 기대므로, 헬퍼가 틀리면 경계 테스트가 위장 통과한다.
 */
import { expect, it } from "vitest";
import { wordFill, wordsForUint53 } from "./helpers/word-fill.js";

it("wordFill: word를 big-endian 바이트로 채운다", () => {
  const view = new Uint8Array(4);

  wordFill([0x01020304])(view);

  expect([...view]).toEqual([0x01, 0x02, 0x03, 0x04]);
});

it("wordFill: 0xffffffff를 부호 없이 255 네 개로 쓴다", () => {
  const view = new Uint8Array(4);

  wordFill([0xffffffff])(view);

  expect([...view]).toEqual([255, 255, 255, 255]);
});

it("wordFill: 요청 하나가 크기만큼의 word를 큐에서 순서대로 꺼낸다", () => {
  const view = new Uint8Array(8);

  wordFill([1, 2, 3])(view);

  expect([...view]).toEqual([0, 0, 0, 1, 0, 0, 0, 2]);
});

it("wordFill: 다음 요청은 이어서 다음 word부터 쓴다", () => {
  const fill = wordFill([1, 2, 3]);
  const first = new Uint8Array(8);
  const second = new Uint8Array(8);

  fill(first);
  fill(second);

  expect([...second]).toEqual([0, 0, 0, 3, 0, 0, 0, 0]);
});

it("wordFill: 큐가 비면 0으로 채운다", () => {
  const view = new Uint8Array(8);

  wordFill([])(view);

  expect([...view]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
});

it("wordFill: 4의 배수가 아닌 요청은 마지막 word의 앞쪽 바이트만 쓴다", () => {
  const view = new Uint8Array(6);

  wordFill([0x01020304, 0x05060708])(view);

  expect([...view]).toEqual([1, 2, 3, 4, 5, 6]);
});

it("wordFill: 만들 때 받은 배열을 바꾸지 않는다", () => {
  const words = [1, 2];

  wordFill(words)(new Uint8Array(8));

  expect(words).toEqual([1, 2]);
});

it("wordsForUint53: 53비트 값을 상위 word와 하위 word로 나눈다", () => {
  // x = 5 * 2^32 + 7 → 상위 21비트 5, 하위 32비트 7
  const [high, low] = wordsForUint53(5n * 2n ** 32n + 7n);

  expect(high >>> 11).toBe(5);
  expect(low).toBe(7);
});

it("wordsForUint53: 상위 word의 하위 11비트를 모두 1로 채운다", () => {
  const [high] = wordsForUint53(5n * 2n ** 32n);

  expect(high & 0x7ff).toBe(0x7ff);
});

it("wordsForUint53: 가장 큰 값 2^53-1도 32비트 부호 없는 범위에 들어간다", () => {
  const [high, low] = wordsForUint53(2n ** 53n - 1n);

  expect(high).toBe(0xffffffff);
  expect(low).toBe(0xffffffff);
});
