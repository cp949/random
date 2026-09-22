# `@cp949/random/state` API 계약

상태 facade(R7)의 입력 검증, 오류, 결과값 계약을 기록한다. 계약은 이 문서와 소스의 TSDoc에 적힌 동작이다. 오류 메시지 문구는 계약이 아니다. design spec은 `docs/product/state-requirements.md`다.

## 공개 export

| export                         | 시그니처                                                                 | 요약                                                    |
| ------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------- |
| `createRandomState`            | `(seed?: number \| string, options?: RandomStateOptions) => RandomState` | 상태 객체를 만든다                                      |
| `rand`                         | `RandomState`                                                            | module-level 상태 facade(seed 없는 상태 하나)           |
| `RandomState`                  | 타입                                                                     | `source`와 leaf 11개 method를 가진 상태 객체 인터페이스 |
| `RandomStateOptions`           | 타입 `{ source?: RandomSource }`                                         | `createRandomState`의 두 번째 인자                      |
| `RandomSource`                 | 타입 `() => number`(root와 같은 타입)                                    | 재현 가능한 난수의 최소 계약                            |
| `SecureRandomUnavailableError` | 클래스(`./secure`와 같은 클래스)                                         | `getRandomValues`를 쓸 수 없는 환경에서 던지는 오류     |

```ts
import {
  createRandomState,
  rand,
  SecureRandomUnavailableError,
  type RandomSource,
  type RandomState,
  type RandomStateOptions,
} from "@cp949/random/state";
```

## 사용 환경

`./state`는 crypto에 접근하는 코드를 포함한다(root와 다르다). import, `createRandomState()` 생성, `state.source` 접근, method 참조 어느 시점에도 crypto를 호출하지 않는다 — seed 없는 상태의 첫 word 호출만 접근한다("seed 없는 상태와 lazy 초기화" 참고). root leaf를 단독 import한 번들은 `./state`의 코드를 포함하지 않는다(`check:root-isolation`이 검증한다). import 경로 조건(TypeScript 5.7 이상, `moduleResolution`이 `Bundler` 또는 `NodeNext`)은 `docs/api/random-core.md`와 같다. 실브라우저 실측과 검증 한계는 `docs/compatibility.md`에 있다.

## 공통 규칙

### `createRandomState`의 조합

| 호출                                       | 상태           | source                         |
| ------------------------------------------ | -------------- | ------------------------------ |
| `createRandomState()`                      | seed 없는 상태 | lazy 초기화 래퍼               |
| `createRandomState(seed)`                  | seed 상태      | `createXoshiro128Source(seed)` |
| `createRandomState(undefined, { source })` | 주입 상태      | `source` 그대로                |
| `createRandomState(seed, { source })`      | —              | `RangeError`                   |

### 검증 순서

위반은 모두 `RangeError`다. 검증 중 `source`를 호출하지 않는다.

1. `options`를 읽는다(아래 "옵션 객체 읽기").
2. `seed !== undefined`이고 `options.source !== undefined`면 충돌이다(`RangeError`, `null` seed도 충돌로 거부된다).
3. `seed !== undefined`면 `createXoshiro128Source(seed)`에 위임한다(`seed`는 safe integer 또는 문자열. `null`, `NaN`, `Infinity`, 소수, boolean, 객체는 `RangeError`. 숫자 정규화·문자열 해시는 `docs/api/random-core.md`의 `createXoshiro128Source` 규칙과 같다).
4. `options.source !== undefined`면 함수인지 확인한다(아니면 `RangeError`).

### 옵션 객체 읽기

`options`는 다음 네 규칙으로 읽는다(`docs/api/id.md` "옵션 객체 읽기"와 같은 규칙).

- `options`는 `undefined`(옵션 없음)이거나 객체여야 한다. `null`, 배열, 함수, 원시값은 `RangeError`다.
- 알 수 없는 키는 `RangeError`다(오타 방지). own enumerable 문자열 키(`Object.keys`) 기준이며, 값이 `undefined`인 알 수 없는 키도 거부한다.
- `source`는 `options.source`로 정확히 한 번 읽는다.
- 값이 `undefined`인 `source`는 생략과 같다. `null`은 값으로 검증되어 `RangeError`다.

### 오류 계약

- 새 오류 클래스는 없다.
- `createRandomState`가 직접 던지는 오류는 `RangeError` 하나다(위 검증 순서).
- seed 없는 상태의 첫 word 호출은 `getRandomValues`를 쓸 수 없을 때(`globalThis.crypto` 없음, `getRandomValues`가 함수 아님, `globalThis.crypto` 접근이 예외) `SecureRandomUnavailableError`를 던진다. `./secure`의 fail-closed 판정(`getCrypto`)과 같다. 다른 난수원으로 대체하지 않는다.
- method가 던지는 오류는 leaf의 오류(`RangeError`)와 source가 던진 예외(그대로 전파)다.
- 오류 메시지는 영어이며 문구는 계약이 아니다. 오류 타입만 계약이다.

### 계약 표

| 항목                                                                                                                 | 계약 여부                                                                         |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 바인딩: 같은 source 상태에서 `state.f(...args)`와 `f(state.source, ...args)`의 결과·오류·word 소비가 같다(11개 전부) | 계약                                                                              |
| seed 상태의 결과 열                                                                                                  | leaf와 같은 등급. `float`·`bool`·`sign`은 계약(R4 golden vector), 나머지는 비계약 |
| `./state` import, `createRandomState()` 생성, `state.source` 접근, method 참조가 crypto를 호출하지 않음              | 계약                                                                              |
| seed 없는 상태의 첫 word 호출이 미지원 환경에서 `SecureRandomUnavailableError`, 실패 후 다음 호출 재시도             | 계약                                                                              |
| `rand`가 모듈 인스턴스당 하나, 재seed 불가                                                                           | 계약                                                                              |
| `source` identity: 주입·seed 상태는 원본 함수 그대로, 같은 상태의 `state.source`와 각 method는 항상 같은 함수        | 계약                                                                              |
| `createRandomState` 검증과 `RangeError`, 검증 중 source 미호출                                                       | 계약. 문구는 비계약                                                               |
| method 집합                                                                                                          | 추가는 non-breaking, 제거·이름 변경은 breaking                                    |
| 초기화 산식(`Uint32Array(4)` 1회, all-zero 재추출, SplitMix32 미경유, word 순서 `s0..s3`)                            | 이 문서가 고정. 계약은 아니며 변경은 CHANGELOG에 기록                             |
| seed 없는 상태·`rand`의 결과값                                                                                       | 계약 아님(무작위)                                                                 |
| 오류 메시지 문구, own key의 순서                                                                                     | 계약 아님                                                                         |
| 매개변수 이름(`seed`, `options`, `source`)                                                                           | 고정(`d.ts`에 노출). 변경은 CHANGELOG                                             |

## `createRandomState(seed?, options?)`

```ts
function createRandomState(
  seed?: number | string,
  options?: RandomStateOptions,
): RandomState;
```

`seed`만 주면 `createXoshiro128Source(seed)`, `options.source`만 주면 그 함수, 둘 다 없으면 crypto로 lazy 초기화하는 xoshiro128\*\* source를 바인딩한다. 둘 다 주면 `RangeError`다. 생성 시 source를 호출하지 않고 crypto에도 접근하지 않는다. 호출마다 새 상태 객체를 돌려준다(인스턴스끼리 공유 없음).

```ts
import { createRandomState } from "@cp949/random/state";
import { createSecureSource } from "@cp949/random/secure";

const seeded = createRandomState("game-seed-1"); // seed 상태: 재현 가능
const secure = createRandomState(undefined, { source: createSecureSource() }); // 보안 source 주입
const anon = createRandomState(); // seed 없는 상태: 첫 사용 시 crypto로 초기화
```

## `RandomState`

```ts
interface RandomState {
  readonly source: RandomSource;

  int(min: number, max: number): number;
  float(): number;
  bool(p?: number): boolean;
  sign(): 1 | -1;
  uniform(min: number, max: number): number;

  choice<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  shuffleInPlace<T>(items: T[]): T[];
  sample<T>(items: readonly T[], count: number): T[];
  permutation(length: number): number[];
  weightedChoice<T>(items: readonly T[], weights: readonly number[]): T;
}
```

`source`는 바인딩한 `RandomSource`다. 주입·seed 상태는 넘긴/만든 함수 그대로이고, seed 없는 상태는 lazy 초기화 래퍼다. 같은 상태에서 `state.source`와 각 method는 항상 같은 함수다(`state.int === state.int`). `this`를 쓰지 않는 클로저라 분해(`const { int, choice } = rand`)해도 동작한다.

method 11개는 `(...args) => leaf(state.source, ...args)` 형태다. 자체 검증을 하지 않고 인자 검증, 검증 순서, 오류, word 소비, 결과, 반환 참조(`shuffleInPlace`가 같은 참조를 돌려주는 것 포함)가 모두 leaf와 같다.

| method           | 시그니처                                                    | leaf 계약                                                         |
| ---------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| `int`            | `(min: number, max: number) => number`                      | [`docs/api/random-core.md`](random-core.md#intsource-min-max)     |
| `float`          | `() => number`                                              | [`docs/api/random-core.md`](random-core.md#floatsource)           |
| `bool`           | `(p?: number) => boolean`                                   | [`docs/api/random-core.md`](random-core.md#boolsource-p)          |
| `sign`           | `() => 1 \| -1`                                             | [`docs/api/random-core.md`](random-core.md#signsource)            |
| `uniform`        | `(min: number, max: number) => number`                      | [`docs/api/random-core.md`](random-core.md#uniformsource-min-max) |
| `choice`         | `<T>(items: readonly T[]) => T`                             | [`docs/api/sampling.md`](sampling.md)                             |
| `shuffle`        | `<T>(items: readonly T[]) => T[]`                           | [`docs/api/sampling.md`](sampling.md)                             |
| `shuffleInPlace` | `<T>(items: T[]) => T[]`                                    | [`docs/api/sampling.md`](sampling.md)                             |
| `sample`         | `<T>(items: readonly T[], count: number) => T[]`            | [`docs/api/sampling.md`](sampling.md)                             |
| `permutation`    | `(length: number) => number[]`                              | [`docs/api/sampling.md`](sampling.md)                             |
| `weightedChoice` | `<T>(items: readonly T[], weights: readonly number[]) => T` | [`docs/api/sampling.md`](sampling.md)                             |

word 소비는 leaf 문서의 표를 따른다(계약 아님). `RandomState`는 인터페이스이고 값은 객체 리터럴이다. own enumerable 문자열 키는 정확히 `source` + method 11개(12개)다. class가 아니고 `instanceof`로 판별할 수 없으며 `Object.freeze`하지 않는다.

```ts
import { createRandomState } from "@cp949/random/state";

const state = createRandomState("dungeon-seed");
const roll = state.int(1, 6);
const loot = state.weightedChoice(["common", "rare"], [90, 10]);
const { float: unit, choice } = state; // 분해해도 동작한다
```

## seed 없는 상태와 lazy 초기화

`createRandomState()`(또는 `createRandomState(undefined, {})`, `createRandomState(undefined, { source: undefined })`)의 `source`는 첫 호출에서 초기화되는 비공개 래퍼다.

- 첫 호출: `getRandomValues(new Uint32Array(4))`를 메서드로 1회 호출해 word 4개를 받는다. 넷이 모두 `0`이면 다시 받는다(상한 없음). 그 4 word를 xoshiro128\*\* 상태로 그대로 쓴다(SplitMix32를 거치지 않는다). 첫 word를 돌려준다.
- 이후 호출: 만든 내부 source에 위임한다. crypto를 다시 접근하지 않는다.
- 실패: `getRandomValues`를 쓸 수 없으면 `SecureRandomUnavailableError`를 던지고 미초기화 상태를 유지한다. 다음 호출이 다시 시도한다.
- import, `createRandomState()` 생성, `state.source` 접근, method 참조는 crypto에 접근하지 않는다. 첫 word 호출만 접근한다.
- 초기화 후 환경 변화(crypto 제거 등)는 고려하지 않는다.

초기화 산식은 고정이며 계약이 아니다. 변경은 CHANGELOG에 기록한다.

seed 없는 상태는 보안 source 위의 facade가 아니다. 그것은 `createRandomState(undefined, { source: createSecureSource() })`다. seed 없는 상태·`rand`의 결과값은 무작위이고 계약이 아니며 보안 보증도 없다(`getRandomValues`로 seed한 PRNG일 뿐이다). token과 ID에는 `./secure`, `./id`를 쓴다.

## `rand`

```ts
const rand: RandomState;
```

`rand`는 `createRandomState()`(seed 없는 상태) 그 자체다. `rand`는 보안 용도가 아니다. token과 ID에는 `./secure`와 `./id`를 쓴다.

모듈 인스턴스당 하나이며 같은 모듈 그래프의 import끼리 상태를 공유한다(Worker·realm마다 별개). 재seed할 수 없다. 결과값은 비계약이다(seed 없는 상태와 같다).

```ts
import { rand } from "@cp949/random/state";

const roll = rand.int(1, 6); // 첫 사용에서 crypto로 초기화
```

## 레시피

```ts
import { createRandomState, rand } from "@cp949/random/state";
import { createSecureSource } from "@cp949/random/secure";
import { createWeightedSampler } from "@cp949/random";

// 1. 보안 source 주입.
const secureState = createRandomState(undefined, {
  source: createSecureSource(),
});

// 2. facade에 없는 함수(createWeightedSampler)에는 state.source를 넘긴다.
const rollLoot = createWeightedSampler(["common", "rare"], [90, 10]);
const loot = rollLoot(secureState.source);

// 3. 분해.
const { int, choice } = rand;

// 4. 테스트에서 seed 상태로 재현한다.
const testState = createRandomState("test-seed");
```

## 번들 측정

상태 facade는 bundle 크기 우선 경로가 아니다. leaf 11개와 crypto 접근 코드를 전부 포함하므로 크기가 중요하면 root leaf를 단독 import한다.

값 export 3개를 각각 단독 import한 minified + brotli 크기다. 측정일은 2026-09-22, 도구는 size-limit 14.0.0(`@size-limit/preset-small-lib` 14.0.0)이다. 한도는 다른 API 문서와 같은 공식 `ceil(측정값 × 1.5 / 50) × 50` B로 정했고 `packages/random/.size-limit.json`에 기록한다. 표의 측정값은 현재 빌드의 수치라서 한도를 정한 값과 달라질 수 있다.

| export                                | 측정값  | 한도    |
| ------------------------------------- | ------- | ------- |
| `createRandomState`                   | 1,782 B | 2,700 B |
| `rand`                                | 1,784 B | 2,700 B |
| `SecureRandomUnavailableError`(state) | 88 B    | 150 B   |
