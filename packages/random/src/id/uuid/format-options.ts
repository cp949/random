import {
  assertBytes,
  assertSafeInt,
  readLetterCase,
  readOptions,
} from "../../internal/validate.js";

/** UUID의 바이트 수(128비트). */
export const UUID_BYTE_LENGTH = 16;

/**
 * UUID 출력 형식 옵션(`dashes`, `case`)의 키. `stringifyUuid`, `uuidv4`, `uuidv7`과 두 팩토리가 같은 이름을 쓴다.
 * 난수원·시계 옵션을 함께 받는 팩토리는 자기 키를 더한 목록(`[...UUID_FORMAT_KEYS, "randomBytes"] as const`)으로
 * `readOptions`를 부른 뒤 `dashes`·`case` 원시값을 `resolveUuidFormat`에 넘긴다.
 */
export const UUID_FORMAT_KEYS = ["dashes", "case"] as const;

/** 검증과 정규화를 마친 UUID 출력 형식. `format.ts`의 `formatUuid`가 그대로 받는다. */
export interface ResolvedUuidFormat {
  /** `true`면 8-4-4-4-12 형식, `false`면 대시 없는 32자. */
  readonly dashes: boolean;
  /** `true`면 대문자 hex, `false`면 소문자 hex. */
  readonly upper: boolean;
}

/** `isUuid` 옵션의 키. */
const IS_UUID_OPTION_KEYS = ["dashes", "version"] as const;

/** 검증을 마친 `isUuid` 옵션. */
export interface ResolvedIsUuidOptions {
  /** `true`면 8-4-4-4-12 형식만, `false`면 대시 없는 32자만 받는다. */
  readonly dashes: boolean;
  /** 지정하면 그 version만 받는다. 생략하면 1~8 전부다. */
  readonly version: number | undefined;
}

/** `dashes` 값을 검증한다. 생략(`undefined`)은 기본값 `true`이고 boolean이 아닌 값(`null` 포함)은 `RangeError`다. */
function readDashes(dashes: unknown): boolean {
  if (dashes === undefined) {
    return true;
  }
  if (typeof dashes !== "boolean") {
    throw new RangeError("dashes must be a boolean");
  }
  return dashes;
}

/**
 * `dashes`와 `case`의 원시값을 검증해 출력 형식으로 정규화한다. 옵션 객체를 읽는 일은 호출자가 한다
 * (`readOptions`가 알 수 없는 키·비객체를 거르고 각 필드를 한 번씩 읽는다).
 * `dashes`의 기본값은 `true`(boolean만 허용), `case`의 기본값은 `"lower"`(`"lower"`, `"upper"` 두 문자열만 허용)다.
 * 위반은 `RangeError`이고 `null`은 값으로 보고 거부한다. 생략(`undefined`)만 기본값이다.
 */
export function resolveUuidFormat(
  dashes: unknown,
  letterCase: unknown,
): ResolvedUuidFormat {
  const resolvedDashes = readDashes(dashes);
  return {
    dashes: resolvedDashes,
    upper: readLetterCase(letterCase) ?? false,
  };
}

/**
 * `UuidFormat` 옵션 인자(`stringifyUuid`, `uuidv4`, `uuidv7`의 `format`)를 읽고 검증해 출력 형식으로 정규화한다.
 * `undefined`는 기본 형식(대시 있는 소문자)이다. `null`, 배열, 함수, 원시값, 알 수 없는 키는 `RangeError`다.
 */
export function readUuidFormat(format: unknown): ResolvedUuidFormat {
  const raw = readOptions(format, UUID_FORMAT_KEYS);
  return resolveUuidFormat(raw.dashes, raw.case);
}

/**
 * `IsUuidOptions` 인자를 읽고 검증한다. `dashes`는 boolean(기본 `true`), `version`은 1~8의 정수(생략 가능)다.
 * `null`, 배열, 함수, 원시값, 알 수 없는 키(`case` 포함)는 `RangeError`다. `version`이 `undefined`이면 생략과 같다.
 */
export function readIsUuidOptions(options: unknown): ResolvedIsUuidOptions {
  const raw = readOptions(options, IS_UUID_OPTION_KEYS);
  const dashes = readDashes(raw.dashes);
  const version =
    raw.version === undefined
      ? undefined
      : assertSafeInt(raw.version, "version", 1, 8);
  return { dashes, version };
}

/**
 * `stringifyUuid`의 `bytes` 인자가 길이 16의 `Uint8Array`인지 확인한다. 아니면 `RangeError`를 던진다.
 * 판정은 `assertBytes`(`instanceof Uint8Array`)를 따르므로 다른 realm의 배열은 길이가 같아도 거부한다.
 * version·variant 비트는 검사하지 않는다.
 */
export function assertUuidBytes(bytes: unknown): void {
  assertBytes(bytes, UUID_BYTE_LENGTH, "bytes");
}

/**
 * `parseUuid`가 입력을 UUID 형식으로 판정하지 못했으면(`hex`가 `undefined`) `RangeError`를 던진다.
 * 형식 판정 자체는 `format.ts`가 하고, 오류 메시지 문구를 가진 throw만 이 파일이 맡는다.
 */
export function assertUuidHex(hex: string | undefined): asserts hex is string {
  if (hex === undefined) {
    throw new RangeError(
      "value must be a UUID string (8-4-4-4-12 hex digits with dashes, or 32 hex digits)",
    );
  }
}
