/**
 * `createCyclicIdFactory`와 순환 core의 공개 계약을 검증한다. 결과값이 계약이므로 고정 벡터를 그대로 비교한다.
 * - 호출은 현재 값을 돌려주고 `step`만큼 이동한다. `max` 다음은 `min`이다(음수 `step`은 반대 방향).
 * - `peek()`은 상태를 바꾸지 않는다. `reset()`은 생성 시 시작값으로, `reset(v)`는 `v`로 되돌린다. 실패한 `reset`은 상태를 바꾸지 않는다.
 * - 인스턴스는 상태를 공유하지 않는다. 생성과 호출은 crypto·시계·`Math.random`에 접근하지 않는다.
 * 옵션 읽기·검증 자체는 `cyclic-options.test.ts`가 맡고 이 파일은 그 검증을 거치는지만 본다.
 *
 * 이 파일은 `describe`를 쓰지 않는다. `cyclic.ts`가 mutation 대상이라서다. Stryker 10.0.0의 vitest 러너는
 * `describe` 안의 테스트를 mutant 실행 때 선택하지 못한다(`uniform-int.test.ts` 머리말 참고). 분류는 제목 접두어로 한다.
 */
import { expect, it } from "vitest";
import {
  createCyclicIdFactory,
  type CyclicIdGenerator,
  type CyclicIdOptions,
} from "../../src/id/cyclic.js";
import { installCryptoStub, type CryptoMode } from "../helpers/crypto-stub.js";
import { trapMathRandom } from "../helpers/math-random-trap.js";

const MAX = Number.MAX_SAFE_INTEGER;

/** 고정 벡터. [제목, 옵션, 순서대로의 호출 결과]. 값 자체가 계약이다. */
const vectors: [string, CyclicIdOptions, number[]][] = [
  ["int32 기본", { preset: "int32" }, [0, 1, 2]],
  [
    "int32 상한 경계",
    { preset: "int32", start: 2147483647 },
    [2147483647, -2147483648, -2147483647],
  ],
  ["int8 상한 경계", { preset: "int8", start: 127 }, [127, -128]],
  [
    "int8 하한 경계(음수 step)",
    { preset: "int8", start: -128, step: -1 },
    [-128, 127],
  ],
  ["uint8 상한 경계", { preset: "uint8", start: 255 }, [255, 0]],
  ["int16 상한 경계", { preset: "int16", start: 32767 }, [32767, -32768]],
  [
    "int16 하한 경계(음수 step)",
    { preset: "int16", start: -32768, step: -1 },
    [-32768, 32767],
  ],
  ["uint16 상한 경계", { preset: "uint16", start: 65535 }, [65535, 0]],
  [
    "uint32 상한 경계",
    { preset: "uint32", start: 4294967295 },
    [4294967295, 0],
  ],
  [
    "int32 하한 경계(음수 step)",
    { preset: "int32", start: -2147483648, step: -1 },
    [-2147483648, 2147483647],
  ],
  [
    "uint8 하한 경계(음수 step)",
    { preset: "uint8", start: 0, step: -1 },
    [0, 255],
  ],
  [
    "uint16 하한 경계(음수 step)",
    { preset: "uint16", start: 0, step: -1 },
    [0, 65535],
  ],
  [
    "uint32 하한 경계(음수 step)",
    { preset: "uint32", start: 0, step: -1 },
    [0, 4294967295],
  ],
  ["uint8 음수 step", { preset: "uint8", step: -1 }, [0, 255, 254]],
  ["step 2", { min: 0, max: 4, step: 2 }, [0, 2, 4, 1, 3, 0]],
  ["step이 크기보다 큼", { min: 0, max: 4, step: 7 }, [0, 2, 4, 1, 3]],
  ["음수 step이 크기보다 큼", { min: 0, max: 4, step: -7 }, [0, 3, 1, 4, 2]],
  ["부분 순환(gcd 2)", { min: 0, max: 3, step: 2 }, [0, 2, 0]],
  ["step이 크기의 배수", { min: 0, max: 5, step: 6 }, [0, 0]],
  ["단일 값 범위", { min: 7, max: 7 }, [7, 7]],
  ["min 기본 0", { max: 7 }, [0, 1]],
  [
    "0을 포함하지 않는 범위는 min에서 시작",
    { min: 10, max: 12 },
    [10, 11, 12, 10],
  ],
  ["0을 포함하는 범위는 0에서 시작", { min: -3, max: 3 }, [0, 1, 2, 3, -3]],
  [
    "범위 크기 MAX_SAFE_INTEGER(음수 범위)",
    { min: -MAX, max: -1 },
    [-MAX, -MAX + 1],
  ],
  [
    "범위 크기 MAX_SAFE_INTEGER, 음수 step",
    { min: 0, max: MAX - 1, step: -1 },
    [0, MAX - 1, MAX - 2],
  ],
  [
    "범위 크기 MAX_SAFE_INTEGER, 큰 step",
    { min: 0, max: MAX - 1, step: MAX - 1 },
    [0, MAX - 1, MAX - 2],
  ],
];

for (const [title, options, expected] of vectors) {
  it(`cyclic 벡터: ${title}`, () => {
    const next = createCyclicIdFactory(options);
    expect(expected.map(() => next())).toEqual(expected);
  });
}

it("cyclic 벡터: -0은 반환되지 않는다", () => {
  expect(Object.is(createCyclicIdFactory({ min: -0, max: 0 })(), 0)).toBe(true);
  expect(Object.is(createCyclicIdFactory({ max: 3, start: -0 })(), 0)).toBe(
    true,
  );
});

/** BigInt로 계산한 기준 수열. 중간값이 2^53을 넘어도 정확하다. */
function referenceSequence(
  min: number,
  max: number,
  start: number,
  step: number,
  count: number,
): number[] {
  const size = BigInt(max) - BigInt(min) + 1n;
  const stepN = ((BigInt(step) % size) + size) % size;
  let offset = BigInt(start) - BigInt(min);
  const values: number[] = [];
  for (let i = 0; i < count; i += 1) {
    values.push(Number(BigInt(min) + offset));
    offset = (offset + stepN) % size;
  }
  return values;
}

/** [제목, min, max, start, step]. 범위 크기나 step이 2^52를 넘어 `offset + stepN`이 safe integer를 벗어나기 쉬운 조합이다. */
const largeCases: [string, number, number, number, number][] = [
  ["크기 MAX_SAFE_INTEGER, step -1", 0, MAX - 1, 0, -1],
  ["크기 MAX_SAFE_INTEGER, step MAX_SAFE_INTEGER - 1", 0, MAX - 1, 0, MAX - 1],
  [
    "크기 MAX_SAFE_INTEGER, step -(MAX_SAFE_INTEGER - 1)",
    0,
    MAX - 1,
    MAX - 1,
    -(MAX - 1),
  ],
  ["크기 MAX_SAFE_INTEGER, step 2^52 + 1", 0, MAX - 1, 5, 2 ** 52 + 1],
  ["크기 MAX_SAFE_INTEGER, step이 크기의 배수", -MAX, -1, -3, MAX],
  [
    "0을 가로지르는 크기 MAX_SAFE_INTEGER",
    -(2 ** 52) + 1,
    2 ** 52 - 1,
    2 ** 52 - 1,
    2 ** 52 + 1,
  ],
  ["크기 2^52 + 1, 시작이 max", 0, 2 ** 52, 2 ** 52, 2 ** 52 - 1],
  ["MAX_SAFE_INTEGER 끝단의 작은 범위", MAX - 10, MAX, MAX, 3],
  ["-MAX_SAFE_INTEGER 끝단의 작은 범위, 음수 step", -MAX, -MAX + 9, -MAX, -7],
];

for (const [title, min, max, start, step] of largeCases) {
  it(`cyclic 대조: ${title}은 20회 호출과 peek가 BigInt 기준과 같다`, () => {
    const expected = referenceSequence(min, max, start, step, 20);
    const next = createCyclicIdFactory({ min, max, start, step });
    const actual: number[] = [];
    for (let i = 0; i < expected.length; i += 1) {
      expect(next.peek()).toBe(expected[i]);
      actual.push(next());
    }
    expect(actual).toEqual(expected);
  });
}

/** 유클리드 호제법. */
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

for (const size of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
  for (let step = -13; step <= 13; step += 1) {
    if (step === 0) continue;
    const period = size / gcd(Math.abs(step), size);
    it(`cyclic 순회: 크기 ${size}, step ${step}은 ${period}개 주기 안에서 중복이 없고 원위치로 돌아온다`, () => {
      const min = -5;
      const max = min + size - 1;
      const next = createCyclicIdFactory({ min, max, step });
      const first = next.peek();
      const seen = new Set<number>();
      for (let i = 0; i < period; i += 1) {
        const value = next();
        expect(value).toBeGreaterThanOrEqual(min);
        expect(value).toBeLessThanOrEqual(max);
        expect(seen.has(value)).toBe(false);
        seen.add(value);
      }
      expect(next.peek()).toBe(first);
      // 두 번째 주기도 같은 값을 같은 순서로 낸다.
      expect([...seen].map(() => next())).toEqual([...seen]);
    });
  }
}

it("cyclic 상태: peek는 다음 값을 돌려주고 이동하지 않는다", () => {
  const next = createCyclicIdFactory({ max: 5 });
  expect(next.peek()).toBe(0);
  expect(next.peek()).toBe(0);
  expect(next()).toBe(0);
  expect(next.peek()).toBe(1);
});

it("cyclic 상태: reset()은 생성 시 시작값으로 돌아간다(마지막 reset 인자가 아니다)", () => {
  const next = createCyclicIdFactory({ max: 5, start: 2 });
  expect([next(), next()]).toEqual([2, 3]);
  next.reset();
  expect(next.peek()).toBe(2);
  next.reset(4);
  expect(next()).toBe(4);
  next.reset();
  expect(next()).toBe(2);
  next.reset(undefined);
  expect(next()).toBe(2);
});

it("cyclic 상태: reset(값)은 그 값으로 이동하고 이후 순환은 같다", () => {
  const next = createCyclicIdFactory({ preset: "int32" });
  next.reset(2147483647);
  expect([next(), next()]).toEqual([2147483647, -2147483648]);
});

it("cyclic 상태: reset의 범위 밖·타입 위반은 RangeError이고 상태는 그대로다", () => {
  const next = createCyclicIdFactory({ max: 5 });
  expect(next()).toBe(0);
  for (const invalid of [6, -1, 1.5, "0", null, Number.NaN, 2 ** 53]) {
    expect(() => next.reset(invalid as never)).toThrow(RangeError);
    expect(next.peek()).toBe(1);
  }
});

it("cyclic 독립: 같은 옵션의 두 생성기는 상태를 공유하지 않는다", () => {
  const a = createCyclicIdFactory({ preset: "uint8" });
  const b = createCyclicIdFactory({ preset: "uint8" });
  expect([a(), a(), b(), a(), b()]).toEqual([0, 1, 0, 2, 1]);
  a.reset(100);
  expect([a(), b()]).toEqual([100, 2]);
});

it("cyclic 형태: 생성기는 함수이고 peek·reset을 own 속성으로 가지며 분리 호출해도 동작한다", () => {
  const next = createCyclicIdFactory({ max: 9, start: 4 });
  expect(typeof next).toBe("function");
  expect(Object.keys(next).sort()).toEqual(["peek", "reset"]);
  const { peek, reset } = next;
  expect(peek()).toBe(4);
  reset(7);
  expect(next()).toBe(7);
});

it("cyclic 형태: () => number에 대입되고 반대 방향은 대입되지 않는다", () => {
  const plain: () => number = createCyclicIdFactory({ max: 1 });
  expect(plain()).toBe(0);
  // @ts-expect-error 무작위 생성기 형태에는 peek·reset이 없다.
  const generator: CyclicIdGenerator = (): number => 0;
  expect(generator()).toBe(0);
});

it("cyclic 검증: 잘못된 옵션은 생성 시점 RangeError다(옵션 검증을 거친다)", () => {
  for (const options of [
    undefined,
    {},
    null,
    { preset: "int64" },
    { preset: "int32", max: 5 },
    { max: 5, step: 0 },
    { min: 5, max: 4 },
    { max: 5, typo: 1 },
  ]) {
    expect(() => createCyclicIdFactory(options as never)).toThrow(RangeError);
  }
});

it("cyclic 검증: 생성 뒤 옵션 객체를 바꿔도 생성기는 바뀌지 않는다", () => {
  const options: CyclicIdOptions = { max: 3, step: 1 };
  const next = createCyclicIdFactory(options);
  options.step = 2;
  options.max = 100;
  expect([next(), next(), next(), next(), next()]).toEqual([0, 1, 2, 3, 0]);
});

const modes: CryptoMode[] = [
  "present",
  "absent",
  "empty",
  "not-function",
  "throwing-accessor",
];
for (const mode of modes) {
  it(`cyclic 환경: crypto ${mode} 상태에서 생성·호출·peek·reset이 동작하고 난수·Math.random을 요청하지 않는다`, () => {
    const stub = installCryptoStub({ mode });
    const trap = trapMathRandom();
    const next = createCyclicIdFactory({ preset: "int32", start: 2147483647 });
    expect(next.peek()).toBe(2147483647);
    expect([next(), next()]).toEqual([2147483647, -2147483648]);
    next.reset();
    expect(next()).toBe(2147483647);
    expect(stub.calls).toEqual([]);
    expect(trap).not.toHaveBeenCalled();
  });
}
