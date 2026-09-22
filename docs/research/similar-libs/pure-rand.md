# pure-rand (dubzzz/pure-rand) 심층 분석

`@cp949/random`과 같은 문제 영역(seedable PRNG + 균등 분포)을 다루는 `pure-rand`를 로컬 클론(`/work/thrd/pure-rand`)의 실제 소스 코드 기준으로 분석한다. README 요약이 아니라 `src/` 아래 구현·테스트 코드를 직접 읽고 인용했다.

## 1. 개요

| 항목                               | 값                                                                                                                               | 근거                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 목적                               | "Fast Pseudorandom number generators (aka PRNG) with purity in mind!"                                                            | `README.md:5`                                                         |
| 버전(로컬 클론)                    | `8.4.2`                                                                                                                          | `package.json:3`                                                      |
| 클론 시점 커밋                     | `be10b22b05c22242eb077388b0eb97882e9bbf87`(2026-07-10)                                                                           | `git log -1`(로컬 클론)                                               |
| 라이선스                           | MIT, Copyright (c) 2018 Nicolas DUBIEN                                                                                           | `LICENSE:1-3`                                                         |
| npm 최신 태그                      | `8.4.2`(레지스트리 조회 시점 최신과 로컬 클론 버전 일치)                                                                         | `registry.npmjs.org/pure-rand`(2026-09-22 조회)                       |
| 월간 다운로드                      | 246,942,217회(2026-08-22~2026-09-20 구간)                                                                                        | `api.npmjs.org/downloads/point/last-month/pure-rand`(2026-09-22 조회) |
| GitHub stars / forks / open issues | 117 / 5 / 17                                                                                                                     | `api.github.com/repos/dubzzz/pure-rand`(2026-09-22 조회)              |
| 첫 npm 배포                        | 2018-03-01                                                                                                                       | 레지스트리 `time.created`                                             |
| 런타임 의존성                      | 없음(`devDependencies`만 존재: `fast-check`, `vitest`, `typescript`, `rolldown` 등)                                              | `package.json:64-75`                                                  |
| 모듈 형식                          | `"type": "commonjs"`이지만 `exports` 맵의 각 서브패스가 `require`/`import` 조건부로 CJS·ESM 양쪽 빌드(`lib/`, `lib/esm/`)를 제공 | `package.json:6-45`                                                   |

다운로드 수(월 2.46억)는 `pure-rand`가 property-based testing 라이브러리 `fast-check`의 기반 PRNG로 널리 쓰이면서 생기는 전이 의존성(transitive dependency) 트래픽으로 해석해야 한다(`README.md:13` "Tested with fast-check" 배지, `package.json` devDependencies의 `fast-check` 참조). GitHub star 수(117)는 절대적으로 크지 않지만, 다운로드 수와 star 수의 큰 괴리 자체가 "최종 사용자가 직접 star를 누르는 라이브러리"가 아니라 "다른 인기 라이브러리의 내부 부품"이라는 포지셔닝 증거다.

## 2. 핵심 구현 상세

### 2.1 패키지 구조: 서브패스 전용, 메인 배럴 없음

`package.json`의 `exports` 맵에는 `"."` 항목이 없다. 서브패스만 존재한다: `./generator/congruential32`, `./generator/mersenne`, `./generator/xorshift128plus`, `./generator/xoroshiro128plus`, `./distribution/uniformInt`, `./distribution/uniformBigInt`, `./distribution/uniformFloat32`, `./distribution/uniformFloat64`, `./types/RandomGenerator`, `./types/JumpableRandomGenerator`, `./utils/generateN`, `./utils/purify`, `./utils/skipN`(`package.json:6-45`). `src/` 최상위에는 index 파일이 전혀 없다(`find src -maxdepth 1 -type f` 결과 0건).

이는 v7→v8 breaking change로 명시된 설계 결정이다:

```
**No more main entry point** — Replace barrel imports with subpath imports:
-import { uniformIntDistribution, xoroshiro128plus } from 'pure-rand';
+import { uniformInt } from 'pure-rand/distribution/uniformInt';
+import { xoroshiro128plus } from 'pure-rand/generator/xoroshiro128plus';
```

(`CHANGELOG.md`, "8.0.0" 절 "Migration from 7.x to 8.0")

목적은 트리쉐이킹 강제다. 사용하지 않는 생성기·분포 함수의 코드를 번들에서 원천적으로 제외한다.

### 2.2 `RandomGenerator` / `JumpableRandomGenerator` 인터페이스

```ts
export interface RandomGenerator {
  clone(): RandomGenerator;
  next(): number; // -0x80000000 ~ 0x7fffffff(부호 있는 32비트) 범위
  getState(): readonly number[];
}
```

(`src/types/RandomGenerator.ts:1-11`)

```ts
export interface JumpableRandomGenerator extends RandomGenerator {
  clone(): JumpableRandomGenerator;
  jump(): void;
}
```

(`src/types/JumpableRandomGenerator.ts:3-13`)

`next()`는 **상태를 직접 변경(mutate)**하고 값을 반환한다(v8부터. v7까지는 `unsafeNext`/순수 버전 이원화가 있었다). `getState()`가 v7.0.0부터 필수(compulsory)로 승격됐다("Mark `getState` as compulsory on `RandomGenerator`", `CHANGELOG_7.X.md`, 7.0.0 Breaking Changes).

`next()`가 반환하는 값의 범위가 `[0, 2^32)`가 아니라 **부호 있는 32비트 정수** `[-0x80000000, 0x7fffffff]`라는 점이 `@cp949/random`의 `RandomSource`(`() => number`, `[0, 2^32)` unsigned word)와 다르다. `uniformIntInternal`(2.4절)이 내부에서 `rng.next() + 0x80000000`로 unsigned 변환한다.

### 2.3 4개 PRNG 알고리즘의 실제 구현

| 알고리즘                 | 파일                                | 상태 크기                                            | `jump()`                                      | seed→상태                                               |
| ------------------------ | ----------------------------------- | ---------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------- |
| `congruential32`         | `src/generator/congruential32.ts`   | 32비트 정수 1개(`seed`)                              | 있음(2^16 스텝 점프, LCG jump-ahead 공식)     | seed를 그대로 state로 사용(변환 없음)                   |
| `mersenne`               | `src/generator/mersenne.ts`         | 624개 32비트 워드 + index                            | 있음(2^128 스텝, numpy `mt19937-jump.c` 이식) | Knuth 스타일 워드 확산                                  |
| `xorshift128plus`        | `src/generator/xorshift128plus.ts`  | 4개 32비트 워드(64비트 state 2개를 하이/로우로 분할) | 있음(2^64 스텝)                               | seed를 `-1, ~seed, seed\|0, 0`으로 직접 배치(믹싱 없음) |
| `xoroshiro128plus`(권장) | `src/generator/xoroshiro128plus.ts` | 4개 32비트 워드                                      | 있음(2^64 스텝)                               | 위와 동일 패턴                                          |

**64비트 표현 방식**: `xoroshiro128plus`/`xorshift128plus`는 JS에 네이티브 64비트 정수가 없으므로 각 64비트 상태 워드(`s0`, `s1`)를 32비트 하이/로우 페어(`s01`/`s00`, `s11`/`s10`)로 쪼개 `number`(안전한 32비트 정수 연산, `| 0`/`>>> 0`)로 다룬다(`src/generator/xoroshiro128plus.ts:9-17`). `getState()`는 이 4개 워드를 그대로 배열로 반환한다(`src/generator/xoroshiro128plus.ts:74-76`).

**xoroshiro128plus의 seed 처리** — SplitMix32류의 별도 해시/확산 단계가 **없다**:

```ts
export function xoroshiro128plus(seed: number): JumpableRandomGenerator {
  return new XoroShiro128Plus(-1, ~seed, seed | 0, 0);
}
```

(`src/generator/xoroshiro128plus.ts:87-89`)

`xorshift128plus`도 동일 패턴이다(`src/generator/xorshift128plus.ts:87-89`, `new XorShift128Plus(-1, ~seed, seed | 0, 0)`). 즉 4워드 상태 중 2워드(`s01=-1`, `s10=0`)가 **seed와 무관하게 항상 고정값**이고, 나머지 2워드(`s00=~seed`, `s11=seed|0`)만 seed에서 유도된다. `@cp949/random`의 `createXoshiro128Source`가 SplitMix32로 seed 1개를 4워드 전체에 비트 확산시키는 것(`docs/api/random-core.md`의 "상태 확장" 행)과 대비되는 지점이다 — pure-rand는 all-zero 방지나 워드 간 통계적 독립성 확보를 위한 별도 확산 단계를 두지 않는다.

**`congruential32`의 `next()` 최적화**: 표준 LCG는 1스텝씩 진행하지만, 이 구현은 3스텝을 `Math.imul`로 병렬 계산해(`s1`, `s2`, `s3`를 동시에 구함) 데이터 의존성을 끊고 각 스텝의 상위 15비트를 조합해 32비트 출력을 만든다(`src/generator/congruential32.ts:36-47`, 커밋 메시지 "Speed up congruential32 next with parallel-LCG advance (#1040)"가 `CHANGELOG.md` 8.4.1에 기록됨).

**`mersenne`의 `jump()`**: numpy의 `mt19937-jump.c` 알고리즘을 그대로 이식했고, jump 다항식 계수(19935비트)를 6비트씩 묶어 사람이 읽을 수 없는 인코딩 문자열(`JUMP_COEFS`, 길이 약 3300자)로 소스에 하드코딩했다(`src/generator/mersenne.ts:16-25`). 재생성 절차까지 주석으로 남겨뒀다(같은 파일 18-23행).

**클래스 필드 선언**: 모든 생성기 클래스가 `declare private s01: number;` 형태로 필드를 선언한다(예: `src/generator/xoroshiro128plus.ts:9-12`). TypeScript의 `useDefineForClassFields` 시맨틱이 생성자 실행 전 필드를 `undefined`로 초기화해 V8 hidden class 최적화를 깨는 문제를 우회하기 위한 `declare` 트릭이며, 이 최적화를 되돌린 커밋이 `CHANGELOG.md` 8.4.2에 "Restore next() speed by dropping undefined field init (#1078)"로 기록돼 있다 — 즉 실제로 벌어졌던 성능 회귀와 그 수정이 커밋 로그에 남아 있다.

### 2.4 modulo bias 제거: rejection sampling

핵심 내부 함수:

```ts
export function uniformIntInternal(
  rng: RandomGenerator,
  rangeSize: number,
): number {
  const MaxAllowed =
    rangeSize > 2 ? ~~(0x100000000 / rangeSize) * rangeSize : 0x100000000;
  let deltaV = rng.next() + 0x80000000;
  while (deltaV >= MaxAllowed) {
    deltaV = rng.next() + 0x80000000;
  }
  return deltaV % rangeSize;
}
```

(`src/distribution/internals/uniformIntInternal.ts:8-17`)

`MaxAllowed`는 `floor(2^32 / rangeSize) * rangeSize`, 즉 `2^32`를 `rangeSize`로 나눈 몫의 배수 중 최댓값이다. 이 값 미만의 출력만 받아들이고(`deltaV % rangeSize`), 이상이면 재추출(`while` 루프)한다 — 표준적인 rejection sampling으로 modulo bias(`rand() % n` 편향)를 제거한다. `@cp949/random`의 `uniformInt` rejection sampling과 목적·구조가 동일하다.

`uniformInt(rng, from, to)`(공개 API, `src/distribution/uniformInt.ts:44-53`)는 `rangeSize = to - from`을 계산해 `rangeSize <= 0xffffffff`이면 위 `uniformIntInternal`을 그대로 쓰고, 초과하면(64비트를 넘는 범위) `uniformLargeIntInternal`(같은 파일 14-33행)로 분기해 `ArrayInt64`(2×32비트 하이/로우 페어, `src/distribution/internals/ArrayInt64.ts:14-23`)와 `uniformArrayIntInternal`(아래)을 사용한다.

64비트 범위용 rejection sampling:

```ts
export function uniformArrayIntInternal(rng, out, rangeSize) {
  const maxIndex0 = rangeSize[0] + 1;
  out[0] = uniformIntInternal(rng, maxIndex0);
  out[1] = uniformIntInternal(rng, 0x100000000);
  while (
    out[0] >= rangeSize[0] &&
    (out[0] !== rangeSize[0] || out[1] >= rangeSize[1])
  ) {
    out[0] = uniformIntInternal(rng, maxIndex0);
    out[1] = uniformIntInternal(rng, 0x100000000);
  }
  return out;
}
```

(`src/distribution/internals/uniformArrayIntInternal.ts:14-29`)

상위 32비트(`out[0]`)와 하위 32비트(`out[1]`)를 각각 뽑아 사전식(lexicographic) 비교로 범위를 벗어나면 두 워드를 통째로 재추출한다. 파일 자체 주석이 이 알고리즘의 한계를 명시한다: "In the worst case scenario it may discard half of the randomly generated value"(`src/distribution/internals/uniformArrayIntInternal.ts:9`).

**중요: 공개 `uniformArrayInt` API는 v8에서 제거됐다.** `package.json`의 `exports` 맵에 `uniformArrayInt` 서브패스가 없고, `src/distribution/`에도 `uniformArrayInt.ts`(공개판)가 없다 — 오직 `internals/uniformArrayIntInternal.ts`만 존재하며 `uniformInt`/`uniformBigInt`의 내부 구현 세부사항으로만 쓰인다. CHANGELOG가 이를 명시적으로 기록한다:

```
| 7.x                                                                 | 8.0                     |
| `uniformArrayIntDistribution` / `unsafeUniformArrayIntDistribution` | _(removed)_             |
```

(`CHANGELOG.md`, "8.0.0" Migration 표)

`uniformBigInt(rng, from, to)`(`src/distribution/uniformBigInt.ts:17-41`)는 `bigint` 전용 별도 구현으로, `NumValues = 0x100000000n`을 반복 좌측 시프트(`<<= 32n`)해 범위를 담을 수 있는 만큼 `next()` 호출을 누적하고(`generateNext`, 같은 파일 43-51행), `MaxAcceptedRandom = FinalNumValues - (FinalNumValues % diff)`로 동일한 rejection sampling 경계를 계산한다. `uniformArrayIntInternal`과 별개의 구현 경로다(정수 API는 `number`+`ArrayInt64` 기반, bigint API는 네이티브 `bigint` 산술 기반으로 이원화돼 있다).

`uniformFloat32`/`uniformFloat64`는 rejection sampling이 필요 없다(고정 폭 실수). `uniformFloat64`는 `rng.next() & mask1`(26비트)와 `rng.next() & mask2`(27비트)를 조합해 `value1 * 2^-26 + value2 * 2^-53`으로 53비트 정밀도를 만든다(`src/distribution/uniformFloat64.ts:17-21`). `@cp949/random`의 `float`가 각 word의 **상위(>>> 5, >>> 6)** 비트를 쓰는 것과 달리, pure-rand는 `& mask`로 **하위 비트**를 그대로 쓴다 — 이는 `@cp949/random`이 문서에서 명시한 "사용자 정의 source의 하위 비트 품질이 낮을 수 있다"는 우려(`docs/api/random-core.md:160`)와 대비되는 설계 선택이다. pure-rand는 자신의 4개 내장 PRNG만 지원 대상으로 삼으므로 하위 비트 품질을 스스로 보증할 수 있다는 전제가 깔려 있다(소스에 이 전제를 명시한 주석은 없음 — 추론).

### 2.5 `purify()`: 상태 객체가 아니라 `clone()`에 위임

```ts
export function purify<TArgs extends unknown[], TReturn>(
  action: (rng: RandomGenerator, ...args: TArgs) => TReturn,
): (rng: RandomGenerator, ...args: TArgs) => [TReturn, RandomGenerator] {
  return (rng, ...args) => {
    const clonedRng = rng.clone();
    const out = action(clonedRng, ...args);
    return [out, clonedRng];
  };
}
```

(`src/utils/purify.ts:8-22`, 오버로드 시그니처 2개 포함해 실제 구현은 위 본문 하나)

"상태 객체를 감싸는" 별도 wrapper 클래스나 불변 자료구조는 없다. `purify`는 각 `RandomGenerator` 구현체가 이미 제공해야 하는 `clone()`(인터페이스 필수 멤버, `src/types/RandomGenerator.ts:3`)을 호출해 원본을 보존한 채 액션을 적용하고 `[결과, 새 rng]` 튜플을 반환하는 **고차 함수**일 뿐이다. 즉 "순수 함수형 변형"의 실체는 (1) 모든 생성기가 값싼 `clone()`을 제공하고 (2) `purify`가 그 `clone()`을 호출 시점마다 실행하는 것으로 끝난다 — 새로운 상태 표현을 발명하지 않고 기존 mutate 기반 API 위에 얇게 얹은 어댑터다.

이는 v8의 breaking change이기도 하다. v7까지는 `uniformIntDistribution` 같은 "pure 전용" 함수가 별도로 존재해 `[value, nextRng]`를 직접 반환했지만, v8은 그 이원화를 없애고 "모든 함수는 mutate, 순수 버전이 필요하면 `purify`로 감싸라"로 API 표면을 통일했다(`CHANGELOG.md` "8.0.0" 절 "Functions mutate `rng` in-place by default").

### 2.6 seed 처리 — 알고리즘마다 제각각, 공통 유틸 없음

seed→상태 변환은 각 생성기 파일에 흩어져 있고 공유되는 해시/확산 유틸(`src/utils/`에 seed 전용 파일 없음)이 없다.

- `congruential32(seed)`: `new LinearCongruential32(seed)` — seed를 그대로 state로 사용(`src/generator/congruential32.ts:67-69`).
- `xorshift128plus(seed)` / `xoroshiro128plus(seed)`: `new XorShift128Plus(-1, ~seed, seed | 0, 0)` — 위 2.3절 참조. 믹싱 없이 seed 비트를 두 워드에 직접 배치.
- `mersenne(seed)`: Knuth의 `java.util.Random`류 워드 확산을 사용한다:
  ```ts
  export function mersenne(seed: number): JumpableRandomGenerator {
    const out: number[] = [seed | 0];
    for (let idx = 1; idx !== N; ++idx) {
      const xored = out[idx - 1] ^ (out[idx - 1] >>> 30);
      out.push((Math.imul(F, xored) + idx) | 0);
    }
    twist(out);
    return new MersenneTwister(out, 0);
  }
  ```
  (`src/generator/mersenne.ts:114-122`, `F = 1812433253`는 MT19937 표준 초기화 상수)

**seed 입력 타입은 `number` 하나뿐**이다(`seed: number`, 4개 생성기 함수 시그니처 공통). 문자열 seed 지원이 없다 — README도 "여기 상대적으로 단순한 seed 생성 방법이 있다"며 `Date.now() ^ (Math.random() * 0x100000000)`(`README.md:104`)를 예시로 들 뿐, 문자열→해시 변환 유틸을 제공하지 않는다. `@cp949/random`의 `createXoshiro128Source(seed: number | string)`가 FNV-1a로 문자열을 uint32로 정규화하는 것(`docs/api/random-core.md:87`)과 대비되는 지점이다.

seed 재현성 자체는 `RandomGenerator.properties.ts`의 `sameSeedSameSequences` 속성 테스트로 전 생성기에 대해 검증한다(`src/generator/RandomGenerator.properties.ts:16-22`, 2.7절 참조).

### 2.7 테스트 전략

파일 구조(`src/**/*.spec.ts`, `src/**/*.noreg.spec.ts`, `src/generator/RandomGenerator.properties.ts`, `src/distribution/__snapshots__/*.snap`):

**(a) golden vector — 독립 참조 구현 대조.** 단순 자기 회귀가 아니라 **다른 언어의 독립 구현**과 값을 대조한다.

- `xoroshiro128plus.spec.ts`: seed=42로 100개 값을 생성해 하드코딩된 배열과 비교하고, 주석으로 대응하는 **C 참조 구현 전체**를 병기한다(`src/generator/xoroshiro128plus.spec.ts:9-21`, "should be equivalent to the following C code: ... uint64_t next()").
- `mersenne.spec.ts`: seed=42로 1000개 값을 생성해 비교하고, 주석으로 **numpy(Python) MT19937**과의 대응 코드를 병기한다(`src/generator/mersenne.spec.ts:9-13`, "from numpy.random import MT19937 / rng = MT19937(42) / rng._legacy_seeding(42)").

즉 xoroshiro/xorshift는 원 논문 저자(Blackman & Vigna)의 C 코드, mersenne은 numpy와 값 단위로 교차 검증한다.

**(b) 회귀(non-regression) 스냅샷 — 정확성 보증이 아님을 명시.** `uniformInt.noreg.spec.ts`가 대표적이다:

```
// Remark:
// ========================
// This test is purely there to ensure that we do not introduce any regression
// during a commit without noticing it.
// The values we expect in the output are just a snapshot taken at a certain time
// in the past. They might be wrong values with bugs.
```

(`src/distribution/uniformInt.noreg.spec.ts:15-20`)

경계 케이스를 `it.each` 표로 나열한다: "range of size divisor of mersenne's one"(2^3-1), "range of size multiple of mersenne's one plus one"(2^40), `Number.MIN_SAFE_INTEGER`~`Number.MAX_SAFE_INTEGER` 풀레인지 등(같은 파일 10-21행). 결과는 Vitest `toMatchSnapshot()`으로 `src/distribution/__snapshots__/uniformInt.noreg.spec.ts.snap` 등에 저장한다. `uniformBigInt`/`uniformFloat32`/`uniformFloat64`도 각각 `.noreg.spec.ts` + 스냅샷 파일을 갖는다(4쌍 모두 존재).

**(c) property-based testing — fast-check로 자기 자신을 검증(dogfooding).** `src/generator/RandomGenerator.properties.ts`가 모든 생성기(mersenne, congruential32, xorshift128plus, xoroshiro128plus)에 공유되는 속성 함수 세트를 정의한다:

- `sameSeedSameSequences`: 같은 seed는 항상 같은 시퀀스(`fc.integer()`, `fc.nat(2048)` 오프셋/길이로 무작위 구간을 검증, 파일 16-22행).
- `noOrderNextJump`: `next()` N번 후 `jump()` == `jump()` 후 `next()` N번(순서 무관성, 43-57행).
- `changeSelfWithNext` / `changeSelfWithJump`: mutate 계약 검증 — 호출 후 상태가 실제로 바뀌고 그 값이 기대값과 일치(59-100행).
- `noChangeOnClonedWithNext` / `noChangeOnClonedWithJump`: `clone()`된 인스턴스가 원본의 후속 mutate에 영향받지 않음을 `JSON.stringify` 비교로 검증(102-142행).
- `clonedFromStateSameSequences`: `getState()` → `xxxFromState()`로 복원한 인스턴스가 원본과 동일 시퀀스를 냄(144-157행).

`uniformInt.spec.ts`는 내부 함수(`uniformIntInternal`, `uniformArrayIntInternal`)를 `vi.mock`으로 목킹하고 `fc.property(settingsArbitrary, ...)`로 "올바른 인자로 내부 함수를 호출했는가"를 검증한다(`src/distribution/uniformInt.spec.ts:1-45`) — 순수 유닛 목킹과 fast-check 속성 테스트를 같은 파일에서 병행한다.

`purify.spec.ts`는 `vi.fn`으로 완전히 목킹된 `RandomGenerator`(`notImplemented` 함수들)를 넘겨, `purify`가 원본 대신 **정확히 `clone()`의 반환값**만 건드리는지 확인한다(`src/utils/purify.spec.ts:9-35`). `expectTypeOf`로 오버로드 타입(RandomGenerator용/JumpableRandomGenerator용)까지 컴파일 타임 검증한다(같은 파일 37-49행).

**(d) 실제 배포 번들 테스트.** `test-bundle/run-legacy.cjs`가 CJS `require('pure-rand/...')`로 4개 생성기 + 4개 분포 함수 + `generateN`/`skipN`/`purify`를 실제로 호출해 타입·범위를 `assert`한다. `package.json`의 `test-legacy-bundle` 스크립트는 `nvs add 12.17.0`으로 **Node.js 12.17.0**까지 내려가 이 번들 테스트를 돌린다 — 소스는 최신 TypeScript/ES 문법으로 작성하되 빌드 산출물의 구버전 Node 호환성을 실제 구버전 런타임에서 검증한다.

**breaking change 정책**: CHANGELOG가 메이저 버전마다 별도 파일로 분리돼 있다(`CHANGELOG_3.X.md` ~ `CHANGELOG_7.X.md`, 최신은 `CHANGELOG.md`에 8.X 누적). 각 메이저 버전 첫 항목에 "Migration from N.x to M.0"이 있는 경우 diff 형식(`-이전 / +이후`)의 마이그레이션 가이드를 코드 블록으로 제공한다(`CHANGELOG.md`의 "8.0.0" 절 전체가 이 형식). semver 준수 여부를 별도로 선언한 문서는 확인 안 됨(`CONTRIBUTING.md` 등 부재) — 다만 실제로는 서브패스 구조 변경·API 시그니처 변경·함수 제거(`uniformArrayIntDistribution` 등)를 모두 메이저 버전(7→8)에서만 수행한 이력으로 보아 semver를 실질적으로 따르는 것으로 보인다(추론, 명문화된 정책 문서는 확인 안 됨).

## 3. 장점 (근거 포함)

1. **golden vector가 자기 자신이 아니라 독립적인 제3자 구현과 대조된다.** xoroshiro는 원저자의 C 코드, mersenne은 numpy(Python)와 값 단위로 일치를 검증한다(`src/generator/xoroshiro128plus.spec.ts:9-21`, `src/generator/mersenne.spec.ts:9-13`). 알고리즘 구현 자체의 정확성(참조 논문/구현과의 일치)까지 담보한다.
2. **서브패스 전용 구조로 강제된 트리쉐이킹.** 메인 배럴이 아예 없어(exports 맵에 `"."` 없음) 쓰지 않는 생성기·분포 함수가 번들에 섞여 들어올 여지가 구조적으로 차단된다(`package.json:6-45`).
3. **jump() 기반 독립 스트림 생성이 4개 생성기 모두에 구현돼 있다.** LCG(2^16 스텝), xorshift/xoroshiro(2^64 스텝), mersenne(2^128 스텝, numpy 이식)까지 — 여러 시뮬레이션을 시드만 바꿔 돌리는 안전하지 않은 관행 대신 "논리적으로 겹치지 않는" 구간 점프를 1급 API로 제공한다(2.3절, `noOrderNextJump` 속성 테스트로 순서 무관성까지 검증).
4. **실제 구버전 Node 런타임에서 배포 산출물을 검증한다.** `test-legacy-bundle`이 Node 12.17.0을 내려받아 `lib/`(CJS)·`lib/esm/`(ESM) 양쪽을 실제로 실행한다(`package.json` scripts, `test-bundle/run-legacy.cjs`). 타입 선언이나 빌드 설정상의 "호환된다고 주장"이 아니라 실행 검증이다.
5. **성능 회귀가 커밋 단위로 추적되고 되돌려진다.** `declare private` 필드 선언이 실제로 `next()` 속도를 떨어뜨렸던 사건과 그 수정이 CHANGELOG에 남아 있다(8.4.1 "Restore next() speed by dropping undefined field init (#1078)").

## 4. 단점 / 트레이드오프 (근거 포함)

1. **xoroshiro128plus/xorshift128plus의 seed 확산이 얕다.** 4워드 상태 중 2워드(`s01=-1`, `s10=0`)가 seed와 무관하게 고정이고, 나머지 2워드도 SplitMix류 믹서 없이 `~seed`/`seed | 0`을 직접 대입한다(`src/generator/xoroshiro128plus.ts:87-89`). 인접한 두 seed(예: `1`과 `2`)의 초기 상태가 비트 패턴 수준에서 가까워, 시퀀스 초반 값들의 통계적 독립성이 SplitMix32로 4워드 전체를 확산시키는 방식(`@cp949/random`)보다 약할 가능성이 있다(정량적 상관관계 측정은 이번 조사 범위 밖 — 추론).
2. **문자열 seed 미지원.** `seed: number` 시그니처만 존재하며 문자열→해시 변환은 라이브러리 밖 사용자 몫이다(README도 숫자 seed 예시만 제공, `README.md:104`).
3. **`uniformArrayInt` 공개 API가 v8에서 제거됐다.** 64비트 범위 균등 정수가 필요하면 `uniformInt`(내부적으로 큰 범위를 자동 분기)나 `uniformBigInt`만 남아 있고, `ArrayInt64` 기반 저수준 API를 직접 쓸 공식 경로가 없다(`CHANGELOG.md` "8.0.0" 표, `_(removed)_`). 세밀한 제어가 필요한 소비자에게는 표면적이 줄어든 것이다.
4. **v7→v8이 API 표면 전체를 갈아엎은 대규모 breaking change다.** 메인 배럴 제거, 인자 순서 변경(`rng`가 항상 첫 인자), 기본 동작이 "순수 함수"에서 "제자리 변경"으로 전환, 함수명 축약(`unsafeUniformIntDistribution` → `uniformInt`) 등 5개 이상의 축에서 동시에 바뀌었다(`CHANGELOG.md` "8.0.0" Migration 절). 한 메이저 버전에 몰린 대규모 마이그레이션 비용은 세분화된 breaking change보다 채택 장벽이 높을 수 있다.
5. **`float`/`uniform` 계열이 각 word의 하위 비트를 그대로 사용한다.** `uniformFloat64`가 `rng.next() & mask`로 하위 비트를 취한다(`src/distribution/uniformFloat64.ts:18-19`). 이는 pure-rand 자신의 4개 PRNG가 하위 비트도 충분히 고품질이라는 전제에서만 안전하며, 사용자가 직접 만든 `RandomGenerator`(예: 품질이 낮은 LCG)를 끼워 넣을 경우 이 전제가 깨질 수 있다 — 다만 pure-rand는 `@cp949/random`과 달리 "임의의 소비자 정의 source"를 1급 시나리오로 문서화하지 않으므로 이 자체가 결함은 아니다.
6. **`getState()`/`fromState()`가 raw 배열(`readonly number[]`)이라 자기서술적이지 않다.** 예: `xoroshiro128plusFromState`는 배열 길이만 검사하고(`state.length === 4`, `src/generator/xoroshiro128plus.ts:80-84`) 어떤 생성기의 state인지 태그가 없다 — 다른 생성기의 state 배열을 실수로 넘겨도(길이가 우연히 같으면) 런타임에서 조용히 다른 시퀀스를 낼 수 있다.

## 5. `@cp949/random`이 배울 점

1. **golden vector를 독립 참조 구현과 대조하는 관행을 xoshiro128\*\*에도 적용할 수 있는지 재확인한다.** `@cp949/random`은 이미 "Blackman·Vigna의 참조 구현 `xoshiro128starstar.c`와 word 단위로 같다"고 문서에 명시했지만(`docs/api/random-core.md:81`), pure-rand처럼 **테스트 코드 자체에 참조 C 코드를 주석으로 병기**하는 방식(`src/generator/xoroshiro128plus.spec.ts:9-21`)은 검증 가능성을 한 단계 더 높인다. `packages/random/test/core/*.test.ts`에 이 주석 패턴을 추가하는 것은 비용이 낮고 효과가 명확한 개선이다.
2. **non-regression 스냅샷과 "이것은 정확성 보증이 아니다"라는 명시적 주석을 분리해서 채택할 수 있다.** `@cp949/random`은 `int`/`uniform`의 산식을 "계약 아님, CHANGELOG 기록"으로 이미 구분해뒀지만(`docs/api/random-core.md:64,129`), pure-rand의 `uniformInt.noreg.spec.ts` 스타일(`it.each`로 경계 케이스 나열 + `toMatchSnapshot()` + "이 값은 그냥 특정 시점의 스냅샷이며 틀렸을 수도 있다"는 주석)을 그대로 `packages/random/test`에 적용하면, "계약은 아니지만 의도치 않은 변경은 잡는다"는 목적을 테스트 코드 수준에서 명시적으로 달성할 수 있다.
3. **`clone()`을 1급 계약으로 승격하는 안을 검토한다.** pure-rand의 `purify()`는 새로운 상태 표현을 발명하지 않고 `RandomGenerator.clone()`(인터페이스 필수 멤버)에 위임하는 것만으로 순수 함수형 API를 만든다(`src/utils/purify.ts:8-22`). `@cp949/random`의 `RandomSource`는 `() => number` 클로저라 `clone()` 개념이 없다 — 이는 의도된 최소 인터페이스 설계(번들 크기 이점, `docs/api/random-core.md` 번들 측정 절)이므로 바꿀 필요는 없지만, 만약 향후 "재현 가능한 체크포인트/분기" 유즈케이스를 지원한다면 `RandomSource`에 `clone`을 얹기보다 pure-rand처럼 **별도 상위 인터페이스**(예: `CloneableRandomSource`)로 분리해 기본 `RandomSource`의 최소성을 지키는 절충안을 참고할 수 있다.
4. **jump()류 "독립 스트림" 기능은 xoshiro128\*\*의 상태 크기(128비트)를 고려할 때 실제 수요가 확인되면 검토 대상이다.** pure-rand는 4개 생성기 모두에 jump()를 구현하고 순서 무관성까지 속성 테스트로 검증한다(2.7절 `noOrderNextJump`). `@cp949/random`이 병렬 시뮬레이션·다중 인스턴스 독립성을 로드맵에서 다룬다면, "시드만 바꿔 여러 인스턴스를 만드는" 현재 관행 대비 jump 기반 접근의 통계적 이점을 pure-rand 사례로 설명할 수 있다. 다만 현재 `@cp949/random`의 범위(root 패키지는 단일 소비 시나리오 중심)에서 즉시 필요한 기능은 아니다(우선순위 판단은 로드맵 소관).
5. **이미 잘하고 있는 지점 — 문자열 seed 지원.** pure-rand는 `seed: number` 하나만 받고 문자열 해시 변환을 사용자에게 떠넘긴다(4.2절). `@cp949/random`의 `createXoshiro128Source(seed: number | string)`가 FNV-1a로 문자열을 정규화하고 그 알고리즘·테스트 벡터(`""` → `0x811C9DC5` 등)까지 golden vector로 고정한 것(`docs/api/random-core.md:87`)은 pure-rand보다 API 표면이 더 사용자 친화적이다. 이 우위는 유지하고, README/랜딩 문서에서 "pure-rand는 숫자 seed만 지원하고 문자열 해시는 사용자 몫"이라는 비교로 명시적으로 강조할 수 있다.
6. **이미 잘하고 있는 지점 — seed→상태 확산의 견고성.** pure-rand의 xoroshiro/xorshift는 seed 비트를 얕게 배치할 뿐 SplitMix류 확산이 없다(4.1절). `@cp949/random`이 SplitMix32로 4워드 전체를 확산시키고 "all-zero 상태가 나올 수 없음을 gf(2) 선형대수로 증명"까지 문서화한 것(`docs/api/random-core.md:89`)은 이 지점에서 pure-rand보다 엄밀하다. 이 차별점도 문서에서 근거와 함께 명시할 가치가 있다.
7. **breaking change 세분화 관행을 유지한다.** pure-rand의 v7→v8은 5개 이상의 축을 한 메이저 버전에 몰아 마이그레이션 비용이 크다(4.4절). `@cp949/random`은 아직 0.x라 breaking change를 minor 단위로 흡수할 수 있는 시기이므로(`docs/api/random-core.md:48`), API 표면이 커지기 전에 "한 번에 하나씩" 원칙을 CHANGELOG 관행으로 명문화해두면 pure-rand가 겪은 "한 메이저에 전부 몰림" 문제를 피할 수 있다.

## 6. 참고 자료

- 로컬 클론: `/work/thrd/pure-rand`(커밋 `be10b22b05c22242eb077388b0eb97882e9bbf87`, 2026-07-10)
- 원본 저장소: https://github.com/dubzzz/pure-rand
- npm 패키지: https://www.npmjs.com/package/pure-rand (레지스트리 조회: `registry.npmjs.org/pure-rand`, `api.npmjs.org/downloads/point/last-month/pure-rand`, 2026-09-22)
- GitHub 저장소 메타데이터: `api.github.com/repos/dubzzz/pure-rand`(2026-09-22 조회, stars 117 / forks 5 / open issues 17)
- 인용 파일(로컬 클론 상대경로): `package.json`, `README.md`, `LICENSE`, `CHANGELOG.md`, `CHANGELOG_7.X.md`, `COMPARISON.md`, `src/types/RandomGenerator.ts`, `src/types/JumpableRandomGenerator.ts`, `src/generator/congruential32.ts`, `src/generator/mersenne.ts`, `src/generator/xorshift128plus.ts`, `src/generator/xoroshiro128plus.ts`, `src/generator/RandomGenerator.properties.ts`, `src/generator/*.spec.ts`, `src/distribution/uniformInt.ts`, `src/distribution/uniformBigInt.ts`, `src/distribution/uniformFloat32.ts`, `src/distribution/uniformFloat64.ts`, `src/distribution/internals/uniformIntInternal.ts`, `src/distribution/internals/uniformArrayIntInternal.ts`, `src/distribution/internals/ArrayInt64.ts`, `src/distribution/*.noreg.spec.ts`, `src/distribution/__snapshots__/*.snap`, `src/utils/purify.ts`, `src/utils/purify.spec.ts`, `test-bundle/run-legacy.cjs`
