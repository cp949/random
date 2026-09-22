import { bool } from "../core/bool.js";
import { float } from "../core/float.js";
import { int } from "../core/int.js";
import {
  assertRandomSource,
  type RandomSource,
} from "../core/random-source.js";
import { sign } from "../core/sign.js";
import { uniform } from "../core/uniform.js";
import {
  createXoshiro128Source,
  createXoshiro128SourceFromState,
} from "../core/xoshiro128.js";
import { getCrypto } from "../internal/crypto.js";
import { readOptions } from "../internal/validate.js";
import { choice } from "../sampling/choice.js";
import { permutation } from "../sampling/permutation.js";
import { sample } from "../sampling/sample.js";
import { shuffleInPlace } from "../sampling/shuffle-in-place.js";
import { shuffle } from "../sampling/shuffle.js";
import { weightedChoice } from "../sampling/weighted-choice.js";

/** `createRandomState`의 옵션. `source`를 주면 그 함수를 그대로 바인딩한다(`seed`와 함께 쓸 수 없다). */
export interface RandomStateOptions {
  source?: RandomSource;
}

/**
 * `RandomSource` 하나와, 그 source를 첫 인자에 넣어 root leaf를 호출하는 같은 이름의 method 11개.
 * method는 자체 검증을 하지 않고 인자 검증·오류·word 소비·결과가 leaf와 같다. `this`를 쓰지 않는
 * 클로저라 분해(`const { int } = rand`)해도 동작한다. 새 산식·새 오류는 없다.
 */
export interface RandomState {
  /** 바인딩한 source. 주입·seed 상태는 넘긴/만든 함수 그대로, seed 없는 상태는 lazy 초기화 래퍼다. */
  readonly source: RandomSource;

  int: (min: number, max: number) => number;
  float: () => number;
  bool: (p?: number) => boolean;
  sign: () => 1 | -1;
  uniform: (min: number, max: number) => number;

  choice: <T>(items: readonly T[]) => T;
  shuffle: <T>(items: readonly T[]) => T[];
  shuffleInPlace: <T>(items: T[]) => T[];
  sample: <T>(items: readonly T[], count: number) => T[];
  permutation: (length: number) => number[];
  weightedChoice: <T>(items: readonly T[], weights: readonly number[]) => T;
}

/**
 * seed 없는 상태의 source. 첫 호출에서 `getCrypto()`로 지원을 확인하고
 * `getRandomValues(new Uint32Array(4))`로 word 4개를 받아(넷 다 0이면 다시 받는다. 상한 없음)
 * xoshiro128** 상태로 쓴다. SplitMix32를 거치지 않는다. 이후 호출은 그 source에 위임한다.
 * 초기화가 던지면(`SecureRandomUnavailableError`, `getRandomValues` 오류) 미초기화로 남고 다음 호출이
 * 다시 시도한다. import·생성·프로퍼티 접근 시점에는 crypto에 접근하지 않는다. 결과값은 무작위이며
 * 계약이 아니고 보안 보증도 없다.
 */
function createCryptoSeededSource(): RandomSource {
  let inner: RandomSource | undefined;
  return () => {
    if (inner === undefined) {
      const crypto = getCrypto();
      const words = new Uint32Array(4);
      do {
        crypto.getRandomValues(words);
      } while (words.every((word) => word === 0));
      inner = createXoshiro128SourceFromState([
        words[0]!,
        words[1]!,
        words[2]!,
        words[3]!,
      ]);
    }
    return inner();
  };
}

/**
 * 상태 객체를 만든다. `seed`만 주면 `createXoshiro128Source(seed)`, `options.source`만 주면 그 함수,
 * 둘 다 없으면 crypto로 lazy 초기화하는 xoshiro128** source를 바인딩한다. 둘 다 주면 `RangeError`다.
 * 생성 시 source를 호출하지 않고 crypto에도 접근하지 않는다. 호출마다 새 객체를 돌려준다.
 *
 * @throws {RangeError} `options`가 `undefined`나 객체가 아닐 때, 알 수 없는 키가 있을 때(먼저),
 * `seed`와 `source`를 함께 줬을 때, `seed`가 safe integer도 문자열도 아닐 때, `source`가 함수가 아닐 때.
 */
export function createRandomState(
  seed?: number | string,
  options?: RandomStateOptions,
): RandomState {
  const { source: injected } = readOptions(options, ["source"]);
  if (seed !== undefined && injected !== undefined) {
    throw new RangeError("seed and source must not be used together");
  }

  let source: RandomSource;
  if (seed !== undefined) {
    source = createXoshiro128Source(seed);
  } else if (injected !== undefined) {
    assertRandomSource(injected);
    source = injected;
  } else {
    source = createCryptoSeededSource();
  }

  return {
    source,
    int: (min, max) => int(source, min, max),
    float: () => float(source),
    bool: (p) => bool(source, p),
    sign: () => sign(source),
    uniform: (min, max) => uniform(source, min, max),
    choice: (items) => choice(source, items),
    shuffle: (items) => shuffle(source, items),
    shuffleInPlace: (items) => shuffleInPlace(source, items),
    sample: (items, count) => sample(source, items, count),
    permutation: (length) => permutation(source, length),
    weightedChoice: (items, weights) => weightedChoice(source, items, weights),
  };
}
