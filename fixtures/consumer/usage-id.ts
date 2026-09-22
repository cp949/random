import {
  IdCollisionError,
  SecureRandomUnavailableError,
  createCounterIdFactory,
  createCyclicIdFactory,
  createRandomIdFactory,
  randomId,
  createUuidv4Factory,
  createUuidv7Factory,
  isUuid,
  nanoid,
  parseUuid,
  stringifyUuid,
  uuidv4,
  uuidv7,
  type CounterIdGenerator,
  type CounterIdOptions,
  type CyclicIdGenerator,
  type CyclicIdOptions,
  type CyclicIdPreset,
  type IsUuidOptions,
  type RandomIdOptions,
  type RandomIdFactoryOptions,
  type RandomIdPreset,
  type UuidFormat,
  type Uuidv4FactoryOptions,
  type Uuidv7FactoryOptions,
} from "@cp949/random/id";
import { randomBytes } from "@cp949/random/secure";

/** 접두사 ID. length는 무작위 부분의 길이다. */
export function userId(): string {
  return randomId({ prefix: "usr", length: 16 });
}

/** 시각이 붙은 요청 ID. */
export function requestId(): string {
  return randomId({ prefix: "req", timestamp: true, length: 8 });
}

/** 숫자 6자리 문자열. */
export function numericCode(): string {
  return randomId({ preset: "digits", length: 6 });
}

/** 영문자로 시작하는 HTML 식별자. */
export function htmlId(): string {
  return randomId({ startWithLetter: true, length: 10 });
}

/** 동기 충돌 검사. */
export function unusedId(used: Set<string>): string {
  return randomId({ length: 12, isTaken: (id) => used.has(id) });
}

/** 읽기 쉬운 그룹 코드. */
export function readableCode(): string {
  return randomId({ preset: "readable", length: 12, group: 4 });
}

/** 충돌 검사를 생성기에 보관한다. */
export function unusedIdFactory(used: Set<string>): () => string {
  return createRandomIdFactory({ isTaken: (id) => used.has(id) });
}

/** 공개 옵션 타입은 preset 리터럴과 주입 함수를 정확히 해석한다. */
export function typedRandomId(): string {
  const preset: RandomIdPreset = "base36";
  const options: RandomIdOptions = { preset, bits: 128 };
  return randomId(options);
}

/** 팩토리 옵션 타입과 secure 난수원은 구조적으로 호환된다. */
export function typedRandomIdFactory(): () => string {
  const options: RandomIdFactoryOptions = {
    randomBytes,
    timestamp: true,
    now: () => Date.now(),
  };
  return createRandomIdFactory(options);
}

/** 일회성 함수에는 난수원을 주입하지 못한다. */
export function invalidRandomIdInjection(): string {
  // @ts-expect-error randomId 옵션에는 randomBytes가 없다.
  return randomId({ randomBytes });
}

// @ts-expect-error preset은 정의한 다섯 리터럴만 받는다.
export const invalidPreset: RandomIdPreset = "hex";

/**
 * 소비자 사용 fixture: 설치된 `@cp949/random/id`의 타입 선언이 `NodeNext`·`Bundler`·TypeScript 5.7 lane에서
 * 해석돼야 한다. 호출은 사례 하나에 식 하나로 쓰고 반환 타입을 `string`으로 고정한다.
 */
export function defaultId(): string {
  return nanoid();
}

/** 길이를 지정한 호출. */
export function shortId(): string {
  return nanoid(12);
}

/**
 * `./id`가 내보내는 두 오류 클래스는 `instanceof`로 구분해 잡을 수 있어야 하고 `IdCollisionError`는 `attempts`를 읽을 수 있어야 한다.
 * 좁혀진 타입에서 속성을 읽으므로 클래스 선언이 해석되지 않으면 컴파일이 실패한다.
 */
export function describeIdError(error: unknown): string {
  if (error instanceof IdCollisionError) {
    const attempts: number = error.attempts;
    return `충돌 ${attempts}회`;
  }
  if (error instanceof SecureRandomUnavailableError) {
    return "crypto 미지원";
  }
  return "그 밖의 오류";
}

/**
 * `parseUuid`의 결과를 lib.dom의 `SubtleCrypto`에 캐스팅 없이 넘길 수 있어야 한다.
 * 반환 타입이 `Uint8Array<ArrayBuffer>`가 아니면 `BufferSource`에 대입되지 않아 컴파일이 실패한다.
 */
export function digestOfUuidBytes(): Promise<ArrayBuffer> {
  return crypto.subtle.digest(
    "SHA-256",
    parseUuid("c232ab00-9414-11ec-b3c8-9f6bdeced846"),
  );
}

/**
 * `isUuid`는 `unknown`을 `string`으로 좁히는 타입 가드다.
 * 좁혀지지 않으면 `value.toUpperCase()`가 컴파일 오류다.
 */
export function upperCaseIfUuid(value: unknown): string | undefined {
  return isUuid(value) ? value.toUpperCase() : undefined;
}

/** `IsUuidOptions`는 `version`(1~8)과 `dashes`(boolean)를 받는다. */
export function isCompactUuidV7(value: unknown): boolean {
  const options: IsUuidOptions = { version: 7, dashes: false };
  return isUuid(value, options);
}

/** `UuidFormat`은 `dashes`(boolean)와 `case`(`"lower"` | `"upper"`)를 받는다. */
export function upperCompactUuid(bytes: Uint8Array): string {
  const format: UuidFormat = { dashes: false, case: "upper" };
  return stringifyUuid(bytes, format);
}

/** 문자열 → 바이트 → 문자열 왕복. `parseUuid`의 결과가 `stringifyUuid`의 인자로 그대로 들어간다. */
export function roundTripUuid(text: string): string {
  return stringifyUuid(parseUuid(text));
}

/** 대시 없는 UUID. 결과는 `string`이다. */
export function compactUuid(): string {
  return uuidv4({ dashes: false });
}

/** 형식 옵션 없이 부르면 대시 있는 소문자 UUID다. */
export function defaultUuid(): string {
  return uuidv4();
}

/**
 * `@cp949/random/secure`의 `randomBytes`가 캐스팅 없이 `randomBytes` 옵션에 들어가야 한다.
 * 반환 타입 `Uint8Array<ArrayBuffer>`가 옵션의 `Uint8Array`에 맞지 않으면 컴파일이 실패한다.
 */
export function uuidFactoryWithSecureBytes(): () => string {
  return createUuidv4Factory({ randomBytes });
}

/** `Uuidv4FactoryOptions`는 형식 옵션(`dashes`, `case`)과 `randomBytes`를 함께 받는다. */
export function upperCompactUuidFactory(): () => string {
  const options: Uuidv4FactoryOptions = {
    dashes: false,
    case: "upper",
    randomBytes: (length) => new Uint8Array(length),
  };
  return createUuidv4Factory(options);
}

/** 옵션 없이도 팩토리를 만들 수 있다. 결과는 호출할 때마다 `string`을 돌려주는 함수다. */
export function defaultUuidFactory(): () => string {
  return createUuidv4Factory();
}

/** 일회성 `uuidv4`는 난수원을 받지 않는다. 결정적 테스트는 팩토리로 한다. */
export function invalidOneOffInjection(): string {
  // @ts-expect-error 일회성 uuidv4의 format에는 randomBytes가 없다.
  return uuidv4({ randomBytes });
}

/** 시간순으로 정렬되는 UUID v7. 형식 옵션은 `uuidv4`와 같다. 결과는 `string`이다. */
export function sortableUuid(): string {
  return uuidv7({ case: "upper" });
}

/**
 * `@cp949/random/secure`의 `randomBytes`와 `Date.now`가 캐스팅 없이 v7 팩토리의 주입 옵션에 들어가야 한다.
 * `randomBytes`의 반환 타입 `Uint8Array<ArrayBuffer>`나 `Date.now`의 `() => number`가 맞지 않으면 컴파일이 실패한다.
 */
export function uuidv7FactoryWithSecureBytes(): () => string {
  return createUuidv7Factory({ now: () => Date.now(), randomBytes });
}

/** `Uuidv7FactoryOptions`는 형식 옵션(`dashes`, `case`)과 `randomBytes`, `now`를 함께 받는다. */
export function upperCompactUuidv7Factory(): () => string {
  const options: Uuidv7FactoryOptions = {
    dashes: false,
    case: "upper",
    randomBytes: (length) => new Uint8Array(length),
    now: () => 1_700_000_000_000,
  };
  return createUuidv7Factory(options);
}

/** 일회성 `uuidv7`은 시계를 받지 않는다. 결정적 테스트는 팩토리로 한다. */
export function invalidOneOffClock(): string {
  // @ts-expect-error 일회성 uuidv7의 format에는 now가 없다.
  return uuidv7({ now: () => 0 });
}

/** 옵션 타입은 좁다. `case`는 두 문자열만, `version`은 1~8 리터럴만 받는다. */
// @ts-expect-error `case`는 "lower" | "upper"만 받는다.
export const invalidCase: UuidFormat = { case: "mixed" };
// @ts-expect-error `version`은 1~8 리터럴만 받는다.
export const invalidVersion: IsUuidOptions = { version: 9 };
// @ts-expect-error Uuidv4FactoryOptions에는 now가 없다(시계 주입은 uuidv7 팩토리만 받는다).
export const invalidFactoryNow: Uuidv4FactoryOptions = { now: () => 0 };

/** int32 순환 ID. 2147483647 다음은 -2147483648이다. 결과는 `number`다. */
export function int32Id(): number {
  return createCyclicIdFactory({ preset: "int32" })();
}

/** 접두사 + base36 카운터 ID. 결과는 `string`이다. */
export function blocklyId(): string {
  return createCounterIdFactory({
    prefix: "blockly",
    separator: "-",
    radix: 36,
  })();
}

/** 순환 생성기는 `() => number` 자리에 그대로 들어간다. */
export function plainNumberGenerator(): () => number {
  return createCyclicIdFactory({ preset: "uint8" });
}

/** 카운터 생성기는 `() => string` 자리에 그대로 들어간다. 옵션 없이도 만들 수 있다. */
export function plainStringGenerator(): () => string {
  return createCounterIdFactory();
}

/** 상태 API: `peek`은 값을, `reset`은 `void`를 돌려준다. */
export function peekAfterReset(next: CyclicIdGenerator): number {
  next.reset(5);
  const value: number = next.peek();
  next.reset();
  return value;
}

/** 카운터의 `peek`은 인코딩된 문자열을 돌려준다. */
export function peekCounter(next: CounterIdGenerator): string {
  const value: string = next.peek();
  return value;
}

/** `reset`은 값을 돌려주지 않는다(void). 두 생성기가 같다. */
export function resetReturnsVoid(
  next: CyclicIdGenerator | CounterIdGenerator,
): void {
  const done: void = next.reset(5);
  return done;
}

/** 공개 옵션 타입은 preset 리터럴과 숫자 필드를 정확히 해석한다. */
export function typedCyclic(): CyclicIdGenerator {
  const preset: CyclicIdPreset = "uint16";
  const options: CyclicIdOptions = { preset, start: 7, step: -2 };
  return createCyclicIdFactory(options);
}

/** 카운터 옵션 타입은 `case` 리터럴과 숫자 필드를 해석한다. */
export function typedCounter(): CounterIdGenerator {
  const options: CounterIdOptions = {
    prefix: "ord",
    max: 999,
    pad: 3,
    radix: 16,
    case: "upper",
  };
  return createCounterIdFactory(options);
}

/** 옵션 타입은 좁다. 이 파일은 컴파일만 하고 실행하지 않지만 호출은 함수 안에 둔다. */
export function missingCyclicOptions(): CyclicIdGenerator {
  // @ts-expect-error createCyclicIdFactory는 options가 필수다(preset 또는 max가 필요하다).
  return createCyclicIdFactory();
}
// @ts-expect-error preset은 여섯 리터럴만 받는다.
export const invalidCyclicPreset: CyclicIdPreset = "int64";
export function notCyclic(plain: () => number): CyclicIdGenerator {
  // @ts-expect-error `() => number`에는 peek·reset이 없어 순환 생성기 자리에 넣을 수 없다.
  return plain;
}
export function invalidReset(next: CounterIdGenerator): void {
  // @ts-expect-error reset은 number만 받는다.
  next.reset("0");
}
