# cuid2 (@paralleldrive/cuid2) 소스 분석

로컬 클론: `/work/thrd/cuid2` (커밋 `f9c0cda7bde460eaeeb5b3f0e625da24823e5ecb`, 2026-08-12). 개요 수준 조사는 `docs/research/similar-libraries.md`의 "cuid2" 절에 있다. 이 문서는 실제 소스(`src/index.js`, `src/index-test.js`, `src/collision-test.js`, `src/histogram.js`)를 근거로 더 파고든다.

## 1. 개요

| 항목                | 내용                                                                                                                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 패키지명            | `@paralleldrive/cuid2` (`package.json:2`)                                                                                                                                                                                                                        |
| 버전                | `3.3.0` (`package.json:81`)                                                                                                                                                                                                                                      |
| 라이선스            | MIT (`package.json:53`, `LICENSE:1-3`, Copyright 2022 Eric Elliott)                                                                                                                                                                                              |
| 런타임 의존성       | `@noble/hashes@^2.0.1`, `bignumber.js@^9.3.1`, `error-causes@^3.0.2` (`package.json:76-80`) — 런타임 의존성 0이 아니다                                                                                                                                           |
| repository/homepage | `repository.url`은 `git+https://github.com/ericelliott/cuid2.git`(`package.json:39-41`), `homepage`는 `https://github.com/paralleldrive/cuid2#readme`(`package.json:57`). 두 URL의 조직명이 다르다(포크/이관 이력으로 추정, 로컬 소스에서 이유까지는 확인 안 됨) |
| 목적                | "Secure, collision-resistant ids optimized for horizontal scaling and performance." (`README.md:5`)                                                                                                                                                              |

`src/index.js`는 66줄이 아니라 166줄이며, ESM(`"type": "module"`, `package.json:4`)이다. 진입점은 `index.js`(재수출) → `src/index.js`.

## 2. 핵심 구현 상세

### 2.1 entropy 5종의 정확한 조합 코드

README(`README.md:175-180`)가 나열하는 5종은 소스에서 다음과 같이 조합된다(`src/index.js:116-131`):

```js
return function cuid2() {
  const firstLetter = randomLetter(rand); // ① 초기 글자
  const time = Date.now().toString(36); // ② 시스템 시각
  const count = counter().toString(36); // ④ 세션 카운터
  const salt = createEntropy(length, rand); // ③ pseudorandom
  const hashInput = `${time + salt + count + fingerprint}`; // ⑤ 호스트 지문(fingerprint)
  return `${firstLetter + hash(hashInput).substring(1, length)}`;
};
```

- 조합 순서는 `time + salt + count + fingerprint`이며 `firstLetter`는 해시에 들어가지 않고 해시 결과 앞에 그대로 붙는다(`src/index.js:117,128,130`).
- `firstLetter`는 `a-z` 26개 중 균등 선택이 아니라 `Math.floor(rand() * alphabet.length)` 인덱싱이다(`src/index.js:66-70`). rejection sampling이 아니라 modulo류 인덱싱이므로 `rand()`의 분포에 편향이 있으면 그대로 전파된다.
- `salt`(pseudorandom)는 `createEntropy(length, rand)`로 만들며, `rand() * 36`을 `toString(36)`한 문자를 목표 길이까지 이어붙이는 방식이다(`src/index.js:34-41`). 이 역시 modulo 인덱싱이다.
- `time`, `count`는 각각 `Date.now()`와 세션 카운터를 36진수 문자열로 바꾼 것뿐이다(`src/index.js:121-122`). 주석은 "`.toString(36)`이 해시 입력을 짧게 해 해싱 라운드를 줄일 수도 있다"는 성능상의 기대다(`src/index.js:118-120`).
- `hash()`가 반환하는 문자열에서 `substring(1, length)`로 **첫 글자를 버린다**. 주석: "Drop the first character because it will bias the histogram to the left."(`src/index.js:58-59`, 호출부 `src/index.js:130`). `hash()` 자체 내부에서도 `.toString(36).slice(1)`로 한 번 더 첫 글자를 버린다(`src/index.js:61-63`).

### 2.2 SHA3 계열 해시 함수 — 외부 라이브러리 의존

자체 구현이 아니다. `@noble/hashes` 패키지에서 `sha3_512`를 그대로 가져와 쓴다.

```js
import { sha3_512 as sha3 } from "@noble/hashes/sha3.js"; // src/index.js:2
```

`hash()`의 실제 구현(`src/index.js:57-64`):

```js
const hash = (input = "") => {
  const encoder = new TextEncoder();
  return bufToBigInt(sha3(encoder.encode(input)))
    .toString(36)
    .slice(1);
};
```

- `sha3(encoder.encode(input))`가 `Uint8Array` 다이제스트(SHA3-512, 64바이트)를 반환한다.
- `bufToBigInt`(`src/index.js:47-55`, `juanelas/bigint-conversion`에서 각색했다고 주석에 명시)는 바이트를 `BigNumber`(`bignumber.js` 의존, `package.json:78`)로 누적 변환한다(`value = value.multipliedBy(256).plus(byte)`).
- 그 `BigNumber`를 36진수 문자열로 바꾸고 첫 글자를 버린다.

즉 "SHA3 직접 구현"이 아니라 (1) `@noble/hashes`의 SHA3-512, (2) `bignumber.js`의 임의정밀도 정수, 두 외부 의존성을 조합한 구현이다. README는 이를 "a tiny, fast, security-audited, NIST-standardized hash function"이라 부른다(`README.md:255`).

### 2.3 호스트 지문(fingerprint) 생성 코드

```js
// src/index.js:78-92
const createFingerprint = ({
  globalObj = typeof global !== "undefined"
    ? global
    : typeof window !== "undefined"
      ? window
      : {},
  random: rand = random,
} = {}) => {
  const globals = Object.keys(globalObj).toString();
  const sourceString = globals.length
    ? globals + createEntropy(bigLength, rand)
    : createEntropy(bigLength, rand);

  return hash(sourceString).substring(0, bigLength);
};
```

- README가 말하는 "list of all global names"(`README.md:253`)는 실제로는 `Object.keys(globalObj)`, 즉 **enumerable own key만**이다(전역 체인 전체나 non-enumerable 전역은 포함하지 않는다).
- `globalObj`가 비어 있으면(`Object.keys(globalObj).length === 0`, 예: Worker나 sandbox) 전역 이름 없이 `createEntropy(bigLength, rand)`(32자리 pseudorandom)로만 fallback한다(`src/index.js:87-89`). 즉 "호스트 지문"이 항상 결정적인 값이 아니라, 전역이 빈약한 환경에서는 사실상 추가 난수 소스로 강등된다. README도 이를 인정한다: "on production environments where the globals are all identical, we lose the unique fingerprint, but still get random entropy to replace it"(`README.md:255`).
- 최종적으로 `hash(sourceString).substring(0, bigLength)`로 32자(`bigLength = 32`, `src/index.js:6`)로 자른다.
- 테스트(`src/index-test.js:167-195`)는 (a) 인자 없이 호출 시 길이 ≥24, (b) `globalObj: {}` 전달 시에도 길이 ≥24(랜덤 fallback 확인)만 검증한다. 값 자체의 결정성이나 "전역 이름을 정말 다 해싱하는지"는 테스트되지 않는다.

### 2.4 `createId()`와 `init({random, length, fingerprint})` — 옵션 주입과 결정적 테스트

```js
// src/index.js:102-132
const init = ({
  random: rand = random,
  counter = createCounter(Math.floor(rand() * initialCountMax)),
  length = defaultLength,
  fingerprint = createFingerprint({ random: rand }),
} = {}) => {
  if (length > bigLength) {
    throw new Error(
      `Length must be between 2 and ${bigLength}. Received: ${length}`,
    );
  }
  return function cuid2() {
    /* ... 2.1 참고 ... */
  };
};

const createId = lazy(init);
function lazy(fn) {
  let initialized;
  return () => {
    if (!initialized) initialized = fn();
    return initialized();
  };
}
```

- `createId`는 `init()`을 인자 없이 지연 호출(lazy)한 싱글턴이다(`src/index.js:134-143`). 모듈 최상위에서 `init()`을 즉시 실행하지 않고 첫 `createId()` 호출에서 실행한다.
- `random` 옵션을 주입하면 `counter`의 초깃값(`Math.floor(rand() * initialCountMax)`)과 `fingerprint`의 기본값(`createFingerprint({ random: rand })`) 계산에도 **같은 `rand`가 전파**된다(`src/index.js:106-109`). 즉 `random`만 고정해도 카운터 초깃값과 (전역이 비어 있는 환경이라면) fingerprint까지 결정적으로 만들 수 있다. 다만 `globalObj`에 실제 전역 키가 있는 일반 실행 환경에서는 `fingerprint`가 `globals`(환경 의존 문자열)와 섞이므로, 완전한 재현을 위해 README는 `random`과 `fingerprint`를 **둘 다** 명시적으로 고정하는 예시를 든다(`README.md:128-137`, `fingerprint: "a-custom-host-fingerprint"`).
- 실제 결정적 테스트 확인(`src/index-test.js:312-331`, "CSPRNG" describe 블록): 호출 횟수를 세는 `customRandom = () => { callCount++; return 0.5; }`를 `init({ random: customRandom })`에 주입하고, `callCount > 0`으로 커스텀 함수가 실제로 쓰였음을 검증한다. `0.5` 고정값이 매 호출 같은 값이라 `createEntropy`의 각 자리가 `Math.floor(0.5*36).toString(36)` = 고정 문자로만 채워지는 등, **결정적 재현이 실제로 가능**함을 코드로 확인했다.
- `length > bigLength`(32) 검증 실패는 `Error`(라이브러리 자체 `RangeError`가 아니라 평범한 `Error`)를 던진다(`src/index.js:111-115`). `src/index-test.js:70-122`가 `length: 33`, `length: 100` 모두 예외를 던지고 메시지에 입력값이 포함되는지(`errorMessage.includes("100")`)까지 검증한다. 하한(`length < 2` 등)은 코드에 별도 검증이 없다(주석의 "between 2 and 32"라는 문구와 달리 하한 체크 코드는 없음 — README/주석과 실제 검증 로직 사이의 괴리).

### 2.5 monotonicity를 의도적으로 제거한 근거

소스 코드 자체(`src/index.js`)에는 monotonicity 관련 주석이 없다. 근거는 `README.md`에 세 갈래로 남아 있다.

1. "Cuid used roughly monotonically increasing ids for database performance reasons. Some people abused them to select data by creation date."(`README.md:282`) — 대안으로 별도 인덱싱된 `createdAt` 필드를 권장.
2. 단조 ID를 쓰지 말아야 할 이유 3가지(`README.md:283-286`):
   - "It's easy to trick a client system to generate ids in the past or future."
   - "Order is not guaranteed across multiple hosts generating ids at nearly the same time."
   - "Deterministically monotic resolution was never guaranteed."
3. 보안 관점의 근거(`README.md:288`): "In Cuid2, the hashing algorithm uses a salt... This makes it much more difficult for an attacker to guess valid ids, as the salt changes with each id." — `salt`는 `2.1`의 `createEntropy(length, rand)`이며, 코드 주석은 "salt should be long enough to be globally unique across the full length of the hash. For simplicity, we use the same length as the intended id output."라고 설명한다(`src/index.js:124-126`).

추가로 `README.md:294-317`("Note on K-Sortable/Sequential/Monotonically Increasing Ids")에 분산 시스템에서 k-sortable ID가 index hotspot을 유발해 오히려 느리다는 성능 논거, `README.md:331,343-345`에 "k-sortable = insecure" 보안 논거가 더 있다.

### 2.6 테스트 코드의 충돌·분포 검증

세 파일에 걸쳐 있다.

**`src/collision-test.js`** — 대량 충돌 테스트(worker_threads 병렬화):

- `n = 7 ** 8 * 2`(= 11,529,602)개 ID를 7개 워커에 분산 생성(`collision-test.js:38-41`).
- `new Set(ids).size === n`으로 무충돌 검증(`collision-test.js:56-61`).
- 워커 1개의 `histogram`(아래 `buildHistogram` 참고)이 기대 bin 크기의 ±5% 이내인지 검증(`collision-test.js:48-51,63-68`).
- 모든 ID가 `/^[a-z0-9]+$/`인지 형식 검증(`collision-test.js:70-75`).

**`src/histogram.js`** — 문자 빈도 + 값 분포:

- `n = 100000`개 생성 후 `Set` 크기로 무충돌 확인(`histogram.js:12-17`).
- 첫 2글자(`id.slice(2)`, 첫 글자는 항상 알파벳이라 편향되므로 제외 — 주석 `histogram.js:30-31`)의 문자 빈도를 세어, 기대 bin 크기의 ±10% 이내이고 36개 문자가 모두 등장하는지 검증(`histogram.js:19-61`).
- ID를 BigInt(`test-utils.js`의 `idToBigInt`, `bignumber.js` 기반)로 변환해 20개 버킷에 분류하고, 버킷 크기가 ±10% 이내인지 검증(`histogram.js:64-83`).

**`src/test-utils.js`**:

- `createIdPool({ max })`(`test-utils.js:31-48`)이 `max`개 `createId()`를 `Set`에 채우면서, 삽입 중 `set.size < i`가 되는 순간(=충돌 발생)을 감지해 로그로 남긴다(실패 처리는 아니고 로그만, `test-utils.js:37-40`). 실제 pass/fail 판정은 호출부(`collision-test.js`, `histogram.js`)의 `assert`가 한다.
- `idToBigInt`(`test-utils.js:6-10`)는 ID 문자열을 36진수로 해석해 `BigNumber`로 환산한다.

README(`README.md:357`)는 "Before each commit, we test over 10 million ids generated in parallel across 7 different CPU cores... any bias would make it more likely for ids to collide, so our tests will automatically fail if it finds any."라고 CI 정책을 명시한다. `collision-test.js`의 `n = 7**8*2 ≈ 1153만`이 이 수치에 대응한다.

## 3. 장점 — 구체적 근거

- **단일 entropy source 신뢰 회피.** `createRandom()`은 기본으로 `globalThis.crypto.getRandomValues`를 쓰지만(`src/index.js:13-26`), 이것이 유일한 무작위성이 아니라 `time`(`Date.now`), `salt`(pseudorandom), `count`(세션 카운터), `fingerprint`(호스트) 4가지와 해시로 섞인다(`src/index.js:128`). 한 소스가 약해도(README 논거: 브라우저 CSPRNG 버그 사례, `README.md:165`) 전체가 무너지지 않는다는 설계 의도가 코드 구조에 그대로 반영돼 있다.
- **세션 카운터 초기화 방식.** 카운터를 0이 아니라 `Math.floor(rand() * initialCountMax)`(`initialCountMax = 476782367`, `src/index.js:100,107`)로 무작위 초기화해, 단일 ID만 생성해도 카운터가 엔트로피를 낭비하지 않고 오히려 난수를 확장한다(`README.md:263-265`의 설명과 일치).
- **해시 앞부분 편향 제거.** `hash()` 내부와 호출부 양쪽에서 `.slice(1)`/`substring(1, length)`로 결과 첫 글자를 버려 히스토그램 좌측 편향을 막는다(`src/index.js:58-59,61-63,130`). 이 근거를 주석으로 명시해뒀다.
- **대규모 CI 회귀 검증.** 커밋마다 1000만+ 개 규모(로컬 재현 `collision-test.js`는 약 1153만 개)로 충돌·분포 회귀를 검사하는 것이 코드로 확인된다(`collision-test.js:36-77`).
- **결정적 테스트 지원이 실제 코드로 검증됨.** `init({ random })` 주입이 실제로 카운터 초깃값과 fingerprint 기본값까지 전파되어(`src/index.js:106-109`), 완전한 결정론(카운터+fingerprint까지)을 원하면 `random`과 `fingerprint`를 함께 고정하면 된다는 것이 README 예시(`README.md:128-137`)와 코드 흐름 양쪽에서 일관된다.

## 4. 단점/트레이드오프 — 구체적 근거

- **런타임 의존성 2개.** `@noble/hashes`(SHA3), `bignumber.js`(임의정밀도 정수), `error-causes`가 `dependencies`에 있다(`package.json:76-80`). "런타임 의존성 0"을 요구하는 `@cp949/random`과 정반대 설계다. `@noble/hashes`는 감사(audit)된 라이브러리로 알려져 있으나, cuid2를 쓰는 순간 그 의존성 트리(및 향후 버전 변경)도 감사 대상에 들어간다.
- **해싱 오버헤드.** ID 하나당 SHA3-512 해시 1회 + `BigNumber` 임의정밀도 산술(바이트 64개를 `multipliedBy(256).plus()`로 순차 누적, `src/index.js:47-55`) + 36진수 문자열 변환이 필요하다. `nanoid`류(바이트→문자 직접 매핑, 곱셈·나눗셈 없음)보다 연산이 명백히 무겁다. README는 이를 "But not too fast"로 오히려 장점처럼 서술하지만(`README.md:18`, 병렬 공격 저항 목적), CPU 비용 자체는 사실이다. 정량 벤치마크는 로컬 저장소에 없다("확인 안 됨").
- **엔트로피 소스가 5종으로 늘어나 감사 표면이 커진다.** `createRandom`(CSPRNG), `createEntropy`(pseudorandom, modulo 인덱싱), `Date.now`(시각), 세션 카운터, host fingerprint(`Object.keys(globalObj)` + fallback pseudorandom) — 각각이 별도의 실패 모드를 가진다. 예:
  - `createRandom()`은 `crypto.getRandomValues`가 없으면 **조용히 `Math.random`으로 폴백**한다(`src/index.js:27-29`, `return Math.random;`). 예외를 던지지 않는다. `@cp949/random`이 `SecureRandomUnavailableError`로 명시적으로 실패시키는 것과 반대다 — cuid2는 가용성을 우선하고 보안 저하를 감춘다.
  - `createFingerprint`가 fallback으로 쓰는 `createEntropy`, `randomLetter`, `createEntropy`(salt)는 모두 `Math.floor(rand() * n)` 형태의 **modulo/인덱싱 방식**이지 rejection sampling이 아니다(`src/index.js:38,70`). `rand()`가 완전한 균등분포가 아니면(특히 폴백된 `Math.random`) 편향이 그대로 남는다. `@cp949/random`의 "byte % n 금지, rejection sampling 사용"(C-7) 원칙과 반대되는 구현이다.
  - `length` 검증은 상한(`> bigLength`)만 코드로 존재하고 하한 체크가 없다(`src/index.js:111-115`). 음수나 0 같은 값을 넣으면 별도 `RangeError` 없이 `hash(...).substring(1, length)`가 빈 문자열이나 예상 밖 값을 낼 수 있다(로컬에서 직접 실행해 재현하지는 않았고, 코드상 하한 검증 부재만 확인).
- **`repository`와 `homepage`의 조직명 불일치**(`ericelliott/cuid2` vs `paralleldrive/cuid2`, `package.json:39-41,57`)는 유지보수 이관/포크 이력을 시사하나, 로컬 소스만으로는 원인이 확인되지 않는다("확인 안 됨").
- **fingerprint의 "모든 전역 이름을 해싱한다"는 설명이 과장.** 실제로는 `Object.keys(globalObj)`(enumerable own key)만 쓰고(`src/index.js:86`), 클라우드 컨테이너처럼 전역이 균일한 환경에서는 사실상 무력화되어 pseudorandom fallback으로 대체된다(`src/index.js:87-89`, README도 인정 `README.md:255`). 즉 "5종 entropy"의 5번째가 특정 환경에서는 사실상 3번째(pseudorandom)의 재탕이 될 수 있다.

## 5. `@cp949/random`이 배울 점

### 5.1 단일 `getRandomValues` 신뢰 vs cuid2의 다중 entropy 혼합

`@cp949/random/id`는 무작위 ID 전부(`nanoid`, `randomId`, `uuidv4`, `uuidv7`)가 `globalThis.crypto.getRandomValues` 단일 경로만 신뢰하고, 미지원 환경에서는 조용히 폴백하지 않고 `SecureRandomUnavailableError`로 명시적으로 실패한다(`docs/api/id.md`의 "사용 환경", C-3). cuid2는 그 반대로 시각·카운터·호스트 지문까지 섞어 "한 소스가 뚫려도 전체 엔트로피가 무너지지 않는다"는 방어적 설계를 취하되, `getRandomValues`가 없으면 `Math.random`으로 **조용히** 격하한다(`src/index.js:27-29`).

- 두 설계는 트레이드오프가 다르다: `@cp949/random`은 "실패를 감추지 않는다"(C-6: 오류 3종 한정, 감싸지 않고 전파)는 원칙을 지키는 대신 단일 장애점(`getRandomValues`)에 의존한다. cuid2는 가용성(오프라인·구형 환경에서도 항상 ID를 낸다)을 우선하는 대신 실패를 감추고 편향(modulo 인덱싱)을 허용한다.
- `@cp949/random`이 cuid2에서 **가져올 만한 것**은 다중 entropy 자체(런타임 의존성 0, 무편향 rejection sampling 원칙과 충돌한다)가 아니라, "보안 저하를 절대 조용히 넘기지 않는다"는 지금의 원칙을 문서에 cuid2와 대조해 더 명시적으로 서술하는 것이다. 즉 `docs/api/id.md`의 "사용 환경" 절에 "cuid2처럼 CSPRNG 부재 시 `Math.random`으로 자동 폴백하지 않는다"는 대비 문장을 추가하면, 왜 폴백을 거부했는지의 설계 근거가 더 뚜렷해진다.

### 5.2 `init()`의 결정적 테스트 주입 패턴 vs `createUuidv7Factory` 등의 factory 옵션

둘 다 "생성 시점에 난수원을 주입해 결정적 테스트를 가능하게 한다"는 목표는 같지만 구조가 다르다.

| 항목                  | cuid2 `init({random, length, fingerprint})`                                                                                                                   | `@cp949/random/id`의 `createUuidv7Factory({randomBytes, now})` 등                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 주입 시점 검증        | `length`만 생성 시점에 검사(상한만, 하한 없음)하고 나머지는 검사 없이 그대로 클로저에 캡처 (`src/index.js:110-115`)                                           | 옵션 객체를 생성 시점에 한 번 읽고 값 자체는 검증하지 않되(함수인지만), **주입 함수의 반환값은 매 호출마다 재검증**한다(`docs/api/id.md`의 "주입 결과 검사": `instanceof Uint8Array`·길이 일치, 아니면 그 호출만 `RangeError`) |
| 주입 값의 전파 범위   | `random` 하나를 주입하면 `counter` 초깃값과 `fingerprint` 기본값 계산에도 **암묵적으로 전파**된다(`src/index.js:106-109`) — 재현하려면 부작용까지 이해해야 함 | 각 팩토리(`createUuidv4Factory`, `createUuidv7Factory`)의 주입은 **그 팩토리의 상태에만** 국한되고 문서가 "생성기는 각자 옵션과 난수원을 가지며 서로 상태를 공유하지 않는다"를 명시(`docs/api/id.md` "독립성" 행)              |
| 주입 실패 시 동작     | 없음 — `random`이 이상한 값을 반환해도 별도 오류 없이 그대로 문자열 변환에 쓰인다                                                                             | 주입 `randomBytes`가 잘못된 타입/길이를 반환하면 그 호출이 `RangeError`이고 상태는 바뀌지 않는다(`docs/api/id.md`의 "실패 순서")                                                                                               |
| 진짜 결정론 달성 조건 | `random`만으로는 부족할 수 있다(전역이 있는 환경). `fingerprint`까지 명시적으로 고정해야 완전 결정적(`README.md:128-137`)                                     | `randomBytes` + `now`만 고정하면 완전 결정적(`docs/api/id.md`의 `createUuidv7Factory` 예시, `fixed()`가 항상 같은 UUID를 냄) — 숨은 전파 경로가 없다                                                                           |

**배울 점(실행 가능한 형태로):**

1. cuid2의 `init`은 주입값이 여러 내부 상태(카운터 초깃값, fingerprint)에 암묵적으로 번지는 구조라 "무엇을 고정해야 완전히 결정적인지"가 README를 읽어야만 드러난다. `@cp949/random`의 factory들은 이미 이 문제를 "옵션마다 독립"으로 피하고 있다 — 이 설계를 유지·강조하는 것이 현재로선 옳다. 새 factory(예: 향후 `randomId`류에 factory를 늘릴 때)를 설계할 때도 "주입값이 다른 기본값 계산에 안 새게" C-4/R2 주입 규칙(옵션 객체 한 번만 읽기, 주입은 그 인스턴스에만 국한)을 그대로 지킨다.
2. cuid2는 주입된 난수 함수의 **반환값 유효성을 검사하지 않는다**(`random`이 `NaN`이나 범위 밖 값을 내도 그대로 진행). `@cp949/random`은 이미 `instanceof Uint8Array` + 길이 검사로 이를 막고 있다(`docs/api/id.md`, `createUuidv4Factory`/`createUuidv7Factory`의 "주입 결과 검사" 행) — 이 검증을 다른 곳에도 일관되게 유지한다. cuid2 사례는 "주입 지점을 늘릴 때마다 반환값 검증도 같이 늘려야 한다"는 반면교사다.
3. cuid2의 `createFingerprint`처럼 "환경에 따라 조용히 다른 entropy 소스로 대체"하는 fallback은 `@cp949/random`의 "실패를 감추지 않는다"(C-6) 원칙과 배치된다. `@cp949/random`이 향후 환경 의존적 값(예: 호스트 식별)을 다루는 기능을 추가할 일이 생기면, cuid2처럼 조용한 fallback 대신 지금처럼 명시적 오류나 명시적 옵션으로 처리하는 편이 일관적이다.
4. cuid2의 대량 충돌·분포 테스트(1000만+ 개, worker_threads 병렬화, ±5~10% 히스토그램 허용오차)는 `@cp949/random`의 VER-1(`docs/product/id-generator-requirements.md`)이 이미 요구하는 "문자 빈도 통계로 균등성 검증"과 방향이 같다. cuid2의 구체적 수치(±5%, ±10% tolerance, bucket 개수 20)를 `@cp949/random`의 분포 검증 스펙을 작성할 때 참고 기준점으로 삼을 수 있다.

## 6. 참고 자료

- 로컬 클론: `/work/thrd/cuid2` (커밋 `f9c0cda7bde460eaeeb5b3f0e625da24823e5ecb`, 2026-08-12)
  - `src/index.js`, `src/index-test.js`, `src/collision-test.js`, `src/histogram.js`, `src/test-utils.js`, `package.json`, `README.md`, `LICENSE`
- 원본 GitHub: https://github.com/paralleldrive/cuid2 (homepage), https://github.com/ericelliott/cuid2 (`package.json`의 `repository.url`)
- 개요 수준 선행 조사: `/work/cp949/random/docs/research/similar-libraries.md` "cuid2" 절 (87-100행)
- 대조 대상 문서: `/work/cp949/random/docs/api/id.md`, `/work/cp949/random/docs/product/id-generator-requirements.md`
