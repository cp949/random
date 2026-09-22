/**
 * `fnv1a`, `createSplitMix32`, `normalizeSeed`를 검증한다.
 * `fnv1a`는 ASCII 문자열에서 표준 byte 단위 FNV-1a-32와 결과가 같아야 하므로 공개된 FNV 테스트
 * 벡터("", "a", "foobar")와 대조한다. `createSplitMix32`는 Python으로 재계산한 golden vector와
 * 대조한다(상수: 증분 `0x9e3779b9`, mixer `>>> 15`·`0x85ebca6b`·`>>> 13`·`0xc2b2ae35`·`>>> 16`). 이 파일은 `describe`를 쓰지 않는다(Stryker vitest 러너가 `describe` 안의
 * 테스트를 mutant 실행 대상으로 선택하지 못하는 문제 — `internal/uniform-int.test.ts` 참고).
 */
import { expect, it } from "vitest";
import { createSplitMix32, fnv1a, normalizeSeed } from "../../src/core/seed.js";

it("fnv1a: 빈 문자열은 FNV offset basis 0x811c9dc5를 그대로 돌려준다", () => {
  expect(fnv1a("")).toBe(0x811c9dc5);
});

it("fnv1a: 'a'는 표준 FNV-1a-32 테스트 벡터 0xe40c292c와 같다", () => {
  expect(fnv1a("a")).toBe(0xe40c292c);
});

it("fnv1a: 'foobar'는 표준 FNV-1a-32 테스트 벡터 0xbf9cf968와 같다", () => {
  expect(fnv1a("foobar")).toBe(0xbf9cf968);
});

it("fnv1a: 같은 문자열은 항상 같은 해시를 돌려준다", () => {
  expect(fnv1a("재현 가능한 난수")).toBe(fnv1a("재현 가능한 난수"));
});

it("createSplitMix32: seed 0의 첫 4개 word가 golden vector와 같다", () => {
  const next = createSplitMix32(0);
  expect([next(), next(), next(), next()]).toEqual([
    4079132893, 1926097611, 2141342850, 1573532682,
  ]);
});

it("createSplitMix32: seed 1의 첫 4개 word가 golden vector와 같다", () => {
  const next = createSplitMix32(1);
  expect([next(), next(), next(), next()]).toEqual([
    112534334, 2466076606, 3094215072, 916842724,
  ]);
});

it("createSplitMix32: 서로 다른 인스턴스는 상태를 공유하지 않는다", () => {
  const a = createSplitMix32(7);
  const b = createSplitMix32(7);
  a(); // a의 상태만 진행시킨다
  expect(b()).toBe(createSplitMix32(7)()); // b는 아직 첫 호출 전이라 새 인스턴스의 첫 값과 같다
});

it("normalizeSeed: 0 이상 safe integer는 그대로 uint32로 돌려준다", () => {
  expect(normalizeSeed(0)).toBe(0);
  expect(normalizeSeed(42)).toBe(42);
});

it("normalizeSeed: 음수는 >>> 0으로 정규화한다", () => {
  expect(normalizeSeed(-1)).toBe(4294967295);
});

it("normalizeSeed: MAX_SAFE_INTEGER는 -1과 같은 uint32로 정규화된다", () => {
  expect(normalizeSeed(Number.MAX_SAFE_INTEGER)).toBe(4294967295);
});

it("normalizeSeed: 2^32 + 1은 1과 같은 uint32로 정규화된다(별칭)", () => {
  expect(normalizeSeed(2 ** 32 + 1)).toBe(normalizeSeed(1));
});

it("normalizeSeed: 문자열 '123'과 숫자 123은 다른 값이다", () => {
  expect(normalizeSeed("123")).not.toBe(normalizeSeed(123));
});

it("normalizeSeed: 문자열은 fnv1a와 같은 값을 돌려준다", () => {
  expect(normalizeSeed("hello")).toBe(fnv1a("hello"));
});

const invalidSeeds: unknown[] = [
  1.5,
  NaN,
  Infinity,
  -Infinity,
  undefined,
  null,
  {},
  [],
  true,
];
for (const seed of invalidSeeds) {
  it(`normalizeSeed: ${JSON.stringify(seed)}은 RangeError다`, () => {
    expect(() => normalizeSeed(seed)).toThrow(RangeError);
    expect(() => normalizeSeed(seed)).toThrow(/seed/);
  });
}

/**
 * 대표 seed에서 SplitMix32가 만든 4-word 상태가 all-zero가 아님을 확인한다.
 * 보정 분기는 없다. mixer가 전단사이고 네 입력(`seed + k * 0x9e3779b9`)이 서로 다르므로
 * 출력 넷이 모두 0일 수 없다(`docs/product/random-core-requirements.md` SRC-3).
 */
const representativeSeeds: (number | string)[] = [
  0,
  1,
  -1,
  0xffffffff,
  Number.MAX_SAFE_INTEGER,
  "",
  "a",
];
for (const seed of representativeSeeds) {
  it(`seed ${JSON.stringify(seed)}의 4-word 상태는 all-zero가 아니다`, () => {
    const next = createSplitMix32(normalizeSeed(seed));
    const state = [next(), next(), next(), next()];
    expect(state.some((word) => word !== 0)).toBe(true);
  });
}
