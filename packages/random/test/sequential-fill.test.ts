/**
 * 테스트 헬퍼 `sequentialFill`과 `firstMismatch`를 검증한다.
 * 이 헬퍼가 틀리면 chunk 결합 테스트가 아무것도 검증하지 못한 채 통과하므로 따로 확인한다.
 */
import { describe, expect, it } from "vitest";
import { firstMismatch, sequentialFill } from "./helpers/sequential-fill.js";

describe("sequentialFill", () => {
  it("0부터 1씩 늘려 채운다", () => {
    const view = new Uint8Array(5);

    sequentialFill()(view);

    expect([...view]).toEqual([0, 1, 2, 3, 4]);
  });

  it("호출이 나뉘어도 이어서 채운다", () => {
    const fill = sequentialFill();
    const first = new Uint8Array(3);
    const second = new Uint8Array(2);

    fill(first);
    fill(second);

    expect([...first, ...second]).toEqual([0, 1, 2, 3, 4]);
  });

  it("251에 도달하면 0으로 돌아간다", () => {
    const view = new Uint8Array(253);

    sequentialFill()(view);

    expect(view[250]).toBe(250);
    expect(view[251]).toBe(0);
    expect(view[252]).toBe(1);
  });

  it("fill마다 독립된 카운터를 가진다", () => {
    const first = sequentialFill();
    const second = sequentialFill();
    first(new Uint8Array(10));
    const view = new Uint8Array(2);

    second(view);

    expect([...view]).toEqual([0, 1]);
  });
});

describe("firstMismatch", () => {
  it("모두 기대와 같으면 -1을 돌려준다", () => {
    const view = new Uint8Array(300);
    sequentialFill()(view);

    expect(firstMismatch(view)).toBe(-1);
  });

  it("비어 있으면 -1을 돌려준다", () => {
    expect(firstMismatch(new Uint8Array(0))).toBe(-1);
  });

  it("기대와 다른 첫 위치를 돌려준다", () => {
    const view = new Uint8Array(20);
    sequentialFill()(view);
    view[7] = 99;
    view[12] = 99;

    expect(firstMismatch(view)).toBe(7);
  });

  it("채워지지 않은 0도 위치 0 이후에서는 불일치로 본다", () => {
    const view = new Uint8Array(4);
    view[0] = 0;

    expect(firstMismatch(view)).toBe(1);
  });
});
