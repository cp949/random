import type { ByteSource } from "../internal/bytes.js";
import {
  DEFAULT_ID_SEPARATOR,
  ID_MAX_LENGTH,
  assertLength,
  assertSafeInt,
  parseAlphabet,
  readLetterCase,
  readNowOption,
  readOptions,
  readPrefix,
  readRandomBytesOption,
  readSeparator,
} from "../internal/validate.js";
import {
  RANDOM_ID_PRESETS,
  isRandomIdPreset,
  presetAlphabet,
  type RandomIdPreset,
} from "./alphabets.js";

export type { RandomIdPreset };

/** 동기 충돌 검사의 반환값을 검증한다. Promise를 포함해 boolean이 아닌 값은 즉시 거부한다. */
export function readIsTakenResult(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new RangeError("isTaken must return a boolean");
  }
  return value;
}

/**
 * `randomId`와 `createRandomIdFactory`의 옵션. 모든 필드가 선택이고 구조는 평면이다.
 * 상호 배타·종속 관계는 타입으로 표현하지 않고 런타임에 `RangeError`로 검사한다(필드마다 아래에 적는다).
 *
 * 옵션 객체는 한 번만 읽는다. 값이 `undefined`인 필드는 지정하지 않은 것과 같고(종속 규칙에서도 미지정으로 본다),
 * `null`은 값으로 검증되어 `RangeError`다. 알 수 없는 키도 `RangeError`다.
 */
export interface RandomIdOptions {
  /** 고정 접두사. 비어 있지 않은 문자열이어야 한다. 기본값은 없다(접두사 없음). */
  prefix?: string;
  /**
   * 접두사·timestamp와 무작위 부분 사이의 구분자. 기본값은 `"_"`이고 빈 문자열도 쓸 수 있다.
   * `prefix`나 `timestamp: true`가 없으면 지정할 수 없다(조용히 무시하지 않고 `RangeError`다).
   */
  separator?: string;
  /**
   * 무작위 부분의 글자 수. 접두사·timestamp·구분자는 세지 않는다. 1 이상 1,024 이하의 정수다.
   * 기본값은 21이며 `bits`와 함께 지정할 수 없다.
   */
  length?: number;
  /**
   * 목표 엔트로피(비트). 1 이상 4,096 이하의 정수다. 문자 집합 크기로 최소 길이를 계산한다.
   * `length`와 함께 지정할 수 없고, 변환한 길이가 1,024를 넘으면 `RangeError`다.
   */
  bits?: number;
  /** 이름 있는 문자 집합. 기본값은 `"base64url"`이고 `alphabet`과 함께 지정할 수 없다. */
  preset?: RandomIdPreset;
  /**
   * 사용자 정의 문자 집합. 코드 포인트 단위로 서로 다른 2~256자여야 한다(이모지도 한 글자다).
   * 중복 코드 포인트와 짝 없는 서로게이트는 `RangeError`다. `preset`과 함께 지정할 수 없다.
   */
  alphabet?: string;
  /**
   * 문자 집합의 대소문자. `preset`이 `"base36"`(기본 소문자)이나 `"readable"`(기본 대문자)일 때만 지정할 수 있다.
   * 다른 preset이나 `alphabet`과 함께 쓰면 `RangeError`다. timestamp 부분은 이 옵션과 무관하게 항상 소문자다.
   */
  case?: "lower" | "upper";
  /** 무작위 부분을 끊는 그룹 크기. 1 이상 무작위 부분 길이 이하의 정수다. 기본값은 없다(그룹화 없음). */
  group?: number;
  /** 그룹 구분자. 기본값은 `"-"`이고 빈 문자열도 쓸 수 있다. `group` 없이 지정하면 `RangeError`다. */
  groupSeparator?: string;
  /**
   * ID의 첫 글자를 ASCII 영문자로 제한한다. 기본값은 `false`다.
   * `prefix`가 있으면 `prefix`의 첫 글자가 ASCII 영문자여야 하고 무작위 부분에는 제약이 없다.
   * `prefix` 없이 `timestamp: true`면 `RangeError`다(timestamp가 숫자로 시작할 수 있다).
   * 둘 다 없으면 무작위 부분의 첫 글자를 문자 집합의 ASCII 영문자로 제한하며, 영문자가 없는 문자 집합
   * (`"digits"`, 영문자가 없는 `alphabet`)은 `RangeError`다.
   */
  startWithLetter?: boolean;
  /** 정렬 가능한 timestamp 접두사(base36 소문자 9자)를 붙인다. 기본값은 `false`다. */
  timestamp?: boolean;
  /**
   * 만든 ID가 이미 쓰이고 있으면 `true`를 돌려주는 동기 함수. 지정하면 `maxAttempts`번까지 다시 만든다.
   * 최종 ID(접두사·구분자 포함)를 받는다. 기본값은 없다(재시도 없음).
   */
  isTaken?: (id: string) => boolean;
  /** 재시도 상한. 1 이상 1,000 이하의 정수이며 기본값은 10이다. `isTaken` 없이 지정하면 `RangeError`다. */
  maxAttempts?: number;
}

/** `createRandomIdFactory`의 옵션. 일회성 옵션에 테스트용 주입 두 개를 더한다. */
export interface RandomIdFactoryOptions extends RandomIdOptions {
  /**
   * 테스트용 난수원 주입. 요청한 길이의 `Uint8Array`를 돌려줘야 한다.
   * 주입한 난수원의 결과에는 보안 보증이 없다. 운영 코드에서는 넘기지 않는다(생략하면 `crypto.getRandomValues`를 쓴다).
   * 다른 형식의 값을 돌려주면 그 호출이 `RangeError`다(팩토리를 만들 때는 호출하지 않아 검사하지 않는다).
   */
  randomBytes?: (length: number) => Uint8Array;
  /**
   * 테스트용 시계 주입. 0 이상 36^9 미만의 정수(유닉스 시각 밀리초)를 돌려줘야 한다.
   * 생략하면 호출할 때마다 `Date.now`를 찾는다. `timestamp: true`일 때만 지정할 수 있다.
   */
  now?: () => number;
}

/**
 * 검증과 정규화를 마친 무작위 ID 옵션. 조립하는 쪽은 이 값만 보고 원본 옵션을 다시 읽지 않는다.
 * 쓰이지 않는 자리도 기본값으로 채워져 있다(예: `prefix`와 timestamp가 없으면 `separator`는 쓰이지 않는다).
 */
export interface ResolvedRandomIdOptions {
  /** 무작위 부분을 뽑을 문자 집합. 코드 포인트 단위로 나뉜 서로 다른 2~256개의 글자다. */
  readonly chars: readonly string[];
  /** 무작위 부분의 글자 수. `bits`를 줬으면 변환한 길이다. 1 이상 1,024 이하. */
  readonly length: number;
  /**
   * 무작위 부분의 첫 글자를 뽑을 ASCII 영문자. 첫 글자 제한이 없으면 `undefined`다.
   * 배열이면 첫 글자는 여기서 하나, 나머지 `length - 1`자는 `chars`에서 뽑는다.
   * `chars`의 순서를 유지한 부분집합이며 비어 있지 않다.
   */
  readonly letters: readonly string[] | undefined;
  /** 고정 접두사. 없으면 `undefined`. */
  readonly prefix: string | undefined;
  /** 접두사·timestamp와 무작위 부분 사이의 구분자. */
  readonly separator: string;
  /** timestamp 접두사를 붙이는지 여부. */
  readonly timestamp: boolean;
  /** 주입한 시계. 없으면 `undefined`이고 호출자가 호출 시점에 `Date.now`를 찾는다. */
  readonly now: (() => number) | undefined;
  /** 무작위 부분을 끊는 그룹 크기. 그룹화하지 않으면 `undefined`. */
  readonly group: number | undefined;
  /** 그룹 구분자. */
  readonly groupSeparator: string;
  /** 충돌 검사 함수. 없으면 `undefined`(재시도 없음). */
  readonly isTaken: ((id: string) => boolean) | undefined;
  /** 재시도 상한. `isTaken`이 없으면 쓰이지 않는다. */
  readonly maxAttempts: number;
  /** 주입한 난수원. 없으면 `undefined`이고 호출자가 기본 난수원을 쓴다(감싸지 않는다). */
  readonly randomBytes: ByteSource | undefined;
}

/** 일회성 `randomId`가 받는 옵션 키. 주입 키가 없어서 `randomBytes`·`now`는 알 수 없는 키가 된다. */
const RANDOM_ID_KEYS = [
  "prefix",
  "separator",
  "length",
  "bits",
  "preset",
  "alphabet",
  "case",
  "group",
  "groupSeparator",
  "startWithLetter",
  "timestamp",
  "isTaken",
  "maxAttempts",
] as const;

/** 팩토리만 받는 주입 키. */
const INJECTION_KEYS = ["randomBytes", "now"] as const;

/** 읽기를 마친 옵션 복사본. 값은 아직 검증하지 않은 `unknown`이다. */
type RawRandomIdOptions = Partial<
  Record<
    (typeof RANDOM_ID_KEYS)[number] | (typeof INJECTION_KEYS)[number],
    unknown
  >
>;

/** `preset`을 생략했을 때 쓰는 문자 집합. `nanoid`와 같은 base64url이다. */
const DEFAULT_PRESET: RandomIdPreset = "base64url";

/** `length`와 `bits`를 모두 생략했을 때의 무작위 부분 길이. `nanoid`의 기본 길이와 같다. */
const DEFAULT_LENGTH = 21;

/** `groupSeparator`의 기본값. */
const DEFAULT_GROUP_SEPARATOR = "-";

/** `maxAttempts`의 기본값. */
const DEFAULT_MAX_ATTEMPTS = 10;

/** `maxAttempts`의 상한. 재시도가 사실상 끝나지 않는 설정을 막는다. */
const MAX_ATTEMPTS = 1000;

/** `bits`의 상한. 길이 변환이 무제한으로 커지지 않게 한다. */
const MAX_BITS = 4096;

/** `char`가 ASCII 영문자(A-Z, a-z) 한 글자면 `true`다. 코드 포인트가 둘 이상인 글자는 영문자가 아니다. */
function isAsciiLetter(char: string): boolean {
  if (char.length !== 1) {
    return false;
  }
  const code = char.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

/** boolean 옵션을 검증한다. 생략은 `false`이고 boolean이 아닌 값(`null` 포함)은 거부한다. */
function readFlag(value: unknown, name: string): boolean {
  if (value === undefined) {
    return false;
  }
  if (typeof value !== "boolean") {
    throw new RangeError(`${name} must be a boolean`);
  }
  return value;
}

/** `isTaken` 값을 검증한다. 함수인지만 보고 호출하지는 않는다. */
function readIsTaken(value: unknown): ((id: string) => boolean) | undefined {
  if (value !== undefined && typeof value !== "function") {
    throw new RangeError("isTaken must be a function");
  }
  // 함수라는 것만 확인했다. 돌려주는 값이 boolean인지는 호출하는 쪽이 호출마다 검사한다.
  return value as ((id: string) => boolean) | undefined;
}

/** `preset` 값을 검증한다. 생략은 기본 preset이다. */
function readPreset(value: unknown): RandomIdPreset {
  if (value === undefined) {
    return DEFAULT_PRESET;
  }
  if (!isRandomIdPreset(value)) {
    throw new RangeError(
      `preset must be one of: ${RANDOM_ID_PRESETS.join(", ")}`,
    );
  }
  return value;
}

/**
 * `case` 값을 검증해 대문자 표를 쓸지 정한다. `base36`(기본 소문자)과 `readable`(기본 대문자)만 이 옵션을 받는다.
 * 다른 preset에서 지정하면 조용히 무시하지 않고 `RangeError`다.
 */
function readUpper(value: unknown, preset: RandomIdPreset): boolean {
  if (value !== undefined && preset !== "base36" && preset !== "readable") {
    throw new RangeError(
      "case is only allowed with the base36 and readable presets",
    );
  }
  return readLetterCase(value) ?? preset === "readable";
}

/** `preset`·`alphabet`·`case`로 문자 집합을 정한다. 결과는 코드 포인트 단위 배열이다. */
function resolveChars(
  preset: unknown,
  alphabet: unknown,
  letterCase: unknown,
): string[] {
  if (alphabet !== undefined) {
    if (letterCase !== undefined) {
      throw new RangeError(
        "case is not allowed with a custom alphabet (write the alphabet in the case you want)",
      );
    }
    return parseAlphabet(alphabet);
  }
  const name = readPreset(preset);
  return Array.from(presetAlphabet(name, readUpper(letterCase, name)));
}

/**
 * 무작위 부분의 첫 글자를 제한할 ASCII 영문자를 고른다. 제한이 없으면 `undefined`다.
 * `prefix`가 있으면 첫 글자만 검사하고 무작위 부분은 제한하지 않는다. `prefix` 없이 timestamp를 붙이면
 * ID가 숫자로 시작할 수 있어 거부한다.
 */
function resolveLetters(
  startWithLetter: boolean,
  prefix: string | undefined,
  timestamp: boolean,
  chars: readonly string[],
): string[] | undefined {
  if (!startWithLetter) {
    return undefined;
  }
  if (prefix !== undefined) {
    if (!isAsciiLetter(prefix.charAt(0))) {
      throw new RangeError(
        "prefix must start with an ASCII letter when startWithLetter is set",
      );
    }
    return undefined;
  }
  if (timestamp) {
    throw new RangeError(
      "startWithLetter requires a prefix when timestamp is set",
    );
  }
  const letters = chars.filter((char) => isAsciiLetter(char));
  if (letters.length === 0) {
    throw new RangeError(
      "startWithLetter requires a character set with at least one ASCII letter",
    );
  }
  return letters;
}

/**
 * `value`(1 이상의 정수)가 2의 거듭제곱이면 정확한 지수를, 아니면 `undefined`를 돌려준다.
 * 지수를 정확한 정수로 알아야 `bits` 변환의 경계(문자 집합 크기가 2^bits를 정확히 나누는 경우)를 부동소수점
 * 오차 없이 계산할 수 있다. `Math.log2`는 명세상 구현 근삿값이라 2의 거듭제곱에서도 정확성을 보장하지 않는다.
 */
function exactLog2(value: number): number | undefined {
  let rest = value;
  let exponent = 0;
  while (rest % 2 === 0) {
    rest /= 2;
    exponent += 1;
  }
  return rest === 1 ? exponent : undefined;
}

/** `value`의 밑 2 로그. 2의 거듭제곱이면 정확한 정수이고 아니면 `Math.log2`의 근삿값이다. */
function log2(value: number): number {
  const exponent = exactLog2(value);
  return exponent === undefined ? Math.log2(value) : exponent;
}

/**
 * `first * size^exponent >= 2^bits`를 만족하는 최소 지수를 돌려준다.
 * 첫 글자 제한이 없으면 `first`가 1이라 `size^exponent >= 2^bits`가 된다.
 * `first`가 `size` 이하이고 `bits`가 1 이상이면 결과는 0 이상이다(호출자가 하한을 한 번 더 둔다).
 *
 * 몫이 정확한 정수가 되는 경우는 `2^bits = first * size^exponent`일 때뿐이고, 그러려면 `first`와 `size`의
 * 홀수 부분이 1이어야 한다(= 둘 다 2의 거듭제곱, `exponent`가 0이면 `first = 2^bits`). 그 경우 `log2`가
 * 정확한 정수를 돌려줘 작은 정수의 사칙연산이 되므로 `Math.ceil`이 정확하다. 그 밖의 경우 몫은 무리수라
 * 정수와 같아질 수 없고, 이 인자 범위(`size` 2~256, `first` 1~52, `bits` 1~4096)에서 정수와의 거리는
 * 최소 7.5e-9로 double 연산 오차(약 1e-12)보다 세 자릿수 이상 크다.
 */
function minExponent(bits: number, first: number, size: number): number {
  return Math.ceil((bits - log2(first)) / log2(size));
}

/** `length`나 `bits`로 무작위 부분의 길이를 정한다. 둘 다 없으면 기본 길이다. */
function resolveLength(
  rawLength: unknown,
  rawBits: unknown,
  chars: readonly string[],
  letters: readonly string[] | undefined,
): number {
  if (rawBits !== undefined) {
    const bits = assertSafeInt(rawBits, "bits", 1, MAX_BITS);
    // 첫 글자가 영문자로 제한되면 그 자리의 경우의 수가 영문자 수 L이라 나머지 자리로 남은 엔트로피를 채운다.
    // `letters`는 `chars`의 부분집합이라 보정한 지수가 음수가 되지 않지만, 하한은 명세대로 1자로 둔다.
    const length =
      letters === undefined
        ? minExponent(bits, 1, chars.length)
        : Math.max(1, 1 + minExponent(bits, letters.length, chars.length));
    if (length > ID_MAX_LENGTH) {
      throw new RangeError(
        `bits requires ${length} characters, which exceeds the maximum length of ${ID_MAX_LENGTH}`,
      );
    }
    return length;
  }
  if (rawLength !== undefined) {
    return assertLength(rawLength);
  }
  return DEFAULT_LENGTH;
}

/**
 * 읽어 온 옵션 값을 검증해 정규화한다. 일회성 `randomId`와 팩토리가 같은 코어를 쓰며 키 목록만 다르다.
 *
 * 검사 순서: 상호 배타 → 값 검증 → 종속 규칙 → 문자 집합 → 첫 글자 제한 → 길이 → 그룹.
 * 길이를 마지막에 가까운 자리에 두는 것은 `group`의 상한과 `bits` 변환이 문자 집합과 첫 글자 제한에 따라
 * 달라지기 때문이다. 어떤 위반이든 결과는 `RangeError`이므로 이 순서는 계약이 아니다.
 */
function resolveRandomIdOptions(
  raw: RawRandomIdOptions,
): ResolvedRandomIdOptions {
  if (raw.length !== undefined && raw.bits !== undefined) {
    throw new RangeError("length and bits must not be used together");
  }
  if (raw.preset !== undefined && raw.alphabet !== undefined) {
    throw new RangeError("preset and alphabet must not be used together");
  }

  const prefix = readPrefix(raw.prefix);
  const timestamp = readFlag(raw.timestamp, "timestamp");
  const startWithLetter = readFlag(raw.startWithLetter, "startWithLetter");
  const isTaken = readIsTaken(raw.isTaken);
  const randomBytes = readRandomBytesOption(raw.randomBytes);
  const now = readNowOption(raw.now);

  if (raw.separator !== undefined && prefix === undefined && !timestamp) {
    throw new RangeError("separator requires prefix or timestamp");
  }
  if (raw.groupSeparator !== undefined && raw.group === undefined) {
    throw new RangeError("groupSeparator requires group");
  }
  if (raw.maxAttempts !== undefined && isTaken === undefined) {
    throw new RangeError("maxAttempts requires isTaken");
  }
  if (now !== undefined && !timestamp) {
    throw new RangeError("now requires timestamp: true");
  }

  const chars = resolveChars(raw.preset, raw.alphabet, raw.case);
  const letters = resolveLetters(startWithLetter, prefix, timestamp, chars);
  const length = resolveLength(raw.length, raw.bits, chars, letters);
  // `group`의 상한은 확정된 무작위 부분 길이다. 그래서 길이를 정한 뒤에 검증한다.
  const group =
    raw.group === undefined
      ? undefined
      : assertSafeInt(raw.group, "group", 1, length);
  const maxAttempts =
    raw.maxAttempts === undefined
      ? DEFAULT_MAX_ATTEMPTS
      : assertSafeInt(raw.maxAttempts, "maxAttempts", 1, MAX_ATTEMPTS);

  return {
    chars,
    length,
    letters,
    prefix,
    separator: readSeparator(raw.separator, "separator", DEFAULT_ID_SEPARATOR),
    timestamp,
    now,
    group,
    groupSeparator: readSeparator(
      raw.groupSeparator,
      "groupSeparator",
      DEFAULT_GROUP_SEPARATOR,
    ),
    isTaken,
    maxAttempts,
    randomBytes,
  };
}

/**
 * 일회성 `randomId`의 옵션을 읽고 검증해 정규화한다.
 * 난수원·시계 주입(`randomBytes`, `now`)은 이 진입점의 키가 아니라서 알 수 없는 키로 거부한다.
 *
 * @param options 옵션 객체나 `undefined`(옵션 없음). 객체가 아닌 값, 알 수 없는 키, 잘못된 값,
 *   상호 배타·종속 규칙 위반은 모두 `RangeError`다.
 * @throws {RangeError} 옵션이 규칙을 어겼을 때.
 */
export function readRandomIdOptions(options: unknown): ResolvedRandomIdOptions {
  return resolveRandomIdOptions(readOptions(options, RANDOM_ID_KEYS));
}

/**
 * `createRandomIdFactory`의 옵션을 읽고 검증해 정규화한다. 일회성 옵션에 `randomBytes`, `now`를 더 받는다.
 * 주입한 함수는 검증할 때 호출하지 않으므로 팩토리 생성은 난수원과 시계를 건드리지 않는다.
 *
 * @param options 옵션 객체나 `undefined`(옵션 없음).
 * @throws {RangeError} 옵션이 규칙을 어겼을 때.
 */
export function readRandomIdFactoryOptions(
  options: unknown,
): ResolvedRandomIdOptions {
  return resolveRandomIdOptions(
    readOptions(options, [...RANDOM_ID_KEYS, ...INJECTION_KEYS] as const),
  );
}
