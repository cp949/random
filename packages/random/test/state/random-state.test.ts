/**
 * `createRandomState`를 검증한다(design spec 4절 ST-1~ST-9, 5절 OPT-1~OPT-4, 6절, 7.3 경계 정책).
 * crypto 상태는 `test/helpers/crypto-stub.ts`의 `installCryptoStub`으로 흉내 낸다. 바인딩 표가
 * mutation 대상 파일(`src/state/random-state.ts`)을 덮으므로 이 파일은 `describe`를 쓰지 않는다
 * (TRP-004, `internal/uniform-int.test.ts` 참고).
 */
import { beforeEach, expect, it, vi } from "vitest";
import {
  bool,
  choice,
  float,
  int,
  permutation,
  sample,
  shuffle,
  shuffleInPlace,
  sign,
  uniform,
  weightedChoice,
} from "../../src/index.js";
import {
  createXoshiro128Source,
  createXoshiro128SourceFromState,
} from "../../src/core/xoshiro128.js";
import { SecureRandomUnavailableError } from "../../src/internal/errors.js";
import { createRandomState } from "../../src/state/random-state.js";
import { installCryptoStub } from "../helpers/crypto-stub.js";
import { trapMathRandom } from "../helpers/math-random-trap.js";

beforeEach(() => {
  trapMathRandom();
});

const METHOD_NAMES = [
  "int",
  "float",
  "bool",
  "sign",
  "uniform",
  "choice",
  "shuffle",
  "shuffleInPlace",
  "sample",
  "permutation",
  "weightedChoice",
] as const;

type AnyFn = (...args: never[]) => unknown;

/** `args`는 호출마다 새로 만든다(`shuffleInPlace`가 배열을 바꾼다). `leaf`는 source를 첫 인자로 받는다. */
const bindings: {
  name: (typeof METHOD_NAMES)[number];
  args: () => unknown[];
  leaf: AnyFn;
}[] = [
  { name: "int", args: () => [1, 6], leaf: int },
  { name: "float", args: () => [], leaf: float },
  { name: "bool", args: () => [0.3], leaf: bool },
  { name: "sign", args: () => [], leaf: sign },
  { name: "uniform", args: () => [-1.5, 1.5], leaf: uniform },
  {
    name: "choice",
    args: () => [["a", "b", "c", "d"]],
    leaf: choice,
  },
  {
    name: "shuffle",
    args: () => [["a", "b", "c", "d"]],
    leaf: shuffle,
  },
  {
    name: "shuffleInPlace",
    args: () => [["a", "b", "c", "d"]],
    leaf: shuffleInPlace,
  },
  {
    name: "sample",
    args: () => [["a", "b", "c", "d"], 2],
    leaf: sample,
  },
  { name: "permutation", args: () => [5], leaf: permutation },
  {
    name: "weightedChoice",
    args: () => [
      ["a", "b", "c"],
      [1, 2, 3],
    ],
    leaf: weightedChoice,
  },
];

it("바인딩 표가 method 11개를 전부 다룬다", () => {
  expect(bindings.map((b) => b.name).sort()).toEqual([...METHOD_NAMES].sort());
});

for (const { name, args, leaf } of bindings) {
  it(`${name}: 같은 seed에서 method 결과가 leaf(source, ...)와 같고 word 소비도 같다`, () => {
    const seed = `bind-${name}`;
    const state = createRandomState(seed) as unknown as Record<
      string,
      (...a: unknown[]) => unknown
    >;
    const source = createXoshiro128Source(seed);

    const stateArgs = args();
    const leafArgs = args();
    const stateResult = state[name]!(...stateArgs);
    const leafResult = (leaf as (...a: unknown[]) => unknown)(
      source,
      ...leafArgs,
    );

    expect(stateResult).toEqual(leafResult);
    expect(state.source!()).toBe(source());

    if (name === "shuffleInPlace") {
      expect(stateResult).toBe(stateArgs[0]);
    }
  });
}

it("own key는 source와 method 11개뿐이다", () => {
  expect(Object.keys(createRandomState(1)).sort()).toEqual(
    ["source", ...METHOD_NAMES].sort(),
  );
});

it("같은 상태의 source와 method는 항상 같은 함수다", () => {
  const state = createRandomState(1);
  expect(state.source).toBe(state.source);
  expect(state.int).toBe(state.int);
  expect(state.choice).toBe(state.choice);
});

it("분해한 method도 동작한다", () => {
  const { int: roll, float: unit } = createRandomState(7);
  const source = createXoshiro128Source(7);

  expect(roll(1, 6)).toBe(int(source, 1, 6));
  expect(unit()).toBe(float(source));
});

it("seed 상태의 source는 createXoshiro128Source 결과와 같은 word 열이다", () => {
  const state = createRandomState(42);
  expect([state.source(), state.source(), state.source()]).toEqual([
    3514831625, 2416850046, 1824449730,
  ]);
});

it("seed 0의 float·bool·sign 열이 R4 golden vector와 같다", () => {
  const floatState = createRandomState(0);
  expect([floatState.float(), floatState.float()]).toEqual([
    0.09818795896944998, 0.8623031194841013,
  ]);
  const boolState = createRandomState(0);
  expect([
    boolState.bool(),
    boolState.bool(),
    boolState.bool(),
    boolState.bool(),
    boolState.bool(),
  ]).toEqual([false, true, true, true, false]);
  const signState = createRandomState(0);
  expect([
    signState.sign(),
    signState.sign(),
    signState.sign(),
    signState.sign(),
    signState.sign(),
  ]).toEqual([-1, 1, 1, 1, -1]);
});

it("주입 상태의 source는 넘긴 함수 그 자체이고 생성 시 호출하지 않는다", () => {
  const fn = vi.fn(() => 0);
  const state = createRandomState(undefined, { source: fn });

  expect(state.source).toBe(fn);
  expect(fn).not.toHaveBeenCalled();
});

it("주입 source가 던진 예외는 method가 그대로 전파한다", () => {
  const state = createRandomState(undefined, {
    source: () => {
      throw new Error("boom");
    },
  });

  expect(() => state.float()).toThrow("boom");
});

it("잘못된 인자면 leaf가 거부하고 source를 호출하지 않는다", () => {
  const spy = vi.fn(() => 0);
  const state = createRandomState(undefined, { source: spy });

  expect(() => state.int("a" as never, 1)).toThrow(RangeError);
  expect(spy).not.toHaveBeenCalled();
});

it("생성·source 접근·method 참조는 getRandomValues를 호출하지 않는다", () => {
  const stub = installCryptoStub();
  const state = createRandomState();
  void state.source;
  void state.int;

  expect(stub.calls).toEqual([]);
});

it("첫 word 호출에서 16바이트를 한 번 요청하고 이후 요청하지 않는다", () => {
  const stub = installCryptoStub();
  const state = createRandomState();

  const value = state.float();

  expect(stub.calls).toEqual([16]);
  expect(value).toBeGreaterThanOrEqual(0);
  expect(value).toBeLessThan(1);

  state.int(1, 6);
  state.choice([1, 2]);

  expect(stub.calls).toEqual([16]);
});

it("word 4개가 전부 0이면 다시 받는다", () => {
  let request = 0;
  const stub = installCryptoStub({
    fill: (view) => {
      view.fill(request === 0 ? 0 : 0x11);
      request += 1;
    },
  });
  const state = createRandomState();
  const first = state.float();

  expect(stub.calls).toEqual([16, 16]);
  const expected = createXoshiro128SourceFromState([
    0x11111111, 0x11111111, 0x11111111, 0x11111111,
  ]);
  expect(first).toBe(float(expected));
});

it("word 4개 중 일부만 0이면 다시 받지 않는다(all-zero만 재추출한다)", () => {
  const stub = installCryptoStub({
    fill: (view) => {
      view.fill(0x11);
      view.set([0, 0, 0, 0], 0);
    },
  });
  const state = createRandomState();
  const first = state.float();

  expect(stub.calls).toEqual([16]);
  const expected = createXoshiro128SourceFromState([
    0, 0x11111111, 0x11111111, 0x11111111,
  ]);
  expect(first).toBe(float(expected));
});

it("createRandomState(undefined, {})와 { source: undefined }도 seed 없는 상태다", () => {
  for (const options of [{}, { source: undefined }] as const) {
    const stub = installCryptoStub();
    const state = createRandomState(undefined, options);

    state.float();

    expect(stub.calls).toEqual([16]);
  }
});

const unsupportedModes = [
  "absent",
  "empty",
  "not-function",
  "throwing-accessor",
] as const;

for (const mode of unsupportedModes) {
  it(`crypto가 ${mode}면 생성·source 접근은 예외 없고 첫 word 호출이 SecureRandomUnavailableError다`, () => {
    installCryptoStub({ mode });
    const state = createRandomState();

    expect(typeof state.source).toBe("function");
    expect(() => state.int(1, 6)).toThrow(SecureRandomUnavailableError);
    expect(() => state.float()).toThrow(SecureRandomUnavailableError);
  });
}

it("실패 뒤 crypto가 복구되면 다음 호출이 다시 초기화한다", () => {
  installCryptoStub({ mode: "absent" });
  const state = createRandomState();

  expect(() => state.float()).toThrow(SecureRandomUnavailableError);

  const stub = installCryptoStub();
  state.float();

  expect(stub.calls).toEqual([16]);
});

it("seed 상태와 주입 상태는 crypto가 없어도 동작한다", () => {
  installCryptoStub({ mode: "absent" });

  expect(Number.isInteger(createRandomState(1).int(1, 6))).toBe(true);
  expect(
    Number.isInteger(
      createRandomState(undefined, { source: () => 0 }).int(1, 6),
    ),
  ).toBe(true);
});

const invalidCalls: [label: string, call: () => unknown][] = [
  ["seed와 source 동시", () => createRandomState(1, { source: () => 0 })],
  [
    "null seed와 source",
    () => createRandomState(null as never, { source: () => 0 }),
  ],
  ["null seed", () => createRandomState(null as never)],
  ["소수 seed", () => createRandomState(1.5)],
  ["NaN seed", () => createRandomState(Number.NaN)],
  ["Infinity seed", () => createRandomState(Number.POSITIVE_INFINITY)],
  ["boolean seed", () => createRandomState(true as never)],
  ["객체 seed", () => createRandomState({} as never)],
  ["null options", () => createRandomState(undefined, null as never)],
  ["배열 options", () => createRandomState(undefined, [] as never)],
  ["문자열 options", () => createRandomState(undefined, "x" as never)],
  ["함수 options", () => createRandomState(undefined, (() => 1) as never)],
  ["알 수 없는 키", () => createRandomState(undefined, { foo: 1 } as never)],
  [
    "값이 undefined인 알 수 없는 키",
    () => createRandomState(undefined, { foo: undefined } as never),
  ],
  ["숫자 source", () => createRandomState(undefined, { source: 1 as never })],
  [
    "null source",
    () => createRandomState(undefined, { source: null as never }),
  ],
];

for (const [label, call] of invalidCalls) {
  it(`${label}는 RangeError다`, () => {
    expect(call).toThrow(RangeError);
  });
}

it("seed와 source 충돌 메시지는 두 이름을 담는다", () => {
  expect(() => createRandomState(1, { source: () => 0 })).toThrow(
    /\bseed\b.*\bsource\b/,
  );
});

it("충돌·검증 실패 시 source를 호출하지 않는다", () => {
  const spy = vi.fn(() => 0);
  expect(() => createRandomState(1, { source: spy })).toThrow(RangeError);
  expect(spy).not.toHaveBeenCalled();
});

it("유효한 seed는 숫자·문자열·별칭 모두 받는다", () => {
  expect(createRandomState(-1).source()).toBe(
    createRandomState(0xffffffff).source(),
  );
  expect(createRandomState("hello").source()).toBe(2966572188);
});
