# 유사 라이브러리와의 비교

`@cp949/random`이 같은 문제 영역의 라이브러리와 어디가 다른지, 그 라이브러리에서 옮겨올 때 무엇에
걸리는지를 적는다. 근거는 `docs/research/`의 조사(확인 날짜 2026-09-22)이며 각 행의 "근거" 열이 상세
문서의 절을 가리킨다. 비교 대상의 버전은 상세 문서가 기록한 값이다. 성능은 벤치마크 전이라 비교하지
않는다.

## 1. 차별점

| 항목             | `@cp949/random`                                                                                                                                     | 비교 대상                                                                                                                                                   | 근거                                                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 재현성 계약      | raw 출력 스트림, seed→상태 변환, `float`·`bool`·`sign`을 여러 seed의 golden vector로 고정하고 변경을 breaking으로 다룬다(`docs/api/random-core.md`) | pure-rand·seedrandom은 seed 1개의 벡터만 고정. chance.js는 golden vector 없이 두 인스턴스의 상대 비교만 한다                                                | [pure-rand §2.7](research/similar-libs/pure-rand.md), [seedrandom §3](research/similar-libs/seedrandom.md), [chance.js §2.3](research/similar-libs/chancejs.md) |
| 문자열 seed      | FNV-1a 32비트로 정규화하고 표준 테스트 벡터(`""` → `0x811C9DC5`)로 고정한다                                                                         | pure-rand는 숫자 seed만 받고 문자열 해시는 사용자 몫. seedrandom은 비표준 `mixkey`라 외부 벡터가 없다                                                       | [pure-rand §2.6](research/similar-libs/pure-rand.md), [seedrandom §2.3](research/similar-libs/seedrandom.md)                                                    |
| 미지원 환경 오류 | `SecureRandomUnavailableError` 하나. `globalThis.crypto` 없음, `getRandomValues`가 함수 아님, 접근 시 예외를 모두 이 클래스로 수렴한다              | crypto-random-string은 가드 없이 호출해 환경에 따라 `ReferenceError` 또는 `TypeError`가 새고 문서화가 없다. Node는 범용 `ERR_CRYPTO_OPERATION_FAILED`다     | [crypto-random-string §2.4](research/similar-libs/crypto-random-string.md), [node-crypto §2.3](research/similar-libs/node-crypto.md)                            |
| 지원 여부 조회   | `getCryptoCapabilities()`가 예외 없이 `{ getRandomValues: boolean }`을 돌려준다                                                                     | 비교 대상 11종 중 같은 용도의 API가 없다                                                                                                                    | [요약 "종합" 절, 보안 난수 3번](research/similar-libraries.md)                                                                                                  |
| `randomInt` 범위 | `max - min + 1 <= 2^53 - 1`. BigInt 없이 rejection sampling만으로 다룬다. 양끝 포함                                                                 | Node `crypto.randomInt`는 `max - min < 2^48`. `max` 배제                                                                                                    | [node-crypto §5.1](research/similar-libs/node-crypto.md)                                                                                                        |
| UUID v7 단조성   | 인스턴스 단위 보장 범위, counter 고갈 시 timestamp 전진, 10,000ms clock-skew 정책을 문서로 고정한다(`docs/api/id.md`)                               | uuid는 `v7(options)`에 옵션을 넘기면 모듈 상태를 건너뛰어 조용히 단조성에서 이탈. ulidx는 random 소진 시 예외. Node `randomUUIDv7`은 단조를 보장하지 않는다 | [uuid §2.2](research/similar-libs/uuid.md), [ulidx §2.3](research/similar-libs/ulid.md), [node-crypto §2.5](research/similar-libs/node-crypto.md)               |

## 2. 옮겨올 때 걸리는 것

### Node `crypto.randomInt`: 상한이 한 칸 다르다

Node는 `max`를 배제하고 이 라이브러리는 포함한다. 그대로 옮기면 결과 범위가 한 칸 넓어진다.

```ts
// Node: 1..6
crypto.randomInt(1, 7);

// @cp949/random/secure: 1..7 (버그)
randomInt(1, 7);

// 옳은 이식: 1..6
randomInt(1, 6);
```

### crypto-random-string: `length`는 문자 수, `byteLength`는 바이트 수

crypto-random-string의 `length`는 결과 문자 수다. `randomHex`·`randomBase64url`의 인자는 인코딩 전
엔트로피 바이트 수이고 결과 길이는 `byteLength * 2`, `ceil(byteLength * 4 / 3)`이다.

```ts
// crypto-random-string: hex 32자 = 16바이트
cryptoRandomString({ length: 32, type: "hex" });

// @cp949/random/secure: 같은 결과 길이
randomHex(16);
```

### nanoid `customAlphabet`: `randomString` 또는 `randomId`

이 라이브러리의 `nanoid(length)`는 alphabet 인자가 없다. 문자 집합을 바꾸려면 `randomString`
(`./secure`) 또는 `randomId`(`./id`)를 쓴다.

```ts
// nanoid
const make = customAlphabet("0123456789abcdef", 10);
make();

// @cp949/random
randomString("0123456789abcdef", 10);
randomId({ alphabet: "0123456789abcdef", length: 10 });
```

### cuid2·seedrandom `{ entropy: true }`: 폴백이 없다

cuid2는 `getRandomValues`가 없으면 `Math.random`으로 조용히 내려간다. 이 라이브러리는 내려가지 않고
`SecureRandomUnavailableError`를 던진다. 환경을 미리 확인하려면 `getCryptoCapabilities()`를 쓴다.

```ts
import { getCryptoCapabilities, randomBytes } from "@cp949/random/secure";

if (!getCryptoCapabilities().getRandomValues) {
  // 여기서 정책을 정한다. 라이브러리는 대신 결정하지 않는다.
}
randomBytes(16); // 미지원이면 SecureRandomUnavailableError
```

## 3. 채택하지 않은 패턴

| 패턴                                                | 출처                                                   | 채택하지 않은 이유                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| 호출 간 문자열 풀 캐시                              | [nanoid §2.2](research/similar-libs/nanoid.md)         | `nanoid()`는 호출 사이에 상태를 남기지 않는다는 계약과 충돌한다                                                    |
| 시각·카운터·호스트 지문을 섞는 다중 entropy         | [cuid2 §2.1](research/similar-libs/cuid2.md)           | 런타임 의존성 0과 단일 난수원 원칙에 어긋나고 감사 대상이 늘어난다                                                 |
| CSPRNG 부재 시 `Math.random` 폴백                   | [cuid2 §5.1](research/similar-libs/cuid2.md)           | 보안 저하를 조용히 넘기지 않는다. 미지원은 오류다                                                                  |
| `uuidv7(options)`로 `seq`·`msecs` 오버라이드        | [uuid §2.2](research/similar-libs/uuid.md)             | 옵션을 넘기는 순간 기본 인스턴스의 단조성 체인이 조용히 끊긴다. 옵션은 `createUuidv7Factory`로만 받는다            |
| 완성된 UUID 문자열을 돌려주는 생성기 통째 주입      | [short-uuid §2.5](research/similar-libs/short-uuid.md) | 주입값의 version·variant 비트 무결성을 보장할 수 없다. 주입은 난수 바이트에 한정한다                               |
| 다중 인자 seed를 라이브러리가 합성                  | [chance.js §2.2](research/similar-libs/chancejs.md)    | 자체 합성 해시는 검증 벡터가 없다. 호출자가 구분자로 join한 문자열 seed를 넘긴다(`docs/api/random-core.md` 레시피) |
| PRNG 상태를 객체 프로퍼티로 노출해 `state()` 제공   | [seedrandom §2.4](research/similar-libs/seedrandom.md) | `RandomSource = () => number` 계약을 깬다. 스냅샷은 R9에서 root 계약 밖의 별도 인터페이스로 다룬다                 |
| 2의 거듭제곱이 아닌 alphabet의 비트마스크 rejection | [nanoid §2.2](research/similar-libs/nanoid.md)         | 거부율이 최대 50%에 가깝다. modulo cutoff(`256 - 256 % size`)가 난수 낭비가 적다                                   |
| 한 major에 여러 breaking 축을 모으는 릴리스         | [pure-rand §4](research/similar-libs/pure-rand.md)     | 마이그레이션 비용이 커진다. 로드맵 §2에 "한 릴리스에 하나의 축" 원칙으로 반영했다                                  |
