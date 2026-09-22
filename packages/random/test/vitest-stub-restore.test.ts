import { describe, expect, it, vi } from "vitest";

// vitest 설정(unstubGlobals, restoreMocks)이 테스트 사이에 전역 변경을 되돌리는지 고정한다.
// 이후 crypto 하니스가 매 테스트 뒤 원상 복구된다는 가정에 기대므로 설정이 바뀌면 여기서 실패해야 한다.
describe("vitest 전역 복원 설정", () => {
  const originalCrypto = globalThis.crypto;
  const originalRandom = Math.random;

  it("전역 crypto를 stub하고 Math.random을 spy로 바꾼다", () => {
    vi.stubGlobal("crypto", { marker: true });
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    expect(Math.random()).toBe(0.5);
    expect(globalThis.crypto).not.toBe(originalCrypto);
  });

  it("다음 테스트에서 crypto stub이 복원된다", () => {
    expect(globalThis.crypto).toBe(originalCrypto);
  });

  it("다음 테스트에서 Math.random spy가 복원된다", () => {
    expect(Math.random).toBe(originalRandom);
  });
});
