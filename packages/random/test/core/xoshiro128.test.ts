/**
 * `createXoshiro128Source`를 검증한다. raw 출력 golden vector는 seed→상태(FNV-1a·SplitMix32)를 Python으로,
 * 상태→출력을 Blackman·Vigna의 참조 구현 `xoshiro128starstar.c`(gcc 컴파일)로 독립 생성한 값이며
 * 이 구현의 출력을 복사한 값이 아니다.
 * `fnv1a`/`createSplitMix32`의 golden vector는 `seed.test.ts`가 따로 검증하므로 여기서는
 * seed→raw 출력 전체 파이프라인만 본다. 이 파일은 `describe`를 쓰지 않는다(이유는
 * `internal/uniform-int.test.ts` 참고).
 */
import { expect, it } from "vitest";
import { createSplitMix32, normalizeSeed } from "../../src/core/seed.js";
import {
  createXoshiro128Source,
  createXoshiro128SourceFromState,
} from "../../src/core/xoshiro128.js";

function firstN(source: () => number, n: number): number[] {
  return Array.from({ length: n }, () => source());
}

const goldenVectors: [seed: number | string, first5: number[]][] = [
  [0, [421714071, 3306423891, 3703563693, 2338474910, 441977797]],
  [1, [1144403687, 1290228702, 3651710282, 626043614, 3583050788]],
  [42, [3514831625, 2416850046, 1824449730, 3924724315, 1889077669]],
  [-1, [2529976508, 137785713, 1957191416, 407456516, 1987284384]],
  [
    Number.MAX_SAFE_INTEGER,
    [2529976508, 137785713, 1957191416, 407456516, 1987284384],
  ],
  ["hello", [2966572188, 3720780506, 139503483, 3335792593, 1040972122]],
  ["", [44620852, 3074285029, 1870067664, 1137970309, 2080659996]],
  [
    "재현 가능한 난수",
    [1701389112, 3587049358, 1567586984, 2571660065, 3229410156],
  ],
];

for (const [seed, expected] of goldenVectors) {
  it(`golden vector: seed ${JSON.stringify(seed)}의 첫 5개 word가 고정된다`, () => {
    const source = createXoshiro128Source(seed);
    expect(firstN(source, 5)).toEqual(expected);
  });
}

it("숫자 -1과 MAX_SAFE_INTEGER는 같은 uint32로 정규화되어 같은 출력을 낸다", () => {
  const a = firstN(createXoshiro128Source(-1), 3);
  const b = firstN(createXoshiro128Source(Number.MAX_SAFE_INTEGER), 3);
  expect(a).toEqual(b);
});

it("숫자 2^32 + 1과 1은 같은 uint32로 정규화되어 같은 출력을 낸다(별칭)", () => {
  expect(firstN(createXoshiro128Source(2 ** 32 + 1), 3)).toEqual(
    firstN(createXoshiro128Source(1), 3),
  );
});

it("문자열 '123'과 숫자 123은 다른 상태를 만든다", () => {
  expect(firstN(createXoshiro128Source("123"), 3)).not.toEqual(
    firstN(createXoshiro128Source(123), 3),
  );
});

it("호출마다 독립된 상태를 가진다. 한 source를 진행시켜도 다른 source에 영향이 없다", () => {
  const a = createXoshiro128Source(123);
  const b = createXoshiro128Source(123);
  a();
  a();
  expect(b()).toBe(createXoshiro128Source(123)());
});

it("word는 항상 [0, 2^32)의 정수다", () => {
  const source = createXoshiro128Source("bounds-check");
  for (const word of firstN(source, 200)) {
    expect(Number.isInteger(word)).toBe(true);
    expect(word).toBeGreaterThanOrEqual(0);
    expect(word).toBeLessThan(2 ** 32);
  }
});

const invalidSeeds: unknown[] = [undefined, null, 1.5, NaN, {}, []];
for (const seed of invalidSeeds) {
  it(`seed ${JSON.stringify(seed)}은 RangeError다`, () => {
    expect(() => createXoshiro128Source(seed as never)).toThrow(RangeError);
    expect(() => createXoshiro128Source(seed as never)).toThrow(/seed/);
  });
}

it("fromState: SplitMix32 word 4개를 직접 넣으면 같은 seed의 createXoshiro128Source와 같은 출력을 낸다", () => {
  const nextSeedWord = createSplitMix32(normalizeSeed(42));
  const source = createXoshiro128SourceFromState([
    nextSeedWord(),
    nextSeedWord(),
    nextSeedWord(),
    nextSeedWord(),
  ]);
  expect(firstN(source, 5)).toEqual([
    3514831625, 2416850046, 1824449730, 3924724315, 1889077669,
  ]);
});

it("fromState: 넘긴 배열을 나중에 바꿔도 source는 영향받지 않는다", () => {
  const state: [number, number, number, number] = [1, 2, 3, 4];
  const a = createXoshiro128SourceFromState(state);
  state[0] = 0xffffffff;
  expect(firstN(a, 3)).toEqual(
    firstN(createXoshiro128SourceFromState([1, 2, 3, 4]), 3),
  );
});

it("fromState: 같은 상태로 만든 두 source는 독립이다", () => {
  const state: [number, number, number, number] = [5, 6, 7, 8];
  const a = createXoshiro128SourceFromState(state);
  firstN(a, 5);
  const b = createXoshiro128SourceFromState(state);
  const c = createXoshiro128SourceFromState(state);
  expect(b()).toBe(c());
});
