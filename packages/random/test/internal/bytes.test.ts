/**
 * `internal/bytes.ts`의 chunk 분할, 기본 난수원, 주입 난수원 검사(`guardSource`)를 검증한다.
 * `installCryptoStub`은 브라우저처럼 한 번에 65,536바이트를 넘는 요청에서 예외를 던지고
 * `this`가 crypto가 아니면 "Illegal invocation"을 던진다. 분할 누락, 경계 오류,
 * 메서드를 떼어 낸 호출이 모두 이 테스트에서 실패해야 한다.
 *
 * 이 파일은 `describe`를 쓰지 않는다. `bytes.ts`가 mutation 대상이라서다. Stryker 10.0.0의 vitest 러너는
 * `describe` 안의 테스트를 mutant 실행 때 선택하지 못한다(`uniform-int.test.ts` 머리말 참고). 분류는 제목 접두어로 한다.
 */
import { expect, expectTypeOf, it } from "vitest";
import {
  defaultRandomBytes,
  fillRandom,
  guardSource,
  type ByteSource,
} from "../../src/internal/bytes.js";
import { getCrypto } from "../../src/internal/crypto.js";
import { SecureRandomUnavailableError } from "../../src/internal/errors.js";
import { pickChars } from "../../src/internal/sampling.js";
import { captureThrown } from "../helpers/capture-thrown.js";
import { installCryptoStub, type CryptoMode } from "../helpers/crypto-stub.js";
import { invalidBytes } from "../helpers/invalid-bytes.js";
import { seededBytes } from "../helpers/seeded-bytes.js";
import { firstMismatch, sequentialFill } from "../helpers/sequential-fill.js";

/** 요청 길이별로 기대하는 `getRandomValues` 호출 크기 열. */
const chunkCases: [length: number, calls: number[]][] = [
  [0, []],
  [1, [1]],
  [65_535, [65_535]],
  [65_536, [65_536]],
  [65_537, [65_536, 1]],
  [131_072, [65_536, 65_536]],
  [131_073, [65_536, 65_536, 1]],
];

const unsupportedModes: CryptoMode[] = [
  "absent",
  "empty",
  "not-function",
  "throwing-accessor",
];

for (const [length, calls] of chunkCases) {
  it(`fillRandom: 길이 ${length}는 호출 크기 ${JSON.stringify(calls)}로 나눠 빈틈없이 채운다`, () => {
    const stub = installCryptoStub({ fill: sequentialFill() });
    const buffer = new Uint8Array(length);

    fillRandom(getCrypto(), buffer);

    expect(stub.calls).toEqual(calls);
    expect(firstMismatch(buffer)).toBe(-1);
  });
}

it("fillRandom: getRandomValues를 crypto의 메서드로 호출한다", () => {
  // this 검사가 켜진 stub에서 메서드를 변수로 꺼내 호출하면 TypeError("Illegal invocation")가 난다.
  installCryptoStub({ bindCheck: true, fill: (view) => view.fill(0xcd) });
  const buffer = new Uint8Array(70_000);

  fillRandom(getCrypto(), buffer);

  expect(buffer.every((value) => value === 0xcd)).toBe(true);
});

it("fillRandom: byteOffset이 있는 view도 자기 범위만 채운다", () => {
  installCryptoStub({ fill: (view) => view.fill(0xee) });
  const backing = new Uint8Array(10);

  fillRandom(getCrypto(), backing.subarray(3, 7));

  expect([...backing]).toEqual([0, 0, 0, 0xee, 0xee, 0xee, 0xee, 0, 0, 0]);
});

it("fillRandom: 두 번째 chunk에서 getRandomValues가 던진 오류를 그대로 전파하고 더 요청하지 않는다", () => {
  const failure = new Error("두 번째 호출 실패");
  let count = 0;
  const stub = installCryptoStub({
    fill: () => {
      count += 1;
      if (count === 2) throw failure;
    },
  });

  const thrown = captureThrown(() =>
    fillRandom(getCrypto(), new Uint8Array(131_073)),
  );

  expect(thrown).toBe(failure);
  expect(stub.calls).toEqual([65_536, 65_536]);
});

it("fillRandom: 오류가 난 뒤의 다음 호출은 정상 동작한다", () => {
  let count = 0;
  installCryptoStub({
    fill: (view) => {
      count += 1;
      if (count === 1) throw new Error("첫 호출 실패");
      view.fill(0x11);
    },
  });
  expect(() => fillRandom(getCrypto(), new Uint8Array(8))).toThrow();
  const buffer = new Uint8Array(8);

  fillRandom(getCrypto(), buffer);

  expect(buffer.every((value) => value === 0x11)).toBe(true);
});

it("defaultRandomBytes: 요청한 길이의 Uint8Array<ArrayBuffer>를 돌려준다", () => {
  installCryptoStub();

  const bytes = defaultRandomBytes(16);

  expect(bytes).toBeInstanceOf(Uint8Array);
  expect(bytes).toHaveLength(16);
  expectTypeOf(bytes).toEqualTypeOf<Uint8Array<ArrayBuffer>>();
});

it("defaultRandomBytes: stub이 채운 바이트를 그대로 돌려준다", () => {
  installCryptoStub({ fill: (view) => view.fill(0xab) });

  const bytes = defaultRandomBytes(32);

  expect(bytes.every((value) => value === 0xab)).toBe(true);
});

it("defaultRandomBytes: 호출마다 새 ArrayBuffer를 쓰고 결과 길이와 같은 크기다", () => {
  installCryptoStub();

  const first = defaultRandomBytes(24);
  const second = defaultRandomBytes(24);

  // subtle.digest 같은 API에 넘겨도 남는 바이트가 섞이지 않는다.
  expect(first.byteOffset).toBe(0);
  expect(first.buffer.byteLength).toBe(24);
  expect(second.buffer).not.toBe(first.buffer);
});

for (const [length, calls] of chunkCases) {
  it(`defaultRandomBytes: 길이 ${length}는 호출 크기 ${JSON.stringify(calls)}로 채워 돌려준다`, () => {
    const stub = installCryptoStub({ fill: sequentialFill() });

    const bytes = defaultRandomBytes(length);

    expect(bytes).toHaveLength(length);
    expect(stub.calls).toEqual(calls);
    expect(firstMismatch(bytes)).toBe(-1);
  });
}

it("defaultRandomBytes: 길이 0은 getRandomValues를 호출하지 않고 빈 배열을 돌려준다", () => {
  const stub = installCryptoStub();

  const bytes = defaultRandomBytes(0);

  expect(bytes).toHaveLength(0);
  expect(stub.calls).toEqual([]);
});

for (const mode of unsupportedModes) {
  for (const length of [0, 16]) {
    it(`defaultRandomBytes: crypto가 ${mode}이면 길이 ${length}도 SecureRandomUnavailableError를 던진다`, () => {
      installCryptoStub({ mode });

      expect(() => defaultRandomBytes(length)).toThrow(
        SecureRandomUnavailableError,
      );
    });
  }
}

it("guardSource: 요청한 길이의 Uint8Array를 같은 인스턴스로 돌려준다", () => {
  const bytes = Uint8Array.of(1, 2, 3, 4);
  const guarded = guardSource(() => bytes);

  // 복사하지 않는다. 호출자가 받는 배열이 source가 만든 배열이다.
  expect(guarded(4)).toBe(bytes);
});

it("guardSource: byteOffset이 있는 view도 같은 인스턴스로 돌려준다", () => {
  const view = new Uint8Array(16).subarray(4, 8);
  const guarded = guardSource(() => view);

  expect(guarded(4)).toBe(view);
});

it("guardSource: 요청 길이 0에 빈 Uint8Array를 통과시킨다", () => {
  const empty = new Uint8Array(0);
  const guarded = guardSource(() => empty);

  expect(guarded(0)).toBe(empty);
});

it("guardSource: source에 요청 길이를 그대로 넘긴다", () => {
  const requested: number[] = [];
  const guarded = guardSource((length) => {
    requested.push(length);
    return new Uint8Array(length);
  });

  guarded(4);
  guarded(16);
  guarded(0);

  expect(requested).toEqual([4, 16, 0]);
});

it("guardSource: 감쌀 때는 source를 호출하지 않고 호출마다 한 번만 부른다", () => {
  let calls = 0;
  const guarded = guardSource((length) => {
    calls += 1;
    return new Uint8Array(length);
  });
  expect(calls).toBe(0);

  guarded(4);
  expect(calls).toBe(1);
  guarded(4);
  expect(calls).toBe(2);
});

it("guardSource: 원본과 다른 함수를 돌려주고 반환 타입은 ByteSource다", () => {
  const source: ByteSource = (length) => new Uint8Array(length);
  const guarded = guardSource(source);

  expect(guarded).not.toBe(source);
  expectTypeOf(guarded).toEqualTypeOf<ByteSource>();
});

for (const [label, value] of invalidBytes) {
  it(`guardSource: source 결과가 잘못된 값(${label})이면 RangeError로 실패한다`, () => {
    const guarded = guardSource(() => value as Uint8Array);

    expect(() => guarded(4)).toThrow(RangeError);
  });
}

it("guardSource: 계약 위반은 TypeError가 아니라 RangeError다", () => {
  for (const [, value] of invalidBytes) {
    const guarded = guardSource(() => value as Uint8Array);
    const thrown = captureThrown(() => guarded(4));

    expect(thrown).toBeInstanceOf(RangeError);
    expect(thrown).not.toBeInstanceOf(TypeError);
  }
});

it("guardSource: 호출마다 결과를 검사한다(첫 호출이 정상이어도 다음 호출의 위반을 잡는다)", () => {
  const results = [new Uint8Array(4), new Uint8Array(3), new Uint8Array(4)];
  let call = 0;
  const guarded = guardSource(() => results[call++]!);

  expect(guarded(4)).toBe(results[0]);
  expect(() => guarded(4)).toThrow(RangeError);
  // 위반 뒤에도 감싼 함수는 상태가 없어서 다음 정상 호출이 통과한다.
  expect(guarded(4)).toBe(results[2]);
});

it("guardSource: 요청 길이가 바뀌면 그 길이로 다시 대조한다", () => {
  const guarded = guardSource(() => new Uint8Array(4));

  expect(() => guarded(4)).not.toThrow();
  expect(() => guarded(5)).toThrow(RangeError);
  expect(() => guarded(3)).toThrow(RangeError);
});

it("guardSource: source가 던진 오류를 그대로 전파하고 다음 호출은 정상 동작한다", () => {
  const failure = new Error("난수원 실패");
  let call = 0;
  const guarded = guardSource((length) => {
    call += 1;
    if (call === 1) throw failure;
    return new Uint8Array(length);
  });

  expect(captureThrown(() => guarded(4))).toBe(failure);
  expect(guarded(4)).toHaveLength(4);
});

it("guardSource: 빈 배열을 돌려주는 source를 감싸 pickChars에 넘기면 무한 루프 없이 RangeError로 끝난다", () => {
  let calls = 0;
  const emptySource: ByteSource = () => {
    calls += 1;
    // 감싸지 않으면 pickChars는 빈 배열을 받고 같은 요청을 끝없이 반복한다.
    // 그때 테스트가 멈추지 않고 실패하도록 호출 횟수에 상한을 둔다.
    if (calls > 100) {
      throw new Error("source를 100번 넘게 호출했다: 무한 루프");
    }
    return new Uint8Array(0);
  };

  expect(() => pickChars(["a", "b", "c"], 4, guardSource(emptySource))).toThrow(
    RangeError,
  );
  expect(calls).toBe(1);
});

it("guardSource: 짧은 배열을 돌려주는 source도 pickChars에 닿기 전에 RangeError로 막는다", () => {
  const shortSource: ByteSource = (length) => new Uint8Array(length - 1);

  expect(() => pickChars(["a", "b", "c"], 4, guardSource(shortSource))).toThrow(
    RangeError,
  );
});

it("guardSource: 정상 source를 감싸도 pickChars 결과가 감싸지 않았을 때와 같다", () => {
  const chars = Array.from("abcdefghij");

  const plain = pickChars(chars, 32, seededBytes(1));
  const guarded = pickChars(chars, 32, guardSource(seededBytes(1)));

  expect(guarded).toBe(plain);
  expect(guarded).toHaveLength(32);
});
