/** `fakeNow`가 돌려주는 결정적 시계. */
export interface FakeNow {
  /** 현재 값을 돌려준다. 호출해도 값이 바뀌지 않는다. `now` 옵션에 그대로 넘긴다. */
  readonly now: () => number;
  /** `now`를 호출한 횟수. `advance`, `rewind`, `set`과 이 속성을 읽는 것은 세지 않는다. */
  readonly calls: number;
  /** 값을 `ms`만큼 올린다(기본 1). */
  advance(ms?: number): void;
  /** 값을 `ms`만큼 되돌린다(기본 1). 시작값 아래로도 내려간다. */
  rewind(ms?: number): void;
  /** 값을 `value`로 바꾼다. 음수, 소수, `NaN` 같은 경계 시나리오용 값도 검증 없이 그대로 쓴다. */
  set(value: number): void;
}

/**
 * `start`에서 시작하는 결정적 시계를 만든다. `now()`는 호출할 때마다 현재 값을 돌려주고 스스로 진행하지 않는다.
 * 시간은 `advance`, `rewind`, `set`으로만 움직인다. `Date.now`나 타이머를 건드리지 않는다.
 * 팩토리를 만들 때 시계에 접근하지 않는지는 `calls`가 0인지로 확인한다.
 */
export function fakeNow(start = 0): FakeNow {
  let current = start;
  let calls = 0;
  return {
    now: () => {
      calls += 1;
      return current;
    },
    get calls() {
      return calls;
    },
    advance(ms = 1) {
      current += ms;
    },
    rewind(ms = 1) {
      current -= ms;
    },
    set(value) {
      current = value;
    },
  };
}
