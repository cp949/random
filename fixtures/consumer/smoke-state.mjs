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

const { createRandomState, rand, SecureRandomUnavailableError } =
  await import("@cp949/random/state");
const { createXoshiro128Source, float, int } = await import("@cp949/random");
const secureEntry = await import("@cp949/random/secure");

/** 호출이 `SecureRandomUnavailableError`로 실패하는지 확인한다. */
const failsClosed = (call) =>
  assert.throws(call, (error) => error instanceof SecureRandomUnavailableError);

// ./state와 ./secure의 SecureRandomUnavailableError는 같은 클래스다.
assert.equal(
  SecureRandomUnavailableError,
  secureEntry.SecureRandomUnavailableError,
);

// seed 상태는 crypto를 쓰지 않으므로 세 crypto 상태 모두에서 동작한다. seed 42의 첫 word는 golden vector다.
const state = createRandomState(42);
assert.equal(state.source(), 3514831625);

// 같은 seed의 상태 객체는 leaf와 PRNG를 직접 조합한 결과와 같다(로드맵 완료 조건).
const a = createRandomState("smoke-state");
const b = createXoshiro128Source("smoke-state");
assert.equal(a.float(), float(b));
assert.equal(a.int(1, 6), int(b, 1, 6));
assert.equal(a.source(), b());

// own key는 source와 method 11개다.
assert.deepEqual(Object.keys(state).sort(), [
  "bool",
  "choice",
  "float",
  "int",
  "permutation",
  "sample",
  "shuffle",
  "shuffleInPlace",
  "sign",
  "source",
  "uniform",
  "weightedChoice",
]);

// 분해해도 동작한다.
const { choice } = createRandomState("smoke-destructure");
assert.ok(["x", "y"].includes(choice(["x", "y"])));

// 주입 상태는 넘긴 함수 그대로다.
const injected = () => 7;
assert.equal(
  createRandomState(undefined, { source: injected }).source,
  injected,
);

// 검증은 crypto 상태와 무관하게 RangeError다.
assert.throws(() => createRandomState(1, { source: () => 0 }), RangeError);
assert.throws(() => createRandomState(undefined, { foo: 1 }), RangeError);
assert.throws(() => createRandomState(undefined, { source: 1 }), RangeError);
assert.throws(() => createRandomState(null), RangeError);
assert.throws(() => createRandomState(1.5), RangeError);
assert.throws(() => state.int(9, 0), RangeError);

// seed 없는 상태는 생성까지는 어느 crypto 상태에서도 예외가 없다.
const fresh = createRandomState();
assert.equal(typeof fresh.source, "function");

if (mode === "present") {
  const roll = rand.int(1, 6);
  assert.ok(Number.isInteger(roll) && roll >= 1 && roll <= 6);
  const values = new Set(Array.from({ length: 32 }, () => rand.float()));
  assert.ok(values.size > 1);
  const unit = fresh.float();
  assert.ok(unit >= 0 && unit < 1);
} else {
  // 첫 word 호출이 fail-closed다. 재시도도 같은 오류다.
  failsClosed(() => fresh.int(1, 6));
  failsClosed(() => fresh.float());
  failsClosed(() => rand.int(1, 6));
  failsClosed(() => rand.int(1, 6));
}
