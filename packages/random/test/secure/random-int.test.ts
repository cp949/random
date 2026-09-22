/**
 * `randomInt`의 공개 계약을 검증한다.
 * 양끝을 포함한 범위에서 균등하게 뽑고, 범위 크기가 1·2·2^32·2^32+1·2^53-1인 경계에서
 * 정확한 word 소비와 결과를 내며, 인자 검증(`RangeError`)이 환경 확인보다 먼저다.
 * rejection 경계의 세부는 `uniform-int.test.ts`가 검증하고, 여기서는 바이트를 word로 읽는 방식,
 * 32바이트 지역 버퍼의 재요청, 최솟값 오프셋을 공개 함수 수준에서 확인한다.
 *
 * 이 파일은 `describe`를 쓰지 않는다. 바이트 조립 코드가 mutation 대상일 수 있어서다.
 * Stryker 10.0.0의 vitest 러너는 `describe` 안의 테스트를 mutant 실행 때 선택하지 못한다
 * (`uniform-int.test.ts` 머리말 참고). 분류는 제목 접두어로 한다.
 */
import { expect, expectTypeOf, it } from "vitest";
import { randomInt } from "../../src/secure/index.js";
import { captureThrown } from "../helpers/capture-thrown.js";
import { installCryptoStub } from "../helpers/crypto-stub.js";
import { trapMathRandom } from "../helpers/math-random-trap.js";
import { wordFill, wordsForUint53 } from "../helpers/word-fill.js";

const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const TWO_POW_32 = 2 ** 32;

/** 인자 검증이 `RangeError`로 거부해야 하는 값. 타입이 틀린 값과 safe integer가 아닌 숫자를 함께 둔다. */
const invalidArguments: [label: string, value: unknown][] = [
  ["숫자 문자열", "1"],
  ["소수", 1.5],
  ["NaN", Number.NaN],
  ["Infinity", Number.POSITIVE_INFINITY],
  ["-Infinity", Number.NEGATIVE_INFINITY],
  ["객체", {}],
  ["배열", [1]],
  ["undefined", undefined],
  ["null", null],
  ["boolean", true],
  ["bigint", 1n],
  ["2^53(safe integer 초과)", 2 ** 53],
  ["-(2^53)", -(2 ** 53)],
];

/** 범위 크기(max - min + 1)가 2^53이라 표현할 수 없는 범위. */
const oversizeRanges: [min: number, max: number][] = [
  [0, MAX_SAFE],
  [-MAX_SAFE, 0],
  [-1, MAX_SAFE - 1],
  [-MAX_SAFE, MAX_SAFE],
];

/** n에 대한 53비트 경로의 `limit`(BigInt). */
function limit53(n: number): bigint {
  return 2n ** 53n - (2n ** 53n % BigInt(n));
}

it("시그니처가 (min: number, max: number) => number다", () => {
  expectTypeOf(randomInt).toEqualTypeOf<(min: number, max: number) => number>();
});

it("범위 크기 1: min을 돌려주고 getRandomValues를 호출하지 않는다", () => {
  const stub = installCryptoStub();

  expect(randomInt(5, 5)).toBe(5);
  expect(randomInt(-7, -7)).toBe(-7);
  expect(stub.calls).toEqual([]);
});

it("범위 크기 1: 0은 -0이 아니라 +0으로 돌려준다", () => {
  installCryptoStub();

  expect(Object.is(randomInt(0, 0), 0)).toBe(true);
  expect(Object.is(randomInt(-0, -0), 0)).toBe(true);
  expect(Object.is(randomInt(-0, 0), 0)).toBe(true);
});

it("범위 크기 2: 양끝이 모두 나오고 그 밖의 값은 나오지 않는다", () => {
  installCryptoStub();
  const seen = new Set<number>();

  for (let i = 0; i < 200; i += 1) seen.add(randomInt(0, 1));

  expect([...seen].sort((a, b) => a - b)).toEqual([0, 1]);
});

it("결과에 -0이 나오지 않는다", () => {
  installCryptoStub();

  for (let i = 0; i < 300; i += 1) {
    expect(Object.is(randomInt(-1, 1), -0)).toBe(false);
  }
});

it("바이트를 big-endian word로 읽는다", () => {
  // 0x0001e240 = 123456. little-endian으로 읽으면 다른 값(848)이 나온다.
  installCryptoStub({ fill: (view) => view.set([0x00, 0x01, 0xe2, 0x40]) });

  expect(randomInt(0, 999)).toBe(456);
});

const offsetCases: [min: number, max: number, expected: number][] = [
  [10, 1009, 466],
  [-500, 499, -44],
];
for (const [min, max, expected] of offsetCases) {
  it(`최솟값을 더해 돌려준다: [${min}, ${max}]에서 word 123456은 ${expected}다`, () => {
    installCryptoStub({ fill: (view) => view.set([0x00, 0x01, 0xe2, 0x40]) });

    expect(randomInt(min, max)).toBe(expected);
  });
}

it("호출마다 32바이트를 한 번 요청한다", () => {
  const stub = installCryptoStub();

  randomInt(0, 9);

  expect(stub.calls).toEqual([32]);
});

it("호출 사이에 남은 word를 재사용하지 않고 매번 새로 요청한다", () => {
  const stub = installCryptoStub();

  randomInt(0, 9);
  randomInt(0, 9);

  expect(stub.calls).toEqual([32, 32]);
});

it("첫 요청 안에서 word가 거부되면 같은 버퍼의 다음 word를 쓴다", () => {
  // n=3에서 4294967295는 거부되고 5 % 3 = 2가 수용된다.
  const stub = installCryptoStub({
    fill: wordFill([0xffffffff, 0xffffffff, 5]),
  });

  expect(randomInt(0, 2)).toBe(2);
  expect(stub.calls).toEqual([32]);
});

it("버퍼의 8번째 word에서 수용되면 새로 요청하지 않는다", () => {
  const rejected = Array.from({ length: 7 }, () => 0xffffffff);
  const stub = installCryptoStub({ fill: wordFill([...rejected, 4]) });

  expect(randomInt(0, 2)).toBe(1);
  expect(stub.calls).toEqual([32]);
});

it("8 word를 모두 거부하면 9번째 word를 위해 새로 32바이트를 요청한다", () => {
  const rejected = Array.from({ length: 8 }, () => 0xffffffff);
  const stub = installCryptoStub({ fill: wordFill([...rejected, 4]) });

  expect(randomInt(0, 2)).toBe(1);
  expect(stub.calls).toEqual([32, 32]);
});

it("범위 크기 2^32: 가장 큰 word도 수용한다", () => {
  installCryptoStub({ fill: wordFill([0xffffffff]) });

  expect(randomInt(0, TWO_POW_32 - 1)).toBe(TWO_POW_32 - 1);
});

it("범위 크기 2^32+1: 53비트 경로에서 limit-1을 수용해 max를 돌려준다", () => {
  const n = TWO_POW_32 + 1;
  installCryptoStub({ fill: wordFill(wordsForUint53(limit53(n) - 1n)) });

  expect(randomInt(0, TWO_POW_32)).toBe(TWO_POW_32);
});

it("범위 크기 2^32+1: limit은 거부하고 다음 word 쌍을 쓴다", () => {
  const n = TWO_POW_32 + 1;
  installCryptoStub({
    fill: wordFill([...wordsForUint53(limit53(n)), ...wordsForUint53(5n)]),
  });

  expect(randomInt(0, TWO_POW_32)).toBe(5);
});

it("범위 크기 2^53-1: 2^53-1은 거부하고 2^53-2는 수용해 max를 돌려준다", () => {
  installCryptoStub({
    fill: wordFill([
      ...wordsForUint53(2n ** 53n - 1n),
      ...wordsForUint53(2n ** 53n - 2n),
    ]),
  });

  expect(randomInt(0, MAX_SAFE - 1)).toBe(MAX_SAFE - 1);
});

it("범위 크기 2^53-1: 음수 범위의 min과 max가 정확하다", () => {
  installCryptoStub({ fill: wordFill([]) });
  expect(randomInt(-MAX_SAFE, -1)).toBe(-MAX_SAFE);

  installCryptoStub({ fill: wordFill(wordsForUint53(2n ** 53n - 2n)) });
  expect(randomInt(-MAX_SAFE, -1)).toBe(-1);
});

const rangeCases: [min: number, max: number][] = [
  [-5, 5],
  [10, 12],
  [0, 999],
  [1, 6],
  [-(2 ** 40), 2 ** 40],
  [-(2 ** 52), 2 ** 52 - 2],
  [-MAX_SAFE, -MAX_SAFE + 1],
  [MAX_SAFE - 1, MAX_SAFE],
];
for (const [min, max] of rangeCases) {
  it(`범위: [${min}, ${max}]의 결과는 항상 그 범위 안의 정수다`, () => {
    installCryptoStub();

    for (let i = 0; i < 300; i += 1) {
      const value = randomInt(min, max);

      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(min);
      expect(value).toBeLessThanOrEqual(max);
    }
  });
}

it("양끝 포함: randomInt(1, 6)에서 1부터 6까지 모두 나온다", () => {
  installCryptoStub();
  const seen = new Set<number>();

  for (let i = 0; i < 600; i += 1) seen.add(randomInt(1, 6));

  expect([...seen].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
});

it("통계: randomInt(0, 9)의 자릿수 빈도가 균등하다(카이제곱 df=9, p=0.001)", () => {
  installCryptoStub();
  const draws = 20_000;
  const counts = Array.from({ length: 10 }, () => 0);

  for (let i = 0; i < draws; i += 1) {
    const digit = randomInt(0, 9);
    counts[digit] = (counts[digit] ?? 0) + 1;
  }

  const expected = draws / 10;
  const chiSquare = counts.reduce(
    (sum, count) => sum + (count - expected) ** 2 / expected,
    0,
  );
  // 자유도 9의 유의수준 0.001 임계값은 27.877이다. seed가 고정이라 결과는 재현된다.
  expect(chiSquare).toBeLessThan(27.877);
});

for (const [label, value] of invalidArguments) {
  it(`인자 검증: min이 ${label}이면 환경과 무관하게 RangeError다`, () => {
    installCryptoStub({ mode: "absent" });
    expect(() => randomInt(value as number, 0)).toThrow(RangeError);

    const stub = installCryptoStub();
    expect(() => randomInt(value as number, 0)).toThrow(RangeError);
    expect(stub.calls).toEqual([]);
  });

  it(`인자 검증: max가 ${label}이면 환경과 무관하게 RangeError다`, () => {
    installCryptoStub({ mode: "absent" });
    expect(() => randomInt(0, value as number)).toThrow(RangeError);

    const stub = installCryptoStub();
    expect(() => randomInt(0, value as number)).toThrow(RangeError);
    expect(stub.calls).toEqual([]);
  });
}

it("인자 검증: min이 max보다 크면 환경과 무관하게 RangeError다", () => {
  installCryptoStub({ mode: "absent" });
  expect(() => randomInt(2, 1)).toThrow(RangeError);

  installCryptoStub();
  expect(() => randomInt(2, 1)).toThrow(RangeError);
  expect(() => randomInt(0, -1)).toThrow(RangeError);
});

for (const [min, max] of oversizeRanges) {
  it(`범위 크기 초과: [${min}, ${max}]는 환경과 무관하게 RangeError다`, () => {
    installCryptoStub({ mode: "absent" });
    expect(() => randomInt(min, max)).toThrow(RangeError);

    const stub = installCryptoStub();
    expect(() => randomInt(min, max)).toThrow(RangeError);
    expect(stub.calls).toEqual([]);
  });
}

it("범위 크기의 허용 상한 2^53-1은 통과한다", () => {
  installCryptoStub({ fill: wordFill([]) });

  expect(randomInt(0, MAX_SAFE - 1)).toBe(0);
});

it("getRandomValues가 던진 오류를 그대로 전파하고 다음 호출은 정상 동작한다", () => {
  const failure = new Error("난수 요청 실패");
  let count = 0;
  installCryptoStub({
    fill: (view) => {
      count += 1;
      if (count === 1) throw failure;
      view.fill(0);
    },
  });

  expect(captureThrown(() => randomInt(0, 9))).toBe(failure);
  expect(randomInt(0, 9)).toBe(0);
});

it("Math.random을 호출하지 않는다", () => {
  const trap = trapMathRandom();
  installCryptoStub();

  randomInt(0, 9);
  randomInt(0, 2 ** 40);

  expect(trap).not.toHaveBeenCalled();
});
