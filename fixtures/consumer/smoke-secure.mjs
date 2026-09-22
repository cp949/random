/**
 * 소비자 런타임 smoke: 설치된 `@cp949/random/secure`(빌드된 dist)를 실제로 호출한다.
 * 단위 테스트는 `src`를 import하므로 컴파일된 ES2019 산출물이 실제 `globalThis.crypto` 위에서 동작하는지는
 * 여기서만 확인한다. 인자 `mode`는 `present`(실제 crypto), `absent`(crypto 제거), `throwing`(crypto 접근이 예외)이다.
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
  SecureRandomUnavailableError,
  createSecureSource,
  getCryptoCapabilities,
  randomBase64url,
  randomBytes,
  randomHex,
  randomInt,
  randomString,
} = await import("@cp949/random/secure");

/** 호출이 `SecureRandomUnavailableError`로 실패하는지 확인한다. */
const failsClosed = (call) =>
  assert.throws(call, (error) => error instanceof SecureRandomUnavailableError);

if (mode === "present") {
  assert.equal(getCryptoCapabilities().getRandomValues, true);

  // randomBytes: 실제 getRandomValues는 65,536바이트를 넘으면 예외를 던진다. chunk로 나눠야 통과한다.
  for (const length of [0, 1, 16, 65_535, 65_536, 65_537, 131_073]) {
    const bytes = randomBytes(length);
    assert.ok(bytes instanceof Uint8Array);
    assert.equal(bytes.length, length);
  }
  // 난수원을 실제로 호출했는지 확인한다(32바이트가 모두 0일 확률은 2^-256).
  assert.ok(randomBytes(32).some((byte) => byte !== 0));

  // randomInt: 32비트 경로, 53비트 경로, 범위 크기 1.
  for (let i = 0; i < 500; i += 1) {
    const roll = randomInt(1, 6);
    assert.ok(Number.isInteger(roll) && roll >= 1 && roll <= 6);
  }
  assert.equal(randomInt(5, 5), 5);
  const wide = randomInt(0, 2 ** 40);
  assert.ok(Number.isInteger(wide) && wide >= 0 && wide <= 2 ** 40);
  const widest = randomInt(0, Number.MAX_SAFE_INTEGER - 1);
  assert.ok(Number.isSafeInteger(widest) && widest >= 0);

  // createSecureSource: 생성 시점에 지원을 확인하고 [0, 2^32)의 word를 낸다.
  const source = createSecureSource();
  for (let i = 0; i < 100; i += 1) {
    const word = source();
    assert.ok(Number.isInteger(word) && word >= 0 && word < 2 ** 32);
  }

  // 인코더
  assert.match(randomHex(), /^[0-9a-f]{64}$/);
  assert.match(randomBase64url(), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(randomHex(65_537).length, 131_074);
  assert.equal(randomBase64url(65_537).length, Math.ceil((65_537 * 4) / 3));

  // randomString: 이모지 alphabet의 결과는 올바른 UTF-16이어야 한다(짝 없는 서로게이트면 encodeURIComponent가 던진다).
  assert.match(randomString("abc", 20), /^[abc]{20}$/);
  const faces = randomString("😀😁😂😃", 20);
  assert.equal(Array.from(faces).length, 20);
  encodeURIComponent(faces);

  // 인자 오류는 RangeError다.
  assert.throws(() => randomBytes(-1), RangeError);
  assert.throws(() => randomInt(2, 1), RangeError);
  assert.throws(() => randomHex(0), RangeError);
  assert.throws(() => randomString("a", 1), RangeError);

  const error = new SecureRandomUnavailableError();
  assert.ok(error instanceof Error);
  assert.equal(error.name, "SecureRandomUnavailableError");
} else {
  // getCryptoCapabilities는 예외 없이 getRandomValues: false를 보고하고, 나머지는 fail-closed다.
  assert.equal(getCryptoCapabilities().getRandomValues, false);
  failsClosed(() => randomBytes(0));
  failsClosed(() => randomBytes(16));
  failsClosed(() => randomInt(5, 5));
  failsClosed(() => randomInt(0, 9));
  failsClosed(() => randomHex());
  failsClosed(() => randomBase64url());
  failsClosed(() => randomString("ab", 1));
  failsClosed(() => createSecureSource());
  // 인자 검증이 지원 확인보다 먼저다.
  assert.throws(() => randomBytes(-1), RangeError);
}
