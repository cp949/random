# 심층 리서치: random-js (ckknight/random-js)

로컬 클론 `/work/thrd/random-js`(shallow clone, `master` HEAD = 태그 `v2.1.0` 커밋 `f000fd5`)의 실제 소스를 Read/Grep으로 직접 읽고, 저장소 활동은 `gh api`로 GitHub API를 직접 조회해 확인했다. `docs/research/similar-libraries.md`의 "random-js" 절은 README/npm 레지스트리 수준 개요였고, 이 문서는 그 내용을 소스 코드 근거로 검증·심화한다.

## 1. 개요

- **목적**: `package.json` description "A mathematically correct random number generator library for JavaScript."(`/work/thrd/random-js/package.json:3`)
- **버전**: `2.1.0`(`/work/thrd/random-js/package.json:4`)
- **라이선스**: MIT(`/work/thrd/random-js/package.json:14`, `/work/thrd/random-js/LICENSE:1-3` "The MIT License (MIT) / Copyright (c) Cameron Knight")
- **빌드 산출물**: UMD(`dist/random-js.umd.js`, `main`), ESM(`dist/random-js.esm.js`, `module`), 압축 UMD(`unpkg`), 타입 선언(`dist/index.d.ts`)(`/work/thrd/random-js/package.json:16-19`). `"sideEffects": false`(`/work/thrd/random-js/package.json:56`)로 트리셰이킹 힌트 제공.
- **런타임 의존성**: `devDependencies`만 있고 `dependencies` 필드 자체가 없다(`/work/thrd/random-js/package.json:24-39`). `@cp949/random`과 같이 런타임 의존성 0.
- **커밋/유지보수 상태 — GitHub API 직접 조회 결과 (2026-09-22)**:
  - `gh api repos/ckknight/random-js/commits/master` → `master` 브랜치 HEAD는 여전히 `f000fd5c286bcf7c8a486940bb81deea19a99c55`, 커밋 메시지 "v2.1.0", 커밋 일시 `2019-05-30T19:22:09Z`. 즉 **2019-05-30 이후 `master`에 코드 커밋이 전혀 없다.**
  - `gh api repos/ckknight/random-js` → `pushed_at: "2024-04-21T14:47:37Z"`, `archived: false`, `open_issues_count: 33`.
  - `gh api repos/ckknight/random-js/branches` → 존재하는 브랜치는 `master` 외에 전부 `dependabot/npm_and_yarn/*` 14개(예: `acorn-5.7.4`, `terser-4.8.1`, `lodash-4.17.21` 등 devDependency 보안 패치용 자동 PR 브랜치). 즉 2024-04-21의 `pushed_at`은 dependabot이 만든 미병합 브랜치 push 시각이며, **실제 코드(master)는 5년 이상 정지 상태**다.
  - `.travis.yml`(`/work/thrd/random-js/.travis.yml:1-5`)의 대상 Node 버전이 `11, 10, 8, 6`으로, 모두 현재 EOL. GitHub Actions 워크플로(`.github/workflows/`)는 저장소에 없다(CI가 Travis CI에서 멈춘 채 마이그레이션되지 않음).
  - 결론: **유지보수 신호는 사실상 없음.** 이슈 33개가 열린 채 방치, 보안 패치 dependabot PR도 병합되지 않음, CI도 죽은 Travis 설정만 남음.

## 2. 핵심 구현 상세

### 2.1 `Engine` 인터페이스

```ts
// /work/thrd/random-js/src/types.ts:1-15
export interface Engine {
  next(): number;
}
export type Distribution<T = number> = (engine: Engine) => T;
export type StringDistribution = (engine: Engine, length: number) => string;
```

`Engine`은 딱 하나의 메서드 `next(): number`만 요구하는 최소 인터페이스다. `next()`의 계약(주석 없이 구현으로 확인한 것): **부호 있는 32비트 정수**(`| 0` 또는 `>>> 0` 후 `| 0`로 정규화된 값)를 돌려준다. `@cp949/random`의 `RandomSource = () => number`(부호 없는 `[0, 2^32)` 정수)와 형태는 동일(무인자 함수 하나)하지만 **부호 있는 범위**라는 점이 다르다(`docs/api/random-core.md`의 `RandomSource` 계약과 대비됨).

### 2.2 4개 엔진의 실제 구현

- **`nativeMath`**(`/work/thrd/random-js/src/engine/nativeMath.ts:1-11`):

  ```ts
  export const nativeMath: Engine = {
    next() {
      return (Math.random() * UINT32_SIZE) | 0;
    },
  };
  ```

  `Math.random()`(53비트 정밀도의 `[0,1)` 실수)에 `2^32`를 곱해 정수부만 `| 0`으로 부호 있는 32비트로 변환한다. 테스트(`nativeMath.test.ts:1-22`)가 `jest.spyOn(Math, "random")`으로 이 변환식을 검증한다.

- **`browserCrypto`**(`/work/thrd/random-js/src/engine/browserCrypto.ts:1-28`):

  ```ts
  const COUNT = 128;
  let index = COUNT;
  export const browserCrypto: Engine = {
    next() {
      if (index >= COUNT) {
        if (data === null) data = new Int32Array(COUNT);
        crypto.getRandomValues(data);
        index = 0;
      }
      return data![index++] | 0;
    },
  };
  ```

  128워드(512바이트) 버퍼를 한 번에 `crypto.getRandomValues`로 채우고 소진될 때까지 순차 반환하는 **배치 채움(batching) 전략**이다. 매 호출마다 syscall급 API를 부르지 않는 성능 최적화. `Int32Array`가 없는 구형 환경 대응은 `/work/thrd/random-js/src/utils/Int32Array.ts:1-18`에서 별도 처리(실제 `Int32Array` 동작 검증 실패 시 평범한 `Array`로 폴백).

- **`nodeCrypto`**(`/work/thrd/random-js/src/engine/nodeCrypto.ts:1-26`): `browserCrypto`와 같은 128워드 배치 전략이나, 소스는 `require('crypto').randomBytes(4 * COUNT)`(Node 동기 API)이고 얻은 `Buffer`를 `Int8Array`로 감싼 뒤 `.buffer`를 `Int32Array` 뷰로 재해석한다(`/work/thrd/random-js/src/engine/nodeCrypto.ts:19-21`). `require`를 함수 본문 안에서 호출해 번들러의 브라우저 빌드에서 Node 전용 모듈을 트리셰이킹으로 제거할 여지를 남긴다.

- **`MersenneTwister19937`**(`/work/thrd/random-js/src/engine/MersenneTwister19937.ts:1-119`): `Engine` 인터페이스를 구현하는 클래스. `private constructor()`(줄 52)로 직접 `new` 생성을 막고 정적 팩토리만 허용한다.

### 2.3 `MersenneTwister19937.seed`/`seedWithArray`/`autoSeed`

```ts
// /work/thrd/random-js/src/engine/MersenneTwister19937.ts:24-42
public static seed(initial: number): MersenneTwister19937 {
  return new MersenneTwister19937().seed(initial);
}
public static seedWithArray(source: ArrayLike<number>): MersenneTwister19937 {
  return new MersenneTwister19937().seedWithArray(source);
}
public static autoSeed(): MersenneTwister19937 {
  return MersenneTwister19937.seedWithArray(createEntropy());
}
```

- `seed(initial)`(줄 101-112): 표준 MT19937 초기화식 `data[i] = (imul(previous ^ (previous >>> 30), 0x6c078965) + i) | 0`을 624워드에 대해 순회 적용. `imul`은 `/work/thrd/random-js/src/utils/imul.ts:1-24`에서 네이티브 `Math.imul` 우선 사용, 실패 시 16비트 분할 곱셈으로 폴백.
- `seedWithArray(source)`(줄 114-118): 먼저 고정 상수 `0x012bd6aa`로 `seed()`를 호출해 기본 상태를 만든 뒤, 별도 함수 `seedWithArray(data, source)`(줄 146-177)로 배열 기반 추가 믹싱을 적용한다(초기 논문의 `init_by_array` 대응, 상수 `0x0019660d`/`0x5d588b65` 사용).
- `autoSeed()`(줄 40-42): `createEntropy()`(`/work/thrd/random-js/src/utils/createEntropy.ts:11-21`)를 그대로 `seedWithArray`에 넘긴다. `createEntropy`는 기본값 `engine = nativeMath, length = 16`으로, 배열의 첫 요소는 `new Date().getTime() | 0`(현재 시각), 나머지 15개는 `nativeMath.next()`로 채운다. 즉 **`autoSeed()`의 엔트로피 품질은 결국 `Math.random()`에 의존**하며(암호학적으로 안전하지 않음), 시각 기반 요소가 섞여 있어 완전한 결정성도 없다.
- `getUseCount()`(줄 75-77)·`discard(count)`(줄 83-99): 사용 횟수 추적과 임의 개수 건너뛰기를 제공한다. `discard`는 624워드 배열 경계를 넘는 `count`도 반복 `refreshData` 호출로 처리한다(줄 92-96). `@cp949/random`의 `RandomSource`에는 이런 메타 연산(사용량 조회, skip)이 없다 — random-js는 엔진 객체가 상태를 캡슐화하는 클래스이기 때문에 이런 부가 API를 얹기 쉽지만, `@cp949/random`은 `() => number` 클로저라 외부에서 이런 introspection이 불가능하다(트레이드오프, §4 참고).

### 2.4 분포 함수의 엔진 소비 방식과 modulo bias 제거(rejection sampling)

핵심 저수준 분포 함수는 모두 `(engine: Engine) => T` 형태(`Distribution<T>`)다. 정수 분포의 중심은 `/work/thrd/random-js/src/distribution/integer.ts`:

- **`downscaleToLoopCheckedRange(range)`**(줄 27-37): 범위가 `2^32`보다 작을 때, `extendedRange = range + 1`이 `2^32`를 정확히 나누지 못하면(즉 `2^32 mod extendedRange !== 0`) modulo bias가 생긴다. 이를 없애기 위해 `maximum = extendedRange * floor(2^32 / extendedRange)`를 계산하고, `engine.next() >>> 0`이 `maximum` 이상이면 **버리고 재추출**(`while (value >= maximum)`, 줄 32-34)한 뒤 `% extendedRange`한다. 이것이 명시적 rejection sampling이다.
- **`isPowerOfTwoMinusOne(range)`**(줄 19-21)로 범위가 `2^n - 1` 꼴이면 `downscaleToRange`(줄 39-45)가 대신 `bitmask(range)`(줄 23-25, `engine.next() & masking`)를 쓴다 — 이 경우는 나머지 연산 없이 비트마스크만으로 균등 분포가 보장되므로 거부 없이 O(1)이다. **거부 판정 없이 처리 가능한 경우를 먼저 걸러내는 최적화**.
- **`upscaleToLoopCheckedRange`**(줄 59-71)·`upscaleWithinI53AndLoopCheck`(줄 84-97): 범위가 32비트를 넘어 53비트(2개 워드 필요)로 갈 때도 같은 원리(`maximum` 상한 계산 + `while` 재추출)를 적용한다.
- **`integer(min, max)`**(줄 104-148) 자체는 팩토리 함수로, 범위 크기에 따라 분기해 위 전략 중 가장 저렴한 것을 컴파일타임(호출 시점)에 골라 `Distribution`을 반환한다(범위가 정확히 `UINT32_MAX`면 재사용 가능한 `uint32`/`int32`를 그대로 반환해 클로저 생성조차 생략, 줄 120-125).

`@cp949/random`의 `int(source, min, max)`(`docs/api/random-core.md`)도 "rejection sampling으로 modulo 편향을 없앤다"고 명시하는데, random-js는 이를 **범위 형태별로 5가지 이상의 특수 경로(비트마스크/32비트 loop/53비트 loop/전체 53비트 등)로 세분화**해 word 소비를 최소화한다. `bool(numerator, denominator)`(`/work/thrd/random-js/src/distribution/bool.ts:50-70`)도 내부적으로 `integer(0, denominator - 1)`을 재사용해 같은 rejection sampling 경로를 탄다(줄 69: `lessThan(integer(0, denominator - 1), numerator!)`).

`bool(percentage)`(줄 18-31)는 `percentage * UINT32_SIZE`가 정수로 딱 떨어지면 32비트 `int32` 비교로 끝내고(줄 25-26), 아니면 53비트 `uint53` 비교로 정밀도를 올린다(줄 27-28) — 확률 정밀도와 word 소비량(1워드 vs 2워드) 사이의 트레이드오프를 입력값에 따라 자동 선택하는 설계다.

`shuffle`(`/work/thrd/random-js/src/distribution/shuffle.ts:10-28`)은 뒤에서 앞으로 가는 표준 Fisher–Yates(`for (let i = length-1; i > downTo; --i) { j = integer(0, i)(engine); swap }`)이고, `sample`(`/work/thrd/random-js/src/distribution/sample.ts:12-38`)은 **별도 알고리즘이 아니라 `shuffle`을 재사용**한다: `population`을 복제한 뒤 `shuffle(engine, clone, tailLength - 1)`로 뒤쪽 `sampleSize`개만 부분적으로 섞고 `.slice(tailLength)`로 잘라낸다(줄 36-37). `@cp949/random`의 `sample`은 앞에서부터 가는 부분 Fisher-Yates(`docs/api/sampling.md`)라 방향이 반대이지만 "부분 셔플로 비복원 추출을 구현한다"는 아이디어는 동일하다.

`uuid4(engine)`(`/work/thrd/random-js/src/distribution/uuid4.ts:13-31`)은 `engine.next()`를 4회 호출(`a`는 `>>> 0`, `b`/`c`는 `| 0`, `d`는 `>>> 0`)해 128비트를 얻고, 버전(`0x4000` OR) 및 variant(`0x8000` OR) 비트를 직접 세팅한 뒤 문자열 포매팅한다. `@cp949/random`처럼 rejection sampling이 필요 없는 이유는 UUID v4의 버전/variant 비트가 애초에 고정값이라 균등 분포를 요구하지 않기 때문이다.

### 2.5 `Random` 클래스의 저수준 API 래핑

`/work/thrd/random-js/src/Random.ts:30-224` 전체가 순수 위임(delegation) 패턴이다. 예:

```ts
// /work/thrd/random-js/src/Random.ts:30-46
export class Random {
  private readonly engine: Engine;
  constructor(engine: Engine = nativeMath) {
    this.engine = engine;
  }
  public int32(): number {
    return int32(this.engine);
  }
  ...
  public integer(min: number, max: number): number {
    return integer(min, max)(this.engine);
  }
  ...
  public bool(numerator?: number, denominator?: number): boolean {
    return bool(numerator!, denominator!)(this.engine);
  }
}
```

`Random`은 생성자에서 `engine`을 한 번 캡처해 `private readonly` 필드에 저장하고(줄 31, 37-39), 모든 메서드는 **인스턴스 상태를 전혀 갖지 않고** 대응하는 함수형 API(`integer()`, `bool()`, `pick()` 등)를 호출해 `this.engine`을 주입할 뿐이다. 새 로직이 전혀 없다 — 100% 얇은 OOP 파사드다. `Random.ts` 자체에는 새로운 알고리즘이 단 한 줄도 없다(직접 확인: 224줄 전체가 import + 위임 메서드).

### 2.6 테스트 구조와 CI

- 테스트 파일 21개, 소스 파일과 1:1 대응(`src/**/*.test.ts`가 같은 디렉터리의 `*.ts` 옆에 위치, 예: `src/engine/MersenneTwister19937.test.ts`(71KB, 저장소에서 가장 큰 테스트 파일 — golden-vector류 대량 케이스 추정), `src/distribution/integer.test.ts`(11KB)).
- `jest.config.js`(`/work/thrd/random-js/jest.config.js:1-15`): `ts-jest` 프리셋, `clearMocks`/`resetMocks`/`restoreMocks` 모두 `true`(테스트 간 모킹 격리를 엄격히 함), `ts-jest`의 `tsConfig`를 `target: "es3"`로 별도 지정 — **ES3 타깃까지 지원 범위**로 삼았던 라이브러리임을 보여준다.
- `nativeMath.test.ts`(`/work/thrd/random-js/src/engine/nativeMath.test.ts:1-22`)는 `jest.spyOn(Math, "random")`으로 결정적 스텁을 주입해 엔진의 변환식을 검증하고, `browserCrypto.test.ts`(1-40행 확인)는 `global.crypto`가 없으면 `jest.fn()`으로 mock을 주입한 뒤 `crypto.getRandomValues`가 128-length `Int32Array`로 호출되는지, 소진 후 재호출되는지까지 검증한다 — **엔진의 배치 채움 전략 자체를 테스트로 고정**해 둔 것이다.
- CI는 `.travis.yml`(`/work/thrd/random-js/.travis.yml:1-5`)만 존재하고 Node `11, 10, 8, 6`을 대상으로 한다. Travis CI는 2019년 이후 OSS 무료 등급이 사실상 폐지되었고, `.github/workflows/`가 없으므로 **현재 이 저장소에서 CI가 실제로 동작하는지 자체가 의문**이다(직접 실행 로그 확인은 이번 조사 범위 밖).
- `package.json`의 `"prepublish": "yarn clean && yarn lint && yarn test && yarn build"`(`/work/thrd/random-js/package.json:51`)로 배포 전 린트+테스트+빌드를 강제하는 파이프라인은 있으나, 이는 로컬/배포 시점 게이트일 뿐 PR 단위 CI 게이트가 살아있다는 증거는 아니다.

## 3. 장점 — 코드 수준 근거

1. **Engine과 분포 함수의 완전한 분리.** `Engine`은 `next(): number` 단 하나의 메서드만 요구(`/work/thrd/random-js/src/types.ts:1-3`)하고, 모든 분포 함수(`integer`, `real`, `bool`, `pick`, `shuffle`, `sample`, `uuid4` 등)는 이 인터페이스에만 의존하는 순수 함수다. 4개 엔진 구현(`nativeMath`/`browserCrypto`/`nodeCrypto`/`MersenneTwister19937`)이 서로 완전히 독립적인 파일로 존재하며, 어떤 분포 함수도 특정 엔진을 import하지 않는다(`import { Engine } from "../types"`만 공통). 이는 `@cp949/random`의 `RandomSource`(`() => number`) + helper 구조와 동일한 철학이며, 재현 가능한 엔진과 암호학적 엔진을 같은 API 표면에서 교체 주입할 수 있다는 실익이 코드로 확인된다.
2. **modulo bias 제거가 범위 형태별로 세분화되어 있다.** `integer.ts`의 `isPowerOfTwoMinusOne` 분기(줄 19-21, 40-45)로 비트마스크만으로 되는 경우 rejection loop 자체를 생략하는 성능 최적화가 있다. 단순히 "항상 loop check"가 아니라 최적 경로를 컴파일타임에 고르는 설계다.
3. **엔진의 성능 최적화(배치 채움)가 테스트로 고정되어 있다.** `browserCrypto`/`nodeCrypto` 모두 128워드씩 미리 채워 `getRandomValues`/`randomBytes` 호출 횟수를 줄이는 전략을 취하고(각 5-6줄 근처), 이 전략 자체를 테스트가 검증한다(`browserCrypto.test.ts`).
4. **`MersenneTwister19937`이 `getUseCount()`/`discard()`를 제공**해 두 엔진 인스턴스 간 "이어하기"(같은 seed에서 특정 지점까지 건너뛰기)가 가능하다(`/work/thrd/random-js/src/engine/MersenneTwister19937.ts:75-99`). 상태를 캡슐화한 클래스 엔진이기에 가능한 API다.
5. **`Random` 클래스가 순수 위임이라 유지보수 비용이 낮다.** 새 분포 함수를 추가할 때 저수준 함수 하나만 작성하면 `Random`에는 한 줄 위임 메서드만 추가하면 된다(`/work/thrd/random-js/src/Random.ts` 전체가 이 패턴).

## 4. 단점/트레이드오프 — 코드 수준 근거

1. **유지보수 사실상 중단.** `master` 브랜치가 2019-05-30 커밋(`f000fd5`) 이후 5년 넘게 정지, 열린 이슈 33개, dependabot 보안 패치 브랜치 14개가 전부 미병합(§1). CI가 죽은 Travis 설정만 있다. `@cp949/random`이 "활발히 유지보수되는 라이브러리"의 반례로 인용하기에 적합하다.
2. **레거시 타깃(ES3) 지원 비용.** `jest.config.js`의 `tsConfig.target: "es3"`(줄 8)와 `rollup.config.es3.js`(파일 존재 확인)는 IE 계열까지 지원 범위로 삼았던 흔적이다. `.travis.yml`의 Node 6/8 대상(`/work/thrd/random-js/.travis.yml:3-5`)도 마찬가지. `@cp949/random`의 "Chrome75 하한, ES2019" 기준보다 훨씬 넓은(그리고 지금은 불필요한) 호환 범위를 떠안고 있어, `imul`/`Int32Array` 폴백 코드(`/work/thrd/random-js/src/utils/imul.ts:6-13`, `/work/thrd/random-js/src/utils/Int32Array.ts:6-18`) 같은 방어 코드가 늘어난다.
3. **`Engine.next()`가 부호 있는 32비트를 반환**하기 때문에, 상위 분포 함수마다 `>>> 0`/`| 0`를 반복해서 걸어야 한다(`uint32.ts:7`, `int32.ts:7`, `uint53.ts:8-9` 등 거의 모든 파일에서 반복). `@cp949/random`의 `RandomSource`는 애초에 부호 없는 `[0, 2^32)` word로 계약을 통일해 이 반복을 없앴다(설계 우위).
4. **`autoSeed()`가 결국 `Math.random()`(`nativeMath`)에 의존**한다(`/work/thrd/random-js/src/utils/createEntropy.ts:11-21`, 기본 `engine = nativeMath`). "재현 가능/시드 가능"을 표방하는 엔진의 편의 API가 정작 비결정적 소스로 시드된다는 점은 문서화되지 않은 함정이다.
5. **`integer.ts`의 분기 로직이 매우 복잡하다**(148줄, 8개 이상의 분기, `upscaleWithHighMasking`/`upscaleWithinI53AndLoopCheck` 등 이름이 비슷한 함수가 다수). 성능은 최적화되어 있지만 가독성·유지보수성 비용이 크다. `@cp949/random`의 `uniformInt`가 이 복잡도를 어느 수준까지 감수할지 판단할 때 참고할 만한 반례다.
6. **암호학적 엔진의 실패 모드가 사용자에게 불투명하다.** `browserCrypto`/`nodeCrypto` 모두 "If unavailable or otherwise non-functioning, then ... will likely `throw` on the first call to `next()`"라고 TSDoc에만 적혀 있고(`/work/thrd/random-js/src/engine/browserCrypto.ts:14-15`, `/work/thrd/random-js/src/engine/nodeCrypto.ts:13-14`), 전용 에러 클래스가 없다 — 어떤 예외가 던져지는지 호출부에서 구분할 수 없다. `@cp949/random/secure`의 `SecureRandomUnavailableError`(이미 `docs/research/similar-libraries.md`가 지적)와 대비되는 약점.

## 5. `@cp949/random`이 배울 점 — `RandomSource` vs `Engine` 코드 수준 비교

| 축             | random-js `Engine`                                                                                                                                                     | `@cp949/random` `RandomSource`                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 계약 형태      | `interface Engine { next(): number }`(객체, 메서드 1개)(`types.ts:1-3`)                                                                                                | `type RandomSource = () => number`(무인자 함수 자체)(`docs/api/random-core.md`)     |
| 반환값 범위    | 부호 있는 32비트(`                                                                                                                                                     | 0`/`>>> 0` 혼재, 소비부마다 재정규화)                                               | `[0, 2^32)` 부호 없는 정수로 통일 |
| 상태 캡슐화    | 클래스 인스턴스(`MersenneTwister19937`)가 `data`/`index`/`uses` 필드를 가짐 → `getUseCount()`/`discard()` 같은 introspection API 가능(`MersenneTwister19937.ts:44-99`) | 클로저(`createXoshiro128Source`)라 내부 상태에 외부 접근 불가                       |
| 분포 함수 형태 | `Distribution<T> = (engine: Engine) => T`(엔진을 나중에 주입하는 curried 팩토리, 예: `integer(min, max)`가 `Distribution`을 반환)                                      | `int(source, min, max)`처럼 source를 첫 인자로 즉시 받는 1급 함수(팩토리 단계 없음) |
| 고수준 래퍼    | `Random` 클래스가 엔진을 생성자에서 캡처해 상태로 들고, 각 메서드가 그 필드를 참조(`Random.ts:37-39`)                                                                  | 없음(root entry에 고수준 클래스 래퍼가 없고, 매 호출에 `source`를 명시적으로 전달)  |

실행 가능한 시사점:

1. **`RandomSource`를 부호 없는 word로 통일한 설계는 이미 random-js보다 우위다.** random-js는 `Engine.next()`가 부호 있는 값이라 `uint32.ts`/`uint53.ts`/`int32.ts`/`int53.ts`처럼 부호 유무별로 파일을 나누고 소비부마다 `>>> 0`/`| 0`를 반복한다. `@cp949/random`은 이 이원화가 애초에 없다 — 유지 방향이 맞다는 근거로 문서화 가능(변경 제안 아님).
2. **`integer.ts`의 "특수 형태 조기 반환" 패턴은 `int`/`uniformInt`에 적용을 검토할 가치가 있다.** random-js는 범위가 `2^n - 1`이면 rejection loop 없이 비트마스크만 쓴다(`isPowerOfTwoMinusOne` + `bitmask`, `integer.ts:19-25, 40-45`). `packages/random/internal/uniform-int.ts`가 이런 특수 경로(예: 범위가 정확히 `2^32`인 경우 `source()`를 그대로 씀)를 이미 갖고 있는지 확인하고, 없다면 도입 검토가 가능하다. 단, `docs/api/random-core.md`에 따르면 `int`의 산식·word 소비는 계약이 아니므로(§"계약 표") breaking 없이 CHANGELOG 기록만으로 도입할 수 있다.
3. **엔진의 "배치 채움" 전략은 `./secure`의 `createSecureSource`에 이미 없다면 검토 대상이다.** random-js의 `browserCrypto`/`nodeCrypto`는 128워드를 한 번에 채워 `getRandomValues` 호출 횟수를 줄인다(`browserCrypto.ts:5-6, 17-27`). `@cp949/random/secure`의 `createSecureSource`가 매 호출마다 `getRandomValues`를 부르는지, 배치인지 확인하고, 매 호출 방식이면 배치화로 성능 이득이 있는지 벤치마크할 가치가 있다(단, 배치 크기만큼 미리 버퍼를 소모하므로 "덜 예측 가능"해지는 트레이드오프는 없음 — crypto 소스는 어차피 예측 불가).
4. **`getUseCount()`/`discard()` 같은 introspection API는 `RandomSource`의 클로저 설계와 근본적으로 상충한다.** `@cp949/random`이 이런 기능이 필요하다면(예: 체크포인트 재개) `RandomSource` 자체를 바꾸는 대신 `./state`의 `RandomState` facade처럼 **별도 레이어**에서 제공해야 한다(random-js는 상태 캡슐화 객체이므로 이런 기능을 코어에 넣을 수 있었지만, `@cp949/random`은 코어 계약을 `() => number`로 최소화하는 대신 이런 기능을 포기했다는 트레이드오프를 명시적으로 인지하고 있어야 한다). `docs/research/similar-libraries.md`가 이미 seedrandom의 `{state: true}`를 언급했는데, random-js의 `discard(count)`는 그것과 다른 접근(정확한 skip-ahead, 직렬화가 아님)이라는 점을 구분해서 참고할 수 있다.
5. **`Random` 클래스 같은 고수준 OOP 래퍼는 순수 위임이라 코드 비용이 낮지만, `@cp949/random`의 함수형 전용 설계(고수준 클래스 없음)가 번들 크기 면에서 더 유리하다.** random-js는 `Random` 클래스를 쓰지 않아도 개별 함수를 import할 수 있지만(`export * from "./distribution/..."`), `Random` 클래스 자체도 `dist`에 포함되어 트리셰이킹이 실패하면 불필요한 코드가 남을 수 있다(`"sideEffects": false`로 완화하지만). `@cp949/random`이 root entry에 고수준 클래스를 아예 두지 않는 현재 설계는 `docs/api/random-core.md`의 번들 측정(각 export 100~400B대)과 일관되며, random-js 대비 최소주의를 유지할 근거로 쓸 수 있다.
6. **테스트에서 엔진의 저수준 계약(변환식, 배치 소진 시점)을 직접 mock으로 고정하는 관행**(`nativeMath.test.ts`의 `jest.spyOn(Math, "random")`, `browserCrypto.test.ts`의 `getRandomValues` mock)은 `@cp949/random`의 golden vector 방식과 상호 보완적이다. golden vector가 "특정 seed → 특정 출력"을 고정한다면, random-js 스타일 mock 테스트는 "엔진이 소스를 정확히 몇 번, 어떤 인자로 호출하는가"를 고정한다. `createXoshiro128Source`나 `./secure`의 `createSecureSource`에 대해 "내부적으로 `crypto.getRandomValues`를 몇 바이트 단위로, 몇 번 호출하는가"를 검증하는 테스트가 없다면 추가를 검토할 가치가 있다.

## 6. 참고 자료

- 로컬 클론: `/work/thrd/random-js`(git 커밋 `f000fd5c286bcf7c8a486940bb81deea19a99c55`, shallow clone, `master` = 태그 `v2.1.0`)
- 원본 GitHub 저장소: https://github.com/ckknight/random-js
- 원본 커밋(v2.1.0): https://github.com/ckknight/random-js/commit/f000fd5c286bcf7c8a486940bb81deea19a99c55
- GitHub API 조회 결과(2026-09-22, `gh api`): `repos/ckknight/random-js`(`pushed_at`, `archived`, `open_issues_count`), `repos/ckknight/random-js/commits/master`, `repos/ckknight/random-js/branches`
- npm 레지스트리: https://www.npmjs.com/package/random-js (버전 2.1.0, `docs/research/similar-libraries.md`에서 기존 확인)
- 이 저장소의 `@cp949/random` API 계약: `/work/cp949/random/docs/api/random-core.md`, `/work/cp949/random/docs/api/sampling.md`
- 개요 수준 선행 리서치: `/work/cp949/random/docs/research/similar-libraries.md`("random-js" 절)

### 확인하지 못한 사항 (지어내지 않고 명시)

- Travis CI가 현재도 실제로 그린 상태로 통과하는지(빌드 로그 자체는 조회 범위 밖).
- `dist/` 번들의 실제 minified+gzip/brotli 크기(README/레지스트리에 수치 없음, 로컬에 `dist/`가 빌드되어 있지 않음).
- 33개 열린 이슈의 구체적 내용(제목/라벨 목록은 조회하지 않음, "개수"만 확인).
