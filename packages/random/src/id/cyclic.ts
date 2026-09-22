import {
  readCyclicIdOptions,
  readStart,
  type CyclicIdOptions,
  type ResolvedCyclicRange,
} from "./cyclic-options.js";

export type { CyclicIdOptions, CyclicIdPreset } from "./cyclic-options.js";

/**
 * 순환 정수 ID 생성기. 호출하면 현재 값을 돌려주고 `step`만큼 이동한다. `() => number` 자리에 그대로 넣을 수 있다.
 * `peek`·`reset`은 closure를 닫은 함수라 분리해서 호출해도 동작한다. `() => next()`로 감싸면 두 속성이 사라진다.
 */
export interface CyclicIdGenerator {
  /** 현재 값을 돌려주고 `step`만큼 이동한다. 범위 끝을 넘으면 반대쪽 끝으로 돈다. 예외를 던지지 않는다. */
  (): number;
  /** 다음 호출이 돌려줄 값. 상태를 바꾸지 않는다. */
  peek: () => number;
  /**
   * 인자가 없으면 생성 시 정한 시작값으로, 있으면 그 값으로 되돌린다.
   * 인자는 `[min, max]` 안의 safe integer여야 하며 아니면 `RangeError`이고 상태는 바뀌지 않는다.
   */
  reset: (start?: number) => void;
}

/**
 * 검증을 마친 범위로 순환 생성기를 만든다. `createCounterIdFactory`도 이 함수 위에 인코딩을 얹는다. 공개 export가 아니다.
 *
 * 상태는 `offset`(0 이상 `size` 미만) 하나다. 반환값은 `min + offset`이라 `-0`이 나오지 않는다.
 * `step`은 `0..size-1`로 정규화한다. `%`의 결과는 `(-size, size)`라 `size`를 더해도 safe integer다.
 * 이동은 합이 `size` 미만일 때만 더하고, 아니면 `size - stepN`을 빼서 wrap한다. 모든 중간값이 safe integer 안이다.
 */
export function createCyclicIdGenerator(
  range: ResolvedCyclicRange,
): CyclicIdGenerator {
  const { min, max, start, step } = range;
  const size = max - min + 1;
  let stepN = step % size;
  if (stepN < 0) {
    stepN += size;
  }
  let offset = start - min;

  const next = (): number => {
    const value = min + offset;
    offset = offset >= size - stepN ? offset - (size - stepN) : offset + stepN;
    return value;
  };
  return Object.assign(next, {
    peek: (): number => min + offset,
    reset: (value?: number): void => {
      offset = (value === undefined ? start : readStart(value, min, max)) - min;
    },
  });
}

/**
 * 정수 범위 `[min, max]`를 `step`씩 순환하는 ID 생성기를 만든다. 옵션은 생성할 때 한 번만 읽고 검증한다.
 * 생성기마다 상태가 독립이며 난수원·시계·`crypto`에 접근하지 않는다. import 시점에도 부수효과가 없다.
 *
 * 첫 호출은 `start`(기본값: 범위가 0을 포함하면 0, 아니면 `min`)를 돌려주고, `max` 다음은 `min`이다(음수 `step`은 반대).
 * `step`이 범위 크기와 서로소가 아니면 일부 값만 순환하며 오류가 아니다. 결과값은 계약이다: 같은 옵션은 항상 같은 수열을 낸다.
 *
 * 순환 ID는 예측 가능하며 보안 용도가 아니다. 한 바퀴를 돌면 값이 다시 나오므로 사용 중인 값과의 충돌은 호출자가 관리한다.
 * 상태는 메모리에만 있고 프로세스·Worker·탭 사이에 공유되지 않는다. 복원은 `peek()`로 저장한 값을 `start`나 `reset`에 넘겨 한다.
 *
 * @param options `preset`(int8~uint32) 또는 `min`(기본 0)·`max`(필수), 그리고 `start`·`step`(기본 1).
 *   `preset`과 `min`·`max`를 함께 주거나, `preset` 없이 `max`가 없거나, 값이 safe integer가 아니거나,
 *   `min > max`, 범위 크기가 `Number.MAX_SAFE_INTEGER` 초과, `start`가 범위 밖, `step`이 0, 알 수 없는 키가 있으면 `RangeError`다.
 * @returns 호출할 때마다 다음 정수를 돌려주는 생성기. `peek()`과 `reset(start?)`를 가진다.
 * @throws {RangeError} `options`가 잘못됐을 때(생성 시점). 생성기의 호출은 던지지 않으며 `reset`의 인자 위반만 `RangeError`다.
 */
export function createCyclicIdFactory(
  options: CyclicIdOptions,
): CyclicIdGenerator {
  return createCyclicIdGenerator(readCyclicIdOptions(options));
}
