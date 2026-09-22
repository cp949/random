/**
 * module-level `rand` facade를 검증한다(design spec 4절 ST-7). `rand.ts`는 mutation 대상이 아니므로
 * `describe`를 쓴다.
 */
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createRandomState } from "../../src/state/random-state.js";
import { installCryptoStub } from "../helpers/crypto-stub.js";
import { importFresh } from "../helpers/import-fresh.js";
import { rand } from "../../src/state/rand.js";
import * as stateEntry from "../../src/state/index.js";

const statePath = fileURLToPath(
  new URL("../../src/state/index.ts", import.meta.url),
);
type StateEntry = typeof import("../../src/state/index.js");

describe("rand", () => {
  it("createRandomState()와 같은 own key를 가진다", () => {
    expect(Object.keys(rand).sort()).toEqual(
      Object.keys(createRandomState()).sort(),
    );
  });

  it("같은 모듈 그래프의 두 import는 같은 객체다", () => {
    expect(stateEntry.rand).toBe(rand);
  });

  it("importFresh로 다시 불러오면 다른 객체다(모듈 인스턴스당 하나)", async () => {
    const first = await importFresh<StateEntry>(statePath);
    const second = await importFresh<StateEntry>(statePath);

    expect(first.rand).not.toBe(second.rand);
  });

  it("import·프로퍼티 접근만으로 getRandomValues를 호출하지 않는다", async () => {
    const stub = installCryptoStub();

    const fresh = await importFresh<StateEntry>(statePath);
    void fresh.rand.source;
    void fresh.rand.int;

    expect(stub.calls).toEqual([]);
  });

  it("첫 사용에서 16바이트를 한 번 요청하고 이후 요청하지 않는다", async () => {
    const stub = installCryptoStub();
    const fresh = await importFresh<StateEntry>(statePath);

    const value = fresh.rand.int(1, 6);
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(1);
    expect(value).toBeLessThanOrEqual(6);

    fresh.rand.float();
    fresh.rand.choice([1, 2]);

    expect(stub.calls).toEqual([16]);
  });

  it("crypto가 없으면 첫 사용이 SecureRandomUnavailableError로 실패한다(로드맵 완료 조건)", async () => {
    installCryptoStub({ mode: "absent" });

    const { rand: fresh, SecureRandomUnavailableError: Err } =
      await importFresh<StateEntry>(statePath);

    expect(() => fresh.int(1, 6)).toThrow(Err);
  });
});
