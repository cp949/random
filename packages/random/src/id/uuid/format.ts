import { toHex } from "../../internal/encoding.js";
import {
  UUID_BYTE_LENGTH,
  assertUuidBytes,
  assertUuidHex,
  readIsUuidOptions,
  readUuidFormat,
  type ResolvedUuidFormat,
} from "./format-options.js";

/** UUID 출력 형식 옵션. `stringifyUuid`, `uuidv4`, `uuidv7`의 `format` 인자다. */
export interface UuidFormat {
  /** `true`(기본)면 8-4-4-4-12 형식, `false`면 대시 없는 32자. */
  dashes?: boolean;
  /** `"lower"`(기본)면 소문자 hex, `"upper"`면 대문자 hex. */
  case?: "lower" | "upper";
}

/** `isUuid`의 옵션. */
export interface IsUuidOptions {
  /** 지정하면 그 version(1~8)의 UUID만 받아들인다. 생략하면 1~8 전부다. */
  version?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /** `true`(기본)면 8-4-4-4-12 형식만, `false`면 대시 없는 32자 hex만 받아들인다. */
  dashes?: boolean;
}

/** 대시 있는 8-4-4-4-12 형식. 대소문자를 구분하지 않는다. `$`는 끝 줄바꿈 앞에 붙지 않는다(`m` 플래그 없음). */
const DASHED_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 대시 없는 32자 hex. 대소문자를 구분하지 않는다. */
const COMPACT_UUID = /^[0-9a-f]{32}$/i;

/**
 * `value`가 허용한 형식의 UUID 문자열이면 대시를 뺀 hex 32자를, 아니면 `undefined`를 돌려준다.
 * 문자열이 아닌 값은 `typeof`로 먼저 거른다. `RegExp.prototype.test`는 인자를 문자열로 바꾸므로
 * 그대로 넘기면 원소가 UUID인 배열이나 `String` 객체가 통과한다.
 *
 * @param allowDashed 8-4-4-4-12 형식을 허용한다.
 * @param allowCompact 대시 없는 32자 형식을 허용한다.
 */
function toCompactHex(
  value: unknown,
  allowDashed: boolean,
  allowCompact: boolean,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  if (allowDashed && DASHED_UUID.test(value)) {
    return value.replace(/-/g, "");
  }
  if (allowCompact && COMPACT_UUID.test(value)) {
    return value;
  }
  return undefined;
}

/**
 * 16바이트를 이미 검증한 출력 형식(`readUuidFormat`, `resolveUuidFormat`의 결과)으로 문자열화한다.
 * `bytes`의 타입·길이는 검사하지 않는다. `uuidv4`·`uuidv7`처럼 바이트를 직접 만드는 호출자가 쓰고,
 * 외부 입력을 받는 공개 함수는 `stringifyUuid`다.
 */
export function formatUuid(
  bytes: Uint8Array,
  format: ResolvedUuidFormat,
): string {
  const hex = toHex(bytes);
  const text = format.dashes
    ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    : hex;
  return format.upper ? text.toUpperCase() : text;
}

/**
 * 16바이트를 UUID 문자열로 바꾼다. 난수를 쓰지 않는 순수 함수이며 같은 입력은 항상 같은 문자열이다.
 *
 * `bytes`는 길이 16인 `Uint8Array`여야 한다. 판정은 `instanceof Uint8Array`라서 하위 클래스(`Buffer` 포함)와
 * `byteOffset`이 있는 view는 받고, 다른 realm(iframe, `vm` 컨텍스트)에서 만든 배열은 길이가 같아도 `RangeError`다.
 * version·variant 비트는 검사하지 않으므로 Nil UUID(모두 0)와 Max UUID(모두 1)도 만든다. 입력 배열은 바꾸지 않는다.
 *
 * @param bytes 길이 16의 `Uint8Array`. 앞에서부터 big-endian 순서로 문자열의 왼쪽부터 대응한다.
 * @param format 출력 형식. `dashes`(기본 `true`)는 boolean, `case`(기본 `"lower"`)는 `"lower"` 또는 `"upper"`다.
 *   `undefined`이면 기본 형식이다.
 * @returns 대시 있는 형식은 36자, 없는 형식은 32자의 문자열.
 * @throws {RangeError} `bytes`가 길이 16의 `Uint8Array`가 아닐 때, `format`이 객체가 아니거나 알 수 없는 키를 가졌거나
 *   `dashes`·`case`의 값이 틀렸을 때.
 */
export function stringifyUuid(bytes: Uint8Array, format?: UuidFormat): string {
  assertUuidBytes(bytes);
  return formatUuid(bytes, readUuidFormat(format));
}

/**
 * UUID 문자열을 16바이트로 바꾼다. 난수를 쓰지 않는 순수 함수다.
 *
 * "UUID 형식의 128비트인가"만 묻는다: 대시 있는 36자 형식(8-4-4-4-12)과 대시 없는 32자 hex를 둘 다 받고 대소문자를
 * 구분하지 않는다. version·variant는 검사하지 않으므로 Nil UUID나 RFC 9562의 variant가 아닌 값도 파싱한다.
 * RFC 9562 UUID인지 묻는 것은 `isUuid`다. 두 함수의 규칙이 다르다.
 * 중괄호(`{...}`), `urn:uuid:` 접두사, 앞뒤 공백은 받지 않는다.
 *
 * @param value UUID 문자열.
 * @returns 호출마다 새로 만든 `Uint8Array`(길이 16, 자체 `ArrayBuffer`).
 * @throws {RangeError} 문자열이 아니거나(`null`, 숫자, `String` 객체, 배열 포함) 위 형식이 아닐 때.
 */
export function parseUuid(value: string): Uint8Array<ArrayBuffer> {
  const hex = toCompactHex(value, true, true);
  assertUuidHex(hex);
  return Uint8Array.from({ length: UUID_BYTE_LENGTH }, (_, i) =>
    Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16),
  );
}

/**
 * `value`가 RFC 9562 UUID 형식의 문자열인지 판정한다. 인가나 존재 여부를 확인하는 수단이 아니며 형식만 검사한다.
 *
 * 다음을 모두 만족해야 `true`다.
 * - `typeof value === "string"`이고 `dashes` 옵션이 고른 형식이다: 기본(`true`)은 대시 있는 36자 형식,
 *   `false`는 대시 없는 32자 hex다. 대소문자는 구분하지 않는다.
 * - version 문자가 `1`~`8`이다. `options.version`이 있으면 그 version만 받는다.
 * - variant 문자가 `8`, `9`, `a`, `b`다(RFC 9562의 variant, 대소문자 무관).
 * Nil UUID와 Max UUID는 version 문자가 `0`, `f`라서 `false`다.
 *
 * 문자열이 아닌 `value`는 던지지 않고 `false`다. 옵션 검증은 `value`를 보기 전에 하므로 잘못된 옵션은 `value`와
 * 무관하게 `RangeError`다.
 *
 * @param value 판정할 값.
 * @param options `version`(1~8의 정수)과 `dashes`(boolean, 기본 `true`). 알 수 없는 키는 `RangeError`다.
 * @returns RFC 9562 UUID 형식이면 `true`(타입 가드: `value is string`).
 * @throws {RangeError} `options`가 객체가 아니거나 알 수 없는 키를 가졌거나 `version`·`dashes`의 값이 틀렸을 때.
 */
export function isUuid(
  value: unknown,
  options?: IsUuidOptions,
): value is string {
  // 옵션 검증이 `value` 판정보다 먼저다. 잘못된 옵션은 `value`와 무관하게 `RangeError`다.
  const { dashes, version } = readIsUuidOptions(options);
  const hex = toCompactHex(value, dashes, !dashes);
  if (hex === undefined) {
    return false;
  }

  // 대시를 뺀 hex에서 version은 13번째(인덱스 12), variant는 17번째(인덱스 16) 문자다.
  const versionDigit = Number.parseInt(hex.charAt(12), 16);
  const variantDigit = Number.parseInt(hex.charAt(16), 16);
  return (
    versionDigit >= 1 &&
    versionDigit <= 8 &&
    (version === undefined || versionDigit === version) &&
    // variant 상위 2비트가 10이면 hex 문자는 8, 9, a, b다.
    variantDigit >= 0x8 &&
    variantDigit <= 0xb
  );
}
