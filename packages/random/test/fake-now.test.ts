/**
 * 테스트 헬퍼 `fakeNow`를 검증한다.
 * 결정적 시계는 `uuidv7`과 timestamp가 있는 ID 테스트가 시간 진행, rollback, 호출 횟수를 통제하는 데 쓰므로
 * 이 헬퍼가 틀리면 그 테스트들이 아무것도 검증하지 못한 채 통과한다.
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import { fakeNow } from "./helpers/fake-now.js";

describe("fakeNow", () => {
  it("시작값을 돌려준다", () => {
    expect(fakeNow(1_700_000_000_000).now()).toBe(1_700_000_000_000);
  });

  it("시작값을 생략하면 0이다", () => {
    expect(fakeNow().now()).toBe(0);
  });

  it("호출해도 값이 저절로 바뀌지 않는다", () => {
    const clock = fakeNow(1000);

    expect([clock.now(), clock.now(), clock.now()]).toEqual([1000, 1000, 1000]);
  });

  it("advance는 기본 1씩 값을 올린다", () => {
    const clock = fakeNow(1000);

    clock.advance();

    expect(clock.now()).toBe(1001);
  });

  it("advance는 지정한 만큼 올리고 호출을 거듭하면 누적한다", () => {
    const clock = fakeNow(1000);

    clock.advance(10);
    clock.advance(5);

    expect(clock.now()).toBe(1015);
  });

  it("rewind는 기본 1씩 값을 되돌린다", () => {
    const clock = fakeNow(1000);

    clock.rewind();

    expect(clock.now()).toBe(999);
  });

  it("rewind는 지정한 만큼 되돌리고 시작값 아래로도 내려간다", () => {
    const clock = fakeNow(5);

    clock.rewind(3);
    expect(clock.now()).toBe(2);
    clock.rewind(10);
    expect(clock.now()).toBe(-8);
  });

  it("advance와 rewind를 같은 만큼 하면 원래 값으로 돌아온다", () => {
    const clock = fakeNow(1000);

    clock.advance(250);
    clock.rewind(250);

    expect(clock.now()).toBe(1000);
  });

  it("set은 값을 지정한 값으로 바꾼다", () => {
    const clock = fakeNow(1000);

    clock.set(36 ** 9 - 1);

    expect(clock.now()).toBe(36 ** 9 - 1);
  });

  it("set은 경계 시나리오용 비정상 값(음수, 소수, NaN)도 그대로 돌려준다", () => {
    const clock = fakeNow(1000);

    clock.set(-1);
    expect(clock.now()).toBe(-1);
    clock.set(1.5);
    expect(clock.now()).toBe(1.5);
    clock.set(Number.NaN);
    expect(clock.now()).toBeNaN();
  });

  it("set 뒤의 advance는 지정한 값에서 이어서 올린다", () => {
    const clock = fakeNow(1000);

    clock.set(50);
    clock.advance(2);

    expect(clock.now()).toBe(52);
  });

  it("calls는 now를 호출한 횟수다", () => {
    const clock = fakeNow(1000);
    expect(clock.calls).toBe(0);

    clock.now();
    clock.now();
    clock.now();

    expect(clock.calls).toBe(3);
  });

  it("advance, rewind, set과 calls 읽기는 호출 횟수에 세지 않는다", () => {
    const clock = fakeNow(1000);

    clock.advance();
    clock.rewind();
    clock.set(7);
    void clock.calls;
    void clock.calls;

    expect(clock.calls).toBe(0);
  });

  it("now를 떼어 내 옵션처럼 넘겨도 같은 시계를 읽는다", () => {
    const clock = fakeNow(1000);
    const { now } = clock;

    clock.advance(4);

    expect(now()).toBe(1004);
    expect(clock.calls).toBe(1);
  });

  it("시계마다 독립된 값과 호출 횟수를 가진다", () => {
    const first = fakeNow(1000);
    const second = fakeNow(2000);

    first.advance(5);
    first.now();
    first.now();

    expect(second.now()).toBe(2000);
    expect(second.calls).toBe(1);
    expect(first.now()).toBe(1005);
  });

  it("now의 타입은 () => number이고 옵션의 now 자리에 넘길 수 있다", () => {
    const clock = fakeNow();
    const options: { now?: () => number } = { now: clock.now };

    expectTypeOf(clock.now).toEqualTypeOf<() => number>();
    expect(options.now?.()).toBe(0);
  });
});
