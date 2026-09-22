import {
  defaultRandomBytes,
  guardSource,
  type ByteSource,
} from "../../internal/bytes.js";
import { readOptions, readRandomBytesOption } from "../../internal/validate.js";
import {
  UUID_BYTE_LENGTH,
  UUID_FORMAT_KEYS,
  readUuidFormat,
  resolveUuidFormat,
  type ResolvedUuidFormat,
} from "./format-options.js";
import { formatUuid, type UuidFormat } from "./format.js";

/** `createUuidv4Factory`의 옵션. 출력 형식 옵션(`UuidFormat`)에 테스트용 난수원 주입을 더한다. */
export interface Uuidv4FactoryOptions extends UuidFormat {
  /**
   * 테스트용 난수원 주입. 요청한 길이(16)의 `Uint8Array`를 돌려줘야 한다.
   * 주입한 난수원의 결과에는 보안 보증이 없다. 운영 코드에서는 넘기지 않는다(생략하면 `crypto.getRandomValues`를 쓴다).
   * 다른 형식의 값을 돌려주면 그 호출이 `RangeError`다(팩토리를 만들 때는 호출하지 않아 검사하지 않는다).
   * 돌려준 배열은 변경하지 않는다.
   */
  randomBytes?: (length: number) => Uint8Array;
}

/**
 * `source`에서 16바이트를 받아 RFC 9562 UUID v4를 만든다. 형식은 이미 검증된 것이어야 한다.
 * 받은 배열은 복사한 뒤 마스크를 적용하므로 `source`가 돌려준 배열(주입한 고정 배열 포함)은 바뀌지 않는다.
 * `crypto.randomUUID`는 쓰지 않는다.
 */
function generate(source: ByteSource, format: ResolvedUuidFormat): string {
  const bytes = new Uint8Array(source(UUID_BYTE_LENGTH));
  // 7번째 바이트(인덱스 6)의 상위 4비트를 0100(version 4)으로 만든다.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  // 9번째 바이트(인덱스 8)의 상위 2비트를 10(RFC 9562 variant)으로 만든다.
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return formatUuid(bytes, format);
}

/**
 * RFC 9562 UUID v4를 만든다. 무작위 122비트와 고정 6비트(version 4, variant 10)로 이루어진다.
 * `crypto.randomUUID`를 쓰지 않고 `globalThis.crypto.getRandomValues`로 얻은 16바이트에서 만든다.
 * 난수원은 주입할 수 없다(결정적 테스트는 `createUuidv4Factory`의 `randomBytes`로 한다).
 *
 * 형식(36자 또는 32자, version 자리 `4`, variant 자리 `8`·`9`·`a`·`b`)만 계약이다.
 * 결과 값은 무작위이며 재현할 수 없고 난수원의 바이트가 UUID의 어느 자리로 가는지는 구현 세부다.
 *
 * 실패 순서: `format` 검증(`RangeError`), 난수 생성(`SecureRandomUnavailableError`).
 * 검증이 먼저라서 잘못된 `format`은 `crypto`가 없는 환경에서도 `RangeError`다.
 *
 * @param format 출력 형식. `dashes`(기본 `true`: 8-4-4-4-12 형식 36자, `false`: 대시 없는 32자)와
 *   `case`(기본 `"lower"`, `"upper"`)를 가진다. `undefined`이면 기본 형식이다.
 *   난수원을 포함한 알 수 없는 키, 객체가 아닌 값, `dashes`·`case`의 잘못된 값은 `RangeError`다.
 * @returns UUID v4 문자열.
 * @throws {RangeError} `format`이 잘못됐을 때.
 * @throws {SecureRandomUnavailableError} `getRandomValues`를 쓸 수 없는 환경일 때.
 */
export function uuidv4(format?: UuidFormat): string {
  // 형식 검증이 난수 요청보다 먼저다. 기본 난수원은 검증 wrapper 없이 직접 쓴다.
  return generate(defaultRandomBytes, readUuidFormat(format));
}

/**
 * 같은 옵션으로 UUID v4를 반복해 만드는 생성기를 만든다. 옵션은 생성할 때 한 번만 검증하고 읽는다.
 * 이후 옵션 객체를 바꿔도 생성기에는 영향이 없고, 생성기끼리 상태를 공유하지 않는다.
 *
 * 생성은 옵션만 검증한다. `crypto`에 접근하지 않고 `randomBytes`도 호출하지 않으므로 소비자가 모듈 최상위에서
 * 생성기를 만들어도 `crypto`가 없는 환경에서 import가 성공하고, `SecureRandomUnavailableError`는 생성기의 첫 호출에서 난다.
 * `randomBytes`를 생략하면 호출할 때마다 `globalThis.crypto.getRandomValues`를 찾는다.
 *
 * `randomBytes`를 주입하면 결정적인 테스트를 쓸 수 있다. 주입한 난수원의 결과는 호출마다 검사한다:
 * 요청한 길이(16)의 `Uint8Array`(하위 클래스와 `byteOffset`이 있는 view 포함)여야 하며 아니면 그 호출이 `RangeError`다.
 * 다른 realm의 배열은 거부한다. 돌려준 배열은 변경하지 않고 복사해서 쓴다. 주입한 결과에는 보안 보증이 없다.
 *
 * @param options `dashes`, `case`(`UuidFormat`)와 `randomBytes`. `undefined`이면 기본 형식과 기본 난수원이다.
 *   알 수 없는 키(`now` 포함), 객체가 아닌 값, 함수가 아닌 `randomBytes`, `dashes`·`case`의 잘못된 값은 `RangeError`다.
 * @returns 호출할 때마다 UUID v4 문자열을 돌려주는 함수.
 * @throws {RangeError} `options`가 잘못됐을 때(생성 시점). 생성기의 호출에서는 주입 난수원의 결과가 계약을 어겼을 때.
 */
export function createUuidv4Factory(
  options?: Uuidv4FactoryOptions,
): () => string {
  const raw = readOptions(options, [
    ...UUID_FORMAT_KEYS,
    "randomBytes",
  ] as const);
  const format = resolveUuidFormat(raw.dashes, raw.case);
  const injected = readRandomBytesOption(raw.randomBytes);
  // 주입한 난수원만 호출마다 결과를 검사한다. 기본 난수원은 감싸지 않는다.
  const source: ByteSource =
    injected === undefined ? defaultRandomBytes : guardSource(injected);
  return () => generate(source, format);
}
