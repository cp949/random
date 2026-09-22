# nanoid (ai/nanoid) 심층 분석

로컬 클론 `/work/thrd/nanoid`의 실제 소스(`index.js`, `index.browser.js`, `non-secure/index.js`,
`url-alphabet/index.js`, `index.d.ts`, `package.json`, `README.md`, `test/benchmark.js`)를 직접
읽고 확인했다. README 요약이 아니라 코드 근거 기준으로 작성한다.

## 1. 개요

- 패키지명: `nanoid`. 버전: **6.0.1** (`package.json:3`).
- 로컬 클론 커밋: `57009b5eb8d757ae39bf5f4361dd30c9f23391b7` (2026-09-16, `git log -1`).
- 원 저장소: `ai/nanoid` (`package.json:16` `repository` 필드) → https://github.com/ai/nanoid
- 라이선스: MIT, Copyright 2017 Andrey Sitnik (`LICENSE`).
- 런타임 의존성 0 (`package.json`에 `dependencies` 필드 자체가 없음, `devDependencies`만 존재).
- `package.json:76`의 `engines.node`: `"^22 || ^24 || >=26"` — Node 22 미만은 공식 지원 밖(6.x 기준. `@cp949/random`의 브라우저 Chrome75/ES2019 하한과는 타깃이 다르다).
- 번들 크기: `package.json`의 `size-limit` 블록(`package.json:62-88`)이 기준.
  - `{ nanoid }` import: **127 B** 한도 (`package.json:64-68`)
  - `{ customAlphabet }`: 219 B (`package.json:69-73`)
  - `{ urlAlphabet }`: 58 B (`package.json:74-78`)
  - non-secure `{ nanoid }`: 103 B, non-secure `{ customAlphabet }`: 66 B (`package.json:79-88`)
  - README도 동일 수치를 "127 bytes (minified and brotlied)"로 표현한다(`README.md:16`).
  - 이 127 B는 브라우저 번들 기준이다. `package.json:20-22`의 `browser` 필드가 `./index.js`를
    `./index.browser.js`로 치환하므로, size-limit(webpack 기반)이 측정하는 실제 코드는
    `index.browser.js`다. 저장소 루트의 `nanoid.js`(사전 빌드된 minified 산출물, 190 bytes 원본)를
    직접 열어보면 `index.browser.js`의 `nanoid` 함수를 그대로 minify한 코드와 바이트 단위로 일치한다
    (둘 다 `crypto.getRandomValues(new Uint8Array(size))` 후 `& 63` 마스킹 루프). brotli 압축 후
    정확히 127 B가 되는지는 로컬에 brotli 도구가 없어 직접 재현하지 못했다 — **확인 안 됨**(수치의
    출처는 `package.json`의 size-limit 설정과 README, 둘 다 같은 값을 명시한다는 사실까지만 확인).
  - 별도의 `.size-limit.json` 같은 외부 설정 파일은 없다. `package.json`의 `size-limit` 키와
    `scripts.test:size` (`"pnpm clean && size-limit"`, `package.json:47`)가 전부다.

## 2. 핵심 구현 상세

### 2.1 기본 `nanoid()`와 `crypto.getRandomValues`

Node 진입점(`index.js`)의 `nanoid`는 별도 함수가 아니라 `customAlphabet(urlAlphabet)`의
결과다.

```
index.js:177  export const nanoid = customAlphabet(urlAlphabet)
```

브라우저 진입점(`index.browser.js`, `package.json`의 `browser`/`react-native` 필드로 치환)은
전용 구현을 따로 둔다.

```
index.browser.js:10  export let random = bytes => crypto.getRandomValues(new Uint8Array(bytes))
index.browser.js:75-84
  export let nanoid = (size = 21) => {
    let id = ''
    let bytes = crypto.getRandomValues(new Uint8Array((size |= 0)))
    while (size--) {
      id += urlAlphabet[bytes[size] & 63]
    }
    return id
  }
```

Node용 `random()`(`index.js:18-27`)은 65536바이트 제한(`GET_RANDOM_LIMIT`, `index.js:7`)을
넘으면 `crypto.getRandomValues`를 청크로 나눠 호출한다(`fillRandom`, `index.js:9-16`). 이는
`@cp949/random`의 `fillRandom`(`packages/random/src/internal/bytes.ts:19-25`, 상수명
`MAX_REQUEST_BYTES = 65_536`, `bytes.ts:11`)과 청크 크기·분할 로직이 동일한 전략이다.

alphabet 상수:

```
url-alphabet/index.js:11-12
  export let urlAlphabet =
    'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict'
```

64자, `A-Za-z0-9_-` 집합을 gzip/brotli 압축률이 좋은 순서로 재배열한 것이라고 주석에 명시되어
있다(`url-alphabet/index.js:1-10`, "The order of characters is optimized for better gzip and
brotli compression").

### 2.2 `customAlphabet`의 비트마스크 rejection sampling

`customAlphabet(alphabet, defaultSize)`(`index.js:96-175`)는 alphabet 형태에 따라 두 갈래로
갈라진다.

1. **다중 바이트 문자 포함 또는 256자 초과** → `customRandom`에 위임(`index.js:97-110`).
2. **단일 바이트 문자(≤256자)** → 바이트 버퍼 직접 조작 경로.

경로 2 안에서 다시 두 갈래:

- **`alphabetLen`이 2의 거듭제곱** (`mask === alphabetLen - 1`, `index.js:143`): 모든 바이트를
  거부 없이 받아들인다(`fillRandom` 후 `buffer[i] = charCodes[buffer[i] & mask]`,
  `index.js:146-149`). `urlAlphabet`(64자)이 여기 해당하므로 기본 `nanoid()`는 rejection이 전혀
  없다.
- **`alphabetLen`이 2의 거듭제곱이 아님**: 비트마스크 계산과 재시도 루프.

```
index.js:117-119
  // The smallest `2^n - 1` covering all alphabet indexes. Rejecting
  // `byte & mask >= alphabetLen` avoids modulo bias without `%` operation.
  let mask = (2 << (31 - Math.clz32((alphabetLen - 1) | 1))) - 1
```

`Math.clz32((alphabetLen-1)|1)`로 `alphabetLen-1`의 최상위 비트 위치를 구해 이를 덮는 최소
`2^n - 1` 마스크를 만든다. 예: `alphabetLen = 17` → `alphabetLen-1 = 16 = 0b10000` →
`mask = 31(0b11111)`. `%` 대신 `&`만 쓰기 위한 설계다(주석이 명시).

재시도(retry) 루프:

```
index.js:150-168
  } else {
    // Rejection sampling accepts `alphabetLen` of every `mask + 1`
    // random bytes. `1.6` requests extra bytes to cover
    // unlucky streaks in most fills.
    let randomBytes = Buffer.allocUnsafe(
      Math.ceil((1.6 * (mask + 1) * target) / alphabetLen)
    )
    let accepted = 0
    while (accepted < target) {
      fillRandom(randomBytes)
      for (let i = 0; i < randomBytes.length; i++) {
        let index = randomBytes[i] & mask
        if (index < alphabetLen) {
          buffer[accepted++] = charCodes[index]
          if (accepted === target) break
        }
      }
    }
  }
```

`1.6`은 벤치마크로 정한 매직 넘버로 주석에 명시되어 있다(`index.js:66-67`, `customRandom`
쪽에도 동일 문구). 부족하면 `while (accepted < target)`이 `fillRandom`을 다시 호출해 재시도한다
(상한 없는 재시도 루프).

alphabet 길이가 2의 거듭제곱이 아닐 때 이 마스크 방식의 거부율은 cutoff/modulo 방식보다 훨씬
높을 수 있다. 예의 `alphabetLen=17` 경우 `mask+1=32`이므로 허용 확률은 `17/32 ≈ 53%`(거부율
약 47%)다. 반면 아래 2.3의 `customRandom`이 쓰는 `safeByteCutoff` 방식은 같은 17자 alphabet에서
`safeByteCutoff = 256 - (256 % 17) = 255`이므로 거부율이 `1/256 ≈ 0.4%`에 불과하다. 즉 nanoid는
**같은 라이브러리 안에서 두 가지 rejection 전략을 alphabet 형태별로 다르게 쓴다**: 바이트 버퍼
직접 조작(풀링) 경로는 비트 연산 단순함을 위해 높은 거부율을 감수하고, `customRandom` 위임
경로는 나눗셈(`%`) 비용을 감수하는 대신 거부율을 최소화한다.

풀링(pool) 최적화 — `customAlphabet`이 돌려주는 함수는 호출마다 새로 랜덤을 뽑지 않고, 문자열
풀을 캐시해 여러 번 호출에 걸쳐 재사용한다.

```
index.js:94   const POOL_MAX = GET_RANDOM_LIMIT / 2
index.js:129-131  let pool = ''; let poolOffset = 0; let poolNext = 0
index.js:139-141
  if (poolOffset + size > pool.length) {
    let target = Math.max(poolNext, size)
    poolNext = Math.min(target * 16, POOL_MAX)
    ...
index.js:169-173
  pool = buffer.toString('latin1')
  poolOffset = 0
  ...
  poolOffset += size
  return pool.substring(poolOffset - size, poolOffset)
```

풀이 부족할 때만 `target`(직전 풀 크기와 요청 크기 중 큰 값)만큼 다시 채우고, 다음 풀 크기를
`target * 16`(상한 `POOL_MAX = 32768`바이트)으로 기하급수적으로 늘린다. 주석(`index.js:89-92`)에
이 문자열 풀 최적화가 Orhan Aydoğdu의 `nope-id` 프로젝트에서 이식됐다고 명시돼 있다.

### 2.3 `customRandom(alphabet, size, randomGenerator)` — 난수원 주입

```
index.js:29     export function customRandom(alphabet, defaultSize, getRandom) {
index.js:40     let safeByteCutoff = 256 - (256 % alphabet.length)
index.js:68     let step = Math.ceil((1.6 * 256 * defaultSize) / safeByteCutoff)
index.js:70-86  return (size = defaultSize) => {
                   ...
                   let bytes = getRandom(step)
                   ...
                   if (bytes[i] < safeByteCutoff) {
                     id += alphabet[bytes[i] % alphabet.length]
                     ...
```

세 번째 인자 `getRandom`은 `(size: number) => Uint8Array`(`index.d.ts` `customRandom` 타입
시그니처) 형태의 순수 함수이며, 클로저 캡처 외 다른 결합 없이 그대로 호출된다
(`index.js:50`, `index.js:74`). 기본 `random`(node: `index.js:18-27` 버퍼 기반,
browser: `index.browser.js:10` `crypto.getRandomValues` 기반)을 넘기면 `customAlphabet`과 같고,
seed 기반 PRNG나 테스트용 결정적 함수로 자유롭게 교체할 수 있는 구조다. README도 이 구조를
"between Nano ID versions we may change random generator call sequence"(`README.md:245-247`)라고
명시해 — 버전 간 바이트 소비 순서가 계약이 아님을 밝힌다.

alphabet 길이가 2의 거듭제곱이면(`safeByteCutoff === 256`) `customRandom`도 마스크 전용 경로로
빠진다(`index.js:43-60`, `index.browser.js:26-43`) — 이때는 거부가 전혀 없다.

### 2.4 `non-secure/index.js`와 "non-secure가 더 느리다"는 주장

```
non-secure/index.js:5-17
  export let customAlphabet = (alphabet, defaultSize = 21) => {
    return (size = defaultSize) => {
      let id = ''
      let i = size | 0
      while (i-- > 0) {
        id += alphabet[(Math.random() * alphabet.length) | 0]
      }
      return id
    }
  }
non-secure/index.js:19-29  (nanoid도 동일 구조, urlAlphabet 고정)
```

`Math.random()`을 직접 쓰며 rejection sampling이 전혀 없다(모듈로 편향 감수, 보안 무작위성도
없음 — README가 "the unsafe `Math.random()`"이라 명시, `README.md:99`). README는
"non-secure version is _slower_ than secure"(`README.md:260`)라고만 말하고 이유를 설명하지
않지만, 코드 구조를 비교하면 원인이 드러난다: **풀링이 없다.** `non-secure`는 문자 하나마다
`Math.random()` 호출 + 문자열 연결을 반복하고, 호출 간 캐시나 재사용 상태가 전혀 없다. 반면
node `index.js`의 기본 `nanoid`(`customAlphabet(urlAlphabet)`)는 2.2의 문자열 풀을 여러 호출에
걸쳐 공유해 `crypto.getRandomValues` 호출 자체를 amortize한다. `test/benchmark.js`의 실측치가
이를 뒷받침한다(`README.md:76-93`):

```
nanoid                  20,434,827 ops/sec   (node, 풀링 있음)
nanoid for browser         311,497 ops/sec   (browser.js, 풀링 없음, 매 호출 crypto 직접 호출)
nanoid/non-secure        2,397,594 ops/sec   (풀링 없음, Math.random)
```

`Math.random()`이 `crypto.getRandomValues`보다 훨씬 싼데도 `non-secure`(2.4M ops/sec)가 풀링을
쓰는 node `nanoid`(20.4M ops/sec)보다 8.5배 느리고, 심지어 풀링 없이 crypto만 쓰는
`nanoid for browser`(311K ops/sec)보다는 8배 빠르다 — 즉 속도 차이의 주 원인은 RNG 종류가
아니라 **풀링 유무**이고, RNG 비용은 부차적이다. README 문구 자체는 정성적 결론("slower")만
제공하고 이 원인 분석은 소스 구조 비교에서 도출한 추론이다(README에 명시적 인과 설명은 없음).

### 2.5 충돌 확률 근거

```
README.md:59-63
  Nano ID is quite comparable to UUID v4 (random-based).
  It has a similar number of random bits in the ID
  (126 in Nano ID and 122 in UUID), so it has a similar collision probability:

  > For there to be a one in a billion chance of duplication,
  > 103 trillion version 4 IDs must be generated.
```

기본 21자 × log2(64) = 126비트. UUID v4는 122비트(128비트 중 6비트가 버전/변형 고정 비트). 이
비트 수 비교가 "UUID v4와 비슷한 충돌 확률"이라는 주장의 근거다. `index.d.ts`의 `nanoid` 문서
주석도 "By default, the ID will have 21 symbols to have a collision probability similar to UUID
v4"라고 동일 주장을 반복한다. 정량적 계산기는 외부 링크로만 제공한다
(`[ID collision probability]: https://zelark.github.io/nano-id-cc/`, `README.md:178`) — 저장소
안에 자체 계산 코드나 테스트는 없다.

## 3. 장점 (코드 근거)

- **런타임 의존성 0, 매우 작은 번들.** `package.json`에 `dependencies` 없음. 브라우저 번들
  127 B(size-limit 강제, `package.json:64-68`) — CI가 이 한도를 실제로 검사한다
  (`scripts.test:size`, `package.json:47`, `scripts.test`가 `test:*` 전체를 실행).
- **모듈로 편향 제거가 alphabet 형태별로 최적화되어 있다.** 2의 거듭제곱 alphabet은 마스크
  전용(거부 0%), 임의 alphabet은 비트마스크(`customAlphabet` 내부 경로) 또는 modulo cutoff
  (`customRandom`)로 나뉘어 각 경로에서 불필요한 연산(나눗셈 또는 높은 거부율)을 최소화하려는
  설계 의도가 코드에 드러난다(2.2, 2.3).
- **문자열 풀링으로 반복 호출 성능 극대화.** `POOL_MAX`/`poolNext` 기하급수적 성장
  (`index.js:94, 129-141`)으로 짧게 쓰고 버리는 생성기는 풀을 작게, 오래 반복 호출하는 생성기는
  풀을 키워 시스템 콜(`crypto.getRandomValues`) 횟수를 줄인다. 벤치마크 수치(20M+ ops/sec)가
  이를 실증한다(`README.md:76-93`).
- **난수원 주입 구조(`customRandom`)가 순수 함수 인터페이스.** `(size) => Uint8Array` 하나만
  맞추면 되므로 테스트 결정성이나 다른 RNG로 교체가 쉽다. 단 "버전 간 바이트 소비 순서 변경
  가능"을 README가 명시해(`README.md:245-247`) 시드 기반 재현성은 계약이 아님을 스스로 인정한다.
- **65536바이트 청크 분할**(`GET_RANDOM_LIMIT`, `index.js:5-16`)로 `getRandomValues`의
  `QuotaExceededError`를 원천 차단 — `@cp949/random`의 `fillRandom`과 동일 전략(이미 채택됨).

## 4. 단점/트레이드오프 (코드 근거)

- **`nanoid()`에 alphabet/길이 조정 여지가 없다.** 기본 진입점은 `urlAlphabet` 고정, 커스텀은
  별도 함수(`customAlphabet`/`customRandom`) 학습이 필요 — API 표면이 3단계(`nanoid` →
  `customAlphabet` → `customRandom`)로 나뉜다.
- **Node/브라우저 구현이 이원화되어 동작이 다르다.** node의 기본 `nanoid`는 풀링된
  `customAlphabet(urlAlphabet)`(`index.js:177`)이지만 브라우저는 전용 비풀링 구현
  (`index.browser.js:75-84`)이다. 두 파일을 별도로 유지보수해야 하고, 실측 성능 차이도
  20.4M vs 311K ops/sec으로 65배 이상 벌어진다(README 벤치마크) — 번들 크기를 줄이려고 브라우저
  경로에서 풀링을 뺀 트레이드오프로 보인다(코드에 명시적 설명 주석은 없음 — 여기까지는 추론).
- **`non-secure`가 이름과 달리 "빠른 대안"이 아니다.** README가 "note that non-secure version
  is slower"(`README.md:260`)라고 스스로 밝힌다. 보안을 포기해도 성능 이득이 없고 오히려
  손해라는 점은 오해하기 쉬운 트레이드오프다.
- **비트마스크 rejection(2.2)의 거부율이 alphabet 크기에 따라 크게 달라진다.** 2의 거듭제곱에서
  먼 크기(예: 17, 33, 65 등 `2^n+1` 근방)는 거부율이 50%에 가까워질 수 있다(위 계산례). 반면
  같은 라이브러리의 `customRandom` 경로는 cutoff 방식이라 거부율이 항상 1% 미만이다. 즉
  `customAlphabet`으로 만든 생성기와 `customRandom`으로 만든 생성기가 "같은 alphabet"이어도
  내부 거부율 특성이 다르다 — 사용자가 코드를 읽지 않으면 알기 어렵다.
- **재시도 루프에 상한이 없다.** `customRandom`(`index.js:73-85`)과 `customAlphabet`의 마스크
  경로(`index.js:158-167`) 모두 `while(true)`/`while(accepted<target)`로, 정상 난수원이라면
  실질적으로 무한 루프에 빠질 일은 없지만 코드상 명시적 상한이나 타임아웃은 없다.
- **충돌 확률 계산이 저장소 내부에 없다.** README가 UUID 대비 비트 수 비교("126 vs 122 bits")만
  제공하고 실제 확률 계산기는 외부 사이트(zelark.github.io) 링크로 위임한다. 라이브러리 자체
  코드/테스트에는 확률 계산 로직이 없다.

## 5. `@cp949/random`이 배울 점

`@cp949/random/id`의 `nanoid(length=21)`(`packages/random/src/id/nanoid.ts:20-29`)과
`@cp949/random/secure`의 `randomString`/`pickChars`(`packages/random/src/secure/random-string.ts`,
`packages/random/src/internal/sampling.ts`)를 nanoid 소스와 직접 비교한 결과.

### 5.1 rejection sampling 공식은 이미 nanoid의 "좋은 경로"와 동일하다

`pickChars`의 cutoff 계산:

```
internal/sampling.ts:24  const cutoff = 256 - (256 % size);
```

이는 nanoid `customRandom`의 `safeByteCutoff = 256 - (256 % alphabet.length)`
(`index.js:40`)와 **완전히 동일한 공식**이며, 2의 거듭제곱일 때 전체 수용(`cutoff===256`)하는
분기까지 같은 발상이다(`sampling.ts` 주석 8-9행 vs `index.js:42-59`). 즉 `@cp949/random`은
이미 nanoid가 두 가지 전략 중 **거부율이 낮은 쪽**(modulo cutoff)을 채택한 상태다. nanoid의
`customAlphabet` 전용 비트마스크 경로(2의 거듭제곱이 아닌 alphabet에서 최대 50% 가까운 거부율,
2.2 참조)를 굳이 가져올 필요는 없다 — 오히려 그 경로는 CPU 비용(나눗셈 회피) 대비 난수 낭비가
큰 트레이드오프이므로, 범용 `randomString`에는 `pickChars`의 현재 방식이 더 적합하다.

### 5.2 요청 바이트 수 계산 방식의 차이 — 오버슈트 유무

- nanoid `customRandom`: `step = Math.ceil((1.6 * 256 * defaultSize) / safeByteCutoff)`
  (`index.js:68`) — **고정 매직 넘버 1.6**을 곱해 처음부터 여유 있게 요청하고, 모자라면
  `getRandom(step)`을 다시 통째로 재호출한다(`index.js:73-85`, 매 재시도마다 `step` 전체를
  다시 뽑음).
- `@cp949/random` `pickChars`: `Math.ceil((remaining * 256) / cutoff)`
  (`internal/sampling.ts:28`) — **오버슈트 계수 없이** 남은 개수(`remaining`) 기준으로 정확히
  기대치만큼만 요청하고, 라운드마다 `remaining`을 갱신해 다음 요청 크기를 다시 계산한다
  (`sampling.ts:12-13` 주석: "여유 계수를 곱하지 않는다. 계수는 정확성과 무관하고 `source` 호출
  횟수만 바꾼다").

두 설계 모두 정확성에는 영향이 없다(주석에서 서로 명시). 차이는 성능 특성뿐이다: nanoid는
1.6배 여유로 `getRandom` 호출 횟수(시스템 콜/암호 연산 횟수)를 줄이는 데 최적화했고,
`@cp949/random`은 난수 바이트 낭비를 최소화하는 쪽을 택했다. `@cp949/random`이 대량 호출
시나리오에서 `defaultRandomBytes`(내부적으로 `crypto.getRandomValues` 호출)의 오버헤드가 실측상
유의미하다면, nanoid처럼 **첫 요청에 한해 소폭 오버슈트 계수를 곱하는 옵션**을 벤치마크로
검토할 가치가 있다(현재는 정확성 우선 설계이므로 바꾸려면 명시적 벤치마크 근거가 필요하다 —
현재 근거 없이 바꾸면 회귀다).

### 5.3 문자열 풀링 — nanoid의 핵심 성능 기법은 `@cp949/random`의 API 계약과 충돌한다

nanoid `customAlphabet`은 반환된 생성기 함수가 **여러 호출에 걸쳐 문자열 풀을 캐시**한다
(`index.js:129-173`, 2.2 참조). `@cp949/random`의 `nanoid()`는 매 호출이 완전히 독립적이며,
문서 계약이 이를 명시한다.

```
id/nanoid.ts:11  // 바이트는 `length`개를 한 번에 요청하고 앞에서부터 순서대로 소비한다. 호출 사이에 남는 상태가 없다.
```

이 "호출 사이 상태 없음"은 `@cp949/random`이 `nanoid()`를 팩토리가 아닌 단발 함수로 설계한
결과이며, nanoid의 풀링 기법을 그대로 이식하면 이 계약을 깨게 된다. 풀링을 도입하려면
`createRandomIdFactory`처럼 **명시적으로 상태를 갖는 별도 API**(예: 재사용 가능한 nanoid
생성기 팩토리)로 분리해야 하며, 현재의 단발 `nanoid()` 계약은 그대로 유지하는 편이 API
일관성에 맞다. 벤치마크로 실제 hot-path 병목이 확인되기 전까지는 우선순위 낮음.

### 5.4 청크 분할은 이미 이식되어 있다

nanoid의 `GET_RANDOM_LIMIT`/`fillRandom`(`index.js:5-16`)과 `@cp949/random`의
`MAX_REQUEST_BYTES`/`fillRandom`(`internal/bytes.ts:11, 19-25`)은 상수값(65536)과 분할 전략이
동일하다 — 이미 반영된 사항이며 추가 작업 불필요.

### 5.5 문서화 스타일에서 배울 점

nanoid는 알고리즘 근거를 코드 인접 주석으로 남긴다(`index.js:30-39`의 modulo bias 설명 예시
포함). `@cp949/random`의 `sampling.ts`/`bytes.ts`도 이미 같은 스타일(TSDoc + 공식 유도 주석)을
쓰고 있어 이 부분은 이미 동등하거나 더 상세하다(예: `sampling.ts:11-14`가 재시도 확률까지
`2^-k` 형태로 명시). 유지만 하면 된다.

## 6. 참고 자료

- 로컬 클론: `/work/thrd/nanoid`, 커밋 `57009b5eb8d757ae39bf5f4361dd30c9f23391b7` (2026-09-16)
  - `package.json`, `LICENSE`, `README.md`
  - `index.js`, `index.browser.js`, `non-secure/index.js`, `url-alphabet/index.js`,
    `index.d.ts`, `nanoid.js`
  - `test/benchmark.js`, `test/check-versions.js`
- 원본 GitHub 저장소: https://github.com/ai/nanoid
- ID 충돌 확률 계산기(README가 링크, 저장소 내부 코드 아님): https://zelark.github.io/nano-id-cc/
- 비교 대상 `@cp949/random` 소스:
  - `/work/cp949/random/packages/random/src/id/nanoid.ts`
  - `/work/cp949/random/packages/random/src/secure/random-string.ts`
  - `/work/cp949/random/packages/random/src/internal/sampling.ts`
  - `/work/cp949/random/packages/random/src/internal/bytes.ts`
- 저장소 문서: `/work/cp949/random/CONTEXT.md`, `/work/cp949/random/docs/api/id.md`,
  `/work/cp949/random/docs/guides/id-recipes.md`,
  `/work/cp949/random/docs/research/similar-libraries.md` (nanoid 개요 절)
