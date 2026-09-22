/**
 * `@cp949/random/id` 진입점의 공개 표면을 고정한다: 값 export 이름 목록과 `./secure`와의 클래스 동일성.
 * 새 값 export를 추가하면 `expectedExports`에 이름을 더한다. 이름이 목록에 없거나 빠지면 이 테스트가 실패한다.
 * import 시점에 crypto를 건드리지 않는다는 계약은 `entries.test.ts`가 `exports`의 모든 entry에 대해 검증한다.
 * 이 파일은 mutation 대상 함수를 호출하지 않는다(`describe` 안의 테스트는 Stryker가 mutant 실행 때 선택하지 못한다).
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import * as idEntry from "../../src/id/index.js";
import type {
  CounterIdGenerator,
  CounterIdOptions,
  CyclicIdGenerator,
  CyclicIdOptions,
  CyclicIdPreset,
  IsUuidOptions,
  RandomIdOptions,
  RandomIdFactoryOptions,
  RandomIdPreset,
  UuidFormat,
  Uuidv4FactoryOptions,
  Uuidv7FactoryOptions,
} from "../../src/id/index.js";
import {
  IdCollisionError as InternalIdCollisionError,
  SecureRandomUnavailableError as InternalSecureRandomUnavailableError,
} from "../../src/internal/errors.js";
import * as secureEntry from "../../src/secure/index.js";

/** `./id`가 내보내는 값 export의 이름(정렬). */
const expectedExports = [
  "IdCollisionError",
  "SecureRandomUnavailableError",
  "createCounterIdFactory",
  "createCyclicIdFactory",
  "createRandomIdFactory",
  "createUuidv4Factory",
  "createUuidv7Factory",
  "isUuid",
  "nanoid",
  "parseUuid",
  "randomId",
  "stringifyUuid",
  "uuidv4",
  "uuidv7",
];

describe("@cp949/random/id 진입점", () => {
  it("값 export의 이름 목록이 고정돼 있다", () => {
    expect(Object.keys(idEntry).sort()).toEqual(expectedExports);
  });

  it("SecureRandomUnavailableError는 ./secure와 같은 클래스다", () => {
    // 두 진입점이 클래스를 각자 정의하면 한쪽에서 던진 오류를 다른 쪽의 클래스로 잡지 못한다.
    expect(idEntry.SecureRandomUnavailableError).toBe(
      secureEntry.SecureRandomUnavailableError,
    );
    expect(idEntry.SecureRandomUnavailableError).toBe(
      InternalSecureRandomUnavailableError,
    );
  });

  it("IdCollisionError는 내부 구현과 같은 클래스이고 attempts를 보관한다", () => {
    expect(idEntry.IdCollisionError).toBe(InternalIdCollisionError);
    expect(new idEntry.IdCollisionError(5).attempts).toBe(5);
  });

  it("IdCollisionError는 ./secure로 내보내지 않는다", () => {
    expect(Object.keys(secureEntry)).not.toContain("IdCollisionError");
  });

  it("타입 export: 순환·카운터 preset·옵션·생성기를 이름으로 가져올 수 있다", () => {
    expectTypeOf<CyclicIdPreset>().toEqualTypeOf<
      "int8" | "uint8" | "int16" | "uint16" | "int32" | "uint32"
    >();
    expectTypeOf<CyclicIdOptions>().toEqualTypeOf<{
      preset?: CyclicIdPreset;
      min?: number;
      max?: number;
      start?: number;
      step?: number;
    }>();
    expectTypeOf<CounterIdOptions>().toEqualTypeOf<{
      prefix?: string;
      separator?: string;
      radix?: number;
      pad?: number;
      case?: "lower" | "upper";
      min?: number;
      max?: number;
      start?: number;
      step?: number;
    }>();
    expectTypeOf<ReturnType<CyclicIdGenerator>>().toEqualTypeOf<number>();
    expectTypeOf<CyclicIdGenerator["peek"]>().toEqualTypeOf<() => number>();
    expectTypeOf<CyclicIdGenerator["reset"]>().toEqualTypeOf<
      (start?: number) => void
    >();
    expectTypeOf<ReturnType<CounterIdGenerator>>().toEqualTypeOf<string>();
    expectTypeOf<CounterIdGenerator["peek"]>().toEqualTypeOf<() => string>();
    expectTypeOf<CounterIdGenerator["reset"]>().toEqualTypeOf<
      (start?: number) => void
    >();
    expectTypeOf<
      ReturnType<typeof idEntry.createCyclicIdFactory>
    >().toEqualTypeOf<CyclicIdGenerator>();
    expectTypeOf<
      ReturnType<typeof idEntry.createCounterIdFactory>
    >().toEqualTypeOf<CounterIdGenerator>();
  });

  it("타입 export: UuidFormat, IsUuidOptions, Uuidv4FactoryOptions, Uuidv7FactoryOptions를 이름으로 가져올 수 있다", () => {
    // 타입은 런타임에 없으므로 컴파일로 이름을 확인한다. 필드 형태는 format.test.ts가 고정한다.
    expectTypeOf<UuidFormat>().toBeObject();
    expectTypeOf<IsUuidOptions>().toBeObject();
    // 형식 옵션에 난수원 주입만 더한다. 시계(`now`)는 없다.
    expectTypeOf<Uuidv4FactoryOptions>().toEqualTypeOf<{
      dashes?: boolean;
      case?: "lower" | "upper";
      randomBytes?: (length: number) => Uint8Array;
    }>();
    // v7 팩토리만 시계(`now`)를 받는다.
    expectTypeOf<Uuidv7FactoryOptions>().toEqualTypeOf<{
      dashes?: boolean;
      case?: "lower" | "upper";
      randomBytes?: (length: number) => Uint8Array;
      now?: () => number;
    }>();
  });

  it("타입 export: 무작위 ID 옵션·팩토리 옵션·preset을 이름으로 가져올 수 있다", () => {
    expectTypeOf<RandomIdPreset>().toEqualTypeOf<
      "base64url" | "base62" | "base36" | "digits" | "readable"
    >();
    expectTypeOf<RandomIdOptions>().toEqualTypeOf<{
      prefix?: string;
      separator?: string;
      length?: number;
      bits?: number;
      preset?: RandomIdPreset;
      alphabet?: string;
      case?: "lower" | "upper";
      group?: number;
      groupSeparator?: string;
      startWithLetter?: boolean;
      timestamp?: boolean;
      isTaken?: (id: string) => boolean;
      maxAttempts?: number;
    }>();
    expectTypeOf<RandomIdFactoryOptions["randomBytes"]>().toEqualTypeOf<
      ((length: number) => Uint8Array) | undefined
    >();
    expectTypeOf<RandomIdFactoryOptions["now"]>().toEqualTypeOf<
      (() => number) | undefined
    >();
  });
});
