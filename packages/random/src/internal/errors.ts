/**
 * `globalThis.crypto.getRandomValues`를 쓸 수 없는 환경에서 던지는 오류.
 * `globalThis.crypto`가 없거나, `getRandomValues`가 함수가 아니거나, `globalThis.crypto` 접근이 예외를 던지는 세 경우가 같다.
 * 다른 난수원으로 대체하지 않으므로 호출자는 이 오류로 미지원 환경을 구분한다.
 */
export class SecureRandomUnavailableError extends Error {
  constructor() {
    super(
      "globalThis.crypto.getRandomValues is not available in this environment",
    );
    this.name = "SecureRandomUnavailableError";
  }
}

/**
 * `isTaken`이 재시도 상한(`maxAttempts`)까지 모든 시도에서 `true`를 돌려줘 ID를 만들지 못했을 때 던지는 오류.
 * `attempts`는 실제로 시도한 횟수이며 재시도 상한과 같다.
 * 옵션·인자 위반(`RangeError`)과 다른 오류라서 호출자는 이 오류로 충돌 회피 실패만 따로 잡을 수 있다.
 */
export class IdCollisionError extends Error {
  /** `isTaken`이 `true`를 돌려준 시도 횟수. */
  readonly attempts: number;

  constructor(attempts: number) {
    super(`isTaken returned true for all ${attempts} attempts`);
    this.name = "IdCollisionError";
    this.attempts = attempts;
  }
}
