import {
  DEFAULT_ID_SEPARATOR,
  assertSafeInt,
  assertSafeIntRange,
  readLetterCase,
  readOptions,
  readPrefix,
  readSeparator,
} from "../internal/validate.js";

/**
 * 순환 ID의 이름 있는 범위. `createCyclicIdFactory`의 `preset` 옵션이 받는 값이다.
 * 각 정수 타입의 전체 범위이며 시작값은 0이다. `min`·`max`와 함께 쓸 수 없다.
 */
export type CyclicIdPreset =
  "int8" | "uint8" | "int16" | "uint16" | "int32" | "uint32";

/** preset 이름 전부. 옵션 검증과 오류 메시지가 이 순서를 쓴다. */
export const CYCLIC_ID_PRESETS: readonly CyclicIdPreset[] = [
  "int8",
  "uint8",
  "int16",
  "uint16",
  "int32",
  "uint32",
];

/** preset별 `[min, max]`. 각 정수 타입의 전체 범위다. */
const PRESET_RANGES: Record<CyclicIdPreset, readonly [number, number]> = {
  int8: [-128, 127],
  uint8: [0, 255],
  int16: [-32768, 32767],
  uint16: [0, 65535],
  int32: [-2147483648, 2147483647],
  uint32: [0, 4294967295],
};

/**
 * `createCyclicIdFactory`의 옵션. 구조는 평면이고 배타·종속 관계는 런타임에 `RangeError`로 검사한다.
 * `preset`과 `min`·`max`는 함께 쓸 수 없고, `preset`이 없으면 `max`가 필수다.
 *
 * 옵션 객체는 생성 시점에 한 번만 읽는다. 값이 `undefined`인 필드는 지정하지 않은 것과 같고,
 * `null`은 값으로 검증되어 `RangeError`다. 알 수 없는 키도 `RangeError`다.
 */
export interface CyclicIdOptions {
  /** 이름 있는 범위. `min`·`max`와 함께 지정하면 `RangeError`다. */
  preset?: CyclicIdPreset;
  /** 범위의 하한. safe integer여야 한다. 기본값은 0이다. */
  min?: number;
  /**
   * 범위의 상한. safe integer이고 `min` 이상이어야 하며 범위 크기(`max - min + 1`)가
   * `Number.MAX_SAFE_INTEGER`를 넘으면 `RangeError`다. `preset`이 없으면 필수다.
   */
  max?: number;
  /** 첫 호출이 돌려줄 값. `[min, max]` 안의 safe integer다. 기본값은 범위가 0을 포함하면 0, 아니면 `min`이다. */
  start?: number;
  /**
   * 호출마다 이동하는 칸 수. 0이 아닌 safe integer다. 기본값은 1이다.
   * 음수면 감소 순환이고 절댓값이 범위 크기보다 커도 된다(범위 크기로 나눈 나머지만큼 이동한다).
   * 범위 크기와 서로소가 아니면 일부 값만 순환한다. 오류가 아니다.
   */
  step?: number;
}

/** 검증을 마친 순환 범위. 생성기는 이 값만 보고 원본 옵션을 다시 읽지 않는다. */
export interface ResolvedCyclicRange {
  readonly min: number;
  readonly max: number;
  readonly start: number;
  readonly step: number;
}

/** `createCyclicIdFactory`가 받는 옵션 키. */
const CYCLIC_ID_KEYS = ["preset", "min", "max", "start", "step"] as const;

/** `step`의 기본값. */
const DEFAULT_STEP = 1;

/** `value`가 preset 이름이면 `true`다. */
function isCyclicIdPreset(value: unknown): value is CyclicIdPreset {
  return (
    typeof value === "string" &&
    (CYCLIC_ID_PRESETS as readonly string[]).includes(value)
  );
}

/**
 * `reset(start)`의 인자를 검증한다. `[min, max]` 안의 safe integer면 그대로 돌려주고 아니면 `RangeError`다.
 * `undefined`도 거부한다(인자 없음은 호출자가 먼저 가려낸다). 메시지는 계약이 아니다.
 */
export function readStart(value: unknown, min: number, max: number): number {
  return assertSafeInt(value, "start", min, max);
}

/**
 * `min`·`max`(기본값 적용 후)·`start`·`step`을 검증해 범위를 만든다. 순환 옵션과 카운터 옵션이 공유한다.
 * `min`·`max`는 safe integer이고 `min <= max`이며 범위 크기가 `Number.MAX_SAFE_INTEGER` 이하여야 한다.
 * `step`은 0이 아닌 safe integer(`-0`도 0이다), `start`는 범위 안의 safe integer다. 위반은 `RangeError`다.
 * `start`를 생략하면 범위가 0을 포함할 때 0, 아니면 `min`이다.
 */
export function resolveRange(
  min: unknown,
  max: unknown,
  start: unknown,
  step: unknown,
): ResolvedCyclicRange {
  assertSafeIntRange(min, max);
  // `assertSafeIntRange`가 두 값의 타입·순서·크기를 모두 확인했다.
  const lower = min as number;
  const upper = max as number;
  const resolvedStep =
    step === undefined
      ? DEFAULT_STEP
      : assertSafeInt(
          step,
          "step",
          -Number.MAX_SAFE_INTEGER,
          Number.MAX_SAFE_INTEGER,
        );
  if (resolvedStep === 0) {
    throw new RangeError("step must not be 0");
  }
  const resolvedStart =
    start === undefined
      ? lower <= 0 && 0 <= upper
        ? 0
        : lower
      : readStart(start, lower, upper);
  return { min: lower, max: upper, start: resolvedStart, step: resolvedStep };
}

/**
 * `createCyclicIdFactory`의 옵션을 읽고 검증해 범위로 정규화한다.
 * 검사 순서: 비객체·알 수 없는 키 → `preset`과 `min`·`max`의 배타 → `preset` 값 또는 `max` 필수 → 범위·`step`·`start`.
 * 어떤 위반이든 `RangeError`이므로 순서는 계약이 아니다.
 *
 * @param options 옵션 객체. `undefined`도 `max`가 없어 `RangeError`다.
 * @throws {RangeError} 옵션이 규칙을 어겼을 때.
 */
export function readCyclicIdOptions(options: unknown): ResolvedCyclicRange {
  const raw = readOptions(options, CYCLIC_ID_KEYS);
  if (raw.preset !== undefined) {
    if (raw.min !== undefined || raw.max !== undefined) {
      throw new RangeError("preset must not be used together with min or max");
    }
    if (!isCyclicIdPreset(raw.preset)) {
      throw new RangeError(
        `preset must be one of: ${CYCLIC_ID_PRESETS.join(", ")}`,
      );
    }
    const [min, max] = PRESET_RANGES[raw.preset];
    return resolveRange(min, max, raw.start, raw.step);
  }
  if (raw.max === undefined) {
    throw new RangeError("max is required when preset is not given");
  }
  return resolveRange(
    raw.min === undefined ? 0 : raw.min,
    raw.max,
    raw.start,
    raw.step,
  );
}

/**
 * `createCounterIdFactory`의 옵션. 구조는 평면이고 종속 관계는 런타임에 `RangeError`로 검사한다.
 * 카운터 규칙(`min`·`max`·`start`·`step`)은 순환 ID와 같되 `min`은 0 이상이어야 하고 `preset`은 받지 않는다.
 * 옵션 객체는 생성 시점에 한 번만 읽는다. 값이 `undefined`인 필드는 지정하지 않은 것과 같고 `null`은 `RangeError`다.
 */
export interface CounterIdOptions {
  /** 고정 접두사. 비어 있지 않은 문자열이어야 한다. 기본값은 없다(접두사 없음). */
  prefix?: string;
  /** 접두사와 숫자 부분 사이의 구분자. 기본값은 `"_"`이고 빈 문자열도 쓸 수 있다. `prefix` 없이 지정하면 `RangeError`다. */
  separator?: string;
  /** 숫자 부분의 진법. 2 이상 36 이하의 정수다. 기본값은 10이다. */
  radix?: number;
  /** 숫자 부분의 최소 자릿수. 0 이상 64 이하의 정수이며 부족한 자리를 왼쪽에 `0`으로 채운다. 자르지 않는다. 기본값은 0이다. */
  pad?: number;
  /** 숫자 부분의 영문자 대소문자. 기본값은 `"lower"`다. `radix`가 10 이하면 영문자가 없어 지정할 수 없다(`RangeError`). */
  case?: "lower" | "upper";
  /** 범위의 하한. 0 이상의 safe integer다. 기본값은 0이다. */
  min?: number;
  /** 범위의 상한. safe integer이고 `min` 이상이며 범위 크기가 `Number.MAX_SAFE_INTEGER` 이하여야 한다. 기본값은 `Number.MAX_SAFE_INTEGER - 1`이다. */
  max?: number;
  /** 첫 호출이 돌려줄 값. `[min, max]` 안의 safe integer다. 기본값은 범위가 0을 포함하면 0, 아니면 `min`이다. */
  start?: number;
  /**
   * 호출마다 이동하는 칸 수. 0이 아닌 safe integer다. 기본값은 1이다.
   * 음수면 감소 순환이고 절댓값이 범위 크기보다 커도 된다(범위 크기로 나눈 나머지만큼 이동한다).
   * 범위 크기와 서로소가 아니면 일부 값만 순환한다. 오류가 아니다.
   */
  step?: number;
}

/** 검증과 정규화를 마친 카운터 옵션. 조립하는 쪽은 이 값만 본다. */
export interface ResolvedCounterIdOptions {
  readonly range: ResolvedCyclicRange;
  readonly prefix: string | undefined;
  readonly separator: string;
  readonly radix: number;
  readonly pad: number;
  readonly upper: boolean;
}

/** `createCounterIdFactory`가 받는 옵션 키. `preset`은 없어서 알 수 없는 키로 거부된다. */
const COUNTER_ID_KEYS = [
  "prefix",
  "separator",
  "radix",
  "pad",
  "case",
  "min",
  "max",
  "start",
  "step",
] as const;

/** `radix`의 기본값과 범위. `Number.prototype.toString`이 받는 범위와 같다. */
const DEFAULT_RADIX = 10;
const MIN_RADIX = 2;
const MAX_RADIX = 36;

/** 영문자가 없는 진법의 상한. 이 값 이하에서는 `case`가 의미가 없다. 기본 진법과는 별개의 값이다. */
const MAX_LETTERLESS_RADIX = 10;

/** `pad`의 상한. safe integer는 2진법에서 53자리라 그 위의 자리는 정보 없는 0이다. 64는 이를 덮는 값이다. */
const MAX_PAD = 64;

/** 카운터 `max`의 기본값. `min` 기본 0에서 범위 크기가 `Number.MAX_SAFE_INTEGER`가 되는 값이다. */
const DEFAULT_COUNTER_MAX = Number.MAX_SAFE_INTEGER - 1;

/**
 * `case` 값을 검증해 대문자로 낼지 정한다. 생략은 소문자다.
 * `radix`가 10 이하면 영문자가 없어 어느 값이든 `RangeError`다(조용히 무시하지 않는다).
 */
function readUpper(value: unknown, radix: number): boolean {
  if (value !== undefined && radix <= MAX_LETTERLESS_RADIX) {
    throw new RangeError("case is only allowed when radix is greater than 10");
  }
  return readLetterCase(value) ?? false;
}

/**
 * `createCounterIdFactory`의 옵션을 읽고 검증해 정규화한다.
 * 검사 순서: 비객체·알 수 없는 키 → `prefix` → `separator`(종속) → `radix` → `pad` → `case`(종속) → `min`(0 이상) → 범위·`step`·`start`.
 * 어떤 위반이든 `RangeError`이므로 순서는 계약이 아니다.
 *
 * @param options 옵션 객체나 `undefined`(옵션 없음).
 * @throws {RangeError} 옵션이 규칙을 어겼을 때.
 */
export function readCounterIdOptions(
  options: unknown,
): ResolvedCounterIdOptions {
  const raw = readOptions(options, COUNTER_ID_KEYS);
  const prefix = readPrefix(raw.prefix);
  if (raw.separator !== undefined && prefix === undefined) {
    throw new RangeError("separator requires prefix");
  }
  const separator = readSeparator(
    raw.separator,
    "separator",
    DEFAULT_ID_SEPARATOR,
  );
  const radix =
    raw.radix === undefined
      ? DEFAULT_RADIX
      : assertSafeInt(raw.radix, "radix", MIN_RADIX, MAX_RADIX);
  const pad =
    raw.pad === undefined ? 0 : assertSafeInt(raw.pad, "pad", 0, MAX_PAD);
  const upper = readUpper(raw.case, radix);
  const min =
    raw.min === undefined
      ? 0
      : assertSafeInt(raw.min, "min", 0, Number.MAX_SAFE_INTEGER);
  const range = resolveRange(
    min,
    raw.max === undefined ? DEFAULT_COUNTER_MAX : raw.max,
    raw.start,
    raw.step,
  );
  return { range, prefix, separator, radix, pad, upper };
}
