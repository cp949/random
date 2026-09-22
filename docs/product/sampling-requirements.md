# 컬렉션 샘플링 요구사항

- 상태: 승인 (2026-09-21)
- 작성일: 2026-09-21
- 확정 경로: 설계 인터뷰(grilling) 2라운드로 결정을 확정했다. 결정과 근거는 9절 결정 기록에 있다.
- 대상: `@cp949/random` 0.1.0 root(`.`) entry의 컬렉션 샘플링. 로드맵 R5의 design spec이며 함수 시그니처와 오류 계약을 확정한다.
- 출처: `/work/cp949/vectra`(`sub/vectra/src/random/`)의 구현을 이식한다. 이식 규칙은 4절에 있다.
- 이 문서가 정하지 않는 것: 결정적 테스트의 기대값(테스트 fixture가 소유한다. R5의 결과값은 재현성 계약이 아니므로 공개 문서에 golden vector를 싣지 않는다), 오류 메시지 문구.

## 1. 목적과 범위

소비자가 배열에서 무편향으로 고르고(`choice`), 섞고(`shuffle`, `shuffleInPlace`, `permutation`), 뽑고(`sample`), 가중치로 고른다(`weightedChoice`, `createWeightedSampler`). 모든 함수는 R4의 `RandomSource`를 첫 인자로 받고 인덱스 추출에 R4·R1과 같은 무편향 helper(`internal/uniform-int.ts`의 `uniformInt`)를 쓴다. R7 상태 facade가 이 단계의 함수 위에 쌓인다.

### 1.1 포함

3~8절의 요구를 R5에 포함한다. 로드맵 R5 범위 7항목(`choice`, `shuffle`, `shuffleInPlace`, `sample`, `permutation`, 가중 `choice`, 반복 추출용 가중 sampler)을 한 작업으로 진행한다.

### 1.2 제외

vectra에 있으나 로드맵 R5 범위에 없는 함수는 제외한다. 추가하려면 로드맵 §1의 기능 추가 판정 기준 셋에 모두 "예"여야 하고 로드맵 수정에 사용자 승인이 필요하다(R9 후보).

| 항목                                                             | 제외 이유                                                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `weightedShuffle`(Efraimidis–Spirakis 가중 순열)                 | 로드맵 R5 범위 밖. 반복 wrapper 사례가 확인되지 않았다.                                                            |
| `weightedRandomIndex`(공개 가중 인덱스 추출)                     | 로드맵 R5 범위 밖. 가중 인덱스 추출은 `weightedChoice`와 sampler가 공유하는 내부 함수로만 둔다.                    |
| `randomIndex(length)`                                            | `int(source, 0, length - 1)`로 충분하다.                                                                           |
| `uniqueIndices(count, max)`                                      | 로드맵 R5 범위 밖. `permutation(source, max).slice(0, count)`로 대체할 수 있다(비용 O(max)). 수요 확인 후 R9 후보. |
| `weightedProbability`                                            | 컬렉션 함수가 아니다. 로드맵 범위 밖.                                                                              |
| `*Into` 변형(`shuffleInto`, `sampleInto` 등)                     | 이 저장소에 출력 버퍼 주입 규약이 없다.                                                                            |
| vectra `sample`의 clamp 동작(`count > length`면 길이만큼만 반환) | 로드맵이 `RangeError`로 정했다. 로드맵의 `sample`은 vectra `pickUnique`(strict)에 해당한다(FN-4).                  |
| `permutation`의 배열 overload(배열이면 복사본 shuffle)           | `shuffle`이 이미 담당한다. 같은 일을 두 이름으로 하고 R7 facade 타입을 복잡하게 한다(FN-5).                        |
| 가중치 함수 인자(`(item, index) => number`)                      | vectra에도 없고 반복 사례가 없다.                                                                                  |
| 복원 추출(`sampleWithReplacement`)                               | `choice`를 반복 호출하면 된다.                                                                                     |

## 2. 용어

- source: R4의 `RandomSource`. `[0, 2^32)`의 정수(word) 하나를 돌려주는 함수 `() => number`.
- items: 샘플링 대상 배열. `Array.isArray`가 참인 값만 받는다.
- count: `sample`이 돌려주는 원소 수.
- snapshot: 입력 배열의 얕은 복사본. 복사본 API는 snapshot 위에서만 동작해 입력을 바꾸지 않는다.
- 선택 순서: `sample`이 원소를 뽑은 순서. 결과 배열의 첫 원소가 첫 번째로 뽑힌 원소다. 입력 순서를 보존하지 않는다.
- 가중치(weights): `items`와 같은 길이의 number 배열. 원소 `i`가 뽑힐 확률은 `weights[i] / total`이다.
- total: 가중치 합계. 왼쪽에서 오른쪽으로 더한 값.
- 누적합: `cumulative[i] = weights[0] + ... + weights[i]`. 왼쪽에서 오른쪽으로 더한 부분합이며 `cumulative[n - 1] === total`이다.
- 임계값(threshold): `float(source) * total`. `[0, total)`의 실수.
- sampler: `items`와 가중치를 미리 검증·전처리해 두고 호출마다 source만 받아 원소 하나를 돌려주는 함수.
- word 소비: 함수 한 번 호출이 source를 호출하는 횟수.
- 무편향 helper: `internal/uniform-int.ts`의 `uniformInt(source, n)`. `[0, n)`의 정수를 rejection sampling으로 뽑는다.

## 3. 모듈 구성

- 컬렉션 샘플링은 `packages/random/src/sampling/`에 두고 subpath를 새로 만들지 않고 root(`.`) entry로 export한다(README "확정된 제약": 0.1.0 범위는 root 일반 random, `./state`, `./secure`, `./id`). `src/core/`는 R4 helper 전용으로 유지하고 `docs/product/random-core-requirements.md` §3의 core 파일 목록은 바꾸지 않는다.
- sampling 파일: `choice.ts`, `shuffle.ts`, `shuffle-in-place.ts`, `sample.ts`, `permutation.ts`, `weighted-choice.ts`, `weighted-sampler.ts`, `index.ts`.
- `src/internal/weights.ts`(비공개): 가중치 검증(총합 반환), 선형 누적 스캔 인덱스 추출, 누적합 배열 생성과 이진 탐색. `weightedChoice`와 `createWeightedSampler`가 공유한다.
- root 공개 export 추가: 함수 `choice`, `shuffle`, `shuffleInPlace`, `sample`, `permutation`, `weightedChoice`, `createWeightedSampler`, 타입 `WeightedSampler`. root `src/index.ts`가 `./sampling/index.js`를 re-export한다.
- 재사용: 인덱스 추출은 `internal/uniform-int.ts`의 `uniformInt`, 임계값은 `core/float.ts`의 `float`, source 검증은 `core/random-source.ts`의 `assertRandomSource`, 정수 검증은 `internal/validate.ts`의 `assertSafeInt`. 새로 만들지 않는다.
- root는 crypto에 접근하는 코드를 포함하지 않는다(R4와 같다). 새 파일은 `globalThis.crypto`도 `Math.random`도 쓰지 않는다.

## 4. vectra 이식 규칙

vectra의 알고리즘·검증 로직·테스트 시나리오는 그대로 가져오고, API 형태·오류 정책·주석·테스트 형식은 이 저장소 규약으로 맞춘다. 바꾼 지점은 9절 결정 기록에 "vectra 대비 변경"으로 남긴다.

| vectra                                                                                                               | 이 저장소                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `RandomSource = () => number`는 `[0, 1)` 실수. `rng?`는 마지막 선택 인자, 생략 시 crypto 또는 `Math.random` fallback | `RandomSource`는 `[0, 2^32)` word. `source`는 첫 번째 필수 인자. fallback 없음. `Math.random` 금지                 |
| 인덱스 추출 `Math.floor(rng() * n)`                                                                                  | `uniformInt(source, n)`. 로드맵 정체성 "모든 정수·인덱스 샘플링이 하나의 무편향 경로를 쓴다"                       |
| 가중 임계값 `rng() * total`                                                                                          | `float(source) * total`                                                                                            |
| `choice([])` → `undefined`, `weightedChoice`의 총합 0 → `undefined`                                                  | `RangeError`(로드맵 "빈 배열은 `RangeError`". vectra `weightedRandomIndex`의 정책)                                 |
| `sample`은 `count > length`를 clamp, `pickUnique`는 `RangeError`                                                     | `sample`이 `pickUnique`의 알고리즘과 정책을 가진다                                                                 |
| `permutation(number \| readonly T[])` overload                                                                       | `permutation(source, length)`만                                                                                    |
| 배열 타입 런타임 검증 없음                                                                                           | `Array.isArray`가 아니면 `RangeError`                                                                              |
| `length`·`count` 상한 `0xffffffff`                                                                                   | 같다. `permutation`의 `length`와 `sample`의 `count`에 적용(`count`는 `items.length`가 더 작은 상한)                |
| 반복 추출용 sampler 없음(매 호출 O(n) 스캔)                                                                          | `createWeightedSampler` 신설(누적합 전처리, 이진 탐색)                                                             |
| ADR 0007: 같은 seed 출력 열을 버전 간에도 observable behavior로 취급                                                 | 결과값 비계약. 산식은 이 문서가 고정하고 변경은 CHANGELOG 기록(로드맵 §2, README "확정된 제약")                    |
| 오류 메시지 영문·한글·접두사 혼재                                                                                    | 영문 통일. 문구는 계약이 아니다                                                                                    |
| 결정적 테스트는 `[0, 1)` 실수 stub(`sequence([...])`)                                                                | word 주입(`wordSource([...])`)으로 옮기고 기대값을 다시 계산한다. 통계 검정 helper는 vectra에 없으므로 새로 만든다 |
| 테스트 `describe` 사용                                                                                               | mutation 대상 파일의 테스트는 최상위 `it`(TRP-004)                                                                 |

## 5. 공개 함수 요구

```ts
type WeightedSampler<T> = (source: RandomSource) => T;

function choice<T>(source: RandomSource, items: readonly T[]): T;
function shuffle<T>(source: RandomSource, items: readonly T[]): T[];
function shuffleInPlace<T>(source: RandomSource, items: T[]): T[];
function sample<T>(
  source: RandomSource,
  items: readonly T[],
  count: number,
): T[];
function permutation(source: RandomSource, length: number): number[];
function weightedChoice<T>(
  source: RandomSource,
  items: readonly T[],
  weights: readonly number[],
): T;
function createWeightedSampler<T>(
  items: readonly T[],
  weights: readonly number[],
): WeightedSampler<T>;
```

공통:

- source를 받는 함수(`choice`, `shuffle`, `shuffleInPlace`, `sample`, `permutation`, `weightedChoice`, sampler가 돌려준 함수)는 첫 인자로 `source: RandomSource`를 받는다. 검증 순서는 `source`(함수가 아니면 `RangeError`) → `items`(`Array.isArray`가 아니면 `RangeError`) → 나머지 인자(`count`, `length`, `weights`. `RangeError`) → source 호출이다. 인자 검증에 실패하면 source를 호출하지 않는다. `createWeightedSampler`는 source를 받지 않고 `items` → `weights` 순서로 검증한다.
- `items`는 `Array.isArray`가 참인 값이어야 한다. typed array, 문자열, array-like 객체, `null`, `undefined`는 `RangeError`다. 배열 원소의 타입과 값은 검사하지 않는다(`undefined`·`null` 원소 허용). 구멍(hole)이 있는 희소 배열의 결과는 정의되지 않는다.
- 숫자 인자의 타입 규칙은 R4와 같다(`typeof`가 `"number"`. 문자열, `NaN`, `undefined`, `null`은 `RangeError`). 기본값이 있는 인자는 없다.
- 인덱스 추출은 전부 `uniformInt(source, n)`이다. `n === 1`이면 word를 소비하지 않는다. 이 helper가 seeded/secure/custom source에서 무편향임은 R4에서 검증됐다.
- 복사본 API(`shuffle`, `sample`, `permutation`, `createWeightedSampler`)는 입력 배열을 바꾸지 않는다. 입력이 배열이면 snapshot(`slice`)을 만들고 그 위에서만 동작한다. 반환 배열은 입력과 다른 참조다.
- 원소는 얕게 복사한다(참조 동일).

- **FN-1. `choice(source, items): T`.** `items[uniformInt(source, items.length)]`. `items`가 비면 `RangeError`(R4 `uniform`의 빈 반개구간과 같은 규칙). 길이 1이면 word를 소비하지 않고 `items[0]`을 돌려준다.
- **FN-2. `shuffleInPlace(source, items): T[]`.** 뒤에서 앞으로 가는 Fisher-Yates. `i = items.length - 1`부터 `i > 0`인 동안 `j = uniformInt(source, i + 1)`을 뽑아 `items[i]`와 `items[j]`를 바꾼다. `items`를 제자리에서 바꾸고 같은 참조를 돌려준다(vectra와 같다. `shuffle`과 반환 타입이 같아 교체 가능하다). 길이 0·1이면 word를 소비하지 않는다. `items`는 `T[]`(쓰기 가능)여야 한다. 동결(frozen) 배열은 검사하지 않으며 엔진이 `TypeError`를 던진다.
- **FN-3. `shuffle(source, items): T[]`.** snapshot을 만들고 FN-2와 같은 산식을 적용한 뒤 그 snapshot을 돌려준다. 입력은 바뀌지 않는다. 빈 배열은 `[]`를 돌려준다(오류 아님).
- **FN-4. `sample(source, items, count): T[]`.** 비복원 추출. vectra `pickUnique`의 알고리즘: snapshot `pool` 위에서 `i = 0`부터 `i < count`인 동안 `j = i + uniformInt(source, pool.length - i)`를 뽑아 `pool[i]`와 `pool[j]`를 바꾼다(앞에서부터 가는 부분 Fisher-Yates). 결과는 `pool`의 앞 `count`개이며 선택 순서다.
  - `count`는 safe integer이고 `0 <= count <= items.length`여야 한다. 비정수, 음수, `items.length` 초과는 `RangeError`다(clamp하지 않는다). `count === 0`이면 `[]`를 돌려주고 word를 소비하지 않는다. `pool.length - i === 1`인 단계(마지막 원소 하나 남음)는 word를 소비하지 않는다.
  - `count === items.length`면 결과는 `items`의 순열이다.
  - 인자 이름은 `count`다. 로드맵의 `k`는 수식 표기이고 README 인자 이름 규칙의 `length`는 문자열·바이트 출력용이다.
- **FN-5. `permutation(source, length): number[]`.** `[0, 1, ..., length - 1]`을 만들고 FN-2와 같은 산식(뒤에서 앞으로 Fisher-Yates)을 적용해 돌려준다. `length`는 safe integer이고 `0 <= length <= 2^32 - 1`(배열 최대 길이. vectra `MAX_COLLECTION_LENGTH`)여야 하며 위반은 `RangeError`다. `0`이면 `[]`를 돌려주고 word를 소비하지 않는다. 배열 overload는 없다.
- **FN-6. `weightedChoice(source, items, weights): T`.** 6절의 가중치 규칙으로 검증한 뒤 `threshold = float(source) * total`을 계산하고, 왼쪽에서 오른쪽으로 누적합을 더하며 `threshold < cumulative[i]`인 첫 `i`의 `items[i]`를 돌려준다. 부동소수점 반올림으로 끝까지 조건을 만족하는 `i`가 없으면 가중치가 양수인 마지막 원소를 돌려준다(vectra `weightedChoice`의 fallback). 0 가중치 원소는 `cumulative[i] === cumulative[i - 1]`이라 조건을 처음 만족하는 `i`가 될 수 없으므로 뽑히지 않는다. word 2개(`float` 1회)를 소비한다. 누적합 배열을 할당하지 않고 스캔하며 더한다.
- **FN-7. `createWeightedSampler(items, weights): WeightedSampler<T>`.** 생성 시 6절의 규칙으로 검증하고 `items`의 snapshot과 누적합 배열을 만들어 클로저에 보관한다. 이후 `items`·`weights`를 바꿔도 sampler에 영향이 없다. 돌려준 함수 `(source) => T`는 호출마다 `source`를 검증하고(함수가 아니면 `RangeError`) `threshold = float(source) * total`을 계산해 누적합 배열에서 `threshold < cumulative[i]`인 가장 작은 `i`를 이진 탐색으로 찾아 `items[i]`를 돌려준다. 없으면 FN-6과 같은 fallback(가중치가 양수인 마지막 원소)이다. word 2개를 소비한다.
  - 같은 source 상태에서 `weightedChoice(source, items, weights)`와 같은 원소를 돌려준다. 근거: 두 함수가 같은 순서로 같은 부분합을 만들고(`total`도 같다) 같은 임계값 산식과 같은 선택 조건(`threshold < cumulative[i]`인 최소 `i`)을 쓴다. 선형 스캔과 이진 탐색은 같은 `i`를 찾는다. 테스트로 고정한다(8.4).
  - sampler는 상태가 없다. source를 생성 시 받지 않아 어느 source에든 붙고 R7 facade는 source를 바인딩하기만 하면 된다.
  - sampler 호출 사이의 결과는 독립이다(복원 추출).

## 6. 가중치 요구

`weightedChoice`와 `createWeightedSampler`가 공유한다. 위반은 모두 `RangeError`다.

- **WT-1.** `weights`는 `Array.isArray`가 참이어야 한다.
- **WT-2.** `weights.length === items.length`. 다르면 `RangeError`. 따라서 `items`가 비면 `weights`도 비고 WT-4로 거부된다.
- **WT-3.** 각 원소는 `typeof`가 `"number"`이고 유한(`Number.isFinite`)하며 `0` 이상이다. `NaN`, `Infinity`, 음수, 문자열은 `RangeError`. `-0`은 `0`으로 본다. 원소를 순서대로 검사하며 첫 위반에서 던진다.
- **WT-4.** 합계는 왼쪽에서 오른쪽으로 더하며 더하는 도중 `Infinity`가 되면 `RangeError`(overflow. vectra `weightedRandomIndex`의 검사). 최종 합계가 `0`이면(빈 배열, 전부 0) `RangeError`. 즉 `total`은 유한하고 `0`보다 커야 한다.
- **WT-5.** 0 가중치 원소는 허용하되 뽑히지 않는다. 양수 가중치 원소가 하나뿐이면 항상 그 원소다(word는 소비한다).
- **WT-6.** 가중치는 정규화하지 않는다. `[1, 2]`와 `[0.5, 1]`은 같은 분포다.
- **WT-7.** 검증 순서: WT-1 → WT-2 → WT-3·WT-4(한 번의 순회로 원소 검사와 누적을 함께 한다).

## 7. 오류 계약

- 새 오류 클래스를 만들지 않는다. R5 함수가 직접 던지는 오류는 `RangeError` 하나다(인자·타입 위반, `source`가 함수가 아닌 경우, 빈 배열, 범위 밖 `count`·`length`, 가중치 위반). 타입 위반도 `TypeError`가 아니라 `RangeError`다(R4와 같다).
- source가 던진 오류는 감싸지 않고 그대로 전파한다.
- 인자 검증이 source 호출보다 먼저이므로 잘못된 인자는 source와 무관하게 항상 `RangeError`다. 검증에 실패하면 입력 배열은 바뀌지 않는다(`shuffleInPlace` 포함).
- 오류 메시지는 영어이며 문구는 계약이 아니다. 오류 타입만 계약이다.
- 동결 배열을 `shuffleInPlace`에 넘겼을 때의 `TypeError`와 희소 배열의 결과는 라이브러리가 정하지 않는다.

## 8. 보장과 검증

### 8.1 계약 표

API 문서(`docs/api/sampling.md`)에 항목별로 싣는다(로드맵 §4 "결과값이 계약인지 여부").

| 항목                                                                                                                   | 계약 여부                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 분포: `choice` 균등, `shuffle`·`shuffleInPlace`·`permutation`의 모든 순열 등확률, `sample`의 모든 부분집합·순서 등확률 | 계약                                                                                                          |
| 분포: `weightedChoice`·sampler의 원소 `i` 확률 `weights[i] / total`                                                    | 계약                                                                                                          |
| 복사본 API가 입력을 바꾸지 않음, `shuffleInPlace`가 같은 참조를 돌려줌                                                 | 계약                                                                                                          |
| `sample` 결과가 선택 순서(입력 순서 보존 안 함)                                                                        | 계약(순서 보존은 보장하지 않는다는 뜻. 어떤 순서인지는 산식)                                                  |
| `weightedChoice`와 sampler가 같은 source 상태에서 같은 원소                                                            | 계약                                                                                                          |
| 산식(Fisher-Yates 방향, 부분 Fisher-Yates, 임계값·누적합·선택 조건·fallback)                                           | 이 문서가 고정. 계약은 아니며 변경은 CHANGELOG에 기록                                                         |
| 결과값(같은 seed의 결과 열)                                                                                            | 계약 아님(로드맵 §2, README). 같은 릴리스 안에서는 같은 seed·같은 호출 순서에서 같은 결과. golden vector 없음 |
| word 소비                                                                                                              | 계약 아님(`uniformInt`에 종속)                                                                                |

### 8.2 word 소비

API 문서에 싣되 계약이 아님을 적는다. `u(n)`은 `uniformInt(source, n)`의 소비(n = 1이면 0, 2^32 이하면 1 이상, 거부 시 반복).

| 함수                        | word 소비                                   |
| --------------------------- | ------------------------------------------- |
| `choice`                    | `u(n)`                                      |
| `shuffle`, `shuffleInPlace` | `u(n) + u(n - 1) + ... + u(2)`. n ≤ 1이면 0 |
| `sample`                    | `u(n) + u(n - 1) + ... + u(n - count + 1)`  |
| `permutation`               | `shuffle`과 같다(n = `length`)              |
| `weightedChoice`            | 2                                           |
| sampler 호출                | 2                                           |
| `createWeightedSampler`     | 0(source를 받지 않는다)                     |

### 8.3 경계 정책

테스트로 고정한다(로드맵 완료 조건 "빈 입력과 경계 입력 정책이 테스트로 고정된다").

| 입력                                                                                        | 결과                                  |
| ------------------------------------------------------------------------------------------- | ------------------------------------- |
| `choice(s, [])`                                                                             | `RangeError`                          |
| `choice(s, [x])`                                                                            | `x`. word 소비 0                      |
| `shuffle(s, [])`                                                                            | `[]`(새 배열). word 소비 0            |
| `shuffleInPlace(s, [])`, `shuffleInPlace(s, [x])`                                           | 같은 참조. word 소비 0                |
| `sample(s, [], 0)`, `sample(s, items, 0)`                                                   | `[]`. word 소비 0                     |
| `sample(s, [], 1)`, `sample(s, [a, b], 3)`                                                  | `RangeError`                          |
| `sample(s, items, -1)`, `sample(s, items, 1.5)`, `sample(s, items, NaN)`                    | `RangeError`                          |
| `sample(s, items, items.length)`                                                            | `items`의 순열                        |
| `permutation(s, 0)`                                                                         | `[]`. word 소비 0                     |
| `permutation(s, 1)`                                                                         | `[0]`. word 소비 0                    |
| `permutation(s, -1)`, `permutation(s, 2 ** 32)`, `permutation(s, 1.5)`                      | `RangeError`                          |
| `weightedChoice(s, [], [])`, `createWeightedSampler([], [])`                                | `RangeError`(WT-4)                    |
| `weightedChoice(s, [a, b], [0, 0])`                                                         | `RangeError`(WT-4)                    |
| `weightedChoice(s, [a, b], [1])`                                                            | `RangeError`(WT-2)                    |
| `weightedChoice(s, [a, b], [1, -1])`, `[1, NaN]`, `[1, Infinity]`                           | `RangeError`(WT-3)                    |
| `weightedChoice(s, [a, b], [Number.MAX_VALUE, Number.MAX_VALUE])`                           | `RangeError`(WT-4 overflow)           |
| `weightedChoice(s, [a, b], [0, 1])`                                                         | 항상 `b`. word 소비 2                 |
| 모든 함수에 `source`가 함수가 아닌 값                                                       | `RangeError`. 다른 인자 검증보다 먼저 |
| 모든 함수에 `items`가 배열이 아닌 값(`"abc"`, `new Uint8Array(3)`, `{ length: 3 }`, `null`) | `RangeError`                          |

### 8.4 검증

| 항목                                                  | 검증 방법                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 통계 helper                                           | `test/helpers/position-frequency.ts`: `draw: () => readonly number[]`를 `trials`번 불러 n×n 위치×값 빈도 행렬을 만들고, 행(위치)마다 `chiSquare`(자유도 n − 1, p = 0.001, 기존 `test/helpers/chi-square.ts`)로 검정하는 함수. 자체 테스트 `test/helpers/position-frequency.test.ts`가 아래 의도적 변형을 검출하는지 확인한다.                                                                                                        |
| 편향 검출(`shuffle`, `shuffleInPlace`, `permutation`) | n = 8, 20,000회, seeded `createXoshiro128Source`. 8×8 행렬의 모든 행이 임계값 미만. 값은 `0..7`(`shuffle`·`shuffleInPlace`는 `[0..7]`을 입력으로 준다).                                                                                                                                                                                                                                                                              |
| 편향 검출(`sample`)                                   | n = 8, count = 3, 20,000회. 결과의 위치 0..2마다 값 빈도가 균등(자유도 7). 추가로 각 값이 포함되는 빈도가 `count / n`에 대한 카이제곱을 통과한다.                                                                                                                                                                                                                                                                                    |
| off-by-one mutation이 통계 테스트에서 실패            | `position-frequency.test.ts`에 의도적으로 틀린 변형을 두고 그 변형의 통계량이 임계값을 넘는다고 assert한다. 변형 A: 루프를 `i = n - 2`에서 시작(마지막 원소가 이동하지 않는다. 로드맵 완료 조건). 변형 B: `j = uniformInt(source, i)`(원소가 제자리에 남지 못한다. Sattolo). 변형 C: `sample`에서 `uniformInt(source, pool.length - i - 1)`. 틀린 구현은 `src/`에 두지 않는다. stryker는 수동 실행이라 이 조건의 증거로 쓰지 않는다. |
| 가중 추출 비율                                        | 가중치 `[1, 2, 3, 4]`, 20,000회, `chiSquare(observed, expected)`(기대 = `trials * w / total`). `weightedChoice`와 sampler 각각.                                                                                                                                                                                                                                                                                                      |
| `weightedChoice`와 sampler의 일치                     | 같은 seed의 source 두 개로 1,000회 비교. 0 가중치 포함 배열과 부동소수점 가중치(`[0.1, 0.2, 0.3]`)로도 비교.                                                                                                                                                                                                                                                                                                                         |
| 산식 고정(결정적 테스트)                              | vectra `collection.test.ts`·`collection-companion.test.ts`의 시나리오를 `wordSource([...])` 주입으로 옮긴다. 작은 word는 `uniformInt`가 항상 수용하므로(`word < limit`) `j` 값을 word로 직접 준다. 예: n = 4 `shuffle`에 `[2, 0, 1]`을 주입하면 `i = 3, 2, 1`에서 `j = 2, 0, 1`. 기대값은 산식으로 손으로 계산해 fixture에 둔다. 우리 구현의 출력을 복사하지 않는다.                                                                 |
| 복사본 API 불변성                                     | `shuffle`·`sample`·`permutation`·`createWeightedSampler` 호출 전후 입력을 `toEqual`로 대조하고 반환 참조가 입력과 다름을 확인. `shuffleInPlace`는 같은 참조. `Object.freeze`한 입력을 복사본 API에 넘겨도 오류가 없다.                                                                                                                                                                                                               |
| 원소 보존                                             | `shuffle`·`shuffleInPlace`·`permutation` 결과의 정렬본이 입력의 정렬본과 같다. `sample` 결과의 원소가 입력에 있고 중복 인덱스가 없다(원시값 중복 입력 `[1, 1, 2]`로도 개수 보존).                                                                                                                                                                                                                                                    |
| 경계 정책                                             | 8.3 표 전부.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 검증 순서                                             | 잘못된 인자에서 source가 호출되지 않는다(호출 횟수 spy). source 검증이 `items`·`count`·`weights` 검증보다 먼저다. `shuffleInPlace`가 검증 실패 시 입력을 바꾸지 않는다.                                                                                                                                                                                                                                                              |
| sampler 격리                                          | 생성 후 원본 `items`·`weights`를 바꿔도 sampler 결과가 그대로다. sampler 두 개가 상태를 공유하지 않는다.                                                                                                                                                                                                                                                                                                                             |
| 같은 릴리스 안 결정성                                 | 같은 seed의 source 두 개로 각 함수의 결과가 같다.                                                                                                                                                                                                                                                                                                                                                                                    |
| root entry가 crypto에 접근하지 않음                   | R0 harness: crypto 제거 후 root import, 7개 함수가 seeded source로 정상 동작(tarball smoke `smoke-random.mjs` 확장).                                                                                                                                                                                                                                                                                                                 |
| `Math.random` 0건                                     | 기존 정적 게이트(grep).                                                                                                                                                                                                                                                                                                                                                                                                              |
| 소비자 fixture                                        | `fixtures/consumer/usage-random.ts`·`smoke-random.mjs`에 7개 함수 사용 예 추가. 타입 추론(`readonly` 튜플 입력에서 `T`가 리터럴 union)을 확인한다.                                                                                                                                                                                                                                                                                   |
| 번들                                                  | 값 export 7개를 각각 단독 import한 크기를 측정해 `.size-limit.json`에 등록. 한도는 `ceil(측정값 × 1.5 / 50) × 50` B. `choice`가 `float`·가중치 코드를 끌어오지 않는다.                                                                                                                                                                                                                                                               |
| mutation                                              | `src/sampling/*.ts`(`index.ts` 제외)와 `src/internal/weights.ts`를 `stryker.config.mjs`의 `mutate`에 추가하고 점수 하한 95를 유지한다. 대상 테스트는 최상위 `it`.                                                                                                                                                                                                                                                                    |

로드맵 R5 완료 조건과의 대응: 카이제곱·위치별 빈도(편향 검출 두 항목), off-by-one mutation(전용 항목), 복사본 불변성(전용 항목), 가중 비율(가중 추출 비율), 빈·경계 입력(8.3).

## 9. 결정 기록

2026-09-21 확정. "(vectra 대비 변경)"은 이식하며 바꾼 지점이다.

| 결정                  | 내용                                                                                                                                                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 작업 단위             | 7항목을 한 작업(`r5-sampling`)으로. 가중 추출을 떼면 로드맵 완료 표시가 "일부 완료"로 남는다.                                                                                                                                                              |
| 배치                  | `src/sampling/` 신설, root re-export, subpath 없음. `src/core/`에 두면 R6까지 비대해지고 새 subpath는 README 확정된 제약(0.1.0 범위) 위반.                                                                                                                 |
| 이식 정책             | 알고리즘·검증 로직·테스트 시나리오는 vectra, API 형태·오류·주석·테스트 형식은 이 저장소. R4가 "source 첫 인자"를 확정했고 R7이 그 형태에 의존한다.                                                                                                         |
| source 인자           | 첫 번째 필수. fallback 없음. (vectra 대비 변경)                                                                                                                                                                                                            |
| 인덱스 추출           | `uniformInt`. 로드맵 정체성 "하나의 무편향 경로". (vectra 대비 변경: `Math.floor(rng() * n)`)                                                                                                                                                              |
| 결과값 계약           | 비계약. 산식 고정·CHANGELOG. README·로드맵 §2가 이미 고정했고 계약으로 올리면 세 문서 수정과 알고리즘 개선 차단. (vectra 대비 변경: ADR 0007의 버전 간 observable)                                                                                         |
| 문서                  | `docs/product/sampling-requirements.md`(이 문서) + `docs/api/sampling.md` 신설. `random-core.md`는 이미 길다. 부속물(`.size-limit.json`, fixture, stryker, CHANGELOG)은 R4 DELTA-05 방식.                                                                  |
| 편향 검출 증거        | `test/helpers/`의 위치×값 행렬 카이제곱 + 의도적 변형 테스트. stryker는 수동 실행이라 `pnpm verify`·CI에서 완료 조건을 증명하지 못한다.                                                                                                                    |
| `sample` 원본         | vectra `pickUnique`(strict). clamp형 `sample`은 버린다. 로드맵이 `count > length`를 `RangeError`로 정했다. (vectra 대비 변경)                                                                                                                              |
| `sample` 인자 이름    | `count`. `k`는 수식 표기, `length`는 문자열·바이트 출력 규칙.                                                                                                                                                                                              |
| `sample` 반환 순서    | 선택 순서. 입력 순서 보존 안 함(vectra와 같다).                                                                                                                                                                                                            |
| `permutation` 형태    | `permutation(source, length)`만. 배열은 `shuffle`. (vectra 대비 변경: overload 제거)                                                                                                                                                                       |
| 가중 `choice` 형태    | 별도 leaf `weightedChoice(source, items, weights)`. `choice`의 번들과 오류 계약을 지킨다. `choice(source, items, { weights })` 옵션 형태는 채택하지 않았다.                                                                                                |
| 총합 0·빈 배열        | `RangeError`. vectra `weightedRandomIndex`의 정책. (vectra 대비 변경: `weightedChoice`의 `undefined`)                                                                                                                                                      |
| 가중치 검증           | 유한·0 이상·길이 일치·합계 유한·합계 > 0. 0 가중치는 허용하되 뽑히지 않음. 정규화 없음.                                                                                                                                                                    |
| 가중 임계값           | `float(source) * total`, 선택 조건 `threshold < cumulative[i]`인 최소 `i`, fallback은 양수 가중치 마지막 원소. (vectra 대비 변경: `rng() * total`)                                                                                                         |
| sampler 구조          | `createWeightedSampler(items, weights): (source) => T`. 누적합 전처리 + 이진 탐색. alias method는 부동소수점 분배 문제와 `weightedChoice`와의 결과 불일치 때문에 채택하지 않았다. source는 호출마다 받는다(상태 없음, R7 바인딩 용이). vectra에 없어 신설. |
| 로드맵 밖 vectra 함수 | 전부 제외(1.2). 가중 인덱스 추출은 내부 함수.                                                                                                                                                                                                              |
| 배열 검증             | `Array.isArray`가 아니면 `RangeError`. 로드맵 "입력은 엄격하게 검증한다", R4 "타입 위반도 `RangeError`". (vectra 대비 변경: 검증 없음)                                                                                                                     |
| `shuffleInPlace` 반환 | 같은 참조(vectra와 같다). `shuffle`과 교체 가능. `void`는 채택하지 않았다.                                                                                                                                                                                 |
| 테스트 파라미터       | n = 8, 20,000회, p = 0.001, seeded source 하나(무편향 경로는 R4에서 세 source 검증). 가중 `[1, 2, 3, 4]`. 결정적 테스트는 word 주입.                                                                                                                       |
| 의도적 변형 위치      | `test/helpers/position-frequency.test.ts`. `src/`에 두지 않는다.                                                                                                                                                                                           |
| 오류                  | root는 `RangeError`만. 메시지 영문, 문구 비계약. (vectra 대비 변경: 영문·한글 혼재)                                                                                                                                                                        |
| 검증 순서             | `source` → `items` → 나머지 인자 → source 호출. `createWeightedSampler`는 `items` → `weights`.                                                                                                                                                             |
| 로드맵 본문           | 고치지 않는다. 로드맵은 시그니처를 소유하지 않으므로 `sample(items, k)` 표기는 그대로 둔다.                                                                                                                                                                |

## 10. 미결정

현재 없음. 1.2의 제외 항목은 수요 증거가 확인되면 R9 후보로 다룬다.
