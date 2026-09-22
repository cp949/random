/**
 * `SecureRandomUnavailableError`와 `IdCollisionError`의 계약을 검증한다.
 * 메시지 문구는 바뀔 수 있으므로 검사하지 않고 타입, `name`, 시도 횟수 속성만 확인한다.
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  IdCollisionError,
  SecureRandomUnavailableError,
} from "../../src/internal/errors.js";

describe("SecureRandomUnavailableError", () => {
  it("Error의 하위 클래스다", () => {
    const error = new SecureRandomUnavailableError();

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SecureRandomUnavailableError);
  });

  it("name이 클래스 이름과 같다", () => {
    expect(new SecureRandomUnavailableError().name).toBe(
      "SecureRandomUnavailableError",
    );
  });

  it("메시지가 비어 있지 않고 스택이 있다", () => {
    const error = new SecureRandomUnavailableError();

    expect(error.message).not.toBe("");
    expect(typeof error.stack).toBe("string");
  });

  it("RangeError로 잡히지 않는다", () => {
    // 인자 오류(RangeError)와 환경 미지원 오류는 catch 대상이 달라야 한다.
    expect(new SecureRandomUnavailableError()).not.toBeInstanceOf(RangeError);
  });
});

describe("IdCollisionError", () => {
  it("Error의 하위 클래스다", () => {
    const error = new IdCollisionError(3);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(IdCollisionError);
  });

  it("name이 클래스 이름과 같다", () => {
    expect(new IdCollisionError(3).name).toBe("IdCollisionError");
  });

  it("생성자에 넘긴 시도 횟수를 attempts로 보관한다", () => {
    expect(new IdCollisionError(1).attempts).toBe(1);
    expect(new IdCollisionError(10).attempts).toBe(10);
    expect(new IdCollisionError(1000).attempts).toBe(1000);
  });

  it("attempts는 읽기 전용 number 타입이다", () => {
    const error = new IdCollisionError(3);

    expectTypeOf(error.attempts).toEqualTypeOf<number>();
    // @ts-expect-error 읽기 전용 속성은 타입 수준에서 대입할 수 없다.
    error.attempts = 4;
  });

  it("시도 횟수 속성과 스택이 있다", () => {
    const error = new IdCollisionError(7);

    expect(error.attempts).toBe(7);
    expect(typeof error.stack).toBe("string");
  });

  it("RangeError로 잡히지 않는다", () => {
    // 인자 오류(RangeError)와 충돌 회피 실패는 catch 대상이 달라야 한다.
    expect(new IdCollisionError(3)).not.toBeInstanceOf(RangeError);
  });

  it("SecureRandomUnavailableError와 서로 다른 클래스다", () => {
    expect(new IdCollisionError(3)).not.toBeInstanceOf(
      SecureRandomUnavailableError,
    );
  });
});
