# `@cp949/random`(root) API 계약

재현 가능한 난수 코어의 입력 검증, 오류, 결과값 계약을 함수별로 기록한다. 계약은 이 문서와 소스의 TSDoc에 적힌 동작이다. 오류 메시지 문구는 계약이 아니다.

## 공개 export

| export                   | 시그니처                                                     | 요약                                     |
| ------------------------ | ------------------------------------------------------------ | ---------------------------------------- |
| `RandomSource`           | 타입 `() => number`                                          | 재현 가능한 난수의 최소 계약             |
| `createXoshiro128Source` | `(seed: number \| string) => RandomSource`                   | seed로 만드는 xoshiro128\*\* source      |
| `int`                    | `(source: RandomSource, min: number, max: number) => number` | `[min, max]`(양끝 포함)의 편향 없는 정수 |
| `float`                  | `(source: RandomSource) => number`                           | `[0, 1)` 53-bit 실수                     |
| `bool`                   | `(source: RandomSource, p?: number) => boolean`              | 참/거짓. `p`를 주면 참일 확률 `p`        |
| `sign`                   | `(source: RandomSource) => 1 \| -1`                          | 균등한 부호                              |
| `uniform`                | `(source: RandomSource, min: number, max: number) => number` | `[min, max)`의 균등 실수                 |

```ts
import {
  bool,
  createXoshiro128Source,
  float,
  int,
  sign,
  uniform,
  type RandomSource,
} from "@cp949/random";
```

`getRandomValues` 기반 source는 `./secure`의 `createSecureSource()`가 만든다(`docs/api/secure.md`). root entry는 crypto에 접근하는 코드를 포함하지 않는다.

## 사용 환경

- root entry는 난수원을 요구하지 않는다. `Math.random`도 `globalThis.crypto`도 쓰지 않으며 import·호출 어느 시점에도 접근하지 않는다. crypto가 없는 환경에서도 모든 함수가 동작한다.
- 보안 난수를 helper에 넣으려면 `./secure`의 `createSecureSource()`를 주입한다. 미지원 환경의 오류(`SecureRandomUnavailableError`)도 `./secure`가 던진다.
- import 경로는 `@cp949/random`(subpath 없음)이며 `package.json`의 `exports` 맵으로 제공한다. `./secure`, `./id`와 같은 조건(TypeScript 5.7 이상, `moduleResolution`이 `Bundler` 또는 `NodeNext`)을 따른다.
- 실브라우저 실측과 검증 한계는 `docs/compatibility.md`에 있다.

## 공통 규칙

### source 검증

`int`, `float`, `bool`, `sign`, `uniform` 다섯 함수는 모두 첫 인자로 `source: RandomSource`를 받는다. `source`가 함수가 아니면 `RangeError`다. 이 검증은 다른 인자 검증보다 먼저 한다.

`source`가 반환한 값이 `[0, 2^32)` 범위를 벗어나거나 정수가 아니어도 매 호출 검증하지 않는다. 그런 source의 결과는 정의되지 않는다. 라이브러리는 source를 동기적으로만 호출하고, source가 던진 예외는 감싸지 않고 그대로 전파한다. 인자 검증에 실패하면 source를 호출하지 않는다.

### 재현성

재현성 계약은 다음 셋이다. 변경은 breaking이다(0.x는 minor 증가, 1.0 이후 major 증가).

1. `createXoshiro128Source(seed)`의 raw 출력 스트림(xoshiro128\*\*).
2. seed→상태 변환(숫자 정규화, 문자열 seed의 FNV-1a 해시, SplitMix32 확장과 그 상수).
3. raw 스트림 위의 `float`·`bool`·`sign` 산식(53-bit 조합, 최상위 비트, `float < p`). Python `random.random()`이 같은 보장을 한다.

같은 seed와 같은 호출 순서는 어느 릴리스에서든 같은 word, `float`, `bool`, `sign` 열을 낸다. golden vector는 각 테스트 파일에 있고 대표값은 아래 표에 있다.

`int`와 `uniform`의 결과값은 계약이 아니다. 산식(rejection sampling, 선형 스케일링과 상한 보정)은 이 문서와 `docs/product/random-core-requirements.md`가 고정하며, 변경은 CHANGELOG에 기록하고 breaking으로 다루지 않는다. 같은 릴리스 안에서는 같은 seed와 같은 호출 순서에서 항상 같은 결과를 낸다.

| 항목                                            | 계약 여부                                   |
| ----------------------------------------------- | ------------------------------------------- |
| xoshiro128\*\* raw 출력 스트림                  | 계약. golden vector로 고정. 변경은 breaking |
| seed→상태 변환(정규화, FNV-1a, SplitMix32 상수) | 계약. 변경은 breaking                       |
| `float`·`bool`·`sign`의 산식과 결과 열          | 계약. golden vector로 고정. 변경은 breaking |
| `uniform`의 산식과 보정                         | 고정. 변경은 CHANGELOG 기록, breaking 아님  |
| `int`의 결과값과 word 소비                      | 계약 아님(`uniformInt`에 종속)              |
| 각 helper의 분포(균등, `bool`의 `p`)            | 계약                                        |

## `RandomSource`

```ts
type RandomSource = () => number;
```

호출마다 `[0, 2^32)`의 정수(word) 하나를 돌려주는 함수. `int`/`float`/`bool`/`sign`/`uniform`의 공통 입력이며, `createXoshiro128Source`·`./secure`의 `createSecureSource`가 만든 source와 사용자가 직접 만든 함수를 구분하지 않는다. 타입은 `./secure`에서도 import된다.

## `createXoshiro128Source(seed)`

```ts
function createXoshiro128Source(seed: number | string): RandomSource;
```

seed로 재현 가능한 `RandomSource`를 만든다. 기본 PRNG는 xoshiro128\*\*(4-word, 128비트 상태)이며 출력은 Blackman·Vigna의 참조 구현 `xoshiro128starstar.c`와 word 단위로 같다.

| 항목         | 내용                                                                                                                                                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 입력 `seed`  | 필수. safe integer 또는 문자열. 그 밖의 타입, 소수, `NaN`, `Infinity`, 생략은 `RangeError`                                                                                                                                                                                                        |
| 숫자 seed    | `seed >>> 0`으로 uint32 정규화한다. `seed`와 `seed + 2^32`는 같은 상태를 만들고 음수는 2의 보수로 해석된다(`-1`, `0xFFFFFFFF`, `Number.MAX_SAFE_INTEGER`가 같은 출력). `Date.now()`처럼 2^32 이상인 값도 받는다                                                                                   |
| 문자열 seed  | FNV-1a 32비트(offset basis `0x811C9DC5`, prime `0x01000193`). UTF-16 코드 유닛 값을 그대로 XOR하므로 ASCII 문자열은 표준 FNV-1a 테스트 벡터와 같다(`""` → `0x811C9DC5`, `"a"` → `0xE40C292C`, `"foobar"` → `0xBF9CF968`). 빈 문자열과 짝 없는 surrogate도 유효하다. `"123"`과 `123`은 다른 상태다 |
| 상태 확장    | 정규화한 uint32를 SplitMix32의 초기 상태로 두고 출력 4개를 순서대로 `s0..s3`에 넣는다. SplitMix32는 상태에 `0x9E3779B9`를 더한 값에 mixer `z ^= z >>> 15; z = imul(z, 0x85EBCA6B); z ^= z >>> 13; z = imul(z, 0xC2B2AE35); z ^= z >>> 16`을 적용해 출력한다                                       |
| all-zero     | 보정 분기가 없다. mixer가 전단사이고 네 입력(`seed + k * 0x9E3779B9`, `k = 1..4`)이 서로 다르므로 출력 넷이 모두 0일 수 없다. xoshiro128\*\*의 상태 전이는 GF(2) 위의 가역 선형 사상이라 0이 아닌 상태는 0이 되지 않는다                                                                          |
| 초기 상태 수 | 최대 2^32개(숫자·문자열 모두 uint32를 거친다). 서로 다른 문자열이 같은 상태를 만들 수 있다                                                                                                                                                                                                        |
| 인스턴스     | 호출마다 독립된 상태를 가진 새 `RandomSource`를 돌려준다. 인스턴스끼리 상태를 공유하지 않는다                                                                                                                                                                                                     |
| 결과 값      | 재현 가능하다(계약). 같은 seed는 항상 같은 word 스트림을 낸다                                                                                                                                                                                                                                     |

출력은 예측 가능하다. xoshiro128\*\*는 연속 출력 몇 개로 내부 상태를 복원할 수 있다. token·ID·인증 코드에는 `./secure`와 `./id`를 쓴다.

대표 golden vector. 전체 벡터는 `packages/random/test/core/*.test.ts`에 있으며 raw word는 참조 구현으로 독립 생성한 값이다.

| seed      | word 1       | word 2       | word 3       |
| --------- | ------------ | ------------ | ------------ |
| `0`       | `421714071`  | `3306423891` | `3703563693` |
| `42`      | `3514831625` | `2416850046` | `1824449730` |
| `-1`      | `2529976508` | `137785713`  | `1957191416` |
| `"hello"` | `2966572188` | `3720780506` | `139503483`  |
| `""`      | `44620852`   | `3074285029` | `1870067664` |

seed `0`의 helper 결과 열(계약): `float` → `0.09818795896944998`, `0.8623031194841013`. `bool` → `false, true, true, true, false`. `sign` → `-1, 1, 1, 1, -1`.

```ts
import { createXoshiro128Source, int } from "@cp949/random";

const source = createXoshiro128Source("game-seed-1");
const roll = int(source, 1, 6); // 같은 seed·같은 호출 순서면 항상 같은 값
```

여러 값을 하나의 seed로 합칠 때는 구분자를 넣어 문자열로 join한다. 구분자가 없으면 `"ab" + "c"`와 `"a" + "bc"`가 같은 seed가 된다. 라이브러리는 다중 인자 seed를 받지 않는다(`docs/comparison.md` §3).

```ts
const source = createXoshiro128Source(`${userId}:${sessionId}:${round}`);
```

## `int(source, min, max)`

```ts
function int(source: RandomSource, min: number, max: number): number;
```

`[min, max]`(양끝 포함)에서 균등하게 정수를 뽑는다. rejection sampling으로 modulo 편향을 없앤다. `source`가 `createXoshiro128Source`, `./secure`의 `createSecureSource`, 사용자 정의 함수 중 무엇이든 같은 rejection sampling 경로(`./secure`의 `randomInt`와 같은 `uniformInt`)를 쓴다.

| 항목              | 내용                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| 입력 `source`     | 함수. 아니면 `RangeError`(다른 인자 검증보다 먼저)                                                                |
| 입력 `min`, `max` | 둘 다 safe integer. `min <= max`. 범위 크기 `max - min + 1`이 `Number.MAX_SAFE_INTEGER` 이하. 위반은 `RangeError` |
| 결과 범위         | `min` 이상 `max` 이하의 정수. `-0`은 나오지 않는다                                                                |
| 분포              | 범위 안의 정수가 같은 확률로 나온다(계약)                                                                         |
| 범위 크기 1       | `source`를 호출하지 않고 `min`을 돌려준다                                                                         |
| word 소비         | `uniformInt`가 정한다(범위 크기 2^32 이하는 1회 이상, 초과는 2회 이상, 거부 시 반복). 계약이 아니다               |
| 결과 값           | 계약이 아니다. 산식 변경은 CHANGELOG에 기록한다                                                                   |

```ts
import { createXoshiro128Source, int } from "@cp949/random";

const source = createXoshiro128Source(1);
const die = int(source, 1, 6);
```

## `float(source)`

```ts
function float(source: RandomSource): number;
```

`[0, 1)` 반개구간에서 53-bit 정밀도의 실수를 만든다. `source`를 2회 호출해 첫 word의 상위 27비트와 둘째 word의 상위 26비트를 조합한다: `((w1 >>> 5) * 2^26 + (w2 >>> 6)) / 2^53`.

| 항목          | 내용                                                           |
| ------------- | -------------------------------------------------------------- |
| 입력 `source` | 함수. 아니면 `RangeError`                                      |
| 결과 범위     | `0` 이상 `1` 미만. `2^-53`의 배수이며 최댓값은 `1 - 2^-53`이다 |
| word 소비     | 항상 2회                                                       |
| 분포          | `[0, 1)`에서 균등하다(계약)                                    |
| 결과 값       | 계약. 같은 seed의 `float` 열은 golden vector로 고정한다        |

## `bool(source, p?)`

```ts
function bool(source: RandomSource, p?: number): boolean;
```

참/거짓을 뽑는다. `p`를 생략하면 `source`를 1회 호출해 최상위 비트(`word >>> 31`)로 판정하고, `p`를 주면 `float(source) < p`로 판정한다. 최하위 비트를 쓰지 않는 이유: helper는 source를 가리지 않는데 사용자 정의 source(LCG, xoshiro128+ 등)는 하위 비트의 품질이 낮은 경우가 흔하다. `float`도 같은 이유로 하위 비트를 버린다.

| 항목          | 내용                                                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 입력 `source` | 함수. 아니면 `RangeError`(다른 인자 검증보다 먼저)                                                                          |
| 입력 `p`      | 생략 또는 `undefined`면 50%. 주면 `[0, 1]`의 number(양끝 포함). `NaN`, 범위 밖, 문자열, `null` 등은 `RangeError`            |
| `p` 경계      | `0`이면 항상 `false`, `1`이면 항상 `true`(`float`은 1 미만). `float === p`는 `false`(엄격한 미만)                           |
| word 소비     | `p` 생략 시 1회, `p` 지정 시 2회(`float` 호출 1회)                                                                          |
| 두 경로       | `bool(s)`와 `bool(s, 0.5)`는 서로 다른 추출이라 결과 열이 같지 않다. `bool(s, 0.5)`는 첫 word의 최상위 비트가 0일 때 참이다 |
| 분포          | `p` 생략 시 참/거짓 각각 50%, `p` 지정 시 참일 확률 `p`(계약)                                                               |
| 결과 값       | 계약. 같은 seed의 `bool` 열은 golden vector로 고정한다                                                                      |

```ts
import { bool, createXoshiro128Source } from "@cp949/random";

const source = createXoshiro128Source("loot");
const coin = bool(source); // 50%
const drop = bool(source, 0.05); // 5% 확률로 true
```

## `sign(source)`

```ts
function sign(source: RandomSource): 1 | -1;
```

`1`과 `-1`을 균등한 확률로 돌려준다. `bool(source)`와 같이 `source`를 1회 호출해 최상위 비트로 판정한다(`bool(source) ? 1 : -1`과 같은 값). 확률 인자는 없다.

| 항목          | 내용                                                   |
| ------------- | ------------------------------------------------------ |
| 입력 `source` | 함수. 아니면 `RangeError`                              |
| word 소비     | 항상 1회                                               |
| 분포          | `1`/`-1`이 각각 50%다(계약)                            |
| 결과 값       | 계약. 같은 seed의 `sign` 열은 golden vector로 고정한다 |

## `uniform(source, min, max)`

```ts
function uniform(source: RandomSource, min: number, max: number): number;
```

`[min, max)` 반개구간에서 균등하게 실수를 뽑는다. `min + float(source) * (max - min)`을 계산하고 결과가 `max` 이상이면 `max` 미만의 가장 큰 double로 보정한다.

| 항목               | 내용                                                                                                                                                                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 입력 `source`      | 함수. 아니면 `RangeError`(다른 인자 검증보다 먼저)                                                                                                                                                                                                                                        |
| 입력 `min`, `max`  | 둘 다 유한(finite) 숫자이고 `min < max`. `max - min`도 유한해야 한다. `NaN`, `Infinity`, 타입 위반, `min >= max`(같으면 빈 반개구간), `uniform(s, -Number.MAX_VALUE, Number.MAX_VALUE)`처럼 폭이 넘치는 입력은 `RangeError`                                                               |
| 결과 범위          | `min` 이상 `max` 미만. `float`은 1 미만이지만 `min`의 크기가 폭보다 크면 합이 `max`로 반올림된다(예: `uniform(s, 10, 20)`은 `20 - 10 * 2^-53`이 `20`이 된다). 이때 `max` 미만의 가장 큰 double(`20 - 2^-48`)로 보정한다. Java `RandomGenerator.nextDouble(origin, bound)`와 같은 방식이다 |
| word 소비          | 항상 2회(`float` 호출 1회)                                                                                                                                                                                                                                                                |
| 분포               | `[min, max)`에서 균등하다(계약). 보정은 `2^-53` 확률의 마지막 칸에만 닿는다                                                                                                                                                                                                               |
| `uniform(s, 0, 1)` | `float(s)`와 같은 값이다                                                                                                                                                                                                                                                                  |
| 결과 값            | 계약이 아니다. 산식 변경은 CHANGELOG에 기록한다                                                                                                                                                                                                                                           |

```ts
import { createXoshiro128Source, uniform } from "@cp949/random";

const source = createXoshiro128Source("physics-seed");
const jitter = uniform(source, -1.5, 1.5);
```

## 사용자 정의 source

`RandomSource`는 `() => number`이므로 `[0, 2^32)`의 정수를 돌려주는 함수면 무엇이든 helper에 넣을 수 있다. 보안 난수는 `./secure`의 `createSecureSource()`로 만든다. `[0, 1)` 실수를 돌려주는 다른 PRNG(seedrandom 등)는 한 줄로 감싼다. 이 어댑터는 라이브러리가 제공하지 않는다.

```ts
import { int, type RandomSource } from "@cp949/random";
import { createSecureSource } from "@cp949/random/secure";

declare const nextFloat: () => number; // [0, 1)
const wrapped: RandomSource = () => Math.floor(nextFloat() * 2 ** 32);
const roll = int(wrapped, 1, 6);

const secureRoll = int(createSecureSource(), 1, 6); // 재현 불가, 보안 용도 아님
```

`Math.random`을 감싸 넣는 것도 소비자의 선택이다. 그 결과는 재현할 수 없고 보안 용도가 아니다.

## 번들 측정

값 export 6개를 각각 단독 import한 minified + brotli 크기다. 측정일은 2026-09-21, 도구는 size-limit 14.0.0(`@size-limit/preset-small-lib` 14.0.0)이다. 한도는 `docs/api/id.md`와 같은 공식 `ceil(측정값 × 1.5 / 50) × 50` B로 정했고 `packages/random/.size-limit.json`에 기록한다. 표의 측정값은 현재 빌드의 수치라서 한도를 정한 값과 달라질 수 있다. 측정값은 API 결과값 계약이나 전체 앱 번들 크기를 뜻하지 않는다. `sign`은 `bool`을 호출하지 않고 직접 판정해 `float`·확률 검증 코드를 끌어오지 않는다.

| export                   | 측정값 | 한도  |
| ------------------------ | ------ | ----- |
| `createXoshiro128Source` | 348 B  | 600 B |
| `int`                    | 360 B  | 550 B |
| `uniform`                | 395 B  | 600 B |
| `bool`                   | 188 B  | 300 B |
| `sign`                   | 104 B  | 150 B |
| `float`                  | 103 B  | 200 B |

`./secure`의 `createSecureSource`는 319 B(한도 500 B)다.
