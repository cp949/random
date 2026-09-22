# Node.js `crypto` 모듈의 난수 API

`@cp949/random/secure`와 비교하기 위해 Node.js 공식 문서와 소스(GitHub `nodejs/node` main 브랜치)를 직접 확인한 기록이다. `docs/research/similar-libraries.md`의 "Node.js `crypto.randomBytes` 계열" 절(개요 수준, 엔트로피 부족 시 에러 "확인 안 됨")을 이 문서로 대체·구체화한다.

## 1. 개요

- 확인 대상: `node:crypto` 모듈의 난수 관련 export 5개 — `randomBytes`, `randomFillSync`/`randomFill`, `randomInt`, `randomUUID`, `randomUUIDv7`(신규), 그리고 Web Crypto 계열 `getRandomValues`/`webcrypto`.
- 확인한 문서 버전: **Node.js v26.9.0**(2026-09-16 릴리스, `nodejs.org/api/crypto.html` 페이지 상단 표기 및 `https://nodejs.org/dist/index.json`의 최신 항목으로 교차 확인).
- 방법: 공식 문서 페이지(`nodejs.org/api/crypto.html`)는 페이지 전체가 너무 커서 WebFetch 요약이 중간에 잘렸다. 대신 GitHub의 문서 소스 원문(`raw.githubusercontent.com/nodejs/node/main/doc/api/crypto.md`, `errors.md`)과 구현 소스(`lib/internal/crypto/random.js`, `src/crypto/crypto_random.cc`, `src/crypto/crypto_util.h`/`.cc`, `deps/ncrypto/ncrypto.cc`)를 `curl`로 받아 원문을 직접 읽었다. 저장소 전체 클론은 하지 않았다(개별 raw 파일만 fetch).
- 이 문서의 목적은 원론적 비교가 아니라 **엔트로피 부족 시 에러를 소스 레벨까지 추적해 확정하는 것**이다(2절 참조).

## 2. 핵심 사양 상세

### 2.1 `crypto.randomBytes(size[, callback])`

```
crypto.randomBytes(size[, callback])
```

- `size` {number}: 생성할 바이트 수. `2**31 - 1`을 넘을 수 없다.
- `callback` 있음 → 비동기, `(err, buf)`로 호출.
- `callback` 없음 → **동기**로 실행되고 `Buffer`를 반환. "An error will be thrown if there is a problem generating the bytes."
- `added: v0.5.8`.
- 출처: `doc/api/crypto.md` L5944–L6039 (`https://raw.githubusercontent.com/nodejs/node/main/doc/api/crypto.md`).

원문(엔트로피 관련, 그대로 인용):

> "The `crypto.randomBytes()` method will not complete until there is sufficient entropy available. This should normally never take longer than a few milliseconds. The only time when generating the random bytes may conceivably block for a longer period of time is right after boot, when the whole system is still low on entropy."

→ "블록될 수 있다"는 문서화되어 있지만, **실패 시 던지는 에러의 종류**는 이 절에 없다. 에러 종류는 2.3절 소스 추적에서 확정한다.

### 2.2 `crypto.randomFillSync` / `crypto.randomFill`

```
crypto.randomFillSync(buffer[, offset][, size])
crypto.randomFill(buffer[, offset][, size], callback)
```

- `buffer` {ArrayBuffer|Buffer|TypedArray|DataView}, 크기는 `2**31 - 1` 이하.
- `randomFillSync`: 반환 `{ArrayBuffer|Buffer|TypedArray|DataView}` — 인자로 받은 `buffer`를 그대로 반환. **동기 전용**.
- `randomFill`: `callback`이 필수. 없으면 에러. **비동기 전용**(별도 동기 오버로드 없음, 동기가 필요하면 `randomFillSync` 사용).
- `randomFillSync`: `added: [v7.10.0, v6.13.0]`, `randomFill`: 동일.
- 출처: L6040–L6273.
- 소스(`lib/internal/crypto/random.js` L120–L184): `randomFillSync`는 인자 검증 후 `RandomBytesJob`을 `kCryptoJobSync` 모드로 생성해 `job.run()`을 즉시 호출하고, `[err, buf]` 중 `err`가 있으면 `throw err`(L147–L149). `randomFill`은 같은 Job을 비동기 모드로 실행해 콜백에 에러/버퍼를 전달한다.

### 2.3 엔트로피 부족 시 에러 — 소스 레벨 확정

**공식 문서(`crypto.md`)에는 전용 에러 이름이 없다.** "may block" 서술뿐이다. 그러나 소스를 끝까지 추적하면 다음이 확정된다.

1. JS 레이어(`lib/internal/crypto/random.js` L141–L149): 동기 호출은 `RandomBytesJob(kCryptoJobSync, ...).run()[0]`이 에러면 그대로 `throw`.
2. Job 실행 엔진(`src/crypto/crypto_util.h`, `DeriveBitsJob::DoThreadPoolWork`, L627–L643): `DeriveBitsTraits::DeriveBits(...)`가 `false`를 반환하면
   ```cpp
   if (errors->Empty()) errors->Capture();
   if (errors->Empty()) {
     errors->Insert(NodeCryptoError::DERIVING_BITS_FAILED);
     errors->SetNodeErrorCode("ERR_CRYPTO_OPERATION_FAILED");
   }
   ```
   즉 OpenSSL 자체 에러 큐가 비어 있으면(=구체적 OpenSSL 에러가 안 남았으면) **일반화된 코드 `ERR_CRYPTO_OPERATION_FAILED`, 메시지 "Deriving bits failed"**를 강제로 채워 넣는다(`src/crypto/crypto_util.h` L112: `V(DERIVING_BITS_FAILED, "Deriving bits failed")`).
3. `RandomBytesTraits::DeriveBits`(`src/crypto/crypto_random.cc` L68–L74)는 단순히 `return ncrypto::CSPRNG(params.buffer, params.size);`.
4. `CSPRNG()`의 실제 구현(`deps/ncrypto/ncrypto.cc` L807–L841, Node 저장소에 벤더링된 `ncrypto` 라이브러리):
   ```cpp
   bool CSPRNG(void* buffer, size_t length) {
     auto buf = reinterpret_cast<unsigned char*>(buffer);
     do {
       if (1 == RAND_status()) {
         // OpenSSL 3: RAND_bytes_ex, OpenSSL 1.x: RAND_bytes 반복 호출
         // 성공하면 return true;
       }
       // OpenSSL 3에서 DRBG 인스턴스화 실패(RAND_R_ERROR_INSTANTIATING_DRBG 등)면 즉시 return false;
     } while (1 == RAND_poll());
     return false;
   }
   ```
   즉 `RAND_status()`(OpenSSL PRNG가 시드됐는지 확인)가 실패하면 `RAND_poll()`(OS에서 엔트로피를 더 모아 시드를 채우는 OpenSSL 함수)을 반복 호출하며 재시도하고, `RAND_poll()`마저 실패(반환값이 1이 아님)하면 루프를 끝내고 `false`를 반환한다. 이게 문서의 "may block for a longer period of time"의 실체다 — 블로킹은 이 `do...while(RAND_poll())` 재시도 루프다.

**결론(확정)**: 시스템이 정말로 엔트로피를 채우지 못해 `RAND_poll()`이 끝내 실패하면, JS 쪽에는 **`code: 'ERR_CRYPTO_OPERATION_FAILED'`, `message: 'Deriving bits failed'`인 일반 `Error`**가 동기 호출은 `throw`로, 비동기 호출은 콜백의 `err`로 전달된다. `ERR_CRYPTO_OPERATION_FAILED`는 `doc/api/errors.md` L1197–L1203에 공식 문서화되어 있으나 설명이 "A crypto operation failed for an otherwise unspecified reason."로 범용적이며, **randomBytes 계열 전용 에러 코드는 없다**(키 생성 실패, ECDH 실패 등 다른 실패도 같은 코드를 공유한다). 이 에러 코드-메시지 조합은 공식 문서 어디에도 "엔트로피 부족 시 이 에러가 난다"고 명시돼 있지 않다 — **오직 소스 추적으로만 확정 가능했다.** 공식 문서 프로즈 차원에서는 "확인 안 됨"이 맞고, 소스 차원에서는 위 체인으로 **확정**이다.

- 출처: `src/crypto/crypto_util.h`(`https://raw.githubusercontent.com/nodejs/node/main/src/crypto/crypto_util.h`) L336–L668, `src/crypto/crypto_random.cc`(`https://raw.githubusercontent.com/nodejs/node/main/src/crypto/crypto_random.cc`) L41–L74, `deps/ncrypto/ncrypto.cc`(`https://raw.githubusercontent.com/nodejs/node/main/deps/ncrypto/ncrypto.cc`) L804–L841, `doc/api/errors.md` L1197–L1203.

### 2.4 `crypto.randomInt([min, ]max[, callback])`과 rejection sampling

```
crypto.randomInt([min, ]max[, callback])
```

- `min` {integer} **포함**, 기본값 `0`. `max` {integer} **배제**(exclusive). 범위: `min <= n < max`.
- `range = max - min`은 `2**48` 미만이어야 함(`ERR_OUT_OF_RANGE`).
- `callback` 없으면 동기.
- 문서 원문: "Return a random integer `n` such that `min <= n < max`. This implementation avoids [modulo bias][]." — `[modulo bias]` 링크는 `https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle#Modulo_bias`(`doc/api/crypto.md` L7737)를 가리킨다. "rejection sampling"이라는 단어 자체는 문서 프로즈에 등장하지 않지만, 링크가 가리키는 개념이 정확히 rejection sampling이다.
- `added: [v14.10.0, v12.19.0]`.
- 출처: L6275–L6364.

소스(`lib/internal/crypto/random.js` L200, L228–L279)로 rejection sampling 구현을 직접 확인:

```js
const RAND_MAX = 0xFFFF_FFFF_FFFF; // 2**48 - 1
...
const range = max - min;
if (!(range <= RAND_MAX)) { throw new ERR_OUT_OF_RANGE(...); }
const randLimit = RAND_MAX - (RAND_MAX % range); // 거부 경계
while (isSync || (randomCacheOffset < randomCache.length)) {
  if (randomCacheOffset === randomCache.length) {
    randomFillSync(randomCache); // 6*1024바이트 캐시(6바이트=48비트 단위 1024개)
    randomCacheOffset = 0;
  }
  const x = randomCache.readUIntBE(randomCacheOffset, 6);
  randomCacheOffset += 6;
  if (x < randLimit) { // randLimit 이상이면 버리고 재추출(rejection)
    const n = (x % range) + min;
    ...
  }
}
```

- `randomCache`는 `6 * 1024`바이트(`random.js` L204)로, 48비트(6바이트) 표본 1,024개를 담는 공유 버퍼다. 동기 호출은 캐시가 비면 `randomFillSync`로 즉시 다시 채운다. 비동기 호출은 캐시가 비면 `randomFill`로 재충전을 큐잉하고 대기 중인 호출들을 재시도한다(`asyncRefillRandomIntCache`, L281–L306).
- 결론: **표준 rejection sampling을 소스 레벨에서 명시적으로 구현**하고 있음을 확정. `x >= randLimit`인 표본은 버리고 다시 뽑는 방식이며, `@cp949/random/secure`의 방식과 원리가 동일하다(단, word 크기와 범위 상한이 다르다 — 5절 참조).

### 2.5 `crypto.randomUUID([options])`와 `randomUUIDv7`

```
crypto.randomUUID([options])       // added: [v15.6.0, v14.17.0]
crypto.randomUUIDv7([options])     // added: [v26.1.0, v24.16.0]  ← 최근 추가
```

- `randomUUID`: "Generates a random [RFC 4122][] version 4 UUID. The UUID is generated using a cryptographic pseudorandom number generator." → **v4 UUID임이 공식 문서에 명시**.
- `options.disableEntropyCache`(둘 다 지원): 기본적으로 "Node.js generates and caches enough random data to generate up to 128 random UUIDs"(성능 최적화, `kBatchSize = 128`). `true`로 설정하면 캐시 없이 매번 새로 생성. 기본값 `false`.
- **`randomUUIDv7`은 Node v26.1.0 / v24.16.0에서 신규 추가**(2026년 기준 최근 변경). 문서 원문: "Generates a random [RFC 9562][] version 7 UUID. The UUID contains a millisecond precision Unix timestamp in the most significant 48 bits, followed by cryptographically secure random bits for the remaining fields, making it suitable for use as a database key with time-based sorting. The embedded timestamp relies on a non-monotonic clock and is not guaranteed to be strictly increasing."
  - 명시적으로 **단조성(monotonicity)을 보장하지 않는다**고 문서화("not guaranteed to be strictly increasing"). `@cp949/random/id`의 uuidv7 단조성 보장 문서(인스턴스 단위 counter 등)와 대비되는 지점.
- 소스(`lib/internal/crypto/random.js` L340–L460): v4는 `serializeUUID(buf, 0x40, 0x80, ...)`(버전 니블 `0x4`, variant `0x8`), v7은 `writeTimestamp` + `serializeUUID(uuidData, 0x70, 0x80, ...)`(버전 니블 `0x7`). 둘 다 동일한 128바이트(`16 * kBatchSize`) 배치 버퍼와 `randomFillSync`를 공유한다. 버퍼/큐 확보 실패 시 `ERR_OPERATION_FAILED('Out of memory')`를 던진다(엔트로피 실패가 아니라 메모리 할당 실패 케이스).
- 출처: L6366–L6407, `random.js` L340–L460.

### 2.6 Web Crypto API와의 관계(브라우저 대응 API 부재의 문서적 근거)

- `crypto.getRandomValues(typedArray)`(`added: v17.4.0`) 원문: "A convenient alias for [`crypto.webcrypto.getRandomValues()`][]. **This implementation is not compliant with the Web Crypto spec**, to write web-compatible code use [`crypto.webcrypto.getRandomValues()`][] instead." (L5275–L5286)
- `crypto.webcrypto`(`added: v15.0.0`) 원문: "Type: {Crypto} An implementation of the Web Crypto API standard. See the [Web Crypto API documentation][] for details." (L6906–L6914)
- 이 두 절이 문서 구조 자체로 **Node의 `randomBytes`/`randomFillSync`/`randomInt`/`randomUUID`/`randomUUIDv7`는 웹 표준이 아닌 Node 전용 API**임을 보여준다. "web-compatible code"를 쓰려면 `crypto.webcrypto`(표준 Web Crypto, 브라우저에도 있음)를 쓰라고 명시적으로 안내하는데, 이는 역으로 `randomBytes` 등 나머지 API가 웹 호환이 아니라는 뜻이다. `crypto.getRandomValues`조차 "Web Crypto 스펙과 호환되지 않는다"고 밝혀, Node의 legacy `crypto` 모듈 표면 전체가 브라우저 대응이 없는 Node 전용 API임을 문서가 자인한다.
- 출처: L5275–L5286, L6906–L6914.

### 2.7 OS별 엔트로피 소스(문서/소스 확인 결과)

- **공식 문서(`crypto.md`) 전체 텍스트 검색 결과, `/dev/urandom`, `CryptGenRandom`, `BCryptGenRandom`, `getrandom` 등 OS 레벨 API 명칭은 한 번도 등장하지 않는다.** ("entropy"라는 단어 자체는 등장하지만 OS API명과 함께 쓰인 적이 없다.)
- 소스 레벨(`deps/ncrypto/ncrypto.cc` L807–L841)에서도 Node/ncrypto는 OpenSSL의 `RAND_status()` / `RAND_bytes()` / `RAND_bytes_ex()` / `RAND_poll()`만 호출하며, **OS 시스템 콜을 직접 부르지 않는다.** `/dev/urandom`(Linux/BSD), `getrandom(2)`, Windows의 `BCryptGenRandom` 등 실제 OS 엔트로피 소스는 OpenSSL의 `RAND_poll()` 내부(플랫폼별 `rand_unix.c`/`rand_win.c`, OpenSSL 자체 저장소)에 구현돼 있고, 이는 Node 저장소 범위 밖(OpenSSL 소스)이다.
- 결론: **"Node가 OS별 엔트로피 소스를 크로스플랫폼으로 추상화한다"는 사실 자체는 맞지만, 그 추상화 계층은 Node가 아니라 OpenSSL이고, Node 공식 문서에는 이 계층에 대한 언급이 없다.** OS API 명칭까지 확인하려면 OpenSSL 소스(`crypto/rand/rand_unix.c` 등, 이번 조사 범위 밖)를 봐야 한다.

## 3. 장점 — 구체적 근거

1. **`randomInt`가 표준 라이브러리 차원에서 rejection sampling을 소스 레벨로 명시 구현한다.** `RAND_MAX = 2^48-1`, `randLimit = RAND_MAX - (RAND_MAX % range)` 거부 경계, `x >= randLimit`이면 재추출(`random.js` L200, L243–L270). 서드파티 의존 없이 modulo bias를 제거한다.
2. **동기/비동기 API를 함수 시그니처 하나(`callback` 유무)로 통일 제공**한다(`randomBytes`, `randomFillSync`/`randomFill`, `randomInt` 모두 동일 패턴). 호출자가 콜백 인자만으로 스레드풀 오프로드 여부를 선택한다.
3. **`randomInt`/`randomUUID`는 내부 캐시 버퍼(각각 6KB, 128 UUID분)로 매 호출마다 새로 시스템 콜을 하지 않는다.** 성능 최적화가 API 계약(`disableEntropyCache` 옵션)으로 노출돼, 캐시를 원치 않는 호출자도 대응 가능하다.
4. **`randomUUIDv7`이 RFC 9562(v4122 후속 표준) v7 UUID를 표준 라이브러리 차원에서 제공**하며 "non-monotonic clock" 한계를 문서에 명시해 과신을 막는다(v26.1.0/v24.16.0, 최근 추가).
5. **`crypto.webcrypto`로 표준 Web Crypto API 전체(브라우저와 동일 스펙)를 함께 제공**해, Node 전용 API와 웹 표준 API를 한 모듈 안에서 선택할 수 있게 한다.

## 4. 단점/트레이드오프 — 구체적 근거

1. **Node 전용, 브라우저 부재.** 2.6절 근거대로 `randomBytes`/`randomFillSync`/`randomFill`/`randomInt`/`randomUUID`/`randomUUIDv7`는 브라우저에 대응 API가 없다. 브라우저까지 지원해야 하는 라이브러리(`@cp949/random/secure`, `crypto-random-string` 등)는 이 간극을 각자 `globalThis.crypto.getRandomValues` 기반으로 메워야 한다.
2. **엔트로피 부족 시 에러가 전용 에러 클래스가 아니라 범용 `ERR_CRYPTO_OPERATION_FAILED`("Deriving bits failed")로 뭉뚱그려진다(2.3절).** 이 코드는 키 생성 실패, ECDH 실패 등 무관한 다른 실패와 공유되므로, 호출자가 "엔트로피 부족"만 콕 집어 잡을 수 없다. 공식 문서에는 이 매핑 자체가 없어 소스를 추적하지 않으면 알 수 없다.
3. **`randomInt`의 범위 상한이 `2^48`로, `Number.MAX_SAFE_INTEGER`(`2^53-1`)보다 작다.** `RAND_MAX = 0xFFFF_FFFF_FFFF`(`random.js` L200)로 하드코딩돼 있어, `[0, 2^53-1]` 같은 안전정수 전체 범위는 `randomInt`로 표현할 수 없다.
4. **`Buffer` 반환 타입이 Node 전용 타입이다.** `randomBytes`의 반환값은 `Uint8Array`의 Node 서브클래스인 `Buffer`이며, DOM `BufferSource`를 기대하는 웹 API에 캐스팅 없이 바로 넘기는 것을 문서가 보장하지 않는다(문서에 명시적 캐스팅 언급은 없음, `Buffer`가 `Uint8Array`를 상속하므로 실질적으로는 대부분 호환되나 이는 문서 계약이 아니라 구현 세부사항).
5. **`randomInt`/`randomFill` 비동기 버전이 libuv 스레드풀을 쓴다.** 문서 원문: "This API uses libuv's threadpool, which can have surprising and negative performance implications for some applications; see the [`UV_THREADPOOL_SIZE`][] documentation" — 스레드풀 크기 설정에 따라 다른 I/O 작업과 자원을 경합할 수 있다(L6031–6033, L6176–6178).

## 5. `@cp949/random`이 배울 점

### 5.1 `randomInt` 시그니처 비교 — 정확한 대응

| 항목                         | Node `crypto.randomInt`                                                                            | `@cp949/random/secure` `randomInt`                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 시그니처                     | `randomInt([min, ]max[, callback])`                                                                | `randomInt(min, max)`                                                                                   |
| `min` 생략                   | 가능, 기본값 `0`                                                                                   | 불가, 필수 인자(2개 모두 필수)                                                                          |
| 범위                         | `min <= n < max`(**max 배제**)                                                                     | `min <= n <= max`(**양끝 포함**)                                                                        |
| 범위 크기 상한               | `max - min < 2^48`(`RAND_MAX = 0xFFFF_FFFF_FFFF`)                                                  | `max - min + 1 <= 2^53 - 1`(`Number.MAX_SAFE_INTEGER`)                                                  |
| 동기/비동기                  | `callback` 인자로 양쪽 다 지원(스레드풀 오프로드 가능)                                             | 동기 전용(브라우저 `getRandomValues`는 항상 동기이므로 비동기 오버로드가 없음)                          |
| rejection sampling word 크기 | 6바이트(48비트) 단위, 공유 캐시 6144바이트                                                         | 32바이트 로컬 버퍼, 호출마다 독립(`docs/api/secure.md` "난수 사용" 행)                                  |
| BigInt 사용                  | 사용 안 함(48비트라 Number로 충분)                                                                 | 사용 안 함(계약으로 명시, `docs/api/secure.md` L101)                                                    |
| 실패 시 에러                 | 범용 `ERR_CRYPTO_OPERATION_FAILED`("Deriving bits failed") — 엔트로피 실패와 다른 실패가 같은 코드 | 전용 `SecureRandomUnavailableError`(미지원 환경) vs `RangeError`(인자) — 두 실패 원인이 클래스로 분리됨 |

**시사점**:

- `@cp949/random/secure`의 `randomInt(min, max)`가 **양끝 포함**, Node가 **max 배제**라는 차이는 이미 API 문서(`docs/api/secure.md`)에 명시돼 있으나, README/마이그레이션 가이드에 "Node `crypto.randomInt(min, max)` 사용자가 그대로 옮기면 결과 범위가 한 칸 어긋난다(상한이 다르다)"는 경고를 명시적으로 추가할 가치가 있다. 예: Node의 `randomInt(1, 7)`(주사위, `1..6`)을 그대로 `@cp949/random/secure`의 `randomInt(1, 7)`로 옮기면 `1..7`이 나와 버그가 된다 — 올바른 이식은 `randomInt(1, 6)`이다.
- **에러 클래스 분리(`SecureRandomUnavailableError` vs `RangeError`)는 Node 대비 명확한 우위다.** Node는 엔트로피 실패든 다른 크립토 작업 실패든 `ERR_CRYPTO_OPERATION_FAILED` 하나로 뭉뚱그리는 반면(2.3, 4.2절), `@cp949/random/secure`는 "환경 미지원"과 "인자 오류"를 애초에 다른 에러 클래스로 분리해 호출자가 `instanceof`로 구분 가능하게 한다. 이 차별점을 문서(`docs/api/secure.md`)나 README에 "Node와 달리 실패 원인을 클래스로 구분한다"는 식으로 명시적으로 강조할 수 있다.
- **rejection sampling word 크기 정책**: Node는 48비트 고정 word를 6KB 공유 캐시에 채워 재사용(성능 최적화, `disableEntropyCache`류 옵션 없음 — `randomInt`엔 캐시 끄는 옵션이 아예 없다), `@cp949/random/secure`는 32바이트를 호출마다 독립적으로 씀(공유 캐시 없음, 상태 없음이 계약). 이는 의도된 트레이드오프이며(모듈 수준 상태 없음 = 오류 후 복구 보장, `docs/api/secure.md` "실패 순서" 절), Node처럼 캐시를 공유하지 않는 이유(재현성/오류 격리)를 문서에 한 줄 근거로 남기면 설계 의도가 더 분명해진다.
- **범위 상한이 `2^48`(Node) vs `2^53-1`(cp949)로 cp949 쪽이 더 넓다.** 이 우위(`Number.MAX_SAFE_INTEGER` 전체를 rejection sampling만으로, BigInt 없이 커버)를 문서에서 "Node의 `2^48` 제한보다 넓은 범위를 지원한다"고 정량적으로 명시할 수 있다.

### 5.2 `randomUUID`/`randomUUIDv7` — `./id`와의 관계

- Node의 `randomUUID()`가 v4 UUID, `randomUUIDv7()`이 v7 UUID(RFC 9562, "non-monotonic clock" 명시)라는 점은 `@cp949/random/id`의 `uuidv4`/`uuidv7` 설계와 목적이 같다. 다만 Node는 v7의 단조성을 아예 보장하지 않는다고 밝히는 반면, `@cp949/random/id`는 인스턴스 단위 단조성 보장 범위를 문서화하고 있다(`docs/research/similar-libraries.md` 176행 기존 서술과 일치) — 이 차별점은 이미 인지되어 있으므로 유지하면 된다.
- Node가 `disableEntropyCache` 옵션으로 "캐시 성능 최적화 vs 매번 새로 생성"을 명시적으로 노출하는 패턴은, `@cp949/random/id`가 내부 캐싱을 쓰는 경우(해당 시) 유사한 옵션 노출을 검토할 소재가 된다(현재 `@cp949/random/id`가 캐싱하는지는 이번 조사 범위 밖이라 확인 안 됨).

### 5.3 엔트로피 실패 처리 — 이미 확보한 우위 재확인

- Node의 엔트로피 실패 처리(2.3절)를 소스까지 추적한 결과, Node조차 **공식 문서 수준에서는 전용 에러를 문서화하지 않았고, 실제로도 범용 코드를 재사용**한다는 사실이 확인됐다. `@cp949/random/secure`의 `SecureRandomUnavailableError`(환경 미지원 전용, `docs/api/secure.md` L240–L260)는 Node의 이 공백을 메우는 설계로, README나 랜딩 문서에서 "Node `crypto`조차 엔트로피 실패 전용 에러 코드가 없다(`ERR_CRYPTO_OPERATION_FAILED`로 뭉뚱그림, 소스 추적으로만 확인 가능)"는 비교를 근거로 들 수 있다.
- 단, Node의 `SecureRandomUnavailableError` 대응 상황(=`globalThis.crypto` 자체가 없음)과 Node `ERR_CRYPTO_OPERATION_FAILED`(=`crypto`는 있지만 OS 엔트로피 시딩이 실패)는 **서로 다른 실패 계층**이다. `@cp949/random/secure`는 후자(OpenSSL 수준 엔트로피 고갈)에 대응하는 별도 에러가 없다 — `getRandomValues` 자체가 브라우저에서 이런 방식으로 실패하는 사례가 관측된 바 없어 실용적 공백은 아니지만, 개념적으로는 "환경에 crypto가 없음"과 "crypto는 있지만 내부적으로 난수 생성에 실패함" 두 계층이 있다는 점은 인지해둘 가치가 있다.

## 6. 참고 자료

모든 항목은 2026-09-22에 확인했다.

- Node.js 공식 문서(요약 시도, 페이지가 너무 커서 일부만 성공): https://nodejs.org/api/crypto.html
- Node.js 문서 소스 원문(중심 근거): https://raw.githubusercontent.com/nodejs/node/main/doc/api/crypto.md
- Node.js 에러 코드 문서: https://raw.githubusercontent.com/nodejs/node/main/doc/api/errors.md
- `lib/internal/crypto/random.js`: https://raw.githubusercontent.com/nodejs/node/main/lib/internal/crypto/random.js
- `src/crypto/crypto_random.cc`: https://raw.githubusercontent.com/nodejs/node/main/src/crypto/crypto_random.cc
- `src/crypto/crypto_util.h`: https://raw.githubusercontent.com/nodejs/node/main/src/crypto/crypto_util.h
- `deps/ncrypto/ncrypto.cc`(Node 저장소에 벤더링된 ncrypto 라이브러리): https://raw.githubusercontent.com/nodejs/node/main/deps/ncrypto/ncrypto.cc
- Node.js 릴리스 인덱스(버전 확인용): https://nodejs.org/dist/index.json
- modulo bias 참고 링크(Node 문서가 직접 인용): https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle#Modulo_bias
