/**
 * `createCounterIdFactory`의 공개 계약을 검증한다. 결과값이 계약이므로 고정 벡터를 그대로 비교한다.
 * 출력은 `[prefix][separator]` + (`value.toString(radix)`를 `pad` 자리까지 `0`으로 왼쪽 채우고 `case`에 따라 대문자화한 문자열)이다.
 * 순환 규칙(wrap, `step`, `peek`, `reset`)은 순환 ID와 같고 `cyclic.test.ts`가 자세히 검증하므로 여기서는 인코딩을 지나는지만 본다.
 * `Number.prototype.toString(radix)`가 safe integer에서 정확한 자릿수를 낸다는 전제는 `BigInt` 결과와 대조해 감시한다.
 *
 * 이 파일은 `describe`를 쓰지 않는다. `counter.ts`가 mutation 대상이라서다(TRP-004). 분류는 제목 접두어로 한다.
 */
import { expect, it } from "vitest";
import {
  createCounterIdFactory,
  type CounterIdGenerator,
  type CounterIdOptions,
} from "../../src/id/counter.js";
import { installCryptoStub, type CryptoMode } from "../helpers/crypto-stub.js";
import { trapMathRandom } from "../helpers/math-random-trap.js";

const MAX = Number.MAX_SAFE_INTEGER;

/** 고정 벡터. [제목, 옵션, 순서대로의 호출 결과]. 값 자체가 계약이다. */
const vectors: [string, CounterIdOptions | undefined, string[]][] = [
  ["옵션 없음", undefined, ["0", "1", "2"]],
  ["빈 옵션", {}, ["0", "1"]],
  [
    "접두사 + base36 (Blockly 형태)",
    { prefix: "blockly", separator: "-", radix: 36 },
    ["blockly-0", "blockly-1"],
  ],
  ["36진법 자리 올림", { radix: 36, start: 1295 }, ["zz", "100"]],
  ["36진법 대문자", { radix: 36, case: "upper", start: 35 }, ["Z", "10"]],
  ["16진법 소문자", { radix: 16, start: 255 }, ["ff", "100"]],
  ["16진법 대문자", { radix: 16, case: "upper", start: 255 }, ["FF"]],
  ["2진법 패딩", { radix: 2, pad: 8, start: 5 }, ["00000101", "00000110"]],
  ["패딩은 자르지 않는다", { pad: 3, start: 1234 }, ["1234"]],
  [
    "접두사·패딩·wrap",
    { prefix: "ord", max: 999, pad: 3, start: 999 },
    ["ord_999", "ord_000"],
  ],
  ["빈 구분자", { prefix: "a", separator: "" }, ["a0", "a1"]],
  ["min이 양수면 min에서 시작", { min: 5 }, ["5", "6"]],
  [
    "기본 max에서 wrap(36진법)",
    { radix: 36, start: MAX - 1 },
    ["2gosa7pa2gu", "0"],
  ],
  [
    "기본 max의 2진법은 53자리",
    { radix: 2, start: MAX - 1 },
    ["1".repeat(52) + "0"],
  ],
  [
    "패딩 + 대문자",
    { radix: 36, pad: 11, case: "upper", start: 4294967295 },
    ["00001Z141Z3"],
  ],
  [
    "대문자는 숫자 부분에만 적용된다(접두사·구분자는 그대로)",
    {
      prefix: "ord",
      separator: "-",
      radix: 16,
      case: "upper",
      pad: 4,
      start: 255,
    },
    ["ord-00FF", "ord-0100"],
  ],
  [
    "min이 1이면 1에서 시작하고 max 다음은 min이다",
    { min: 1, max: 3 },
    ["1", "2", "3", "1"],
  ],
  [
    "음수 step은 기본 max로 wrap",
    { prefix: "p", step: -1 },
    ["p_0", "p_9007199254740990"],
  ],
  ["패딩 64", { radix: 2, pad: 64 }, ["0".repeat(64), "0".repeat(63) + "1"]],
];

for (const [title, options, expected] of vectors) {
  it(`counter 벡터: ${title}`, () => {
    const next = createCounterIdFactory(options);
    expect(expected.map(() => next())).toEqual(expected);
  });
}

for (let radix = 2; radix <= 36; radix += 1) {
  it(`counter 진법 ${radix}: MAX_SAFE_INTEGER - 1과 0의 자릿수가 BigInt와 같다`, () => {
    const next = createCounterIdFactory({ radix, start: MAX - 1 });
    expect(next()).toBe(BigInt(MAX - 1).toString(radix));
    expect(next()).toBe("0");
  });
}

it("counter 상태: peek는 인코딩된 다음 값이고 이동하지 않는다", () => {
  const next = createCounterIdFactory({
    prefix: "n",
    radix: 16,
    pad: 2,
    start: 254,
  });
  expect(next.peek()).toBe("n_fe");
  expect(next()).toBe("n_fe");
  expect(next.peek()).toBe("n_ff");
});

it("counter 상태: peek는 호출과 같은 접두사·패딩·대소문자로 인코딩한다", () => {
  const next = createCounterIdFactory({
    prefix: "n",
    radix: 16,
    case: "upper",
    pad: 4,
    start: 255,
  });
  expect(next.peek()).toBe("n_00FF");
  expect(next()).toBe("n_00FF");
  expect(next.peek()).toBe("n_0100");
});

it("counter 상태: reset()은 생성 시 시작값으로, reset(값)은 그 값으로 간다", () => {
  const next = createCounterIdFactory({
    prefix: "blockly",
    separator: "-",
    radix: 36,
  });
  expect(next()).toBe("blockly-0");
  next.reset(35);
  expect([next(), next()]).toEqual(["blockly-z", "blockly-10"]);
  next.reset();
  expect(next()).toBe("blockly-0");
});

it("counter 상태: reset의 범위 밖·타입 위반은 RangeError이고 상태는 그대로다", () => {
  const next = createCounterIdFactory({ max: 5 });
  expect(next()).toBe("0");
  for (const invalid of [6, -1, 1.5, "0", null, Number.NaN]) {
    expect(() => next.reset(invalid as never)).toThrow(RangeError);
    expect(next.peek()).toBe("1");
  }
});

it("counter 독립: 같은 옵션의 두 생성기는 상태를 공유하지 않는다", () => {
  const a = createCounterIdFactory({ prefix: "x" });
  const b = createCounterIdFactory({ prefix: "x" });
  expect([a(), a(), b(), a(), b()]).toEqual([
    "x_0",
    "x_1",
    "x_0",
    "x_2",
    "x_1",
  ]);
});

it("counter 독립: 같은 옵션 객체로 만든 두 생성기도 상태를 공유하지 않는다", () => {
  const options: CounterIdOptions = { prefix: "x" };
  const a = createCounterIdFactory(options);
  const b = createCounterIdFactory(options);
  expect([a(), a(), b(), a(), b()]).toEqual([
    "x_0",
    "x_1",
    "x_0",
    "x_2",
    "x_1",
  ]);
});

it("counter 독립: 한 생성기의 peek·reset은 다른 생성기의 상태를 바꾸지 않는다", () => {
  const a = createCounterIdFactory({ prefix: "a" });
  const b = createCounterIdFactory({ prefix: "b", radix: 16, pad: 2 });
  expect([a(), a()]).toEqual(["a_0", "a_1"]);
  b.reset(255);
  expect(a.peek()).toBe("a_2");
  expect(b.peek()).toBe("b_ff");
  a.reset(7);
  expect(b.peek()).toBe("b_ff");
  expect([a(), b()]).toEqual(["a_7", "b_ff"]);
});

it("counter 형태: 생성기는 함수이고 peek·reset을 own 속성으로 가지며 () => string에 대입된다", () => {
  const next = createCounterIdFactory();
  expect(typeof next).toBe("function");
  expect(Object.keys(next).sort()).toEqual(["peek", "reset"]);
  const plain: () => string = next;
  expect(plain()).toBe("0");
  const { peek, reset } = next;
  reset(9);
  expect(peek()).toBe("9");
  // @ts-expect-error 무작위 생성기 형태에는 peek·reset이 없다.
  const generator: CounterIdGenerator = (): string => "";
  expect(generator()).toBe("");
});

it("counter 검증: 잘못된 옵션은 생성 시점 RangeError다(옵션 검증을 거친다)", () => {
  for (const options of [
    null,
    { min: -1 },
    { radix: 37 },
    { pad: 65 },
    { separator: "-" },
    { case: "upper" },
    { preset: "uint8" },
    { max: MAX },
  ]) {
    expect(() => createCounterIdFactory(options as never)).toThrow(RangeError);
  }
});

it("counter 검증: 생성 뒤 옵션 객체를 바꿔도 생성기는 바뀌지 않는다", () => {
  const options: CounterIdOptions = { prefix: "a", radix: 16 };
  const next = createCounterIdFactory(options);
  options.prefix = "b";
  options.radix = 2;
  next.reset(255);
  expect(next()).toBe("a_ff");
});

const modes: CryptoMode[] = [
  "present",
  "absent",
  "empty",
  "not-function",
  "throwing-accessor",
];
for (const mode of modes) {
  it(`counter 환경: crypto ${mode} 상태에서 생성·호출·peek·reset이 동작하고 난수·Math.random을 요청하지 않는다`, () => {
    const stub = installCryptoStub({ mode });
    const trap = trapMathRandom();
    const next = createCounterIdFactory({
      prefix: "blockly",
      separator: "-",
      radix: 36,
      start: 35,
    });
    expect(next.peek()).toBe("blockly-z");
    expect([next(), next()]).toEqual(["blockly-z", "blockly-10"]);
    next.reset();
    expect(next()).toBe("blockly-z");
    expect(stub.calls).toEqual([]);
    expect(trap).not.toHaveBeenCalled();
  });
}
