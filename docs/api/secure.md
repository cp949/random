# `@cp949/random/secure` API 계약

보안 난수 API의 입력 검증, 오류, 결과값 계약을 함수별로 기록한다. 계약은 이 문서와 소스의 TSDoc에 적힌 동작이다. 무작위 결과값, 오류 메시지 문구, 내부 호출 분할 크기는 계약이 아니다.

## 공개 export

| export                         | 시그니처                                       | 요약                                                 |
| ------------------------------ | ---------------------------------------------- | ---------------------------------------------------- |
| `randomBytes`                  | `(length: number) => Uint8Array<ArrayBuffer>`  | 보안 난수 바이트                                     |
| `randomInt`                    | `(min: number, max: number) => number`         | `[min, max]`(양끝 포함)의 편향 없는 정수             |
| `randomHex`                    | `(byteLength?: number) => string`              | 소문자 hex 문자열                                    |
| `randomBase64url`              | `(byteLength?: number) => string`              | padding 없는 base64url 문자열                        |
| `randomString`                 | `(alphabet: string, length: number) => string` | alphabet(코드 포인트 단위)에서 뽑은 문자열           |
| `getCryptoCapabilities`        | `() => CryptoCapabilities`                     | crypto 지원 진단. 예외를 던지지 않는다               |
| `SecureRandomUnavailableError` | 클래스                                         | `getRandomValues`를 쓸 수 없는 환경에서 던지는 오류  |
| `createSecureSource`           | `() => RandomSource`                           | root helper에 주입하는 `getRandomValues` 기반 source |
| `RandomSource`                 | 타입 `() => number`(root와 같은 타입)          | `createSecureSource`의 반환 타입                     |

```ts
import {
  SecureRandomUnavailableError,
  createSecureSource,
  getCryptoCapabilities,
  randomBase64url,
  randomBytes,
  randomHex,
  randomInt,
  randomString,
  type RandomSource,
} from "@cp949/random/secure";
```

## 사용 환경

- 런타임 요건은 `globalThis.crypto.getRandomValues` 하나다. `Math.random`을 포함한 다른 난수원으로 대체하지 않는다. `node:crypto`를 import하지 않는다.
- `globalThis.crypto`는 import 시점이 아니라 호출 시점에 조회한다. `crypto`가 없는 환경에서도 import는 성공한다.
- import 경로는 `@cp949/random/secure`이며 `package.json`의 `exports` 맵으로만 제공한다. TypeScript는 `moduleResolution`이 `Bundler` 또는 `NodeNext`(`Node16` 포함)일 때 타입을 해석한다. `node10`(`moduleResolution: node`)과 webpack 4는 지원하지 않는다.
- TypeScript 5.7 이상이 필요하다. `randomBytes`의 반환 타입 `Uint8Array<ArrayBuffer>`는 5.7에서 generic이 되었다. 5.6.1-rc에서는 이 표기가 TS2315로 실패한다. 소비자 검증(`pnpm check:consumer`)이 TypeScript 5.7.3과 저장소의 TypeScript에서 `randomBytes(16)`의 결과를 `lib.dom`의 `crypto.subtle.digest`에 캐스팅 없이 넘기는 코드가 `Bundler`, `NodeNext` 설정 모두에서 컴파일되는지 확인한다.
- 공개 타입은 DOM 타입을 참조하지 않는다. DOM lib 없이 빌드하는 소비자도 사용할 수 있다.
- 실브라우저 실측과 검증 한계는 `docs/compatibility.md`에 있다.

## 공통 규칙

### 인자 검증

- 숫자 인자는 `typeof`가 `"number"`이고 safe integer이며 범위 안이어야 한다. 문자열, 소수, `NaN`, `Infinity`, 객체, `undefined`, `null`은 `RangeError`다.
- `alphabet`은 `typeof`가 `"string"`이어야 한다. 위반은 `RangeError`다.
- 검증 실패의 오류 클래스는 `RangeError` 하나다. 타입이 틀린 인자도 `TypeError`가 아니라 `RangeError`다. 호출자가 잡을 검증 오류가 하나로 정해진다.
- `undefined`는 기본값이 있는 인자(`randomHex`, `randomBase64url`의 `byteLength`)에서만 기본값으로 대체된다. 그 밖의 인자에서 `undefined`는 `RangeError`이고, 기본값이 있는 인자에서도 `null`은 `RangeError`다.
- 오류 메시지는 영어이며 문구는 계약이 아니다. 오류 타입만 계약이다.

### 실패 순서

1. 인자를 검증한다(`RangeError`).
2. `getRandomValues`를 쓸 수 있는지 확인한다(`SecureRandomUnavailableError`). 필요한 바이트가 0개이거나 결과가 정해진 호출(`randomBytes(0)`, `randomInt(5, 5)`)에서도 확인한다. 지원되지 않는 환경에서 함수마다 다르게 동작하지 않게 하기 위해서다.
3. 바이트를 만든다. `getRandomValues`가 던진 오류는 그대로 전파되고 부분 결과는 돌려주지 않는다. 모듈 수준 상태가 없으므로 오류 뒤의 다음 호출은 정상 동작한다.

인자 검증이 먼저이므로 잘못된 인자는 환경과 무관하게 항상 `RangeError`다. `crypto`가 없는 환경에서도 같다.

### 길이 상한

모든 길이 인자의 상한은 1,048,576(2^20)이다. 메모리 할당을 제한하기 위한 값이며 더 필요하면 호출자가 여러 번 호출한다. 이후 추가할 `./id`의 식별자 길이 상한(1,024)과 값이 다른 것은 의도다. 이 상한은 원시 생성기의 메모리 제한이고, 식별자 상한은 식별자 길이 제약이다.

### 결함 난수원

`randomInt`와 `randomString`은 값이 수용될 때까지 반복하며 반복 횟수에 상한이 없다. 정상적인 난수원에서 연속 k회 거부될 확률은 2^-k 이하다. `getRandomValues`가 거부 구간의 상수(예: `0xFF`)만 채우는 결함 환경에서는 함수가 반환하지 않는다. 0만 채우는 결함은 수용되어 종료하지만 출력이 상수가 된다. 이런 결함 난수원은 탐지하지 않으며 위협 모델 밖이다. 상한을 두면 검증 오류와 미지원 오류 밖에 새 오류가 필요하고, 정상 환경에서 도달할 수 없는 분기가 생긴다.

## `randomBytes(length)`

```ts
function randomBytes(length: number): Uint8Array<ArrayBuffer>;
```

보안 난수 바이트를 만든다.

| 항목          | 내용                                                                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 입력 `length` | 0 이상 1,048,576 이하의 정수. 필수. 위반은 `RangeError`                                                                                   |
| 오류          | `RangeError`(인자), `SecureRandomUnavailableError`(지원 안 됨, `length`가 0이어도 같음), `getRandomValues`가 던진 오류(그대로 전파)       |
| 결과 길이     | `length`와 같다. `length`가 0이면 빈 배열이다                                                                                             |
| 결과 버퍼     | 호출마다 새 `ArrayBuffer`다. `byteOffset`이 0이고 `buffer`의 크기가 `length`와 같다                                                       |
| 결과 값       | 무작위이며 재현할 수 없다(계약이 아니다)                                                                                                  |
| 큰 길이       | `getRandomValues`의 호출당 65,536바이트 제한은 내부에서 나눠 채워 처리한다. 상한까지 길이에 제한 없이 동작한다. 분할 크기는 계약이 아니다 |

반환 타입이 `Uint8Array<ArrayBuffer>`이므로 `lib.dom`의 `BufferSource`를 받는 API에 캐스팅 없이 넘길 수 있다.

```ts
import { randomBytes } from "@cp949/random/secure";

const bytes = randomBytes(16);
// lib.dom이 있는 환경: 캐스팅 없이 SubtleCrypto에 전달한다.
const digest = await crypto.subtle.digest("SHA-256", bytes);
```

## `randomInt(min, max)`

```ts
function randomInt(min: number, max: number): number;
```

`[min, max]`(양끝 포함)에서 균등하게 정수를 뽑는다. rejection sampling으로 modulo 편향을 없앤다. BigInt를 쓰지 않는다.

| 항목              | 내용                                                                                                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 입력 `min`, `max` | 둘 다 safe integer. `min <= max`. 범위 크기 `max - min + 1`이 `Number.MAX_SAFE_INTEGER` 이하. 위반은 `RangeError`(문자열, 소수, `NaN`, `undefined`, `null` 포함). 환경과 무관하게 같다       |
| 오류              | `RangeError`(인자), `SecureRandomUnavailableError`(지원 안 됨, 범위 크기가 1이어도 같음), `getRandomValues`가 던진 오류(그대로 전파)                                                         |
| 결과 범위         | `min` 이상 `max` 이하의 정수. `-0`은 나오지 않는다                                                                                                                                           |
| 분포              | 범위 안의 정수가 같은 확률로 나온다(계약)                                                                                                                                                    |
| 결과 값           | 무작위이며 재현할 수 없다(계약이 아니다)                                                                                                                                                     |
| 범위 크기 1       | `min`을 돌려준다. `getRandomValues`는 호출하지 않지만 지원 확인은 한다                                                                                                                       |
| 난수 사용         | 호출마다 지역 버퍼로 32바이트씩 요청하고 호출 사이에 상태를 남기지 않는다. 요청 크기와 word 소비 방식은 계약이 아니다                                                                        |
| 범위 크기 상한    | `randomInt(0, Number.MAX_SAFE_INTEGER - 1)`(크기 2^53-1)까지 허용한다. `randomInt(0, Number.MAX_SAFE_INTEGER)`는 크기가 2^53이라 `RangeError`다. `[-(2^53-1), 2^53-1]` 전체도 `RangeError`다 |

```ts
import { randomInt } from "@cp949/random/secure";

const die = randomInt(1, 6); // 1, 2, 3, 4, 5, 6 중 하나
const offset = randomInt(-10, 10); // 양끝 포함
```

## `randomHex(byteLength = 32)`

```ts
function randomHex(byteLength?: number): string;
```

보안 난수를 소문자 hex 문자열로 만든다.

| 항목              | 내용                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 입력 `byteLength` | 인코딩 전 엔트로피 바이트 수이며 결과 문자 수가 아니다. 1 이상 1,048,576 이하의 정수. `undefined`이면 기본값 32(256비트)다. 0을 포함한 그 밖의 위반은 `RangeError`이며 환경과 무관하게 같다 |
| 오류              | `RangeError`(인자), `SecureRandomUnavailableError`(지원 안 됨), `getRandomValues`가 던진 오류(그대로 전파)                                                                                  |
| 결과 형식         | 소문자 `0-9a-f`. 바이트마다 두 자리이며 앞의 0을 유지한다. 길이는 `byteLength * 2`이고 기본값은 64자다                                                                                      |
| 결과 값           | 무작위이며 재현할 수 없다(계약이 아니다)                                                                                                                                                    |

```ts
import { randomHex } from "@cp949/random/secure";

const token = randomHex(); // 64자, 예: "3f9a…"
const short = randomHex(8); // 16자
```

## `randomBase64url(byteLength = 32)`

```ts
function randomBase64url(byteLength?: number): string;
```

보안 난수를 padding 없는 base64url 문자열로 만든다. URL·파일 이름에 넣을 수 있는 알파벳(RFC 4648 5절)이다.

| 항목              | 내용                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 입력 `byteLength` | 인코딩 전 엔트로피 바이트 수이며 결과 문자 수가 아니다. 1 이상 1,048,576 이하의 정수. `undefined`이면 기본값 32(256비트)다. 0을 포함한 그 밖의 위반은 `RangeError`이며 환경과 무관하게 같다 |
| 오류              | `RangeError`(인자), `SecureRandomUnavailableError`(지원 안 됨), `getRandomValues`가 던진 오류(그대로 전파)                                                                                  |
| 결과 형식         | `A-Za-z0-9-_`. padding(`=`)이 없다. 길이는 `ceil(byteLength * 4 / 3)`이고 기본값은 43자다                                                                                                   |
| 결과 값           | 무작위이며 재현할 수 없다(계약이 아니다)                                                                                                                                                    |

```ts
import { randomBase64url } from "@cp949/random/secure";

const token = randomBase64url(); // 43자
const id = randomBase64url(16); // 22자
```

## `randomString(alphabet, length)`

```ts
function randomString(alphabet: string, length: number): string;
```

`alphabet`의 글자를 균등하게 뽑아 `length`글자 문자열을 만든다. rejection sampling으로 modulo 편향을 없앤다.

| 항목            | 내용                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 입력 `alphabet` | 문자열. 코드 포인트 2~256개이며 중복과 짝 없는 서로게이트가 없어야 한다. 위반과 문자열이 아닌 값(`undefined`, `null`, 배열 포함)은 `RangeError`                          |
| 입력 `length`   | 결과의 글자 수. 1 이상 1,048,576 이하의 정수. 위반은 `RangeError`                                                                                                        |
| 오류            | `RangeError`(인자, 환경과 무관), `SecureRandomUnavailableError`(지원 안 됨), `getRandomValues`가 던진 오류(그대로 전파)                                                  |
| 단위            | 코드 포인트다. UTF-16 코드 유닛이 아니다. 이모지처럼 UTF-16에서 두 유닛인 글자도 한 글자로 센다. alphabet 크기와 `length`가 모두 코드 포인트 수다                        |
| 결과 형식       | alphabet의 글자로만 이루어진다. 짝 없는 서로게이트를 alphabet에서 거부하므로 항상 올바른 UTF-16이다                                                                      |
| 분포            | alphabet의 각 글자가 같은 확률로 나온다(계약). 크기가 2의 거듭제곱이 아니어도 편향이 없다                                                                                |
| 결과 값         | 무작위이며 재현할 수 없다(계약이 아니다)                                                                                                                                 |
| 결합 문자 주의  | 결합 문자와 ZWJ 이모지 시퀀스는 코드 포인트마다 따로 뽑힌다. alphabet에 넣으면 결과의 시각적 글자 수가 `length`와 다르거나 결합 문자만 홀로 나올 수 있으므로 넣지 않는다 |

```ts
import { randomString } from "@cp949/random/secure";

const pin = randomString("0123456789", 6); // 예: "402917"
const faces = randomString("😀😁😂🤣", 8); // 이모지 8개(UTF-16 길이 16)
```

## `createSecureSource()`

```ts
function createSecureSource(): RandomSource;
```

`globalThis.crypto.getRandomValues` 기반 `RandomSource`(`() => number`, 호출마다 `[0, 2^32)`의 word)를 만든다. root entry의 helper(`int`, `float`, `bool`, `sign`, `uniform`)에 주입하는 명시적 합성 지점이며, 재현 가능한 난수(root)와 보안 난수(`./secure`)는 이 함수로만 잇는다(`docs/api/random-core.md`).

| 항목      | 내용                                                                                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 입력      | 없음                                                                                                                                                                       |
| 오류      | `SecureRandomUnavailableError`(지원 안 됨)뿐이다. 호출(생성) 시점에 즉시 확인한다(eager). 첫 word 호출까지 미루지 않는다. 생성 후의 환경 변화는 고려하지 않는다            |
| 버퍼링    | `randomInt`와 같은 word 버퍼를 쓴다. `getRandomValues`에서 32바이트씩 받아 big-endian으로 8개의 word로 나눠 내주며, 버퍼는 반환한 함수의 클로저 안에만 있다(호출마다 독립) |
| 오류 전파 | `getRandomValues`가 던진 오류는 그대로 전파하고 부분 결과를 돌려주지 않는다. 다음 호출은 다시 채우기를 시도한다                                                            |
| 결과 값   | 무작위이며 재현할 수 없다(계약이 아니다). 버퍼 크기와 채우는 시점도 계약이 아니다                                                                                          |
| 보안      | word 자체는 `getRandomValues` 출력이지만, root helper를 거친 결과에 보안 보증을 하지 않는다. token과 ID에는 이 모듈의 함수와 `./id`를 쓴다                                 |

```ts
import { int } from "@cp949/random";
import { createSecureSource } from "@cp949/random/secure";

const source = createSecureSource(); // 미지원 환경이면 여기서 SecureRandomUnavailableError
const roll = int(source, 1, 6);
```

## `getCryptoCapabilities()`

```ts
interface CryptoCapabilities {
  getRandomValues: boolean;
  randomUUID: boolean;
  subtle: boolean;
}

function getCryptoCapabilities(): CryptoCapabilities;
```

실행 환경의 crypto 지원 여부를 보고한다. 진단 전용이다. 이 라이브러리는 `randomUUID`와 `subtle`을 사용하지 않으며 보고만 한다.

| 항목              | 내용                                                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 입력              | 없음                                                                                                                                                                                                          |
| 오류              | 던지지 않는다. `globalThis.crypto` 접근이 예외를 던지는 환경에서도 같다                                                                                                                                       |
| `getRandomValues` | `globalThis.crypto.getRandomValues`가 함수이면 `true`. 공개 함수가 지원 확인에 쓰는 판정과 같은 함수를 쓰므로, 이 값이 `false`인 상태와 공개 함수가 `SecureRandomUnavailableError`로 실패하는 상태가 일치한다 |
| `randomUUID`      | `globalThis.crypto.randomUUID`가 함수이면 `true`                                                                                                                                                              |
| `subtle`          | `globalThis.crypto.subtle`이 객체(`null` 제외)이면 `true`                                                                                                                                                     |
| 결과 객체         | 호출마다 새 객체다. 결과를 바꿔도 다음 호출에 영향이 없다                                                                                                                                                     |
| 접근 예외         | `globalThis.crypto` 접근이 예외를 던지거나 `globalThis.crypto`가 없으면 세 필드가 모두 `false`다                                                                                                              |

## `SecureRandomUnavailableError`

```ts
class SecureRandomUnavailableError extends Error {
  name: "SecureRandomUnavailableError";
}
```

`getRandomValues`를 쓸 수 없는 환경에서 `getCryptoCapabilities`를 뺀 모든 함수가 던진다. 다음 세 경우가 같은 오류다.

- `globalThis.crypto`가 없다.
- `globalThis.crypto.getRandomValues`가 함수가 아니다.
- `globalThis.crypto` 접근이 예외를 던진다. 원본 예외는 보존하지 않는다(`cause` 없음).

| 항목   | 내용                                                                                          |
| ------ | --------------------------------------------------------------------------------------------- |
| 상속   | `Error`의 하위 클래스이며 `RangeError`가 아니다. 인자 오류와 환경 미지원 오류를 구분해 잡는다 |
| `name` | `"SecureRandomUnavailableError"`                                                              |
| 메시지 | 영어이며 문구는 계약이 아니다                                                                 |

이 오류가 나면 다른 난수원으로 대체되지 않은 것이다. 호출자는 미지원 환경을 이 오류로 구분해 처리한다.
