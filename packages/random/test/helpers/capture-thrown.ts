/**
 * 함수가 던진 값을 그대로 돌려준다. 던지지 않으면 테스트를 실패시킨다.
 * `toThrow(error)`는 메시지만 비교하므로, 오류가 감싸지 않고 "같은 객체로" 전파되는지는 이 헬퍼로 확인한다.
 */
export function captureThrown(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error("예외가 발생하지 않았다");
}
