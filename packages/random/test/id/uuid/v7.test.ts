/**
 * `uuidv7`과 `createUuidv7Factory`의 공개 계약을 검증한다.
 * 결과는 RFC 9562 UUID v7 형식이다: 36자(대시 없는 형식은 32자), version 자리가 7, variant 자리가 8·9·a·b.
 * 앞 48비트는 `unix_ts_ms`, 다음 12비트는 같은 ms 안에서 증가하는 counter이고 나머지는 난수다.
 * - 단조성은 인스턴스 단위다: 같은 생성기가 돌려준 문자열의 정렬 순서가 생성 순서와 같다.
 *   시계가 10,000ms를 넘어 되돌아가면 시계 기준으로 재설정하며 그 구간은 보장하지 않는다.
 * - 상태(`lastMs`, `lastCounter`)는 난수·시계 검증을 모두 지난 뒤에 한 번만 커밋한다. 실패한 호출은 상태를 바꾸지 않는다.
 * - 팩토리는 생성 시점에 옵션만 검증하고 crypto·시계·주입 난수원에 접근하지 않는다.
 * - 일회성 `uuidv7`은 모듈 수준 기본 인스턴스에 위임한다. 인스턴스는 import 시점이 아니라 첫 호출에서 만든다.
 * 형식만 계약이다. 이 파일이 고정 바이트·고정 시계로 확인하는 값(어떤 바이트가 UUID의 어느 자리로 가는가)은
 * 구현 세부를 회귀로 감시하는 것이며 공개 계약이 아니다.
 * 형식 옵션(`dashes`, `case`)의 읽기·검증 자체는 `format-options.test.ts`가, `randomBytes`·`now`가 함수인지의
 * 검증과 시계 값 범위 검사는 `validate.test.ts`가 맡고 이 파일은 두 함수가 그 검증을 실제로 거치는지를 본다.
 *
 * 이 파일은 `describe`를 쓰지 않는다. `v7.ts`가 mutation 대상이라서다. Stryker 10.0.0의 vitest 러너는
 * `describe` 안의 테스트를 mutant 실행 때 선택하지 못한다(`uniform-int.test.ts` 머리말 참고). 분류는 제목 접두어로 한다.
 */
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { expect, expectTypeOf, it, onTestFinished, vi } from "vitest";
import {
  isUuid,
  parseUuid,
  type UuidFormat,
} from "../../../src/id/uuid/format.js";
import {
  createUuidv7Factory,
  uuidv7,
  type Uuidv7FactoryOptions,
} from "../../../src/id/uuid/v7.js";
import { SecureRandomUnavailableError } from "../../../src/internal/errors.js";
import { captureThrown } from "../../helpers/capture-thrown.js";
import {
  installCryptoStub,
  type CryptoMode,
} from "../../helpers/crypto-stub.js";
import { fakeNow } from "../../helpers/fake-now.js";
import { importFresh } from "../../helpers/import-fresh.js";
import { trapMathRandom } from "../../helpers/math-random-trap.js";
import { seededBytes } from "../../helpers/seeded-bytes.js";

/** 대시 있는 소문자 v7: version 자리가 7이고 variant 자리가 8·9·a·b다. */
const V7_DASHED =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** 대시 없는 소문자 v7. */
const V7_COMPACT = /^[0-9a-f]{12}7[0-9a-f]{3}[89ab][0-9a-f]{15}$/;

/** `unix_ts_ms` 필드(48비트)가 담을 수 있는 최대 밀리초. */
const MAX_UNIX_TS_MS = 281_474_976_710_655;

/** counter(12비트)의 최댓값. */
const MAX_COUNTER = 4095;

/** ID 하나를 만들 때 요청하는 난수 바이트 수. */
const RANDOM_BYTE_LENGTH = 10;

/** 난수원이 돌려주는 10바이트. 모두 0이면 counter 초기값도 0이다. */
const ZERO_BYTES = new Uint8Array(RANDOM_BYTE_LENGTH);

/** 0x00, 0x01, ... 0x09. 위치마다 값이 달라 자리 이동을 잡는다. */
const ASCENDING = Uint8Array.from({ length: RANDOM_BYTE_LENGTH }, (_, i) => i);

const unsupportedModes: CryptoMode[] = [
  "absent",
  "empty",
  "not-function",
  "throwing-accessor",
];

/** `RangeError`로 거부해야 하는 팩토리 옵션 값. `undefined`는 옵션 없음이라 유효하므로 넣지 않는다. */
const invalidFactoryOptions: [label: string, value: unknown][] = [
  ["알 수 없는 키", { typo: true }],
  ["알 수 없는 키(값이 undefined)", { typo: undefined }],
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
  ["randomBytes가 숫자", { randomBytes: 10 }],
  ["randomBytes가 Uint8Array", { randomBytes: new Uint8Array(10) }],
  ["now가 null", { now: null }],
  ["now가 숫자", { now: 0 }],
  ["now가 문자열", { now: "Date.now" }],
  ["now가 boolean", { now: true }],
  ["now가 빈 객체", { now: {} }],
  ["now가 배열", { now: [] }],
  ["now가 Date", { now: new Date() }],
  ["dashes가 null", { dashes: null }],
  ["dashes가 문자열", { dashes: "true" }],
  ["dashes가 숫자", { dashes: 1 }],
  ["case가 null", { case: null }],
  ["case의 대문자 표기", { case: "Upper" }],
  ["case가 mixed", { case: "mixed" }],
];

/** 일회성 `uuidv7`의 `format`으로 `RangeError`를 던져야 하는 값. 난수원과 시계는 팩토리만 받는다. */
const invalidOneOffFormats: [label: string, value: unknown][] = [
  ["null", null],
  ["배열", []],
  ["함수", () => ({})],
  ["문자열", "upper"],
  ["숫자", 1],
  ["알 수 없는 키", { typo: true }],
  [
    "randomBytes(일회성 함수는 난수원을 받지 않는다)",
    { randomBytes: () => ZERO_BYTES },
  ],
  ["now(일회성 함수는 시계를 받지 않는다)", { now: () => 0 }],
  ["dashes가 문자열", { dashes: "no" }],
  ["dashes가 null", { dashes: null }],
  ["case의 대문자 표기", { case: "Upper" }],
  ["case가 null", { case: null }],
];

/**
 * 주입 난수원이 돌려줘서는 안 되는 값. 요청 길이는 10이다.
 * `Uint16Array(5)`는 바이트 수만 10이고 `Uint8Array`가 아니다.
 */
const invalidSourceResults: [label: string, value: unknown][] = [
  ["빈 배열", new Uint8Array(0)],
  ["9바이트 배열", new Uint8Array(9)],
  ["11바이트 배열", new Uint8Array(11)],
  ["16바이트 배열", new Uint8Array(16)],
  ["null", null],
  ["undefined", undefined],
  ["숫자 Array", Array.from({ length: 10 }, () => 0)],
  ["Uint16Array(10)", new Uint16Array(10)],
  ["Uint16Array(5)", new Uint16Array(5)],
  ["Uint8ClampedArray(10)", new Uint8ClampedArray(10)],
  ["문자열", "0123456789"],
  ["ArrayBuffer", new ArrayBuffer(10)],
  ["DataView", new DataView(new ArrayBuffer(10))],
  // 길이가 같아도 `instanceof Uint8Array`가 거짓이라서 거부한다.
  ["다른 realm의 Uint8Array(10)", runInNewContext("new Uint8Array(10)")],
];

/** 시계가 돌려줘서는 안 되는 값. 0 이상 2^48 미만의 정수만 받는다. */
const invalidClockValues: [label: string, value: unknown][] = [
  ["NaN", Number.NaN],
  ["Infinity", Number.POSITIVE_INFINITY],
  ["-Infinity", Number.NEGATIVE_INFINITY],
  ["음수", -1],
  ["소수", 1.5],
  ["2^48", 281_474_976_710_656],
  ["2^53", 2 ** 53],
  ["문자열", "1700000000000"],
  ["null", null],
  ["undefined", undefined],
  ["boolean", true],
  ["bigint", 1n],
  ["Date 객체", new Date(0)],
  ["valueOf를 가진 객체", { valueOf: () => 1000 }],
];

/** UUID 문자열에서 읽은 필드. 구현과 다른 경로(hex 문자열)로 읽는다. */
interface UuidFields {
  /** 앞 48비트의 `unix_ts_ms`. */
  ms: number;
  /** version 자리의 수(v7은 7). */
  version: number;
  /** 12비트 counter. */
  counter: number;
  /** variant 자리의 수(8·9·a·b). */
  variant: number;
}

/** UUID 문자열의 필드를 읽는다. 48비트는 `BigInt`로 읽어 구현의 나눗셈과 다른 경로를 쓴다. */
function fieldsOf(uuid: string): UuidFields {
  const hex = uuid.replace(/-/g, "").toLowerCase();
  return {
    ms: Number(BigInt(`0x${hex.slice(0, 12)}`)),
    version: Number.parseInt(hex.charAt(12), 16),
    counter: Number.parseInt(hex.slice(13, 16), 16),
    variant: Number.parseInt(hex.charAt(16), 16),
  };
}

/** 고정 바이트와 고정 시각으로 UUID 하나를 만든다. 팩토리를 새로 만들어 다른 테스트와 상태를 공유하지 않는다. */
function generateOne(
  ms: number,
  r: ArrayLike<number>,
  format?: UuidFormat,
): string {
  return createUuidv7Factory({
    ...format,
    randomBytes: () => Uint8Array.from(r),
    now: () => ms,
  })();
}

/** 고정 바이트와 주어진 시계로 생성기를 만든다. */
function generatorWith(
  r: ArrayLike<number>,
  now: () => number,
  format?: UuidFormat,
): () => string {
  return createUuidv7Factory({
    ...format,
    randomBytes: () => Uint8Array.from(r),
    now,
  });
}

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

/** `stubDateNow`가 돌려주는 기본 시계 stub. */
interface DateNowStub {
  /** `Date.now`를 호출한 횟수. */
  readonly calls: number;
  /** 시각을 바꾼다. 매번 새 함수 객체를 넣으므로 시계를 호출 시점에 찾지 않으면 값이 바뀌지 않는다. */
  set(value: number): void;
}

/** `Date.now`를 고정값으로 바꾸고 테스트가 끝나면 되돌린다. 기본 인스턴스의 기본 시계를 결정적으로 만든다. */
function stubDateNow(value = 0): DateNowStub {
  const original = Date.now;
  onTestFinished(() => {
    Date.now = original;
  });
  let calls = 0;
  const stub: DateNowStub = {
    get calls() {
      return calls;
    },
    set(next) {
      Date.now = () => {
        calls += 1;
        return next;
      };
    },
  };
  stub.set(value);
  return stub;
}

type V7Module = typeof import("../../../src/id/uuid/v7.js");

const v7ModulePath = fileURLToPath(
  new URL("../../../src/id/uuid/v7.ts", import.meta.url),
);

/** 기본 인스턴스 상태를 테스트마다 새로 만들기 위해 모듈을 새로 import한다. */
async function freshV7(): Promise<V7Module> {
  return importFresh<V7Module>(v7ModulePath);
}

it("시그니처: uuidv7은 (format?: UuidFormat) => string이다", () => {
  expectTypeOf(uuidv7).toEqualTypeOf<(format?: UuidFormat) => string>();
});

it("시그니처: createUuidv7Factory는 (options?: Uuidv7FactoryOptions) => () => string이다", () => {
  expectTypeOf(createUuidv7Factory).toEqualTypeOf<
    (options?: Uuidv7FactoryOptions) => () => string
  >();
});

it("레이아웃: 시각 0과 0 바이트는 00000000-0000-7000-8000-000000000000이다", () => {
  expect(generateOne(0, ZERO_BYTES)).toBe(
    "00000000-0000-7000-8000-000000000000",
  );
});

it("레이아웃: 2^48-1과 0xff 바이트는 ffffffff-ffff-77ff-bfff-ffffffffffff이다", () => {
  // counter 초기값은 상위 비트가 0이라 0x7ff이고, variant 바이트는 상위 2비트가 10이라 0xbf다.
  expect(generateOne(MAX_UNIX_TS_MS, new Uint8Array(10).fill(0xff))).toBe(
    "ffffffff-ffff-77ff-bfff-ffffffffffff",
  );
});

it("레이아웃: 위치마다 다른 바이트가 counter·variant·rand_b의 제자리로 간다", () => {
  // 시각 0x010203040506, r = 00 01 02 ... 09.
  // counter 초기값 = 0x0001, variant 바이트 = 0x80 | 0x02, 9~15번 바이트 = r[3]~r[9].
  expect(generateOne(1_108_152_157_446, ASCENDING)).toBe(
    "01020304-0506-7001-8203-040506070809",
  );
});

it("레이아웃: RFC 9562 예시의 timestamp가 앞 12 hex가 된다", () => {
  // RFC 9562 B.2의 UUID는 017F22E2-79B0-7CC3-98C4-DC0C0C07398F이고 timestamp는 0x017F22E279B0이다.
  // counter 최상위 비트를 0으로 두는 규칙 때문에 counter 자리만 cc3이 아니라 4c3이다.
  const uuid = generateOne(
    1_645_557_742_000,
    [0x0c, 0xc3, 0x98, 0xc4, 0xdc, 0x0c, 0x0c, 0x07, 0x39, 0x8f],
  );

  expect(uuid).toBe("017f22e2-79b0-74c3-98c4-dc0c0c07398f");
  expect(uuid.slice(0, 13).replace("-", "")).toBe("017f22e279b0");
});

it("레이아웃: 48비트 timestamp를 빅엔디언 6바이트로 쓴다(32비트를 넘는 값 포함)", () => {
  const cases: [ms: number, hex: string][] = [
    [0, "000000000000"],
    [1, "000000000001"],
    [255, "0000000000ff"],
    [256, "000000000100"],
    [65_535, "00000000ffff"],
    [16_777_215, "000000ffffff"],
    [4_294_967_295, "0000ffffffff"], // 2^32 - 1
    [4_294_967_296, "000100000000"], // 2^32: 32비트 비트 연산으로는 0이 된다
    [1_099_511_627_776, "010000000000"], // 2^40
    [140_737_488_355_328, "800000000000"], // 2^47: 32비트 연산이면 부호 비트가 된다
    [1_645_557_742_000, "017f22e279b0"],
    [1_700_000_000_000, "018bcfe56800"],
    [MAX_UNIX_TS_MS, "ffffffffffff"],
  ];

  for (const [ms, hex] of cases) {
    const uuid = generateOne(ms, ZERO_BYTES);

    expect(uuid.slice(0, 8) + uuid.slice(9, 13)).toBe(hex);
    // 표의 기대값이 맞는지 BigInt로 한 번 더 확인한다(구현의 나눗셈과 다른 경로다).
    expect(hex).toBe(BigInt(ms).toString(16).padStart(12, "0"));
    expect(fieldsOf(uuid).ms).toBe(ms);
  }
});

it("레이아웃: counter 초기값은 r[0]·r[1]의 하위 11비트이고 6·7번 바이트로 나뉜다", () => {
  const cases: [r0: number, r1: number, counter: number][] = [
    [0x00, 0x00, 0x000],
    [0x00, 0x01, 0x001],
    [0x00, 0xff, 0x0ff],
    [0x01, 0x00, 0x100],
    [0x07, 0xff, 0x7ff],
    // 상위 5비트는 마스크로 버린다: 0xffff & 0x07ff = 0x7ff, 0x0800 & 0x07ff = 0x000.
    [0xff, 0xff, 0x7ff],
    [0x08, 0x00, 0x000],
    [0xf8, 0x0f, 0x00f],
    [0x80, 0x80, 0x080],
  ];

  for (const [r0, r1, counter] of cases) {
    const uuid = generateOne(0, [r0, r1, 0, 0, 0, 0, 0, 0, 0, 0]);
    const bytes = parseUuid(uuid);

    // 기대값은 비트 연산이 아니라 산술로 쓴다. 구현과 같은 식을 쓰면 식이 틀려도 함께 틀린다.
    expect(bytes[6]).toBe(0x70 + Math.floor(counter / 256));
    expect(bytes[7]).toBe(counter % 256);
    expect(fieldsOf(uuid).counter).toBe(counter);
  }
});

it("레이아웃: counter 초기값의 최상위 비트는 항상 0이라 ms당 2048개 이상을 만들 수 있다", () => {
  const nextBytes = seededBytes(0x7c0de);
  for (let i = 0; i < 500; i += 1) {
    const counter = fieldsOf(
      generateOne(0, nextBytes(RANDOM_BYTE_LENGTH)),
    ).counter;

    expect(counter).toBeGreaterThanOrEqual(0);
    expect(counter).toBeLessThanOrEqual(2047);
  }
});

it("레이아웃: r[2]의 하위 6비트만 variant 바이트에 쓰고 상위 2비트는 버린다", () => {
  for (let value = 0; value < 256; value += 1) {
    const r = new Uint8Array(RANDOM_BYTE_LENGTH);
    r[2] = value;
    const bytes = parseUuid(generateOne(0, r));

    // 상위 2비트가 10이고 하위 6비트는 원래 값이다.
    expect(bytes[8]).toBe(0x80 + (value % 64));
  }
});

it("레이아웃: r[3]~r[9]가 9~15번 바이트에 순서대로 들어간다", () => {
  const base = [...parseUuid(generateOne(0, ZERO_BYTES))];

  for (let index = 3; index < RANDOM_BYTE_LENGTH; index += 1) {
    const r = new Uint8Array(RANDOM_BYTE_LENGTH);
    r[index] = 0xab;
    const expected = [...base];
    expected[6 + index] = 0xab;

    expect([...parseUuid(generateOne(0, r))]).toEqual(expected);
  }
});

it("레이아웃: 어떤 바이트를 넣어도 version 자리는 7이고 variant 자리는 8·9·a·b다", () => {
  const nextBytes = seededBytes(0x1e7);
  const variants = new Set<string>();
  for (let i = 0; i < 400; i += 1) {
    const uuid = generateOne(1_700_000_000_000, nextBytes(RANDOM_BYTE_LENGTH));

    expect(uuid).toMatch(V7_DASHED);
    expect(uuid.charAt(14)).toBe("7");
    variants.add(uuid.charAt(19));
    expect(isUuid(uuid, { version: 7 })).toBe(true);
  }

  expect([...variants].sort()).toEqual(["8", "9", "a", "b"]);
});

it("요청: 난수 바이트를 10개만 한 번에 요청하고 호출마다 새로 요청한다", () => {
  const { source, calls } = recordingSource(ZERO_BYTES);
  const clock = fakeNow(1000);
  const next = createUuidv7Factory({ randomBytes: source, now: clock.now });

  next();
  expect(calls).toEqual([10]);
  next();
  next();
  expect(calls).toEqual([10, 10, 10]);
  // 시계도 ID마다 한 번만 읽는다.
  expect(clock.calls).toBe(3);
});

it("주입 배열: 난수원이 돌려준 배열을 변경하지 않는다", () => {
  const shared = Uint8Array.from({ length: RANDOM_BYTE_LENGTH }, (_, i) => i);
  const snapshot = [...shared];
  const next = createUuidv7Factory({
    randomBytes: () => shared,
    now: () => 0,
  });

  next();
  next();

  expect([...shared]).toEqual(snapshot);
});

it("주입 배열: Uint8Array의 하위 클래스(Buffer)와 byteOffset이 있는 view도 받는다", () => {
  const expected = generateOne(0, ASCENDING);
  const backing = new Uint8Array(14).fill(0xee);
  backing.set(ASCENDING, 2);
  const view = backing.subarray(2, 12);

  expect(generateOne(0, Buffer.from(ASCENDING))).toBe(expected);
  expect(createUuidv7Factory({ randomBytes: () => view, now: () => 0 })()).toBe(
    expected,
  );
});

it("단조성: 같은 ms에서 5,000개를 만들어도 문자열이 엄격하게 증가한다", () => {
  const next = generatorWith(ZERO_BYTES, () => 1_700_000_000_000);

  const ids = Array.from({ length: 5000 }, () => next());

  for (let i = 1; i < ids.length; i += 1) {
    expect(ids[i]! > ids[i - 1]!).toBe(true);
  }
});

it("단조성: 같은 ms의 처음 4,096개는 timestamp가 같고 counter가 1씩 오른다", () => {
  const next = generatorWith(ZERO_BYTES, () => 1_700_000_000_000);

  const fields = Array.from({ length: 4096 }, (_, i) => {
    const parsed = fieldsOf(next());
    expect(parsed.ms).toBe(1_700_000_000_000);
    expect(parsed.counter).toBe(i);
    return parsed;
  });

  expect(fields).toHaveLength(4096);
});

it("경계: counter가 4095에서 고갈되면 timestamp가 1ms 앞서고 counter가 재초기화된다", () => {
  // counter 초기값을 2047로 두면 2,049번째 호출에서 4095에 닿는다.
  const next = generatorWith([0xff, 0xff, 0, 0, 0, 0, 0, 0, 0, 0], () => 5000);
  let last = fieldsOf(next());
  expect(last.counter).toBe(2047);

  for (let i = 0; i < 2047; i += 1) {
    last = fieldsOf(next());
  }
  expect(last.counter).toBe(MAX_COUNTER - 1);
  expect(last.ms).toBe(5000);

  const atMax = fieldsOf(next());
  expect(atMax.counter).toBe(MAX_COUNTER);
  expect(atMax.ms).toBe(5000);

  // 고갈: 대기하지 않고 timestamp를 1ms 앞세운 뒤 counter를 난수로 다시 잡는다.
  const exhausted = fieldsOf(next());
  expect(exhausted.ms).toBe(5001);
  expect(exhausted.counter).toBe(2047);
});

it("단조성: 고갈로 timestamp가 시계보다 앞서도 같은 ms에서 counter가 이어진다", () => {
  const next = generatorWith(ZERO_BYTES, () => 5000);
  for (let i = 0; i < 4096; i += 1) next();

  const first = fieldsOf(next());
  const second = fieldsOf(next());

  // 시계는 5000에 멈춰 있지만 timestamp는 5001로 올라가 있고 counter가 이어진다.
  expect(first).toEqual({ ms: 5001, version: 7, counter: 0, variant: 8 });
  expect(second.ms).toBe(5001);
  expect(second.counter).toBe(1);
});

it("단조성: 시계가 앞으로 가면 timestamp가 새 시각이 되고 counter를 다시 잡는다", () => {
  const clock = fakeNow(1000);
  const next = generatorWith([0x01, 0x23, 0, 0, 0, 0, 0, 0, 0, 0], clock.now);

  const first = fieldsOf(next());
  const second = fieldsOf(next());
  clock.advance();
  const third = fieldsOf(next());
  clock.advance(1000);
  const fourth = fieldsOf(next());

  expect(first).toMatchObject({ ms: 1000, counter: 0x123 });
  // 같은 ms는 counter를 올린다(재초기화하지 않는다).
  expect(second).toMatchObject({ ms: 1000, counter: 0x124 });
  expect(third).toMatchObject({ ms: 1001, counter: 0x123 });
  expect(fourth).toMatchObject({ ms: 2001, counter: 0x123 });
});

it("단조성: 시계를 정확히 10,000ms 되돌리면 마지막 timestamp를 유지하고 counter를 올린다", () => {
  const clock = fakeNow(1_000_000);
  const next = generatorWith(ZERO_BYTES, clock.now);
  const first = next();

  clock.rewind(10_000);
  const second = next();

  expect(fieldsOf(second)).toMatchObject({ ms: 1_000_000, counter: 1 });
  expect(second > first).toBe(true);
});

it("단조성: 시계를 10,001ms 되돌리면 시계 기준으로 재설정한다(그 구간은 보장하지 않는다)", () => {
  const clock = fakeNow(1_000_000);
  const next = generatorWith([0x00, 0x2a, 0, 0, 0, 0, 0, 0, 0, 0], clock.now);
  const first = next();

  clock.rewind(10_001);
  const second = next();

  expect(fieldsOf(second)).toMatchObject({ ms: 989_999, counter: 0x2a });
  // 재설정 구간에서는 문자열이 작아진다. 단조성은 이 구간에서 보장하지 않는다.
  expect(second < first).toBe(true);
  // 재설정 뒤에는 다시 증가한다.
  expect(next() > second).toBe(true);
});

it("단조성: 전진·소폭 rollback·고갈을 섞어도 문자열이 엄격하게 증가한다", () => {
  const clock = fakeNow(2_000_000);
  const next = createUuidv7Factory({
    randomBytes: seededBytes(0xb0a7),
    now: clock.now,
  });
  const ids: string[] = [];

  for (let round = 0; round < 6; round += 1) {
    for (let i = 0; i < 1500; i += 1) ids.push(next());
    clock.advance(3);
    for (let i = 0; i < 1500; i += 1) ids.push(next());
    clock.rewind(9_000);
    for (let i = 0; i < 1500; i += 1) ids.push(next());
    clock.advance(10_000);
  }

  expect(ids).toHaveLength(27_000);
  for (let i = 1; i < ids.length; i += 1) {
    expect(ids[i]! > ids[i - 1]!).toBe(true);
  }
});

it("경계: timestamp가 2^48-1일 때 counter가 고갈되면 RangeError이고 상태를 지킨다", () => {
  const clock = fakeNow(MAX_UNIX_TS_MS);
  const next = generatorWith([0xff, 0xff, 0, 0, 0, 0, 0, 0, 0, 0], clock.now);
  // counter 초기값 2047에서 시작해 2,049번째 호출이 4095다.
  for (let i = 0; i < 2048; i += 1) next();
  expect(fieldsOf(next()).counter).toBe(MAX_COUNTER);

  // lastMs + 1은 48비트를 넘는다. 상태를 바꾸지 않고 실패한다.
  expect(captureThrown(next)).toBeInstanceOf(RangeError);
  expect(captureThrown(next)).toBeInstanceOf(RangeError);

  // 시계를 크게 되돌리면 시계 기준으로 재설정되어 다시 만들 수 있다.
  clock.rewind(20_000);
  expect(fieldsOf(next())).toMatchObject({
    ms: MAX_UNIX_TS_MS - 20_000,
    counter: 2047,
  });
});

it("상태: randomBytes가 던진 뒤에도 counter가 이어진다(건너뛰거나 되돌아가지 않는다)", () => {
  let fail = false;
  const next = createUuidv7Factory({
    randomBytes: () => {
      if (fail) throw new Error("난수 요청 실패");
      return Uint8Array.from(ZERO_BYTES);
    },
    now: () => 7000,
  });
  expect(fieldsOf(next()).counter).toBe(0);
  expect(fieldsOf(next()).counter).toBe(1);

  fail = true;
  expect(captureThrown(next)).toBeInstanceOf(Error);
  fail = false;

  expect(fieldsOf(next())).toMatchObject({ ms: 7000, counter: 2 });
});

it("상태: now가 던진 뒤에도 counter가 이어진다", () => {
  let fail = false;
  const next = createUuidv7Factory({
    randomBytes: () => Uint8Array.from(ZERO_BYTES),
    now: () => {
      if (fail) throw new Error("시계 읽기 실패");
      return 7000;
    },
  });
  expect(fieldsOf(next()).counter).toBe(0);

  fail = true;
  expect(captureThrown(next)).toBeInstanceOf(Error);
  fail = false;

  expect(fieldsOf(next())).toMatchObject({ ms: 7000, counter: 1 });
});

for (const [label, value] of invalidClockValues) {
  it(`상태: now가 ${label}를 돌려주면 RangeError이고 상태가 그대로다`, () => {
    let broken = false;
    const { source, calls } = recordingSource(ZERO_BYTES);
    const next = createUuidv7Factory({
      randomBytes: source,
      now: () => (broken ? (value as number) : 7000),
    });
    expect(fieldsOf(next()).counter).toBe(0);
    expect(calls).toEqual([10]);

    broken = true;
    expect(captureThrown(next)).toBeInstanceOf(RangeError);
    expect(calls).toEqual([10, 10]);
    expect(captureThrown(next)).toBeInstanceOf(RangeError);
    expect(calls).toEqual([10, 10, 10]);
    broken = false;

    expect(fieldsOf(next())).toMatchObject({ ms: 7000, counter: 1 });
    expect(calls).toEqual([10, 10, 10, 10]);
  });
}

it("상태: 시계가 0이어도(1970-01-01) 정상 동작한다", () => {
  const next = generatorWith(ZERO_BYTES, () => 0);

  expect(next()).toBe("00000000-0000-7000-8000-000000000000");
  expect(fieldsOf(next())).toMatchObject({ ms: 0, counter: 1 });
});

for (const [label, value] of invalidSourceResults) {
  it(`계약 위반: source가 ${label}를 돌려주면 첫 호출이 RangeError이고 재시도하지 않는다`, () => {
    const calls: number[] = [];
    const next = createUuidv7Factory({
      randomBytes: (length) => {
        calls.push(length);
        return value as Uint8Array;
      },
      now: () => 1000,
    });
    // 팩토리를 만들 때는 source를 보지 않으므로 여기까지 오류가 없다.
    expect(calls).toEqual([]);

    expect(captureThrown(next)).toBeInstanceOf(RangeError);
    expect(calls).toEqual([10]);
  });
}

it("계약 위반: 잘못된 결과를 돌려준 뒤에도 같은 생성기가 상태를 이어 정상 동작한다", () => {
  let call = 0;
  const next = createUuidv7Factory({
    randomBytes: () => {
      call += 1;
      return call === 2 ? new Uint8Array(9) : Uint8Array.from(ZERO_BYTES);
    },
    now: () => 1000,
  });

  expect(fieldsOf(next()).counter).toBe(0);
  expect(captureThrown(next)).toBeInstanceOf(RangeError);
  expect(fieldsOf(next())).toMatchObject({ ms: 1000, counter: 1 });
});

it("계약 위반: source가 던진 오류는 감싸지 않고 같은 객체로 전파한다", () => {
  const failure = new Error("난수 요청 실패");
  const next = createUuidv7Factory({
    randomBytes: () => {
      throw failure;
    },
    now: () => 0,
  });

  expect(captureThrown(next)).toBe(failure);
});

it("계약 위반: now가 던진 오류는 감싸지 않고 같은 객체로 전파한다", () => {
  const failure = new Error("시계 읽기 실패");
  const next = createUuidv7Factory({
    randomBytes: () => Uint8Array.from(ZERO_BYTES),
    now: () => {
      throw failure;
    },
  });

  expect(captureThrown(next)).toBe(failure);
});

for (const [label, value] of invalidFactoryOptions) {
  it(`옵션: ${label}이면 팩토리 생성이 RangeError로 실패하고 crypto에 접근하지 않는다`, () => {
    const access = countCryptoAccess();
    const clock = stubDateNow();

    expect(
      captureThrown(() => createUuidv7Factory(value as never)),
    ).toBeInstanceOf(RangeError);
    expect(access.count).toBe(0);
    expect(clock.calls).toBe(0);
  });
}

it("옵션: 잘못된 옵션이 하나라도 있으면 유효한 randomBytes·now도 호출하지 않고 RangeError다", () => {
  const { source, calls } = recordingSource(ZERO_BYTES);
  const clock = fakeNow();

  expect(() =>
    createUuidv7Factory({
      randomBytes: source,
      now: clock.now,
      dashes: "no" as never,
    }),
  ).toThrow(RangeError);
  expect(() =>
    createUuidv7Factory({ randomBytes: source, now: 0 as never }),
  ).toThrow(RangeError);
  expect(() =>
    createUuidv7Factory({
      randomBytes: source,
      now: clock.now,
      typo: 1,
    } as never),
  ).toThrow(RangeError);
  expect(calls).toEqual([]);
  expect(clock.calls).toBe(0);
});

it("옵션: 값이 undefined인 키는 생략과 같다(기본 난수원과 Date.now를 쓴다)", () => {
  const stub = installCryptoStub();
  const clock = stubDateNow(1_700_000_000_000);

  const next = createUuidv7Factory({
    dashes: undefined,
    case: undefined,
    randomBytes: undefined,
    now: undefined,
  });

  expect(next()).toMatch(V7_DASHED);
  expect(stub.calls).toEqual([10]);
  expect(clock.calls).toBe(1);
});

it("옵션: undefined나 빈 객체로도 팩토리를 만들 수 있고 기본 난수원을 쓴다", () => {
  const stub = installCryptoStub();
  stubDateNow(1_700_000_000_000);

  expect(createUuidv7Factory()()).toMatch(V7_DASHED);
  expect(createUuidv7Factory(undefined)()).toMatch(V7_DASHED);
  expect(createUuidv7Factory({})()).toMatch(V7_DASHED);
  expect(stub.calls).toEqual([10, 10, 10]);
});

it("생성: 팩토리를 만들 때 crypto·시계에 접근하지 않고 randomBytes도 호출하지 않는다", () => {
  const access = countCryptoAccess();
  const dateNow = stubDateNow();
  const { source, calls } = recordingSource(ZERO_BYTES);
  const clock = fakeNow();

  createUuidv7Factory();
  createUuidv7Factory({ dashes: false, case: "upper" });
  createUuidv7Factory({ randomBytes: source });
  createUuidv7Factory({ now: clock.now });
  createUuidv7Factory({ randomBytes: source, now: clock.now, dashes: false });

  expect(access.count).toBe(0);
  expect(dateNow.calls).toBe(0);
  expect(calls).toEqual([]);
  expect(clock.calls).toBe(0);
});

it("생성: 팩토리를 만든 뒤 호출 전에는 crypto에 접근하지 않고 첫 호출이 접근한다", () => {
  const access = countCryptoAccess();
  stubDateNow();
  const next = createUuidv7Factory();
  expect(access.count).toBe(0);

  expect(() => next()).toThrow(SecureRandomUnavailableError);
  expect(access.count).toBeGreaterThan(0);
});

for (const mode of unsupportedModes) {
  it(`생성: crypto가 ${mode}여도 팩토리는 만들어지고 첫 호출이 SecureRandomUnavailableError다`, () => {
    installCryptoStub({ mode });
    stubDateNow();

    const next = createUuidv7Factory();
    const next2 = createUuidv7Factory({ dashes: false });

    expect(captureThrown(next)).toBeInstanceOf(SecureRandomUnavailableError);
    expect(captureThrown(next2)).toBeInstanceOf(SecureRandomUnavailableError);
  });
}

it("생성: 주입한 시계만 쓰고 Date.now는 찾지 않는다", () => {
  const dateNow = stubDateNow(1_700_000_000_000);
  const next = generatorWith(ZERO_BYTES, () => 5000);

  expect(fieldsOf(next()).ms).toBe(5000);
  expect(dateNow.calls).toBe(0);
});

it("생성: crypto 미지원으로 실패한 팩토리는 crypto가 생긴 뒤 같은 인스턴스가 정상 동작한다", () => {
  installCryptoStub({ mode: "absent" });
  const next = createUuidv7Factory({ now: () => 1000 });
  expect(() => next()).toThrow(SecureRandomUnavailableError);

  // 기본 난수원은 호출 시점에 찾으므로 팩토리를 다시 만들 필요가 없다.
  const stub = installCryptoStub({ fill: fillWith(ZERO_BYTES) });

  // 시계가 1000(0x3e8)이라 timestamp 자리가 00000000-03e8이다.
  expect(next()).toBe("00000000-03e8-7000-8000-000000000000");
  expect(stub.calls).toEqual([10]);
  // 실패한 호출은 상태를 남기지 않았다(counter가 0에서 시작한다).
  expect(fieldsOf(next()).counter).toBe(1);
});

it("독립성: 두 팩토리는 counter와 timestamp 상태를 공유하지 않는다", () => {
  const first = generatorWith(ZERO_BYTES, () => 3000);
  const second = generatorWith(ZERO_BYTES, () => 3000);

  first();
  first();
  first();

  expect(fieldsOf(second()).counter).toBe(0);
  expect(fieldsOf(first()).counter).toBe(3);
  expect(fieldsOf(second()).counter).toBe(1);
});

it("독립성: 같은 옵션으로 만든 두 팩토리는 같은 순서의 결과를 낸다", () => {
  const options = (): Uuidv7FactoryOptions => ({
    randomBytes: seededBytes(0xc0ffee),
    now: () => 4000,
  });
  const first = createUuidv7Factory(options());
  const second = createUuidv7Factory(options());

  const fromFirst = [first(), first(), first()];
  const fromSecond = [second(), second(), second()];

  expect(fromSecond).toEqual(fromFirst);
});

it("독립성: 생성 뒤에 옵션 객체를 바꿔도 생성기는 생성 시점의 옵션을 쓴다", () => {
  const options: Uuidv7FactoryOptions = {
    dashes: true,
    case: "lower",
    randomBytes: () => Uint8Array.from(ZERO_BYTES),
    now: () => 0,
  };
  const next = createUuidv7Factory(options);

  options.dashes = false;
  options.case = "upper";
  options.randomBytes = () => new Uint8Array(10).fill(0xff);
  options.now = () => 9999;

  expect(next()).toBe("00000000-0000-7000-8000-000000000000");
});

it("형식 옵션: dashes를 false로 하면 대시 없는 32자다", () => {
  const uuid = generateOne(1_108_152_157_446, ASCENDING, { dashes: false });

  expect(uuid).toBe("01020304050670018203040506070809");
  expect(uuid).toMatch(V7_COMPACT);
});

it("형식 옵션: case를 upper로 하면 대문자 hex다", () => {
  expect(generateOne(1_108_152_157_446, ASCENDING, { case: "upper" })).toBe(
    "01020304-0506-7001-8203-040506070809".toUpperCase(),
  );
});

it("형식 옵션: dashes false와 case upper를 함께 쓸 수 있다", () => {
  expect(
    generateOne(1_108_152_157_446, ASCENDING, {
      dashes: false,
      case: "upper",
    }),
  ).toBe("01020304050670018203040506070809".toUpperCase());
});

it("형식 옵션: 기본값을 명시해도 옵션을 생략한 것과 같다", () => {
  const expected = generateOne(0, ASCENDING);

  expect(generateOne(0, ASCENDING, { dashes: true, case: "lower" })).toBe(
    expected,
  );
  expect(generateOne(0, ASCENDING, {})).toBe(expected);
});

it("형식: 만든 UUID는 isUuid(version 7)가 받고 parseUuid로 16바이트가 된다", () => {
  const next = createUuidv7Factory({
    randomBytes: seededBytes(0x5eed),
    now: () => 1_700_000_000_000,
  });

  for (let i = 0; i < 200; i += 1) {
    const uuid = next();
    expect(uuid).toMatch(V7_DASHED);
    expect(isUuid(uuid, { version: 7 })).toBe(true);
    expect(parseUuid(uuid)).toHaveLength(16);
  }
});

it("Math.random을 호출하지 않는다", () => {
  const trap = trapMathRandom();
  installCryptoStub();
  stubDateNow(1_700_000_000_000);

  uuidv7();
  uuidv7({ dashes: false, case: "upper" });
  createUuidv7Factory()();
  generatorWith(ZERO_BYTES, () => 0)();

  expect(trap).not.toHaveBeenCalled();
});

it("crypto.randomUUID를 호출하지 않고 getRandomValues의 바이트로 만든다", () => {
  installCryptoStub({ fill: fillWith(ASCENDING) });
  stubDateNow(1_108_152_157_446);
  const randomUUID = vi.fn(() => "randomUUID가 호출되었다");
  Reflect.set(globalThis.crypto, "randomUUID", randomUUID);

  expect(createUuidv7Factory()()).toBe("01020304-0506-7001-8203-040506070809");
  expect(uuidv7()).toMatch(V7_DASHED);
  expect(randomUUID).not.toHaveBeenCalled();
});

it("일회성: 기본 형식은 대시 있는 36자 소문자이고 난수를 10바이트 요청한다", () => {
  const stub = installCryptoStub();
  stubDateNow(1_700_000_000_000);

  const uuid = uuidv7();

  expect(uuid).toHaveLength(36);
  expect(uuid).toMatch(V7_DASHED);
  expect(stub.calls).toEqual([10]);
});

it("일회성: 형식 옵션을 적용한다(대시 없음 32자, 대문자)", () => {
  installCryptoStub();
  stubDateNow(1_700_000_000_000);

  expect(uuidv7({ dashes: false })).toMatch(V7_COMPACT);
  expect(uuidv7({ dashes: false })).toHaveLength(32);
  expect(uuidv7({ case: "upper" })).toMatch(
    /^[0-9A-F]{8}-[0-9A-F]{4}-7[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/,
  );
  expect(uuidv7({ dashes: false, case: "upper" })).toMatch(
    /^[0-9A-F]{12}7[0-9A-F]{3}[89AB][0-9A-F]{15}$/,
  );
});

for (const [label, value] of invalidOneOffFormats) {
  it(`일회성: format이 ${label}이면 RangeError이고 난수·시계를 요청하지 않는다`, () => {
    const stub = installCryptoStub();
    const clock = stubDateNow();

    expect(captureThrown(() => uuidv7(value as never))).toBeInstanceOf(
      RangeError,
    );
    expect(stub.calls).toEqual([]);
    expect(clock.calls).toBe(0);
  });

  it(`일회성: format이 ${label}이면 crypto가 없는 환경에서도 RangeError다`, () => {
    installCryptoStub({ mode: "absent" });

    expect(captureThrown(() => uuidv7(value as never))).toBeInstanceOf(
      RangeError,
    );
  });
}

for (const mode of unsupportedModes) {
  it(`일회성: crypto가 ${mode}이면 uuidv7()은 SecureRandomUnavailableError를 던진다`, () => {
    installCryptoStub({ mode });
    stubDateNow(1_700_000_000_000);

    expect(captureThrown(() => uuidv7())).toBeInstanceOf(
      SecureRandomUnavailableError,
    );
    expect(captureThrown(() => uuidv7({ dashes: false }))).toBeInstanceOf(
      SecureRandomUnavailableError,
    );
  });
}

it("일회성: crypto가 있으면(present) 예외 없이 UUID를 돌려준다", () => {
  installCryptoStub({ mode: "present" });
  stubDateNow(1_700_000_000_000);

  expect(() => uuidv7()).not.toThrow();
});

it("기본 인스턴스: import 시점에는 crypto에 접근하지 않고 시계도 읽지 않는다", async () => {
  const access = countCryptoAccess();
  const clock = stubDateNow();

  await freshV7();

  expect(access.count).toBe(0);
  expect(clock.calls).toBe(0);
});

it("기본 인스턴스: 첫 호출에서 만들고 이후 호출이 같은 상태를 이어간다", async () => {
  const fresh = await freshV7();
  installCryptoStub({ fill: fillWith(ZERO_BYTES) });
  stubDateNow(1_700_000_000_000);

  const ids = Array.from({ length: 5 }, () => fresh.uuidv7());

  expect(ids.map((id) => fieldsOf(id).counter)).toEqual([0, 1, 2, 3, 4]);
  expect(ids.map((id) => fieldsOf(id).ms)).toEqual(
    Array.from({ length: 5 }, () => 1_700_000_000_000),
  );
  for (let i = 1; i < ids.length; i += 1) {
    expect(ids[i]! > ids[i - 1]!).toBe(true);
  }
});

it("기본 인스턴스: 형식이 다른 호출도 같은 인스턴스를 공유한다", async () => {
  const fresh = await freshV7();
  installCryptoStub({ fill: fillWith(ZERO_BYTES) });
  stubDateNow(1_700_000_000_000);

  const dashed = fresh.uuidv7();
  const compact = fresh.uuidv7({ dashes: false });
  const upper = fresh.uuidv7({ case: "upper" });

  expect(fieldsOf(dashed).counter).toBe(0);
  expect(fieldsOf(compact).counter).toBe(1);
  expect(fieldsOf(upper).counter).toBe(2);
  expect(compact).toHaveLength(32);
  expect(upper).toMatch(/^[0-9A-F-]{36}$/);
});

it("기본 인스턴스: Date.now를 호출 시점에 찾는다(import 뒤에 바꿔도 반영된다)", async () => {
  const fresh = await freshV7();
  installCryptoStub({ fill: fillWith(ZERO_BYTES) });
  const clock = stubDateNow(1_700_000_000_000);

  const first = fresh.uuidv7();
  // 새 함수 객체로 바꾼다. 시계를 생성 시점에 잡아 뒀다면 이 값이 반영되지 않는다.
  clock.set(1_700_000_005_000);
  const second = fresh.uuidv7();

  expect(fieldsOf(first).ms).toBe(1_700_000_000_000);
  expect(fieldsOf(second).ms).toBe(1_700_000_005_000);
  expect(clock.calls).toBe(2);
});

it("기본 인스턴스: 팩토리가 만든 생성기와 상태를 공유하지 않는다", async () => {
  const fresh = await freshV7();
  installCryptoStub({ fill: fillWith(ZERO_BYTES) });
  stubDateNow(1_700_000_000_000);
  const next = fresh.createUuidv7Factory({
    randomBytes: () => Uint8Array.from(ZERO_BYTES),
    now: () => 1_700_000_000_000,
  });

  fresh.uuidv7();
  fresh.uuidv7();

  expect(fieldsOf(next()).counter).toBe(0);
  expect(fieldsOf(fresh.uuidv7()).counter).toBe(2);
});

it("기본 인스턴스: 실패한 호출 뒤에도 상태가 이어진다", async () => {
  const fresh = await freshV7();
  let fail = false;
  installCryptoStub({
    fill: (view) => {
      if (fail) throw new Error("난수 요청 실패");
      view.fill(0);
    },
  });
  stubDateNow(1_700_000_000_000);

  expect(fieldsOf(fresh.uuidv7()).counter).toBe(0);
  fail = true;
  expect(captureThrown(() => fresh.uuidv7())).toBeInstanceOf(Error);
  fail = false;

  expect(fieldsOf(fresh.uuidv7()).counter).toBe(1);
});
