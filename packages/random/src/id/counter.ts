import {
  readCounterIdOptions,
  type CounterIdOptions,
  type ResolvedCounterIdOptions,
} from "./cyclic-options.js";
import { createCyclicIdGenerator } from "./cyclic.js";

export type { CounterIdOptions } from "./cyclic-options.js";

/**
 * 문자열 카운터 ID 생성기. 호출하면 현재 값을 인코딩한 문자열을 돌려주고 한 칸 이동한다. `() => string` 자리에 그대로 넣을 수 있다.
 * `peek`·`reset`은 closure를 닫은 함수라 분리해서 호출해도 동작한다. `() => next()`로 감싸면 두 속성이 사라진다.
 */
export interface CounterIdGenerator {
  /** 현재 값을 인코딩해 돌려주고 `step`만큼 이동한다. 범위 끝을 넘으면 반대쪽 끝으로 돈다. 예외를 던지지 않는다. */
  (): string;
  /** 다음 호출이 돌려줄 문자열. 상태를 바꾸지 않는다. */
  peek: () => string;
  /**
   * 인자가 없으면 생성 시 정한 시작값으로, 있으면 그 값(숫자)으로 되돌린다.
   * 인자는 `[min, max]` 안의 safe integer여야 하며 아니면 `RangeError`이고 상태는 바뀌지 않는다.
   */
  reset: (start?: number) => void;
}

/** 패딩에 쓰는 글자. */
const PAD_CHAR = "0";

/**
 * 값을 진법·패딩·대소문자·접두사 규칙으로 문자열 ID로 만든다.
 * `toString(radix)`는 safe integer에서 정확한 자릿수를 내며 소문자다. `padStart`는 이미 긴 문자열을 자르지 않는다.
 */
function encode(value: number, options: ResolvedCounterIdOptions): string {
  let digits = value.toString(options.radix).padStart(options.pad, PAD_CHAR);
  if (options.upper) {
    digits = digits.toUpperCase();
  }
  return options.prefix === undefined
    ? digits
    : options.prefix + options.separator + digits;
}

/**
 * 카운터 값을 진법으로 인코딩하고 접두사·0 패딩을 붙인 문자열 ID 생성기를 만든다. 옵션은 생성할 때 한 번만 읽고 검증한다.
 * 카운터 규칙(`min`·`max`·`start`·`step`, wrap, `peek`, `reset`)은 `createCyclicIdFactory`와 같되 `min`은 0 이상이고
 * 기본 범위는 `[0, Number.MAX_SAFE_INTEGER - 1]`이다. 생성기마다 상태가 독립이며 난수원·시계·`crypto`에 접근하지 않는다.
 *
 * 출력은 `[prefix][separator]` + 숫자 부분이다. 숫자 부분은 값을 `radix`진법(기본 10, 글자는 `0-9a-z`)으로 쓰고
 * `pad` 자리(기본 0)까지 왼쪽을 `0`으로 채운 뒤 `case: "upper"`면 대문자로 바꾼다. `prefix`가 없으면 구분자도 없다.
 * `prefix`·`separator`·`case`가 같고 `pad`가 `max`의 자릿수 이상이면 wrap 전까지 사전순이 값순이다. 결과값은 계약이다.
 *
 * 카운터 ID는 예측 가능하며 보안 용도가 아니다. 한 바퀴를 돌면 값이 다시 나오므로 충돌은 호출자가 관리한다.
 * 상태는 메모리에만 있고 프로세스·Worker·탭 사이에 공유되지 않는다. 복원은 호출자가 보관한 숫자를 `start`나 `reset`에 넘겨 한다. `peek()`은 인코딩된 문자열이라 그대로 넘길 수 없다.
 *
 * @param options `prefix`, `separator`(기본 `"_"`, `prefix`가 있을 때만), `radix`(2~36, 기본 10), `pad`(0~64, 기본 0),
 *   `case`(기본 `"lower"`, `radix > 10`일 때만), `min`(0 이상, 기본 0), `max`(기본 `Number.MAX_SAFE_INTEGER - 1`), `start`, `step`.
 *   `undefined`이면 전부 기본값이다. 값·종속 규칙 위반, 알 수 없는 키(`preset` 포함)는 `RangeError`다.
 * @returns 호출할 때마다 다음 문자열 ID를 돌려주는 생성기. `peek()`과 `reset(start?)`를 가진다.
 * @throws {RangeError} `options`가 잘못됐을 때(생성 시점). 생성기의 호출은 던지지 않으며 `reset`의 인자 위반만 `RangeError`다.
 */
export function createCounterIdFactory(
  options?: CounterIdOptions,
): CounterIdGenerator {
  const resolved = readCounterIdOptions(options);
  const core = createCyclicIdGenerator(resolved.range);
  return Object.assign((): string => encode(core(), resolved), {
    peek: (): string => encode(core.peek(), resolved),
    reset: core.reset,
  });
}
