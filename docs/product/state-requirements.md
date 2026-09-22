# 상태 facade 요구사항

- 상태: 승인 (2026-09-22)
- 작성일: 2026-09-22
- 확정 경로: 설계 인터뷰(grilling) 2라운드 + 추가 1문항(build fixture 방식)으로 결정을 확정했다. 결정과 근거는 9절 결정 기록에 있다.
- 대상: `@cp949/random` 0.1.0 `./state` subpath. 로드맵 R7의 design spec이며 함수 시그니처와 오류 계약을 확정한다.
- 출처: vectra에 대응물이 없다(vectra는 leaf마다 `rng?` 선택 인자와 fallback을 둔다). 이 저장소의 R4·R5 leaf(`docs/product/random-core-requirements.md`, `sampling-requirements.md`)와 `./secure`의 crypto 접근점 위에 새로 설계한다.
- 이 문서가 정하지 않는 것: 오류 메시지 문구, 번들 측정값, seed 없는 상태의 결과값(무작위).

## 1. 목적과 범위

소비자가 seed 유무와 무관하게 상태 객체 하나(`RandomState`)로 root(`.`)의 일반 helper 11개를 같은 이름의 method로 호출하고, seed가 필요 없는 곳에서는 module-level `rand`를 쓴다. 상태 객체는 `RandomSource` 하나를 들고 leaf 함수의 첫 인자에 그 source를 넣어 호출하는 얇은 바인딩이다. 새 산식·새 검증·새 오류는 없다.

### 1.1 포함

3~8절의 요구를 R7에 포함한다. 로드맵 R7 범위 4항목(`createRandomState`, `rand`, `rand` 비보안 문서, facade 비번들우선 문서)을 한 작업으로 진행한다.

### 1.2 제외

추가하려면 로드맵 §1의 기능 추가 판정 기준 셋에 모두 "예"여야 하고 로드맵 수정에 사용자 승인이 필요하다.

| 항목                                                                        | 제외 이유                                                                                                                                                                           |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createWeightedSampler`의 method(`state.weightedSampler(...)`)              | source를 받지 않는 함수라 바인딩 대상이 아니다. sampler는 `rollLoot(state.source)`로 쓴다(4절 ST-4의 `source` 노출이 탈출구다).                                                     |
| `./state`에서 root leaf 함수 재export                                       | "종류를 섞지 않는다"(로드맵 §1). root가 leaf의 유일한 집이다(R4·R5).                                                                                                                |
| class `RandomState`, `instanceof`, `Object.freeze`                          | 인터페이스 + 클로저 객체 리터럴로 충분하다(ST-8). class는 `this` 바인딩이 필요해 분해(`const { int } = rand`)가 깨지고, 값 이름 `RandomState`는 README의 타입 이름 결정과 어긋난다. |
| `createRandomState(seed, { source })`의 우선순위 규칙                       | 조용히 한쪽을 무시하지 않는다. `RangeError`다(ST-1).                                                                                                                                |
| `createRandomState(source)` 위치 인자 overload                              | 로드맵이 `createRandomState(seed?, { source? })`로 고정했다.                                                                                                                        |
| seed 없는 `createRandomState()`의 eager crypto 검사                         | README "확정된 제약"이 lazy로 고정했고, `rand`가 `createRandomState()` 그 자체이려면 생성 시 crypto 미접근이 필요하다(ST-5, ST-7).                                                  |
| `state.seed`·`state.isInitialized` 등 추가 프로퍼티                         | 프로퍼티는 `source` 하나다(ST-8). 상태 관찰은 로드맵 R9 후보(`getState`/`setState`)와 겹친다.                                                                                       |
| 재seed, `fork`, jump, 스냅샷                                                | 로드맵 R9 후보.                                                                                                                                                                     |
| method의 자체 인자 검증                                                     | leaf가 한다(ST-6). 두 번 검증하지 않는다.                                                                                                                                           |
| `docs/api/id.md` "옵션 객체 읽기" 절의 함수 목록에 `createRandomState` 추가 | `id.md`는 `./id` 계약 문서다. `docs/api/state.md`가 같은 네 규칙을 적고 `id.md`를 참조한다.                                                                                         |

## 2. 용어

- source: R4의 `RandomSource`. `[0, 2^32)`의 정수(word) 하나를 돌려주는 함수 `() => number`.
- leaf: source를 첫 인자로 받는 root 공개 함수. core 5개(`int`, `float`, `bool`, `sign`, `uniform`), sampling 6개(`choice`, `shuffle`, `shuffleInPlace`, `sample`, `permutation`, `weightedChoice`). 합계 11개.
- 상태 객체(`RandomState`): source 하나와 그 source를 바인딩한 leaf 11개의 method를 가진 객체.
- 바인딩: `state.f(...args)`가 `f(state.source, ...args)`와 같은 것.
- seed 상태: `createRandomState(seed)`. source는 `createXoshiro128Source(seed)`다.
- 주입 상태: `createRandomState(undefined, { source })`. source는 넘긴 함수 그대로다.
- seed 없는 상태: `createRandomState()`(또는 `createRandomState(undefined, {})`, `createRandomState(undefined, { source: undefined })`). source는 lazy 초기화 래퍼다. `rand`가 이 상태다.
- lazy 초기화: seed 없는 상태의 source가 첫 호출에서 `getRandomValues`로 xoshiro128\*\* 상태를 만드는 것. import, 생성, 프로퍼티 접근 시점에는 일어나지 않는다.
- 표식(marker): minify 후에도 번들에 살아남는 식별자·문자열. root 격리 게이트가 검사한다(7.5).

## 3. 모듈 구성

- `packages/random/src/state/`를 신설하고 subpath `./state`로 export한다(README "확정된 제약": 0.1.0 범위는 root 일반 random, `./state`, `./secure`, `./id`). `package.json`의 `exports`에 `"./state": { types: "./dist/state/index.d.ts", default: "./dist/state/index.js" }`를 추가한다.
- state 파일: `random-state.ts`(`createRandomState`, 타입 `RandomState`·`RandomStateOptions`, 비공개 lazy source), `rand.ts`(`rand`), `index.ts`.
- `rand`는 `rand.ts` 별도 파일에 둔다. `sideEffects: false`와 파일 분리로 `createRandomState`만 import한 번들에서 `rand`의 할당이 제거된다. 선언은 `/* @__PURE__ */ createRandomState()`로 표시한다.
- `core/xoshiro128.ts`에 비공개 `createXoshiro128SourceFromState(state: readonly [number, number, number, number]): RandomSource`를 추가한다. 배열을 복사해 자기 상태로 쓰고, `createXoshiro128Source`는 SplitMix32로 만든 4 word를 이 함수에 넘긴다. root 공개 export에 넣지 않는다. golden vector와 mutation 대상은 그대로다.
- `internal/crypto.ts`의 `CryptoLike.getRandomValues`를 `<T extends Uint8Array | Uint32Array>(array: T): T`로 넓힌다. `./secure`의 공개 타입은 바뀌지 않는다. `getCrypto()`가 계속 `globalThis.crypto`의 유일한 접근점이다.
- import 관계: `state/random-state.ts` → leaf 11개, `core/xoshiro128.ts`(`createXoshiro128Source`, `createXoshiro128SourceFromState`), `core/random-source.ts`(`assertRandomSource`), `internal/validate.ts`(`readOptions`), `internal/crypto.ts`(`getCrypto`). `state/index.ts`가 `internal/errors.ts`의 `SecureRandomUnavailableError`와 `core/random-source.ts`의 `RandomSource` 타입을 재export한다.
- root(`src/index.ts`)는 `./state`를 import하지 않는다. root는 crypto에 접근하는 코드를 계속 포함하지 않는다(7.5의 게이트가 확인한다).
- 부속물: `.size-limit.json`에 `createRandomState`·`rand`(path `dist/state/index.js`), `stryker.config.mjs`의 `mutate`에 `src/state/random-state.ts`, `fixtures/consumer/usage-state.ts`·`smoke-state.mjs`, 새 게이트 `scripts/check-root-isolation.mjs`와 `scripts/test/check-root-isolation.test.mjs`(7.5).

## 4. 공개 API 요구

```ts
interface RandomStateOptions {
  source?: RandomSource;
}

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

function createRandomState(
  seed?: number | string,
  options?: RandomStateOptions,
): RandomState;

const rand: RandomState;
```

- **ST-1. `createRandomState(seed?, options?)`.** 조합은 넷이다.

  | 호출                                       | 상태           | source                               |
  | ------------------------------------------ | -------------- | ------------------------------------ |
  | `createRandomState()`                      | seed 없는 상태 | lazy 초기화 래퍼(ST-5)               |
  | `createRandomState(seed)`                  | seed 상태      | `createXoshiro128Source(seed)`(ST-3) |
  | `createRandomState(undefined, { source })` | 주입 상태      | `source` 그대로(ST-4)                |
  | `createRandomState(seed, { source })`      | —              | `RangeError`(5절)                    |

  `seed`가 `undefined`가 아니면서 `options.source`도 `undefined`가 아니면 충돌이다. 검증 순서는 5절이다. 생성 시 source를 호출하지 않고 crypto에도 접근하지 않는다. 호출마다 새 상태 객체를 돌려준다(인스턴스끼리 공유 없음).

- **ST-2. `seed`.** `createXoshiro128Source`와 같은 규칙(`normalizeSeed`): safe integer 또는 문자열. `null`, `NaN`, `Infinity`, 소수, boolean, 객체는 `RangeError`. `undefined`는 생략이다. 숫자 seed의 uint32 정규화와 문자열 seed의 FNV-1a 해시, 별칭 관계(`seed`와 `seed + 2^32`)는 R4 SRC-3을 그대로 따른다.

- **ST-3. seed 상태.** `state.source`는 `createXoshiro128Source(seed)`가 돌려준 함수 그 자체다(래퍼 없음). 따라서 `createRandomState(seed).float()`의 결과 열은 `float(createXoshiro128Source(seed))`와 같고, `float`·`bool`·`sign`은 R4 재현성 계약의 golden vector를 그대로 만족한다.

- **ST-4. 주입 상태.** `options.source`는 함수여야 한다(`assertRandomSource`. 아니면 `RangeError`). `state.source === options.source`다(래퍼 없음). 반환값은 매 호출 검증하지 않는다(R4 SRC-1). source가 던진 예외는 method가 감싸지 않고 그대로 전파한다. `./secure`의 `createSecureSource()`를 넘기는 것이 보안 난수 위의 facade를 얻는 유일한 방법이다. seed 없는 상태는 이것이 아니다(ST-5).

- **ST-5. seed 없는 상태와 lazy 초기화.** `state.source`는 `random-state.ts`의 비공개 래퍼 함수다.
  - 첫 호출: `getCrypto()`로 지원을 확인한다(미지원이면 `SecureRandomUnavailableError`). `crypto.getRandomValues(new Uint32Array(4))`를 메서드로 호출해 word 4개를 받는다. 넷이 모두 `0`이면 다시 받는다(상한 없음). `createXoshiro128SourceFromState([w0, w1, w2, w3])`로 내부 source를 만들어 보관하고 그 첫 word를 돌려준다. SplitMix32를 거치지 않는다(word가 곧 상태다).
  - 이후 호출: 내부 source에 위임한다. crypto를 다시 접근하지 않는다.
  - 실패: `getCrypto()`나 `getRandomValues`가 던지면 그대로 전파하고 미초기화 상태를 유지한다. 다음 호출이 다시 시도한다(`createWordSource`의 "다음 호출은 다시 채우기를 시도한다"와 같은 정책).
  - `./state` import, `createRandomState()` 생성, `state.source` 프로퍼티 접근, method 참조(`state.int`)는 crypto에 접근하지 않는다. 첫 word 호출만 접근한다.
  - 초기화 후 환경 변화(crypto 제거 등)는 고려하지 않는다(`createSecureSource`와 같다).
  - 결과값은 무작위이며 계약이 아니다. 보안 보증도 없다(`getRandomValues`로 seed한 PRNG일 뿐이다). token과 ID에는 `./secure`, `./id`를 쓴다.

- **ST-6. method.** 11개 method는 `(...args) => leaf(state.source, ...args)` 형태의 클로저다. 인자 검증, 검증 순서, 오류, word 소비, 결과, 반환 참조(`shuffleInPlace`가 같은 참조를 돌려주는 것 등)는 모두 leaf와 같다. method는 자체 검증을 하지 않는다(leaf의 `assertRandomSource`는 항상 통과한다). 상태 생성 시 한 번 만들어 `state.int === state.int`이며 `this`를 쓰지 않으므로 분해(`const { int, choice } = rand`)해도 동작한다.

- **ST-7. `rand`.** `rand.ts`에 `export const rand = /* @__PURE__ */ createRandomState()`. seed 없는 상태의 모든 규칙(ST-5)이 적용된다. 모듈 인스턴스당 하나이며 같은 모듈 그래프의 import끼리 상태를 공유한다(Worker·realm마다 별개). 재seed할 수 없다.

- **ST-8. 객체 형태.** `RandomState`는 인터페이스이고 값은 객체 리터럴이다. own enumerable 문자열 키는 정확히 `source`와 method 11개(12개)다. class가 아니고 `instanceof`로 판별할 수 없으며 freeze하지 않는다.

- **ST-9. `./state` export.** 값: `createRandomState`, `rand`. 타입: `RandomState`, `RandomStateOptions`, `RandomSource`(재export). 오류: `SecureRandomUnavailableError`(재export. 소비자가 `rand` 실패를 `instanceof`로 잡는다). leaf 함수는 재export하지 않는다.

## 5. 검증 규칙

`createRandomState`의 검증은 다음 순서다. 위반은 모두 `RangeError`다. 검증 중 source를 호출하지 않는다.

1. **OPT-1. `options`.** `internal/validate.ts`의 `readOptions(options, ["source"])`. `undefined`는 옵션 없음. `null`, 배열, 함수, 원시값은 `RangeError`. 알 수 없는 키는 `RangeError`(own enumerable 문자열 키 기준, 값이 `undefined`여도 거부). 값이 `undefined`인 `source`는 생략과 같다. `docs/api/id.md` "옵션 객체 읽기"와 같은 규칙이다.
2. **OPT-2. 충돌.** `seed !== undefined`이고 `options.source !== undefined`면 `RangeError`. `null` seed도 `undefined`가 아니므로 충돌로 먼저 거부된다.
3. **OPT-3. `seed`.** `seed !== undefined`면 `createXoshiro128Source(seed)`에 위임한다(ST-2의 규칙으로 `RangeError`).
4. **OPT-4. `source`.** `options.source !== undefined`면 `assertRandomSource`(함수가 아니면 `RangeError`).

method의 인자 검증은 leaf가 한다(ST-6). 검증 실패 시 source를 호출하지 않는 것도 leaf 규칙이다.

## 6. 오류 계약

- 새 오류 클래스를 만들지 않는다.
- `createRandomState`가 직접 던지는 오류는 `RangeError` 하나다(5절).
- seed 없는 상태의 첫 word 호출은 `getRandomValues`를 쓸 수 없을 때(`globalThis.crypto` 없음, `getRandomValues`가 함수 아님, `globalThis.crypto` 접근이 예외) `SecureRandomUnavailableError`를 던진다. `./secure`의 fail-closed 판정(`getCrypto`)과 같다. 다른 난수원으로 대체하지 않는다.
- method가 던지는 오류는 leaf의 오류(`RangeError`)와 source가 던진 예외(그대로 전파)다.
- 오류 메시지는 영어이며 문구는 계약이 아니다. 오류 타입만 계약이다.

## 7. 보장과 검증

### 7.1 계약 표

API 문서(`docs/api/state.md`)에 항목별로 싣는다(로드맵 §4 "결과값이 계약인지 여부").

| 항목                                                                                                                 | 계약 여부                                                                         |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 바인딩: 같은 source 상태에서 `state.f(...args)`와 `f(state.source, ...args)`의 결과·오류·word 소비가 같다(11개 전부) | 계약                                                                              |
| seed 상태의 결과 열                                                                                                  | leaf와 같은 등급. `float`·`bool`·`sign`은 계약(R4 golden vector), 나머지는 비계약 |
| `./state` import, `createRandomState()` 생성, `state.source` 접근, method 참조가 crypto를 호출하지 않음              | 계약                                                                              |
| seed 없는 상태의 첫 word 호출이 미지원 환경에서 `SecureRandomUnavailableError`, 실패 후 다음 호출 재시도             | 계약                                                                              |
| `rand`가 모듈 인스턴스당 하나, 재seed 불가                                                                           | 계약                                                                              |
| `source` identity: 주입·seed 상태는 원본 함수 그대로, 같은 상태의 `state.source`와 각 method는 항상 같은 함수        | 계약                                                                              |
| `createRandomState` 검증(5절)과 `RangeError`, 검증 중 source 미호출                                                  | 계약. 문구는 비계약                                                               |
| method 집합                                                                                                          | 추가는 non-breaking, 제거·이름 변경은 breaking                                    |
| 초기화 산식(`Uint32Array(4)` 1회, all-zero 재추출, SplitMix32 미경유, word 순서 `s0..s3`)                            | 이 문서가 고정. 계약은 아니며 변경은 CHANGELOG에 기록                             |
| seed 없는 상태·`rand`의 결과값                                                                                       | 계약 아님(무작위)                                                                 |
| 오류 메시지 문구, own key의 순서                                                                                     | 계약 아님                                                                         |
| 매개변수 이름(`seed`, `options`, `source`)                                                                           | 고정(`d.ts`에 노출). 변경은 CHANGELOG                                             |

### 7.2 word 소비와 crypto 호출

계약이 아니다. API 문서에 싣는다.

| 항목                               | 값                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------ |
| method의 word 소비                 | leaf와 같다(`docs/api/random-core.md`, `sampling.md`의 표)               |
| seed 없는 상태의 `getRandomValues` | 첫 word 호출 시 1회, 16바이트. all-zero가 나올 때마다 1회 추가. 이후 0회 |
| seed 상태·주입 상태                | 0회                                                                      |

### 7.3 경계 정책

테스트로 고정한다. crypto 상태는 `test/helpers/crypto-stub.ts`의 `installCryptoStub`(present·absent·empty·not-function·throwing-accessor)로 만든다.

| 입력                                                                                                     | 결과                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `./state` import(crypto 4개 이상 상태)                                                                   | 예외 없음. `getRandomValues` 호출 0회(`entries.test.ts`가 자동 포함)                                                                             |
| `createRandomState()` 생성, `state.source` 접근, `state.int` 참조(present)                               | `getRandomValues` 호출 0회                                                                                                                       |
| `createRandomState().float()`(present)                                                                   | `stub.calls === [16]`. 두 번째 `float()` 후에도 `[16]`                                                                                           |
| `createRandomState().float()`, stub `fill`이 첫 16바이트를 `0`으로, 다음 16바이트를 0이 아닌 값으로 채움 | `stub.calls === [16, 16]`. 결과는 `[0, 1)`                                                                                                       |
| `createRandomState().int(1, 6)`(absent·empty·not-function·throwing-accessor)                             | `SecureRandomUnavailableError`. 생성과 `source` 접근은 예외 없음                                                                                 |
| 위 실패 뒤 같은 상태에서 다시 `int(1, 6)`(여전히 미지원)                                                 | 다시 `SecureRandomUnavailableError`                                                                                                              |
| 위 실패 뒤 같은 테스트 안에서 `installCryptoStub()`(present)로 복구 후 `int(1, 6)`                       | 정상 결과(재시도)                                                                                                                                |
| `createRandomState(1)`, `createRandomState("x")`(absent)                                                 | 생성·호출 모두 정상. `getRandomValues` 호출 0회                                                                                                  |
| `createRandomState(0).float()` ×2, `.bool()` ×5, `.sign()` ×5                                            | `docs/api/random-core.md`의 seed `0` golden 열(`0.09818795896944998`, `0.8623031194841013`; `false, true, true, true, false`; `-1, 1, 1, 1, -1`) |
| `createRandomState(undefined, { source: fn })`                                                           | `state.source === fn`. 생성 시 `fn` 호출 0회                                                                                                     |
| `createRandomState(undefined, { source: undefined })`, `createRandomState(undefined, {})`                | seed 없는 상태(present에서 첫 호출 시 `[16]`)                                                                                                    |
| `createRandomState(1, { source: fn })`, `createRandomState(null, { source: fn })`                        | `RangeError`. `fn` 호출 0회                                                                                                                      |
| `createRandomState(null)`, `(1.5)`, `(NaN)`, `(Infinity)`, `(true)`, `({})`                              | `RangeError`                                                                                                                                     |
| `createRandomState(undefined, null)`, `(undefined, [])`, `(undefined, "x")`, `(undefined, () => 1)`      | `RangeError`                                                                                                                                     |
| `createRandomState(undefined, { foo: 1 })`, `(undefined, { foo: undefined })`                            | `RangeError`(알 수 없는 키)                                                                                                                      |
| `createRandomState(undefined, { source: 1 })`, `(undefined, { source: null })`                           | `RangeError`                                                                                                                                     |
| 상태 객체의 `Object.keys`                                                                                | 정확히 `source` + leaf 11개 이름(집합 비교)                                                                                                      |
| `state.int === state.int`, `state.source === state.source`                                               | `true`                                                                                                                                           |
| `const { int } = createRandomState(1); int(1, 6)`                                                        | `int(createXoshiro128Source(1), 1, 6)`과 같다                                                                                                    |
| 주입 spy source에 `state.int("a", 1)`                                                                    | `RangeError`. spy 호출 0회                                                                                                                       |
| 주입 source가 예외를 던짐                                                                                | 같은 예외가 method에서 그대로 나온다                                                                                                             |
| `state.shuffleInPlace(arr)`                                                                              | 반환값이 `arr` 같은 참조                                                                                                                         |
| 두 `import`(같은 모듈 그래프)의 `rand`                                                                   | 같은 객체. `importFresh` 두 번은 다른 객체                                                                                                       |

### 7.4 검증

| 항목                                | 검증 방법                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 바인딩 일치(로드맵 완료 조건)       | 11개 method를 표(`[이름, 인자 배열]`)로 두고 같은 seed의 `createRandomState(seed)`와 `createXoshiro128Source(seed)`에 같은 호출 열을 적용해 결과가 같음을 확인한다. 스칼라는 `toBe`(`Object.is`), 배열은 `toEqual`. 표에서 이름이 빠지면 own key 검사(7.3)가 잡는다.                                                                                                                                                                                                 |
| 경계 정책                           | 7.3 표 전부.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| import 시 crypto 미접근             | 기존 `entries.test.ts`가 `exports`의 모든 entry를 열거하므로 `./state` 추가만으로 포함된다.                                                                                                                                                                                                                                                                                                                                                                          |
| `rand` 단일성                       | `import`/`importFresh`(7.3 마지막 행).                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `createXoshiro128SourceFromState`   | `createXoshiro128Source`의 golden vector가 그대로 통과한다(리팩터링 회귀). 상태 배열 복사: 넘긴 배열을 바꿔도 source가 영향받지 않는다.                                                                                                                                                                                                                                                                                                                              |
| `CryptoLike` 확장                   | `pnpm check-types`. `fillRandom`·`createWordSource`의 기존 테스트 통과.                                                                                                                                                                                                                                                                                                                                                                                              |
| root entry가 crypto에 접근하지 않음 | 7.5의 게이트. 기존 `entries.test.ts`·`check:consumer`의 crypto 제거 harness.                                                                                                                                                                                                                                                                                                                                                                                         |
| `Math.random` 0건, ES2019           | 기존 정적 게이트(grep, `check:escompat`). `Uint32Array`는 ES2015다.                                                                                                                                                                                                                                                                                                                                                                                                  |
| 소비자 fixture                      | `fixtures/consumer/usage-state.ts`: seed·주입(`createSecureSource()`)·seed 없는 상태, 분해, `rollLoot(rand.source)`, `SecureRandomUnavailableError` `instanceof`. `smoke-state.mjs`: present에서 `rand.int(1, 6)` 범위와 `createRandomState(1).float() === float(createXoshiro128Source(1))`, absent·throwing에서 `createRandomState(1)` 정상·`rand.int(1, 6)`이 `SecureRandomUnavailableError`. `scripts/test/check-consumer.test.mjs`의 등록 검사에 자동 포함된다. |
| 번들                                | `createRandomState`·`rand`를 각각 단독 import한 크기를 측정해 `.size-limit.json`에 등록. 한도는 `ceil(측정값 × 1.5 / 50) × 50` B. `docs/api/state.md`에 "bundle 크기 우선 경로가 아니다"의 근거로 적는다.                                                                                                                                                                                                                                                            |
| mutation                            | `src/state/random-state.ts`를 `mutate`에 추가하고 점수 하한 95를 유지한다. 대상 테스트는 최상위 `it`(TRP-004). all-zero 재추출 루프와 lazy 분기가 7.3의 stub 테스트로 죽는다.                                                                                                                                                                                                                                                                                        |

로드맵 R7 완료 조건과의 대응: `./state` import 시 crypto 미호출(`entries.test.ts`), 같은 seed 상태 == leaf 조합(바인딩 일치), crypto 없을 때 `rand` 첫 사용 실패(7.3), root leaf import의 격리(7.5).

### 7.5 root 격리 게이트

로드맵 완료 조건 "root leaf import가 `./state`, `./secure`, `./id`의 코드를 포함하지 않는다는 것이 build fixture로 확인된다"를 새 게이트 `check:root-isolation`으로 충족한다.

- 스크립트: `scripts/check-root-isolation.mjs`. `runRootIsolationCheck(repoRoot, options?)`를 export하고 `{ ok, problems, bundled }`를 돌려준다. `process.argv[1]` 가드로만 종료 코드를 정한다(다른 게이트와 같은 형태).
- 번들러: Vite 8의 JS API `build()`(rolldown). 저장소 root devDependency라 추가 의존성이 없다. 출력은 저장소 안 `_tmp/root-isolation-*/`(gitignore 대상. `size.test.mjs`와 같은 이유로 저장소 `node_modules`가 필요하다)에 두고 끝나면 지운다.
- entry: 배포 대상 패키지(`listPublishablePackages`)의 `exports` 키마다 dist default 파일을 import해 값 export를 `Object.keys`로 열거하고(`check:size-config`와 같은 방식) `import { a, b, ... } from "<dist 절대 경로>"; console.log(a, b, ...)` entry를 만들어 ES 포맷·minify로 번들한다. root는 값 export 전부를 한 entry에 넣는다(전체가 표식을 안 담으면 부분집합도 안 담는다).
- 규칙: 스크립트의 registry(`ISOLATION_RULES`, 패키지 이름 → entry 키 → `{ forbidden?, required? }`)에 둔다. 테스트가 `options.rules`로 대체할 수 있다.

  | entry      | forbidden(없어야 함)                                                                 | required(있어야 함)                               |
  | ---------- | ------------------------------------------------------------------------------------ | ------------------------------------------------- |
  | `.`        | `getRandomValues`, `SecureRandomUnavailableError`, `IdCollisionError`, `Uint32Array` | —                                                 |
  | `./state`  | —                                                                                    | `getRandomValues`, `Uint32Array`                  |
  | `./secure` | —                                                                                    | `getRandomValues`, `SecureRandomUnavailableError` |
  | `./id`     | —                                                                                    | `getRandomValues`, `IdCollisionError`             |

  표식은 minify 후에도 남는 것만 쓴다: `getRandomValues`는 프로퍼티 접근, 오류 이름은 `this.name = "..."` 문자열 리터럴, `Uint32Array`는 전역이다. root dist는 현재 넷 다 포함하지 않는다(`crypto`는 한글 주석에만 있고 주석은 minify에서 사라진다). required 검사는 표식 이름이 바뀌어 forbidden 검사가 공허해지는 것을 막는다. 규칙이 없는 entry는 문제로 보고한다(새 subpath가 규칙을 선언하게 강제. `check:size-config`의 등록 게이트와 같은 원칙).

- 자체 테스트: `scripts/test/check-root-isolation.test.mjs`. `_tmp/` 안에 합성 패키지를 만들어 (1) root가 `globalThis.crypto.getRandomValues`를 호출하는 함수를 export하면 forbidden 표식으로 실패, (2) required 표식이 없는 entry는 실패, (3) 규칙 없는 entry는 실패, (4) 정상 구성은 통과를 확인한다. `SLOW` timeout을 쓴다.
- 배선: 루트 `package.json`에 `check:root-isolation`을 추가하고 `verify`에서 `check:escompat` 다음에 둔다(`scripts/test/verify.test.mjs`가 `verify` 등록과 `build` 이후 순서를 강제한다). CI는 `verify`를 쓰므로 자동 포함된다. README "검증" 표에 한 행을 추가한다.
- 번들 대상은 tarball이 아니라 `packages/random/dist`다. 같은 파일 집합이며 `check:pack`이 동일성을 보장한다.

## 8. 문서

- `docs/api/state.md` 신설: 공개 export 표, 사용 환경(`./state`는 crypto 코드를 포함한다. root와 다르다), 공통 규칙(ST-1 조합 표, 5절 검증 순서, 옵션 객체 읽기 네 규칙 + `docs/api/id.md` 참조), `createRandomState`, `RandomState`(method 표: 이름 → leaf 계약 문서 링크, word 소비는 leaf 문서 참조), `rand`, seed 없는 상태의 초기화(7.2), 7.1 계약 표, 로드맵이 요구하는 두 문장(`rand`는 보안 용도가 아니며 token과 ID에는 `./secure`·`./id`를 쓴다 / facade는 bundle 크기 우선 경로가 아니며 leaf 단독 import를 권장한다. 번들 측정표를 근거로 싣는다), seed 없는 상태 ≠ 보안 source 위의 facade(그것은 `createRandomState(undefined, { source: createSecureSource() })`), 레시피(secure source 주입, `rollLoot(state.source)`, 분해, 테스트에서 seed 상태로 재현).
- README: 공개 API 표의 `.`을 "구현"(`docs/api/random-core.md`, `sampling.md`)으로, `./state`를 "구현"(`docs/api/state.md`)으로 갱신하고 첫 문단의 상태 요약에 일반 random과 상태 facade를 넣는다. "검증" 표에 `check:root-isolation` 행을 추가한다. "확정된 제약"의 `rand`·`createRandomState` 문장은 이 문서와 일치하므로 고치지 않는다.
- 로드맵: R7 본문은 고치지 않는다(이 문서와 일치). 완료 표시는 마무리 시점에 한다.
- CHANGELOG `Unreleased`에 R7 절(추가, 알려진 제한, 다음 단계 범위 R8). 알려진 제한에 all-zero 재추출 상한 없음(결함 난수원은 위협 모델 밖), seed 없는 상태의 비보안·비재현, `rand`의 realm 단위 공유, method 호출의 추가 간접 호출(성능 주장 없음)을 적는다.

## 9. 결정 기록

2026-09-22 확정.

| 결정                             | 내용                                                                                                                                                                                                                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 작업 단위                        | 4항목을 한 작업(`r7-state`)으로. 나누면 로드맵 완료 표시가 "일부 완료"로 남고 전부 하나의 파일에서 나온다.                                                                                                                                                                          |
| 배치                             | `src/state/` 신설, subpath `./state`(README "확정된 제약"). spec은 이 문서, API 문서는 `docs/api/state.md` 신설. 부속물은 R6 방식.                                                                                                                                                  |
| 인자 조합                        | 넷 중 `seed` + `source`는 `RangeError`. 로드맵 §2 "옵션 조합이 … 깨면 조용히 무시하지 않고 `RangeError`".                                                                                                                                                                           |
| 검증 순서                        | 저장소 관례(`readOptions` → 상호 배타 → 개별 값). 순서는 문구(비계약)에만 영향을 주므로 `docs/api/id.md` "옵션 객체 읽기"를 그대로 참조할 수 있게 관례를 따른다.                                                                                                                    |
| lazy 초기화 위치와 `rand`의 정체 | `rand`는 `createRandomState()` 그 자체. lazy 초기화는 seed 없는 상태의 `source` 래퍼 안에 있다. 특수 경로가 없고 README와 일치한다. eager 대안은 README 수정이 필요해 채택하지 않았다.                                                                                              |
| 실패 후 재시도                   | 미초기화 유지, 다음 호출 재시도. `createWordSource`와 같은 정책.                                                                                                                                                                                                                    |
| word 추출                        | 문자 그대로 `new Uint32Array(4)` 1회(16바이트). `CryptoLike`를 제네릭으로 넓힌다. `createWordSource` 재사용(32바이트 중 16바이트 폐기, README 문구 수정 필요)과 `Uint8Array(16)` + `DataView`는 채택하지 않았다. word는 platform-endian이지만 값이 무작위라 의미가 없다.            |
| all-zero 재추출 상한             | 없음. `uniformInt`·`randomString`의 rejection 반복과 같은 정책(결함 난수원은 위협 모델 밖). 정상 난수원에서 확률 2^-128.                                                                                                                                                            |
| method 집합                      | source를 받는 leaf 11개 전부, 같은 이름. `createWeightedSampler`는 source를 받지 않아 제외. root leaf를 추가할 때 facade에도 같은 이름 method를 추가한다.                                                                                                                           |
| `source` 노출                    | `state.source`를 공개한다. facade에 없는 함수(`WeightedSampler`, 사용자 함수)로 가는 탈출구이고 완료 조건 "leaf 조합과 일치"를 `source`로 검증한다.                                                                                                                                 |
| `source` identity                | 주입·seed 상태는 원본 함수 그대로(래퍼 없음). "method는 source를 한 번 더 감싸지 않는다"를 단순하게 한다. seed 없는 상태만 lazy 래퍼이며 identity는 안정.                                                                                                                           |
| 객체 형태                        | 인터페이스 + 클로저 객체 리터럴. 분해 가능. class·`instanceof`·freeze 없음. facade는 bundle 우선 경로가 아니라고 문서에 못 박으므로 클로저 11개의 비용을 수용한다.                                                                                                                  |
| export 목록                      | `createRandomState`, `rand`, `RandomState`, `RandomStateOptions`, `RandomSource`, `SecureRandomUnavailableError`. leaf 재export 없음("종류를 섞지 않는다").                                                                                                                         |
| `rand` 선언                      | 별도 파일 + `/* @__PURE__ */`. `createRandomState`만 import한 번들에서 제거된다.                                                                                                                                                                                                    |
| 계약 표                          | 7.1. 바인딩·crypto 미호출·fail-closed·재시도·`rand` 단일성·identity·검증 = 계약. 초기화 산식 = 고정. seed 없는 결과값·문구 = 비계약.                                                                                                                                                |
| 번들 측정                        | `createRandomState`·`rand` 모두 측정·한도 등록(`check:size-config`가 요구). 수치를 "bundle 우선 경로 아님"의 근거로 문서에 적는다.                                                                                                                                                  |
| root 격리 게이트                 | Vite `build()`(rolldown) 기반 새 게이트. 저장소에 esbuild·rollup이 없고 size-limit 14도 rolldown이다. size-limit `--save-bundle` 재실행(번들 두 번, 출력 충돌 미확인)과 크기 한도만으로 갈음(부재를 증명 못 함)은 채택하지 않았다. 표식 양방향 검사는 R0 "게이트 자체 테스트" 원칙. |
| 문서 배치                        | `docs/api/state.md` 신설, README 표 갱신(`.`이 "미구현"으로 남아 있던 누락 포함). `docs/api/id.md`는 고치지 않는다.                                                                                                                                                                 |
| 로드맵 본문                      | R7은 고치지 않는다. 완료 조건 4개가 이 문서와 일치한다.                                                                                                                                                                                                                             |

## 10. 미결정

현재 없음. 1.2의 제외 항목은 수요 증거가 확인되면 로드맵 절차로 다룬다.
