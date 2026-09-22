/**
 * 소비자 런타임 smoke: 설치된 `@cp949/random/id`(빌드된 dist)를 실제로 호출한다.
 * 단위 테스트는 `src`를 import하므로 컴파일된 ES2019 산출물이 실제 `globalThis.crypto` 위에서 동작하는지는
 * 여기서만 확인한다. 인자 `mode`는 `present`(실제 crypto), `absent`(crypto 제거), `throwing`(crypto 접근이 예외)이다.
 * export를 추가하는 작업은 이 파일에 그 함수의 호출을 함께 추가한다.
 */
import assert from "node:assert/strict";

const mode = process.argv[2] ?? "present";

// 라이브러리가 Math.random을 호출하면 즉시 실패시킨다. lint가 막지 못하는 우회도 실행 시점에 잡는다.
Math.random = () => {
  throw new Error("Math.random이 호출되었다");
};

if (mode === "absent") {
  Object.defineProperty(globalThis, "crypto", {
    value: undefined,
    configurable: true,
    writable: true,
  });
} else if (mode === "throwing") {
  Object.defineProperty(globalThis, "crypto", {
    get() {
      throw new Error("crypto 접근이 거부되었다");
    },
    configurable: true,
  });
}

const {
  IdCollisionError,
  SecureRandomUnavailableError,
  createCounterIdFactory,
  createCyclicIdFactory,
  randomId,
  createRandomIdFactory,
  createUuidv4Factory,
  createUuidv7Factory,
  isUuid,
  nanoid,
  parseUuid,
  stringifyUuid,
  uuidv4,
  uuidv7,
} = await import("@cp949/random/id");
const { SecureRandomUnavailableError: SecureEntryError } =
  await import("@cp949/random/secure");

/** 호출이 `SecureRandomUnavailableError`로 실패하는지 확인한다. */
const failsClosed = (call) =>
  assert.throws(call, (error) => error instanceof SecureRandomUnavailableError);

// 생성은 crypto·시계에 접근하지 않는다. 세 crypto 상태 모두에서 생성과 주입 경로가 동작한다.
const randomFactory = createRandomIdFactory();
const injectedRandomFactory = createRandomIdFactory({
  prefix: "usr",
  timestamp: true,
  now: () => 35,
  length: 5,
  group: 2,
  randomBytes: (length) => new Uint8Array(length),
});
assert.equal(injectedRandomFactory(), "usr_00000000z_AA-AA-A");
for (const options of [
  null,
  { length: 0 },
  { randomBytes: () => new Uint8Array(1) },
  { now: () => 0 },
  { typo: true },
]) {
  assert.throws(() => randomId(options), RangeError);
}
assert.throws(() => createRandomIdFactory({ length: 0 }), RangeError);
const colliding = createRandomIdFactory({
  alphabet: "ab",
  length: 1,
  isTaken: () => true,
  maxAttempts: 2,
  randomBytes: (length) => new Uint8Array(length),
});
assert.throws(
  colliding,
  (error) => error instanceof IdCollisionError && error.attempts === 2,
);

// 두 진입점이 같은 오류 클래스를 내보낸다. 설치된 패키지에서 클래스가 둘로 갈라지면 한쪽의 오류를 다른 쪽에서 잡지 못한다.
assert.equal(SecureRandomUnavailableError, SecureEntryError);

const error = new IdCollisionError(3);
assert.ok(error instanceof Error);
assert.equal(error.name, "IdCollisionError");
assert.equal(error.attempts, 3);

// 순환·카운터 ID는 난수·시계를 쓰지 않으므로 세 crypto 상태 모두에서 생성·호출·peek·reset이 동작한다.
const int32 = createCyclicIdFactory({ preset: "int32", start: 2147483647 });
assert.equal(int32.peek(), 2147483647);
assert.equal(int32(), 2147483647);
assert.equal(int32(), -2147483648);
int32.reset();
assert.equal(int32(), 2147483647);
int32.reset(0);
assert.equal(int32(), 0);
assert.throws(() => int32.reset(2147483648), RangeError);
const counter = createCounterIdFactory({
  prefix: "blockly",
  separator: "-",
  radix: 36,
  start: 35,
});
assert.equal(counter(), "blockly-z");
assert.equal(counter(), "blockly-10");
assert.equal(counter.peek(), "blockly-11");
assert.equal(createCounterIdFactory()(), "0");
assert.equal(
  createCounterIdFactory({ radix: 2, pad: 8, start: 5 })(),
  "00000101",
);
// 잘못된 옵션은 crypto 상태와 무관하게 생성 시점 RangeError다.
for (const invalid of [
  undefined,
  {},
  null,
  { preset: "int64" },
  { preset: "int32", max: 5 },
  { max: 5, step: 0 },
  { min: 5, max: 4 },
  { max: 5, typo: 1 },
]) {
  assert.throws(() => createCyclicIdFactory(invalid), RangeError);
}
for (const invalid of [
  null,
  { min: -1 },
  { radix: 37 },
  { pad: 65 },
  { separator: "-" },
  { case: "upper" },
  { preset: "uint8" },
]) {
  assert.throws(() => createCounterIdFactory(invalid), RangeError);
}

// UUID 형식 함수(stringifyUuid, parseUuid, isUuid)는 난수를 쓰지 않는 순수 함수라서 crypto 상태와 무관하게 세 상태 모두에서 동작한다.
// 예시는 RFC 9562의 UUIDv7 예시 값이다.
const RFC_V7 = "017F22E2-79B0-7CC3-98C4-DC0C0C07398F";
const RFC_V7_COMPACT = "017f22e279b07cc398c4dc0c0c07398f";
const NIL = "00000000-0000-0000-0000-000000000000";
const MAX = "ffffffff-ffff-ffff-ffff-ffffffffffff";

const uuidBytes = parseUuid(RFC_V7);
assert.ok(uuidBytes instanceof Uint8Array);
assert.equal(uuidBytes.length, 16);
assert.deepEqual(
  [...uuidBytes],
  [
    0x01, 0x7f, 0x22, 0xe2, 0x79, 0xb0, 0x7c, 0xc3, 0x98, 0xc4, 0xdc, 0x0c,
    0x0c, 0x07, 0x39, 0x8f,
  ],
);
assert.deepEqual(parseUuid(RFC_V7_COMPACT), uuidBytes);
assert.deepEqual(parseUuid(RFC_V7.toLowerCase()), uuidBytes);
// version·variant는 검사하지 않으므로 Nil UUID도 파싱한다.
assert.deepEqual([...parseUuid(NIL)], new Array(16).fill(0));

// 왕복과 형식 조합(대시, 대소문자).
assert.equal(stringifyUuid(uuidBytes), RFC_V7.toLowerCase());
assert.equal(stringifyUuid(uuidBytes, { case: "upper" }), RFC_V7);
assert.equal(stringifyUuid(uuidBytes, { dashes: false }), RFC_V7_COMPACT);
assert.equal(
  stringifyUuid(uuidBytes, { dashes: false, case: "upper" }),
  RFC_V7_COMPACT.toUpperCase(),
);
assert.equal(stringifyUuid(new Uint8Array(16)), NIL);

// isUuid: 형식, version, dashes 옵션. Nil·Max UUID는 거부한다.
assert.equal(isUuid(RFC_V7), true);
assert.equal(isUuid(RFC_V7, { version: 7 }), true);
assert.equal(isUuid(RFC_V7, { version: 4 }), false);
assert.equal(isUuid(RFC_V7_COMPACT), false);
assert.equal(isUuid(RFC_V7_COMPACT, { dashes: false }), true);
assert.equal(isUuid(NIL), false);
assert.equal(isUuid(MAX), false);
assert.equal(isUuid(null), false);
assert.equal(isUuid(new String(RFC_V7)), false);
assert.equal(isUuid([RFC_V7]), false);

// 입력 위반은 RangeError다. isUuid는 문자열이 아닌 value에도 던지지 않지만 잘못된 옵션에는 던진다.
for (const invalid of [
  "",
  "not-a-uuid",
  `${RFC_V7}0`,
  null,
  123,
  {},
  [RFC_V7],
]) {
  assert.throws(() => parseUuid(invalid), RangeError);
}
assert.throws(() => stringifyUuid(new Uint8Array(15)), RangeError);
assert.throws(() => stringifyUuid([...uuidBytes]), RangeError);
assert.throws(() => stringifyUuid(uuidBytes, { dashes: "no" }), RangeError);
assert.throws(() => stringifyUuid(uuidBytes, { typo: true }), RangeError);
assert.throws(() => isUuid(RFC_V7, { version: 9 }), RangeError);
assert.throws(() => isUuid(null, { typo: 1 }), RangeError);

// uuidv4·createUuidv4Factory: 결과 형식(길이, version 4, variant 8·9·a·b)을 정규식으로 검증한다.
const V4_DASHED =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const V4_COMPACT = /^[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}$/;
const V4_DASHED_UPPER =
  /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/;
const V4_COMPACT_UPPER = /^[0-9A-F]{12}4[0-9A-F]{3}[89AB][0-9A-F]{15}$/;

// 팩토리 생성은 옵션만 검증하고 crypto에 접근하지 않으므로 세 상태 모두에서 성공한다.
const defaultFactory = createUuidv4Factory();
const upperCompactFactory = createUuidv4Factory({
  dashes: false,
  case: "upper",
});

// 주입한 난수원은 crypto 상태와 무관하게 동작한다. 결과는 고정 바이트에서 결정된다(version·variant 마스크 적용).
const ZERO_UUID = "00000000-0000-4000-8000-000000000000";
const MAX_V4_UUID = "ffffffff-ffff-4fff-bfff-ffffffffffff";
const zeros = createUuidv4Factory({
  randomBytes: (length) => new Uint8Array(length),
});
assert.equal(zeros(), ZERO_UUID);
const injectedRequests = [];
const ones = createUuidv4Factory({
  dashes: false,
  case: "upper",
  randomBytes: (length) => {
    injectedRequests.push(length);
    return new Uint8Array(length).fill(0xff);
  },
});
assert.equal(injectedRequests.length, 0); // 생성은 난수원을 호출하지 않는다.
assert.equal(ones(), MAX_V4_UUID.replace(/-/g, "").toUpperCase());
assert.deepEqual(injectedRequests, [16]);
// 주입한 배열은 변경하지 않는다.
const shared = new Uint8Array(16).fill(0xff);
const reusing = createUuidv4Factory({ randomBytes: () => shared });
assert.equal(reusing(), MAX_V4_UUID);
assert.equal(reusing(), MAX_V4_UUID);
assert.deepEqual([...shared], new Array(16).fill(0xff));
// 만든 UUID는 isUuid(version 4)가 받고 parseUuid로 왕복한다.
assert.equal(isUuid(zeros(), { version: 4 }), true);
assert.equal(stringifyUuid(parseUuid(reusing())), MAX_V4_UUID);

// 옵션·난수원 계약 위반은 crypto 상태와 무관하게 RangeError다(일회성은 검증이 crypto 접근보다 먼저다).
for (const invalidFormat of [
  null,
  [],
  "upper",
  { typo: true },
  { dashes: "no" },
  { case: "Upper" },
  { randomBytes: () => new Uint8Array(16) },
]) {
  assert.throws(() => uuidv4(invalidFormat), RangeError);
}
for (const invalidOptions of [
  null,
  [],
  "dashes",
  { typo: true },
  { now: () => 0 },
  { dashes: null },
  { case: "mixed" },
  { randomBytes: "randomBytes" },
  { randomBytes: null },
]) {
  assert.throws(() => createUuidv4Factory(invalidOptions), RangeError);
}
for (const invalidResult of [
  new Uint8Array(0),
  new Uint8Array(15),
  new Uint8Array(17),
  null,
  new Uint16Array(16),
  new Array(16).fill(0),
  "0123456789abcdef",
]) {
  const next = createUuidv4Factory({ randomBytes: () => invalidResult });
  assert.throws(() => next(), RangeError);
}

// uuidv7·createUuidv7Factory: 결과 형식(version 7, variant 8·9·a·b)과 인스턴스 안의 단조성을 검증한다.
const V7_DASHED =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const V7_COMPACT_UPPER = /^[0-9A-F]{12}7[0-9A-F]{3}[89AB][0-9A-F]{15}$/;

// 팩토리 생성은 옵션만 검증하고 crypto·시계에 접근하지 않으므로 세 상태 모두에서 성공한다.
const defaultV7Factory = createUuidv7Factory();
const upperCompactV7Factory = createUuidv7Factory({
  dashes: false,
  case: "upper",
});

// 주입한 난수원·시계는 crypto 상태와 무관하게 동작한다. 같은 ms에서 counter가 올라 문자열이 증가한다.
const fixedV7 = createUuidv7Factory({
  randomBytes: (length) => new Uint8Array(length),
  now: () => 1_700_000_000_000,
});
assert.equal(fixedV7(), "018bcfe5-6800-7000-8000-000000000000");
assert.equal(fixedV7(), "018bcfe5-6800-7001-8000-000000000000");
assert.equal(isUuid(fixedV7(), { version: 7 }), true);
// 인스턴스마다 상태가 독립이다. 새 팩토리는 counter가 다시 시작한다.
const otherV7 = createUuidv7Factory({
  randomBytes: (length) => new Uint8Array(length),
  now: () => 1_700_000_000_000,
});
assert.equal(otherV7(), "018bcfe5-6800-7000-8000-000000000000");
// 시계가 0 이상 2^48 미만의 정수가 아니면 그 호출이 RangeError다.
for (const invalidClock of [Number.NaN, -1, 1.5, 2 ** 48, "1700000000000"]) {
  const next = createUuidv7Factory({
    randomBytes: (length) => new Uint8Array(length),
    now: () => invalidClock,
  });
  assert.throws(() => next(), RangeError);
}
for (const invalidOptions of [
  null,
  [],
  "dashes",
  { typo: true },
  { dashes: null },
  { case: "mixed" },
  { randomBytes: "randomBytes" },
  { now: 0 },
  { now: null },
  { now: new Date() },
]) {
  assert.throws(() => createUuidv7Factory(invalidOptions), RangeError);
}
for (const invalidFormat of [
  null,
  [],
  "upper",
  { typo: true },
  { now: () => 0 },
  { randomBytes: () => new Uint8Array(10) },
]) {
  assert.throws(() => uuidv7(invalidFormat), RangeError);
}

if (mode === "present") {
  assert.match(randomId(), /^[A-Za-z0-9_-]{21}$/);
  assert.match(randomFactory(), /^[A-Za-z0-9_-]{21}$/);
  assert.match(
    randomId({ prefix: "usr", length: 16 }),
    /^usr_[A-Za-z0-9_-]{16}$/,
  );
  assert.match(
    randomId({ prefix: "req", timestamp: true, length: 8 }),
    /^req_[0-9a-z]{9}_[A-Za-z0-9_-]{8}$/,
  );
  assert.match(randomId({ preset: "digits", length: 6 }), /^[0-9]{6}$/);
  assert.match(
    randomId({ startWithLetter: true, length: 10 }),
    /^[A-Za-z][A-Za-z0-9_-]{9}$/,
  );
  const used = new Set();
  assert.match(
    randomId({ length: 12, isTaken: (id) => used.has(id) }),
    /^[A-Za-z0-9_-]{12}$/,
  );
  assert.match(
    randomId({ preset: "readable", length: 12, group: 4 }),
    /^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){2}$/,
  );
  assert.match(
    createRandomIdFactory({ isTaken: (id) => used.has(id) })(),
    /^[A-Za-z0-9_-]{21}$/,
  );
  // nanoid: 기본 길이 21, 지정 길이, 상한 길이. 문자는 base64url 64자뿐이다.
  assert.match(nanoid(), /^[A-Za-z0-9_-]{21}$/);
  for (const length of [1, 2, 21, 64, 1024]) {
    assert.match(nanoid(length), new RegExp(`^[A-Za-z0-9_-]{${length}}$`));
  }

  // 난수원을 실제로 호출했는지 확인한다(21자 ID 두 개가 같을 확률은 2^-126).
  assert.notEqual(nanoid(), nanoid());

  // 문자 집합이 64자 전부에 걸쳐 나온다(1024자 ID 100개에서 한 글자도 안 나올 확률은 무시할 수 있다).
  const seen = new Set();
  for (let i = 0; i < 100; i += 1) {
    for (const char of nanoid(1024)) seen.add(char);
  }
  assert.equal(seen.size, 64);

  // 인자 오류는 RangeError다.
  for (const invalid of [0, 1025, 1.5, Number.NaN, "21", null, {}, -1]) {
    assert.throws(() => nanoid(invalid), RangeError);
  }

  // uuidv4는 crypto.randomUUID를 쓰지 않는다. 호출되면 즉시 실패시킨다.
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    value: () => {
      throw new Error("crypto.randomUUID가 호출되었다");
    },
    configurable: true,
    writable: true,
  });

  // 기본 형식과 형식 옵션(대시 없음, 대문자).
  assert.match(uuidv4(), V4_DASHED);
  assert.equal(uuidv4().length, 36);
  assert.match(uuidv4({ dashes: false }), V4_COMPACT);
  assert.equal(uuidv4({ dashes: false }).length, 32);
  assert.match(uuidv4({ case: "upper" }), V4_DASHED_UPPER);
  assert.match(uuidv4({ dashes: false, case: "upper" }), V4_COMPACT_UPPER);
  assert.match(defaultFactory(), V4_DASHED);
  assert.match(upperCompactFactory(), V4_COMPACT_UPPER);

  // 난수원을 실제로 호출했는지 확인한다(122비트가 같을 확률은 무시할 수 있다). 호출마다 새 값이다.
  assert.notEqual(uuidv4(), uuidv4());
  assert.notEqual(defaultFactory(), defaultFactory());

  // 1000개 중 version 자리는 항상 4이고 variant 자리는 8, 9, a, b 네 값이 모두 나온다(하나도 안 나올 확률은 (3/4)^1000).
  const variants = new Set();
  const seenIds = new Set();
  for (let i = 0; i < 1000; i += 1) {
    const uuid = uuidv4();
    assert.equal(uuid.charAt(14), "4");
    variants.add(uuid.charAt(19));
    seenIds.add(uuid);
    assert.equal(isUuid(uuid, { version: 4 }), true);
  }
  assert.deepEqual([...variants].sort(), ["8", "9", "a", "b"]);
  assert.equal(seenIds.size, 1000);

  // 결과는 parseUuid로 16바이트가 되고 왕복해도 같은 문자열이다.
  const roundTrip = uuidv4();
  assert.equal(parseUuid(roundTrip).length, 16);
  assert.equal(stringifyUuid(parseUuid(roundTrip)), roundTrip);

  // uuidv7: 기본 형식과 형식 옵션. 실제 시계(Date.now)와 실제 crypto를 쓴다.
  assert.match(uuidv7(), V7_DASHED);
  assert.equal(uuidv7().length, 36);
  assert.equal(uuidv7({ dashes: false }).length, 32);
  assert.match(uuidv7({ dashes: false, case: "upper" }), V7_COMPACT_UPPER);
  assert.match(defaultV7Factory(), V7_DASHED);
  assert.match(upperCompactV7Factory(), V7_COMPACT_UPPER);
  assert.equal(isUuid(uuidv7(), { version: 7 }), true);

  // 5,000개를 연속으로 만들면 문자열이 엄격하게 증가한다(counter 고갈과 ms 전진을 모두 지난다).
  const sortable = [];
  for (let i = 0; i < 5000; i += 1) {
    sortable.push(defaultV7Factory());
  }
  for (let i = 1; i < sortable.length; i += 1) {
    assert.ok(
      sortable[i] > sortable[i - 1],
      `단조성 위반: ${sortable[i - 1]} >= ${sortable[i]}`,
    );
  }
  assert.equal(new Set(sortable).size, 5000);
  // 일회성 uuidv7도 기본 인스턴스를 공유해 호출 사이에 증가한다.
  assert.ok(uuidv7() < uuidv7());
  // 앞 48비트는 생성 시각(ms)이다. 실제 시계와 크게 떨어지지 않는다.
  const timestamp = Number.parseInt(
    uuidv7().replace(/-/g, "").slice(0, 12),
    16,
  );
  assert.ok(Math.abs(timestamp - Date.now()) < 60_000);
  assert.equal(stringifyUuid(parseUuid(uuidv7())).length, 36);
} else {
  failsClosed(() => randomId());
  failsClosed(randomFactory);
  // 미지원 환경에서는 fail-closed다. 인자 검증이 지원 확인보다 먼저다.
  failsClosed(() => nanoid());
  failsClosed(() => nanoid(1));
  assert.throws(() => nanoid(0), RangeError);
  assert.throws(() => nanoid(1025), RangeError);

  // uuidv4와 팩토리도 fail-closed다. 팩토리는 이미 만들어져 있고(위) 오류는 첫 호출에서 난다.
  failsClosed(() => uuidv4());
  failsClosed(() => uuidv4({ dashes: false }));
  failsClosed(() => defaultFactory());
  failsClosed(() => upperCompactFactory());
  // 실패한 뒤에도 같은 생성기가 같은 방식으로 실패한다(호출 사이에 남는 상태가 없다).
  failsClosed(() => defaultFactory());

  // uuidv7도 fail-closed다. 기본 인스턴스는 첫 호출에서 만들어지고 그 호출이 실패한다.
  failsClosed(() => uuidv7());
  failsClosed(() => uuidv7({ dashes: false }));
  failsClosed(() => defaultV7Factory());
  failsClosed(() => upperCompactV7Factory());
  failsClosed(() => uuidv7());
}
