/**
 * `int(source, min, max)`를 검증한다. rejection sampling의 경계 세부는
 * `internal/uniform-int.test.ts`가 검증하므로 여기서는 `uniformInt`를 그대로 거친다는 것,
 * `min` 검증이 `internal/validate.ts`의 `assertSafeIntRange`와 같다는 것, source 검증 순서를
 * 확인한다. 통계 테스트는 seeded/secure/custom source 세 가지 모두에서 같은 helper를 쓴다는
 * 완료 조건을 직접 겨냥한다.
 *
 * 이 파일은 `describe`를 쓰지 않는다(`internal/uniform-int.test.ts` 참고).
 */
import { expect, it } from "vitest";
import { int } from "../../src/core/int.js";
import { createSecureSource } from "../../src/secure/secure-source.js";
import { createXoshiro128Source } from "../../src/core/xoshiro128.js";
import { chiSquare, chiSquareCritical } from "../helpers/chi-square.js";
import { installCryptoStub } from "../helpers/crypto-stub.js";
import { seededBytes } from "../helpers/seeded-bytes.js";

/** 주입한 word를 순서대로 돌려주는 source. */
function wordSource(words: number[]): () => number {
  let index = 0;
  return () => {
    const word = words[index];
    if (word === undefined) throw new Error("주입한 word를 모두 소비했다");
    index += 1;
    return word;
  };
}

it("source가 함수가 아니면 RangeError다(min/max가 유효해도)", () => {
  expect(() => int("not a function" as never, 0, 9)).toThrow(RangeError);
  expect(() => int("not a function" as never, 0, 9)).toThrow(/source/);
});

it("source 검증이 min/max 검증보다 먼저다", () => {
  // min > max로 min/max도 위반이지만, source 위반 메시지가 나와야 순서가 맞다.
  expect(() => int("not a function" as never, 9, 0)).toThrow(RangeError);
  expect(() => int("not a function" as never, 9, 0)).toThrow(/source/);
});

it("인자 검증에 실패하면 source를 호출하지 않는다", () => {
  let calls = 0;
  const source = () => {
    calls += 1;
    return 0;
  };
  expect(() => int(source, 9, 0)).toThrow(RangeError);
  expect(() => int(source, 0.5, 9)).toThrow(RangeError);
  expect(calls).toBe(0);
});

it("min > max는 RangeError다", () => {
  expect(() => int(wordSource([0]), 9, 0)).toThrow(RangeError);
});

it("비정수 min/max는 RangeError다", () => {
  expect(() => int(wordSource([0]), 0.5, 9)).toThrow(RangeError);
});

it("범위 크기가 Number.MAX_SAFE_INTEGER를 넘으면 RangeError다", () => {
  const MAX_SAFE = Number.MAX_SAFE_INTEGER;
  expect(() => int(wordSource([0]), -MAX_SAFE, MAX_SAFE)).toThrow(RangeError);
});

it("범위 크기 1: word를 소비하지 않고 min을 돌려준다", () => {
  const source = wordSource([]);
  expect(int(source, 5, 5)).toBe(5);
});

it("범위 크기 1: -0이 아니라 +0을 돌려준다", () => {
  expect(Object.is(int(wordSource([]), -0, -0), 0)).toBe(true);
});

it("min 오프셋: word % n에 min을 더한다", () => {
  // n=3, word=4294967294는 4294967294 % 3 = 2를 수용한다(uniform-int.test.ts와 같은 경계).
  const source = wordSource([4_294_967_294]);
  expect(int(source, 10, 12)).toBe(12);
});

it("uniformInt를 그대로 거친다: 거부되는 word 다음의 word로 수용한다", () => {
  // n=3에서 4294967295는 limit과 같아 거부, 다음 word 7 % 3 = 1을 수용한다
  // (uniform-int.test.ts의 같은 시나리오).
  const source = wordSource([4_294_967_295, 7]);
  expect(int(source, 0, 2)).toBe(1);
});

it("음수 범위에서도 양끝을 포함한다", () => {
  const seen = new Set<number>();
  const nextBytes = seededBytes(0xabc123);
  const source = () => new DataView(nextBytes(4).buffer).getUint32(0);
  for (let i = 0; i < 500; i += 1) seen.add(int(source, -2, 2));
  expect([...seen].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2]);
});

/** [min, max]에서 `trials`번 뽑은 값의 칸별 관측 빈도. */
function frequencies(
  draw: () => number,
  min: number,
  max: number,
  trials: number,
): number[] {
  const bins = new Array(max - min + 1).fill(0) as number[];
  for (let i = 0; i < trials; i += 1) {
    const index = draw() - min;
    bins[index] = (bins[index] ?? 0) + 1;
  }
  return bins;
}

const TRIALS = 20_000;
const MIN = 0;
const MAX = 9;

it("seeded source(xoshiro128**): 균등성이 카이제곱 검정을 통과한다", () => {
  const source = createXoshiro128Source("int-chi-square-seeded");
  const observed = frequencies(() => int(source, MIN, MAX), MIN, MAX, TRIALS);
  expect(chiSquare(observed)).toBeLessThan(chiSquareCritical(MAX - MIN));
});

it("secure source(crypto stub): 균등성이 카이제곱 검정을 통과한다", () => {
  const nextBytes = seededBytes(0x51a7e);
  installCryptoStub({ fill: (view) => view.set(nextBytes(view.length)) });
  const source = createSecureSource();
  const observed = frequencies(() => int(source, MIN, MAX), MIN, MAX, TRIALS);
  expect(chiSquare(observed)).toBeLessThan(chiSquareCritical(MAX - MIN));
});

it("custom source(주입 word 스트림): 균등성이 카이제곱 검정을 통과한다", () => {
  const nextBytes = seededBytes(0x9d1c0e);
  const source = () => new DataView(nextBytes(4).buffer).getUint32(0);
  const observed = frequencies(() => int(source, MIN, MAX), MIN, MAX, TRIALS);
  expect(chiSquare(observed)).toBeLessThan(chiSquareCritical(MAX - MIN));
});
