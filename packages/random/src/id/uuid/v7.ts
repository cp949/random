import {
  defaultRandomBytes,
  guardSource,
  type ByteSource,
} from "../../internal/bytes.js";
import {
  assertUnixTsMs,
  readClockValue,
  readNowOption,
  readOptions,
  readRandomBytesOption,
} from "../../internal/validate.js";
import {
  UUID_BYTE_LENGTH,
  UUID_FORMAT_KEYS,
  readUuidFormat,
  resolveUuidFormat,
} from "./format-options.js";
import { formatUuid, type UuidFormat } from "./format.js";

/** `createUuidv7Factory`의 옵션. 출력 형식 옵션(`UuidFormat`)에 테스트용 난수원·시계 주입을 더한다. */
export interface Uuidv7FactoryOptions extends UuidFormat {
  /**
   * 테스트용 난수원 주입. 요청한 길이(10)의 `Uint8Array`를 돌려줘야 한다.
   * 주입한 난수원의 결과에는 보안 보증이 없다. 운영 코드에서는 넘기지 않는다(생략하면 `crypto.getRandomValues`를 쓴다).
   * 다른 형식의 값을 돌려주면 그 호출이 `RangeError`다(팩토리를 만들 때는 호출하지 않아 검사하지 않는다).
   * 돌려준 배열은 읽기만 하고 변경하지 않는다.
   */
  randomBytes?: (length: number) => Uint8Array;
  /**
   * 테스트용 시계 주입. 유닉스 시각 밀리초(0 이상 2^48 미만의 정수)를 돌려줘야 한다.
   * 생략하면 호출할 때마다 `Date.now`를 찾는다. 그 밖의 값을 돌려주면 그 호출이 `RangeError`다
   * (팩토리를 만들 때는 호출하지 않아 검사하지 않는다).
   */
  now?: () => number;
}

/** ID 하나를 만들 때 요청하는 난수 바이트 수. 앞 2바이트는 counter 초기값, 나머지는 variant 바이트와 `rand_b`다. */
const RANDOM_BYTE_LENGTH = 10;

/** `unix_ts_ms`가 차지하는 바이트 수(48비트). */
const TIMESTAMP_BYTE_LENGTH = 6;

/** 바이트 하나가 담는 값의 수. 48비트 timestamp는 32비트 비트 연산 대신 이 값으로 나눠 바이트를 뽑는다. */
const BYTE_RADIX = 256;

/** counter(12비트)의 최댓값. 같은 timestamp에서 이 값을 넘겨야 하면 고갈이다. */
const MAX_COUNTER = 4095;

/** counter 초기값의 마스크. 최상위 비트를 0으로 남겨 같은 ms에서 최소 2,048개를 보장한다. */
const COUNTER_SEED_MASK = 0x07ff;

/** 같은 timestamp를 이어 쓰는 시계 되돌림의 상한(ms). 이보다 크게 되돌아가면 시계 기준으로 재설정한다. */
const MAX_ROLLBACK_MS = 10_000;

/** `lastMs`의 초기값. 어떤 유효한 시계 값보다 작아서 첫 호출은 항상 시계 기준으로 시작한다. */
const NO_LAST_MS = -1;

/**
 * counter 초기값을 난수 두 바이트에서 만든다. 최상위 비트를 마스크로 지워 0~2047이 되므로
 * 같은 ms에서 4,096 - 2,047 = 2,049개 이상을 만들 수 있다.
 */
function initialCounter(r: Uint8Array): number {
  return ((r[0]! << 8) | r[1]!) & COUNTER_SEED_MASK;
}

/**
 * timestamp, counter, 난수 바이트를 RFC 9562 UUID v7의 16바이트로 조립한다.
 * 0~5는 `unix_ts_ms` 빅엔디언, 6은 version(0111)과 counter 상위 4비트, 7은 counter 하위 8비트,
 * 8은 variant(10)와 `r[2]`의 하위 6비트, 9~15는 `r[3]`~`r[9]`다.
 * 48비트 값은 32비트 비트 연산으로 다룰 수 없어 나눗셈으로 바이트를 뽑는다.
 */
function assemble(ms: number, counter: number, r: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(UUID_BYTE_LENGTH);
  let rest = ms;
  for (let i = TIMESTAMP_BYTE_LENGTH - 1; i >= 0; i -= 1) {
    bytes[i] = rest % BYTE_RADIX;
    rest = Math.floor(rest / BYTE_RADIX);
  }
  bytes[6] = 0x70 | (counter >> 8);
  bytes[7] = counter & 0xff;
  bytes[8] = 0x80 | (r[2]! & 0x3f);
  bytes.set(r.subarray(3, RANDOM_BYTE_LENGTH), 9);
  return bytes;
}

/**
 * 독립된 상태(`lastMs`, `lastCounter`)를 가진 UUID v7 바이트 생성기를 만든다. 문자열 형식은 호출자가 붙인다.
 * `clock`이 `undefined`이면 호출마다 `Date.now`를 찾는다(생성 시점에 잡아 두지 않는다).
 *
 * 상태는 난수·시계 검증을 모두 지난 뒤 마지막에 한 번만 커밋한다. 난수원이나 시계가 던지거나 검증에 실패하면
 * 그 호출만 실패하고 다음 호출이 이전 상태를 그대로 이어간다.
 */
function createGenerator(
  source: ByteSource,
  clock: (() => number) | undefined,
): () => Uint8Array {
  let lastMs = NO_LAST_MS;
  let lastCounter = 0;

  return () => {
    const r = source(RANDOM_BYTE_LENGTH);
    const now = readClockValue(clock === undefined ? Date.now() : clock());

    let ms: number;
    let counter: number;
    if (now > lastMs) {
      // 시계가 앞섰다. timestamp를 시계에 맞추고 counter를 난수로 다시 잡는다.
      ms = now;
      counter = initialCounter(r);
    } else if (lastMs - now <= MAX_ROLLBACK_MS) {
      // 같은 ms이거나 소폭 되돌림이다. 단조성을 위해 마지막 timestamp를 이어 쓴다.
      if (lastCounter < MAX_COUNTER) {
        ms = lastMs;
        counter = lastCounter + 1;
      } else {
        // counter 고갈. 기다리지 않고 timestamp를 1ms 앞세운다(48비트를 넘으면 그 호출만 실패한다).
        ms = assertUnixTsMs(lastMs + 1);
        counter = initialCounter(r);
      }
    } else {
      // 큰 되돌림이다. 시계 기준으로 재설정하며 이 구간은 단조성을 보장하지 않는다.
      ms = now;
      counter = initialCounter(r);
    }

    lastMs = ms;
    lastCounter = counter;
    return assemble(ms, counter, r);
  };
}

/**
 * 일회성 `uuidv7`이 쓰는 기본 인스턴스. 이 패키지에서 유일한 모듈 수준 가변 변수다.
 * import 시점에는 만들지 않고 첫 호출에서 만들므로 import가 crypto와 시계를 건드리지 않는다.
 */
let defaultGenerator: (() => Uint8Array) | undefined;

/**
 * RFC 9562 UUID v7을 만든다. 앞 48비트는 유닉스 시각(ms)이며 아래 조건에서 문자열 정렬 순서가 생성 순서와 같다.
 * `globalThis.crypto.getRandomValues`로 얻은 10바이트와 `Date.now`로 만들며 둘 다 호출 시점에 찾는다.
 * 난수원과 시계는 주입할 수 없다(결정적 테스트는 `createUuidv7Factory`의 `randomBytes`·`now`로 한다).
 *
 * 이 함수의 호출은 모듈 하나당 하나뿐인 기본 인스턴스를 공유한다. 인스턴스는 첫 호출에서 만들어지고
 * `format`이 달라도 같은 인스턴스를 쓴다. 단조성은 그 인스턴스 안에서 같은 `dashes`·`case`끼리만 보장한다:
 * 탭·Worker·프로세스가 다르거나 패키지가 두 번 번들되면 인스턴스도 둘이다.
 *
 * 같은 ms에서 counter가 4,095를 넘겨야 하면 기다리지 않고 timestamp를 1ms 앞세운다.
 * 현재 시계가 마지막 timestamp보다 10,000ms 이내로 뒤처지면 마지막 timestamp를 이어 쓰지만,
 * 그보다 뒤처지면 시계 기준으로 timestamp·counter를 재설정하며 이 구간에서는 단조성을 보장하지 않는다.
 * counter 고갈로 timestamp가 고정 시계보다 10,000ms 넘게 앞선 경우도 같은 재설정 조건에 해당한다.
 * 시계가 마지막 timestamp보다 앞서면 새 시각에서 시작한다.
 *
 * 형식(36자 또는 32자, version 자리 `7`, variant 자리 `8`·`9`·`a`·`b`, `case`에 따른 대소문자)과
 * 위 조건의 단조성만 계약이다.
 * 난수 부분의 값은 재현할 수 없고 난수원의 바이트가 UUID의 어느 자리로 가는지는 구현 세부다.
 *
 * 실패 순서: `format` 검증(`RangeError`), 난수 생성(`SecureRandomUnavailableError` 등), 시계 검증·상태 계산.
 * 검증이 먼저라서 잘못된 `format`은 `crypto`가 없는 환경에서도 `RangeError`다.
 * 시계 값은 0 이상 2^48 미만의 정수여야 한다. timestamp가 2^48 - 1이고 counter까지 고갈되면
 * 1ms를 앞세울 수 없어 그 호출이 `RangeError`다. 난수원·시계가 던진 오류는 그대로 전파하며 실패한 호출은 상태를 바꾸지 않는다.
 *
 * @param format 출력 형식. `dashes`(기본 `true`: 8-4-4-4-12 형식 36자, `false`: 대시 없는 32자)와
 *   `case`(기본 `"lower"`, `"upper"`)를 가진다. `undefined`이면 기본 형식이다.
 *   난수원·시계를 포함한 알 수 없는 키, 객체가 아닌 값, `dashes`·`case`의 잘못된 값은 `RangeError`다.
 * @returns UUID v7 문자열.
 * @throws {RangeError} `format` 또는 시계 값이 잘못됐거나 counter 고갈로 timestamp가 48비트를 넘을 때.
 * @throws {SecureRandomUnavailableError} `getRandomValues`를 쓸 수 없는 환경일 때.
 */
export function uuidv7(format?: UuidFormat): string {
  // 형식 검증이 난수·시계 접근보다 먼저다. 기본 인스턴스는 이 검증을 지난 첫 호출에서 만들어진다.
  const resolved = readUuidFormat(format);
  if (defaultGenerator === undefined) {
    defaultGenerator = createGenerator(defaultRandomBytes, undefined);
  }
  return formatUuid(defaultGenerator(), resolved);
}

/**
 * 같은 옵션으로 UUID v7을 반복해 만드는 생성기를 만든다. 옵션은 생성할 때 한 번만 검증하고 읽는다.
 * 생성기마다 독립된 timestamp·counter 상태를 가지며 기본 인스턴스(`uuidv7`)와도 상태를 공유하지 않는다.
 *
 * 생성은 옵션만 검증한다. `crypto`와 시계에 접근하지 않고 `randomBytes`·`now`도 호출하지 않으므로 소비자가
 * 모듈 최상위에서 생성기를 만들어도 `crypto`가 없는 환경에서 import가 성공하고,
 * `SecureRandomUnavailableError`는 생성기의 첫 호출에서 난다.
 * `randomBytes`를 생략하면 호출할 때마다 `globalThis.crypto.getRandomValues`를, `now`를 생략하면 `Date.now`를 찾는다.
 *
 * 단조성(문자열 정렬 순서 = 생성 순서)은 생성기 하나 안에서 같은 `dashes`·`case`끼리 보장한다.
 * 같은 ms에서 counter가 4,095를 넘겨야 하면 기다리지 않고 timestamp를 1ms 앞세우므로 실제 시계보다 앞설 수 있다.
 * 현재 시계가 마지막 timestamp보다 10,000ms 이내로 뒤처지면 마지막 timestamp를 이어 쓰지만,
 * 그보다 뒤처지면 시계 기준으로 timestamp·counter를 재설정하며 이 구간에서는 단조성을 보장하지 않는다.
 * counter 고갈로 timestamp가 고정 시계보다 10,000ms 넘게 앞선 경우도 같은 재설정 조건에 해당한다.
 * 시계가 마지막 timestamp보다 앞서면 새 시각에서 시작한다.
 *
 * 주입한 난수원의 결과는 호출마다 검사한다: 요청한 길이(10)의 `Uint8Array`(하위 클래스와 `byteOffset`이 있는
 * view 포함)여야 하며 아니면 그 호출이 `RangeError`다. 다른 realm의 배열은 거부한다. 기본·주입 시계 모두 0 이상
 * 2^48 미만의 정수를 돌려줘야 하며 아니면 그 호출이 `RangeError`다. timestamp가 2^48 - 1이고 counter까지
 * 고갈되면 1ms를 앞세울 수 없어 그 호출이 `RangeError`다. 난수원·시계가 던진 오류는 그대로 전파하며 실패한 호출은 상태를 바꾸지 않는다.
 *
 * @param options `dashes`, `case`(`UuidFormat`)와 `randomBytes`, `now`. `undefined`이면 기본 형식과
 *   기본 난수원·기본 시계다. 알 수 없는 키, 객체가 아닌 값, 함수가 아닌 `randomBytes`·`now`,
 *   `dashes`·`case`의 잘못된 값은 `RangeError`다.
 * @returns 호출할 때마다 UUID v7 문자열을 돌려주는 함수.
 * @throws {RangeError} `options`가 잘못됐을 때(생성 시점). 생성기의 호출에서는 주입한 난수원·기본 또는 주입 시계의
 *   결과가 계약을 어겼을 때와 counter 고갈로 timestamp가 48비트를 넘을 때.
 * @throws {SecureRandomUnavailableError} 생성기가 기본 난수원을 쓸 수 없을 때(첫 호출부터).
 */
export function createUuidv7Factory(
  options?: Uuidv7FactoryOptions,
): () => string {
  const raw = readOptions(options, [
    ...UUID_FORMAT_KEYS,
    "randomBytes",
    "now",
  ] as const);
  const format = resolveUuidFormat(raw.dashes, raw.case);
  const injected = readRandomBytesOption(raw.randomBytes);
  const clock = readNowOption(raw.now);
  // 주입한 난수원만 호출마다 결과를 검사한다. 기본 난수원은 감싸지 않는다.
  const next = createGenerator(
    injected === undefined ? defaultRandomBytes : guardSource(injected),
    clock,
  );
  return () => formatUuid(next(), format);
}
