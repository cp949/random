/**
 * `./secure` 함수의 길이 인자 상한(2^20). 메모리 할당을 제한하며 더 필요하면 호출자가 여러 번 부른다.
 * `./id`의 ID 길이 상한과 값이 다른 것은 의도다. 이 값은 원시 생성기의 메모리 제한이다.
 */
export const SECURE_MAX_LENGTH = 1_048_576;

/**
 * `./id`가 만드는 ID의 무작위 부분 길이 상한. `nanoid`와 `randomId`의 `length`가 공유한다.
 * `SECURE_MAX_LENGTH`와 값이 다른 것은 의도다. 이 값은 ID 한 개가 실용적인 크기를 넘지 않게 하는 제한이다.
 */
export const ID_MAX_LENGTH = 1024;

/**
 * UUID v7의 `unix_ts_ms` 필드(48비트)가 담을 수 있는 최대 밀리초(2^48 - 1).
 * 유닉스 시각으로 서기 10889년이다. 시계 값과 counter 고갈로 1ms를 앞세운 값이 이 상한을 함께 쓴다.
 */
export const MAX_UNIX_TS_MS = 281_474_976_710_655;

/**
 * `[min, max]`가 safe integer 두 개이고 `min <= max`이며 범위 크기(`max - min + 1`)가
 * `Number.MAX_SAFE_INTEGER` 이하인지 확인한다. 위반은 `RangeError`다.
 * 범위 크기가 그보다 크면 정확하게 표현할 수 없으므로 거부한다.
 * 타입이 틀린 값도 `TypeError`가 아니라 `RangeError`다.
 */
export function assertSafeIntRange(min: unknown, max: unknown): void {
  const lower = assertSafeInt(
    min,
    "min",
    -Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER,
  );
  const upper = assertSafeInt(
    max,
    "max",
    -Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER,
  );
  if (lower > upper) {
    throw new RangeError("min must be less than or equal to max");
  }
  if (upper - lower > Number.MAX_SAFE_INTEGER - 1) {
    throw new RangeError(
      "the range size (max - min + 1) must not exceed Number.MAX_SAFE_INTEGER",
    );
  }
}

/** alphabet 크기(코드 포인트 수)의 하한. 글자가 하나뿐이면 무작위가 아니다. */
const ALPHABET_MIN_SIZE = 2;

/** alphabet 크기(코드 포인트 수)의 상한. 바이트 하나로 글자 위치를 뽑는 sampler의 한계다. */
const ALPHABET_MAX_SIZE = 256;

/**
 * alphabet을 코드 포인트별 문자열 배열로 나눈다. 단위는 UTF-16 코드 유닛이 아니라 코드 포인트다.
 * 문자열이 아니거나, 코드 포인트 수가 2~256이 아니거나, 중복 또는 짝 없는 서로게이트가 있으면 `RangeError`를 던진다.
 * 짝 없는 서로게이트를 거부하므로 이 배열로 만든 문자열은 항상 올바른 UTF-16이다.
 * 결합 문자나 ZWJ 시퀀스는 코드 포인트마다 따로 나뉜다.
 */
export function parseAlphabet(alphabet: unknown): string[] {
  if (typeof alphabet !== "string") {
    throw new RangeError("alphabet must be a string");
  }

  // `Array.from`은 문자열을 코드 포인트 단위로 나눈다. 짝 없는 서로게이트는 길이 1인 원소로 남는다.
  const chars = Array.from(alphabet);
  if (chars.length < ALPHABET_MIN_SIZE || chars.length > ALPHABET_MAX_SIZE) {
    throw new RangeError(
      `alphabet must contain between ${ALPHABET_MIN_SIZE} and ${ALPHABET_MAX_SIZE} code points`,
    );
  }

  const seen = new Set<string>();
  for (const char of chars) {
    if (char.length === 1) {
      const code = char.charCodeAt(0);
      if (code >= 0xd800 && code <= 0xdfff) {
        throw new RangeError("alphabet must not contain lone surrogates");
      }
    }
    if (seen.has(char)) {
      throw new RangeError("alphabet must not contain duplicate characters");
    }
    seen.add(char);
  }
  return chars;
}

/**
 * `[min, max)`가 유한한 number 두 개이고 `min < max`이며 `max - min`이 유한한지 확인한다. 위반은 `RangeError`다.
 * `assertSafeIntRange`와 달리 소수를 허용하고, 반개구간이므로 `min === max`(빈 구간)를 거부한다.
 * `max - min`이 `Infinity`로 넘치면(`[-Number.MAX_VALUE, Number.MAX_VALUE]`) 이후 산식이 `Infinity`가 되므로 거부한다.
 * 타입이 틀린 값도 `TypeError`가 아니라 `RangeError`다.
 */
export function assertFiniteRange(min: unknown, max: unknown): void {
  const lower = assertFinite(min, "min");
  const upper = assertFinite(max, "max");
  if (lower >= upper) {
    throw new RangeError("min must be less than max");
  }
  if (!Number.isFinite(upper - lower)) {
    throw new RangeError("max - min must be finite");
  }
}

/** `value`가 유한한 number이면 그대로 돌려주고 아니면 `RangeError`를 던진다. */
export function assertFinite(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number`);
  }
  return value;
}

/**
 * `value`가 `[0, 1]` 안의 number이면 그대로 돌려주고 아니면 `RangeError`를 던진다(확률 인자).
 * `NaN`, 범위 밖, 문자열 등 타입이 틀린 값은 모두 `RangeError`다. 양끝 0과 1은 허용한다.
 */
export function assertProbability(value: unknown, name = "p"): number {
  if (typeof value !== "number" || !(value >= 0 && value <= 1)) {
    throw new RangeError(`${name} must be a number between 0 and 1`);
  }
  return value;
}

/**
 * `value`가 `[min, max]` 안의 safe integer이면 그대로 돌려주고 아니면 `RangeError`를 던진다.
 * 타입이 틀린 값(문자열, 객체, `undefined` 등)도 `TypeError`가 아니라 `RangeError`다.
 * 그래야 호출자가 잡아야 할 검증 오류가 하나로 정해진다.
 */
export function assertSafeInt(
  value: unknown,
  name: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new RangeError(
      `${name} must be an integer between ${min} and ${max}`,
    );
  }
  return value;
}

/**
 * ID 길이(`nanoid`와 `randomId`의 `length`)가 1 이상 `ID_MAX_LENGTH` 이하의 safe integer이면 그대로 돌려주고
 * 아니면 `RangeError`를 던진다. 문자열, 소수, `NaN`, 객체 같은 타입이 틀린 값도 `RangeError`다.
 * `valueOf`를 가진 객체는 숫자로 변환하지 않고 거부한다.
 */
export function assertLength(length: unknown): number {
  return assertSafeInt(length, "length", 1, ID_MAX_LENGTH);
}

/**
 * `value`가 `length`바이트의 `Uint8Array`인지 확인한다. 아니면 `RangeError`를 던진다.
 * `null`, `Array`, `Uint16Array`, 문자열, 빈·짧은·긴 배열이 모두 거부 대상이다.
 * 실제 view인지와 `instanceof Uint8Array`를 함께 검사한다. 다른 realm의 배열은 길이가 같아도 거부한다.
 * `Uint8Array`의 하위 클래스(`Buffer` 포함)는 통과한다. 값은 복사하거나 바꾸지 않는다.
 *
 * @param name 오류 메시지가 가리키는 대상. 기본은 주입한 난수원의 결과다. 난수원이 아닌 인자를 검사할 때
 *   그 인자 이름을 넘긴다(예: `stringifyUuid`의 `bytes`). 메시지 문구만 바뀌고 판정은 같다.
 */
export function assertBytes(
  value: unknown,
  length: number,
  name = "random source result",
): void {
  // 위조 프로토타입 객체와 Proxy는 length getter가 TypeError를 던지기 전에 거부한다.
  if (!ArrayBuffer.isView(value) || !(value instanceof Uint8Array)) {
    throw new RangeError(`${name} must be a Uint8Array`);
  }
  if (value.length !== length) {
    throw new RangeError(
      `${name} must be exactly ${length} bytes, got ${value.length}`,
    );
  }
}

/**
 * `value`가 `Array.isArray`가 참인 값인지 확인한다. 아니면 `RangeError`를 던진다.
 * typed array, 문자열, array-like 객체(`{ length }`), `null`, `undefined`는 모두 거부한다.
 * 원소의 타입과 값은 검사하지 않는다(`undefined`·`null` 원소 허용).
 */
export function assertArray(value: unknown, name: string): void {
  if (!Array.isArray(value)) {
    throw new RangeError(`${name} must be an array`);
  }
}

/**
 * `options`에 `knownKeys`에 없는 own enumerable 문자열 키가 있으면 `RangeError`를 던진다(오타 방지).
 * `Object.keys`로 검사하므로 값을 읽지 않고(getter를 호출하지 않는다), Symbol 키, 상속된 키,
 * enumerable이 아닌 own 키는 검사 대상이 아니다. 값이 `undefined`인 알 수 없는 키도 own 키라서 거부한다.
 */
export function assertKnownKeys(
  options: object,
  knownKeys: readonly string[],
): void {
  for (const key of Object.keys(options)) {
    if (!knownKeys.includes(key)) {
      throw new RangeError(`unknown option: ${key}`);
    }
  }
}

/**
 * 옵션 인자를 읽어 내부 복사본을 돌려준다. 이후 검증과 조립은 원본이 아니라 이 복사본만 본다.
 * 옵션 객체마다 검사 순서가 같도록 다음 규칙을 한 곳에 둔다.
 *
 * - `options`는 `undefined`(옵션 없음)나 객체여야 한다. `null`, 배열, 함수, 원시값은 `RangeError`다.
 * - 알 수 없는 키를 먼저 검사한다(`assertKnownKeys`). 옵션이 틀렸으면 사용자 getter를 실행하지 않는다.
 * - `knownKeys`의 필드를 `options[key]`로 정확히 한 번씩 읽는다. getter와 상속된 값도 읽히고 이후 원본을 다시 읽지 않는다.
 * - 값이 `undefined`인 필드는 복사본에 키를 만들지 않는다(생략과 같다). `null`은 값으로 남아 호출자가 검증한다.
 *
 * 복사본의 값은 `unknown`이다. 타입과 범위 검증은 호출자가 필드별로 한다. `knownKeys`에는 중복 이름을 넣지 않는다.
 */
export function readOptions<K extends string>(
  options: unknown,
  knownKeys: readonly K[],
): Partial<Record<K, unknown>> {
  const copy: Partial<Record<K, unknown>> = {};
  if (options === undefined) {
    return copy;
  }
  if (
    typeof options !== "object" ||
    options === null ||
    Array.isArray(options)
  ) {
    throw new RangeError("options must be an object");
  }

  assertKnownKeys(options, knownKeys);
  for (const key of knownKeys) {
    const value: unknown = (options as Record<K, unknown>)[key];
    if (value !== undefined) {
      copy[key] = value;
    }
  }
  return copy;
}

/**
 * 팩토리 옵션 `randomBytes`(주입 난수원)를 읽는다. `undefined`(주입 없음)이면 `undefined`를, 함수이면 그 함수를
 * 그대로 돌려준다. 함수가 아닌 값(`null`, 객체, 문자열, `Uint8Array` 포함)은 `RangeError`다.
 * 함수인지만 본다. 여기서 함수를 호출하지 않으므로 팩토리 생성은 난수원을 부르지 않고, 반환값이 요청한 길이의
 * `Uint8Array`인지는 호출 시점에 `guardSource`가 검사한다. 감싸는 일과 기본 난수원을 고르는 일은 호출자가 한다.
 */
export function readRandomBytesOption(
  value: unknown,
): ((length: number) => Uint8Array) | undefined {
  if (value !== undefined && typeof value !== "function") {
    throw new RangeError("randomBytes must be a function");
  }
  // 함수라는 것만 확인했다. 시그니처는 옵션 타입이 정하고 결과는 `guardSource`가 호출마다 검사한다.
  return value as ((length: number) => Uint8Array) | undefined;
}

/**
 * 팩토리 옵션 `now`(주입 시계)를 읽는다. `undefined`(주입 없음)이면 `undefined`를, 함수이면 그 함수를 그대로
 * 돌려준다. 함수가 아닌 값(`null`, 숫자, `Date` 객체 포함)은 `RangeError`다.
 * 함수인지만 본다. 여기서 호출하지 않으므로 팩토리 생성은 시계를 읽지 않고, 반환값이 쓸 수 있는 밀리초인지는
 * 호출 시점에 `readClockValue`가 검사한다.
 */
export function readNowOption(value: unknown): (() => number) | undefined {
  if (value !== undefined && typeof value !== "function") {
    throw new RangeError("now must be a function");
  }
  return value as (() => number) | undefined;
}

/**
 * 시계가 돌려준 값이 UUID v7의 timestamp로 쓸 수 있는지 확인하고 그대로 돌려준다.
 * 0 이상 `MAX_UNIX_TS_MS` 이하의 정수여야 하며 `NaN`, `Infinity`, 음수, 소수, 숫자가 아닌 값은 `RangeError`다.
 * `Date.now`는 이 범위 안이므로 기본 시계는 이 검사를 항상 통과한다.
 */
export function readClockValue(value: unknown): number {
  return assertSafeInt(value, "now()", 0, MAX_UNIX_TS_MS);
}

/**
 * UUID v7이 쓸 timestamp가 48비트 범위 안인지 확인하고 그대로 돌려준다.
 * counter가 고갈돼 마지막 timestamp를 1ms 앞세울 때 그 값이 상한을 넘으면 `RangeError`다.
 * 그 호출만 실패하고 생성기의 상태는 바뀌지 않는다.
 */
export function assertUnixTsMs(ms: number): number {
  return assertSafeInt(ms, "uuidv7 timestamp", 0, MAX_UNIX_TS_MS);
}

/** `prefix` 옵션을 검증한다. 생략은 접두사 없음이고 빈 문자열과 문자열이 아닌 값은 `RangeError`다. */
export function readPrefix(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new RangeError("prefix must be a string");
  }
  if (value === "") {
    throw new RangeError("prefix must not be empty");
  }
  return value;
}

/** 구분자 옵션을 검증한다. 생략은 `fallback`이고 빈 문자열은 허용하며 문자열이 아닌 값은 `RangeError`다. */
export function readSeparator(
  value: unknown,
  name: string,
  fallback: string,
): string {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "string") {
    throw new RangeError(`${name} must be a string`);
  }
  return value;
}

/**
 * `case` 옵션 원시값을 대소문자 boolean으로 매핑한다. 생략(`undefined`)은 `undefined`를 돌려주고
 * (값이 없을 때 무엇을 기본값으로 할지는 호출자가 정한다), `"lower"`는 `false`, `"upper"`는 `true`,
 * 그 외 값은 `RangeError`다. 언제 이 옵션을 허용할지(게이트)는 호출자가 이 함수를 부르기 전에 검사한다.
 */
export function readLetterCase(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value !== "lower" && value !== "upper") {
    throw new RangeError('case must be "lower" or "upper"');
  }
  return value === "upper";
}

/** ID 접두사·timestamp와 무작위 부분 사이 구분자의 기본값. `randomId`와 `createCounterIdFactory`가 공유한다. */
export const DEFAULT_ID_SEPARATOR = "_";
