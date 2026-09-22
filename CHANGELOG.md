# Changelog

버전 절 위에 `Unreleased`를 두고 릴리스 때 버전 절로 확정한다. 각 단계는 알려진 제한과 다음 단계 범위를 적는다. 단계 정의는 `docs/product/roadmap.md`를 따른다.

## Unreleased

공개 API 변경 없음.

문서:

- 유사 라이브러리 비교 문서 `docs/comparison.md`(차별점, 옮겨올 때 걸리는 것, 채택하지 않은 패턴). 루트·패키지 README에서 연결.
- 리서치 문서 `docs/research/`(요약 1편, 상세 11편) 추가.
- `docs/api/secure.md`·`docs/api/id.md`·`docs/api/random-core.md`에 설계 근거(버퍼 비공유, `randomBytes` 주입 형태, 10,000ms 정책, 예측 가능성)와 seed 합성 레시피 추가. 계약 표는 변경 없음.
- 로드맵 §2에 "breaking change는 한 릴리스에 하나의 축" 원칙, R9 후보 4개에 설계 메모, 벤치마크 실험 후보 3개 추가.

테스트:

- `int`·`uniform`·샘플링 6개의 non-regression 인라인 스냅샷(`test/core/noreg.test.ts`, `test/sampling/noreg.test.ts`). 결과값은 계약이 아니며 산식 변경 시 갱신한다.

## [0.1.0] - 2026-09-22

`@cp949/random` 첫 배포.

추가:

- root(`.`): 재현 가능한 PRNG(xoshiro128**·SplitMix32 seed 확장), `int`·`float`·`bool`·`sign`·`uniform`, 샘플링 6개(`choice`, `shuffle`, `shuffleInPlace`, `sample`, `permutation`, `weightedChoice`, `createWeightedSampler`).
- `./state`: `createRandomState`, `rand`.
- `./secure`: `randomBytes`, `randomInt`, `randomHex`, `randomBase64url`, `randomString`, `createSecureSource`, `getCryptoCapabilities`, `SecureRandomUnavailableError`.
- `./id`: `randomId`·`createRandomIdFactory`, `uuidv4`·`createUuidv4Factory`, `uuidv7`·`createUuidv7Factory`, `isUuid`·`parseUuid`·`stringifyUuid`, `createCyclicIdFactory`·`createCounterIdFactory`, `nanoid`, `IdCollisionError`.

알려진 제한:

- 보안 API는 `globalThis.crypto.getRandomValues`만 쓰고 미지원 환경에서는 `SecureRandomUnavailableError`를 던진다. `Math.random` fallback은 없다.
- 재현성 계약은 기본 PRNG의 raw 출력 스트림, seed→상태 변환, 그 위의 `float`·`bool`·`sign` 산식으로 한정한다. `int`·`uniform`·샘플링·`shuffle`의 결과값은 계약이 아니다.
- 공식 하한은 Chrome 75. Firefox·Safari는 보증하지 않는다. `moduleResolution`이 `node10`인 TypeScript와 webpack 4는 지원하지 않는다. TypeScript는 5.7 이상이 필요하다.
- 실브라우저 실측과 검증 한계(OS 1종, Blink만, 표본 2개 × 실행 1회, headless, sandbox 해제 등)는 `docs/compatibility.md`에 있다.
- 성능은 벤치마크 전이라 주장하지 않는다.

다음 릴리스 범위: 미정. 로드맵의 후속 후보(R9) 중 수요 증거가 확인된 항목을 개별 단계로 승격해 0.2.0에 넣는다.

### R0 — 프로젝트 기반과 호환 게이트

추가:

- pnpm workspace, Turborepo, `packages/random`(`@cp949/random`), `apps/demo`
- Chrome 하한을 `baseline.json` 한 곳에서 선언하고 tsconfig, 정적 게이트, 데모 빌드가 같은 값을 읽는다.
- 정적 게이트: `check:escompat`(dist가 Chrome 하한에 없는 ES 문법·API와 DOM·Node 전역을 쓰지 않는지), `Math.random` 금지 lint, `check:no-dom`(DOM 전역을 쓰는 fixture가 컴파일에 실패하는지)
- 배포 검증: `check:pack`(tarball 파일 집합, `exports` 대상, `attw`, `publint`), `check:consumer`(tarball을 설치해 타입 해석과 import 확인), `check:deps`(런타임 의존성 0), `check:size-config`, `size`
- `pnpm verify` 13단계와 CI(`.github/workflows/ci.yml`)

알려진 제한:

- 실제 Chromium 75 실행 검증은 릴리스 게이트이며 R8 전에는 없다. 현재의 Chrome 75 보증은 정적 게이트와 Node 테스트에 근거한다.

다음 단계 범위: R1 보안 난수 기반.

### R1 — 보안 난수 기반

추가:

- `@cp949/random/secure`: `randomBytes`, `randomInt`, `randomHex`, `randomBase64url`, `randomString`, `getCryptoCapabilities`, `SecureRandomUnavailableError`. 함수별 계약은 `docs/api/secure.md`에 있다.
- `check:consumer`에 TypeScript 5.7 하한 lane, `lib.dom` 사용 fixture, 런타임 smoke(crypto 기본·제거·접근 예외 3상태)
- `pnpm mutation`: 핵심 5개 파일, 점수 하한 95

알려진 제한:

- 소비자 TypeScript는 5.7 이상이어야 한다(`randomBytes`가 `Uint8Array<ArrayBuffer>`를 반환한다).
- subpath는 `exports` 맵으로만 제공한다. `moduleResolution`이 `node10`인 TypeScript와 webpack 4는 지원하지 않는다.
- 길이 인자의 상한은 1,048,576이다. 더 필요하면 호출자가 여러 번 호출한다.
- `randomInt`와 `randomString`은 rejection 반복에 상한이 없다. `getRandomValues`가 거부 구간의 상수만 채우는 결함 환경에서는 반환하지 않는다. 결함 난수원은 위협 모델 밖이다.
- 무작위 결과값은 재현할 수 없고 계약이 아니다. 공개 secure API는 난수원 주입 인자를 받지 않는다.
- `globalThis.crypto`를 직접 읽는 코드를 lint가 막지 않는다. 읽는 곳은 `src/internal/crypto.ts` 하나뿐이며 이는 관례다.
- ESLint가 `.stryker-tmp/`와 `reports/`를 무시하지 않아 mutation 실행이 비정상 종료된 뒤에는 `pnpm lint`가 실패할 수 있다.
- `pnpm mutation`은 수동 실행이며 `pnpm verify`와 CI에 포함되지 않는다.

다음 단계 범위: R2 무작위 ID 생성기(`@cp949/random/id`).

### R2 — 무작위 ID 생성기

추가:

- `@cp949/random/id`: `nanoid`, `randomId`, `createRandomIdFactory`, `uuidv4`, `createUuidv4Factory`, `uuidv7`, `createUuidv7Factory`, `isUuid`, `parseUuid`, `stringifyUuid`, `IdCollisionError`, `SecureRandomUnavailableError`. 함수별 입력 검증·오류·결과값 계약은 `docs/api/id.md`에 있다.
- `randomId`의 접두사·구분자, 길이·비트 수, preset·사용자 문자 집합, 대소문자·그룹화, 영문 시작 문자, timestamp, 동기 충돌 검사와 재시도 상한. 지원하지 않는 옵션 조합은 `RangeError`, 충돌 시도 소진은 `IdCollisionError`로 실패한다.
- `crypto.randomUUID`를 쓰지 않는 UUID v4, 인스턴스별 timestamp·counter를 관리하는 UUID v7, UUID 형식 판정·파싱·문자열화. 팩토리는 설정을 재사용하며 테스트용 난수원·시계 주입을 지원한다.
- 요청 ID·사용자 ID·파일 이름·HTML id·인증 코드 레시피(`docs/guides/id-recipes.md`), wrapper 없는 사용성 사례 7개의 tarball 소비자 fixture, 공개 값 12개의 번들 측정과 한도
- 핵심 mutation 대상 10개 파일. 점수 하한은 95이며 `pnpm mutation`은 계속 수동 실행한다.

알려진 제한:

- 현재 검증 근거는 정적 게이트, Node 단위·통계·mutation 테스트와 tarball 소비자 fixture다. Chrome 75·Worker 실브라우저 실행 및 운영 DB·파일·DOM·인증 통합을 검증한 것은 아니다. 실브라우저 실측은 `docs/compatibility.md`에 있다.
- 소비자 TypeScript는 5.7 이상이어야 하며, `node10` 모듈 해석과 webpack 4는 지원하지 않는다.
- ID의 무작위 부분 길이는 최대 1,024자다. 무작위 결과값·주입 바이트 매핑·소비 순서는 계약이 아니며, 주입 난수원의 결과에는 보안 보증이 없다.
- `isTaken`은 동기 boolean 검사이며 Promise를 반환하면 `RangeError`다. 검사는 ID 예약이 아니므로 동시 요청의 유일성은 DB 유일성 제약 등 소비자가 보장한다. UUID나 ID는 인증·인가 수단이 아니다.
- UUID v7의 단조성은 같은 인스턴스·같은 형식에서만 보장한다. counter 고갈로 timestamp가 실제 시각보다 앞설 수 있으며, 마지막 timestamp보다 시계가 10,000ms를 초과해 뒤처지면 재설정되어 단조성이 끊긴다. 탭·Worker·프로세스 간 순서는 보장하지 않는다.
- UUID v7과 timestamp 옵션은 시각 정보를 노출한다. `randomId`의 timestamp는 같은 ms 안의 생성 순서를 보장하지 않는다.

다음 단계 범위: R3 순환·순차 ID 생성기. 범위·시작값을 지정하는 순환 정수와 int8~uint32 프리셋, 접두사·진법을 지정하는 문자열 생성기를 인스턴스별 상태로 제공한다. 예측 가능한 비보안 ID이며 wrap 이후 중복은 소비자가 관리한다.

### R3 — 순환·순차 ID 생성기

추가:

- `@cp949/random/id`: `createCyclicIdFactory`(정수 범위 `[min, max]`를 `step`씩 순환하는 `() => number`. int8~uint32 프리셋, 시작값·음수 step, `peek()`·`reset(start?)`), `createCounterIdFactory`(접두사·구분자·2~36진법·0 패딩·대소문자를 붙인 `() => string`). 타입 `CyclicIdPreset`, `CyclicIdOptions`, `CyclicIdGenerator`, `CounterIdOptions`, `CounterIdGenerator`. 함수별 계약과 고정 벡터는 `docs/api/id.md`에 있다.
- 순환·카운터 ID의 결과값은 계약이다(같은 옵션은 같은 수열). 난수원·시계·crypto를 쓰지 않으며 crypto가 없는 환경에서도 동작한다.
- 순환 정수 ID·접두사 카운터 ID 레시피(`docs/guides/id-recipes.md`), 사용성 사례 7·8번의 tarball 소비자 fixture, 값 export 2개의 번들 측정과 한도(821 B/1,250 B, 943 B/1,450 B), mutation 대상에 `counter.ts` 추가(총 12개 파일).

알려진 제한:

- 순환·카운터 ID는 예측 가능하며 보안 용도가 아니다. 한 주기가 지나면 값이 다시 나오며 사용 중인 값과의 충돌은 소비자가 관리한다. 상태는 메모리에만 있고 프로세스·Worker·탭 사이에 공유되지 않으며 재시작하면 초기화된다.
- 범위는 safe integer이고 범위 크기는 `Number.MAX_SAFE_INTEGER` 이하다. bigint 범위는 지원하지 않는다.
- `step`이 범위 크기와 서로소가 아니면 일부 값만 순환한다. 오류가 아니며 wrap 감지 API는 없다.
- 카운터의 `case`는 `radix > 10`에서만, `pad`는 최대 64다. 카운터는 프리셋을 받지 않는다.
- 카운터의 `peek()`은 인코딩된 문자열이라 `start`·`reset`에 넘길 수 없다. 상태를 복원하려면 호출자가 카운터 값(숫자)을 따로 보관한다.
- 검증 근거는 정적 게이트, Node 단위·mutation 테스트, tarball 소비자 fixture다. 실브라우저 실측은 `docs/compatibility.md`에 있다.

다음 단계 범위: R4 재현 가능한 난수 코어. `RandomSource`(u32 스트림) 계약, xoshiro128** 기본 PRNG와 SplitMix32 seed 확장, `secureSource`, 무편향 정수 helper, `int`·`float`·`bool`·`sign`·`uniform`.

### R4 — 재현 가능한 난수 코어

추가:

- root(`.`) entry: `RandomSource`(u32 스트림 계약, `() => number`), `createXoshiro128Source(seed)`(기본 PRNG xoshiro128**, SplitMix32 seed 확장, 숫자·문자열 seed), `int`·`float`·`bool`·`sign`·`uniform`. 함수별 계약은 `docs/api/random-core.md`에 있다. root는 crypto에 접근하는 코드를 포함하지 않는다.
- `@cp949/random/secure`: `createSecureSource()`(`getRandomValues` 기반 `RandomSource`, `randomInt`와 word 버퍼 공유)와 `RandomSource` 타입 재export. 재현 가능한 난수와 보안 난수를 잇는 유일한 합성 지점이다(`int(createSecureSource(), 1, 6)`). 번들 319 B, 한도 500 B.
- `int`는 `internal/uniform-int.ts`의 무편향 helper를 seeded·secure·custom source 모두에서 재사용한다(경계값 주입·통계 테스트로 검증).
- 재현성 계약: xoshiro128**의 raw 출력 스트림, seed→상태 변환(숫자 `>>> 0` 정규화, 문자열 FNV-1a 해시, SplitMix32 확장과 상수), 그 위의 `float`·`bool`·`sign` 산식. golden vector로 고정했으며 raw word는 참조 구현 `xoshiro128starstar.c`와 FNV 표준 벡터로 독립 생성했다. PRNG 상태는 all-zero가 될 수 없다(SplitMix32 mixer 전단사, xoshiro 전이 가역성). 보정 분기를 두지 않는다.
- `bool(source, p?)`: `p`를 주면 `float(source) < p`(참일 확률 `p`, word 2개), 생략하면 최상위 비트(word 1개). `sign`도 최상위 비트를 본다(하위 비트 품질이 낮은 사용자 정의 source 대비). `uniform`은 `[min, max)`를 지킨다. 산식 결과가 `max`로 반올림되면 `max` 미만의 가장 큰 double로 보정하고, `min === max`(빈 반개구간)와 `max - min`이 `Infinity`인 입력은 `RangeError`다.
- root entry의 사용성 fixture(`usage-random.ts`, `smoke-random.mjs`)를 tarball 소비자 검증에 추가했다. root 값 export 6개의 번들 측정과 한도. mutation 대상에 `core` 7개 파일과 `secure/secure-source.ts`, `secure/word-source.ts` 추가(총 21개).
- 로드맵 R4 범위의 "float 함수 어댑터"는 제외했다. `() => Math.floor(f() * 2 ** 32)` 한 줄로 대체하며 `docs/api/random-core.md`에 레시피로 실었다.

알려진 제한:

- `RandomSource`가 반환한 값이 `[0, 2^32)`를 벗어나거나 정수가 아니어도 매 호출 검증하지 않는다. 그런 source의 결과는 정의되지 않는다.
- `int`·`uniform`의 결과값은 재현성 계약이 아니다. 산식은 고정하고 변경은 CHANGELOG에 기록한다.
- 숫자 seed는 uint32로 정규화되므로 `seed`와 `seed + 2^32`는 같은 상태를 만든다. 구별 가능한 초기 상태는 최대 2^32개다.
- `bool(s)`와 `bool(s, 0.5)`는 서로 다른 추출이라 결과 열이 같지 않다.
- `createSecureSource()`의 결과 값은 재현할 수 없고 계약이 아니다. root helper를 거친 결과에 보안 보증을 하지 않는다.
- 검증 근거는 정적 게이트, Node 단위·통계·mutation 테스트, tarball 소비자 fixture다. 실브라우저 실측은 `docs/compatibility.md`에 있다.

다음 단계 범위: R5 컬렉션 샘플링. `choice`, `shuffle`/`shuffleInPlace`, `sample(items, k)`, `permutation`, 가중 `choice`와 반복 추출용 가중 sampler.

### R5 — 컬렉션 샘플링

추가:

- root(`.`) entry: `choice`(균등 무작위 선택), `shuffle`/`shuffleInPlace`(뒤에서 앞으로 가는 Fisher-Yates), `sample(source, items, count)`(비복원, 부분 Fisher-Yates), `permutation(source, length)`, `weightedChoice(source, items, weights)`, `createWeightedSampler(items, weights)`, 타입 `WeightedSampler<T>`. 함수별 계약은 `docs/api/sampling.md`에 있다.
- 검증 순서를 함수 전체가 공유한다: `source`(함수인지) → `items`(`Array.isArray`) → 나머지 인자(`count`, `length`, `weights`) → `source` 호출. 인자 검증에 실패하면 `source`를 호출하지 않는다. `createWeightedSampler`는 생성 시 `items` → `weights`를 검증하고, 돌려준 sampler가 호출마다 `source`를 검증한다.
- 가중치 검증(`internal/weights.ts`의 `validateWeights`, WT-1~WT-7)을 `weightedChoice`와 `createWeightedSampler`가 공유한다: 배열 여부, `weights.length === items.length`, 유한하고 0 이상인 원소, 합계 오버플로·합계 0을 모두 `RangeError`로 거부한다. 인덱스 추출은 누적합 위의 선형 스캔(`weightedChoice`)과 이진 탐색(`createWeightedSampler`) 두 경로를 쓰며 같은 `weights`·같은 threshold에서 항상 같은 인덱스를 돌려준다.
- 카이제곱 검정과 위치별 빈도 행렬(`test/helpers/position-frequency.ts`)로 `shuffle`, `shuffleInPlace`, `sample`, `permutation`의 위치 편향을, 관측 비율 비교로 `weightedChoice`/`createWeightedSampler`의 가중 편향을 검출한다. 마지막 원소가 이동하지 않는 off-by-one 변형은 이 통계 테스트로 잡힌다.
- `shuffle`, `sample`, `permutation`, `createWeightedSampler`는 입력 배열을 바꾸지 않는다(snapshot 위에서 동작). `shuffleInPlace`만 같은 참조를 돌려주고 제자리에서 바꾼다.
- root entry의 사용성 fixture(`usage-random.ts`, `smoke-random.mjs`)에 7개 함수 사용 예를 추가했다. 값 export 7개의 번들 측정과 한도: `choice` 241/400B, `shuffle` 265/400B, `shuffleInPlace` 261/400B, `sample` 332/500B, `permutation` 324/500B, `weightedChoice` 372/600B, `createWeightedSampler` 465/700B. mutation 대상에 `internal/weights.ts`와 `sampling/*.ts`(index 제외) 7개 파일 추가(총 29개).

알려진 제한:

- word 소비량과 인덱스 추출 순서는 계약이 아니다. 산식은 고정하고 변경은 CHANGELOG에 기록한다.
- 구멍(hole)이 있는 희소 배열을 넘긴 결과는 정의되지 않는다.
- `sample`은 `count`를 clamp하지 않는다. `count > items.length`는 `RangeError`다(vectra `pickUnique`의 strict 동작, clamp 변형은 로드맵 범위 밖).
- 가중 인덱스 추출 helper(`weightedRandomIndex`)와 가중 순열(`weightedShuffle`)은 공개하지 않는다. `randomIndex`, `uniqueIndices`, `weightedProbability`, `*Into` 변형, 복원 추출도 로드맵 R5 범위 밖이다(제외 근거는 `docs/product/sampling-requirements.md` 1.2절).
- 검증 근거는 정적 게이트, Node 단위·통계·mutation 테스트, tarball 소비자 fixture다. 실브라우저 실측은 `docs/compatibility.md`에 있다.

다음 단계 범위: R7 상태 facade. `createRandomState(seed?, { source? })`(`RandomSource`를 바인딩한 동일 이름 method)와 `rand`(lazy 초기화되는 module-level facade).

### R7 — 상태 facade

추가:

- `@cp949/random/state`: `createRandomState(seed?, { source? })`(조합 4가지 — seed 없는 상태·seed 상태·주입 상태·충돌 `RangeError`, `readOptions` 관례로 옵션을 읽는다), `rand`(seed 없는 상태 하나, 첫 word 호출 시 `getRandomValues(new Uint32Array(4))` 1회·all-zero 재추출·실패 후 재시도). 타입 `RandomState`(`source` + leaf 11개 method, `this`를 쓰지 않는 클로저라 분해 가능)·`RandomStateOptions`, `SecureRandomUnavailableError`·`RandomSource` 재export. 함수별 계약은 `docs/api/state.md`에 있다.
- method 11개는 root leaf(core 5개, sampling 6개)를 `state.source`로 바인딩하는 얇은 래퍼다. 자체 검증을 하지 않고 인자 검증·오류·word 소비·결과·반환 참조가 leaf와 같다.
- 비공개 `createXoshiro128SourceFromState`(`core/xoshiro128.ts`, `createXoshiro128Source`가 재사용)와 `CryptoLike.getRandomValues`의 `Uint32Array` 제네릭 지원(`internal/crypto.ts`).
- 새 게이트 `check:root-isolation`(`scripts/check-root-isolation.mjs`): 배포 대상 패키지의 `exports` entry마다 값 export 전부를 Vite(rolldown)로 번들해 root 번들에 crypto·ID 표식(`getRandomValues`, `SecureRandomUnavailableError`, `IdCollisionError`, `Uint32Array`)이 없고 `./state`·`./secure`·`./id` 번들에는 각자의 표식이 있는지 양방향으로 검사한다. `pnpm verify` 14단계.
- root entry의 사용성 fixture(`usage-state.ts`, `smoke-state.mjs`)를 tarball 소비자 검증에 추가했다. 값 export 3개의 번들 측정과 한도: `createRandomState` 1,782 B/2,700 B, `rand` 1,784 B/2,700 B, `SecureRandomUnavailableError`(state) 88 B/150 B(`./id`의 재export와 같은 크기). mutation 대상에 `src/state/random-state.ts` 추가(총 30개).
- README 공개 API 표에 root(`.`)와 `./state`를 "구현"으로 갱신했다.

알려진 제한:

- seed 없는 상태·`rand`의 결과값은 재현할 수 없고 계약이 아니며 보안 보증이 없다(token·ID는 `./secure`·`./id`를 쓴다).
- all-zero word 재추출은 상한이 없다(결함 난수원은 위협 모델 밖, `randomInt`·`randomString`과 같은 정책).
- `rand`는 모듈 인스턴스당 하나라 Worker·realm 사이에 공유되지 않고 재seed·fork·스냅샷은 없다(R9 후보).
- method는 leaf를 한 번 더 호출하는 간접 호출이며 성능은 벤치마크 전이라 주장하지 않는다. facade는 bundle 크기 우선 경로가 아니며 크기가 중요하면 root leaf를 단독 import한다.
- 초기화 산식(`Uint32Array(4)` 1회, SplitMix32 미경유)은 고정이며 계약이 아니다. 변경은 CHANGELOG에 기록한다.
- 검증 근거는 정적 게이트, Node 단위·mutation 테스트, Vite 번들 게이트(`check:root-isolation`), tarball 소비자 fixture다. 실브라우저 실측은 `docs/compatibility.md`에 있다.

다음 단계 범위: R8 0.1.0 릴리스 게이트. 컨테이너에서 Chromium 75.0.3765.0 smoke, `apps/demo`의 subpath별 시연, README·API 문서·호환성 매트릭스 정리, scoped 패키지 `publishConfig`와 권한 확인, 배포 tarball 검증, CHANGELOG `Unreleased`를 0.1.0 절로 확정.

### R8 — 0.1.0 릴리스 게이트

추가:

- `packages/legacy-browser-smoke`(`@cp949/legacy-browser-smoke`, private, `verify` 밖 수동 실행): `pnpm smoke:legacy-browser`(Docker, floor 빌드 Chromium)·`pnpm smoke:local-browser`(로컬 Chrome)가 배포 tarball의 dist를 실제 브라우저에서 import·호출해 13개 assertion(exports 계약, xoshiro128** golden vector, `./state`·`./secure`·`./id` 대표 호출, `randomUUID` 부재)을 확인한다.
- `baseline.json`의 `chromium`에 `platform`·`sha256` 추가. `check:baseline`이 smoke runner의 `baseline.mjs` import와 Dockerfile의 리터럴 부재를 함께 검사한다.
- `packages/random/package.json`에 배포 메타데이터(`publishConfig`, `repository`, `homepage`, `bugs`, `keywords`)와 한국어 소비자용 `README.md`를 추가했다. `check:pack`이 README·LICENSE 필수, 배포 메타데이터 필드, tarball 크기 상한(108,000 B)을 검사한다.
- `docs/compatibility.md`: 공식 floor와 실측 표(floor 빌드·현재 빌드·TypeScript 두 lane·Node)를 분리하고 검증 한계를 명시했다. 루트 README와 API 문서 4개가 이 문서를 링크한다.
- `apps/demo`에 subpath 4개(root, `./state`, `./secure`, `./id`) 시연 섹션을 추가했다(로컬 `pnpm dev`만, 배포하지 않는다).

알려진 제한:

- 실측은 Linux x64 1종, Blink 엔진만, 빌드 2개(floor·현재) × 실행 1회, headless, 컨테이너는 sandbox 해제 상태에서 얻었다. Podman은 검증하지 않았다. 실행일 이후 나온 브라우저 갱신은 반영돼 있지 않다. 상세는 `docs/compatibility.md`.
- 0.1.0은 로컬 `npm publish`로 배포한다(첫 publish는 패키지가 npm에 있어야 trusted publisher를 등록할 수 있어 로컬이 강제된다). CI에서 GitHub Actions trusted publishing으로 배포하는 전환은 0.2.0 전 별도 이슈로 등록한다.

다음 단계 범위: 미정. 로드맵의 후속 후보(R9) 중 수요 증거가 확인된 항목을 개별 단계로 승격해 0.2.0에 넣는다.
