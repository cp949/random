# 0.1.0 릴리스 게이트 요구사항

- 상태: 승인 (2026-09-22)
- 작성일: 2026-09-22
- 확정 경로: 설계 인터뷰(grilling) 2라운드(22문항)로 결정을 확정했다. 결정과 근거는 9절 결정 기록에 있다.
- 대상: `@cp949/random` 0.1.0 릴리스. 로드맵 R8의 design spec이다. 공개 API는 없고 릴리스 게이트(실브라우저 smoke, 배포 tarball, 문서, 절차)와 그 증거를 확정한다. 0.1.0 이후 릴리스도 7절 절차와 6절 매트릭스 스키마를 재사용한다.
- 출처: 로드맵 §1 "호환성을 증거로 보증한다", §3 R8, §4 릴리스 판정, §5 호환 기준선 갱신, §6 릴리스 매핑. 기존 게이트(`scripts/check-*.mjs`)와 `baseline.json` 단일 출처 위에 얹는다. 참고 자료: 레거시 크롬 지원 가이드(gist `cp949/0e4e5704412e0540ec63341bd7b7db3d`, `chrome75-legacy-browser-support.md`)와 geul의 Chrome 83 컨테이너 실측(`/work/cp949/geul/docker/chrome83/Dockerfile`, `playwright.config.ts`의 `chrome83` 프로젝트, `docs/adr/0008`, `0009`, `docs/guides/G-WKS-005`~`007`).
- 이 문서가 정하지 않는 것: snapshot zip의 sha256 값과 tarball 크기 상한 수치(첫 측정 뒤 기록), 실측 결과값(실행 뒤 매트릭스에 기록), 오류 문구, Dockerfile이 설치하는 시스템 라이브러리 목록(실행으로 확정).

## 1. 목적과 범위

소비자가 npm에서 `@cp949/random@0.1.0`을 설치해 문서대로 쓴다. 완료는 publish 뒤 `npm view @cp949/random@0.1.0`으로 확인한 시점이다. 그 전에 실제 Chromium 75.0.3765.0과 현재 Chrome에서 배포 tarball의 dist를 그대로 실행한 증거를 남기고, 소비자용 README·호환성 매트릭스·CHANGELOG 0.1.0 절을 확정한다.

### 1.1 포함

로드맵 R8 범위 5항목을 한 작업(`r8-release`)으로 진행한다.

- 실브라우저 smoke: `@cp949/legacy-browser-smoke`(3~4절). 컨테이너의 Chromium 75.0.3765.0(floor 빌드)과 로컬 Google Chrome(현재 빌드) 두 실행.
- `apps/demo`의 subpath별 시연(5.4).
- 소비자용 `packages/random/README.md`, `docs/compatibility.md`, API 문서 링크, 루트 README 갱신(6절).
- `packages/random/package.json` 배포 메타데이터와 `check:pack` 강화(5절).
- CHANGELOG `Unreleased` → `[0.1.0]` 확정, 릴리스 절차(7절), publish·tag.

### 1.2 제외

추가하려면 로드맵 §1의 기능 추가 판정 기준과 사용자 승인이 필요하다.

| 항목                                         | 제외 이유                                                                                                                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI publish(GitHub Actions, OIDC, provenance) | 첫 publish는 패키지가 npm에 있어야 trusted publisher를 등록할 수 있어 로컬이 강제된다. 마무리 때 GitHub Issue로 등록한다(사용자 승인 후).                                                                     |
| GitHub Release 객체                          | release note는 CHANGELOG `[0.1.0]` 절 하나다. 형제 저장소(`@cp949/*`)도 tag만 쓴다.                                                                                                                           |
| `apps/demo` 배포(GitHub Pages 등)            | 로드맵 R8은 "subpath별 시연"이다. 배포는 CI 표면을 넓힌다.                                                                                                                                                    |
| smoke의 상시 CI 실행                         | 로드맵 §4 "상시 CI 게이트로 넣지 않는다". `verify` 밖의 수동 스크립트다(3.2).                                                                                                                                 |
| Podman 지원                                  | Docker 고정. Podman은 매트릭스 "검증 한계"에 미검증으로 적는다.                                                                                                                                               |
| Linux 외 OS·Blink 외 엔진 표본               | 표본을 얻을 수단이 없다. 로드맵 §2 "Firefox와 Safari는 보증하지 않는다".                                                                                                                                      |
| 영어 README                                  | 저장소 문서와 API 계약이 전부 한국어라 README도 한국어다. 링크 너머에서 언어가 끊기지 않는다.                                                                                                                 |
| changesets 등 릴리스 도구                    | 단일 패키지, 0.x. CHANGELOG는 손으로 쓴다.                                                                                                                                                                    |
| puppeteer·playwright 기본 채택               | dist를 있는 그대로 headless flag로 실행한다. Playwright와 최신 Puppeteer는 CDP `Browser.setDownloadBehavior`(Chrome 82+)를 무조건 호출해 75에 붙지 못한다. fallback은 4.5(raw CDP → `puppeteer-core@1.15.0`). |
| vitest·통계 테스트의 브라우저 실행           | Chromium 75에서 vitest browser mode를 쓸 수 없다. 통계·mutation은 Node 테스트가 담당하고 smoke는 "그 빌드에서 dist가 실행된다"만 증명한다.                                                                    |
| `engines`, `author` 필드                     | 소비자 런타임은 브라우저라 Node engines를 걸지 않는다. author는 npm이 publisher를 표시한다.                                                                                                                   |
| 기존 소비자 migration                        | 로드맵 §2.                                                                                                                                                                                                    |

## 2. 용어

- 공식 floor: 보증하는 최소 브라우저. `baseline.json`의 `chromeFloor`(75).
- floor 빌드: 실제로 실행하는 고정 Chromium 빌드. `baseline.json`의 `chromium`(version `75.0.3765.0`, revision `650583`, chromium-browser-snapshots `Linux_x64`).
- 현재 빌드: smoke를 실행하는 시점에 로컬에 설치된 Google Chrome stable. 버전은 실행 때 `--version`으로 읽는다.
- 실측 버전: smoke가 실제로 통과한 빌드의 UA 버전 문자열. 공식 floor와 분리해 기록한다(로드맵 §1).
- smoke: 배포 tarball의 dist를 브라우저에서 import·호출해 4.3의 assertion을 검사하는 실행. 게이트(`check:*`, `verify`)가 아니라 릴리스 게이트다.
- runner: smoke를 준비·실행·판정하는 Node 스크립트(`packages/legacy-browser-smoke/src/run.mjs`).
- smoke 페이지: 브라우저 안에서 assertion을 실행하고 결과를 DOM에 쓰는 HTML + JS(`packages/legacy-browser-smoke/page/`).
- tarball: `scripts/pack.mjs`의 `packPackage`가 만드는 `npm pack` 산출물. `check:pack`과 같은 파일이다.
- 검증 한계: 실측이 증명하지 않는 것(OS, 엔진, 표본 수, headless, sandbox 해제 등). 매트릭스에 명시한다.

## 3. 구성

### 3.1 새 패키지 `packages/legacy-browser-smoke`

- `package.json`: name `@cp949/legacy-browser-smoke`, `private: true`(`listPublishablePackages`가 배포 게이트 대상에서 제외한다), `type: module`, 런타임 의존성 0. devDependencies는 lint 설정과 vitest뿐이다(4.5 fallback 2단계 채택 시에만 `puppeteer-core@1.15.0` 추가).
- 파일: `Dockerfile`, `src/run.mjs`(runner), `src/serve.mjs`(정적 서버, 컨테이너·로컬 공용), `src/container-entry.mjs`(컨테이너 안에서 서버 기동 → Chromium 실행 → 결과 출력), `page/index.html`, `page/smoke.js`(assertion), `test/*.test.mjs`(runner의 파싱·판정·요약 형식 단위 테스트).
- 루트 `vitest.config.ts`의 `projects`에 `packages/legacy-browser-smoke`를 추가한다. 컨테이너·브라우저를 띄우는 테스트는 없다(단위 테스트만).
- lint: `@repo/eslint-config/node`(runner, 서버, entry)와 `@repo/eslint-config/browser`(페이지). 페이지 파일에는 `scripts/escompat-rules.mjs`의 `rulesAllowedAt(chromeFloor)`로 `eslint-plugin-es-x` 규칙을 켠다 — 페이지 자체가 Chrome 75 문법을 넘으면 smoke가 실행되지 않아 결과 없음(FAIL)으로 끝나지만, lint가 원인을 먼저 보여 준다. 최종 판정은 실행이다.

### 3.2 루트 스크립트

- `smoke:legacy-browser`: `node packages/legacy-browser-smoke/src/run.mjs --target container`
- `smoke:local-browser`: `node packages/legacy-browser-smoke/src/run.mjs --target local`
- 둘 다 `verify` 밖이다. `check:` 접두사를 쓰지 않는다. `scripts/test/verify.test.mjs`의 `MANUAL` 집합에 두 이름을 추가한다(verify 밖 스크립트는 그 집합에 명시해야 테스트가 통과한다).

### 3.3 `baseline.json` 확장

`chromium`에 `platform`(chromium-browser-snapshots 디렉터리 이름, `"Linux_x64"`)과 `sha256`(`chrome-linux.zip`의 SHA-256 소문자 hex 64자)을 추가한다. `scripts/baseline.mjs`의 `CHROMIUM_KEYS`와 검증(`platform`: `/^[A-Za-z0-9_]+$/`, `sha256`: `/^[0-9a-f]{64}$/`)을 확장하고 `scripts/test/baseline.test.mjs`에 새 키의 거부·수용 사례를 추가한다. 로드맵 §5가 revision 갱신을 baseline 한 곳에서 하므로 sha256도 함께 움직인다. 값은 `baseline.json`이 출처다(DELTA-01 완료, 2026-09-22).

### 3.4 기존 게이트 확장

- `check:baseline`(`scripts/check-baseline.mjs`): (1) `packages/legacy-browser-smoke/src/run.mjs`가 `scripts/baseline.mjs`를 import한다(줄 앞 `import … from "…baseline.mjs"` 정규식, demo vite config 검사와 같은 방식). (2) `packages/legacy-browser-smoke/Dockerfile`에 `chromium.version`, `chromium.revision`, `chromium.sha256` 값이 리터럴로 없다(값은 `--build-arg`로만 들어간다). 자체 테스트를 `scripts/test/check-baseline.test.mjs`에 추가한다.
- `check:pack`(`scripts/check-pack.mjs`): 5.3.

## 4. smoke 요구

### 4.1 SM-1 이미지

- base는 `node:24-bullseye-slim`(정적 서버용 Node. 2019년 빌드와 라이브러리 세대가 가까운 Debian 11을 우선한다). `ldd`로 확인한 누락 라이브러리를 bullseye가 제공하지 못하면 `debian:buster-slim` + Node tarball(`/work/cp949/geul/docker/chrome83/Dockerfile` 방식, `snapshot.debian.org` apt 소스)로 바꾼다. `ARG CHROMIUM_PLATFORM`, `ARG CHROMIUM_REVISION`, `ARG CHROMIUM_SHA256`을 받아 `https://commondatastorage.googleapis.com/chromium-browser-snapshots/<platform>/<revision>/chrome-linux.zip`을 내려받고 `sha256sum -c`로 대조한 뒤 푼다. 값이 하나라도 없으면 build가 실패한다. 이미지는 라이브러리를 포함하지 않는다.
- 실행 시 runner가 tarball 해제본(`_tmp/legacy-browser-smoke/package/`)과 페이지·기대값 디렉터리를 읽기 전용 bind mount(`/smoke/pkg`, `/smoke/page`)로 넘긴다. 이미지는 Dockerfile·baseline이 바뀔 때만 다시 빌드된다(레이어 캐시).
- 컨테이너 안 실행 flag: `--headless --disable-gpu --no-sandbox --virtual-time-budget=10000 --dump-dom http://127.0.0.1:<port>/?<query>`. `--no-sandbox`는 컨테이너에 user namespace가 없어서 필요하며 JS 의미론과 무관하다(검증 한계에 적는다).

### 4.2 SM-2 runner

`node packages/legacy-browser-smoke/src/run.mjs --target container|local [--chrome <경로>]`.

1. `packages/random/dist`가 없으면 실패한다(빌드는 하지 않는다. 7절 절차가 `pnpm verify`를 먼저 실행한다).
2. `packPackage`(`scripts/pack.mjs`)로 tarball을 만들어 `_tmp/legacy-browser-smoke/package/`에 푼다. `check:pack`과 같은 산출물이다.
3. `packages/random/package.json`의 `exports` 키를 읽어 entry마다 `dist/<entry>/index.js`를 Node로 import하고 `{ [entry]: { [exportName]: typeof } }`를 `expected-exports.json`으로 쓴다. 목록을 손으로 적지 않으므로 subpath·export가 늘어도 smoke가 따라간다.
4. `--target container`: `loadBaseline()`으로 읽은 `chromium`을 `--build-arg`로 넘겨 `docker build`, 이어서 `docker run --rm`(bind mount, 기대값은 `-e SMOKE_EXPECT_RANDOM_UUID=false -e SMOKE_EXPECT_CHROME_VERSION=<chromium.version>`). `--target local`: `<chrome> --version`을 실행해 버전을 읽고(기본 `google-chrome`), host에서 `serve.mjs`를 임시 포트로 띄운 뒤 같은 flag에 임시 `--user-data-dir`를 더해 실행한다(`SMOKE_EXPECT_RANDOM_UUID=true`).
5. stdout에서 `<pre id="result">…</pre>`의 JSON을 파싱한다. 결과 요소가 없거나 JSON이 아니면 FAIL이다(결과 없음 = 실패, fail-closed). 프로세스 상한 시간은 120초다.
6. 요약을 한 줄로 출력하고 종료 코드를 정한다(4.4).

### 4.3 SM-3 assertion

페이지는 query `expectRandomUUID`(`true`|`false`), `expectChromeVersion`을 받고 `/expected-exports.json`을 fetch한다. entry 4개는 `import()`로 각각 로드해 하나가 실패해도 나머지 결과를 남긴다. 페이지 자체는 Chrome 75 문법·API만 쓴다(`Promise.allSettled`, `?.`, `??`, top-level `await` 금지).

| ID  | 검사                                                                                                                                                                                                                  | 근거                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| A1  | `typeof crypto.randomUUID`가 기대와 같다(floor 빌드: `"undefined"`, 현재 빌드: `"function"`).                                                                                                                         | 로드맵 R8 완료 조건. "정말 randomUUID 없는 빌드"                  |
| A2  | `typeof globalThis.crypto.getRandomValues === "function"`, `getCryptoCapabilities().getRandomValues === true`.                                                                                                        | `./secure` 런타임 요건                                            |
| A3  | `navigator.userAgent`의 `Chrome/`·`HeadlessChrome/` 뒤 major 버전이 `expectChromeVersion`의 major와 같다(Chrome 110+의 UA Reduction이 전체 버전을 `<major>.0.0.0`으로 고정하므로 major만 비교한다, DELTA-04 결정).    | 실측 버전 = baseline 값의 증거                                    |
| A4  | `/pkg/dist/index.js`, `secure/index.js`, `id/index.js`, `state/index.js`의 `import()`가 성공한다.                                                                                                                     | 4 subpath 실행                                                    |
| A5  | entry마다 export 키 집합과 각 export의 `typeof`가 `expected-exports.json`과 같다.                                                                                                                                     | 누락·형태 변경 검출(현재 19·8·14·3개)                             |
| A6  | `createXoshiro128Source(42)` 첫 5 word = `[3514831625, 2416850046, 1824449730, 3924724315, 1889077669]`, `createXoshiro128Source("hello")` 첫 5 word = `[2966572188, 3720780506, 139503483, 3335792593, 1040972122]`. | 재현성 계약이 실브라우저 V8에서 같다(`xoshiro128.test.ts` golden) |
| A7  | `createRandomState(42).int(1, 100)`이 `int(createXoshiro128Source(42), 1, 100)`과 같다.                                                                                                                               | `./state` 바인딩                                                  |
| A8  | `uuidv4()`가 v4 정규식(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)에 맞고 `isUuid`가 true, `parseUuid` 길이 16, `stringifyUuid` round-trip이 같다.                                       | `./id`의 getRandomValues 경로                                     |
| A9  | `randomBytes(65537).length === 65537`이고 모든 바이트가 0은 아니다.                                                                                                                                                   | 65,536 chunk 경계                                                 |
| A10 | `rand.int(1, 6)`이 `[1, 6]` 정수, `rand.float()`가 `[0, 1)`.                                                                                                                                                          | lazy 초기화가 실브라우저에서 동작                                 |
| A11 | `createCyclicIdFactory({ preset: "int32", start: 2147483647 })`가 `2147483647` 다음 `-2147483648`.                                                                                                                    | 순환 ID wrap                                                      |
| A12 | `createSecureSource()()`가 `[0, 2^32)` 정수.                                                                                                                                                                          | 합성 지점                                                         |
| A13 | `nanoid()` 길이 21·`^[A-Za-z0-9_-]{21}$`, `randomId()`가 비어 있지 않은 문자열.                                                                                                                                       | leaf·편의 진입점                                                  |

0.1.0 이후 subpath나 대표 함수가 늘면 A4·A5는 자동으로 따라가고, 대표 호출은 이 표에 행을 추가한다.

### 4.4 SM-4 결과와 요약

- 페이지는 `<pre id="result">`에 `{ "userAgent", "assertions": [{ "id", "ok", "detail" }], "ok" }` JSON을 쓰고 `document.title`을 `SMOKE PASS`/`SMOKE FAIL`로 바꾼다. 예외는 잡아서 해당 assertion의 `detail`에 넣는다.
- runner 요약 한 줄(매트릭스에 옮겨 적는 값):

```text
smoke: target=container chrome=75.0.3765.0 platform=Linux_x64 os=<uname -sm> headless=true date=2026-09-22 assertions=13/13 result=PASS
smoke: target=local chrome=152.0.7977.64 platform=host os=<uname -sm> headless=true date=2026-09-22 assertions=13/13 result=PASS
```

- 실패한 assertion은 요약 아래 `id: detail` 형식으로 전부 출력한다. 종료 코드는 PASS 0, 그 외 1.

### 4.5 SM-5 fallback

`--virtual-time-budget` + `--dump-dom`이 `import()`·fetch 뒤의 비동기 결과를 담지 못하면(결과 요소가 비어 있음) 실행기만 바꾼다. 페이지·assertion·요약 형식은 그대로다. 순서:

1. raw CDP(의존성 0): `--remote-debugging-port=<port>`로 띄우고 `http://127.0.0.1:<port>/json`에서 page target의 `webSocketDebuggerUrl`을 읽어 Node 24 내장 `WebSocket`으로 `Page.navigate` → `Runtime.evaluate("document.title")`를 `SMOKE PASS|FAIL`이 될 때까지 폴링 → `Runtime.evaluate`로 `#result` textContent 회수. Chrome 75의 `Page`·`Runtime` 도메인은 이 용도에 충분하다(Playwright가 못 붙는 이유는 `Browser.setDownloadBehavior` 하나다).
2. `puppeteer-core@1.15.0`(75.0.3765.0을 번들했던 버전, `executablePath` 지정). 1이 프로토콜 문제로 막힐 때만.

채택 여부와 근거는 작업 폴더 DELTA의 "## 결정"에 남기고, 채택하면 이 절과 3.1의 의존성 문장을 고친다.

## 5. 패키지·tarball·demo 요구

### 5.1 PK-1 `packages/random/package.json`

추가: `publishConfig: { "access": "public" }`, `repository: { "type": "git", "url": "git+https://github.com/cp949/random.git", "directory": "packages/random" }`, `homepage: "https://github.com/cp949/random#readme"`, `bugs: { "url": "https://github.com/cp949/random/issues" }`, `keywords: ["random", "prng", "xoshiro128", "seed", "uuid", "nanoid", "secure-random", "browser", "esm"]`. 유지: `version 0.1.0`, `license MIT`, `sideEffects false`, `files ["dist"]`, exports 4개. 추가하지 않음: `engines`, `author`, 최상위 `types`(exports의 `types` 조건으로 충분, `attw`·`check:pack`이 확인).

### 5.2 PK-2 `packages/random/README.md`

한국어, 소비자용. 절: 설치(`pnpm add @cp949/random`), 요건(Chrome 75 이상, TypeScript 5.7 이상, `exports` 전용 ESM — `moduleResolution` `Bundler`/`NodeNext`), subpath 4개 표(경로, 용도, 난수원 요건), subpath별 예제 1개씩(seed 재현·`rand`, `randomHex`, `uuidv4`·`randomId`, `createCyclicIdFactory`), 종류 구분 경고(`rand`·seed 난수는 보안 용도 아님, UUID는 인가 수단 아님, 순환 ID는 예측 가능), 문서 링크(`docs/api/*.md`, `docs/compatibility.md`, `docs/guides/id-recipes.md` — GitHub 절대 URL), 라이선스. 루트 `README.md`는 기여자용으로 유지한다.

### 5.3 PK-3 `check:pack` 강화

- tarball에 `README.md`와 `LICENSE`가 있어야 한다(현재는 허용만 하고 요구하지 않는다).
- `package.json`에 `publishConfig.access === "public"`, `repository.url`, `repository.directory`, `homepage`, `bugs.url`, 비어 있지 않은 `keywords`, `license`가 있어야 한다.
- tarball 크기 상한 `MAX_TARBALL_BYTES`: 첫 측정값의 1.5배를 1,000 B 단위로 올린 값. 실수로 들어간 파일을 잡는 용도라 여유를 크게 둔다. 첫 측정값 71,491 B(2026-09-22, 배포 메타데이터·README 포함 후) → 상한 108,000 B(`scripts/check-pack.mjs`).
- 자체 테스트(`scripts/test/check-pack.test.mjs`)에 README 누락·필드 누락·상한 초과 fixture를 추가한다.
- 로드맵 완료 조건 "`npm pack --dry-run`이 LICENSE, dist, package.json, README를 포함"은 `check:pack`(실제 pack)이 상시 검증하고, 7절 절차에서 `npm pack --dry-run` 출력을 한 번 더 눈으로 확인한다.

### 5.4 DM-1 `apps/demo`

`src/main.ts`가 subpath 4개를 import해 섹션 4개를 그린다. 각 섹션은 입력·버튼·출력 영역 하나씩이다.

| 섹션       | 동작                                                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| root       | seed 입력 → `source = createXoshiro128Source(seed)`로 `int(source, 1, 100)` 10개, `shuffle(source, [1..10])` 출력. 같은 seed는 같은 출력. |
| `./state`  | `rand.int(1, 6)` 버튼(주사위), `createRandomState(seed)` 결과가 root 섹션과 같음을 표시.                                                  |
| `./secure` | `randomHex(16)`, `randomBase64url(16)`, `randomInt(1, 100)` 버튼. crypto가 없으면 `SecureRandomUnavailableError` 메시지 표시.             |
| `./id`     | `uuidv4()`, `uuidv7()`, `nanoid()`, `randomId({ prefix: "req" })`, `createCyclicIdFactory({ preset: "int32" })` 연속 호출 출력.           |

배포하지 않는다. `pnpm dev`로만 본다. vite `build.target`은 그대로 `baseline.json`에서 파생한다.

## 6. 문서 요구

### 6.1 DOC-1 `docs/compatibility.md`

절 순서와 스키마를 고정한다. 0.1.0 이후 릴리스마다 실측 표의 행을 갱신한다.

1. 공식 floor: Chrome(Blink) 75 이상. Firefox·Safari 보증 없음. 근거: `baseline.json`, 정적 게이트(`check:escompat`, `check:no-dom`), tsconfig target.
2. 실측 표. 열: 대상 / 버전 / 엔진 / OS / 실행 방식 / 실행일 / 결과 / 근거 명령.

| 대상                 | 버전           | 엔진     | OS        | 실행 방식                                    | 실행일   | 결과 | 근거 명령                   |
| -------------------- | -------------- | -------- | --------- | -------------------------------------------- | -------- | ---- | --------------------------- |
| Chromium floor 빌드  | 75.0.3765.0    | Blink/V8 | Linux x64 | Docker 컨테이너, headless                    | (실행일) | PASS | `pnpm smoke:legacy-browser` |
| Google Chrome 현재   | (실행 시 버전) | Blink/V8 | Linux x64 | 로컬 설치본, headless                        | (실행일) | PASS | `pnpm smoke:local-browser`  |
| TypeScript 하한 lane | 5.7.3          | —        | Linux x64 | `check:consumer`(NodeNext·Bundler)           | (실행일) | PASS | `pnpm check:consumer`       |
| TypeScript 저장소    | 6.0.3          | —        | Linux x64 | 같음                                         | (실행일) | PASS | `pnpm check:consumer`       |
| Node                 | 24.x           | V8       | Linux x64 | 단위·게이트 테스트 실행 환경(보증 대상 아님) | (실행일) | PASS | `pnpm verify`               |

3. 보증하지 않는 것: Firefox, Safari, Node 런타임(테스트 환경일 뿐), `node10` resolution, webpack 4.
4. 검증 한계: OS 1종(Linux x64), 엔진 Blink만, 표본은 빌드 2개 × 실행 1회, headless, 컨테이너는 sandbox 해제, 통계·mutation 테스트는 Node에서만, 실행일 이후의 브라우저 갱신은 반영되지 않음, Podman 미검증.
5. 갱신 절차: 로드맵 §5 링크. 실측 값은 runner 요약 줄(4.4)에서 손으로 옮긴다(생성 파일을 커밋하지 않는다).

### 6.2 DOC-2 루트 `README.md`

- "검증" 절의 수동 실행 문단에 `pnpm smoke:legacy-browser`·`pnpm smoke:local-browser`를 추가하고 `docs/compatibility.md`를 링크한다. "검증 근거는 구분한다" 문단의 "실브라우저 실행 증거가 아니다" 문장 뒤에 "실브라우저 증거는 `docs/compatibility.md`"를 덧붙인다.
- "확정된 제약"은 바꾸지 않는다.

### 6.3 DOC-3 API 문서

`docs/api/random-core.md`, `secure.md`, `id.md`, `state.md`의 "사용 환경"에 한 문장을 추가한다: "실브라우저 실측과 검증 한계는 `docs/compatibility.md`에 있다." `sampling.md`는 `random-core.md`를 참조하므로 고치지 않는다.

### 6.4 DOC-4 `CHANGELOG.md`

- 도입문을 "버전 절 위에 `Unreleased`를 두고 릴리스 때 버전 절로 확정한다"로 바꾼다.
- `## Unreleased`(비어 있음) 아래에 `## [0.1.0] - <publish 날짜>`를 둔다. 절 상단에 소비자 관점 요약 세 단락: "추가"(subpath별 한 줄씩), "알려진 제한"(R0~R8의 제한을 통합·중복 제거), "다음 릴리스 범위"(미정. 로드맵 후속 후보 중 승격된 항목). 이 요약이 release note다.
- 그 아래 기존 `### R0`~`### R7` 절을 그대로 두고 `### R8 — 0.1.0 릴리스 게이트` 절을 같은 형식으로 추가한다.
- 각 절의 "Chrome 75 실브라우저 실행은 R8 범위다" 문장은 "실브라우저 실측은 `docs/compatibility.md`"로 바꾼다.

### 6.5 DOC-5 로드맵

R8 본문은 고치지 않는다. publish 확인 뒤 `**상태:** 완료 (YYYY-MM-DD)` 한 줄만 추가한다(7절 10단계).

## 7. 릴리스 절차

매 릴리스 이 순서로 실행한다. 주체가 "사용자"인 단계는 에이전트가 실행하지 않는다(`main` 작업 금지, publish는 외부 공개·되돌릴 수 없음, `npm login`·OTP는 대화형).

| #   | 주체     | 단계                                                                                                                                            |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 에이전트 | 작업 브랜치에서 `pnpm verify` 통과.                                                                                                             |
| 2   | 에이전트 | `pnpm smoke:legacy-browser`, `pnpm smoke:local-browser` PASS. 요약 줄을 `docs/compatibility.md` 실측 표에 옮긴다.                               |
| 3   | 에이전트 | `npm pack --dry-run`(`packages/random`) 출력에 `LICENSE`, `README.md`, `package.json`, `dist/**`만 있는지 확인.                                 |
| 4   | 에이전트 | CHANGELOG `[0.1.0] - <날짜>` 확정. 재그룹화 후 `dev`에 ff 병합(rubber-workflow). 로드맵 R8은 아직 미완료.                                       |
| 5   | 사용자   | `dev` → `main` ff 병합, `main` push.                                                                                                            |
| 6   | 사용자   | `main` checkout에서 `! npm login`(현재 `~/.npmrc` 토큰은 401), `! pnpm verify`.                                                                 |
| 7   | 에이전트 | `packages/random`에서 `npm publish --dry-run` 실행·출력 검토(파일 목록, 크기, `access: public`).                                                |
| 8   | 사용자   | `! npm publish`(`packages/random`). OTP 프롬프트 처리.                                                                                          |
| 9   | 에이전트 | `npm view @cp949/random@0.1.0 version dist.tarball` 확인. 사용자: `git tag v0.1.0 && git push origin v0.1.0`.                                   |
| 10  | 에이전트 | `dev`에 로드맵 `**상태:** 완료 (날짜)` 한 줄 커밋(rubber-workflow 없이 바로). CHANGELOG 날짜가 실제 publish 날짜와 다르면 같은 커밋에서 고친다. |
| 11  | 에이전트 | 마무리: CI publish(OIDC·provenance) 후속을 GitHub Issue 초안으로 제시(사용자 승인 후 `gh issue create`).                                        |

## 8. 보장과 검증

로드맵 R8 완료 조건과 §4 릴리스 판정을 증거에 대응시킨다.

| 조건                                                                                                     | 증거                                                                                                                        |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| smoke가 Chromium 75.0.3765.0에서 통과하고 `typeof crypto.randomUUID === "undefined"`를 스스로 assert한다 | `pnpm smoke:legacy-browser` PASS(A1·A3 포함). 요약 줄이 `docs/compatibility.md`에 기록된다.                                 |
| `npm pack --dry-run`이 LICENSE, dist, package.json, README를 포함한다                                    | `check:pack`(README·LICENSE 필수, 허용 집합, 상한) + 7절 3단계.                                                             |
| 배포된 exports와 import 계약이 fixture 앱에서 검증된다                                                   | `check:consumer`(TS 6.0.3·5.7.3, NodeNext·Bundler, crypto 3상태). 이미 충족.                                                |
| release note에 알려진 제한과 다음 단계 범위가 기록된다                                                   | CHANGELOG `[0.1.0]` 요약 단락.                                                                                              |
| 정적 게이트·테스트·tarball fixture·의존성 0(§4)                                                          | `pnpm verify` 14단계 + 새 자체 테스트(baseline 키, check-baseline smoke 검사, check-pack 강화, verify MANUAL, runner 단위). |
| 새 공개 API의 계약 문서(§4)                                                                              | 새 공개 API 없음. 배포 메타데이터·매트릭스·README는 6절.                                                                    |
| 실제 Chromium 75 실행은 릴리스 게이트(§4)                                                                | 7절 2단계. `verify`·CI에 넣지 않는다.                                                                                       |

계약 여부: 이 문서의 assertion 목록(4.3)과 매트릭스 스키마(6.1)는 릴리스마다 유지하는 추적 대상이다. 실측 값·실행일·현재 빌드 버전은 계약이 아니다.

## 9. 결정 기록

2026-09-22 확정.

| 결정                    | 내용                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R8 완료 정의            | 실제 publish + `npm view` 확인까지. 로드맵 §4가 실기 실행을 릴리스 게이트로 두므로 게이트 통과와 publish는 한 사건이다. 완료 표시는 publish 뒤 커밋.                                                                                                                                                                                                                                                                   |
| publish 경로            | 0.1.0은 로컬 `npm publish`. trusted publisher 등록은 패키지가 존재해야 가능해 첫 회는 로컬이 강제된다. CI publish는 Issue.                                                                                                                                                                                                                                                                                             |
| tag·release note        | `main`에 `v0.1.0`(형제 저장소 관행). release note = CHANGELOG `[0.1.0]` 요약. GitHub Release 없음.                                                                                                                                                                                                                                                                                                                     |
| design spec             | 이 문서. 매트릭스 스키마와 assertion 목록이 0.1.0 이후 재사용되므로 추적 문서가 필요하다. 릴리스 절차는 별도 runbook 없이 7절에 둔다(0.1.0 시점 분량·독자가 같다).                                                                                                                                                                                                                                                     |
| README 언어             | 한국어. 저장소 문서 전부가 한국어라 링크 너머에서 언어가 끊기지 않는다.                                                                                                                                                                                                                                                                                                                                                |
| 실측 표본               | floor 빌드(컨테이너) + 현재 빌드(로컬 Chrome) 2행. 같은 페이지·같은 tarball·같은 flag. 다른 OS·엔진은 표본을 얻을 수 없다.                                                                                                                                                                                                                                                                                             |
| 컨테이너 런타임         | Docker 고정. Podman은 미검증으로 기록.                                                                                                                                                                                                                                                                                                                                                                                 |
| smoke 패키지 위치       | `packages/legacy-browser-smoke`, `private: true`. 로드맵 이름이 scoped 패키지 형태. private가 빠지면 `check:pack`·`check:deps`가 pack하려 든다.                                                                                                                                                                                                                                                                        |
| 스크립트 이름·배선      | `smoke:legacy-browser`·`smoke:local-browser`, verify 밖, `check:` 접두사 없음. `verify.test.mjs` `MANUAL`에 등록. "게이트 = `check:*` = verify 포함" 규칙에 예외를 만들지 않는다.                                                                                                                                                                                                                                      |
| 실행 구조               | 자족 컨테이너 + tarball bind mount + Node 정적 서버 + `dist/*.js` 상대 경로 `import()` + headless `--dump-dom`. import map은 Chrome 89+, `file://` module import는 CORS 차단이라 서버가 필요하다. 번들러·CDP 라이브러리 없음 — "dist를 있는 그대로"가 증거의 핵심. 참고: geul(`/work/cp949/geul`)은 Playwright 제약으로 실측을 83으로 대체했는데 이 저장소는 CDP 라이브러리를 쓰지 않아 75.0.3765.0을 그대로 실행한다. |
| 이미지와 tarball 분리   | 이미지는 Chromium만, tarball은 실행 시 mount. 릴리스마다 이미지를 다시 빌드하지 않는다.                                                                                                                                                                                                                                                                                                                                |
| assertion 범위          | 4.3의 13개. export 집합은 runner가 Node에서 생성한 기대값과 대조(손으로 적지 않음). golden vector 2개로 재현성 계약의 엔진 독립성을 증명. 통계 테스트는 넣지 않는다.                                                                                                                                                                                                                                                   |
| 매트릭스                | `docs/compatibility.md` 신규, 6.1 스키마, 수동 전기. 생성 파일 커밋 없음.                                                                                                                                                                                                                                                                                                                                              |
| README 분리             | 소비자용 `packages/random/README.md` 신규, 루트는 기여자용. 독자가 다르다.                                                                                                                                                                                                                                                                                                                                             |
| package.json 메타데이터 | `publishConfig`·`repository`·`homepage`·`bugs`·`keywords` 추가, `engines`·`author` 생략. `check:pack`이 존재를 강제.                                                                                                                                                                                                                                                                                                   |
| tarball 크기 상한       | R8에서 측정값 기준으로 정한다(1.5배, 1,000 B 단위 올림).                                                                                                                                                                                                                                                                                                                                                               |
| CHANGELOG 형식          | `Unreleased` → `[0.1.0]`, 단계 절 유지 + 상단 소비자 요약, "R8 범위다" 문장 정리, 빈 `Unreleased` 유지.                                                                                                                                                                                                                                                                                                                |
| demo                    | subpath 4 섹션, 로컬 `pnpm dev`만. 배포 없음.                                                                                                                                                                                                                                                                                                                                                                          |
| 로컬 Chrome 실행        | 같은 runner의 `--target local`. `expectRandomUUID`·`expectChromeVersion`을 query로 넘겨 빌드별 기대값을 페이지가 대조한다.                                                                                                                                                                                                                                                                                             |
| publish 주체·순서       | 7절. `npm login`·`npm publish`·`main` 병합·tag는 사용자. 에이전트는 dry-run 검토와 `npm view` 확인.                                                                                                                                                                                                                                                                                                                    |
| revision 단일 출처      | runner가 `loadBaseline()`으로 읽어 `--build-arg`로 전달. Dockerfile 리터럴 없음. `check:baseline`이 import와 리터럴 부재를 검사. 페이지 A3가 실측 UA를 대조.                                                                                                                                                                                                                                                           |
| sha256 위치             | `baseline.json` `chromium.sha256`(+`platform`). 로드맵 §5가 revision 갱신을 baseline 한 곳에서 하므로 sha256도 같이 움직인다. parser·자체 테스트 확장.                                                                                                                                                                                                                                                                 |

## 10. 미결정

측정·실행 뒤 채운다. 채우면 이 절에서 지우고 해당 절에 값을 적는다.

- 4.5 fallback 채택 여부(첫 컨테이너 실행 후).
- Dockerfile의 시스템 라이브러리 목록(첫 실행 후).
