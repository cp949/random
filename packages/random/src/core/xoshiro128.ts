import type { RandomSource } from "./random-source.js";
import { createSplitMix32, normalizeSeed } from "./seed.js";

/** 32비트 값을 `k`비트 왼쪽으로 순환 이동한다. 결과는 int32 비트 패턴이다(부호는 의미가 없다). */
function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

/**
 * xoshiro128**(Blackman & Vigna)의 한 스텝. `state`를 제자리에서 갱신하고 다음 word를 돌려준다.
 * http://prng.di.unimi.it/xoshiro128starstar.c 의 상태 갱신 순서를 그대로 따른다:
 * `s2 ^= s0`, `s3 ^= s1`(원래 s1), `s1 ^= (갱신된) s2`, `s0 ^= (갱신된) s3`,
 * `s2 ^= t`, `s3 = rotl(s3, 11)`.
 * 상태 word는 비트 연산 결과인 int32 비트 패턴으로 들고 있고 출력만 `>>> 0`으로 uint32로 바꾼다.
 * 곱셈은 `Math.imul`로 32비트 안에서 한다.
 */
function nextXoshiro128StarStar(
  state: [number, number, number, number],
): number {
  const s0 = state[0];
  const s1 = state[1];

  const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
  const t = s1 << 9;

  const s2 = state[2] ^ s0;
  const s3 = state[3] ^ s1;
  state[1] = s1 ^ s2;
  state[0] = s0 ^ s3;
  state[2] = s2 ^ t;
  state[3] = rotl(s3, 11);

  return result;
}

/**
 * 4 word 상태를 그대로 받아 xoshiro128** `RandomSource`를 만든다. `state`를 복사해 자기 상태로 쓰므로
 * 호출자가 넘긴 배열을 나중에 바꿔도 영향이 없다. all-zero 검사는 하지 않는다(호출자 책임.
 * `createXoshiro128Source`는 SplitMix32 논증으로, `./state`의 seed 없는 상태는 재추출로 보장한다).
 * root 공개 export가 아니다(`core/index.ts`에 넣지 않는다). `./state`가 crypto word 4개를 넣을 때 쓴다.
 */
export function createXoshiro128SourceFromState(
  state: readonly [number, number, number, number],
): RandomSource {
  const own: [number, number, number, number] = [
    state[0],
    state[1],
    state[2],
    state[3],
  ];
  return () => nextXoshiro128StarStar(own);
}

/**
 * seed로 재현 가능한 `RandomSource`를 만든다. 숫자 seed는 safe integer만 허용하고 `>>> 0`으로,
 * 문자열 seed는 FNV-1a 해시로 uint32 하나를 만든 뒤 SplitMix32 출력 4개를 순서대로 `s0..s3`에 넣는다.
 * all-zero 보정 분기는 없다. SplitMix32 mixer는 전단사이고 네 입력(`seed + k * 0x9e3779b9`)이 서로
 * 다르므로 출력 넷이 모두 0일 수 없고, xoshiro128**의 상태 전이는 가역 선형 사상이라 0이 아닌 상태는
 * 0이 되지 않는다. 호출마다 독립된 상태를 갖는 새 `RandomSource`를 돌려준다(인스턴스끼리 상태를 공유하지 않는다).
 *
 * @throws {RangeError} `seed`가 safe integer도 문자열도 아닐 때(생략 포함).
 */
export function createXoshiro128Source(seed: number | string): RandomSource {
  const nextSeedWord = createSplitMix32(normalizeSeed(seed));
  return createXoshiro128SourceFromState([
    nextSeedWord(),
    nextSeedWord(),
    nextSeedWord(),
    nextSeedWord(),
  ]);
}
