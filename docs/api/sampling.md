# `@cp949/random`(root) 컬렉션 샘플링 API 계약

컬렉션 샘플링(R5)의 입력 검증, 오류, 결과값 계약을 함수별로 기록한다. 계약은 이 문서와 소스의 TSDoc에 적힌 동작이다. 오류 메시지 문구는 계약이 아니다. design spec은 `docs/product/sampling-requirements.md`다.

## 공개 export

| export                  | 시그니처                                                                  | 요약                                         |
| ----------------------- | ------------------------------------------------------------------------- | -------------------------------------------- |
| `choice`                | `(source, items: readonly T[]) => T`                                      | 균등 무작위 선택                             |
| `shuffle`               | `(source, items: readonly T[]) => T[]`                                    | 복사본을 섞어 돌려준다                       |
| `shuffleInPlace`        | `(source, items: T[]) => T[]`                                             | 제자리에서 섞고 같은 참조를 돌려준다         |
| `sample`                | `(source, items: readonly T[], count: number) => T[]`                     | 비복원 추출(선택 순서)                       |
| `permutation`           | `(source, length: number) => number[]`                                    | `[0, length)`의 무작위 순열                  |
| `weightedChoice`        | `(source, items: readonly T[], weights: readonly number[]) => T`          | 가중치로 원소 하나 선택                      |
| `createWeightedSampler` | `(items: readonly T[], weights: readonly number[]) => WeightedSampler<T>` | 반복 가중 추출용 sampler를 만든다            |
| `WeightedSampler<T>`    | 타입 `(source: RandomSource) => T`                                        | `createWeightedSampler`가 돌려주는 함수 타입 |

```ts
import {
  choice,
  createWeightedSampler,
  permutation,
  sample,
  shuffle,
  shuffleInPlace,
  weightedChoice,
  type WeightedSampler,
} from "@cp949/random";
```

`RandomSource`는 `docs/api/random-core.md`가 소유한다. 컬렉션 샘플링은 root(`.`) entry의 일부이며 crypto에 접근하는 코드를 포함하지 않는다.

## 공통 규칙

### 검증 순서

`source`를 받는 함수(`choice`, `shuffleInPlace`, `shuffle`, `sample`, `permutation`, `weightedChoice`, sampler가 돌려준 함수)는 다음 순서로 검증한다.

1. `source`가 함수인지(`RangeError`, 다른 인자 검증보다 먼저)
2. `items`가 `Array.isArray`인지(`RangeError`)
3. 나머지 인자(`count`, `length`, `weights`. `RangeError`)
4. `source` 호출

인자 검증에 실패하면 `source`를 호출하지 않는다. `createWeightedSampler(items, weights)`는 `source`를 받지 않고 `items` → `weights` 순서로 검증하며, 돌려준 sampler 함수가 호출마다 `source`를 검증한다.

### 배열 검증

`items`는 `Array.isArray`가 참인 값이어야 한다. typed array, 문자열, array-like 객체(`{ length }`), `null`, `undefined`는 모두 `RangeError`다. 원소의 타입과 값은 검사하지 않는다(`undefined`·`null` 원소 허용). 구멍(hole)이 있는 희소 배열의 결과는 정의되지 않는다.

### 복사본과 원소

`shuffle`, `sample`, `permutation`, `createWeightedSampler`는 입력 배열을 바꾸지 않는다(snapshot 위에서 동작하고 새 참조를 돌려준다). `shuffleInPlace`만 같은 참조를 돌려주고 제자리에서 바꾼다. 원소는 얕게 복사한다(참조 동일).

### 인덱스 추출과 word 소비

인덱스 추출은 모두 `internal/uniform-int.ts`의 `uniformInt(source, n)`을 쓴다(`n === 1`이면 word를 소비하지 않는다). word 소비량은 계약이 아니다.

| 함수                        | word 소비                                       |
| --------------------------- | ----------------------------------------------- |
| `choice`                    | `u(n)`                                          |
| `shuffle`, `shuffleInPlace` | `u(n) + u(n - 1) + ... + u(2)`(`n ≤ 1`이면 `0`) |
| `sample`                    | `u(n) + u(n - 1) + ... + u(n - count + 1)`      |
| `permutation`               | `shuffle`과 같다(`n = length`)                  |
| `weightedChoice`            | `2`(`float` 1회)                                |
| sampler 호출                | `2`(`float` 1회)                                |
| `createWeightedSampler`     | `0`(`source`를 받지 않는다)                     |

### 계약 표

| 항목                                                                                                                   | 계약 여부                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 분포: `choice` 균등, `shuffle`·`shuffleInPlace`·`permutation`의 모든 순열 등확률, `sample`의 모든 부분집합·순서 등확률 | 계약                                                                                       |
| 분포: `weightedChoice`·sampler의 원소 `i` 확률 `weights[i] / total`                                                    | 계약                                                                                       |
| 복사본 API가 입력을 바꾸지 않음, `shuffleInPlace`가 같은 참조를 돌려줌                                                 | 계약                                                                                       |
| `sample` 결과가 선택 순서(입력 순서 보존 안 함)                                                                        | 계약(순서 보존은 보장하지 않는다는 뜻. 어떤 순서인지는 산식)                               |
| `weightedChoice`와 sampler가 같은 source 상태에서 같은 원소                                                            | 계약                                                                                       |
| 산식(Fisher-Yates 방향, 부분 Fisher-Yates, 임계값·누적합·선택 조건·fallback)                                           | 이 문서가 고정. 계약은 아니며 변경은 CHANGELOG에 기록                                      |
| 결과값(같은 seed의 결과 열)                                                                                            | 계약 아님. 같은 릴리스 안에서는 같은 seed·같은 호출 순서에서 같은 결과. golden vector 없음 |
| word 소비                                                                                                              | 계약 아님(`uniformInt`에 종속)                                                             |

## `choice(source, items)`

```ts
function choice<T>(source: RandomSource, items: readonly T[]): T;
```

`items[uniformInt(source, items.length)]`을 돌려준다.

| 항목          | 내용                                               |
| ------------- | -------------------------------------------------- |
| 입력 `source` | 함수. 아니면 `RangeError`(다른 인자 검증보다 먼저) |
| 입력 `items`  | 배열. 아니면 `RangeError`. 빈 배열도 `RangeError`  |
| 길이 1        | `source`를 호출하지 않고 `items[0]`을 돌려준다     |
| 분포          | 균등(계약)                                         |

```ts
import { choice, createXoshiro128Source } from "@cp949/random";

const source = createXoshiro128Source("card-draw");
const suit = choice(source, ["clubs", "diamonds", "hearts", "spades"] as const);
```

## `shuffle(source, items)` / `shuffleInPlace(source, items)`

```ts
function shuffle<T>(source: RandomSource, items: readonly T[]): T[];
function shuffleInPlace<T>(source: RandomSource, items: T[]): T[];
```

뒤에서 앞으로 가는 Fisher-Yates. `i = items.length - 1`부터 `i > 0`인 동안 `j = uniformInt(source, i + 1)`을 뽑아 `items[i]`와 `items[j]`를 바꾼다. `shuffle`은 snapshot(`slice`) 위에서 이 산식을 적용해 새 배열을 돌려주고, `shuffleInPlace`는 같은 산식을 입력 배열에 직접 적용해 같은 참조를 돌려준다.

| 항목             | 내용                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 입력 `source`    | 함수. 아니면 `RangeError`(다른 인자 검증보다 먼저)                                                                               |
| 입력 `items`     | 배열. 아니면 `RangeError`. 빈 배열은 오류가 아니다(`[]`/같은 참조를 돌려준다)                                                    |
| 길이 0·1         | `source`를 호출하지 않는다                                                                                                       |
| `shuffle`        | 입력을 바꾸지 않고 새 참조를 돌려준다                                                                                            |
| `shuffleInPlace` | 입력을 제자리에서 바꾸고 같은 참조를 돌려준다. 동결(frozen) 배열을 넘기면 엔진이 `TypeError`를 던진다(이 함수는 검사하지 않는다) |
| 분포             | 모든 순열이 등확률(계약)                                                                                                         |

```ts
import { shuffle, shuffleInPlace, createXoshiro128Source } from "@cp949/random";

const deck = ["A", "K", "Q", "J"];
const shuffled = shuffle(createXoshiro128Source("shuffle-seed"), deck); // deck은 그대로
shuffleInPlace(createXoshiro128Source("shuffle-seed-2"), deck); // deck 자체가 바뀐다
```

## `sample(source, items, count)`

```ts
function sample<T>(
  source: RandomSource,
  items: readonly T[],
  count: number,
): T[];
```

비복원 추출(vectra `pickUnique`). snapshot `pool` 위에서 `i = 0`부터 `i < count`인 동안 `j = i + uniformInt(source, pool.length - i)`를 뽑아 `pool[i]`와 `pool[j]`를 바꾼다(앞에서부터 가는 부분 Fisher-Yates). 결과는 `pool`의 앞 `count`개이며 뽑은 순서다(입력 순서를 보존하지 않는다).

| 항목                     | 내용                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| 입력 `source`            | 함수. 아니면 `RangeError`(다른 인자 검증보다 먼저)                                             |
| 입력 `items`             | 배열. 아니면 `RangeError`                                                                      |
| 입력 `count`             | `0` 이상 `items.length` 이하의 safe integer. 비정수·음수·초과는 `RangeError`(clamp하지 않는다) |
| `count === 0`            | `[]`를 돌려주고 `source`를 호출하지 않는다                                                     |
| `count === items.length` | 결과가 `items`의 순열이다                                                                      |
| 복사본                   | 입력을 바꾸지 않고 새 참조를 돌려준다                                                          |
| 분포                     | 모든 부분집합·순서가 등확률(계약)                                                              |

```ts
import { sample, createXoshiro128Source } from "@cp949/random";

const winners = sample(createXoshiro128Source("lottery"), entrants, 3);
```

## `permutation(source, length)`

```ts
function permutation(source: RandomSource, length: number): number[];
```

`[0, 1, ..., length - 1]`을 만들어 `shuffle`과 같은 산식(뒤에서 앞으로 가는 Fisher-Yates)을 적용해 돌려준다. 배열 overload는 없다(`shuffle`이 담당한다).

| 항목           | 내용                                                                         |
| -------------- | ---------------------------------------------------------------------------- |
| 입력 `source`  | 함수. 아니면 `RangeError`(다른 인자 검증보다 먼저)                           |
| 입력 `length`  | `0` 이상 `2^32 - 1`(배열 최대 길이) 이하의 safe integer. 위반은 `RangeError` |
| `length === 0` | `[]`를 돌려주고 `source`를 호출하지 않는다                                   |
| 분포           | 모든 순열이 등확률(계약)                                                     |

```ts
import { permutation, createXoshiro128Source } from "@cp949/random";

const order = permutation(createXoshiro128Source("shuffle-order"), 10);
```

## `weightedChoice(source, items, weights)`

```ts
function weightedChoice<T>(
  source: RandomSource,
  items: readonly T[],
  weights: readonly number[],
): T;
```

원소 `i`가 뽑힐 확률은 `weights[i] / total`이다. `threshold = float(source) * total`을 계산하고 왼쪽에서 오른쪽으로 누적합을 더하며 `threshold < cumulative[i]`인 첫 `i`의 `items[i]`를 돌려준다. 부동소수점 반올림으로 끝까지 조건을 만족하는 `i`가 없으면 가중치가 양수인 마지막 원소를 돌려준다.

| 항목           | 내용                                               |
| -------------- | -------------------------------------------------- |
| 입력 `source`  | 함수. 아니면 `RangeError`(다른 인자 검증보다 먼저) |
| 입력 `items`   | 배열. 아니면 `RangeError`                          |
| 입력 `weights` | 아래 "가중치 검증" 표. 위반은 모두 `RangeError`    |
| 0 가중치 원소  | 허용하되 뽑히지 않는다                             |
| word 소비      | `2`(`float` 1회)                                   |
| 분포           | 원소 `i` 확률 `weights[i] / total`(계약)           |

## `createWeightedSampler(items, weights)`

```ts
type WeightedSampler<T> = (source: RandomSource) => T;

function createWeightedSampler<T>(
  items: readonly T[],
  weights: readonly number[],
): WeightedSampler<T>;
```

`items`와 `weights`를 생성 시 한 번 검증·전처리(누적합 배열)해 클로저에 보관하는 sampler를 만든다. 이후 원본 `items`·`weights`를 바꿔도 sampler에 영향이 없다. 돌려준 함수는 호출마다 `source`만 받아 `weightedChoice`와 같은 임계값 산식·선택 조건·fallback으로 원소를 고른다(이진 탐색). 같은 `source` 상태에서 `weightedChoice(source, items, weights)`와 같은 원소를 돌려준다(계약).

| 항목              | 내용                                                                        |
| ----------------- | --------------------------------------------------------------------------- |
| 생성 시 검증 순서 | `items`(배열) → `weights`(아래 표). 위반은 `RangeError`                     |
| 호출 시 검증      | `source`가 함수가 아니면 `RangeError`                                       |
| sampler 상태      | 없음. 호출 사이 결과는 독립(복원 추출). 두 sampler는 상태를 공유하지 않는다 |
| word 소비         | 호출마다 `2`(`float` 1회). 생성 시 `0`(`source`를 받지 않는다)              |

```ts
import { createWeightedSampler, createXoshiro128Source } from "@cp949/random";

const rollLoot = createWeightedSampler(
  ["common", "rare", "legendary"],
  [70, 25, 5],
);
const source = createXoshiro128Source("loot-table");
const drop = rollLoot(source);
```

### 가중치 검증

`weightedChoice`와 `createWeightedSampler`가 공유한다(design spec 6절 WT-1~WT-7). 위반은 모두 `RangeError`다.

| 항목          | 내용                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------- |
| 배열          | `weights`는 `Array.isArray`여야 한다                                                           |
| 길이          | `weights.length === items.length`. 다르면 `RangeError`(`items`가 비면 `weights`도 비어야 한다) |
| 원소 타입     | `typeof`가 `"number"`이고 유한(`Number.isFinite`)하며 `0` 이상. `-0`은 `0`으로 본다            |
| 합계 overflow | 왼쪽에서 오른쪽으로 더하는 도중 `Infinity`가 되면 `RangeError`                                 |
| 합계 0        | 최종 합계가 `0`이면(빈 배열, 전부 0) `RangeError`                                              |
| 정규화        | 하지 않는다. `[1, 2]`와 `[0.5, 1]`은 같은 분포                                                 |
| 검증 순서     | 배열 → 길이 일치 → 원소 검사·누적을 한 번의 순회로 함께                                        |

## 사용 환경

컬렉션 샘플링은 root entry의 일부이므로 `docs/api/random-core.md`의 "사용 환경"(난수원 불필요, crypto 미접근, import 경로)을 그대로 따른다. `RandomSource`는 seeded, secure(`./secure`의 `createSecureSource()`), 커스텀 source를 구분하지 않는다.

## 번들 측정

값 export 7개를 각각 단독 import한 minified + brotli 크기다. 측정일은 2026-09-21, 도구는 size-limit 14.0.0(`@size-limit/preset-small-lib` 14.0.0)이다. 한도는 `docs/api/random-core.md`와 같은 공식 `ceil(측정값 × 1.5 / 50) × 50` B로 정했고 `packages/random/.size-limit.json`에 기록한다. 표의 측정값은 현재 빌드의 수치라서 한도를 정한 값과 달라질 수 있다. `choice`는 `float`·가중치 코드를 끌어오지 않는다.

| export                  | 측정값 | 한도  |
| ----------------------- | ------ | ----- |
| `choice`                | 241 B  | 400 B |
| `shuffle`               | 265 B  | 400 B |
| `shuffleInPlace`        | 261 B  | 400 B |
| `sample`                | 332 B  | 500 B |
| `permutation`           | 324 B  | 500 B |
| `weightedChoice`        | 372 B  | 600 B |
| `createWeightedSampler` | 465 B  | 700 B |
