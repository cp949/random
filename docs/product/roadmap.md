# 제품 로드맵

## 1. 목표

`@cp949/random`은 브라우저에서 ID 생성을 한 곳에서 끝내는 라이브러리다. 프로젝트마다 다시 만들고 감싸 쓰는 ID 생성기(무작위 ID, 순환 ID)를 사용처에서 wrap하지 않고 바로 쓰게 하며, 그 토대인 보안 난수와 재현 가능한 난수·샘플링을 함께 제공한다. Chrome 75를 하한으로 하는 런타임 의존성 없는 ESM 단일 npm 패키지이며 subpath export로 영역을 나눈다.

### 정체성

- ID 생성기가 큰 축이다. 무작위 ID 함수는 사용처에서 감싸 쓸 필요가 없도록 접두사, 길이, 문자 집합, 형식, 충돌 회피 같은 흔한 변형을 옵션으로 직접 제공하고, 같은 설정을 재사용하는 생성기를 한 줄로 만든다.
- 정확성이 기본값이다. 모든 정수·인덱스 샘플링이 하나의 무편향 경로를 쓰고, 보안 API는 지원되지 않는 환경에서 실패하며(fail-closed), 입력은 엄격하게 검증한다.
- 종류를 섞지 않는다. 재현 가능한 난수(seed, PRNG, 샘플링), 보안 난수와 무작위 ID(`./secure`, `./id`), 예측 가능한 순환·순차 ID는 이름, 타입, 문서에서 구분한다. 재현 가능한 난수와 보안 난수는 subpath도 나눈다. 둘 이상을 합칠 때는 명시적 합성(예: `RandomSource`에 `secureSource` 주입)으로만 한다.
- 호환성을 증거로 보증한다. dist 정적 게이트와 실제 Chromium 75 실행으로 검증하고 "공식 floor"와 "실측 버전"을 분리해 기록한다.

아닌 것:

- 암호 라이브러리가 아니다. SubtleCrypto를 대체하지 않으며 digest, AES, HMAC, KDF를 제공하지 않는다.
- 통계·확률 분포 라이브러리가 아니다. `normal` 같은 분포 함수와 저불일치 수열(QMC)을 제공하지 않는다.
- ndarray와 다차원 배열 난수를 지원하지 않는다.
- polyfill이 아니다. 전역을 바꾸지 않는다.
- 머신 간 조율이 필요한 ID(snowflake 등)를 다루지 않는다.

기능 추가 판정 기준: 다음 셋에 모두 "예"여야 한다.

1. 프로젝트마다 반복해 직접 만들거나 감싸 쓰는 ID·난수 기능이거나, 브라우저에서 난수를 잘못 쓰는 실제 사례를 막는가?
2. 같은 증거 체계(정적 게이트, Chromium 75 실행, 통계·golden·경계값 테스트)로 검증할 수 있는가?
3. 런타임 의존성 없이 기존 확장 지점(`RandomSource`, 인자 없는 ID 생성기 함수)에 맞는가?

### 제품 범위

최종 제품은 다음의 합집합이다.

```text
ID 생성기: 무작위 ID (UUID, nanoid, 숫자·문자 ID)와 순환·순차 ID (int32 순환 등)
+ 보안 난수 (ID 생성기의 토대)
+ 재현 가능한 난수 (seeded PRNG, 정수·실수, 샘플링)
+ 교체 가능한 난수원(RandomSource)과 상태 facade
+ Chrome 75 호환 증거 체계
```

로드맵은 구현 순서와 단계 완료 조건만 결정한다. 함수 시그니처와 오류 계약은 단계 시작 시 작성하는 design spec이 소유하며 이 문서에 복제하지 않는다. R2·R3의 세부 요구(옵션 목록, 검증 항목, 보장 범위)는 `docs/product/id-generator-requirements.md`가 소유한다.

## 2. 운영 원칙

- 단계적으로 출시한다. 각 릴리스는 실제 사용 가능한 사용자 여정으로 끝낸다.
- 단계 완료는 기능 존재가 아니라 테스트와 게이트 증거로 판정한다.
- 이후 단계의 기능을 위해 현재 단계를 추상화하지 않는다. 현재 공개 경계가 후속 확장을 막지 않는지만 확인한다.
- 확장성이 호환성보다 우선한다. 기존 구현체의 API와 동작을 재현하지 않는다. 난수원의 확장 지점은 `RandomSource` 하나이고, ID 생성기의 공통 형태는 인자 없는 함수다.
- 브라우저 하한은 Chrome 75다. 공식 보증은 Chrome(Blink) 75 이상으로 한정하고 Firefox와 Safari는 보증하지 않는다. 코드는 DOM 전역 없이 Worker와 SSR에서 import된다.
- Chrome 75 값은 한 곳에서 선언하고 tsconfig, 정적 게이트, 실기 검증이 같은 값을 읽는다.
- 보안 API는 `globalThis.crypto.getRandomValues()`만 사용한다. 패키지 어디에서도 `Math.random()`을 호출하지 않는다. 지원되지 않는 환경에서는 `SecureRandomUnavailableError`를 던진다.
- 모듈 import 시점에 `globalThis.crypto`에 접근하지 않는다.
- ID 생성 함수는 사용처에서 감싸 쓸 필요가 없어야 한다. 흔한 변형은 옵션으로 직접 제공하되, 어떤 변형이 필요한지는 실제 wrapper 사례로 판단한다.
- 옵션 조합이 무편향이나 형식 정확성을 깨면 조용히 무시하지 않고 `RangeError`로 실패한다.
- 옵션이 풍부한 편의 진입점과 최소 leaf 함수를 함께 제공한다. 편의 진입점의 번들 크기는 측정해 문서에 기록한다.
- 순환·순차 ID는 예측 가능하며 보안 용도가 아니다. 이름과 문서에서 무작위 ID와 구분한다.
- 재현성 계약은 기본 PRNG의 raw 출력 스트림, seed→상태 변환, 그 위의 `float`·`bool`·`sign` 산식에 한정한다. 이 계약의 변경은 breaking이다(0.x는 minor 증가, 1.0 이후 major 증가). `int`·`uniform`·샘플링·shuffle의 결과값은 계약이 아니다.
- 0.x 동안 breaking change를 허용한다.
- 성능 주장은 벤치마크 전에는 하지 않는다.
- 기존 소비자(Geul, Vectra 등)의 migration은 이 로드맵에 포함하지 않는다. 별도 요청이 있을 때만 다룬다.

## 3. 단계

### R0 — 프로젝트 기반과 호환 게이트

**상태:** 완료 (2026-09-20)

**사용자 결과:** 소비자가 배포 형태의 패키지를 설치해 import할 수 있고, 이후 모든 단계가 Chrome 75 정적 게이트 위에서 만들어진다.

범위:

- pnpm workspace, Turborepo, `packages/random`, `apps/demo` (스캐폴드 완료)
- `exports` 맵과 파일 단위 ESM 산출물
- DOM lib를 제외한 headless 타입 환경과 최소 `crypto` 타입 자체 선언
- 정적 게이트: dist 문법 검사(ES2019 기준), Web API 이름 grep, `Math.random` 금지 lint
- API 부재 harness: `globalThis.crypto` 제거·stub과 import 시점 무예외 테스트
- 배포 tarball을 소비하는 fixture 앱과 배포 d.ts 검증
- Chrome 75 값의 단일 출처
- 런타임 의존성 0 확인, CI

완료 조건:

- `globalThis.crypto`가 없어도 모든 entry가 import된다.
- ES2019를 넘는 문법을 심은 seed가 dist 게이트에서 검출된다(게이트 자체 테스트).
- DOM 전역을 쓰는 fixture가 컴파일에 실패한다.
- `Math.random` 호출이 lint에서 실패한다.
- pack한 tarball을 fixture 앱이 소비하고 타입이 해석된다.
- 런타임 의존성이 0이다.

### R1 — 보안 난수 기반

**상태:** 완료 (2026-09-20)

**사용자 결과:** 소비자가 Chrome 75에서 보안 난수 바이트, 무편향 정수, 인코딩된 토큰과 alphabet 문자열을 얻는다. 지원되지 않는 환경에서는 명시적 오류를 받는다. 이 단계의 함수는 R2 ID 생성기의 토대다.

범위:

- `randomBytes`: `getRandomValues`의 call당 65,536-byte 제한을 chunk로 처리
- `randomInt`: 양끝 포함, safe integer 폭, rejection sampling
- `randomHex`, `randomBase64url`(padding 없음)과 내부 인코더
- `randomString`: alphabet 코드 포인트 단위, 중복·짝 없는 surrogate·범위 위반 `RangeError`, 무편향
- `getCryptoCapabilities`
- `SecureRandomUnavailableError`
- 결정적 byte source 주입은 내부 전용이다. 공개 secure API는 난수원 주입 인자를 받지 않는다. 공개 주입은 R2 팩토리 옵션에만 있다(`randomBytes`는 무작위 팩토리, `now`는 timestamp를 쓰는 팩토리가 받는다). 주입 결과에 보안 보증이 없음을 타입과 문서로 구분한다.
- 타입과 소비자 환경: `randomBytes`는 `Uint8Array<ArrayBuffer>`를 반환한다. 소비자 TypeScript 하한은 5.7이다. subpath는 `exports` 전용이며 `node10`과 webpack 4는 지원하지 않는다.
- 공개 계약 문서: `docs/api/secure.md`에 함수별 입력 검증, 오류, 결과값이 계약인지 여부를 기록한다.

완료 조건:

- 65,535, 65,536, 65,537, 131,072 byte 요청의 chunk 결합이 검증된다.
- `randomInt`(`uniformInt`)와 `randomString`(`pickChars`)의 rejection 분기가 경계 byte 주입 테스트와 mutation 테스트로 검증된다.
- 자릿수·문자 빈도 통계 테스트가 균등성을 검증한다.
- `getRandomValues`를 쓸 수 없으면(`globalThis.crypto` 없음, 함수 아님, 접근 예외) `getCryptoCapabilities`를 뺀 모든 secure API가 `SecureRandomUnavailableError`로 실패하고 다른 난수원으로 대체되지 않는다. `getCryptoCapabilities`는 예외 없이 `getRandomValues: false`를 돌려준다.
- 인코더가 RFC 4648 테스트 벡터를 통과한다.
- `randomBytes` 결과를 `lib.dom`의 `crypto.subtle.digest`에 넘기는 fixture가 소비자 TypeScript 하한 lane에서 컴파일된다.
- `docs/api/secure.md`가 R1의 모든 공개 함수에 대해 입력 검증, 오류, 결과값이 계약인지 여부를 기록한다.

### R2 — 무작위 ID 생성기

**상태:** 완료 (2026-09-21)

**사용자 결과:** 소비자가 접두사, 길이, 문자 집합, 형식이 다른 무작위 ID를 wrapper 없이 한 번의 호출로 얻고, 같은 설정을 재사용하는 생성기를 한 줄로 만든다. `crypto.randomUUID` 없이 UUID v4를 만드는 사용 사례를 충족한다.

범위:

- 범용 무작위 ID 함수. 다음 변형을 옵션으로 직접 제공한다. 이름과 옵션 형태는 spec에서 결정한다.
  - 접두사와 구분자
  - 길이와 문자 집합: base64url(URL-safe), base62, base36 소문자, 숫자, 모호한 글자를 뺀 가독성용 등 이름 있는 preset과 사용자 정의
  - 대소문자와 그룹화
  - 식별자와 HTML id에 안전한 시작 문자 제약
  - 시간 정렬을 위한 timestamp 접두사
  - 충돌 회피: `isTaken` 검사와 재시도, 재시도 상한
- 숫자 ID: 자릿수를 지정한 숫자 문자열(앞자리 0 유지), 범위를 지정한 정수
- `uuidv4`: `getRandomValues` 단일 경로, version/variant 비트 설정, 형식 옵션(대시 유무, 대소문자). 바이트 배열은 `parseUuid`로 얻는다
- `uuidv7`과 `createUuidv7Factory({ now?, randomBytes? })`: 같은 ms에 `rand_a` counter 증가, 고갈 시 +1ms, clock rollback 임계값
- `nanoid`: base64url(URL-safe) 64자, 기본 길이 21, alphabet 인자 없음. 최소 크기 leaf로 유지한다.
- `isUuid`(strict), `parseUuid`, `stringifyUuid`
- 같은 옵션을 재사용하는 ID 생성기 팩토리. 인자 없는 함수를 반환한다.
- 테스트용 결정적 주입(byte source, clock). 주입 결과에 보안 보증이 없음을 타입과 문서로 구분한다.
- 사용처별 레시피 문서: 요청 ID, 사용자 ID, 파일 이름, HTML id, 인증 코드
- UUID가 인가 수단이 아니라는 문서

완료 조건:

- 사용성 시험: 기존 프로젝트에서 반복된 wrapper 요구 사례를 wrapper 없이 라이브러리 호출 한 줄로 만들 수 있다는 것이 fixture로 검증된다. 사례는 `docs/product/id-generator-requirements.md`의 VER-8 중 무작위 ID 사례(1~6, 9번)다. 요구 사례로만 쓰며 기존 구현과의 호환은 목적이 아니다.
- 옵션 조합별 출력 길이와 형식이 정규식과 고정 바이트 주입으로 검증되고, 문자 빈도 통계 테스트가 균등성을 검증한다.
- 지원하지 않는 옵션 조합이 조용히 무시되지 않고 `RangeError`로 실패한다.
- 충돌 회피가 재시도 상한을 넘으면 명시적 오류를 던진다.
- 고정 바이트 주입으로 v4의 36자 형식, version/variant 비트, 16-byte round-trip이 검증되고 비트 마스크를 제거한 mutation이 실패한다.
- v7의 timestamp 레이아웃, 같은 ms 대량 생성의 단조성, counter 고갈, clock rollback이 결정적 clock과 byte 주입으로 검증된다.
- `isUuid`가 hex가 아닌 문자, 길이·version·variant 위반을 거부한다.
- 편의 진입점과 최소 leaf의 번들 크기가 측정되어 문서에 기록된다.

### R3 — 순환·순차 ID 생성기

**상태:** 완료 (2026-09-21)

**사용자 결과:** 소비자가 프로젝트마다 다시 만들던 숫자 ID 생성기를 한 곳에서 가져와, 범위를 순환하는 정수 ID와 접두사가 붙은 문자열 ID를 얻는다.

범위:

- 순환 정수 ID 생성기 추가(subpath는 spec에서 정한다): 범위(`min`, `max`)와 시작값을 지정하고 `max` 다음에 `min`으로 돌아간다.
- int8~uint32 프리셋. `int32`는 전체 범위 `[-2^31, 2^31-1]`이고 시작값은 0이다.
- 접두사와 진법 인코딩을 지정하는 문자열 ID 생성기
- R2의 ID 생성기와 같은 형태(인자 없는 함수)로 서로 교체할 수 있다.
- 생성기는 인스턴스 단위로 상태를 가지며 전역 상태를 쓰지 않는다.
- 순환 ID가 예측 가능하며 보안 용도가 아니라는 문서, wrap 이후 중복은 소비자가 관리한다는 문서

완료 조건:

- 범위 경계(`max`, wrap 직후 `min`)와 int32 경계(`2^31 - 1` 다음이 `-2^31`)가 시작값 지정으로 검증된다.
- 작은 범위에서 한 바퀴 전체 순회가 중복 없이 반복된다.
- 잘못된 범위(`min > max`, 비정수, safe integer 초과)가 `RangeError`로 거부된다.
- 서로 다른 생성기 인스턴스가 상태를 공유하지 않는다.
- 난수원과 crypto를 사용하지 않으며 import 시점에 예외가 없다.
- 문자열 ID의 접두사와 진법 인코딩이 고정 벡터로 검증된다.
- VER-8의 7, 8번 사례(int32 순환 ID, 접두사 + base36 카운터 ID)가 wrapper 없이 한 줄로 만들어진다.

### R4 — 재현 가능한 난수 코어

**상태:** 완료 (2026-09-21)

**사용자 결과:** 소비자가 seed로 재현 가능한 난수열과 정수·실수·불리언을 얻고 자체 난수원을 연결한다.

범위:

- `RandomSource`(u32 스트림) 계약과 custom source 주입. float 함수 어댑터는 design spec에서 제외했다(한 줄 레시피로 대체)
- 기본 PRNG xoshiro128**, SplitMix32 seed 확장, 숫자·문자열 seed 정규화와 해시
- `./secure`의 `createSecureSource`: `getRandomValues` 기반 `RandomSource`. 재현 가능한 난수와 보안 난수를 잇는 유일한 합성 지점
- 모든 source가 공유하는 무편향 정수 helper
- `int`(양끝 포함, safe integer 폭), `float`, `bool`(확률 `p` 선택), `sign`, `uniform`
- 입력 검증: `min > max`, 비정수는 `RangeError`

완료 조건:

- 기본 PRNG의 raw 출력 스트림과 seed→상태 변환(숫자·문자열 seed)이 golden vector로 고정된다.
- seeded, secure, custom source 모두에서 `int`가 같은 무편향 helper를 쓴다는 것이 경계값 주입과 통계 테스트로 검증된다.
- PRNG 상태가 all-zero가 되지 않는다.
- 패키지에서 `Math.random` 호출이 0건이다.

### R5 — 컬렉션 샘플링

**상태:** 완료 (2026-09-22)

**사용자 결과:** 소비자가 배열에서 무편향으로 고르고 섞고 뽑는다.

범위:

- `choice`: 빈 배열은 `RangeError`
- `shuffle`(복사본 반환), `shuffleInPlace`
- `sample(items, k)`: 비복원, `k`가 길이를 넘으면 `RangeError`
- `permutation`
- 가중 `choice`와 반복 추출용 가중 sampler

완료 조건:

- 카이제곱과 위치별 빈도 통계 테스트가 `shuffle`, `sample`, `permutation`의 편향을 검출한다.
- 마지막 원소가 이동하지 않는 off-by-one을 재현한 mutation이 통계 테스트에서 실패한다.
- 복사본 API가 입력 배열을 변경하지 않는다.
- 가중 추출의 관측 비율이 이론 비율의 허용 오차 안에 든다.
- 빈 입력과 경계 입력 정책이 테스트로 고정된다.

### R6 — 초기 분포

**상태:** 제거 (2026-09-22)

2026-09-22에 완료했으나 0.1.0 배포 전에 걷어냈다. 분포 6개(`standardNormal`, `normal`, `logNormal`, `exponential`, `triangular`, `geometric`)는 §1의 기능 추가 판정 기준 1번(프로젝트마다 반복해 직접 만드는 기능인가)을 통과하지 못했다. 코드·spec·API 문서는 보존하지 않는다. 다시 넣으려면 §1 판정 기준 셋을 처음부터 다시 통과해야 하며 그때는 R9 후속 후보에서 개별 단계로 승격한다. 번호는 R7·R8 참조를 유지하려고 비워 둔다.

### R7 — 상태 facade

**상태:** 완료 (2026-09-22)

**사용자 결과:** 소비자가 seed 유무와 무관하게 상태 객체 하나로 모든 일반 helper를 같은 이름으로 호출하고, seed가 필요 없는 곳에서는 module-level `rand`를 쓴다.

범위:

- `createRandomState(seed?, { source? })`: `RandomSource`를 바인딩한 동일 이름 method
- `rand`: 첫 사용 시 1회 `getRandomValues(Uint32Array(4))`로 lazy 초기화, all-zero면 재추출
- `rand`가 보안 용도가 아니며 token과 ID에는 `./secure`, `./id`를 쓴다는 문서
- facade가 bundle 크기 우선 경로가 아니라는 문서

완료 조건:

- `./state`를 import만 해도 crypto를 호출하지 않는다.
- 같은 seed의 상태 객체가 leaf 함수와 PRNG를 직접 조합한 결과와 일치한다.
- `globalThis.crypto`가 없을 때 `rand`의 첫 사용이 `SecureRandomUnavailableError`로 실패한다.
- root leaf import가 `./state`, `./secure`, `./id`의 코드를 포함하지 않는다는 것이 build fixture로 확인된다.

### R8 — 0.1.0 릴리스 게이트

**사용자 결과:** 소비자가 npm에서 `@cp949/random@0.1.0`을 설치해 문서대로 사용할 수 있다.

범위:

- 컨테이너에서 실제 Chromium 75.0.3765.0을 실행하는 smoke (`@cp949/legacy-browser-smoke`)
- `apps/demo`의 subpath별 시연
- README, API 문서, 호환성 매트릭스: "공식 floor"와 "실측 버전"을 분리하고 검증 한계(OS, 엔진, 표본)를 명시
- scoped 패키지의 `publishConfig`, `@cp949` 스코프 쓰기 권한 확인
- 배포 tarball 내용 검증, CHANGELOG(`Unreleased` 절을 0.1.0 절로 확정), release note

완료 조건:

- smoke가 Chromium 75.0.3765.0에서 통과한다. smoke는 `typeof crypto.randomUUID === "undefined"`를 스스로 assert한다.
- `npm pack --dry-run`이 LICENSE, dist, package.json, README를 포함한다.
- 배포된 exports와 import 계약이 fixture 앱에서 검증된다.
- release note에 알려진 제한과 다음 단계 범위가 기록된다.

### R9 — 후속 후보

이 단계의 항목은 수요 증거가 확인되면 개별 단계로 승격한다. 지금은 순서와 완료 조건을 정하지 않는다.

- `RandomState` 상태 스냅샷(`getState`, `setState`, 버전 헤더)
- 독립 스트림 분기(`fork`, jump)
- shuffle-bag
- 추가 PRNG 구현체(sfc32, PCG 등)
- 정렬 보존 base62·base32 ID 인코딩, alphabet 상수
- ULID 등 추가 시간 정렬 ID
- 사용 중인 ID를 건너뛰는 순환 할당기(allocate, release)
- 벤치마크 baseline과 그에 근거한 `options.out` 등 할당 없는 API

## 4. 릴리스 판정

각 단계는 다음 조건을 모두 만족해야 완료된다.

- 단계 범위의 모든 항목이 테스트 또는 게이트 증거로 검증된다.
- 정적 게이트(dist 문법, Web API 이름, `Math.random` 금지, DOM 금지)가 통과한다.
- 단계의 단위, 통계, mutation 테스트가 통과한다.
- 공개 API와 exports를 배포 tarball을 소비하는 fixture 앱에서 검증한다.
- 새 공개 API마다 입력 검증, 오류 계약, 결과값이 계약인지 여부가 문서에 기록된다.
- 런타임 의존성이 0이다.
- 알려진 제한과 다음 단계 범위를 release note에 기록한다. 0.1.0 이전 단계의 기록은 루트 `CHANGELOG.md`의 `Unreleased` 절에 단계별로 누적하고 R8에서 버전 절로 확정한다.

실제 Chromium 75 실행은 단계 완료 조건이 아니라 릴리스 게이트다. R8과 이후 각 릴리스 전에 수행하며 상시 CI 게이트로 넣지 않는다.

단계 일부만 구현된 배포는 가능하지만 해당 단계는 완료로 표시하지 않는다. 완료 표시는 단계 제목 아래 `**상태:** 완료 (YYYY-MM-DD)` 한 줄이다.

## 5. 호환 기준선 갱신

브라우저 하한을 바꿀 때 다음 순서로 갱신한다.

1. Chrome 하한 값의 단일 출처를 갱신한다.
2. tsconfig의 target과 lib, 정적 게이트의 해제 목록이 같은 값에서 파생되는지 확인한다.
3. 실기 검증에 쓰는 Chromium의 고정 revision을 갱신하고 "공식 floor"와 "실측 버전"을 분리해 기록한다.
4. 새 하한에서 제거할 수 있는 코드 경로를 목록화하고 breaking 여부를 판정한다.
5. 검증 한계(OS, 엔진, 표본)를 갱신한다.

## 6. 릴리스 매핑

| 릴리스     | 포함 단계 | 비고                                     |
| ---------- | --------- | ---------------------------------------- |
| 0.1.0      | R0~R8     | 첫 공개 릴리스                           |
| 0.2.0 이상 | R9 후보   | 수요 증거가 있는 항목만 개별 단계로 승격 |

0.1.0의 범위는 일반 random, `./state`, `./secure`, `./id`(무작위 ID와 순환·순차 ID)다.

범위 밖:

- SubtleCrypto 대체(digest, AES, HMAC, KDF)
- 확률 분포(`normal` 등)와 저불일치 수열(QMC)
- ndarray와 다차원 배열 난수
- Node 전용 adapter
- 2D 기하 샘플러
- 머신 간 조율이 필요한 ID(snowflake 등)
- 수학 수열(등차, 등비, 피보나치)
- Firefox와 Safari 호환 보증
- 기존 소비자의 migration
