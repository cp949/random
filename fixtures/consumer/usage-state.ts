import { createWeightedSampler, float, type RandomSource } from "@cp949/random";
import { createSecureSource } from "@cp949/random/secure";
import {
  createRandomState,
  rand,
  SecureRandomUnavailableError,
  type RandomState,
  type RandomStateOptions,
} from "@cp949/random/state";

/** seed 상태. 같은 seed는 같은 결과 열을 낸다. */
export function seededState(seed: number | string): RandomState {
  return createRandomState(seed);
}

/** 보안 source 위의 facade. seed 없는 `createRandomState()`와 다르다(그쪽은 crypto로 seed한 PRNG). */
export function secureState(): RandomState {
  return createRandomState(undefined, { source: createSecureSource() });
}

/** 커스텀 source 주입. `RandomStateOptions`로 옵션을 따로 만들 수 있다. */
export function customState(next: () => number): RandomState {
  const options: RandomStateOptions = { source: next };
  return createRandomState(undefined, options);
}

/** seed가 필요 없는 곳에서는 module-level `rand`를 쓴다. 보안 용도가 아니다. */
export function quickDie(): number {
  return rand.int(1, 6);
}

/** method는 `this`를 쓰지 않아 분해해도 동작한다. */
export function destructured(): number {
  const { float: unit, choice } = rand;
  return unit() + choice([1, 2, 3]);
}

/** facade에 없는 함수(`WeightedSampler`)에는 `state.source`를 넘긴다. */
export function tierWithState(state: RandomState): string {
  const roll = createWeightedSampler(["common", "rare"], [9, 1]);
  return roll(state.source);
}

/** `state.source`는 root의 `RandomSource`와 같은 타입이다. */
export function unitFromState(state: RandomState): number {
  const source: RandomSource = state.source;
  return float(source);
}

/** 미지원 환경의 첫 사용 실패는 `./state`가 재export하는 클래스로 잡는다. */
export function guardedRoll(): number | undefined {
  try {
    return rand.int(1, 6);
  } catch (error) {
    if (error instanceof SecureRandomUnavailableError) return undefined;
    throw error;
  }
}

const SUITS = ["clubs", "diamonds", "hearts", "spades"] as const;

/** 제네릭 method는 leaf와 같이 리터럴 union을 추론한다. */
export function drawSuit(state: RandomState): (typeof SUITS)[number] {
  return state.choice(SUITS);
}
