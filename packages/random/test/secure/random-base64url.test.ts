/**
 * `randomBase64url`의 공개 계약을 검증한다.
 * `byteLength`는 인코딩 전 엔트로피 바이트 수이고 결과는 padding 없는 base64url이며 길이가 `ceil(byteLength * 4 / 3)`이다.
 * 인자 검증(`RangeError`)이 환경 확인보다 먼저다. `undefined`만 기본값 32로 대체된다.
 * 인코더 자체(RFC 4648 벡터 포함)는 `encoding.test.ts`가 검증한다.
 *
 * 이 파일은 `describe`를 쓰지 않는다(`uniform-int.test.ts` 머리말 참고). 분류는 제목 접두어로 한다.
 */
import { expect, expectTypeOf, it } from "vitest";
import { randomBase64url } from "../../src/secure/index.js";
import { captureThrown } from "../helpers/capture-thrown.js";
import { installCryptoStub } from "../helpers/crypto-stub.js";
import { trapMathRandom } from "../helpers/math-random-trap.js";
import { firstMismatch, sequentialFill } from "../helpers/sequential-fill.js";

/** `RangeError`로 거부해야 하는 `byteLength`. `undefined`는 기본값이 있어 유효하므로 넣지 않는다. */
const invalidByteLengths: [label: string, value: unknown][] = [
  ["0", 0],
  ["음수", -1],
  ["소수", 1.5],
  ["NaN", Number.NaN],
  ["Infinity", Number.POSITIVE_INFINITY],
  ["숫자 문자열", "32"],
  ["null", null],
  ["객체", {}],
  ["boolean", true],
  ["bigint", 32n],
  ["상한 초과(2^20 + 1)", 1_048_577],
  ["safe integer 초과", 2 ** 53],
];

it("시그니처가 (byteLength?: number) => string이다", () => {
  expectTypeOf(randomBase64url).toEqualTypeOf<
    (byteLength?: number) => string
  >();
});

it("기본값 32바이트는 base64url 43자다", () => {
  const stub = installCryptoStub();

  expect(randomBase64url()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(stub.calls).toEqual([32]);
});

it("undefined를 명시해도 기본값 32를 쓴다", () => {
  installCryptoStub();

  expect(randomBase64url(undefined)).toMatch(/^[A-Za-z0-9_-]{43}$/);
});

it("바이트를 padding 없는 base64url로 인코딩한다", () => {
  // 00 0f ff ab → 표준 base64 "AA//qw==" → base64url "AA__qw"
  installCryptoStub({ fill: (view) => view.set([0x00, 0x0f, 0xff, 0xab]) });

  expect(randomBase64url(4)).toBe("AA__qw");
});

const lengthCases: [byteLength: number, chars: number][] = [
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 6],
  [31, 42],
  [32, 43],
  [33, 44],
];
for (const [byteLength, chars] of lengthCases) {
  it(`결과 길이는 ceil(byteLength * 4 / 3)이다: ${byteLength}바이트는 ${chars}자이고 =가 없다`, () => {
    installCryptoStub();

    const encoded = randomBase64url(byteLength);

    expect(encoded).toHaveLength(chars);
    expect(encoded).not.toContain("=");
  });
}

it("65,537바이트는 [65536, 1]로 나눠 채워 인코딩한다", () => {
  const stub = installCryptoStub({ fill: sequentialFill() });

  const encoded = randomBase64url(65_537);

  expect(stub.calls).toEqual([65_536, 1]);
  expect(firstMismatch(Buffer.from(encoded, "base64url"))).toBe(-1);
  expect(Buffer.from(encoded, "base64url")).toHaveLength(65_537);
});

it("상한 1,048,576바이트는 65,536바이트씩 16번 요청하고 1,398,102자다", () => {
  const stub = installCryptoStub({ fill: sequentialFill() });

  const encoded = randomBase64url(1_048_576);

  expect(stub.calls).toEqual(Array.from({ length: 16 }, () => 65_536));
  expect(encoded).toHaveLength(1_398_102);
  expect(firstMismatch(Buffer.from(encoded, "base64url"))).toBe(-1);
});

for (const [label, value] of invalidByteLengths) {
  it(`인자 검증: byteLength가 ${label}이면 환경과 무관하게 RangeError다`, () => {
    installCryptoStub({ mode: "absent" });
    expect(() => randomBase64url(value as number)).toThrow(RangeError);

    const stub = installCryptoStub();
    expect(() => randomBase64url(value as number)).toThrow(RangeError);
    expect(stub.calls).toEqual([]);
  });
}

it("getRandomValues가 던진 오류를 그대로 전파하고 다음 호출은 정상 동작한다", () => {
  const failure = new Error("난수 요청 실패");
  let count = 0;
  installCryptoStub({
    fill: (view) => {
      count += 1;
      if (count === 1) throw failure;
      view.fill(0xff);
    },
  });

  expect(captureThrown(() => randomBase64url(3))).toBe(failure);
  expect(randomBase64url(3)).toBe("____");
});

it("Math.random을 호출하지 않는다", () => {
  const trap = trapMathRandom();
  installCryptoStub();

  randomBase64url();

  expect(trap).not.toHaveBeenCalled();
});
