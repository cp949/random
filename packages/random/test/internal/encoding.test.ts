/**
 * 내부 인코더 `toHex`, `toBase64url`을 검증한다.
 * RFC 4648 10절의 테스트 벡터(base64는 padding을 뗀 형태, base16은 소문자)와 Node `Buffer`의 결과를 참조로 삼는다.
 * `Buffer`는 이 테스트에서만 쓴다. 배포 코드는 `Buffer`와 `btoa`에 의존하지 않는다.
 *
 * 이 파일은 `describe`를 쓰지 않는다. 인코더가 mutation 대상 후보라서다. Stryker 10.0.0의 vitest 러너는
 * `describe` 안의 테스트를 mutant 실행 때 선택하지 못한다(`uniform-int.test.ts` 머리말 참고). 분류는 제목 접두어로 한다.
 */
import { expect, it, vi } from "vitest";
import { toBase64url, toHex } from "../../src/internal/encoding.js";
import { seededBytes } from "../helpers/seeded-bytes.js";

/** ASCII 문자열의 바이트. RFC 4648 벡터의 입력이 모두 ASCII다. */
const ascii = (text: string): Uint8Array => new TextEncoder().encode(text);

/** RFC 4648 10절의 base64 벡터. */
const base64Vectors: [input: string, base64: string][] = [
  ["", ""],
  ["f", "Zg=="],
  ["fo", "Zm8="],
  ["foo", "Zm9v"],
  ["foob", "Zm9vYg=="],
  ["fooba", "Zm9vYmE="],
  ["foobar", "Zm9vYmFy"],
];

/** RFC 4648 10절의 base16 벡터(원문은 대문자다). */
const base16Vectors: [input: string, base16: string][] = [
  ["", ""],
  ["f", "66"],
  ["fo", "666F"],
  ["foo", "666F6F"],
  ["foob", "666F6F62"],
  ["fooba", "666F6F6261"],
  ["foobar", "666F6F626172"],
];

for (const [input, base64] of base64Vectors) {
  it(`RFC 4648 벡터: base64url("${input}")은 padding을 뗀 "${base64.replace(/=+$/, "")}"다`, () => {
    expect(toBase64url(ascii(input))).toBe(base64.replace(/=+$/, ""));
  });
}

for (const [input, base16] of base16Vectors) {
  it(`RFC 4648 벡터: hex("${input}")는 소문자 "${base16.toLowerCase()}"다`, () => {
    expect(toHex(ascii(input))).toBe(base16.toLowerCase());
  });
}

it("hex: 빈 배열은 빈 문자열이다", () => {
  expect(toHex(new Uint8Array(0))).toBe("");
});

it("hex: 바이트마다 소문자 두 자리로 쓰고 앞의 0을 유지한다", () => {
  expect(toHex(Uint8Array.of(0x00, 0x01, 0x0f, 0x10, 0xab, 0xff))).toBe(
    "00010f10abff",
  );
});

it("hex: 0부터 255까지 모든 바이트 값을 Buffer와 같게 인코딩한다", () => {
  const all = Uint8Array.from({ length: 256 }, (_, i) => i);

  expect(toHex(all)).toBe(Buffer.from(all).toString("hex"));
});

it("base64url: 표준 base64의 +와 /를 -와 _로 바꾼다", () => {
  // 0xfbffbf는 6비트씩 62, 63, 62, 63이다. 표준 base64로는 "+/+/"다.
  expect(toBase64url(Uint8Array.of(0xfb, 0xff, 0xbf))).toBe("-_-_");
});

it("base64url: 0부터 255까지 모든 바이트 값을 Buffer와 같게 인코딩한다", () => {
  const all = Uint8Array.from({ length: 256 }, (_, i) => i);

  expect(toBase64url(all)).toBe(Buffer.from(all).toString("base64url"));
});

it("base64url: 3으로 나눈 나머지 1바이트는 2문자, 2바이트는 3문자이고 padding이 없다", () => {
  expect(toBase64url(Uint8Array.of(0xff))).toBe("_w");
  expect(toBase64url(Uint8Array.of(0xff, 0xff))).toBe("__8");
  expect(toBase64url(Uint8Array.of(0xff, 0xff, 0xff))).toBe("____");
});

it("base64url: 결과 길이는 길이 0~300에서 ceil(n * 4 / 3)이고 =가 없다", () => {
  for (let length = 0; length <= 300; length += 1) {
    const encoded = toBase64url(new Uint8Array(length));

    expect(encoded).toHaveLength(Math.ceil((length * 4) / 3));
    expect(encoded).not.toContain("=");
  }
});

it("길이 0~300에서 hex와 base64url이 Buffer와 같다", () => {
  const nextBytes = seededBytes(0x5eed1234);
  for (let length = 0; length <= 300; length += 1) {
    const bytes = nextBytes(length);

    expect(toHex(bytes)).toBe(Buffer.from(bytes).toString("hex"));
    expect(toBase64url(bytes)).toBe(Buffer.from(bytes).toString("base64url"));
  }
});

it("btoa에 의존하지 않는다", () => {
  vi.stubGlobal("btoa", () => {
    throw new Error("btoa를 호출하면 안 된다");
  });

  expect(toBase64url(Uint8Array.of(1, 2, 3, 4))).toBe("AQIDBA");
  expect(toHex(Uint8Array.of(1, 2, 3, 4))).toBe("01020304");
});

it("byteOffset이 있는 view는 자기 범위만 인코딩한다", () => {
  const backing = Uint8Array.of(9, 9, 1, 2, 3, 9);
  const view = backing.subarray(2, 5);

  expect(toHex(view)).toBe("010203");
  expect(toBase64url(view)).toBe("AQID");
});

it("입력 배열을 바꾸지 않는다", () => {
  const bytes = Uint8Array.of(1, 2, 3, 4, 5);

  toHex(bytes);
  toBase64url(bytes);

  expect([...bytes]).toEqual([1, 2, 3, 4, 5]);
});
