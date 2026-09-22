/** 공개 값 export 전부에 적용하는 crypto·요청 한도·대체 난수원 금지 계약. */
import { fileURLToPath } from "node:url";
import { expect, it, vi } from "vitest";
import * as id from "../../src/id/index.js";
import { trapClock } from "../helpers/clock-trap.js";
import { installCryptoStub, type CryptoMode } from "../helpers/crypto-stub.js";
import { importFresh } from "../helpers/import-fresh.js";
import { trapMathRandom } from "../helpers/math-random-trap.js";

const V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID = "017f22e2-79b0-7cc3-98c4-dc0c0c07398f";
const UUID_BYTES = new Uint8Array([
  1, 127, 34, 226, 121, 176, 124, 195, 152, 196, 220, 12, 12, 7, 57, 143,
]);
const modes: CryptoMode[] = [
  "present",
  "absent",
  "empty",
  "not-function",
  "throwing-accessor",
];

const randomCalls = {
  nanoid: () => id.nanoid(),
  randomId: () => id.randomId(),
  uuidv4: () => id.uuidv4(),
  uuidv7: () => id.uuidv7(),
  createRandomIdFactory: () => id.createRandomIdFactory()(),
  createUuidv4Factory: () => id.createUuidv4Factory()(),
  createUuidv7Factory: () => id.createUuidv7Factory()(),
};
const formats: Record<keyof typeof randomCalls, RegExp> = {
  nanoid: /^[A-Za-z0-9_-]{21}$/,
  randomId: /^[A-Za-z0-9_-]{21}$/,
  uuidv4: V4,
  uuidv7: V7,
  createRandomIdFactory: /^[A-Za-z0-9_-]{21}$/,
  createUuidv4Factory: V4,
  createUuidv7Factory: V7,
};
const pureCalls = {
  parseUuid: () => expect(id.parseUuid(UUID)).toEqual(UUID_BYTES),
  stringifyUuid: () => expect(id.stringifyUuid(UUID_BYTES)).toBe(UUID),
  isUuid: () => expect(id.isUuid(UUID)).toBe(true),
  IdCollisionError: () => expect(new id.IdCollisionError(3).attempts).toBe(3),
  SecureRandomUnavailableError: () =>
    expect(new id.SecureRandomUnavailableError()).toBeInstanceOf(Error),
};
/** 난수·시계 없이 동작하는 상태 있는 생성기. 어느 crypto 상태에서도 생성·호출·peek·reset이 성공해야 한다. */
const predictableCalls = {
  createCyclicIdFactory: () => {
    const next = id.createCyclicIdFactory({
      preset: "int32",
      start: 2147483647,
    });
    expect([next(), next(), next.peek()]).toEqual([
      2147483647, -2147483648, -2147483647,
    ]);
    next.reset();
    expect(next()).toBe(2147483647);
  },
  createCounterIdFactory: () => {
    const next = id.createCounterIdFactory({
      prefix: "blockly",
      separator: "-",
      radix: 36,
      start: 35,
    });
    expect([next(), next(), next.peek()]).toEqual([
      "blockly-z",
      "blockly-10",
      "blockly-11",
    ]);
    next.reset(0);
    expect(next()).toBe("blockly-0");
  },
};
const invalidCalls = {
  nanoid: () => id.nanoid(0),
  randomId: () => id.randomId({ length: 0 }),
  uuidv4: () => id.uuidv4({ dashes: null } as never),
  uuidv7: () => id.uuidv7({ dashes: null } as never),
  createRandomIdFactory: () => id.createRandomIdFactory({ length: 0 }),
  createUuidv4Factory: () =>
    id.createUuidv4Factory({ randomBytes: null } as never),
  createUuidv7Factory: () => id.createUuidv7Factory({ now: null } as never),
  parseUuid: () => id.parseUuid("invalid"),
  stringifyUuid: () => id.stringifyUuid(new Uint8Array(15)),
  isUuid: () => id.isUuid(null, { version: 9 } as never),
  createCyclicIdFactory: () => id.createCyclicIdFactory({}),
  createCounterIdFactory: () => id.createCounterIdFactory({ radix: 1 }),
};

it("id harness: 값 export가 전부 호출 표에 포함된다", () => {
  expect(
    Object.keys({ ...randomCalls, ...pureCalls, ...predictableCalls }).sort(),
  ).toEqual(Object.keys(id).sort());
});

for (const mode of modes) {
  for (const name of Object.keys(randomCalls) as (keyof typeof randomCalls)[]) {
    it(`id harness: 지원 판정과 형식 일치 (${mode}, ${name})`, () => {
      installCryptoStub({ mode });
      const trap = trapMathRandom();
      if (mode === "present")
        expect(randomCalls[name]()).toMatch(formats[name]);
      else expect(randomCalls[name]).toThrow(id.SecureRandomUnavailableError);
      expect(trap).not.toHaveBeenCalled();
    });
  }
  for (const [name, call] of Object.entries({
    ...pureCalls,
    ...predictableCalls,
  })) {
    it(`id harness: 난수 없이 동작 (${mode}, ${name})`, () => {
      const stub = installCryptoStub({ mode });
      const trap = trapMathRandom();
      call();
      expect(stub.calls).toEqual([]);
      expect(trap).not.toHaveBeenCalled();
    });
  }
  for (const [name, call] of Object.entries(predictableCalls)) {
    it(`id harness: 상태 있는 생성기의 호출·peek·reset은 시계도 읽지 않는다 (${mode}, ${name})`, () => {
      installCryptoStub({ mode });
      const clock = trapClock();
      call();
      expect(clock.dateNow).not.toHaveBeenCalled();
      expect(clock.performanceNow).not.toHaveBeenCalled();
    });
  }
  for (const [name, call] of Object.entries(invalidCalls)) {
    it(`id harness: ${mode} 상태의 ${name} 입력 위반은 RangeError다`, () => {
      const stub = installCryptoStub({ mode });
      expect(call).toThrow(RangeError);
      expect(stub.calls).toEqual([]);
    });
  }
  it(`id harness: ${mode} 상태에서 import는 난수를 요청하지 않고 팩토리 생성은 crypto와 시계를 읽지 않는다`, async () => {
    const stub = installCryptoStub({ mode });
    const fresh = await importFresh<typeof id>(
      fileURLToPath(new URL("../../src/id/index.ts", import.meta.url)),
    );
    // import는 위 stub의 난수 요청만 검사한다. 아래 getter trap은 팩토리 생성에만 적용한다.
    const clock = vi.fn(() => {
      throw new Error("Unexpected clock access");
    });
    const clockDescriptor = Object.getOwnPropertyDescriptor(Date, "now")!;
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    let accesses = 0;
    let clockAccesses = 0;
    Object.defineProperty(Date, "now", {
      configurable: true,
      get() {
        clockAccesses += 1;
        return clock;
      },
    });
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      get() {
        accesses += 1;
        throw new Error("Unexpected crypto access");
      },
    });
    try {
      expect(fresh.createRandomIdFactory({ timestamp: true })).toBeTypeOf(
        "function",
      );
      expect(fresh.createUuidv4Factory()).toBeTypeOf("function");
      expect(fresh.createUuidv7Factory()).toBeTypeOf("function");
      expect(fresh.createCyclicIdFactory({ preset: "int32" })).toBeTypeOf(
        "function",
      );
      expect(fresh.createCounterIdFactory()).toBeTypeOf("function");
      expect(accesses).toBe(0);
      expect(clockAccesses).toBe(0);
      expect(clock).not.toHaveBeenCalled();
      expect(stub.calls).toEqual([]);
    } finally {
      Object.defineProperty(Date, "now", clockDescriptor);
      if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
    }
  });
}

for (const size of [2, 64, 129, 255, 256]) {
  it(`id harness: 문자 집합 ${size}개와 길이 1024도 요청마다 65536바이트 이하다`, () => {
    const alphabet = Array.from({ length: size }, (_, i) =>
      String.fromCodePoint(0x1f300 + i),
    ).join("");
    const stub = installCryptoStub({ quota: 65_536 });
    const output = id.randomId({ length: 1024, alphabet });
    expect(Array.from(output)).toHaveLength(1024);
    for (const char of output) expect(alphabet).toContain(char);
    expect(stub.calls.length).toBeGreaterThan(0);
    for (const bytes of stub.calls) expect(bytes).toBeLessThanOrEqual(65_536);
  });
}
it("id harness: 최대 nanoid 요청도 65536바이트 이하다", () => {
  const stub = installCryptoStub({ quota: 65_536 });
  expect(id.nanoid(1024)).toMatch(/^[A-Za-z0-9_-]{1024}$/);
  expect(stub.calls.length).toBeGreaterThan(0);
  for (const bytes of stub.calls) expect(bytes).toBeLessThanOrEqual(65_536);
});

it("id harness: 기본 문자 집합의 최대 randomId 요청도 65536바이트 이하다", () => {
  const stub = installCryptoStub({ quota: 65_536 });
  expect(id.randomId({ length: 1024 })).toMatch(/^[A-Za-z0-9_-]{1024}$/);
  expect(stub.calls.length).toBeGreaterThan(0);
  for (const bytes of stub.calls) expect(bytes).toBeLessThanOrEqual(65_536);
});

for (const factory of [false, true]) {
  it(`id harness: 충돌 재시도와 소진도 Math.random을 부르지 않는다: 팩토리 ${factory}`, () => {
    installCryptoStub();
    const trap = trapMathRandom();
    let attempts = 0;
    const options = { length: 12, isTaken: () => ++attempts < 3 };
    const available = factory
      ? id.createRandomIdFactory(options)()
      : id.randomId(options);
    expect(available).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(attempts).toBe(3);
    const exhausted = { isTaken: () => true, maxAttempts: 2 };
    expect(
      factory
        ? id.createRandomIdFactory(exhausted)
        : () => id.randomId(exhausted),
    ).toThrow(id.IdCollisionError);
    expect(trap).not.toHaveBeenCalled();
  });
}
