/**
 * 무작위 ID의 조립·호출 시점·충돌 회피 계약을 검증한다.
 * 고정 바이트의 기대 문자열은 회귀 검증이며 byte→문자 매핑 자체는 공개 계약이 아니다.
 * mutation 대상의 테스트 선택을 위해 describe 없이 최상위 it을 사용한다.
 */
import { expect, it, vi } from "vitest";
import * as id from "../../src/id/index.js";
import type {
  RandomIdFactoryOptions,
  RandomIdOptions,
} from "../../src/id/random-id-options.js";
import { captureThrown } from "../helpers/capture-thrown.js";
import { chiSquare, chiSquareCritical } from "../helpers/chi-square.js";
import { installCryptoStub, type CryptoMode } from "../helpers/crypto-stub.js";
import { fakeNow } from "../helpers/fake-now.js";
import { seededBytes } from "../helpers/seeded-bytes.js";

/** 각 요청을 0, 1, 2, ...로 채운다. 표의 기대값은 문자 표에서 직접 셌다. */
const ascending = (length: number): Uint8Array =>
  Uint8Array.from({ length }, (_, i) => i % 128);

const combinations: [string, RandomIdFactoryOptions, string, RegExp][] = [
  ["기본", {}, "ABCDEFGHIJKLMNOPQRSTU", /^[A-Za-z0-9_-]{21}$/],
  [
    "접두사",
    { prefix: "usr", length: 16 },
    "usr_ABCDEFGHIJKLMNOP",
    /^usr_[A-Za-z0-9_-]{16}$/,
  ],
  [
    "빈 구분자",
    { prefix: "usr", separator: "", length: 3 },
    "usrABC",
    /^usr[A-Z]{3}$/,
  ],
  [
    "시각",
    { timestamp: true, length: 3 },
    "00000000z_ABC",
    /^[0-9a-z]{9}_[A-Z]{3}$/,
  ],
  [
    "접두사와 시각",
    { prefix: "req", timestamp: true, length: 8 },
    "req_00000000z_ABCDEFGH",
    /^req_[0-9a-z]{9}_[A-Z]{8}$/,
  ],
  [
    "다른 구분자",
    { prefix: "p", timestamp: true, separator: ":", length: 2 },
    "p:00000000z:AB",
    /^p:[0-9a-z]{9}:[A-Z]{2}$/,
  ],
  [
    "짧은 마지막 그룹",
    { length: 5, group: 2 },
    "AB-CD-E",
    /^[A-Z]{2}-[A-Z]{2}-[A-Z]$/,
  ],
  ["같은 길이 그룹", { length: 3, group: 3 }, "ABC", /^[A-Z]{3}$/],
  [
    "한 글자 그룹",
    { length: 3, group: 1, groupSeparator: ":" },
    "A:B:C",
    /^A:B:C$/,
  ],
  [
    "빈 그룹 구분자",
    { length: 3, group: 1, groupSeparator: "" },
    "ABC",
    /^[A-Z]{3}$/,
  ],
  [
    "이모지 그룹",
    { alphabet: "😀🐈🚀", length: 5, group: 2 },
    "😀🐈-🚀😀-🐈",
    /^(?:😀|🐈|🚀){2}-(?:😀|🐈|🚀){2}-(?:😀|🐈|🚀)$/u,
  ],
  [
    "첫 글자 제한",
    { preset: "base62", startWithLetter: true, length: 10 },
    "A012345678",
    /^[A-Za-z][0-9A-Za-z]{9}$/,
  ],
  [
    "첫 글자만",
    { alphabet: "0A", startWithLetter: true, length: 1 },
    "A",
    /^A$/,
  ],
  [
    "접두사가 첫 글자 제한 충족",
    { prefix: "usr", preset: "digits", startWithLetter: true, length: 3 },
    "usr_012",
    /^usr_[0-9]{3}$/,
  ],
  [
    "base62",
    { preset: "base62", length: 12 },
    "0123456789AB",
    /^[0-9A-Za-z]{12}$/,
  ],
  [
    "base36",
    { preset: "base36", length: 12 },
    "0123456789ab",
    /^[0-9a-z]{12}$/,
  ],
  [
    "base36 대문자 시각",
    { preset: "base36", case: "upper", timestamp: true, length: 12 },
    "00000000z_0123456789AB",
    /^[0-9a-z]{9}_[0-9A-Z]{12}$/,
  ],
  ["숫자 6자리", { preset: "digits", length: 6 }, "012345", /^[0-9]{6}$/],
  [
    "가독성 그룹",
    { preset: "readable", length: 12, group: 4 },
    "ABCD-EFGH-JKLM",
    /^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){2}$/,
  ],
  [
    "가독성 소문자",
    { preset: "readable", case: "lower", length: 12 },
    "abcdefghjklm",
    /^[a-hj-np-z2-9]{12}$/,
  ],
  ["비트", { bits: 13 }, "ABC", /^[A-Z]{3}$/],
  [
    "첫 글자 보정 비트",
    { bits: 126, startWithLetter: true },
    "AABCDEFGHIJKLMNOPQRSTU",
    /^[A-Za-z][A-Za-z0-9_-]{21}$/,
  ],
  ["사용자 문자", { alphabet: "가나", length: 5 }, "가나가나가", /^[가나]{5}$/],
];

for (const [label, options, expected, pattern] of combinations) {
  it(`조립: ${label}의 고정 바이트 결과·길이·형식`, () => {
    const clock = fakeNow(35);
    const next = id.createRandomIdFactory({
      ...options,
      randomBytes: ascending,
      ...(options.timestamp ? { now: clock.now } : {}),
    });
    const result = next();
    expect(result).toBe(expected);
    expect(Array.from(result)).toHaveLength(Array.from(expected).length);
    expect(result).toMatch(pattern);
    expect(clock.calls).toBe(options.timestamp ? 1 : 0);
  });
}

it("일회성: 기본 형태가 nanoid와 같고 매 호출마다 옵션을 다시 검증한다", () => {
  const stub = installCryptoStub({
    fill: (view) => view.set(ascending(view.length)),
  });
  expect(id.randomId()).toBe("ABCDEFGHIJKLMNOPQRSTU");
  expect(id.randomId()).toMatch(/^[A-Za-z0-9_-]{21}$/);
  expect(id.nanoid()).toMatch(/^[A-Za-z0-9_-]{21}$/);
  const options = { length: 2 };
  expect(id.randomId(options)).toBe("AB");
  options.length = 0;
  expect(() => id.randomId(options)).toThrow(RangeError);
  expect(stub.calls).toHaveLength(4);
});

for (const mode of [
  "present",
  "absent",
  "empty",
  "not-function",
  "throwing-accessor",
] satisfies CryptoMode[]) {
  it(`팩토리: crypto ${mode}에서 생성은 접근하지 않고 첫 호출에서 난수를 요청한다`, () => {
    const stub = installCryptoStub({ mode });
    const clock = vi.spyOn(Date, "now");
    try {
      const next = id.createRandomIdFactory({ timestamp: true });
      expect(stub.calls).toHaveLength(0);
      expect(clock).not.toHaveBeenCalled();
      if (mode === "present")
        expect(next()).toMatch(/^[0-9a-z]{9}_[A-Za-z0-9_-]{21}$/);
      else {
        expect(next).toThrow(id.SecureRandomUnavailableError);
        expect(() => id.randomId()).toThrow(id.SecureRandomUnavailableError);
      }
    } finally {
      clock.mockRestore();
    }
  });
}

it("팩토리: 주입 난수원·시계·충돌 검사는 생성할 때 호출하지 않는다", () => {
  const clock = fakeNow(35);
  const source = vi.fn(ascending);
  const isTaken = vi.fn(() => false);
  const next = id.createRandomIdFactory({
    timestamp: true,
    now: clock.now,
    randomBytes: source,
    isTaken,
  });
  expect(source).not.toHaveBeenCalled();
  expect(clock.calls).toBe(0);
  expect(isTaken).not.toHaveBeenCalled();
  expect(next()).toBe("00000000z_ABCDEFGHIJKLMNOPQRSTU");
  expect(source).toHaveBeenCalledTimes(1);
  expect(clock.calls).toBe(1);
});

it("팩토리와 일회성: 기본 crypto와 Date.now는 호출 시점에 찾는다", () => {
  installCryptoStub({ mode: "absent" });
  const next = id.createRandomIdFactory({ timestamp: true, length: 1 });
  installCryptoStub({ fill: (view) => view.fill(1) });
  const clock = vi.spyOn(Date, "now").mockReturnValue(35);
  try {
    expect(next()).toBe("00000000z_B");
    clock.mockReturnValue(36);
    installCryptoStub({ fill: (view) => view.fill(2) });
    expect(next()).toBe("000000010_C");
    expect(id.randomId({ timestamp: true, length: 1 })).toBe("000000010_C");
  } finally {
    clock.mockRestore();
  }
});

for (const invalid of [
  null,
  [],
  "options",
  { length: 0 },
  { bits: 0 },
  { prefix: "" },
  { separator: "-" },
  { now: () => 0 },
  { randomBytes: null },
  { typo: true },
]) {
  it(`검증: ${JSON.stringify(invalid)} 옵션은 crypto 접근보다 먼저 거부한다`, () => {
    installCryptoStub({ mode: "throwing-accessor" });
    expect(() =>
      id.createRandomIdFactory(invalid as RandomIdFactoryOptions),
    ).toThrow(RangeError);
    expect(() => id.randomId(invalid as RandomIdOptions)).toThrow(RangeError);
  });
}

it("일회성: 난수원·시계 주입은 알 수 없는 키다", () => {
  installCryptoStub({ mode: "absent" });
  for (const options of [
    { randomBytes: ascending },
    { timestamp: true, now: () => 0 },
  ]) {
    expect(() => id.randomId(options as RandomIdOptions)).toThrow(RangeError);
  }
});

for (const invalid of [
  new Uint8Array(0),
  new Uint8Array(2),
  new Uint8Array(4),
  null,
  [0, 1, 2],
  new Uint16Array(3),
  "abc",
]) {
  it(`팩토리: 주입 난수원 계약 위반 ${String(invalid)}은 즉시 RangeError다`, () => {
    const source = vi.fn(() => invalid as Uint8Array);
    const next = id.createRandomIdFactory({ length: 3, randomBytes: source });
    expect(source).not.toHaveBeenCalled();
    expect(next).toThrow(RangeError);
    expect(source).toHaveBeenCalledTimes(1);
  });
}

for (const invalid of [NaN, -1, 0.5, 36 ** 9, "35"]) {
  it(`시계: ${String(invalid)}는 생성이 아니라 호출에서 거부한다`, () => {
    const now = vi.fn(() => invalid as number);
    const next = id.createRandomIdFactory({
      timestamp: true,
      now,
      randomBytes: ascending,
    });
    expect(now).not.toHaveBeenCalled();
    expect(next).toThrow(RangeError);
    expect(now).toHaveBeenCalledTimes(1);
  });
}

it("팩토리: 원본 옵션 getter는 한 번만 읽고 변경 후에도 원래 값을 사용한다", () => {
  const length = vi.fn(() => 3);
  const options = {
    prefix: "usr",
    get length() {
      return length();
    },
    randomBytes: ascending,
  };
  const next = id.createRandomIdFactory(options);
  expect(length).toHaveBeenCalledTimes(1);
  options.prefix = "changed";
  options.randomBytes = () => {
    throw new Error("변경된 난수원");
  };
  length.mockImplementation(() => {
    throw new Error("다시 읽음");
  });
  expect(next()).toBe("usr_ABC");
  expect(next()).toBe("usr_ABC");
  expect(length).toHaveBeenCalledTimes(1);
});

it("팩토리: 독립 난수원과 시계를 가진 생성기는 서로 영향을 주지 않는다", () => {
  const clockA = fakeNow(35);
  const clockB = fakeNow(36);
  const a = id.createRandomIdFactory({
    timestamp: true,
    now: clockA.now,
    randomBytes: seededBytes(7),
    length: 8,
  });
  const b = id.createRandomIdFactory({
    timestamp: true,
    now: clockB.now,
    randomBytes: seededBytes(7),
    length: 8,
  });
  const firstA = a();
  a();
  expect(b().slice(10)).toBe(firstA.slice(10));
  expect(clockA.calls).toBe(2);
  expect(clockB.calls).toBe(1);
});

const distributions: [RandomIdOptions, string][] = [
  [
    { preset: "base64url" },
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_",
  ],
  [
    { preset: "base62" },
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  ],
  [{ preset: "base36" }, "0123456789abcdefghijklmnopqrstuvwxyz"],
  [{ preset: "digits" }, "0123456789"],
  [{ preset: "readable" }, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"],
  [{ alphabet: "가나😀" }, "가나😀"],
  [
    { startWithLetter: true },
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  ],
];

for (const [options, alphabet] of distributions) {
  it(`분포: ${JSON.stringify(options)}의 문자 빈도는 결정적 카이제곱 임계값 이하다`, () => {
    const chars = Array.from(alphabet);
    const counts = chars.map(() => 0);
    const unexpected = new Set<string>();
    const length = options.startWithLetter ? 1 : 1000;
    const next = id.createRandomIdFactory({
      ...options,
      length,
      randomBytes: seededBytes(0x12345678),
    });
    for (let i = 0; i < 100_000 / length; i += 1) {
      for (const char of next()) {
        const index = chars.indexOf(char);
        if (index < 0) unexpected.add(char);
        else counts[index]! += 1;
      }
    }
    expect(unexpected.size).toBe(0);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(100_000);
    expect(chiSquare(counts)).toBeLessThan(chiSquareCritical(chars.length - 1));
  });
}

for (const maxAttempts of [undefined, 1, 3, 1000]) {
  it(`충돌: 크기 2·길이 1에서 상한 ${String(maxAttempts)}회 모두 충돌하면 attempts를 보존한다`, () => {
    const source = vi.fn((length: number) => new Uint8Array(length));
    const isTaken = vi.fn((value: string) => new Set(["a", "b"]).has(value));
    const next = id.createRandomIdFactory({
      alphabet: "ab",
      length: 1,
      isTaken,
      ...(maxAttempts === undefined ? {} : { maxAttempts }),
      randomBytes: source,
    });
    const error = captureThrown(next);
    expect(error).toBeInstanceOf(id.IdCollisionError);
    expect((error as id.IdCollisionError).attempts).toBe(maxAttempts ?? 10);
    expect(isTaken).toHaveBeenCalledTimes(maxAttempts ?? 10);
    expect(source).toHaveBeenCalledTimes(maxAttempts ?? 10);
  });
}

for (const collisions of [0, 1, 3]) {
  it(`충돌: ${collisions}번 true 뒤 false면 정확히 다음 시도에서 새 시각과 난수의 최종 ID를 반환한다`, () => {
    const clock = fakeNow(35);
    let byte = 0;
    const source = vi.fn((length: number) =>
      new Uint8Array(length).fill(byte++),
    );
    const seen: string[] = [];
    const next = id.createRandomIdFactory({
      prefix: "usr",
      separator: ":",
      timestamp: true,
      now: clock.now,
      alphabet: "ab",
      length: 3,
      group: 2,
      groupSeparator: "|",
      randomBytes: source,
      maxAttempts: collisions + 1,
      isTaken: (value) => {
        seen.push(value);
        clock.advance();
        return seen.length <= collisions;
      },
    });
    const expected = [
      "usr:00000000z:aa|a",
      "usr:000000010:bb|b",
      "usr:000000011:aa|a",
      "usr:000000012:bb|b",
    ];
    expect(next()).toBe(expected[collisions]);
    expect(seen).toEqual(expected.slice(0, collisions + 1));
    expect(clock.calls).toBe(collisions + 1);
    expect(source).toHaveBeenCalledTimes(collisions + 1);
  });
}

// Promise는 기본 toString이 "[object Promise]"라 테스트 제목용으로 따로 이름을 붙인다.
const describeResult = (value: unknown): string =>
  value instanceof Promise ? "Promise" : String(value);

for (const result of [Promise.resolve(true), "true", 1, undefined, null]) {
  it(`충돌: boolean이 아닌 반환값 ${describeResult(result)}는 첫 시도에서 RangeError다`, () => {
    const isTaken = vi.fn(() => result as unknown as boolean);
    const next = id.createRandomIdFactory({ isTaken, randomBytes: ascending });
    expect(next).toThrow(RangeError);
    expect(isTaken).toHaveBeenCalledTimes(1);
  });
}

it("충돌: 검사 함수가 던진 예외는 재시도 없이 같은 객체로 전파한다", () => {
  const error = new Error("검사 실패");
  const isTaken = vi.fn(() => {
    throw error;
  });
  const next = id.createRandomIdFactory({ randomBytes: ascending, isTaken });
  expect(captureThrown(next)).toBe(error);
  expect(isTaken).toHaveBeenCalledTimes(1);
});

it("충돌: isTaken이 없으면 시각과 무작위 부분을 한 번만 조립한다", () => {
  const clock = fakeNow(0);
  const source = vi.fn(ascending);
  const next = id.createRandomIdFactory({
    timestamp: true,
    now: clock.now,
    randomBytes: source,
    length: 1,
  });
  expect(next()).toBe("000000000_A");
  expect(clock.calls).toBe(1);
  expect(source).toHaveBeenCalledTimes(1);
});

it("일회성: 충돌 회피 사용성 식은 최종 결과로 검사하고 다음 후보를 반환한다", () => {
  let byte = 0;
  installCryptoStub({ fill: (view) => view.fill(byte++) });
  const used = new Set(["AAAAAAAAAAAA"]);
  const result = id.randomId({
    length: 12,
    isTaken: (value) => used.has(value),
  });
  expect(result).toBe("BBBBBBBBBBBB");
});
