/**
 * `nanoid`의 공개 계약을 검증한다.
 * 문자 집합은 base64url 64자이고 바이트의 하위 6비트(`& 63`)로 문자를 고르므로 rejection이 없다.
 * 요청 바이트 수는 `length`와 정확히 같고 바이트는 앞에서부터 순서대로 문자가 된다.
 * 인자 검증(`RangeError`)은 crypto 접근보다 먼저이고, crypto를 쓸 수 없으면 `SecureRandomUnavailableError`다.
 * 주입한 고정 바이트의 결과(매핑과 소비 순서)는 이 파일이 구현 세부로서 고정하는 것이며 공개 계약이 아니다.
 *
 * 이 파일은 `describe`를 쓰지 않는다. `nanoid.ts`가 mutation 대상이라서다. Stryker 10.0.0의 vitest 러너는
 * `describe` 안의 테스트를 mutant 실행 때 선택하지 못한다(`uniform-int.test.ts` 머리말 참고). 분류는 제목 접두어로 한다.
 */
import { expect, expectTypeOf, it } from "vitest";
import { nanoid } from "../../src/id/index.js";
import { SecureRandomUnavailableError } from "../../src/internal/errors.js";
import { captureThrown } from "../helpers/capture-thrown.js";
import { chiSquare, chiSquareCritical } from "../helpers/chi-square.js";
import { installCryptoStub, type CryptoMode } from "../helpers/crypto-stub.js";
import { trapMathRandom } from "../helpers/math-random-trap.js";
import { seededBytes } from "../helpers/seeded-bytes.js";

/** base64url 문자 집합(RFC 4648 5절 순서). 구현의 상수를 가져오지 않고 여기에 다시 적어 상수 변경을 잡는다. */
const BASE64URL =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const unsupportedModes: CryptoMode[] = [
  "absent",
  "empty",
  "not-function",
  "throwing-accessor",
];

/** `RangeError`로 거부해야 하는 `length`. `undefined`는 기본값이 있어 유효하므로 넣지 않는다. */
const invalidLengths: [label: string, value: unknown][] = [
  ["0", 0],
  ["-0", -0],
  ["음수", -1],
  ["상한 초과(1025)", 1025],
  ["소수", 1.5],
  ["NaN", Number.NaN],
  ["Infinity", Number.POSITIVE_INFINITY],
  ["-Infinity", Number.NEGATIVE_INFINITY],
  ["숫자 문자열", "21"],
  ["null", null],
  ["객체", {}],
  ["valueOf를 가진 객체", { valueOf: () => 21 }],
  ["배열", [21]],
  ["boolean", true],
  ["bigint", 21n],
  ["safe integer 초과", 2 ** 53],
];

/** 주어진 바이트를 그대로 `getRandomValues`가 채우게 하는 fill. 요청보다 짧으면 나머지는 0이다. */
function fillWith(bytes: ArrayLike<number>): (view: Uint8Array) => void {
  return (view) => view.set(Array.from(bytes).slice(0, view.length));
}

it("시그니처가 (length?: number) => string이다", () => {
  expectTypeOf(nanoid).toEqualTypeOf<(length?: number) => string>();
});

it("기본 길이는 21이고 base64url 문자만 쓴다", () => {
  const stub = installCryptoStub();

  expect(nanoid()).toMatch(/^[A-Za-z0-9_-]{21}$/);
  expect(stub.calls).toEqual([21]);
});

it("undefined를 명시해도 기본 길이 21을 쓴다", () => {
  const stub = installCryptoStub();

  expect(nanoid(undefined)).toMatch(/^[A-Za-z0-9_-]{21}$/);
  expect(stub.calls).toEqual([21]);
});

for (const length of [1, 2, 21, 1024]) {
  it(`길이: ${length}는 정확히 ${length}자이고 바이트를 ${length}개만 한 번에 요청한다`, () => {
    const stub = installCryptoStub();

    const id = nanoid(length);

    expect(id).toHaveLength(length);
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(stub.calls).toEqual([length]);
  });
}

it("길이: 호출마다 새 바이트를 요청한다(호출 사이에 남는 상태가 없다)", () => {
  const stub = installCryptoStub();

  nanoid(8);
  nanoid(8);
  nanoid(3);

  expect(stub.calls).toEqual([8, 8, 3]);
});

it("매핑: 바이트 0~63은 base64url의 각 문자가 된다", () => {
  installCryptoStub({
    fill: fillWith(Array.from({ length: 64 }, (_, i) => i)),
  });

  expect(nanoid(64)).toBe(BASE64URL);
});

it("매핑: 바이트 0~255는 하위 6비트로 문자를 골라 64자 문자 집합이 네 번 반복된다", () => {
  installCryptoStub({
    fill: fillWith(Array.from({ length: 256 }, (_, i) => i)),
  });

  expect(nanoid(256)).toBe(BASE64URL.repeat(4));
});

it("매핑: 바이트 63은 마지막 문자 _이다", () => {
  installCryptoStub({ fill: fillWith([63]) });

  expect(nanoid(1)).toBe("_");
});

it("매핑: 바이트 64는 첫 문자 A로 되돌아간다(하위 6비트만 쓴다)", () => {
  installCryptoStub({ fill: fillWith([64]) });

  expect(nanoid(1)).toBe("A");
});

it("매핑: 바이트 255는 마지막 문자 _이다", () => {
  installCryptoStub({ fill: fillWith([255]) });

  expect(nanoid(1)).toBe("_");
});

it("매핑: 바이트 0은 첫 문자 A이고 바이트 192는 A로 되돌아간다", () => {
  installCryptoStub({ fill: fillWith([0, 192]) });

  expect(nanoid(2)).toBe("AA");
});

it("소비 순서: 바이트를 앞에서부터 한 글자씩 소비한다", () => {
  // 1 → B, 2 → C, 3 → D, 4 → E, 5 → F
  installCryptoStub({ fill: fillWith([1, 2, 3, 4, 5]) });

  expect(nanoid(5)).toBe("BCDEF");
});

it("소비 순서: 바이트 하나만 바꾸면 같은 위치의 문자 하나만 바뀐다", () => {
  // 10 → K, 20 → U, 30 → e, 31 → f, 40 → o
  installCryptoStub({ fill: fillWith([10, 20, 30, 40]) });
  const original = nanoid(4);
  installCryptoStub({ fill: fillWith([10, 20, 31, 40]) });
  const changed = nanoid(4);

  expect(original).toBe("KUeo");
  expect(changed).toBe("KUfo");
});

for (const [label, value] of invalidLengths) {
  it(`인자 검증: length가 ${label}이면 환경과 무관하게 RangeError다`, () => {
    // 인자 검증이 crypto 접근보다 먼저라 crypto가 없어도 같은 오류가 나야 한다.
    installCryptoStub({ mode: "absent" });
    expect(() => nanoid(value as number)).toThrow(RangeError);

    const stub = installCryptoStub();
    expect(() => nanoid(value as number)).toThrow(RangeError);
    expect(stub.calls).toEqual([]);
  });
}

for (const mode of unsupportedModes) {
  it(`인자 검증: crypto가 ${mode}여도 잘못된 length는 SecureRandomUnavailableError가 아니라 RangeError다`, () => {
    installCryptoStub({ mode });

    expect(captureThrown(() => nanoid(0))).toBeInstanceOf(RangeError);
    expect(captureThrown(() => nanoid(1025))).toBeInstanceOf(RangeError);
  });

  it(`crypto가 ${mode}이면 nanoid()는 SecureRandomUnavailableError를 던진다`, () => {
    installCryptoStub({ mode });

    expect(() => nanoid()).toThrow(SecureRandomUnavailableError);
    expect(() => nanoid(1)).toThrow(SecureRandomUnavailableError);
    expect(() => nanoid(1024)).toThrow(SecureRandomUnavailableError);
  });
}

it("crypto가 있으면(present) 예외 없이 id를 돌려준다", () => {
  installCryptoStub({ mode: "present" });

  expect(() => nanoid()).not.toThrow();
});

it("통계: 128,000자의 문자 빈도가 균등하다(카이제곱 df=63, p=0.001)", () => {
  // seed가 고정이라 결과는 재현된다. 하위 6비트 대신 다른 마스크를 쓰면 일부 문자만 나오거나 문자가 사라져 통계량이 크게 벗어난다.
  const nextBytes = seededBytes(0x1badc0de);
  installCryptoStub({ fill: (view) => view.set(nextBytes(view.length)) });
  let text = "";
  for (let call = 0; call < 125; call += 1) {
    text += nanoid(1024);
  }

  // 문자 집합 밖의 글자가 있으면 합계가 어긋난다.
  const observed = Array.from(BASE64URL, (char) => text.split(char).length - 1);
  expect(observed.reduce((sum, count) => sum + count, 0)).toBe(128_000);
  expect(chiSquare(observed)).toBeLessThan(chiSquareCritical(63));
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

  expect(captureThrown(() => nanoid(4))).toBe(failure);
  expect(nanoid(4)).toBe("AAAA");
});

it("Math.random을 호출하지 않는다", () => {
  const trap = trapMathRandom();
  installCryptoStub();

  nanoid();
  nanoid(1024);

  expect(trap).not.toHaveBeenCalled();
});
