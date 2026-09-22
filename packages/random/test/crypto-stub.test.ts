import { describe, expect, it } from "vitest";
import { installCryptoStub } from "./helpers/crypto-stub.js";

describe("installCryptoStub: present(기본)", () => {
  it("getRandomValues가 배열을 채우고 같은 배열을 돌려준다", () => {
    installCryptoStub();
    const bytes = new Uint8Array(16);

    const returned = globalThis.crypto.getRandomValues(bytes);

    expect(returned).toBe(bytes);
    expect(bytes.some((value) => value !== 0)).toBe(true);
  });

  it("기본 fill은 고정 seed라 설치할 때마다 같은 바이트를 낸다", () => {
    installCryptoStub();
    const first = globalThis.crypto.getRandomValues(new Uint8Array(32));

    installCryptoStub();
    const second = globalThis.crypto.getRandomValues(new Uint8Array(32));

    expect(second).toEqual(first);
  });

  it("같은 설치 안에서 연속 호출은 서로 다른 바이트를 낸다", () => {
    installCryptoStub();

    const first = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const second = globalThis.crypto.getRandomValues(new Uint8Array(32));

    expect(second).not.toEqual(first);
  });

  it("Uint32Array 같은 다른 정수 배열도 바이트 단위로 채운다", () => {
    installCryptoStub();
    const words = new Uint32Array(4);

    globalThis.crypto.getRandomValues(words);

    expect(words.some((value) => value !== 0)).toBe(true);
  });

  it("byteOffset이 있는 view는 자기 범위만 채운다", () => {
    installCryptoStub({ fill: (view) => view.fill(0xab) });
    const buffer = new Uint8Array(8);

    globalThis.crypto.getRandomValues(buffer.subarray(2, 6));

    expect([...buffer]).toEqual([0, 0, 0xab, 0xab, 0xab, 0xab, 0, 0]);
  });

  it("calls에 호출마다 요청 바이트 크기를 기록한다", () => {
    const stub = installCryptoStub();

    globalThis.crypto.getRandomValues(new Uint8Array(10));
    globalThis.crypto.getRandomValues(new Uint32Array(4));

    expect(stub.calls).toEqual([10, 16]);
  });

  it("65,536바이트까지는 허용하고 65,537바이트부터 예외를 던진다", () => {
    const stub = installCryptoStub();

    expect(() =>
      globalThis.crypto.getRandomValues(new Uint8Array(65_536)),
    ).not.toThrow();
    expect(() =>
      globalThis.crypto.getRandomValues(new Uint8Array(65_537)),
    ).toThrow(/QuotaExceeded|65536/);
    expect(stub.calls).toEqual([65_536, 65_537]);
  });

  it("quota 옵션으로 한도를 바꾼다", () => {
    installCryptoStub({ quota: 8 });

    expect(() =>
      globalThis.crypto.getRandomValues(new Uint8Array(8)),
    ).not.toThrow();
    expect(() =>
      globalThis.crypto.getRandomValues(new Uint8Array(9)),
    ).toThrow();
  });

  it("메서드를 변수로 꺼내 호출하면 TypeError(Illegal invocation)를 던지고 기록하지 않는다", () => {
    const stub = installCryptoStub();
    const detached = globalThis.crypto.getRandomValues;

    expect(() => detached(new Uint8Array(1))).toThrow(TypeError);
    expect(() => detached(new Uint8Array(1))).toThrow("Illegal invocation");
    expect(stub.calls).toEqual([]);
  });

  it("bindCheck를 끄면 분리 호출도 통과한다", () => {
    installCryptoStub({ bindCheck: false });
    const detached = globalThis.crypto.getRandomValues;

    expect(() => detached(new Uint8Array(1))).not.toThrow();
  });

  it("fill 옵션으로 바이트를 직접 채운다", () => {
    installCryptoStub({ fill: (view) => view.fill(0x5a) });

    expect([...globalThis.crypto.getRandomValues(new Uint8Array(3))]).toEqual([
      0x5a, 0x5a, 0x5a,
    ]);
  });
});

describe("installCryptoStub: 부재·이상 상태", () => {
  it("absent는 crypto를 undefined로 만든다", () => {
    installCryptoStub({ mode: "absent" });

    expect(globalThis.crypto).toBeUndefined();
    expect("crypto" in globalThis).toBe(true);
  });

  it("empty는 getRandomValues가 없는 빈 객체다", () => {
    installCryptoStub({ mode: "empty" });

    expect(globalThis.crypto).toEqual({});
    expect(globalThis.crypto.getRandomValues).toBeUndefined();
  });

  it("not-function은 getRandomValues가 함수가 아니다", () => {
    installCryptoStub({ mode: "not-function" });

    expect(globalThis.crypto).toBeDefined();
    expect(typeof globalThis.crypto.getRandomValues).not.toBe("function");
  });

  it("throwing-accessor는 crypto 접근 자체가 예외를 던진다", () => {
    installCryptoStub({ mode: "throwing-accessor" });

    expect(() => globalThis.crypto).toThrow();
    expect("crypto" in globalThis).toBe(true);
  });
});

describe("installCryptoStub: 복원", () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "crypto",
  );

  it("모든 모드를 차례로 설치한다", () => {
    for (const mode of [
      "present",
      "absent",
      "empty",
      "not-function",
      "throwing-accessor",
    ] as const) {
      installCryptoStub({ mode });
    }

    expect(() => globalThis.crypto).toThrow();
  });

  it("다음 테스트에서 원래 crypto 속성이 그대로 복원된다", () => {
    expect(Object.getOwnPropertyDescriptor(globalThis, "crypto")).toEqual(
      originalDescriptor,
    );
    expect(() =>
      globalThis.crypto.getRandomValues(new Uint8Array(4)),
    ).not.toThrow();
  });

  it("present 설치도 다음 테스트에서 복원된다", () => {
    installCryptoStub({ fill: (view) => view.fill(0xee) });

    expect(globalThis.crypto.getRandomValues(new Uint8Array(1))[0]).toBe(0xee);
  });

  it("present 설치 뒤 실제 crypto가 돌아온다", () => {
    expect(Object.getOwnPropertyDescriptor(globalThis, "crypto")).toEqual(
      originalDescriptor,
    );
    expect(globalThis.crypto.getRandomValues(new Uint8Array(8))).not.toEqual(
      new Uint8Array(8).fill(0xee),
    );
  });
});
