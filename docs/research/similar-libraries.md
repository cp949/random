# 유사 라이브러리 리서치: seedable PRNG / ID 생성기 / 보안 난수

`@cp949/random`과 같은 문제 영역(seedable PRNG, 보안 난수, ID/UUID 생성)을 다루는 라이브러리를 1차 자료 기준으로 조사한 결과다. API 설계·검증 전략·문서화 방식에서 `@cp949/random`이 참고할 점을 정리한다.

## 개요

- **범위**: seedable PRNG 4종(pure-rand, seedrandom, random-js, chance.js), ID 생성기 5종(nanoid, cuid2, ULID/ulidx, uuid, short-uuid), 보안 난수 유틸 2종(crypto-random-string, Node.js `crypto.randomBytes` 계열).
- **방법**: WebFetch로 각 라이브러리의 GitHub README/소스, npm 레지스트리, 공식 스펙 문서를 직접 확인했다(WebSearch로 정확한 저장소를 먼저 특정한 경우도 있음). 지식만으로 작성한 내용은 없으며, 확인하지 못한 사실은 "확인 안 됨"으로 표기했다.
- **확인 날짜**: 모든 WebFetch/WebSearch는 2026-09-22에 수행했다.
- **인용 원칙**: 각 항목의 근거는 절 끝 또는 "참고 자료" 목록의 URL이다. 버전 번호·함수 시그니처·알고리즘명은 원문 인용을 우선했다.

---

## 1. Seedable / 재현 가능한 PRNG

| 라이브러리 | 알고리즘                                                               | API 스타일                                        | seed 처리                                         | state 저장/복원                         |
| ---------- | ---------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------- | --------------------------------------- |
| pure-rand  | congruential32(LCG), mersenne, xorshift128plus, xoroshiro128plus(권장) | state 객체 + 순수 함수 변형(`purify`)             | 숫자 seed                                         | 확인 안 됨(state 객체 자체가 재현 단위) |
| seedrandom | ARC4(기본), alea, xor128, xor4096, xorshift7, xorwow, tychei           | 클로저 함수(`rng()`)                              | 문자열/숫자, entropy 옵션                         | `{state: true}`로 저장/복원 지원        |
| random-js  | MersenneTwister19937 + nativeMath/browserCrypto/nodeCrypto 엔진        | Engine과 분포 함수 분리, 클래스 래퍼(Random) 병행 | `.seed(value)`, `.seedWithArray()`, `.autoSeed()` | 확인 안 됨                              |
| chance.js  | Mersenne Twister                                                       | 클래스(`new Chance(seed)`)                        | 숫자/문자열/복수 인자                             | 확인 안 됨                              |

### pure-rand (dubzzz/pure-rand)

> 상세 리서치: [`similar-libs/pure-rand.md`](similar-libs/pure-rand.md)

- 목적: "Fast Pseudorandom number generators (aka PRNG) with purity in mind!"
- 알고리즘 4종: `congruential32`(Linear Congruential), `mersenne`(Mersenne Twister), `xorshift128plus`, `xoroshiro128plus`(README 권장).
- API: `const rng = xoroshiro128plus(seed); const value = uniformInt(rng, 1, 6);` 형태의 상태 객체 방식. `purify()`로 감싸면 `[값, 새로운 rng]` 튜플을 돌려주는 순수 함수형으로 전환 가능.
- seed: 숫자 기반. 문서 예시 `Date.now() ^ (Math.random() * 0x100000000)`.
- 재현성: "given the original seed one can rebuild the whole sequence."
- 버전: GitHub 페이지에서 구체적 버전 확인 안 됨(커밋 1,022개, MIT 라이선스).
- 장점: fast-check(property-based testing)의 기반 PRNG로 실전 검증됨. 순수 함수형 변형을 API 차원에서 공식 지원.
- 단점: 상태 객체 방식과 purify 방식 두 API가 공존해 학습 곡선이 있음(확인 근거는 README 구조 자체, 정량적 단점은 확인 안 됨).
- 출처: https://github.com/dubzzz/pure-rand

### seedrandom (davidbau/seedrandom)

> 상세 리서치: [`similar-libs/seedrandom.md`](similar-libs/seedrandom.md)

- 목적: "Seeded random number generator for JavaScript."
- 알고리즘: ARC4(기본, 주기 약 2^1600), alea(Baagøe, 주기 약 2^116), xor128/xor4096/xorshift7/xorwow/tychei.
- API: `seedrandom(seed, options)` → `rng()`, `rng.quick()`(32비트), `rng.int32()`, `rng.double()`(alea 전용 56비트).
- 옵션: `{ entropy: true }`(엔트로피 혼합), `{ global: true }`(Math.random 전역 대체), `{ state: true }`(상태 저장), `{ pass: fn }`(콜백 반환).
- seed 해싱: 버전 2.0부터 non-string seed에 종료자를 추가해 `'ab' === 'abab'` 같은 문자열 중복 문제를 방지.
- state 저장/복원: `var saveable = seedrandom("seed", {state: true}); var saved = saveable.state(); var replica = seedrandom("", {state: saved});`
- 버전: **3.0.5**(2019-09-14). "removes eval to avoid triggering content-security policy."
- 장점: state 직렬화 API가 명시적이라 체크포인트/재개 유즈케이스에 강함. 속도/품질이 다른 다수 알고리즘 중 선택 가능.
- 단점: 마지막 릴리즈가 2019년으로 유지보수 빈도가 낮음. 기본 ARC4는 느린 편(문서 자체 언급).
- 출처: https://github.com/davidbau/seedrandom

### random-js (ckknight/random-js)

> 상세 리서치: [`similar-libs/random-js.md`](similar-libs/random-js.md)

- npm 레지스트리 확인(2026-09-22): 최신 버전 **2.1.0**, description "A mathematically correct random number generator library for JavaScript.", repository `git://github.com/ckknight/random-js`.
- 엔진 4종: `nativeMath`("Utilizes Math.random() and converts its result to a signed integer"), `browserCrypto`("Utilizes crypto.getRandomValues(Int32Array)"), `nodeCrypto`("Utilizes require('crypto').randomBytes(size)"), `MersenneTwister19937`("An implementation of the Mersenne Twister algorithm. Not cryptographically secure, but its results are repeatable").
- API 이중 구조: 저수준(엔진 + 분포 함수를 조합하는 함수형 API, "Any object that fulfills that interface is an Engine")과 고수준(`Random` 클래스 래퍼, "may be easier to use, but may be less performant").
- seed: `MersenneTwister19937.seed(value)`, `.seedWithArray(array)`, `.autoSeed()`.
- 분포 함수: 정수, 실수, 불린, 배열 선택, 셔플, 샘플링, UUID, 문자열, 날짜 등.
- 장점: **엔진(난수원)과 분포 함수를 분리한 아키텍처**가 `@cp949/random`의 `RandomSource`(`() => number`) + helper(`int`/`float`/`bool`/`sign`/`uniform`) 구조와 철학적으로 동일하다. 같은 분포 함수에 재현 가능한 엔진과 crypto 엔진을 자유롭게 교체 주입할 수 있다.
- 단점: 최신 버전이 2.1.0에 머물러 있어 활발한 유지보수 신호는 약함(정량적 근거는 npm 레지스트리 latest 태그 하나뿐, 커밋 빈도는 확인 안 됨).
- 출처: https://www.npmjs.com/package/random-js(레지스트리 API), https://github.com/ckknight/random-js

### chance.js (chancejs/chancejs)

> 상세 리서치: [`similar-libs/chancejs.md`](similar-libs/chancejs.md)

- PRNG: "Thank you to Sean McCullough for your Mersenne Twister gist on which almost the entirety of this library is dependent." → Mersenne Twister 기반.
- seed API(chancejs.com/usage/seed.html): `new Chance(seed)`. seed는 숫자(`new Chance(12345)`), 문자열(`new Chance("foo")`), 복수 인자(`new Chance("hold", "me", "closer")`) 모두 가능. "These yield the same values, in sequence"로 재현성을 보장한다고 명시.
- 목적 자체는 PRNG 코어 제공이 아니라 이름·주소·날짜 등 **도메인별 랜덤 데이터 생성**이 핵심이며, seed는 그 위에 얹힌 재현성 기능이다.
- 장점: 생성자 오버로드(숫자/문자열/여러 인자)로 seed 입력을 유연하게 받는 API 편의성.
- 단점: PRNG 코어의 재현성 계약(예: raw 출력 golden vector, 버전 간 호환 정책)이 문서화되어 있는지는 확인 안 됨. 암호학적 안전성 주장 없음(Mersenne Twister 특성상 예측 가능).
- 출처: https://github.com/chancejs/chancejs, https://chancejs.com/usage/seed.html

---

## 2. ID 생성기

### nanoid (ai/nanoid)

> 상세 리서치: [`similar-libs/nanoid.md`](similar-libs/nanoid.md)

- 목적: "A tiny, secure, URL-friendly, unique string ID generator for JavaScript."
- 기본 alphabet: URL-friendly `A-Za-z0-9_-`, 기본 길이 **21자**.
- 충돌 확률: "For there to be a one in a billion chance of duplication, 103 trillion version 4 IDs must be generated."(UUID v4와 동급 근거로 21자·64자 alphabet을 채택).
- API: `nanoid()`, `nanoid(size)`, `customAlphabet(alphabet, size)`, `customRandom(alphabet, size, randomGenerator)`.
- crypto: "Uses the Web Crypto API in browsers."
- 번들 크기: "127 bytes (minified and brotlied)."
- 의존성: "No dependencies."
- non-secure 버전: `nanoid/non-secure`로 제공되며, README는 "non-secure version is _slower_ than secure"라고 명시한다(원문 그대로 인용. 일반적 직관과 반대되는 진술이라 그대로 남긴다).
- `@cp949/random/id`의 `nanoid(length)`는 alphabet 인자를 받지 않고 base64url 64자 고정이라는 점이 원본 nanoid의 `customAlphabet`/`customRandom` 확장성과 대비된다(설계 차이이지 결함은 아님).
- 장점: 매우 작은 번들, `customRandom`으로 난수원을 직접 주입할 수 있는 확장점.
- 단점: `customAlphabet` 사용 시 alphabet 크기에 따라 내부적으로 비트마스크 rejection sampling을 계산해야 하므로 구현 복잡도가 올라간다(README에 알고리즘 설명 있음, 세부 코드는 이번 조사에서 직접 확인 안 됨).
- 출처: https://github.com/ai/nanoid

### cuid2 (@paralleldrive/cuid2)

> 상세 리서치: [`similar-libs/cuid2.md`](similar-libs/cuid2.md)

- 목적: "Secure, collision-resistant ids optimized for horizontal scaling and performance. Next generation UUIDs."
- entropy source 5종: "An initial letter to make the id a usable identifier in JavaScript and HTML/CSS, The current system time, Pseudorandom values, A session counter, A host fingerprint."
- 해시: 문자열을 Base36 인코딩 후 "a tiny, fast, security-audited, NIST-standardized hash function"(SHA3 계열)을 적용. 호스트 지문은 "a list of all global names in the JavaScript environment"를 해싱해 만든다.
- monotonicity: 전작 Cuid1과 달리 **의도적으로 제거**했다. "Cuid used roughly monotonically increasing ids... In Cuid2, the hashing algorithm... makes it much more difficult for an attacker to guess valid ids."
- alphabet: Base36(소문자+숫자), 기본 길이 **24자**.
- 충돌 확률: "roughly 4,000,000,000,000,000,000 ids to reach 50% chance of collision."
- API: `createId()`, `init({ random, length, fingerprint })`.
- crypto 신뢰 방식: Web Crypto API 단독 신뢰가 아니라 다중 entropy source를 혼합하는 설계("Cuid2 supplies its own known entropy from a diverse pool").
- 장점: 예측 불가능성(보안)과 충돌 저항을 동시에 노리는 설계, 분산 환경(호스트 지문)을 고려.
- 단점: SHA3 해싱 오버헤드로 nanoid류보다 계산 비용이 크고(정량적 벤치마크는 확인 안 됨), `@cp949/random`처럼 단일 난수원(`getRandomValues`)만 신뢰하는 것과 반대로 여러 entropy source를 섞는 접근은 감사 대상이 늘어난다.
- 배울 점 후보: init 옵션에 `fingerprint`를 주입할 수 있어 **테스트 시 결정적 재현**이 가능하다는 점.
- 출처: https://github.com/paralleldrive/cuid2

### ULID 스펙 + ulidx

> 상세 리서치: [`similar-libs/ulid.md`](similar-libs/ulid.md)

- 스펙(https://github.com/ulid/spec): "UUID can be suboptimal for many use-cases because: It isn't the most character efficient way of encoding 128 bits of randomness." 128비트를 `48bit timestamp + 80bit randomness`로 구성, 26자 Crockford Base32(`0123456789ABCDEFGHJKMNPQRSTVWXYZ`, I/L/O/U 제외)로 인코딩. 밀리초당 유일 ULID 수 "1.21e+24."
- monotonicity: "when generating a ULID within the same millisecond, ... the `random` component is incremented by 1 bit in the least significant bit position (with carrying)."
- ulidx(perry-mitchell/ulidx): `ulid()`, `monotonicFactory()`("Strict ordering for the same timestamp, by incrementing the least-significant random bit by 1"), `decodeTime()`, `isValid()`, `fixULIDBase32()`(오타 교정). "written entirely in Typescript"이며 ESM/CJS 동시 출력.
- crypto: "will attempt to locate a suitable cryptographically-secure random number generator... On NodeJS this will be `crypto.randomBytes` and in the browser it will be `crypto.getRandomValues`." `Math.random()`은 명시적으로 미지원("**not supported**").
- PRNG 커스터마이징: `monotonicFactory(prng?)`와 `ulid(seedTime?, prng?)`가 `() => number`(0~1 실수) 함수를 주입받는다. 알고리즘·seed 선택 옵션은 없고 난수 소스 자체를 함수로 대체하는 지점이다(소스 확인, [`similar-libs/ulid.md`](similar-libs/ulid.md) §2.5).
- 장점: 사전순 정렬 가능(타임스탬프 선두 배치) + UUID와 동일한 128비트 유지. `monotonicFactory`의 "같은 ms 내 최하위 비트 증가" 방식은 `@cp949/random`의 `uuidv7` counter 증가 방식과 설계 목표가 같다.
- 단점: monotonicFactory는 팩토리 단위 상태를 가지므로 인스턴스 간 보장 범위가 한정된다(clock skew·다중 인스턴스 이슈는 `@cp949/random/id`의 "단조성의 보장 범위" 섹션이 다루는 문제와 동일).
- 출처: https://github.com/ulid/spec, https://github.com/perry-mitchell/ulidx

### uuid (uuidjs/uuid)

> 상세 리서치: [`similar-libs/uuid.md`](similar-libs/uuid.md)

- v7 지원: `uuid.v7()`, "Create an RFC version 7 (random) UUID."
- 표준 참조: "For the creation of RFC9562 (formerly RFC4122) UUIDs." RFC 번호 갱신(4122→9562)을 반영.
- monotonicity: 기본 호출 `v7()`은 모듈 스코프 `_state`(`msecs`, `seq`)를 갱신해 단조다(소스 확인, [`similar-libs/uuid.md`](similar-libs/uuid.md) §2.2). `options.seq` — "32-bit sequence Number between 0 - 0xffffffff. This may be provided to help ensure uniqueness for UUIDs generated within the same millisecond time interval." 단, `options`를 하나라도 넘기면 `_state`를 건드리지 않아 그 호출은 단조성 체인에서 조용히 이탈한다.
- API: `uuid.v7([options[, buffer[, offset]]])`.
- crypto: "Secure - Uses modern crypto API for random values."
- 버전/지원 정책: "Starting with uuid@12 CommonJS is no longer supported." "uuid builds are tested against node (LTS releases), plus one prior."
- 장점: 사실상 업계 표준 참조 구현. RFC 갱신을 빠르게 반영.
- 단점: v12에서 CommonJS 지원 중단은 CJS 소비자에게 마이그레이션 부담. v7이 `options`를 받으면 조용히 단조성에서 이탈하므로 `@cp949/random/id`의 uuidv7(인스턴스 단위 counter로 기본 동작에서 단조성 보장)과 설계 지향점이 다르다.
- 출처: https://github.com/uuidjs/uuid

### short-uuid (oculus42/short-uuid)

> 상세 리서치: [`similar-libs/short-uuid.md`](similar-libs/short-uuid.md)

- 목적: "Generate and translate standard UUIDs into shorter - or just _different_ - formats and back."
- 설계: RFC4122 v4 UUID를 다른 alphabet으로 재인코딩(진법 변환)하는 방식. 새로운 엔트로피원이 아니라 **표현 변환**이다.
- API: `generate()`, `createTranslator(alphabet, options)`, `toUUID()`, `fromUUID()`, `validate()`. 기본 alphabet은 flickrBase58, 프리셋으로 cookieBase90 등 제공. `consistentLength` 옵션으로 패딩 제어.
- 의존성: v6.0.0부터 "Removes the uuid library as a dependency." 네이티브 `crypto.randomUUID`를 사용하고, 대체 UUID 생성기(예: uuidv7)를 옵션으로 주입 가능.
- 장점: "UUID 생성"과 "표현 변환"을 분리한 관심사 분리 설계. `createTranslator`로 alphabet을 직접 정의하는 패턴.
- 단점: 재인코딩이라 128비트 정보량은 그대로 유지되며, alphabet이 짧을수록 결과 문자열 길이가 늘어나는 트레이드오프가 있다(수치는 이번 조사에서 직접 계산하지 않음).
- 배울 점 후보: `@cp949/random/id`의 `stringifyUuid`/`parseUuid`(바이트 ↔ 문자열 변환을 UUID 생성과 분리)와 관심사 분리 철학이 유사하다. 대체 생성기를 주입받는 패턴은 `createUuidv4Factory`/`createUuidv7Factory`의 `randomBytes` 주입과도 유사하다.
- 출처: https://github.com/oculus42/short-uuid

---

## 3. 보안 난수 / 토큰 유틸

### crypto-random-string (sindresorhus)

> 상세 리서치: [`similar-libs/crypto-random-string.md`](similar-libs/crypto-random-string.md)

- 목적: "Generate a cryptographically strong random string."
- API: `cryptoRandomString({length, type, characters})`. type 옵션: `'hex'`(기본), `'base64'`, `'url-safe'`, `'numeric'`, `'distinguishable'`("contains only uppercase characters that are not easily confused: CDEHKMPRTUWXY012458"), `'ascii-printable'`, `'alphanumeric'`.
- 소스 코드 확인(GitHub `main` 브랜치 `index.js`, 2026-09-22): **`globalThis.crypto.getRandomValues`만 사용**하며 `node:crypto`는 import하지 않는다. TODO 주석 "Use Uint8Array#toBase64 and Uint8Array#toHex when targeting Node.js 26"으로 향후 네이티브 API 전환을 예고한다. Base64는 `Math.ceil(length * 0.75)`바이트, Hex는 `Math.ceil(length * 0.5)`바이트를 요청해 문자 수만큼 슬라이스한다.
- 미지원 환경 에러 처리: **소스에 명시적 처리가 없다.** `crypto.getRandomValues`가 없는 환경에서 호출하면 처리되지 않은 런타임 예외가 그대로 던져진다. 전용 에러 클래스(`SecureRandomUnavailableError` 같은)는 없다.
- 장점: `globalThis.crypto` 단일 소스로 Node(18.19+/20.0+ 이후 전역 존재)와 브라우저를 동시에 커버하는 최신 트렌드를 따른다. 타입별 필요 바이트 계산이 간결하다.
- 단점: 미지원 환경에서 어떤 예외가 나는지 API 소비자가 예측할 수 없다. `@cp949/random/secure`가 `SecureRandomUnavailableError`라는 전용 클래스로 이 경우를 구분 가능하게 만든 것은 명확한 차별점이다.
- 출처: https://github.com/sindresorhus/crypto-random-string, https://raw.githubusercontent.com/sindresorhus/crypto-random-string/main/index.js

### Node.js `crypto.randomBytes` 계열

> 상세 리서치: [`similar-libs/node-crypto.md`](similar-libs/node-crypto.md)

- 출처: Node.js 공식 문서(nodejs.org/api/crypto.html).
- `crypto.randomBytes(size[, callback])`: 콜백을 주면 비동기(`err`, `buf` 인자), 생략하면 동기적으로 `Buffer`를 반환.
- `crypto.randomFillSync(buffer[, offset][, size])` / `crypto.randomFill(buffer[, offset][, size], callback)`: 기존 버퍼를 난수로 채움(동기/비동기).
- `crypto.randomInt([min, ]max[, callback])`: 범위 지정 정수 난수를 Node 표준 API가 직접 제공한다.
- 엔트로피 부족 시 에러: 전용 에러 코드가 없다. 공식 문서는 "may block"만 적고, 소스(`DeriveBitsJob`)는 OpenSSL 에러 큐가 비어 있으면 범용 `ERR_CRYPTO_OPERATION_FAILED`("Deriving bits failed")로 수렴시킨다(소스 확인, [`similar-libs/node-crypto.md`](similar-libs/node-crypto.md) §2.3).
- 장점: `randomInt`가 표준 라이브러리 차원에서 rejection sampling(modulo bias 제거)을 내장 제공한다.
- 단점: Node 전용이며 브라우저에는 없다. 브라우저 대응이 필요한 라이브러리(crypto-random-string, `@cp949/random/secure` 등)는 이 간극을 각자 메운다.
- `@cp949/random/secure`와의 비교: `@cp949/random/secure`의 `randomInt`는 Node 표준 `crypto.randomInt`와 동등한 rejection-sampling 설계를 브라우저 전용 환경(`getRandomValues`)에서도 제공한다는 점에서 위치가 명확하다.
- 출처: https://nodejs.org/api/crypto.html#cryptorandombytessize-callback

---

## 종합: `@cp949/random`이 배울 점

### PRNG 코어 (root)

1. **엔진/분포 분리 아키텍처는 이미 올바른 방향이다.** random-js의 Engine+분포 함수 분리 설계가 `@cp949/random`의 `RandomSource` + `int`/`float`/`bool`/`sign`/`uniform` 구조와 동일한 철학이다. 이는 근거 있는 설계 패턴임을 재확인했다(출처: random-js README).
2. **state 저장/복원 API를 검토할 여지가 있다.** seedrandom의 `{state: true}` → `state()` → 복원 패턴은 장시간 시뮬레이션 체크포인트에 유용하다. `@cp949/random`은 `RandomSource`가 클로저 상태를 캡슐화해 외부에서 직렬화할 수 없는데, 필요하다면 `./state`의 `RandomState` facade에서 이 유즈케이스를 명시적으로 다루는지 확인할 가치가 있다.
3. **알고리즘 다양성보다 "권장 알고리즘 단일화 + golden vector 고정"이 pure-rand·seedrandom 대비 문서화 수준에서 앞선다.** `@cp949/random`은 xoshiro128\*\*+SplitMix32 조합과 golden vector를 `docs/api/random-core.md`에 정확히 고정해두었는데, 이는 pure-rand(알고리즘 4종 중 권장만 명시, 재현성 문구는 있으나 golden vector 공개 여부 확인 안 됨)나 chance.js(재현성 계약 문서화 수준 확인 안 됨)보다 검증 가능성이 높다. 이 우위를 README/랜딩 문서에서 명시적으로 강조할 수 있다.
4. **seed 해싱 방식의 회귀 테스트 벡터 관행**은 seedrandom의 문자열 종료자 처리(`'ab' !== 'abab'`)에서 배울 점이다. `@cp949/random`은 FNV-1a로 이미 이 문제를 해결했지만, seedrandom처럼 "왜 이 해결책이 필요한가"를 문서에 예시로 남기는 방식은 참고할 만하다.

### ID 생성기 (`./id`)

1. **번들 크기 수치를 문서에 명시하는 관행**(nanoid: "127 bytes minified+brotli")은 `@cp949/random/id`도 이미 채택 중이다(`docs/api/random-core.md`의 번들 측정 절). 경쟁 라이브러리 대비 절대 수치 비교를 추가하면 문서 설득력이 올라간다.
2. **uuidv7의 단조성 보장 범위를 uuid(uuidjs)의 옵션 의존형 `seq`보다 명확히 문서화한 것이 강점**이다. `@cp949/random/id`의 "단조성의 보장 범위" 절(인스턴스 단위, 같은 format 비교, counter 고갈 규칙, 10,000ms 재설정 등)은 ulidx의 monotonicFactory나 uuid의 `options.seq`보다 조건을 구체적으로 명시한다. 이 비교를 API 문서나 README 차별화 포인트로 쓸 수 있다. uuid는 `v7(options)`처럼 옵션을 넘기는 순간 모듈 상태를 건너뛰어 단조성이 조용히 끊기지만, `@cp949/random/id`는 옵션 경로를 `createUuidv7Factory`로 분리해 기본 인스턴스의 체인이 끊길 수 없다.
3. **cuid2의 "왜 monotonicity를 의도적으로 제거했는가" 같은 설계 근거 서술 방식**은 참고할 만하다. `@cp949/random/id`도 `uuidv7`이 시각을 노출한다는 사실과 `uuidv4`/timestamp 없는 `randomId`로의 대안 안내를 이미 갖추고 있으나(보안·프라이버시 절), "왜 이 트레이드오프를 택했는가"를 한 단계 더 명시적으로 서술하면 cuid2 수준의 설득력을 가질 수 있다.
4. **short-uuid의 "생성기 주입" 패턴**(대체 UUID 생성기를 옵션으로 넘기는 방식)은 `@cp949/random/id`의 `createUuidv4Factory`/`createUuidv7Factory`의 `randomBytes` 주입과 유사한 설계이며, 이미 채택된 패턴이 업계에서도 통용됨을 재확인시켜 준다.
5. **nanoid의 alphabet 확장(`customAlphabet`) 부재는 의도된 제약이지만, 대체 경로 안내를 강화할 수 있다.** `@cp949/random/id`의 `nanoid()`는 alphabet을 고정하는 대신 `randomId`(preset/alphabet 옵션)로 확장 경로를 제공하는데, 이는 nanoid의 `customAlphabet`과 기능적으로 동등하다. 문서에서 "nanoid 사용자가 customAlphabet을 찾는다면 randomId를 쓴다"는 식의 마이그레이션 안내를 추가할 수 있다.

### 보안 난수 (`./secure`)

1. **전용 에러 클래스(`SecureRandomUnavailableError`)는 crypto-random-string 대비 명확한 차별점이다.** crypto-random-string은 미지원 환경에서 어떤 예외가 발생하는지 소스 수준에서도 명시하지 않는다(이번 조사로 확인). `@cp949/random/secure`가 이 상태를 별도 클래스로 구분 가능하게 만든 것은 API 소비자에게 실질적 우위이며, 문서·README에서 강조할 가치가 있다.
2. **`globalThis.crypto` 단일 신뢰 방향은 업계 흐름과 일치한다.** crypto-random-string도 Node 전용 fallback 없이 `globalThis.crypto.getRandomValues`만 사용하는 방향으로 수렴하고 있다(TODO 주석에서 Node 26 대상 네이티브 API 전환까지 예고). `@cp949/random/secure`가 `node:crypto`를 아예 import하지 않는 설계는 이미 이 흐름의 최전선에 있다.
3. **`getCryptoCapabilities()` 같은 진단 전용 API는 비교 대상 라이브러리에서 확인되지 않았다.** crypto-random-string, Node `crypto` 모두 "지원 여부를 예외 없이 조회하는 API"를 제공하지 않는다(이번 조사 범위 내). 이는 `@cp949/random/secure`의 독자적 강점으로 유지·홍보할 만하다.
4. **결함 난수원에 대한 위협 모델 명시(`docs/api/secure.md`의 "결함 난수원" 절)는 비교 라이브러리에서 발견하지 못한 문서화 관행이다.** rejection sampling의 무한 재시도 가능성을 명시적으로 "위협 모델 밖"이라고 선언하는 방식은, Node 공식 문서조차 명확히 다루지 않는 엔트로피 부족 시나리오(상세 조사에서 범용 `ERR_CRYPTO_OPERATION_FAILED`로 수렴함을 확인)보다 투명하다. 이 문서화 수준을 유지한다.
5. **Node `crypto.randomInt`가 표준 API로 존재한다는 사실은 `@cp949/random/secure`의 `randomInt`가 "브라우저용 표준 API 대응물"이라는 포지셔닝 근거로 쓸 수 있다.** README에 "Node의 `crypto.randomInt`에 대응하는 브라우저 전용 구현"이라는 식으로 명시하면 사용자가 API 위치를 더 빠르게 이해할 수 있다.

---

## 참고 자료 (확인 날짜: 2026-09-22)

- pure-rand: https://github.com/dubzzz/pure-rand
- seedrandom: https://github.com/davidbau/seedrandom
- random-js(npm 레지스트리): https://www.npmjs.com/package/random-js
- random-js(저장소): https://github.com/ckknight/random-js
- chance.js(저장소): https://github.com/chancejs/chancejs
- chance.js(seed 사용법 문서): https://chancejs.com/usage/seed.html
- nanoid: https://github.com/ai/nanoid
- cuid2: https://github.com/paralleldrive/cuid2
- ULID 스펙: https://github.com/ulid/spec
- ulidx: https://github.com/perry-mitchell/ulidx
- uuid(uuidjs): https://github.com/uuidjs/uuid
- short-uuid: https://github.com/oculus42/short-uuid
- crypto-random-string(저장소): https://github.com/sindresorhus/crypto-random-string
- crypto-random-string(소스, main 브랜치 index.js): https://raw.githubusercontent.com/sindresorhus/crypto-random-string/main/index.js
- Node.js 공식 문서 — crypto.randomBytes 등: https://nodejs.org/api/crypto.html#cryptorandombytessize-callback

### 확인하지 못한 사항 (지어내지 않고 명시)

- pure-rand, random-js, chance.js의 정확한 최신 버전 번호(각각 npm 레지스트리를 직접 조회하지 않음, random-js만 확인).
- crypto-random-string의 의존성 목록(README에 명시 없음, package.json 직접 조회 안 함).
- pure-rand의 `mersenne`/`congruential32` 등 비권장 알고리즘의 구체적 사용 사례나 성능 비교 수치.
