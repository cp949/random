/**
 * `@cp949/random`(root) 진입점의 공개 표면을 고정한다: 값 export 이름 목록과 공개 함수의 타입.
 * root는 재현 가능한 난수 코어와 컬렉션 샘플링을 내보내며 crypto에 접근하는 코드
 * (`createSecureSource`, `SecureRandomUnavailableError`)는 `./secure`에 있다. 새 값 export를
 * 추가하면 `expectedExports`에 이름을 더한다. 이름이 목록에 없거나 빠지면 실패한다.
 * import 시점에 crypto를 건드리지 않는다는 계약은 `entries.test.ts`가 검증한다.
 * 이 파일은 mutation 대상 함수를 호출하지 않는다(`describe` 안은 Stryker가 mutant 실행 때 선택하지 못한다).
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import * as rootEntry from "../src/index.js";
import type { RandomSource } from "../src/index.js";
import type { WeightedSampler } from "../src/sampling/weighted-sampler.js";

/** root entry가 내보내는 값 export의 이름(정렬). */
const expectedExports = [
  "bool",
  "choice",
  "createWeightedSampler",
  "createXoshiro128Source",
  "float",
  "int",
  "permutation",
  "sample",
  "shuffle",
  "shuffleInPlace",
  "sign",
  "uniform",
  "weightedChoice",
];

describe("@cp949/random 진입점", () => {
  it("값 export의 이름 목록이 고정돼 있다", () => {
    expect(Object.keys(rootEntry).sort()).toEqual(expectedExports);
  });

  it("crypto 관련 export(createSecureSource, SecureRandomUnavailableError)는 root에 없다", () => {
    expect(rootEntry).not.toHaveProperty("createSecureSource");
    expect(rootEntry).not.toHaveProperty("SecureRandomUnavailableError");
  });

  it("상태 facade export(createRandomState, rand)는 root에 없다", () => {
    expect(rootEntry).not.toHaveProperty("createRandomState");
    expect(rootEntry).not.toHaveProperty("rand");
  });

  it("RandomSource는 인자 없이 uint32를 돌려주는 함수 타입이다", () => {
    expectTypeOf<RandomSource>().toEqualTypeOf<() => number>();
  });

  it("createXoshiro128Source는 (seed: number | string) => RandomSource다", () => {
    expectTypeOf(rootEntry.createXoshiro128Source).toEqualTypeOf<
      (seed: number | string) => RandomSource
    >();
  });

  it("int/uniform은 (source, min, max) => number다", () => {
    expectTypeOf(rootEntry.int).toEqualTypeOf<
      (source: RandomSource, min: number, max: number) => number
    >();
    expectTypeOf(rootEntry.uniform).toEqualTypeOf<
      (source: RandomSource, min: number, max: number) => number
    >();
  });

  it("float은 (source) => number, bool은 (source, p?) => boolean, sign은 (source) => 1 | -1이다", () => {
    expectTypeOf(rootEntry.float).toEqualTypeOf<
      (source: RandomSource) => number
    >();
    expectTypeOf(rootEntry.bool).toEqualTypeOf<
      (source: RandomSource, p?: number) => boolean
    >();
    expectTypeOf(rootEntry.sign).toEqualTypeOf<
      (source: RandomSource) => 1 | -1
    >();
  });

  it("choice/shuffle/shuffleInPlace/sample/permutation의 타입이 design spec 5절과 같다", () => {
    expectTypeOf(rootEntry.choice).toEqualTypeOf<
      <T>(source: RandomSource, items: readonly T[]) => T
    >();
    expectTypeOf(rootEntry.shuffle).toEqualTypeOf<
      <T>(source: RandomSource, items: readonly T[]) => T[]
    >();
    expectTypeOf(rootEntry.shuffleInPlace).toEqualTypeOf<
      <T>(source: RandomSource, items: T[]) => T[]
    >();
    expectTypeOf(rootEntry.sample).toEqualTypeOf<
      <T>(source: RandomSource, items: readonly T[], count: number) => T[]
    >();
    expectTypeOf(rootEntry.permutation).toEqualTypeOf<
      (source: RandomSource, length: number) => number[]
    >();
  });

  it("weightedChoice/createWeightedSampler의 타입이 design spec 5절과 같다", () => {
    expectTypeOf(rootEntry.weightedChoice).toEqualTypeOf<
      <T>(
        source: RandomSource,
        items: readonly T[],
        weights: readonly number[],
      ) => T
    >();
    expectTypeOf(rootEntry.createWeightedSampler).toEqualTypeOf<
      <T>(items: readonly T[], weights: readonly number[]) => WeightedSampler<T>
    >();
  });
});
