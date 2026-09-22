# 재현 가능한 난수 코어 요구사항

- 상태: 승인 (2026-09-21)
- 작성일: 2026-09-21
- 검토 수정: 2026-09-21 1차(구현 대조), 2차(미결정 3건 확정). 검토로 바뀐 결정은 8절 결정 기록에 "(검토)"로 표시한다.
- 대상: `@cp949/random` 0.1.0 root(`.`) entry와 `./secure`의 `createSecureSource`. 로드맵 R4의 design spec이며 함수 시그니처와 오류 계약을 확정한다.
- 이 문서가 정하지 않는 것: golden vector의 실제 값(테스트 fixture가 소유하고, 대표 벡터는 공개 계약 문서 `docs/api/random-core.md`에 기록한다. R3가 고정 벡터를 `docs/api/id.md`에 기록한 방식과 같다).

## 1. 목적과 범위

소비자가 seed로 재현 가능한 난수열을 얻고, 정수·실수·불리언 helper를 같은 `RandomSource`로 조합하며, 필요하면 자체 난수원(secure 또는 커스텀)을 연결한다. R5(샘플링), R7(상태 facade)이 이 단계의 `RandomSource`와 helper 위에 쌓인다.

### 1.1 포함

3~7절의 요구를 R4에 포함한다.

### 1.2 제외

| 항목                                                                            | 제외 이유                                                                                                                                                                                           |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 분포(`normal`, `exponential` 등)                                                | 제공하지 않는다. 로드맵 §6 범위 밖이다.                                                                                                                                                              |
| 컬렉션 샘플링(`choice`, `shuffle`, `sample`)                                    | R5 범위.                                                                                                                                                                                            |
| 상태 facade(`createRandomState`, module-level `rand`)                           | R7 범위.                                                                                                                                                                                            |
| float 함수 어댑터(`[0, 1)` 실수를 돌려주는 함수를 `RandomSource`로 감싸는 함수) | 로드맵 R4 범위에 있으나 제외한다. 소비자가 `() => Math.floor(f() * 2 ** 32)` 한 줄로 만들 수 있고 반복 wrapper 사례가 없다. 이 한 줄을 API 문서 레시피로 싣는다. 로드맵 R4 범위 문구도 같이 고쳤다. |
| 가중 `sign`(확률 인자)                                                          | `bool(source, p)`로 충분하다. `sign`은 `bool`을 호출하지 않는 최소 leaf로 유지한다.                                                                                                                 |
| `RandomSource`의 상태 스냅샷/직렬화(`getState`/`setState`)                      | 로드맵 R9 후보(`RandomState` 상태 스냅샷)와 중복. `() => number` 형태는 상태를 노출하지 않으므로 승격 시 별도 타입으로 다룬다.                                                                      |
| 추가 PRNG(sfc32, PCG 등)                                                        | 로드맵 R9 후보. `createXoshiro128Source`와 병렬 배치가 가능하도록 이름에 알고리즘을 명시해 여지를 남긴다.                                                                                           |

## 2. 용어

- source: `RandomSource`, `[0, 2^32)`의 정수 하나를 돌려주는 함수 `() => number`.
- word: source가 한 번에 돌려주는 32비트 정수 값.
- seed: PRNG 상태를 초기화하는 입력(숫자 또는 문자열).
- helper: source를 첫 인자로 받아 값을 만드는 공개 함수(`int`, `float`, `bool`, `sign`, `uniform`).
- word 소비: helper 한 번 호출이 source를 호출하는 횟수.
- golden vector: 고정 입력에 대해 미리 확정한 출력. 참조 구현이나 표준 테스트 벡터로 독립 생성한 값이며, 우리 구현의 출력을 복사한 값이 아니다.

## 3. 모듈 구성

- 재현 가능한 난수 코어는 `packages/random/src/core/`에 두고 subpath를 새로 만들지 않고 root(`.`) entry로 export한다(로드맵 §6: "0.1.0의 범위는 일반 random, `./state`, `./secure`, `./id`").
- core 파일: `random-source.ts`(타입과 `assertRandomSource`), `xoshiro128.ts`, `seed.ts`(SplitMix32·FNV-1a·seed 정규화, 비공개), `int.ts`, `float.ts`, `bool.ts`, `sign.ts`, `uniform.ts`, `index.ts`.
- root 공개 export: 타입 `RandomSource`, 함수 `createXoshiro128Source`, `int`, `float`, `bool`, `sign`, `uniform`. root는 crypto에 접근하는 코드를 포함하지 않는다(import·호출 어느 시점에도 `globalThis.crypto`를 읽지 않는다).
- `createSecureSource`는 `src/secure/secure-source.ts`에 두고 `./secure`로 export한다. `./secure`는 `RandomSource` 타입도 재export한다. word 버퍼는 `src/secure/word-source.ts`의 `createWordSource`로 `randomInt`와 공유한다. 근거: 로드맵 정체성 "재현 가능한 난수와 보안 난수는 subpath도 나눈다. 둘 이상을 합칠 때는 명시적 합성(`RandomSource`에 `secureSource` 주입)으로만 한다". `SecureRandomUnavailableError`와 crypto 접근점이 이미 `./secure`에 있어 root 재export와 패턴 복제가 사라진다.
- `int.ts`는 `internal/uniform-int.ts`의 `uniformInt`와 `internal/validate.ts`의 `assertSafeIntRange`를, `bool.ts`는 `internal/validate.ts`의 `assertProbability`를 재사용한다(새로 만들지 않는다).

## 4. RandomSource와 PRNG 요구

- **SRC-1. 계약.** `type RandomSource = () => number`. 호출마다 `[0, 2^32)`의 정수를 돌려준다. 라이브러리는 이 값을 매 호출 검증하지 않는다. 범위 밖 값이나 비정수를 돌려주는 source의 결과는 정의되지 않으며 문서에 적는다. 라이브러리는 source를 동기적으로만 호출한다. source가 던진 예외는 감싸지 않고 그대로 전파한다.
- **SRC-2. 기본 PRNG.** xoshiro128\*\*. 4-word(128비트) 상태. 상태 전이와 출력 scrambler(`rotl(s1 * 5, 7) * 9`)는 Blackman·Vigna의 참조 구현 `xoshiro128starstar.c`와 word 단위로 같다. 참조 구현이 raw 출력 golden vector의 독립 출처다.
- **SRC-3. `createXoshiro128Source(seed: number | string): RandomSource`.**
  - `seed`는 필수다. `undefined`, `null`, 숫자·문자열 외 타입은 `RangeError`.
  - 숫자 seed는 safe integer만 허용한다(`NaN`, `Infinity`, 소수는 `RangeError`). `seed >>> 0`으로 uint32 정규화한다. 따라서 `seed`와 `seed + 2^32`는 같은 상태를 만들고 음수는 2의 보수로 해석된다(`-1`과 `0xFFFFFFFF`가 같다). `Date.now()`처럼 2^32 이상인 값도 받는다. 이 별칭 관계를 문서에 적고 테스트로 고정한다.
  - 문자열 seed는 FNV-1a 32비트로 uint32 해시로 바꾼다. offset basis `0x811C9DC5`, prime `0x01000193`. 문자열을 UTF-16 코드 유닛 순서로 순회하며 유닛 값(0~65535)을 그대로 XOR한 뒤 prime을 곱한다(바이트로 나누지 않는다). ASCII 문자열의 결과는 표준 FNV-1a 8비트 테스트 벡터와 같다(`""` → `0x811C9DC5`, `"a"` → `0xE40C292C`, `"foobar"` → `0xBF9CF968`). 빈 문자열은 유효한 seed다. 짝 없는 surrogate도 코드 유닛 값 그대로 처리하며 `RangeError`가 아니다. `"123"`과 `123`은 다른 상태다.
  - 상태 확장: 정규화된 uint32를 SplitMix32의 초기 상태로 두고 출력 4개를 순서대로 `s0`, `s1`, `s2`, `s3`으로 쓴다. SplitMix32는 상태에 `0x9E3779B9`를 더한 값에 mixer `z ^= z >>> 15; z = imul(z, 0x85EBCA6B); z ^= z >>> 13; z = imul(z, 0xC2B2AE35); z ^= z >>> 16`을 적용해 출력한다. 증분과 mixer 상수·shift 폭은 재현성 계약의 일부다.
  - all-zero 보정 분기를 두지 않는다. 근거: SplitMix32 mixer는 전단사이고 네 입력(`seed + k * 0x9E3779B9 mod 2^32`, `k = 1..4`)은 서로 다르므로 출력 넷이 모두 0일 수 없다. xoshiro128\*\*의 상태 전이는 GF(2) 위의 가역 선형 사상이라 0이 아닌 상태는 0이 되지 않는다. 두 논증을 API 문서에 적는다. 도달 불가 분기는 mutation 테스트에서 살아남는 mutant가 된다(`docs/api/secure.md` "결함 난수원"과 같은 원칙). 로드맵 완료 조건 "PRNG 상태가 all-zero가 되지 않는다"는 이 논증과 7.3의 테스트로 충족한다.
  - 호출마다 독립된 상태를 가진 새 `RandomSource`를 돌려준다(인스턴스 간 공유 없음, R3의 C-2/SEQ-7과 같은 원칙).
  - 구별 가능한 초기 상태는 최대 2^32개다(숫자·문자열 모두 uint32를 거친다). 문서에 적는다.
- **SRC-4. `createSecureSource(): RandomSource`(`./secure`).**
  - 호출 시점에 `getCrypto()`로 즉시 지원 확인한다. 미지원이면 그 자리에서 `SecureRandomUnavailableError`를 던진다(생성 시점 eager 검사. 첫 word 호출까지 미루지 않는다). 생성 후의 환경 변화는 고려하지 않는다.
  - `randomInt`와 같은 `createWordSource`를 쓴다. `getRandomValues`에서 32바이트씩 받아 big-endian으로 word 8개로 나눠 내주며 버퍼는 반환된 함수 클로저 안에만 있다(호출마다 독립).
  - `getRandomValues`가 던진 오류는 그대로 전파하고 부분 결과를 돌려주지 않는다. 다음 호출은 다시 채우기를 시도한다.
  - 결과값은 무작위이며 재현할 수 없다(계약이 아니다). 버퍼 크기와 채우는 시점도 계약이 아니다.
  - 모듈 import 시점에는 crypto에 접근하지 않는다(운영 원칙 재확인). `./secure`의 fail-closed 계약(`getCryptoCapabilities`를 뺀 모든 함수가 미지원 환경에서 `SecureRandomUnavailableError`)에 포함된다.
  - 문서: root helper를 거친 결과에 보안 보증을 하지 않는다. token과 ID에는 `./secure`의 함수와 `./id`를 쓴다(R7 `rand` 문서와 같은 문구).
- **SRC-5. 재현성 계약.** 다음 셋이 로드맵 §2의 재현성 계약이다. 변경은 breaking이다.
  1. xoshiro128\*\*의 raw 출력 스트림.
  2. seed→상태 변환(숫자 정규화, FNV-1a, SplitMix32 상수 포함).
  3. raw 스트림 위의 `float`·`bool`·`sign` 산식(53-bit 조합, 최상위 비트, `float < p`). 근거: Python `random.random()`이 같은 보장을 하고, 산식이 표준이라 개선 여지가 없으며 비용이 없다. 소비자의 "seed로 재현 가능한 난수열"은 raw word가 아니라 이 helper 결과이므로 계약에 넣어야 실질적인 보장이 된다.
  - `int`와 `uniform`의 결과값은 계약이 아니다. `int`는 `uniformInt`의 word 소비 방식이 R1에서 비계약이고, `uniform`은 부동소수점 산식의 개선 여지를 남긴다. 산식은 이 문서가 고정하며 변경은 CHANGELOG에 기록한다(7.1).

## 5. 공개 함수 요구

```ts
type RandomSource = () => number;

function createXoshiro128Source(seed: number | string): RandomSource; // root
function createSecureSource(): RandomSource; // ./secure

function int(source: RandomSource, min: number, max: number): number;
function float(source: RandomSource): number;
function bool(source: RandomSource, p?: number): boolean;
function sign(source: RandomSource): 1 | -1;
function uniform(source: RandomSource, min: number, max: number): number;
```

공통: 모든 helper는 첫 인자로 `source: RandomSource`를 받는다. 검증 순서는 `source`(함수가 아니면 `RangeError`) → 나머지 인자(`RangeError`) → source 호출이다. 인자 검증에 실패하면 source를 호출하지 않는다. 숫자 인자의 타입 규칙은 R1과 같다(`typeof`가 `"number"`. 문자열, `NaN`, `undefined`, `null`은 `RangeError`). `undefined`는 기본값이 있는 인자(`bool`의 `p`)에서만 생략과 같고 `null`은 `RangeError`다.

- **FN-1. `int(source, min, max): number`.** `[min, max]` 양끝 포함. `min`/`max`는 `assertSafeIntRange`로 검증한다(safe integer, `min <= max`, 범위 크기 `Number.MAX_SAFE_INTEGER` 이하. R1의 `randomInt`와 같은 계약). 내부적으로 `uniformInt(source, size)`를 그대로 쓴다. 범위 크기가 1이면 `min`을 돌려준다. source 호출 여부와 word 소비는 `uniformInt`를 따르며 계약이 아니다(R1 `randomInt`의 "word 소비 방식은 계약이 아니다"와 같다). `-0`은 나오지 않는다.
- **FN-2. `float(source): number`.** `[0, 1)` 반개구간, 53-bit 정밀도. source를 2회 호출해 `((w1 >>> 5) * 2 ** 26 + (w2 >>> 6)) / 2 ** 53`으로 조합한다. 결과는 `2^-53`의 배수이고 최댓값은 `1 - 2^-53`이다. `uniform(source, 0, 1)`과 같은 값이다.
- **FN-3. `bool(source, p?): boolean`.**
  - `p`를 생략하거나 `undefined`면 source를 1회 호출해 최상위 비트로 판정한다(`(word >>> 31) === 1`). 근거: helper는 source를 가리지 않는데, 사용자 정의 source(LCG, xoshiro128+ 등)는 최하위 비트의 품질이 낮은 경우가 흔하다. `float`도 같은 이유로 하위 비트를 버린다(`>>> 5`, `>>> 6`).
  - `p`를 주면 `float(source) < p`로 판정한다(word 2개). `p`는 `[0, 1]`의 number(양끝 포함)여야 하고 `NaN`, 범위 밖, 타입 위반은 `RangeError`다. `0`이면 항상 거짓, `1`이면 항상 참이다(`float`은 1 미만). `float === p`는 거짓(엄격한 미만).
  - 두 경로는 서로 다른 추출이다. `bool(s)`와 `bool(s, 0.5)`의 결과 열은 같지 않다(`bool(s, 0.5)`는 첫 word의 최상위 비트가 0일 때 참). 문서에 적는다.
- **FN-4. `sign(source): 1 | -1`.** `bool(source) ? 1 : -1`과 같은 값. `bool`을 호출하지 않고 최상위 비트로 직접 판정해 확률 인자 경로(`float`, `assertProbability`)를 번들에 끌어오지 않는다. 확률 인자는 없다.
- **FN-5. `uniform(source, min, max): number`.** `[min, max)` 반개구간, 실수 허용.
  - `min`/`max`는 유한(finite) 숫자이고 `min < max`여야 한다. 같으면 빈 구간이라 `RangeError`다(R5의 빈 배열 `choice`와 같은 규칙. `int`는 닫힌 구간이라 `min === max`를 허용하는 것과 대비된다). `max - min`이 `Infinity`면 `RangeError`다(예: `uniform(s, -Number.MAX_VALUE, Number.MAX_VALUE)`).
  - `min + float(source) * (max - min)`으로 계산한다. 결과가 `max` 이상이면 `max` 미만의 가장 큰 double로 보정한다. 근거: 부동소수점 반올림으로 합이 `max`가 될 수 있다. `uniform(s, 10, 20)`에서 `float`이 `1 - 2 ** -53`이면 `20 - 10 * 2 ** -53`이 `20`으로 반올림된다. Python·NumPy는 이를 문서로만 알리고, Java `RandomGenerator.nextDouble(origin, bound)`는 `nextDown(bound)`로 보정한다. 반개구간 계약을 지키기 위해 보정한다.
  - word 2개를 소비한다.
- **FN-6. 무편향 helper 공유.** `int`가 seeded/secure/custom source 어느 쪽에서 호출되든 같은 `uniformInt` 경로를 탄다(완료 조건 직결).

## 6. 오류 계약

- 새 오류 클래스를 만들지 않는다. root entry가 직접 던지는 오류는 `RangeError`(인자·타입 위반, `source`가 함수가 아닌 경우 포함) 하나다. `SecureRandomUnavailableError`는 `./secure`의 `createSecureSource`가 던지며 root는 이 클래스를 재export하지 않는다. 타입 위반도 `TypeError`가 아니라 `RangeError`다(R1·`./id`의 C-6과 같다).
- source와 `getRandomValues`가 던진 오류는 감싸지 않고 그대로 전파한다.
- 인자 검증이 source 호출보다 먼저이므로 잘못된 인자는 source와 무관하게 항상 `RangeError`다.
- 오류 메시지는 영어이며 문구는 계약이 아니다. 오류 타입만 계약이다(R1과 같다).

## 7. 보장과 검증

### 7.1 계약 표

API 문서에 항목별로 싣는다(로드맵 §4 "결과값이 계약인지 여부").

| 항목                                            | 계약 여부                                                      |
| ----------------------------------------------- | -------------------------------------------------------------- |
| xoshiro128\*\* raw 출력 스트림                  | 계약. golden vector로 고정. 변경은 breaking                    |
| seed→상태 변환(정규화, FNV-1a, SplitMix32 상수) | 계약. 변경은 breaking                                          |
| `float`·`bool`·`sign`의 산식과 결과 열          | 계약. golden vector로 고정. 변경은 breaking                    |
| `uniform` 산식·보정                             | 이 문서가 고정. 계약은 아니며 변경은 CHANGELOG에 기록          |
| `int` 결과값, word 소비                         | 계약 아님(`uniformInt`에 종속)                                 |
| `createSecureSource` 결과값, 버퍼 크기          | 무작위. 계약 아님                                              |
| 분포                                            | `[min, max]`·`[0, 1)`·`[min, max)` 안 균등, `bool`의 `p`(계약) |

### 7.2 word 소비

API 문서에 싣되 계약이 아님을 적는다.

| helper    | word 소비                                        |
| --------- | ------------------------------------------------ |
| `int`     | `uniformInt`가 정한다. 범위 크기 1이면 0(비계약) |
| `float`   | 2                                                |
| `bool`    | `p` 생략 시 1, `p` 지정 시 2                     |
| `sign`    | 1                                                |
| `uniform` | 2                                                |

### 7.3 검증

| 항목                                                   | 검증 방법                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| xoshiro128\*\* raw 출력                                | 참조 구현으로 독립 생성한 golden vector(고정 seed 8개의 처음 5개 word). rotate·shift·상수 mutation이 실패하는지 mutation 테스트로 확인(TRP-005 참조)                                                                                                                                                                                      |
| seed→상태 변환                                         | FNV-1a 표준 벡터(ASCII 3개), 비ASCII 문자열 벡터, 숫자 seed 벡터(0, 1, 42, `-1`, `Number.MAX_SAFE_INTEGER`). 별칭 테스트: `-1`과 `Number.MAX_SAFE_INTEGER` 같음, `2 ** 32 + 1`과 `1` 같음, `"123"`과 `123` 다름, `""` 유효                                                                                                                |
| `float`·`bool`·`sign` 결과 열                          | seed 0의 처음 값 golden vector(`float` 2개, `bool` 5개, `sign` 5개, `bool(source, 0.5)` 2개)                                                                                                                                                                                                                                              |
| `int`가 seeded/secure/custom 모두에서 같은 helper 사용 | 경계 word 주입 + 통계 테스트                                                                                                                                                                                                                                                                                                              |
| PRNG 상태 all-zero 방지                                | SRC-3의 논증을 API 문서에 기록. 테스트: seed `0`, `1`, `-1`, `0xFFFFFFFF`, `Number.MAX_SAFE_INTEGER`, `""`, `"a"`의 초기 상태가 non-zero                                                                                                                                                                                                  |
| `Math.random` 0건                                      | 기존 정적 게이트(grep)                                                                                                                                                                                                                                                                                                                    |
| `float`/`bool`/`sign`/`uniform` 균등성                 | 카이제곱/빈도 통계 테스트. `bool(source, 0.25)`는 이론 비율 25%에 대한 카이제곱                                                                                                                                                                                                                                                           |
| helper 경계 word 주입                                  | `float`: `(0, 0)` → `0`, `(0xFFFFFFFF, 0xFFFFFFFF)` → `1 - 2 ** -53`. `bool`: `0x7FFFFFFF` → `false`, `0x80000000` → `true`, `p = 0`·`1`·`2 ** -53` 경계. `uniform`: `uniform(s, 1, 1 + 2 ** -52)`에 all-ones 주입 → `1`(보정), `uniform(s, 3, 3)`·`uniform(s, -Number.MAX_VALUE, Number.MAX_VALUE)` → `RangeError`. `int(s, 5, 5)` → `5` |
| 검증 순서                                              | 잘못된 인자에서 source가 호출되지 않는다(호출 횟수 spy). source 검증이 `min`/`max`·`p` 검증보다 먼저다                                                                                                                                                                                                                                    |
| `createSecureSource()` 미지원 환경 즉시 실패           | `./secure` fail-closed 테스트(4가지 미지원 상태)와 R0 API 부재 harness 재사용. `getRandomValues` 예외 전파와 재시도                                                                                                                                                                                                                       |
| root entry가 crypto에 접근하지 않음                    | root 값 export 목록에 crypto 관련 이름이 없다. R0 harness: crypto 제거 후 root import, `createXoshiro128Source`와 helper가 정상 동작(tarball smoke)                                                                                                                                                                                       |
| 번들                                                   | root 값 export 6개와 `./secure`의 `createSecureSource` 측정·한도 등록(`.size-limit.json`). `sign`이 `bool`의 확률 경로를 포함하지 않는다                                                                                                                                                                                                  |
| mutation                                               | core 7개 파일과 `secure/secure-source.ts`, `secure/word-source.ts`를 `stryker.config.mjs`의 `mutate`에 추가하고 점수 하한 95를 유지한다                                                                                                                                                                                                   |

## 8. 결정 기록

2026-09-21 확정. "(검토)"는 같은 날 1차 검토(구현 대조)로, "(2차 검토)"는 미결정 3건 확정으로 바뀌거나 추가된 결정이다.

| 결정                      | 내용                                                                                                                                                                                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| raw 스트림 계층 타입 이름 | `RandomSource = () => number`. README "확정된 제약"이 spec에 위임한 이름이다. `./secure`도 타입을 재export한다.                                                                                                                                                        |
| 공개 이름                 | `createXoshiro128Source`(알고리즘 명시, R9 추가 PRNG와 병렬 배치), `createSecureSource`(로드맵·CHANGELOG의 `secureSource`를 팩토리 명명 규칙 `create*`로 확정), helper `int`·`float`·`bool`·`sign`·`uniform`.                                                          |
| 배치                      | 재현 가능한 난수 코어는 root entry(`src/core/`). `createSecureSource`는 `./secure`(`src/secure/secure-source.ts`, word 버퍼는 `randomInt`와 공유). root는 crypto 코드를 포함하지 않고 `SecureRandomUnavailableError`를 재export하지 않는다. (2차 검토: 이전 root 배치) |
| 숫자 seed 정규화          | `>>> 0`. 별칭(`seed`와 `seed + 2^32`, 음수는 2의 보수)을 허용하고 문서·테스트로 고정한다. 대안(uint32 밖은 `RangeError`)은 `Date.now()` seed를 막아 채택하지 않았다. (검토: 별칭 명시)                                                                                 |
| 문자열 seed 해시          | FNV-1a 32비트, 코드 유닛 값 XOR. ASCII는 표준 벡터를 재사용한다. (검토: 처리 단위·상수 명시)                                                                                                                                                                           |
| SplitMix32 상수           | 증분 `0x9E3779B9`. mixer `>>> 15`, `0x85EBCA6B`, `>>> 13`, `0xC2B2AE35`, `>>> 16`(murmur3 fmix32 상수, 첫 shift 15). 구현(`seed.ts`)에서 확인해 기입했다. (검토)                                                                                                       |
| all-zero 보정             | 두지 않는다. SplitMix32 전단사와 xoshiro 전이 가역성으로 논증한다. (검토: 이전 `s0 = 1` 보정은 도달 불가 분기라 제거)                                                                                                                                                  |
| `bool` 비트               | 최상위 비트. (검토: 이전 최하위 비트. 사용자 정의 source의 하위 비트 품질 때문에 변경)                                                                                                                                                                                 |
| 가중 `bool`               | `bool(source, p?)`. `p`는 `[0, 1]` number, `float(source) < p`, word 2개. 생략 경로(1 word)는 유지한다. `sign`은 확률 인자 없이 `bool`과 독립인 최소 leaf. (2차 검토: 이전 제외)                                                                                       |
| `uniform` 구간            | `min < max`, `max - min` 유한, 결과가 `max` 이상이면 `max` 미만 최대 double로 보정. (검토: 이전 `min <= max`, 보정 없음. 반개구간 계약 위반 가능성 때문에 변경)                                                                                                        |
| 결과값 계약               | raw 스트림, seed→상태 변환, `float`·`bool`·`sign` 산식이 계약. `int`·`uniform`은 산식 고정·비계약. 로드맵 §2와 README를 함께 고쳤다. (2차 검토: 이전 helper 전부 비계약)                                                                                               |
| 오류                      | root는 `RangeError`만. `SecureRandomUnavailableError`는 `./secure`. source·`getRandomValues` 오류는 그대로 전파. (검토: 전파 규칙 명시. 2차 검토: root 재export 제거)                                                                                                  |
| float 함수 어댑터         | 제외. 레시피 한 줄로 대체. (검토: 로드맵 R4 범위와의 차이를 명시)                                                                                                                                                                                                      |
| 검증 순서                 | `source` → 나머지 인자 → source 호출. (검토)                                                                                                                                                                                                                           |
| golden vector 출처        | raw 출력은 참조 구현, 문자열 해시는 FNV 표준 벡터로 독립 생성한다. helper 결과 열은 raw word에서 산식으로 유도해 고정한다. 우리 구현의 출력을 복사해 만들지 않는다. (검토)                                                                                             |

## 9. 미결정

현재 없음. 1.2의 제외 항목은 수요 증거가 확인되면 R9 후보로 다룬다.
