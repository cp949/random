/**
 * `uuidv4`와 `createUuidv4Factory`의 공개 계약을 검증한다.
 * 결과는 RFC 9562 UUID v4 형식이다: 36자(대시 없는 형식은 32자), version 자리가 4, variant 자리가 8·9·a·b.
 * `crypto.randomUUID`를 쓰지 않고 난수원이 준 16바이트에서 version·variant 비트만 마스크로 고정한다.
 * 형식만 계약이다. 이 파일이 고정 바이트를 주입해 확인하는 값(어떤 source 바이트가 UUID의 어느 자리로 가는가)은
 * 구현 세부를 회귀로 감시하는 것이며 공개 계약이 아니다.
 * - 주입한 배열은 변경하지 않는다(복사한 뒤 마스크를 적용한다).
 * - 팩토리는 생성 시점에 옵션만 검증하고 crypto와 `randomBytes`에 접근하지 않는다. 오류는 첫 호출에서 난다.
 * - 일회성 함수는 옵션 검증(`RangeError`)이 crypto 접근보다 먼저다.
 * 형식 옵션(`dashes`, `case`)의 읽기·검증 자체는 `format-options.test.ts`가, `randomBytes`가 함수인지의 검증은
 * `validate.test.ts`가 맡고 이 파일은 두 함수가 그 검증을 실제로 거치는지를 본다.
 *
 * 이 파일은 `describe`를 쓰지 않는다. `v4.ts`가 mutation 대상이라서다. Stryker 10.0.0의 vitest 러너는
 * `describe` 안의 테스트를 mutant 실행 때 선택하지 못한다(`uniform-int.test.ts` 머리말 참고). 분류는 제목 접두어로 한다.
 */
import { runInNewContext } from "node:vm";
import { expect, expectTypeOf, it, vi } from "vitest";
import {
  isUuid,
  parseUuid,
  type UuidFormat,
} from "../../../src/id/uuid/format.js";
import {
  createUuidv4Factory,
  uuidv4,
  type Uuidv4FactoryOptions,
} from "../../../src/id/uuid/v4.js";
import { SecureRandomUnavailableError } from "../../../src/internal/errors.js";
import { captureThrown } from "../../helpers/capture-thrown.js";
import { chiSquare, chiSquareCritical } from "../../helpers/chi-square.js";
import {
  installCryptoStub,
  type CryptoMode,
} from "../../helpers/crypto-stub.js";
import { trapMathRandom } from "../../helpers/math-random-trap.js";
import { seededBytes } from "../../helpers/seeded-bytes.js";

/** 대시 있는 소문자 v4: version 자리가 4이고 variant 자리가 8·9·a·b다. */
const V4_DASHED =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** 대시 없는 소문자 v4. */
const V4_COMPACT = /^[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}$/;

const unsupportedModes: CryptoMode[] = [
  "absent",
  "empty",
  "not-function",
  "throwing-accessor",
];

/** `RangeError`로 거부해야 하는 옵션 값. `undefined`는 옵션 없음이라 유효하므로 넣지 않는다. */
const invalidFactoryOptions: [label: string, value: unknown][] = [
  ["알 수 없는 키", { typo: true }],
  ["알 수 없는 키(값이 undefined)", { typo: undefined }],
  ["now(v4 팩토리는 시계를 받지 않는다)", { now: () => 0 }],
  ["separator(다른 API의 옵션)", { separator: "-" }],
  ["null", null],
  ["배열", []],
  ["함수", () => ({})],
  ["문자열", "dashes"],
  ["숫자", 1],
  ["boolean", true],
  ["bigint", 1n],
  ["symbol", Symbol("options")],
  ["randomBytes가 null", { randomBytes: null }],
  ["randomBytes가 문자열", { randomBytes: "randomBytes" }],
  ["randomBytes가 숫자", { randomBytes: 16 }],
  ["randomBytes가 boolean", { randomBytes: true }],
  ["randomBytes가 빈 객체", { randomBytes: {} }],
  ["randomBytes가 배열", { randomBytes: [] }],
  ["randomBytes가 Uint8Array", { randomBytes: new Uint8Array(16) }],
  ["dashes가 null", { dashes: null }],
  ["dashes가 문자열", { dashes: "true" }],
  ["dashes가 숫자", { dashes: 1 }],
  ["case가 null", { case: null }],
  ["case의 대문자 표기", { case: "Upper" }],
  ["case가 mixed", { case: "mixed" }],
  ["case가 숫자", { case: 1 }],
];

/** 일회성 `uuidv4`의 `format`으로 `RangeError`를 던져야 하는 값. 난수원 주입과 시계는 팩토리만 받는다. */
const invalidOneOffFormats: [label: string, value: unknown][] = [
  ["null", null],
  ["배열", []],
  ["함수", () => ({})],
  ["문자열", "upper"],
  ["숫자", 1],
  ["알 수 없는 키", { typo: true }],
  [
    "randomBytes(일회성 함수는 난수원을 받지 않는다)",
    { randomBytes: () => filled(0) },
  ],
  ["now", { now: () => 0 }],
  ["dashes가 문자열", { dashes: "no" }],
  ["dashes가 null", { dashes: null }],
  ["case의 대문자 표기", { case: "Upper" }],
  ["case가 null", { case: null }],
];

/**
 * 주입 난수원이 돌려줘서는 안 되는 값. 요청 길이는 16이다.
 * `Uint16Array(8)`은 바이트 수만 16이고 `Uint8Array`가 아니다.
 */
const invalidSourceResults: [label: string, value: unknown][] = [
  ["빈 배열", new Uint8Array(0)],
  ["15바이트 배열", new Uint8Array(15)],
  ["17바이트 배열", new Uint8Array(17)],
  ["null", null],
  ["undefined", undefined],
  ["숫자 Array", Array.from({ length: 16 }, () => 0)],
  ["Uint16Array(16)", new Uint16Array(16)],
  ["Uint16Array(8)", new Uint16Array(8)],
  ["Uint8ClampedArray(16)", new Uint8ClampedArray(16)],
  ["문자열", "0123456789abcdef"],
  ["ArrayBuffer", new ArrayBuffer(16)],
  ["DataView", new DataView(new ArrayBuffer(16))],
  // 길이가 같아도 `instanceof Uint8Array`가 거짓이라서 거부한다.
  ["다른 realm의 Uint8Array(16)", runInNewContext("new Uint8Array(16)")],
];

/** 모든 바이트가 `value`이고 `overrides`의 위치만 다른 16바이트. */
function filled(
  value: number,
  overrides: Record<number, number> = {},
): Uint8Array {
  const bytes = new Uint8Array(16).fill(value);
  for (const [index, byte] of Object.entries(overrides)) {
    bytes[Number(index)] = byte;
  }
  return bytes;
}

/** 0x00, 0x01, ... 0x0f. 위치마다 값이 달라 자리 이동을 잡는다. */
const ASCENDING = Uint8Array.from({ length: 16 }, (_, i) => i);

/** `bytes`의 복사본을 돌려주는 난수원과 요청한 길이의 기록. */
function recordingSource(bytes: ArrayLike<number>): {
  source: (length: number) => Uint8Array;
  calls: number[];
} {
  const calls: number[] = [];
  return {
    calls,
    source: (length) => {
      calls.push(length);
      return Uint8Array.from(bytes);
    },
  };
}

/** `bytes`를 주입한 팩토리에서 UUID 하나를 만든다. */
function generate(bytes: ArrayLike<number>, format?: UuidFormat): string {
  return createUuidv4Factory({
    ...format,
    randomBytes: () => Uint8Array.from(bytes),
  })();
}

/** 주어진 바이트를 그대로 `getRandomValues`가 채우게 하는 fill. */
function fillWith(bytes: ArrayLike<number>): (view: Uint8Array) => void {
  return (view) => view.set(Array.from(bytes).slice(0, view.length));
}

/**
 * `globalThis.crypto` 접근 횟수를 세는 stub을 설치한다. 접근하면 `undefined`(미지원)를 돌려준다.
 * `installCryptoStub`이 원래 속성을 저장하고 테스트가 끝나면 복원하도록 예약한다.
 */
function countCryptoAccess(): { readonly count: number } {
  installCryptoStub({ mode: "absent" });
  let count = 0;
  Object.defineProperty(globalThis, "crypto", {
    get() {
      count += 1;
      return undefined;
    },
    configurable: true,
    enumerable: true,
  });
  return {
    get count() {
      return count;
    },
  };
}

it("시그니처: uuidv4는 (format?: UuidFormat) => string이다", () => {
  expectTypeOf(uuidv4).toEqualTypeOf<(format?: UuidFormat) => string>();
});

it("시그니처: createUuidv4Factory는 (options?: Uuidv4FactoryOptions) => () => string이다", () => {
  expectTypeOf(createUuidv4Factory).toEqualTypeOf<
    (options?: Uuidv4FactoryOptions) => () => string
  >();
});

it("형식: 모든 바이트가 0x00이면 00000000-0000-4000-8000-000000000000이다", () => {
  expect(generate(filled(0x00))).toBe("00000000-0000-4000-8000-000000000000");
});

it("형식: 모든 바이트가 0xff이면 ffffffff-ffff-4fff-bfff-ffffffffffff이다", () => {
  expect(generate(filled(0xff))).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
});

it("형식: 위치마다 다른 바이트는 앞에서부터 문자열의 왼쪽 두 자리씩 대응하고 6·8번 바이트만 마스크로 바뀐다", () => {
  // 0x06 → 0x46(version 4), 0x08 → 0x88(variant 10). 나머지 14바이트는 그대로다.
  expect(generate(ASCENDING)).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  expect(
    generate([
      0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef, 0xfe, 0xdc, 0xba, 0x98,
      0x76, 0x54, 0x32, 0x10,
    ]),
  ).toBe("01234567-89ab-4def-bedc-ba9876543210");
});

it("형식: 문자열을 다시 바이트로 파싱하면 마스크가 적용된 바이트와 같다(16바이트 왕복)", () => {
  const source = [
    0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef, 0xfe, 0xdc, 0xba, 0x98,
    0x76, 0x54, 0x32, 0x10,
  ];
  const masked = [...source];
  masked[6] = 0x4d;
  masked[8] = 0xbe;

  const bytes = parseUuid(generate(source));

  expect(bytes).toHaveLength(16);
  expect([...bytes]).toEqual(masked);
});

it("마스크: bytes[6]의 상위 4비트를 지운다(& 0x0f). 0x30은 0x40이 되고 0xff는 0x4f가 된다", () => {
  // 이 마스크를 빼면 0x30 | 0x40 = 0x70, 0xff | 0x40 = 0xff가 된다.
  expect(generate(filled(0x00, { 6: 0x30 }))).toBe(
    "00000000-0000-4000-8000-000000000000",
  );
  expect(generate(filled(0x00, { 6: 0xff }))).toBe(
    "00000000-0000-4f00-8000-000000000000",
  );
});

it("마스크: bytes[6]에 version 4를 세운다(| 0x40). 0x00은 0x40이 된다", () => {
  // 이 마스크를 빼면 0x00이 그대로 남아 version 자리가 0이다.
  expect(generate(filled(0x00)).charAt(14)).toBe("4");
  expect(generate(filled(0x0a, { 6: 0x00 }))).toBe(
    "0a0a0a0a-0a0a-400a-8a0a-0a0a0a0a0a0a",
  );
});

it("마스크: bytes[8]의 상위 2비트를 지운다(& 0x3f). 0x40은 0x80이 되고 0xc0은 0x80이, 0xff는 0xbf가 된다", () => {
  // 이 마스크를 빼면 0x40 | 0x80 = 0xc0, 0xc0 | 0x80 = 0xc0, 0xff | 0x80 = 0xff가 된다.
  expect(generate(filled(0x00, { 8: 0x40 }))).toBe(
    "00000000-0000-4000-8000-000000000000",
  );
  expect(generate(filled(0x00, { 8: 0xc0 }))).toBe(
    "00000000-0000-4000-8000-000000000000",
  );
  expect(generate(filled(0x00, { 8: 0xff }))).toBe(
    "00000000-0000-4000-bf00-000000000000",
  );
});

it("마스크: bytes[8]에 variant 10을 세운다(| 0x80). 0x00은 0x80이 되고 0x3f는 0xbf가 된다", () => {
  // 이 마스크를 빼면 0x00이 그대로 남고 0x3f도 0x3f로 남아 variant 자리가 0~3이다.
  expect(generate(filled(0x00)).charAt(19)).toBe("8");
  expect(generate(filled(0x00, { 8: 0x3f }))).toBe(
    "00000000-0000-4000-bf00-000000000000",
  );
});

it("마스크: bytes[6]과 bytes[8]의 256가지 값 모두에서 남는 비트를 보존하고 다른 바이트는 바꾸지 않는다", () => {
  const observed: number[][] = [];
  const expected: number[][] = [];
  for (let value = 0; value < 256; value += 1) {
    const source = Uint8Array.from({ length: 16 }, (_, i) =>
      i === 6 || i === 8 ? value : (i * 17 + 3) % 256,
    );
    const want = [...source];
    // 비트 연산이 아니라 값으로 쓴다: version 자리는 상위 4비트가 0100이고 하위 4비트는 원래 값이다.
    want[6] = 0x40 + (value % 16);
    // variant 자리는 상위 2비트가 10이고 하위 6비트는 원래 값이다.
    want[8] = 0x80 + (value % 64);
    expected.push(want);
    observed.push([...parseUuid(generate(source))]);
  }

  expect(observed).toEqual(expected);
});

it("형식: source 바이트의 한 비트만 바꾸면 고정되지 않은 비트는 결과를 바꾸고 마스크가 덮는 비트(6번의 상위 4비트, 8번의 상위 2비트)는 바꾸지 않는다", () => {
  const base = generate(ASCENDING);
  for (let index = 0; index < 16; index += 1) {
    for (let bit = 0; bit < 8; bit += 1) {
      const changed = Uint8Array.from(ASCENDING);
      changed[index] = changed[index]! ^ (1 << bit);
      const isMasked = (index === 6 && bit >= 4) || (index === 8 && bit >= 6);
      if (isMasked) {
        expect(generate(changed)).toBe(base);
      } else {
        expect(generate(changed)).not.toBe(base);
      }
    }
  }
});

it("요청: 바이트를 16개만 한 번에 요청하고 호출마다 새로 요청한다", () => {
  const { source, calls } = recordingSource(filled(0x00));
  const next = createUuidv4Factory({ randomBytes: source });

  next();
  expect(calls).toEqual([16]);
  next();
  next();
  expect(calls).toEqual([16, 16, 16]);
});

it("주입 배열: 반환한 배열을 변경하지 않는다", () => {
  const shared = filled(0xff);
  const next = createUuidv4Factory({ randomBytes: () => shared });

  next();

  expect([...shared]).toEqual(Array.from({ length: 16 }, () => 0xff));
});

it("주입 배열: 같은 배열을 두 번 재사용해도 내용이 그대로이고 두 번째 결과가 첫 번째와 같다", () => {
  const shared = Uint8Array.from({ length: 16 }, (_, i) => 0xf0 + i);
  const snapshot = [...shared];
  const next = createUuidv4Factory({ randomBytes: () => shared });

  const first = next();
  expect([...shared]).toEqual(snapshot);
  const second = next();
  expect([...shared]).toEqual(snapshot);

  expect(second).toBe(first);
  expect(first).toBe("f0f1f2f3-f4f5-46f7-b8f9-fafbfcfdfeff");
});

it("주입 배열: 모든 바이트가 0x00인 배열도 변경하지 않는다(| 0x40, | 0x80을 배열에 쓰지 않는다)", () => {
  const shared = filled(0x00);
  const next = createUuidv4Factory({ randomBytes: () => shared });

  next();

  // 주입 배열에 마스크를 바로 적용하면 6번은 0x40, 8번은 0x80으로 남는다.
  expect(shared[6]).toBe(0x00);
  expect(shared[8]).toBe(0x00);
});

it("주입 배열: byteOffset이 있는 view는 view의 16바이트만 쓴다", () => {
  const backing = new Uint8Array(20).fill(0xee);
  backing.set(ASCENDING, 2);
  const view = backing.subarray(2, 18);
  const snapshot = [...backing];
  const next = createUuidv4Factory({ randomBytes: () => view });

  expect(next()).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  expect([...backing]).toEqual(snapshot);
});

it("주입 배열: Uint8Array의 하위 클래스(Buffer)도 받는다", () => {
  const next = createUuidv4Factory({
    randomBytes: () => Buffer.from(ASCENDING),
  });

  expect(next()).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
});

it("형식 옵션: dashes를 false로 하면 대시 없는 32자다", () => {
  const uuid = generate(ASCENDING, { dashes: false });

  expect(uuid).toBe("000102030405460788090a0b0c0d0e0f");
  expect(uuid).toMatch(V4_COMPACT);
});

it("형식 옵션: case를 upper로 하면 대문자 hex다", () => {
  expect(generate(ASCENDING, { case: "upper" })).toBe(
    "00010203-0405-4607-8809-0A0B0C0D0E0F",
  );
});

it("형식 옵션: dashes false와 case upper를 함께 쓸 수 있다", () => {
  expect(generate(ASCENDING, { dashes: false, case: "upper" })).toBe(
    "000102030405460788090A0B0C0D0E0F",
  );
});

it("형식 옵션: 기본값을 명시해도 옵션을 생략한 것과 같다", () => {
  expect(generate(ASCENDING, { dashes: true, case: "lower" })).toBe(
    generate(ASCENDING),
  );
  expect(generate(ASCENDING, {})).toBe(generate(ASCENDING));
});

it("형식 옵션: 값이 undefined인 키는 생략과 같다", () => {
  const stub = installCryptoStub();
  const next = createUuidv4Factory({
    dashes: undefined,
    case: undefined,
    randomBytes: undefined,
  });

  expect(next()).toMatch(V4_DASHED);
  // randomBytes가 undefined이면 기본 난수원(crypto)을 쓴다.
  expect(stub.calls).toEqual([16]);
});

it("옵션: undefined나 빈 객체로도 팩토리를 만들 수 있고 기본 난수원을 쓴다", () => {
  const stub = installCryptoStub();

  expect(createUuidv4Factory()()).toMatch(V4_DASHED);
  expect(createUuidv4Factory(undefined)()).toMatch(V4_DASHED);
  expect(createUuidv4Factory({})()).toMatch(V4_DASHED);
  expect(stub.calls).toEqual([16, 16, 16]);
});

for (const [label, value] of invalidFactoryOptions) {
  it(`옵션: ${label}이면 팩토리 생성이 RangeError로 실패하고 crypto에 접근하지 않는다`, () => {
    const access = countCryptoAccess();

    expect(
      captureThrown(() => createUuidv4Factory(value as never)),
    ).toBeInstanceOf(RangeError);
    expect(access.count).toBe(0);
  });
}

it("옵션: 잘못된 옵션이 하나라도 있으면 유효한 randomBytes도 호출하지 않고 RangeError다", () => {
  const { source, calls } = recordingSource(filled(0x00));

  expect(() =>
    createUuidv4Factory({ randomBytes: source, dashes: "no" as never }),
  ).toThrow(RangeError);
  expect(() =>
    createUuidv4Factory({ randomBytes: source, case: "Upper" as never }),
  ).toThrow(RangeError);
  expect(() =>
    createUuidv4Factory({ randomBytes: source, typo: 1 } as never),
  ).toThrow(RangeError);
  expect(calls).toEqual([]);
});

it("생성: 팩토리를 만들 때 crypto에 접근하지 않고 randomBytes도 호출하지 않는다", () => {
  const access = countCryptoAccess();
  const { source, calls } = recordingSource(filled(0x00));

  createUuidv4Factory();
  createUuidv4Factory({ dashes: false, case: "upper" });
  createUuidv4Factory({ randomBytes: source });
  createUuidv4Factory({ randomBytes: source, dashes: false });

  expect(access.count).toBe(0);
  expect(calls).toEqual([]);
});

it("생성: 팩토리를 만든 뒤 호출 전에는 crypto에 접근하지 않고 첫 호출이 접근한다", () => {
  const access = countCryptoAccess();
  const next = createUuidv4Factory();
  expect(access.count).toBe(0);

  // crypto가 없으므로 첫 호출이 실패하지만, 접근은 이때 처음 일어난다.
  expect(() => next()).toThrow(SecureRandomUnavailableError);
  expect(access.count).toBeGreaterThan(0);
});

it("생성: randomBytes를 주입한 팩토리는 호출해도 crypto에 접근하지 않는다", () => {
  const access = countCryptoAccess();
  const next = createUuidv4Factory({ randomBytes: () => filled(0x00) });

  expect(next()).toBe("00000000-0000-4000-8000-000000000000");
  expect(next()).toBe("00000000-0000-4000-8000-000000000000");
  expect(access.count).toBe(0);
});

for (const mode of unsupportedModes) {
  it(`생성: crypto 상태(${mode})에서도 팩토리는 만들어지고 첫 호출이 SecureRandomUnavailableError다`, () => {
    installCryptoStub({ mode });

    const next = createUuidv4Factory();
    const next2 = createUuidv4Factory({ dashes: false });

    expect(captureThrown(next)).toBeInstanceOf(SecureRandomUnavailableError);
    expect(captureThrown(next2)).toBeInstanceOf(SecureRandomUnavailableError);
  });
}

it("생성: crypto 미지원으로 실패한 팩토리는 crypto가 생긴 뒤 같은 인스턴스가 정상 동작한다", () => {
  installCryptoStub({ mode: "absent" });
  const next = createUuidv4Factory({ case: "upper" });
  expect(() => next()).toThrow(SecureRandomUnavailableError);

  // 기본 난수원은 호출 시점에 찾으므로 팩토리를 다시 만들 필요가 없다.
  const stub = installCryptoStub({ fill: fillWith(filled(0xff)) });

  expect(next()).toBe("FFFFFFFF-FFFF-4FFF-BFFF-FFFFFFFFFFFF");
  expect(stub.calls).toEqual([16]);
});

it("기본 난수원: 팩토리 호출마다 crypto에서 16바이트를 요청한다", () => {
  const stub = installCryptoStub({ fill: fillWith(ASCENDING) });
  const next = createUuidv4Factory();

  expect(next()).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  next();
  expect(stub.calls).toEqual([16, 16]);
});

for (const [label, value] of invalidSourceResults) {
  it(`계약 위반: source 반환값(${label})은 첫 호출이 RangeError이고 재시도하지 않는다`, () => {
    const calls: number[] = [];
    const next = createUuidv4Factory({
      randomBytes: (length) => {
        calls.push(length);
        return value as Uint8Array;
      },
    });
    // 팩토리를 만들 때는 source를 보지 않으므로 여기까지 오류가 없다.
    expect(calls).toEqual([]);

    expect(captureThrown(next)).toBeInstanceOf(RangeError);
    expect(calls).toEqual([16]);
  });
}

it("계약 위반: 잘못된 결과를 돌려준 뒤에도 같은 생성기가 다음 호출에서 정상 동작한다", () => {
  let call = 0;
  const next = createUuidv4Factory({
    randomBytes: () => {
      call += 1;
      return call === 1 ? new Uint8Array(15) : filled(0x00);
    },
  });

  expect(() => next()).toThrow(RangeError);
  expect(next()).toBe("00000000-0000-4000-8000-000000000000");
});

it("계약 위반: source가 던진 오류는 감싸지 않고 같은 객체로 전파한다", () => {
  const failure = new Error("난수 요청 실패");
  const next = createUuidv4Factory({
    randomBytes: () => {
      throw failure;
    },
  });

  expect(captureThrown(next)).toBe(failure);
});

it("독립성: 팩토리 인스턴스는 옵션과 난수원을 서로 공유하지 않는다", () => {
  const a = recordingSource(filled(0x00));
  const b = recordingSource(filled(0xff));
  const nextA = createUuidv4Factory({ randomBytes: a.source, dashes: false });
  const nextB = createUuidv4Factory({ randomBytes: b.source, case: "upper" });

  expect(nextA()).toBe("00000000000040008000000000000000");
  expect(nextB()).toBe("FFFFFFFF-FFFF-4FFF-BFFF-FFFFFFFFFFFF");
  nextA();

  expect(a.calls).toEqual([16, 16]);
  expect(b.calls).toEqual([16]);
});

it("독립성: 같은 옵션으로 만든 두 팩토리는 각자 난수원을 부르고 서로의 결과에 영향이 없다", () => {
  const nextBytes = seededBytes(0xc0ffee);
  const first = createUuidv4Factory({ randomBytes: seededBytes(0xc0ffee) });
  const second = createUuidv4Factory({ randomBytes: seededBytes(0xc0ffee) });
  const expected = Array.from({ length: 3 }, () => generate(nextBytes(16)));

  // 첫 번째 팩토리를 먼저 소비해도 두 번째의 첫 결과는 그대로다.
  const fromFirst = [first(), first(), first()];
  const fromSecond = [second(), second(), second()];

  expect(fromFirst).toEqual(expected);
  expect(fromSecond).toEqual(expected);
});

it("독립성: 생성 뒤에 옵션 객체를 바꿔도 생성기는 생성 시점의 옵션을 쓴다", () => {
  const options: Uuidv4FactoryOptions = {
    dashes: true,
    case: "lower",
    randomBytes: () => filled(0xff),
  };
  const next = createUuidv4Factory(options);

  options.dashes = false;
  options.case = "upper";
  options.randomBytes = () => filled(0x00);

  expect(next()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
});

it("독립성: 호출마다 난수원의 다음 결과를 쓰고 이전 결과를 재사용하지 않는다", () => {
  const nextBytes = seededBytes(0x0badf00d);
  const next = createUuidv4Factory({ randomBytes: nextBytes });
  const second = seededBytes(0x0badf00d);
  const expected = [generate(second(16)), generate(second(16))];

  const results = [next(), next()];

  expect(results).toEqual(expected);
  expect(results[0]).not.toBe(results[1]);
});

it("형식: 만든 UUID는 isUuid(version 4)가 받고 parseUuid로 16바이트가 된다", () => {
  const next = createUuidv4Factory({ randomBytes: seededBytes(0x5eed) });

  for (let i = 0; i < 200; i += 1) {
    const uuid = next();
    expect(uuid).toMatch(V4_DASHED);
    expect(isUuid(uuid, { version: 4 })).toBe(true);
    expect(parseUuid(uuid)).toHaveLength(16);
  }
});

it("형식: 대시 없는 UUID는 isUuid(version 4, dashes false)가 받고 parseUuid로 16바이트가 된다", () => {
  const next = createUuidv4Factory({
    randomBytes: seededBytes(0x5eed),
    dashes: false,
    case: "upper",
  });

  for (let i = 0; i < 200; i += 1) {
    const uuid = next();
    expect(uuid).toMatch(/^[0-9A-F]{12}4[0-9A-F]{3}[89AB][0-9A-F]{15}$/);
    expect(isUuid(uuid, { version: 4, dashes: false })).toBe(true);
    expect(parseUuid(uuid)).toHaveLength(16);
  }
});

it("일회성: 기본 형식은 대시 있는 36자 소문자이고 crypto에서 바이트를 16개 요청한다", () => {
  const stub = installCryptoStub();

  const uuid = uuidv4();

  expect(uuid).toHaveLength(36);
  expect(uuid).toMatch(V4_DASHED);
  expect(stub.calls).toEqual([16]);
});

it("일회성: undefined를 명시해도 기본 형식이다", () => {
  installCryptoStub();

  expect(uuidv4(undefined)).toMatch(V4_DASHED);
  expect(uuidv4({})).toMatch(V4_DASHED);
});

it("일회성: 호출마다 바이트를 새로 요청한다", () => {
  const stub = installCryptoStub();

  const first = uuidv4();
  const second = uuidv4();

  expect(stub.calls).toEqual([16, 16]);
  expect(first).not.toBe(second);
});

it("일회성: crypto가 준 바이트에 version·variant 마스크를 적용한다", () => {
  installCryptoStub({ fill: fillWith(filled(0x00)) });
  expect(uuidv4()).toBe("00000000-0000-4000-8000-000000000000");

  installCryptoStub({ fill: fillWith(filled(0xff)) });
  expect(uuidv4()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");

  installCryptoStub({ fill: fillWith(ASCENDING) });
  expect(uuidv4()).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
});

it("일회성: 형식 옵션을 적용한다(대시 없음 32자, 대문자)", () => {
  installCryptoStub({ fill: fillWith(ASCENDING) });

  expect(uuidv4({ dashes: false })).toBe("000102030405460788090a0b0c0d0e0f");
  expect(uuidv4({ case: "upper" })).toBe(
    "00010203-0405-4607-8809-0A0B0C0D0E0F",
  );
  expect(uuidv4({ dashes: false, case: "upper" })).toBe(
    "000102030405460788090A0B0C0D0E0F",
  );
  expect(uuidv4({ dashes: true, case: "lower" })).toBe(
    "00010203-0405-4607-8809-0a0b0c0d0e0f",
  );
});

it("일회성: dashes를 false로 하면 결과가 32자이고 소문자 hex다", () => {
  installCryptoStub();

  const uuid = uuidv4({ dashes: false });

  expect(uuid).toHaveLength(32);
  expect(uuid).toMatch(V4_COMPACT);
});

for (const [label, value] of invalidOneOffFormats) {
  it(`일회성: format이 ${label}이면 RangeError이고 난수를 요청하지 않는다`, () => {
    const stub = installCryptoStub();

    expect(captureThrown(() => uuidv4(value as never))).toBeInstanceOf(
      RangeError,
    );
    expect(stub.calls).toEqual([]);
  });

  it(`일회성: format이 ${label}이면 crypto가 없는 환경에서도 SecureRandomUnavailableError가 아니라 RangeError다`, () => {
    installCryptoStub({ mode: "absent" });

    expect(captureThrown(() => uuidv4(value as never))).toBeInstanceOf(
      RangeError,
    );
  });
}

for (const mode of unsupportedModes) {
  it(`일회성: crypto가 ${mode}이면 uuidv4()는 SecureRandomUnavailableError를 던진다`, () => {
    installCryptoStub({ mode });

    expect(() => uuidv4()).toThrow(SecureRandomUnavailableError);
    expect(() => uuidv4({ dashes: false })).toThrow(
      SecureRandomUnavailableError,
    );
    expect(() => uuidv4({ case: "upper" })).toThrow(
      SecureRandomUnavailableError,
    );
  });
}

it("일회성: crypto가 있으면(present) UUID v4 형식으로 돌려준다", () => {
  installCryptoStub({ mode: "present" });

  expect(uuidv4()).toMatch(V4_DASHED);
});

it("일회성: getRandomValues가 던진 오류를 그대로 전파하고 다음 호출은 정상 동작한다", () => {
  const failure = new Error("난수 요청 실패");
  let count = 0;
  installCryptoStub({
    fill: (view) => {
      count += 1;
      if (count === 1) throw failure;
      view.fill(0);
    },
  });

  expect(captureThrown(() => uuidv4())).toBe(failure);
  expect(uuidv4()).toBe("00000000-0000-4000-8000-000000000000");
});

it("crypto.randomUUID를 호출하지 않고 getRandomValues의 바이트로 만든다", () => {
  installCryptoStub({ fill: fillWith(ASCENDING) });
  const randomUUID = vi.fn(() => "randomUUID가 호출되었다");
  Reflect.set(globalThis.crypto, "randomUUID", randomUUID);

  expect(uuidv4()).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  expect(createUuidv4Factory()()).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  expect(randomUUID).not.toHaveBeenCalled();
});

it("Math.random을 호출하지 않는다", () => {
  const trap = trapMathRandom();
  installCryptoStub();

  uuidv4();
  uuidv4({ dashes: false, case: "upper" });
  createUuidv4Factory()();
  createUuidv4Factory({ randomBytes: () => filled(0x00) })();

  expect(trap).not.toHaveBeenCalled();
});

it("통계: 고정되지 않은 hex 자리의 문자 빈도와 variant 자리의 분포가 균등하다(카이제곱 p=0.001)", () => {
  // seed가 고정이라 결과는 재현된다. 마스크를 잘못 걸어 일부 값이 나오지 않거나 치우치면 통계량이 임계값을 크게 넘는다.
  const count = 20_000;
  const next = createUuidv4Factory({
    randomBytes: seededBytes(0x1badc0de),
    dashes: false,
  });
  const hexCounts = Array.from({ length: 16 }, () => 0);
  const variantCounts = Array.from({ length: 4 }, () => 0);
  let versionFours = 0;
  for (let i = 0; i < count; i += 1) {
    const hex = next();
    for (let position = 0; position < hex.length; position += 1) {
      // 12번째(version)와 16번째(variant)는 고정 비트가 있어 따로 센다.
      if (position === 12 || position === 16) continue;
      hexCounts[Number.parseInt(hex.charAt(position), 16)]! += 1;
    }
    if (hex.charAt(12) === "4") versionFours += 1;
    variantCounts[Number.parseInt(hex.charAt(16), 16) - 8]! += 1;
  }

  expect(versionFours).toBe(count);
  // variant 자리는 8, 9, a, b 네 값만 나오므로 합계가 표본 수와 같아야 한다.
  expect(variantCounts.reduce((sum, n) => sum + n, 0)).toBe(count);
  expect(hexCounts.reduce((sum, n) => sum + n, 0)).toBe(count * 30);
  expect(chiSquare(hexCounts)).toBeLessThan(chiSquareCritical(15));
  expect(chiSquare(variantCounts)).toBeLessThan(chiSquareCritical(3));
});
