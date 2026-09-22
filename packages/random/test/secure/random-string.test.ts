/**
 * `randomString`의 공개 계약을 검증한다.
 * alphabet은 코드 포인트 단위이고 크기 2~256이며 중복과 짝 없는 서로게이트는 `RangeError`다.
 * `length`는 코드 포인트 수다. 인자 검증(`RangeError`)이 환경 확인보다 먼저다.
 * 균등성은 문자 빈도의 카이제곱 검정으로 확인한다. cutoff 경계의 정확한 동작은 `sampling.test.ts`가 검증한다.
 *
 * 이 파일은 `describe`를 쓰지 않는다. 통계 검정이 mutation 실행에서 cutoff 검사 제거를 잡아야 해서다.
 * Stryker 10.0.0의 vitest 러너는 `describe` 안의 테스트를 mutant 실행 때 선택하지 못한다
 * (`uniform-int.test.ts` 머리말 참고). 분류는 제목 접두어로 한다.
 */
import { expect, expectTypeOf, it } from "vitest";
import { randomString } from "../../src/secure/index.js";
import { captureThrown } from "../helpers/capture-thrown.js";
import { installCryptoStub } from "../helpers/crypto-stub.js";
import { trapMathRandom } from "../helpers/math-random-trap.js";

const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const DIGITS = "0123456789";

/** 서로 다른 BMP 문자 `count`개로 만든 alphabet. 서로게이트 영역은 피한다. */
const bmpAlphabet = (count: number): string =>
  Array.from({ length: count }, (_, i) => String.fromCharCode(0x100 + i)).join(
    "",
  );

/** 서로 다른 보충 평면 문자 `count`개로 만든 alphabet. */
const astralAlphabet = (count: number): string =>
  Array.from({ length: count }, (_, i) =>
    String.fromCodePoint(0x1f600 + i),
  ).join("");

/** `RangeError`로 거부해야 하는 alphabet. 문자열이 아닌 값을 함께 둔다. */
const invalidAlphabets: [label: string, value: unknown][] = [
  ["빈 문자열", ""],
  ["크기 1", "a"],
  ["크기 257", bmpAlphabet(257)],
  ["중복 문자", "aab"],
  ["짝 없는 앞 서로게이트", "a\ud83d"],
  ["짝 없는 뒤 서로게이트", "\ude00b"],
  ["undefined", undefined],
  ["null", null],
  ["숫자", 123],
  ["문자열 배열", ["a", "b"]],
  ["객체", {}],
];

/** `RangeError`로 거부해야 하는 length. */
const invalidLengths: [label: string, value: unknown][] = [
  ["0", 0],
  ["음수", -1],
  ["소수", 1.5],
  ["NaN", Number.NaN],
  ["숫자 문자열", "10"],
  ["undefined", undefined],
  ["null", null],
  ["객체", {}],
  ["상한 초과(2^20 + 1)", 1_048_577],
  ["safe integer 초과", 2 ** 53],
];

/** 문자 빈도의 카이제곱 통계량. alphabet의 모든 글자가 같은 확률이라는 가설에서 계산한다. */
function chiSquare(result: string, alphabet: string): number {
  const chars = Array.from(alphabet);
  const counts = new Map<string, number>();
  for (const char of Array.from(result)) {
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  // alphabet 밖의 글자가 있으면 합계가 어긋나 아래 기대와 다르게 된다.
  const total = Array.from(result).length;
  expect(chars.reduce((sum, char) => sum + (counts.get(char) ?? 0), 0)).toBe(
    total,
  );
  const expected = total / chars.length;
  return chars.reduce((sum, char) => {
    const observed = counts.get(char) ?? 0;
    return sum + (observed - expected) ** 2 / expected;
  }, 0);
}

it("시그니처가 (alphabet: string, length: number) => string이다", () => {
  expectTypeOf(randomString).toEqualTypeOf<
    (alphabet: string, length: number) => string
  >();
});

it("결과는 alphabet의 글자로만 이루어지고 길이가 length다", () => {
  installCryptoStub();

  expect(randomString(BASE62, 100)).toMatch(/^[A-Za-z0-9]{100}$/);
});

it("바이트를 alphabet의 글자 위치로 바꾼다", () => {
  // ceil(3 * 256 / 255) = 4바이트를 요청한다. 0, 1, 2는 각각 a, b, c다.
  installCryptoStub({ fill: (view) => view.set([0, 1, 2, 3]) });

  expect(randomString("abc", 3)).toBe("abc");
});

it("2의 거듭제곱 크기 alphabet은 length바이트만 요청한다", () => {
  const stub = installCryptoStub();

  randomString("01", 10);

  expect(stub.calls).toEqual([10]);
});

it("그 밖의 크기 alphabet의 첫 요청은 ceil(length * 256 / cutoff)바이트다", () => {
  // n=3이면 cutoff는 255이고 ceil(10 * 256 / 255) = 11이다.
  const stub = installCryptoStub();

  randomString("abc", 10);

  expect(stub.calls[0]).toBe(11);
});

it("이모지 alphabet의 결과는 올바른 UTF-16이고 코드 포인트 수가 length와 같다", () => {
  installCryptoStub();
  const alphabet = "😀😁😂😃";

  const result = randomString(alphabet, 20);

  expect(Array.from(result)).toHaveLength(20);
  expect(result).toHaveLength(40);
  expect(Array.from(result).every((char) => alphabet.includes(char))).toBe(
    true,
  );
  // 짝 없는 서로게이트가 있으면 encodeURIComponent가 URIError를 던진다.
  expect(() => encodeURIComponent(result)).not.toThrow();
});

it("한글 alphabet도 코드 포인트 단위로 뽑는다", () => {
  installCryptoStub();

  expect(randomString("가나다라마", 30)).toMatch(/^[가나다라마]{30}$/);
});

it("보충 평면 문자만 200개인 alphabet도 코드 포인트 수로 크기를 센다", () => {
  installCryptoStub();
  const alphabet = astralAlphabet(200);

  const result = randomString(alphabet, 50);

  expect(Array.from(result)).toHaveLength(50);
  expect(() => encodeURIComponent(result)).not.toThrow();
});

it("크기 256 alphabet은 바이트 값이 곧 글자 위치라 length바이트만 요청한다", () => {
  const stub = installCryptoStub();

  randomString(bmpAlphabet(256), 10);

  expect(stub.calls).toEqual([10]);
});

it("상한 length 1,048,576은 크기 2 alphabet에서 65,536바이트씩 16번 요청한다", () => {
  const stub = installCryptoStub();

  const result = randomString("ab", 1_048_576);

  expect(result).toHaveLength(1_048_576);
  expect(stub.calls).toEqual(Array.from({ length: 16 }, () => 65_536));
});

it("상한 length 1,048,576은 크기 62 alphabet에서도 정확히 length글자를 만든다", () => {
  installCryptoStub();

  const result = randomString(BASE62, 1_048_576);

  expect(result).toHaveLength(1_048_576);
  expect(result).toMatch(/^[A-Za-z0-9]+$/);
});

for (const [label, value] of invalidAlphabets) {
  it(`인자 검증: alphabet이 ${label}이면 환경과 무관하게 RangeError다`, () => {
    installCryptoStub({ mode: "absent" });
    expect(() => randomString(value as string, 10)).toThrow(RangeError);

    const stub = installCryptoStub();
    expect(() => randomString(value as string, 10)).toThrow(RangeError);
    expect(stub.calls).toEqual([]);
  });
}

for (const [label, value] of invalidLengths) {
  it(`인자 검증: length가 ${label}이면 환경과 무관하게 RangeError다`, () => {
    installCryptoStub({ mode: "absent" });
    expect(() => randomString("abc", value as number)).toThrow(RangeError);

    const stub = installCryptoStub();
    expect(() => randomString("abc", value as number)).toThrow(RangeError);
    expect(stub.calls).toEqual([]);
  });
}

/** 짝 없는 서로게이트 영역(U+D800~U+DFFF)의 양 끝. alphabet에 하나라도 있으면 거부해야 한다. */
const loneSurrogateBoundaries: [label: string, alphabet: string][] = [
  ["U+D800(첫 앞 서로게이트)", "a\ud800"],
  ["U+DBFF(마지막 앞 서로게이트)", "a\udbff"],
  ["U+DC00(첫 뒤 서로게이트)", "a\udc00"],
  ["U+DFFF(마지막 뒤 서로게이트)", "a\udfff"],
];

/** 서로게이트 영역 바로 밖의 BMP 문자. 서로게이트가 아니므로 alphabet으로 쓸 수 있어야 한다. */
const validBoundaryAlphabets: [label: string, alphabet: string][] = [
  ["U+D7FF(서로게이트 바로 앞)", "a퟿"],
  ["U+E000(서로게이트 바로 뒤)", "a"],
  ["전각 영문 U+FF21, U+FF22", "ＡＢ"],
  ["U+FFFF", "a￿"],
];

for (const [label, alphabet] of loneSurrogateBoundaries) {
  it(`서로게이트 경계: 짝 없는 ${label}가 있으면 RangeError다`, () => {
    installCryptoStub();

    expect(() => randomString(alphabet, 10)).toThrow(RangeError);
  });
}

for (const [label, alphabet] of validBoundaryAlphabets) {
  it(`서로게이트 경계: ${label}는 서로게이트가 아니므로 alphabet으로 쓸 수 있다`, () => {
    installCryptoStub();
    const chars = Array.from(alphabet);

    const result = randomString(alphabet, 20);

    expect(Array.from(result)).toHaveLength(20);
    expect(Array.from(result).every((char) => chars.includes(char))).toBe(true);
  });
}

it("인자 검증: alphabet과 length가 모두 틀려도 RangeError다", () => {
  installCryptoStub({ mode: "absent" });

  expect(() => randomString("a", 0)).toThrow(RangeError);
});

it("통계: n=62(base62) 100,000자의 문자 빈도가 균등하다(카이제곱 df=61, p=0.001)", () => {
  installCryptoStub();

  const statistic = chiSquare(randomString(BASE62, 100_000), BASE62);

  // 자유도 61의 유의수준 0.001 임계값은 약 100.9다. seed가 고정이라 결과는 재현된다.
  // cutoff 검사를 지우면 앞 8개 글자가 25% 더 나와 통계량이 약 675로 커진다(변이 실험 실측).
  expect(statistic).toBeLessThan(101);
});

it("통계: n=10(숫자) 400,000자의 문자 빈도가 균등하다(카이제곱 df=9, p=0.001)", () => {
  installCryptoStub();

  const statistic = chiSquare(randomString(DIGITS, 400_000), DIGITS);

  // 자유도 9의 유의수준 0.001 임계값은 27.877이다.
  // cutoff 검사를 지우면 0~5가 약 1.6% 더 나와 통계량이 약 186으로 커진다(변이 실험 실측).
  expect(statistic).toBeLessThan(27.877);
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

  expect(captureThrown(() => randomString("ab", 4))).toBe(failure);
  expect(randomString("ab", 4)).toBe("aaaa");
});

it("Math.random을 호출하지 않는다", () => {
  const trap = trapMathRandom();
  installCryptoStub();

  randomString(BASE62, 100);

  expect(trap).not.toHaveBeenCalled();
});
