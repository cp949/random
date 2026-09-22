/**
 * 소비자 런타임 smoke: 설치된 `@cp949/random`(빌드된 dist)을 실제로 호출한다.
 * 단위 테스트는 `src`를 import하므로 컴파일된 ES2019 산출물이 실제 `globalThis.crypto` 위에서 동작하는지는
 * 여기서만 확인한다. 인자 `mode`는 `present`(실제 crypto), `absent`(crypto 제거), `throwing`(crypto 접근이 예외)이다.
 * export를 추가하는 작업은 이 파일에 그 함수의 호출을 함께 추가한다.
 */
import assert from "node:assert/strict";

const mode = process.argv[2] ?? "present";

// 라이브러리가 Math.random을 호출하면 즉시 실패시킨다. lint가 막지 못하는 우회도 실행 시점에 잡는다.
Math.random = () => {
  throw new Error("Math.random이 호출되었다");
};

if (mode === "absent") {
  Object.defineProperty(globalThis, "crypto", {
    value: undefined,
    configurable: true,
    writable: true,
  });
} else if (mode === "throwing") {
  Object.defineProperty(globalThis, "crypto", {
    get() {
      throw new Error("crypto 접근이 거부되었다");
    },
    configurable: true,
  });
}

const {
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
} = await import("@cp949/random");
const { SecureRandomUnavailableError, createSecureSource } =
  await import("@cp949/random/secure");

/** 호출이 `SecureRandomUnavailableError`로 실패하는지 확인한다. */
const failsClosed = (call) =>
  assert.throws(call, (error) => error instanceof SecureRandomUnavailableError);

// seed 기반 source는 crypto를 쓰지 않으므로 세 crypto 상태 모두에서 동작한다.
// golden vector: test/core/xoshiro128.test.ts와 docs/api/random-core.md 대표 벡터의 값(seed=42의 첫 word 2개).
const seeded = createXoshiro128Source(42);
assert.equal(seeded(), 3514831625);
assert.equal(seeded(), 2416850046);

// 문자열 seed도 동작하고, 같은 seed는 항상 같은 첫 word를 낸다.
assert.equal(createXoshiro128Source("hello")(), 2966572188);

// seed 검증은 crypto 상태와 무관하게 RangeError다.
for (const invalidSeed of [undefined, null, 1.5, Number.NaN, {}, []]) {
  assert.throws(() => createXoshiro128Source(invalidSeed), RangeError);
}

// int/float/bool/sign/uniform은 seed 기반 source로 crypto 상태와 무관하게 동작한다.
const dice = createXoshiro128Source("smoke-dice");
for (let i = 0; i < 200; i += 1) {
  const roll = int(dice, 1, 6);
  assert.ok(Number.isInteger(roll) && roll >= 1 && roll <= 6);
}
const unit = createXoshiro128Source("smoke-float");
for (let i = 0; i < 200; i += 1) {
  const value = float(unit);
  assert.ok(value >= 0 && value < 1);
}
const coin = createXoshiro128Source("smoke-bool");
const flips = new Set();
for (let i = 0; i < 200; i += 1) flips.add(bool(coin));
assert.deepEqual([...flips].sort(), [false, true]);
assert.equal(bool(coin, 0), false);
assert.equal(bool(coin, 1), true);
const biased = createXoshiro128Source("smoke-bool-p");
let heads = 0;
for (let i = 0; i < 2000; i += 1) if (bool(biased, 0.1)) heads += 1;
assert.ok(heads > 100 && heads < 300, `p=0.1의 참 횟수 ${heads}`);
const signs = createXoshiro128Source("smoke-sign");
const seenSigns = new Set();
for (let i = 0; i < 200; i += 1) seenSigns.add(sign(signs));
assert.deepEqual([...seenSigns].sort(), [-1, 1]);
const range = createXoshiro128Source("smoke-uniform");
for (let i = 0; i < 200; i += 1) {
  const value = uniform(range, -5, 5);
  assert.ok(value >= -5 && value < 5);
}

// 인자 검증은 crypto 상태와 무관하게 RangeError다. source 검증이 먼저다.
assert.throws(() => int("not a function", 0, 9), RangeError);
assert.throws(() => int(dice, 9, 0), RangeError);
assert.throws(() => uniform(dice, Number.NaN, 1), RangeError);
assert.throws(() => uniform(dice, 1, 0), RangeError);
assert.throws(() => uniform(dice, 1, 1), RangeError);
assert.throws(() => bool(dice, 1.5), RangeError);
assert.throws(() => bool(dice, Number.NaN), RangeError);

// choice/shuffle/shuffleInPlace/sample/permutation/weightedChoice/createWeightedSampler는
// seed 기반 source로 crypto 상태와 무관하게 동작한다.
const deck = ["clubs", "diamonds", "hearts", "spades"];
const pick = createXoshiro128Source("smoke-choice");
for (let i = 0; i < 200; i += 1) assert.ok(deck.includes(choice(pick, deck)));
assert.throws(() => choice(pick, []), RangeError);

const shuffleSource = createXoshiro128Source("smoke-shuffle");
const shuffled = shuffle(shuffleSource, deck);
assert.notEqual(shuffled, deck);
assert.deepEqual([...shuffled].sort(), [...deck].sort());
assert.deepEqual(deck, ["clubs", "diamonds", "hearts", "spades"]);

const hand = [...deck];
const inPlaceResult = shuffleInPlace(shuffleSource, hand);
assert.equal(inPlaceResult, hand);

const sampleSource = createXoshiro128Source("smoke-sample");
const dealt = sample(sampleSource, deck, 2);
assert.equal(dealt.length, 2);
for (const card of dealt) assert.ok(deck.includes(card));
assert.throws(() => sample(sampleSource, deck, deck.length + 1), RangeError);

const permutationSource = createXoshiro128Source("smoke-permutation");
const order = permutation(permutationSource, 5);
assert.deepEqual(
  [...order].sort((a, b) => a - b),
  [0, 1, 2, 3, 4],
);
assert.throws(() => permutation(permutationSource, -1), RangeError);

const weightedSource = createXoshiro128Source("smoke-weighted-choice");
const tiers = new Set();
for (let i = 0; i < 200; i += 1) {
  tiers.add(weightedChoice(weightedSource, ["common", "rare"], [90, 10]));
}
assert.deepEqual([...tiers].sort(), ["common", "rare"]);
assert.throws(
  () => weightedChoice(weightedSource, ["a", "b"], [0, 0]),
  RangeError,
);

const tierSampler = createWeightedSampler(["common", "rare"], [90, 10]);
const samplerSource = createXoshiro128Source("smoke-weighted-sampler");
for (let i = 0; i < 200; i += 1) {
  assert.ok(["common", "rare"].includes(tierSampler(samplerSource)));
}

if (mode === "present") {
  // ./secure의 createSecureSource가 만든 source는 root helper에 그대로 들어간다.
  const secure = createSecureSource();
  const word = secure();
  assert.ok(Number.isInteger(word) && word >= 0 && word < 2 ** 32);
  assert.ok(Number.isInteger(int(secure, 1, 6)));
  assert.ok(float(secure) >= 0 && float(secure) < 1);

  // 난수원을 실제로 호출했는지 확인한다(연속 32개 word가 모두 같을 확률은 무시할 수 있다).
  const words = Array.from({ length: 32 }, () => createSecureSource()());
  assert.ok(new Set(words).size > 1);

  // 샘플링 함수도 secure source를 그대로 받는다(합성 지점 확인).
  assert.ok(["a", "b", "c"].includes(choice(secure, ["a", "b", "c"])));
} else {
  // 미지원 환경에서는 생성 시점(eager)에 실패한다.
  failsClosed(() => createSecureSource());
}
