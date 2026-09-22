/**
 * `@cp949/random/state` 진입점의 공개 표면을 고정한다: 값 export 이름 목록, `./secure`와의 클래스
 * 동일성, 타입 export. import 시점에 crypto를 건드리지 않는다는 계약은 `entries.test.ts`가 검증한다.
 * 이 파일은 mutation 대상 함수를 호출하지 않는다.
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import type { RandomSource } from "../../src/core/random-source.js";
import { SecureRandomUnavailableError as InternalSecureRandomUnavailableError } from "../../src/internal/errors.js";
import * as secureEntry from "../../src/secure/index.js";
import * as stateEntry from "../../src/state/index.js";
import type {
  RandomSource as StateRandomSource,
  RandomState,
  RandomStateOptions,
} from "../../src/state/index.js";

/** `./state`가 내보내는 값 export의 이름(정렬). */
const expectedExports = [
  "SecureRandomUnavailableError",
  "createRandomState",
  "rand",
];

describe("@cp949/random/state 진입점", () => {
  it("값 export의 이름 목록이 고정돼 있다", () => {
    expect(Object.keys(stateEntry).sort()).toEqual(expectedExports);
  });

  it("SecureRandomUnavailableError는 ./secure·internal과 같은 클래스다", () => {
    expect(stateEntry.SecureRandomUnavailableError).toBe(
      secureEntry.SecureRandomUnavailableError,
    );
    expect(stateEntry.SecureRandomUnavailableError).toBe(
      InternalSecureRandomUnavailableError,
    );
  });

  it("타입: createRandomState의 시그니처와 RandomStateOptions·RandomState의 형태가 고정돼 있다", () => {
    expectTypeOf(stateEntry.createRandomState).toEqualTypeOf<
      (seed?: number | string, options?: RandomStateOptions) => RandomState
    >();
    expectTypeOf<RandomStateOptions>().toEqualTypeOf<{
      source?: RandomSource;
    }>();
    expectTypeOf<RandomState["source"]>().toEqualTypeOf<RandomSource>();
    expectTypeOf<RandomState["int"]>().toEqualTypeOf<
      (min: number, max: number) => number
    >();
    expectTypeOf<RandomState["bool"]>().toEqualTypeOf<
      (p?: number) => boolean
    >();
    expectTypeOf<RandomState["choice"]>().toEqualTypeOf<
      <T>(items: readonly T[]) => T
    >();
    expectTypeOf<RandomState["weightedChoice"]>().toEqualTypeOf<
      <T>(items: readonly T[], weights: readonly number[]) => T
    >();
    expectTypeOf<RandomState["permutation"]>().toEqualTypeOf<
      (length: number) => number[]
    >();
    expectTypeOf(stateEntry.rand).toEqualTypeOf<RandomState>();
  });

  it("타입: ./state의 RandomSource는 root의 RandomSource와 같다", () => {
    expectTypeOf<StateRandomSource>().toEqualTypeOf<RandomSource>();
  });
});
