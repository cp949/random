/**
 * 테스트 헬퍼 `captureThrown`을 검증한다.
 * 오류가 "그대로 전파되는지"를 객체 동일성으로 확인하는 테스트가 이 헬퍼에 기댄다.
 */
import { describe, expect, it } from "vitest";
import { captureThrown } from "./helpers/capture-thrown.js";

describe("captureThrown", () => {
  it("함수가 던진 값을 같은 객체로 돌려준다", () => {
    const failure = new Error("실패");

    const thrown = captureThrown(() => {
      throw failure;
    });

    expect(thrown).toBe(failure);
  });

  it("Error가 아닌 값을 던져도 그대로 돌려준다", () => {
    expect(
      captureThrown(() => {
        // 이 테스트의 목적이 Error가 아닌 값도 그대로 전파되는지 확인하는 것이다.
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw "문자열";
      }),
    ).toBe("문자열");
  });

  it("예외를 던지지 않으면 테스트를 실패시킨다", () => {
    expect(() => captureThrown(() => undefined)).toThrow(
      "예외가 발생하지 않았다",
    );
  });
});
