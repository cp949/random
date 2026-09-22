# random

브라우저용 ID 생성기와 그 토대인 보안·재현 가능 난수 라이브러리 모노레포. 상태: 프로젝트 기반(검증 게이트), 일반 random(root: 재현 가능한 난수 코어·컬렉션 샘플링), 상태 facade(`@cp949/random/state`), 보안 난수(`@cp949/random/secure`), 무작위 ID·UUID·순환·카운터 ID(`@cp949/random/id`) 구현. 0.1.0은 배포 전이다.

## 공개 API

공개 계약(함수별 입력 검증, 오류, 결과값이 계약인지 여부)은 `docs/api/`에 기록한다.

| subpath                | 상태 | 계약 문서                                                                                            |
| ---------------------- | ---- | ---------------------------------------------------------------------------------------------------- |
| `@cp949/random`        | 구현 | [`docs/api/random-core.md`](docs/api/random-core.md), [`docs/api/sampling.md`](docs/api/sampling.md) |
| `@cp949/random/state`  | 구현 | [`docs/api/state.md`](docs/api/state.md)                                                             |
| `@cp949/random/secure` | 구현 | [`docs/api/secure.md`](docs/api/secure.md)                                                           |
| `@cp949/random/id`     | 구현 | [`docs/api/id.md`](docs/api/id.md), [사용처별 레시피](docs/guides/id-recipes.md)                     |

유사 라이브러리와의 차이와 옮겨올 때 걸리는 점은 [`docs/comparison.md`](docs/comparison.md)에 있다.

`./id`는 값 export 14개와 타입 export 12개를 제공한다. 무작위 ID·UUID 생성, UUID 형식 변환·검사, 순환·카운터 ID가 구현됐다. 순환·카운터 ID는 예측 가능하며 보안 용도가 아니다. UUID는 인증·인가 수단이 아니며 자원 접근 권한은 별도로 검사해야 한다.

`./state`는 값 export 3개와 타입 export 3개를 제공한다. `rand`는 보안 용도가 아니다.

## 구성

| 경로                         | 설명                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `baseline.json`              | Chrome 하한(`chromeFloor`), ES 타깃(`esTarget`), 실측 Chromium 빌드. 하한의 단일 출처     |
| `packages/random`            | npm 배포 대상 단일 패키지 `@cp949/random`                                                 |
| `apps/demo`                  | 라이브러리 데모. Vite, private. 빌드 target은 `baseline.json`에서 읽는다                  |
| `packages/typescript-config` | 공유 tsconfig. `library.json`(라이브러리: ES2019, DOM·전역 타입 없음), `browser.json`(앱) |
| `packages/eslint-config`     | 공유 ESLint 설정. `libraryConfig`(라이브러리 소스 제한), `nodeConfig`(`scripts/`)         |
| `scripts/`                   | 검증 게이트와 그 자체 테스트(`scripts/test/`)                                             |
| `fixtures/`                  | 게이트용 fixture. `dom-usage`(컴파일에 실패해야 함), `consumer`(tarball 소비 검증 템플릿) |

## 검증

`pnpm verify`가 아래 단계를 순서대로 실행하고 CI(`.github/workflows/ci.yml`)도 같은 명령을 쓴다. Chrome 하한은
`baseline.json` 한 곳에서만 선언한다.

| 명령                        | 검사                                                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm lint`                 | 패키지·앱·`scripts/` lint. 라이브러리 소스의 DOM·Node 전역, `Math.random`, 외부 import 금지                                                                                    |
| `pnpm format:check`         | prettier                                                                                                                                                                       |
| `pnpm build --force`        | turbo 캐시 없이 빌드. `build`는 `dist`를 먼저 지운다                                                                                                                           |
| `pnpm check:escompat`       | dist가 `baseline.json`의 Chrome 하한에 없는 ES 문법·API와 DOM·Node 전역을 쓰지 않는지                                                                                          |
| `pnpm check:root-isolation` | subpath마다 값 export 전부를 Vite로 번들해 root 번들에 crypto·ID 표식(`getRandomValues` 등)이 없고 다른 subpath 번들에는 자기 표식이 있는지                                    |
| `pnpm check:baseline`       | `library.json`·vite 설정·smoke runner·Dockerfile이 `baseline.json`과 일치하는지                                                                                                |
| `pnpm check:deps`           | 소스와 tarball의 런타임 의존성이 0인지                                                                                                                                         |
| `pnpm check:no-dom`         | DOM 전역을 쓰는 fixture가 컴파일에 실패하는지                                                                                                                                  |
| `pnpm check-types`          | 라이브러리와 테스트 타입 검사                                                                                                                                                  |
| `pnpm test`                 | 단위 테스트와 게이트 자체 테스트                                                                                                                                               |
| `pnpm check:size-config`    | 값 export마다 번들 한도 항목이 있는지                                                                                                                                          |
| `pnpm size`                 | 번들 한도(size-limit). 항목이 없으면 건너뜀                                                                                                                                    |
| `pnpm check:pack`           | tarball 파일 집합, 필수 파일(README·LICENSE), 배포 메타데이터 필드, 크기 상한, `exports` 대상, `attw`, `publint`                                                               |
| `pnpm check:consumer`       | tarball을 `npm install`해 타입 해석(NodeNext, Bundler, TypeScript 7.x와 하한 5.7.3), `lib.dom` 사용 fixture, crypto 상태 3종(기본·제거·접근 예외)의 import와 런타임 smoke 검증 |

번들 한도는 export마다 측정값(minified + brotli)의 1.5배를 50 B 단위로 올려 정한다. 항목은 `packages/random/.size-limit.json`에 있고, 측정 도구(exact pin)를 올리면 수치를 다시 측정한다.

수동 실행: `pnpm mutation`(Stryker). 대상은 `packages/random/stryker.config.mjs`의 `mutate`이고 점수가 하한(95) 아래면 실패한다. 대상 파일을 직접 커버하는 핵심 테스트는 `describe` 없이 최상위 `it`으로 쓴다. Stryker 10.0.0과 vitest 5.0.1 조합에서 `describe` 안의 테스트는 mutant 실행 때 선택되지 않고 점수가 0%로 나온다(설정 파일 주석 참고). 실브라우저 smoke도 수동이다: `pnpm smoke:legacy-browser`(Docker, floor 빌드 Chromium 75)·`pnpm smoke:local-browser`(로컬 Chrome).

검증 근거는 구분한다. ES2019·Chrome 75 검사는 정적 검사이며, 단위 테스트의 crypto·clock stub은 조건별 동작을 확인한다. `check:consumer`는 Node에서 실제 tarball 설치본의 타입·런타임·레시피를 검사한다. 이 결과는 Chrome 75 실브라우저나 운영 환경에서 실행했다는 증거가 아니다. 실브라우저 실측과 검증 한계는 [`docs/compatibility.md`](docs/compatibility.md)에 있다.

## 확정된 제약

- npm 패키지는 하나만 배포한다. subpath export는 허용한다.
- 패키지 이름은 `@cp949/random`. 버전은 0.1.0부터 시작하고, 0.x 동안 breaking change를 허용한다.
- 브라우저 하한은 Chrome 75. Worker를 고려한다.
- 보안 API는 `globalThis.crypto.getRandomValues()`만 사용한다. `Math.random()`으로 fallback하지 않고, 미지원 환경에서는 오류를 던진다.
- 기본 난수원 요건은 `globalThis.crypto.getRandomValues`다. `uuidv7`과 `timestamp: true`인 무작위 ID는 기본 시계로 `Date.now`도 쓴다. Node 전용 adapter는 두지 않고 `node:crypto`를 import하지 않는다.
- 기본 PRNG는 xoshiro128**, seed 확장은 SplitMix32를 쓴다.
- seed 재현성 계약은 기본 PRNG의 raw 출력 스트림, seed→상태 변환(숫자·문자열 seed 해시 포함), 그 위의 `float`·`bool`·`sign` 산식으로 한정하고 golden vector로 고정한다. 변경은 breaking이다(0.x는 minor bump, 1.0 이후 major). `int`·`uniform`·샘플링·`shuffle` 결과값은 계약이 아니며 알고리즘 개선을 허용하고 CHANGELOG에 기록한다. `getRandomValues` 기반 `RandomSource`는 `./secure`의 `createSecureSource`가 만들고 root entry는 crypto 코드를 포함하지 않는다.
- UUID v7: `uuidv7()`도 단조다. 기본 factory를 lazy 생성해 위임하고 `createUuidv7Factory({ now?, randomBytes? })`로 독립 인스턴스와 테스트 주입을 제공하며 random-only 모드는 두지 않는다. 같은 ms에는 `rand_a` counter를 증가시키고(초기값은 secure random), 고갈 시 대기 없이 timestamp를 +1ms 한다. 현재 시계가 마지막 timestamp보다 10,000ms 이내로 뒤처지면 마지막 timestamp를 이어 쓰고, 그보다 뒤처지면 시계 기준으로 재설정해 그 구간의 단조성은 보장하지 않는다. 시계가 앞서면 새 시각에서 시작한다. 단조성은 인스턴스 단위이며 같은 출력 형식끼리 비교한다. [상세 보장 범위](docs/api/id.md#단조성의-보장-범위)를 따른다.
- `rand`와 seed 없는 `createRandomState()`는 첫 사용 시 1회 `getRandomValues(new Uint32Array(4))`로 xoshiro128** 상태를 초기화한다(all-zero면 재추출). import 시점에는 crypto를 호출하지 않고, `globalThis.crypto.getRandomValues`가 없으면 `SecureRandomUnavailableError`를 던진다. `Math.random()`은 패키지 어디에서도 호출하지 않는다. `rand`는 보안 용도가 아니며 token과 id에는 `./secure`, `./id`를 쓴다.
- 상태 facade 이름은 `RandomState`/`createRandomState`를 유지하고 `Generator`는 공개 이름으로 쓰지 않는다(TS 내장 `Generator` 타입과 혼동). NumPy식 계층 분리는 모듈 구조로 반영하며, raw 출력 스트림 계층의 타입 이름은 spec에서 정한다.
- 파라미터 이름 규칙: `length`는 출력 단위 수(문자열은 문자 수, `randomBytes`는 바이트 수), `byteLength`는 인코딩 전 엔트로피 바이트 수다. `randomId`의 `length`는 접두사, timestamp, 구분자를 뺀 무작위 부분의 문자 수다. 시그니처는 `randomBytes(length)`, `randomHex(byteLength = 32)`, `randomBase64url(byteLength = 32)`(padding 없음), `randomString(alphabet, length)`다.
- `token()`은 두지 않는다. `nanoid(length = 21)`은 alphabet 인자 없이 base64url(URL-safe) 64자(`A-Za-z0-9-_`)를 쓰고, 커스텀 alphabet은 `randomString`으로 통일한다. alphabet에 중복 문자나 짝 없는 surrogate가 있거나 길이가 범위(2~256)를 벗어나면 `RangeError`를 던지고, modulo bias는 rejection sampling으로 제거한다. `randomString`의 alphabet은 코드 포인트 단위(`Array.from` 기준)로 다루고 중복 검사와 크기 범위도 같은 기준이다.
- 확률 분포(`normal` 등)와 저불일치 수열(QMC)은 제공하지 않는다(로드맵 범위 밖). 0.1.0 범위는 일반 random, `./state`, `./secure`, `./id`다.
- ID 생성기의 세부 요구는 `docs/product/id-generator-requirements.md`를 따른다. 순환·카운터 ID도 `() => T` 단일 생성기이며 정의/상태 분리 모델(Cursor)은 두지 않는다. `int32` 프리셋은 `[-2^31, 2^31-1]`, 시작값 0이다. 분산·외부 저장소 기반 ID(Snowflake, external sequence, range allocation)와 어댑터 패키지는 범위 밖이다.
- `./secure`의 공개 함수는 난수원 주입 인자를 받지 않는다. 결정적 테스트는 내부 함수와 `globalThis.crypto` stub으로 한다. 공개 주입은 `./id`의 팩토리 옵션에만 있다(`randomBytes`는 무작위 팩토리가, `now`는 timestamp를 쓰는 팩토리가 받고 순환·카운터 팩토리는 둘 다 쓰지 않는다). 주입 결과에는 보안 보증이 없다.
- 소비자 TypeScript 하한은 5.7이다. `randomBytes`는 `Uint8Array<ArrayBuffer>`를 반환해 `lib.dom`의 `crypto.subtle`에 캐스팅 없이 넘길 수 있고, TS 5.6은 이 표기를 해석하지 못한다(TS2315). 하한은 `pnpm check:consumer`의 하한 lane(devDependency alias `typescript-5.7`, 5.7.3)이 검증한다. 하한 값은 alias 이름, `docs/api/secure.md`, 이 문서에 적혀 있어 올릴 때 함께 고친다.
- subpath는 `exports` 맵으로만 제공한다. 지원 설정은 `moduleResolution`이 `Bundler` 또는 `NodeNext`(`Node16`은 같은 규칙)인 TypeScript와 `exports`를 읽는 번들러다. `node10`(`moduleResolution: node`)과 webpack 4는 지원하지 않는다. 수요가 확인되면 0.x 안에서 `secure/package.json` 스텁이나 `typesVersions`를 비파괴로 추가할 수 있다.

## 명령

```sh
pnpm install
pnpm build         # packages/random 빌드 후 apps/demo 빌드
pnpm check-types
pnpm lint
pnpm test          # 단위 테스트와 게이트 자체 테스트
pnpm verify        # 모든 검증("검증" 절)
pnpm dev           # packages/random 빌드 후 apps/demo 개발 서버
pnpm smoke:legacy-browser  # Docker, floor 빌드 Chromium(수동)
pnpm smoke:local-browser   # 로컬 Chrome(수동)
```

## 라이선스

MIT. [LICENSE](LICENSE) 참조.
