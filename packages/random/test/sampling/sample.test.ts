/**
 * `sample(source, items, count)`를 검증한다(vectra `pickUnique`, strict). 인덱스 추출은
 * `uniformInt`를 그대로 거치므로 rejection sampling 경계는 `uniform-int.test.ts`가 검증한다.
 * off-by-one mutation(변형 C) 검출은 `helpers/position-frequency.test.ts`에 있다.
 *
 * 이 파일은 `describe`를 쓰지 않는다(`sample.ts`가 mutation 대상, TRP-004).
 */
import { expect, it } from "vitest";
import { sample } from "../../src/sampling/sample.js";
import { createXoshiro128Source } from "../../src/core/xoshiro128.js";
import { chiSquare, chiSquareCritical } from "../helpers/chi-square.js";

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

it("source가 함수가 아니면 RangeError다", () => {
  expect(() => sample("not a function" as never, [1, 2, 3], 1)).toThrow(
    RangeError,
  );
});

it("items가 배열이 아니면 RangeError다", () => {
  const source = wordSource([0]);
  for (const invalid of ["abc", new Uint8Array(3), { length: 3 }, null]) {
    expect(() => sample(source, invalid as never, 1)).toThrow(/items/);
  }
});

it("count가 음수, 비정수, NaN, items.length 초과면 RangeError다(clamp하지 않는다)", () => {
  const source = wordSource([0]);
  const items = ["a", "b"];
  expect(() => sample(source, items, -1)).toThrow(/count/);
  expect(() => sample(source, items, 1.5)).toThrow(/count/);
  expect(() => sample(source, items, Number.NaN)).toThrow(/count/);
  expect(() => sample(source, items, 3)).toThrow(/count/);
  expect(() => sample(source, [], 1)).toThrow(/count/);
});

it("검증 순서: source -> items -> count -> source 호출. 실패하면 source를 호출하지 않는다", () => {
  let calls = 0;
  const source = () => {
    calls += 1;
    return 0;
  };
  expect(() => sample(source, "abc" as never, 1)).toThrow(RangeError);
  expect(() => sample(source, [1, 2], 3)).toThrow(RangeError);
  expect(calls).toBe(0);
});

it("count === 0이면 []를 돌려주고 word를 소비하지 않는다", () => {
  expect(sample(wordSource([]), [1, 2, 3], 0)).toEqual([]);
  expect(sample(wordSource([]), [], 0)).toEqual([]);
});

it("word 주입: n=4, count=2에 [2, 0]을 주입하면 [2, 1]이다", () => {
  // i=0: j=0+uniformInt(4)=2 -> swap(0,2): [2,1,0,3]
  // i=1: j=1+uniformInt(3)=1 -> swap(1,1)(제자리): [2,1,0,3] -> 앞 2개: [2,1]
  expect(sample(wordSource([2, 0]), [0, 1, 2, 3], 2)).toEqual([2, 1]);
});

it("pool.length - i === 1(마지막 원소 하나 남음) 단계는 word를 소비하지 않는다", () => {
  // n=3, count=3: i=0(3개 중), i=1(2개 중)까지만 word를 쓰고 i=2(1개 남음)는 안 쓴다.
  // word를 2개만 주입해도 3번째 반복에서 예외가 나지 않아야 한다.
  expect(sample(wordSource([0, 1]), [0, 1, 2], 3)).toEqual([0, 2, 1]);
});

it("복사본이며 입력을 바꾸지 않는다", () => {
  const items = [0, 1, 2, 3, 4];
  const original = [...items];
  const result = sample(createXoshiro128Source("sample-copy"), items, 3);
  expect(items).toEqual(original);
  expect(result).not.toBe(items);
});

it("count === items.length면 결과가 items의 순열이다(원소 보존, 중복 없음)", () => {
  const source = createXoshiro128Source("sample-full-permutation");
  const items = [10, 20, 30, 40, 50];
  const result = sample(source, items, items.length);
  expect(result).toHaveLength(items.length);
  expect([...result].sort()).toEqual([...items].sort());
});

it("결과 원소가 입력에 있고 중복 인덱스가 없다(중복 값 입력 포함)", () => {
  const source = createXoshiro128Source("sample-duplicate-values");
  const items = [1, 1, 2];
  const result = sample(source, items, 2);
  expect(result).toHaveLength(2);
  // 값 1이 두 번 뽑힐 수 있으나(서로 다른 인덱스) 뽑힌 값 전체는 항상 입력의 부분 다중집합이다.
  const remaining = [...items];
  for (const value of result) {
    const at = remaining.indexOf(value);
    expect(at).not.toBe(-1);
    remaining.splice(at, 1);
  }
});

it("위치별 값 빈도와 값별 포함 빈도가 카이제곱 검정을 통과한다", () => {
  const source = createXoshiro128Source("sample-chi-square");
  const n = 8;
  const count = 3;
  const trials = 20_000;
  const items = Array.from({ length: n }, (_, i) => i);

  const positionCounts = Array.from(
    { length: count },
    () => new Array(n).fill(0) as number[],
  );
  const inclusionCounts = new Array(n).fill(0) as number[];
  for (let t = 0; t < trials; t += 1) {
    const result = sample(source, items, count);
    for (let position = 0; position < count; position += 1) {
      const value = result[position]!;
      const row = positionCounts[position]!;
      row[value] = row[value]! + 1;
    }
    for (const value of result) {
      inclusionCounts[value] = inclusionCounts[value]! + 1;
    }
  }

  const positionCritical = chiSquareCritical(n - 1);
  for (const row of positionCounts) {
    expect(chiSquare(row)).toBeLessThan(positionCritical);
  }

  const expectedInclusion = items.map(() => (trials * count) / n);
  expect(chiSquare(inclusionCounts, expectedInclusion)).toBeLessThan(
    positionCritical,
  );
});
