import {
  bool,
  choice,
  createWeightedSampler,
  createXoshiro128Source,
  float,
  int,
  permutation,
  sample,
  shuffle,
  shuffleInPlace,
  sign,
  uniform,
  weightedChoice,
  type RandomSource,
  type WeightedSampler,
} from "@cp949/random";
import {
  createSecureSource,
  type RandomSource as SecureRandomSource,
} from "@cp949/random/secure";

/** seed로 재현 가능한 source. 숫자·문자열 seed를 모두 받는다. */
export function seededSource(seed: number | string): RandomSource {
  return createXoshiro128Source(seed);
}

/** `RandomSource`는 인자 없이 호출하면 uint32 하나를 돌려주는 함수다. */
export function rawWord(source: RandomSource): number {
  return source();
}

/** 주사위. `int`는 양끝을 포함한다. */
export function die(source: RandomSource): number {
  return int(source, 1, 6);
}

/** `[0, 1)` 실수. */
export function unitFloat(source: RandomSource): number {
  return float(source);
}

/** 동전 던지기. */
export function coinFlip(source: RandomSource): boolean {
  return bool(source);
}

/** 확률 `p`로 참인 동전. `p`를 생략하면 50%다. */
export function biasedCoin(source: RandomSource): boolean {
  return bool(source, 0.25);
}

/** 부호. 반환 타입은 `1 | -1`이다. */
export function randomSign(source: RandomSource): 1 | -1 {
  return sign(source);
}

/** 실수 범위. `min`/`max`는 정수가 아니어도 된다. */
export function jitter(source: RandomSource): number {
  return uniform(source, -1.5, 1.5);
}

/**
 * `./secure`의 `createSecureSource()`가 만든 source도 같은 함수들에 그대로 들어간다(`RandomSource`로 통일).
 * `./secure`가 재export하는 `RandomSource`는 root의 타입과 같아 서로 대입된다.
 */
export function secureDie(): number {
  const secure: SecureRandomSource = createSecureSource();
  const source: RandomSource = secure;
  return int(source, 1, 6);
}

/** 커스텀 source(`RandomSource` 계약만 만족하면 된다)도 같은 함수에 들어간다. */
export function customSourceDie(next: () => number): number {
  const source: RandomSource = next;
  return int(source, 1, 6);
}

const SUITS = ["clubs", "diamonds", "hearts", "spades"] as const;

/** `readonly` 튜플을 넣으면 `T`가 리터럴 union으로 추론된다. */
export function drawSuit(
  source: RandomSource,
): "clubs" | "diamonds" | "hearts" | "spades" {
  return choice(source, SUITS);
}

/** 입력을 바꾸지 않고 섞은 복사본을 돌려준다. */
export function shuffledSuits(source: RandomSource): (typeof SUITS)[number][] {
  return shuffle(source, SUITS);
}

/** 제자리에서 섞고 같은 참조를 돌려준다. */
export function shuffleHandInPlace(
  source: RandomSource,
  hand: string[],
): string[] {
  return shuffleInPlace(source, hand);
}

/** 비복원 추출. `count`는 `items.length`를 넘을 수 없다. */
export function dealHand(source: RandomSource): (typeof SUITS)[number][] {
  return sample(source, SUITS, 2);
}

/** `[0, length)`의 순열. */
export function shuffledIndices(
  source: RandomSource,
  length: number,
): number[] {
  return permutation(source, length);
}

/** 가중치로 원소 하나를 뽑는다. */
export function pickTier(source: RandomSource): string {
  return weightedChoice(source, ["common", "rare", "legendary"], [70, 25, 5]);
}

/** 반복 추출용 sampler. 생성 시 검증·전처리하고 호출마다 source만 받는다. */
export function createTierSampler(): WeightedSampler<string> {
  return createWeightedSampler(["common", "rare", "legendary"], [70, 25, 5]);
}

/** `./secure`의 source도 root helper에 그대로 들어간다(`RandomSource`로 통일). */
export function secureRoll(): number {
  const secure: SecureRandomSource = createSecureSource();
  const source: RandomSource = secure;
  return int(source, 1, 6);
}
