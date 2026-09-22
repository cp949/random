/**
 * `uniformInt`의 rejection sampling을 검증한다.
 * 범위 밖 word를 거부하지 않는 편향은 2^-32 수준이라 통계 검정으로 잡을 수 없다.
 * 그래서 수용/거부 경계(`limit`)의 word를 직접 주입해 전후 동작을 확인하고,
 * 큰 n의 배정밀도 계산은 BigInt 참조 구현과 교차 검증한다.
 * `limit` 검사를 지우거나 word 조립 순서를 바꾸는 변경은 이 테스트가 실패시켜야 한다.
 *
 * 이 파일은 `describe`를 쓰지 않는다. Stryker 10.0.0의 vitest 러너는 mutant를 실행할 때 커버한 테스트 이름을
 * 공백으로 이어 `-t` 패턴을 만드는데, vitest 5는 `describe > it` 형태의 이름과 대조하므로 `describe` 안의
 * 테스트는 한 건도 선택되지 않고 모든 mutant가 살아남은 것으로 보고된다. 분류는 제목 접두어로 한다.
 */
import { expect, it } from "vitest";
import { uniformInt } from "../../src/internal/uniform-int.js";
import { seededBytes } from "../helpers/seeded-bytes.js";
import { wordsForUint53 } from "../helpers/word-fill.js";

const TWO_POW_32 = 2 ** 32;

/** 주입한 word를 순서대로 돌려주는 난수원. 다 쓰고 더 요청하면 예외를 던져 과소비를 드러낸다. */
function wordSource(words: number[]) {
  let index = 0;
  return {
    next: (): number => {
      const word = words[index];
      if (word === undefined) throw new Error("주입한 word를 모두 소비했다");
      index += 1;
      return word;
    },
    consumed: (): number => index,
  };
}

/** BigInt로 계산한 `uniformInt` 참조 구현. 수용한 값과 소비한 word 수를 함께 돌려준다. */
function referenceUniformInt(
  words: number[],
  n: number,
): { value: number; consumed: number } {
  const take = (i: number): bigint => {
    const word = words[i];
    if (word === undefined) throw new Error("참조 구현이 word를 모두 소비했다");
    return BigInt(word);
  };
  const big = BigInt(n);
  if (n === 1) return { value: 0, consumed: 0 };

  let index = 0;
  if (n <= TWO_POW_32) {
    const limit = 2n ** 32n - (2n ** 32n % big);
    for (;;) {
      const word = take(index);
      index += 1;
      if (word < limit) return { value: Number(word % big), consumed: index };
    }
  }
  const limit = 2n ** 53n - (2n ** 53n % big);
  for (;;) {
    const x = (take(index) >> 11n) * 2n ** 32n + take(index + 1);
    index += 2;
    if (x < limit) return { value: Number(x % big), consumed: index };
  }
}

/** n에 대한 `limit`(BigInt). 53비트 경로의 경계 word를 만들 때 쓴다. */
function limit53(n: number): bigint {
  return 2n ** 53n - (2n ** 53n % BigInt(n));
}

it("n이 1이면 word를 소비하지 않고 0을 돌려준다", () => {
  const source = wordSource([]);

  expect(uniformInt(source.next, 1)).toBe(0);
  expect(source.consumed()).toBe(0);
});

it("32비트 경로: n=3에서 4294967294는 수용해 2를 돌려준다", () => {
  const source = wordSource([4_294_967_294]);

  expect(uniformInt(source.next, 3)).toBe(2);
  expect(source.consumed()).toBe(1);
});

it("32비트 경로: n=3에서 4294967295는 limit과 같아 거부하고 다음 word를 쓴다", () => {
  const source = wordSource([4_294_967_295, 7]);

  expect(uniformInt(source.next, 3)).toBe(1);
  expect(source.consumed()).toBe(2);
});

it("32비트 경로: 거부가 연속되면 수용될 때까지 word를 계속 소비한다", () => {
  const source = wordSource([4_294_967_295, 4_294_967_295, 4_294_967_295, 5]);

  expect(uniformInt(source.next, 3)).toBe(2);
  expect(source.consumed()).toBe(4);
});

it("32비트 경로: n=10에서 limit(4294967290)은 거부하고 limit-1은 수용한다", () => {
  const source = wordSource([4_294_967_290, 4_294_967_289]);

  expect(uniformInt(source.next, 10)).toBe(9);
  expect(source.consumed()).toBe(2);
});

it("32비트 경로: n=10에서 limit 이상의 word는 모두 거부한다", () => {
  const rejected = [0, 1, 2, 3, 4, 5].map((i) => 4_294_967_290 + i);
  const source = wordSource([...rejected, 3]);

  expect(uniformInt(source.next, 10)).toBe(3);
  expect(source.consumed()).toBe(7);
});

const remainderCases: [n: number, word: number, expected: number][] = [
  [1000, 0, 0],
  [1000, 999, 999],
  [1000, 1000, 0],
  [1000, 123_456_789, 789],
  [7, 4_294_967_291, 6],
];
for (const [n, word, expected] of remainderCases) {
  it(`32비트 경로: n=${n}에서 word ${word}는 word % n인 ${expected}를 돌려준다`, () => {
    const source = wordSource([word]);

    expect(uniformInt(source.next, n)).toBe(expected);
    expect(source.consumed()).toBe(1);
  });
}

for (const n of [2, 65_536, 2 ** 31, TWO_POW_32]) {
  it(`32비트 경로: 2의 거듭제곱 n=${n}은 가장 큰 word도 수용한다`, () => {
    const source = wordSource([4_294_967_295]);

    expect(uniformInt(source.next, n)).toBe(n - 1);
    expect(source.consumed()).toBe(1);
  });
}

it("53비트 경로: n=2^32+1에서 limit-1은 수용해 n-1을 돌려준다", () => {
  const n = TWO_POW_32 + 1;
  const source = wordSource(wordsForUint53(limit53(n) - 1n));

  expect(uniformInt(source.next, n)).toBe(n - 1);
  expect(source.consumed()).toBe(2);
});

it("53비트 경로: n=2^32+1에서 limit은 거부하고 다음 word 쌍을 쓴다", () => {
  const n = TWO_POW_32 + 1;
  const source = wordSource([
    ...wordsForUint53(limit53(n)),
    ...wordsForUint53(5n),
  ]);

  expect(uniformInt(source.next, n)).toBe(5);
  expect(source.consumed()).toBe(4);
});

it("53비트 경로: n=2^53-1에서 가장 큰 값 2^53-1은 거부하고 2^53-2는 수용한다", () => {
  const n = Number.MAX_SAFE_INTEGER;
  const source = wordSource([
    ...wordsForUint53(2n ** 53n - 1n),
    ...wordsForUint53(2n ** 53n - 2n),
  ]);

  expect(uniformInt(source.next, n)).toBe(n - 1);
  expect(source.consumed()).toBe(4);
});

it("53비트 경로: 2의 거듭제곱 n=2^40은 모든 53비트 값을 수용한다", () => {
  const source = wordSource(wordsForUint53(2n ** 53n - 1n));

  expect(uniformInt(source.next, 2 ** 40)).toBe(2 ** 40 - 1);
  expect(source.consumed()).toBe(2);
});

it("53비트 경로: 첫 word가 상위 21비트, 둘째 word가 하위 32비트다", () => {
  // x = 5 * 2^32 + 7. 두 word를 바꿔 조립하면 다른 값이 된다.
  const source = wordSource([5 * 2048 + 0x7ff, 7]);

  expect(uniformInt(source.next, 2 ** 40)).toBe(5 * TWO_POW_32 + 7);
});

it("53비트 경로: 상위 word의 하위 11비트는 결과에 영향을 주지 않는다", () => {
  const low = uniformInt(wordSource([5 * 2048, 7]).next, 2 ** 40);
  const high = uniformInt(wordSource([5 * 2048 + 0x7ff, 7]).next, 2 ** 40);

  expect(high).toBe(low);
});

/** 교차 검증에 쓰는 seed 고정 word 스트림. */
const nextBytes = seededBytes(0x1234abcd);
const nextWord = (): number => new DataView(nextBytes(4).buffer).getUint32(0);
const nextUint53 = (): number => (nextWord() >>> 11) * TWO_POW_32 + nextWord();

/** 경계 근처 n과 seed 고정 난수로 만든 n. 거부 확률이 50%에 가까운 2^31+1, 2^52+1을 포함한다. */
const crossCheckSizes: number[] = [
  2,
  3,
  5,
  6,
  7,
  10,
  62,
  255,
  256,
  257,
  1000,
  65_535,
  65_536,
  65_537,
  2 ** 31 - 1,
  2 ** 31,
  2 ** 31 + 1,
  TWO_POW_32 - 1,
  TWO_POW_32,
  TWO_POW_32 + 1,
  TWO_POW_32 + 2,
  2 ** 40 + 7,
  2 ** 52,
  2 ** 52 + 1,
  Number.MAX_SAFE_INTEGER - 1,
  Number.MAX_SAFE_INTEGER,
];
for (let i = 0; i < 30; i += 1) {
  crossCheckSizes.push(2 + (nextWord() % (TWO_POW_32 - 1)));
}
for (let i = 0; i < 30; i += 1) {
  crossCheckSizes.push(
    TWO_POW_32 + 1 + (nextUint53() % (2 ** 53 - TWO_POW_32 - 1)),
  );
}

it("BigInt 교차 검증: 모든 n에서 수용한 값과 소비한 word 수가 참조 구현과 같다", () => {
  for (const n of crossCheckSizes) {
    for (let trial = 0; trial < 200; trial += 1) {
      // 거부가 연속되는 경우까지 대비해 넉넉히 준비한다.
      const words = Array.from({ length: 200 }, nextWord);
      const source = wordSource(words);

      const value = uniformInt(source.next, n);
      const expected = referenceUniformInt(words, n);

      expect({ n, value, consumed: source.consumed() }).toEqual({
        n,
        value: expected.value,
        consumed: expected.consumed,
      });
    }
  }
});

it("BigInt 교차 검증: n=2^31+1에서는 시도의 절반쯤이 거부되어 word를 더 소비한다", () => {
  // 교차 검증이 거부 분기를 실제로 지나가는지 확인한다(참조와 구현이 함께 거부를 건너뛰는 위장 방지).
  const trials = 1000;
  let consumed = 0;
  for (let trial = 0; trial < trials; trial += 1) {
    const source = wordSource(Array.from({ length: 200 }, nextWord));
    uniformInt(source.next, 2 ** 31 + 1);
    consumed += source.consumed();
  }

  expect(consumed).toBeGreaterThan(trials * 1.5);
});
