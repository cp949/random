# `@cp949/random/id` API 계약

`@cp949/random/id`의 입력 검증, 오류, 결과값 계약을 함수별로 기록한다. 계약은 이 문서와 소스의 TSDoc에 적힌 동작이다. 무작위 결과값과 오류 메시지 문구는 계약이 아니다.

`@cp949/random/id`는 보안 난수로 식별자를 만든다. 난수 바이트, 정수, 임의 문자 집합의 문자열을 직접 다루는 원시 함수는 `@cp949/random/secure`가 제공하고, 이 진입점은 식별자 형식을 만든다. 두 진입점은 같은 난수원(`globalThis.crypto.getRandomValues`)과 같은 `SecureRandomUnavailableError` 클래스를 쓴다. UUID 형식 함수(`stringifyUuid`, `parseUuid`, `isUuid`)는 난수와 무관한 순수 함수이며 crypto에 접근하지 않는다.

순환·카운터 ID(`createCyclicIdFactory`, `createCounterIdFactory`)는 난수를 쓰지 않는 예측 가능한 ID이며 보안 용도가 아니다. crypto에 접근하지 않고 결과값이 계약이다.

## 공개 export

| export                         | 시그니처                                                       | 요약                                                       |
| ------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------- |
| `nanoid`                       | `(length?: number) => string`                                  | base64url 64자로 만든 URL-safe 무작위 ID. 기본 21자        |
| `randomId`                     | `(options?: RandomIdOptions) => string`                        | 접두사·시각·그룹·충돌 검사를 조합하는 무작위 ID            |
| `createRandomIdFactory`        | `(options?: RandomIdFactoryOptions) => () => string`           | 옵션을 한 번 검증하는 무작위 ID 생성기                     |
| `createCyclicIdFactory`        | `(options: CyclicIdOptions) => CyclicIdGenerator`              | 정수 범위를 순환하는 예측 가능한 ID 생성기. 난수 없음      |
| `createCounterIdFactory`       | `(options?: CounterIdOptions) => CounterIdGenerator`           | 접두사·진법·패딩을 붙인 문자열 카운터 ID 생성기. 난수 없음 |
| `uuidv4`                       | `(format?: UuidFormat) => string`                              | UUID v4 문자열. `crypto.randomUUID`를 쓰지 않는다          |
| `createUuidv4Factory`          | `(options?: Uuidv4FactoryOptions) => () => string`             | 같은 옵션으로 UUID v4를 만드는 생성기. 난수원 주입         |
| `uuidv7`                       | `(format?: UuidFormat) => string`                              | 시간순으로 정렬되는 UUID v7 문자열                         |
| `createUuidv7Factory`          | `(options?: Uuidv7FactoryOptions) => () => string`             | 독립된 상태를 가진 UUID v7 생성기. 난수원·시계 주입        |
| `stringifyUuid`                | `(bytes: Uint8Array, format?: UuidFormat) => string`           | 16바이트를 UUID 문자열로 바꾼다                            |
| `parseUuid`                    | `(value: string) => Uint8Array<ArrayBuffer>`                   | UUID 문자열을 16바이트로 바꾼다. 형식만 검사한다           |
| `isUuid`                       | `(value: unknown, options?: IsUuidOptions) => value is string` | RFC 9562 UUID 형식인지 판정하는 타입 가드                  |
| `SecureRandomUnavailableError` | 클래스                                                         | `getRandomValues`를 쓸 수 없는 환경에서 던지는 오류        |
| `IdCollisionError`             | `attempts: number` 속성을 가진 `Error`의 하위 클래스           | 충돌 회피가 재시도 상한을 넘었을 때 던지는 오류            |

```ts
import {
  IdCollisionError,
  SecureRandomUnavailableError,
  createCounterIdFactory,
  createCyclicIdFactory,
  randomId,
  createRandomIdFactory,
  createUuidv4Factory,
  createUuidv7Factory,
  isUuid,
  nanoid,
  parseUuid,
  stringifyUuid,
  uuidv4,
  uuidv7,
} from "@cp949/random/id";
import type {
  IsUuidOptions,
  CounterIdGenerator,
  CounterIdOptions,
  CyclicIdGenerator,
  CyclicIdOptions,
  CyclicIdPreset,
  RandomIdOptions,
  RandomIdFactoryOptions,
  RandomIdPreset,
  UuidFormat,
  Uuidv4FactoryOptions,
  Uuidv7FactoryOptions,
} from "@cp949/random/id";
```

타입 export는 `RandomIdOptions`, `RandomIdFactoryOptions`, `RandomIdPreset`, `UuidFormat`(`stringifyUuid`, `uuidv4`, `uuidv7`의 `format`), `IsUuidOptions`(`isUuid`의 `options`), `Uuidv4FactoryOptions`(`createUuidv4Factory`의 `options`), `Uuidv7FactoryOptions`(`createUuidv7Factory`의 `options`), `CyclicIdPreset`, `CyclicIdOptions`, `CyclicIdGenerator`, `CounterIdOptions`, `CounterIdGenerator`다.

## 보장 범위

| 항목               | 보장                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 난수원             | 기본 생성은 `getRandomValues`만 사용한다. 주입 난수원에는 보안 보증이 없다                                                                                                                       |
| 문자 선택          | 각 자리의 허용 문자 안에서 균등하게 고른다. `startWithLetter`의 첫 자리는 영문자 부분집합을 사용한다                                                                                             |
| 엔트로피           | 기본 난수원에서 문자 집합·무작위 길이로 결정된다. 접두사·시각·구분자는 더하지 않는다                                                                                                             |
| 유일성             | 무작위 생성만으로 무충돌을 보장하지 않는다. `isTaken`도 예약이 아니므로 DB 유일성 제약을 함께 사용한다                                                                                           |
| 정렬               | UUID v7은 [단조성의 보장 범위](#단조성의-보장-범위)를 따른다. `randomId`의 timestamp는 같은 ms 안의 순서를 보장하지 않는다                                                                       |
| 재현성             | 무작위 결과값·주입 바이트 매핑·소비 순서는 계약이 아니다. UUID 파싱·문자열화·형식 판정은 입력으로 결정된다                                                                                       |
| 인증·인가          | UUID나 ID의 소유·형식·추측 난이도로 신원이나 접근 권한을 증명하지 않는다                                                                                                                         |
| 순환·카운터 유일성 | 한 주기(`범위 크기 / gcd(절댓값 step, 범위 크기)`) 안에서만 인스턴스 단위로 고유하다. wrap 뒤 재사용은 정상이며 충돌 관리는 호출자 몫이다                                                        |
| 순환·카운터 예측   | 옵션이 수열을 완전히 결정한다. 보안 용도가 아니며 토큰·인증 코드에는 무작위 ID를 쓴다. 카운터는 `prefix`·`separator`·`case`가 같고 `pad`가 `max`의 자릿수 이상이면 wrap 전까지 사전순이 값순이다 |

사용처별 호출 예시는 [ID 레시피](../guides/id-recipes.md)에 있다.

## 오류 종류

호출자가 구분해 잡아야 하는 실패는 세 종류이며 클래스가 서로 다르다.

| 오류                           | 원인                                                   | 호출자의 대응                                   |
| ------------------------------ | ------------------------------------------------------ | ----------------------------------------------- |
| `RangeError`                   | 인자·옵션이 계약을 벗어남(타입이 틀린 값 포함)         | 호출 코드의 버그다. 입력을 고친다               |
| `SecureRandomUnavailableError` | 실행 환경에서 `getRandomValues`를 쓸 수 없음           | 환경을 바꾸거나 기능을 끈다. 대체 난수원은 없다 |
| `IdCollisionError`             | 충돌 회피(`isTaken`)가 재시도 상한 안에 ID를 찾지 못함 | 재시도 상한이나 문자 집합·길이를 조정한다       |

## 사용 환경

- 기본 난수원 요건은 `globalThis.crypto.getRandomValues`다. `uuidv7`과 `timestamp: true`인 무작위 ID는 기본 시계로 `Date.now`도 쓴다. `Math.random`을 포함한 다른 난수원으로 대체하지 않는다. `node:crypto`를 import하지 않는다. 난수를 만드는 함수에만 해당하며 `stringifyUuid`, `parseUuid`, `isUuid`와 순환·카운터 ID(`createCyclicIdFactory`, `createCounterIdFactory`)는 crypto에 접근하지 않는다.
- `globalThis.crypto`와 `Date.now`는 import 시점이 아니라 호출 시점에 조회한다. `crypto`가 없는 환경에서도 import는 성공한다. `uuidv7`의 기본 인스턴스도 import 시점이 아니라 첫 호출에서 만든다.
- UUID v4는 `crypto.randomUUID`를 쓰지 않고 `getRandomValues`로 얻은 바이트로 만든다. `getRandomValues`만 있으면 동작한다.
- import 경로는 `@cp949/random/id`이며 `package.json`의 `exports` 맵으로만 제공한다. TypeScript는 `moduleResolution`이 `Bundler` 또는 `NodeNext`(`Node16` 포함)일 때 타입을 해석한다. `node10`(`moduleResolution: node`)과 webpack 4는 지원하지 않는다.
- `parseUuid`의 반환 타입 `Uint8Array<ArrayBuffer>`는 TypeScript 5.7에서 generic이 되었다. 5.6.1-rc에서는 이 표기가 TS2315로 실패하므로 TypeScript 5.7 이상이 필요하다. 소비자 검증은 `parseUuid`의 결과를 `lib.dom`의 `crypto.subtle.digest`에 캐스팅 없이 넘기는 코드도 컴파일한다.
- 공개 타입은 DOM 타입을 참조하지 않는다. DOM lib 없이 빌드하는 소비자도 사용할 수 있다. 소비자 검증(`pnpm check:consumer`)이 TypeScript 5.7.3과 저장소의 TypeScript에서 `Bundler`, `NodeNext` 설정 모두로 이 진입점을 import하는 코드를 컴파일하고, 설치된 패키지를 crypto 기본·제거·접근 예외 세 상태에서 호출한다.

### 검증 근거의 범위

| 근거                   | 확인하는 것                                                                | 포함하지 않는 것                          |
| ---------------------- | -------------------------------------------------------------------------- | ----------------------------------------- |
| 정적 검사              | 타입·공개 export·번들 한도, ES2019/Chrome 75 문법·API 하한                 | 실제 브라우저 실행                        |
| 단위 테스트·stub       | 옵션 경계, 난수원·시계 오류, 충돌 재시도와 인스턴스 상태                   | 운영 난수원·DB·분산 환경의 동작           |
| tarball 소비자 fixture | Node 설치본의 타입 해석, crypto 3상태 smoke, 기본 crypto에서 9개 사용성 식 | Chrome 75·Worker 실브라우저와 서비스 통합 |

이 문서의 검증은 위 세 범위다. Chrome 75 실브라우저 실행과 운영 환경 검증을 완료했다는 뜻은 아니다. 실브라우저 실측과 검증 한계는 `docs/compatibility.md`에 있다.

## 공통 규칙

### 인자 검증

- 숫자 인자는 `typeof`가 `"number"`이고 safe integer이며 범위 안이어야 한다. 문자열, 소수, `NaN`, `Infinity`, 객체(`valueOf`를 가진 객체 포함), 배열, `null`, `boolean`, `bigint`는 `RangeError`다.
- 검증 실패의 오류 클래스는 `RangeError` 하나다. 타입이 틀린 인자도 `TypeError`가 아니라 `RangeError`다. 호출자가 잡을 검증 오류가 하나로 정해진다.
- `undefined`는 기본값이 있는 인자에서만 기본값으로 대체된다. 기본값이 있는 인자에서도 `null`은 `RangeError`다.
- 오류 메시지는 영어이며 문구는 계약이 아니다. 오류 타입만 계약이다.

`stringifyUuid`의 바이트와 팩토리 주입 난수원 반환값은 `ArrayBuffer.isView`와 `instanceof Uint8Array`를 함께 검사한다. 같은 realm의 실제 `Uint8Array`·하위 클래스·offset view는 받고, 다른 realm의 배열·프로토타입만 위장한 객체·배열을 감싼 `Proxy`는 `RangeError`로 거부한다. 옵션 getter나 주입 함수가 직접 던진 예외는 `RangeError`로 바꾸지 않고 그대로 전파한다.

### 옵션 객체 읽기

옵션 객체를 받는 함수(`stringifyUuid`·`uuidv4`·`uuidv7`의 `format`, `isUuid`·`randomId`·`createRandomIdFactory`·`createUuidv4Factory`·`createUuidv7Factory`·`createCyclicIdFactory`·`createCounterIdFactory`의 `options`)는 다음 규칙으로 옵션을 읽는다.

- 옵션은 `undefined`(옵션 없음)이거나 객체여야 한다. `null`, 배열, 함수, 원시값은 `RangeError`다.
- 알 수 없는 키는 `RangeError`다(오타 방지). 검사 대상은 own enumerable 문자열 키(`Object.keys`)다. Symbol 키, 상속된 알 수 없는 키, enumerable이 아닌 own 키는 검사하지 않는다. 값이 `undefined`인 알 수 없는 키도 거부한다.
- 알려진 필드는 `options.<필드>`로 정확히 한 번씩 읽는다. getter와 상속된 값도 읽히고, 읽은 뒤에는 원본을 다시 읽지 않는다. 알 수 없는 키가 있으면 getter를 실행하기 전에 거부한다.
- 값이 `undefined`인 알려진 필드는 필드가 없는 것과 같다. `null`은 값으로 검증되어 `RangeError`다.

### 실패 순서

1. 인자를 검증한다(`RangeError`).
2. 난수를 요청한다. `getRandomValues`를 쓸 수 없으면 `SecureRandomUnavailableError`이고, `getRandomValues`가 던진 오류는 그대로 전파되며 부분 결과는 돌려주지 않는다. 오류 뒤의 다음 호출은 정상 동작한다. 난수를 요청하는 함수 중 호출 사이에 상태를 가지는 것은 `uuidv7`과 그 팩토리뿐이며, 그 상태도 실패한 호출에서는 바뀌지 않는다.

인자 검증이 먼저이므로 잘못된 인자는 환경과 무관하게 항상 `RangeError`다. `crypto`가 없는 환경에서도 같다. UUID 형식 함수(`stringifyUuid`, `parseUuid`, `isUuid`)는 난수를 요청하지 않으므로 2단계가 없고, `SecureRandomUnavailableError`를 던지지 않는다.

팩토리(`create…Factory`)는 두 단계를 나눈다. 생성 시점에는 1단계(옵션 검증)만 하고 `crypto`에 접근하지 않으며 주입한 난수원도 호출하지 않는다. 2단계(난수 요청과 주입 난수원의 결과 검사)는 생성기를 호출할 때마다 일어난다. 그래서 모듈 최상위에서 팩토리를 만들어도 `crypto`가 없는 환경에서 import가 성공하고, `SecureRandomUnavailableError`는 생성기의 첫 호출에서 난다.

순환·카운터 팩토리는 1단계(옵션 검증)만 있다. 생성기의 호출은 난수를 요청하지 않고 예외를 던지지 않으며, `reset`의 인자 위반만 `RangeError`다.

### 길이 상한

ID 한 개의 무작위 부분 길이 상한은 1,024다. ID가 실용적인 크기를 넘지 않게 하는 제약이다. `@cp949/random/secure`의 길이 상한(1,048,576)과 값이 다른 것은 의도다. 그 상한은 원시 생성기의 메모리 제한이고, 이 상한은 식별자 길이 제약이다.

## `nanoid(length = 21)`

```ts
function nanoid(length?: number): string;
```

base64url 64자로 이루어진 URL-safe 무작위 ID를 만든다. 옵션이 없는 최소 진입점이다.

| 항목          | 내용                                                                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 입력 `length` | 결과의 문자 수. 1 이상 1,024 이하의 정수이며 `undefined`이면 기본값 21이다. 0, 1,025 이상, 소수, `NaN`, 문자열, `null`, 객체 등 그 밖의 값은 `RangeError`다 |
| 오류          | `RangeError`(인자, 환경과 무관), `SecureRandomUnavailableError`(지원 안 됨), `getRandomValues`가 던진 오류(그대로 전파)                                     |
| 결과 길이     | `length`와 같다. 기본값은 21자다                                                                                                                            |
| 결과 형식     | `A-Za-z0-9-_`(RFC 4648 5절의 base64url 문자 집합, 64자)만 쓴다. padding(`=`)이 없다                                                                         |
| 분포          | 64자가 같은 확률로 나온다(계약). 바이트의 하위 6비트로 문자를 고르므로 rejection이 없고 modulo 편향이 없다                                                  |
| 결과 값       | 무작위이며 재현할 수 없다(계약이 아니다)                                                                                                                    |
| 난수 사용     | 호출마다 지역 버퍼로 필요한 바이트를 요청하고 호출 사이에 상태를 남기지 않는다. 요청 크기와 바이트가 문자가 되는 방식은 구현 세부이며 계약이 아니다         |
| 변경 불가     | 문자 집합과 난수원을 바꿀 수 없다. 다른 문자 집합이 필요하면 `@cp949/random/secure`의 `randomString`을 쓴다                                                 |

```ts
import { nanoid } from "@cp949/random/id";

const id = nanoid(); // 21자, 예: "PC8IRvvyIKses-N01mP8z"
const short = nanoid(8); // 8자, 예: "u5qZjXNM"
```

## 무작위 ID 옵션

`randomId`와 `createRandomIdFactory`는 다음 평면 옵션을 받는다. 모든 필드는 선택이며 [옵션 객체 읽기](#옵션-객체-읽기) 규칙을 따른다. 배타·종속 규칙은 TypeScript 타입으로 표현하지 않고 런타임 `RangeError`로 검사한다.

| 옵션              | 타입                             | 기본값                 | 의미                                                       |
| ----------------- | -------------------------------- | ---------------------- | ---------------------------------------------------------- |
| `prefix`          | `string`                         | 없음                   | 비어 있지 않은 고정 접두사                                 |
| `separator`       | `string`                         | `"_"`                  | 접두사·timestamp·무작위 부분 사이 구분자. 빈 문자열 허용   |
| `length`          | `number`                         | 21                     | 무작위 부분의 코드 포인트 수. 1~1024 정수                  |
| `bits`            | `number`                         | 없음                   | 목표 엔트로피. 1~4096 정수이며 최소 길이로 변환            |
| `preset`          | `RandomIdPreset`                 | `"base64url"`          | 이름 있는 문자 집합                                        |
| `alphabet`        | `string`                         | 없음                   | 서로 다른 코드 포인트 2~256개. 중복·짝 없는 surrogate 거부 |
| `case`            | `"lower" \| "upper"`             | preset 기본            | `base36`, `readable`에서만 사용                            |
| `group`           | `number`                         | 없음                   | 무작위 부분을 끊는 문자 수. 1~무작위 길이 정수             |
| `groupSeparator`  | `string`                         | `"-"`                  | 그룹 구분자. 빈 문자열 허용                                |
| `startWithLetter` | `boolean`                        | `false`                | 최종 ID의 첫 문자를 ASCII 영문자로 제한                    |
| `timestamp`       | `boolean`                        | `false`                | 소문자 base36 9자 시각 접두사                              |
| `isTaken`         | `(id: string) => boolean`        | 없음                   | 최종 ID가 사용 중이면 `true`를 돌려주는 동기 검사          |
| `maxAttempts`     | `number`                         | 10                     | 최초 시도를 포함한 시도 상한. 1~1000 정수                  |
| `randomBytes`     | `(length: number) => Uint8Array` | 기본 보안 난수원       | 팩토리 전용 테스트 주입. 주입 결과에는 보안 보증 없음      |
| `now`             | `() => number`                   | 호출 시점의 `Date.now` | 팩토리 전용 시계 주입. `timestamp: true`에서만 사용        |

`length`와 `bits`, `preset`과 `alphabet`은 함께 지정할 수 없다. `separator`는 `prefix` 또는 `timestamp: true`가 있어야 하고, `groupSeparator`는 `group`, `maxAttempts`는 `isTaken`이 있어야 한다. `case`는 사용자 `alphabet` 및 다른 preset과 함께 쓸 수 없다. 숫자 옵션은 모두 safe integer여야 한다.

`length`는 README의 일반 길이 규칙의 예외다. 접두사·timestamp·구분자·그룹 구분자는 세지 않고 **무작위 부분만** 센다. 이모지도 코드 포인트 하나면 한 글자다. `group` 역시 코드 포인트 단위이고 마지막 그룹은 짧을 수 있다. 예를 들어 `{ length: 5, group: 2 }`는 `AB-CD-E` 형태다.

| preset      | 문자 집합과 순서                                                      | 크기 |
| ----------- | --------------------------------------------------------------------- | ---- |
| `base64url` | `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_`    | 64   |
| `base62`    | `0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz`      | 62   |
| `base36`    | `0123456789abcdefghijklmnopqrstuvwxyz` (`upper`이면 대문자)           | 36   |
| `digits`    | `0123456789`                                                          | 10   |
| `readable`  | `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (`lower`이면 소문자, 0·1·I·O 제외) | 32   |

문자 집합 크기가 `n`이면 `bits`는 `ceil(bits / log2(n))` 길이로 변환한다. `startWithLetter`가 무작위 첫 글자를 제한할 때는 영문자 수 `L`을 반영해 `max(1, 1 + ceil((bits - log2(L)) / log2(n)))`이 된다. 변환 결과가 1024를 넘으면 `RangeError`다. 예를 들어 기본 문자 집합의 126비트는 21자지만 첫 글자를 제한하면 22자다. 보안 난수원을 사용할 때 옵션이 주는 엔트로피는 이 `bits`·`length` 변환과 문자 집합 크기로 보장한다. 고정 접두사·시각·구분자는 엔트로피를 더하지 않는다.

`startWithLetter`에 접두사가 있으면 접두사의 첫 글자만 ASCII 영문자인지 검사하고 무작위 부분은 제한하지 않는다. 접두사 없이 timestamp를 쓰면 `RangeError`다. 둘 다 없으면 무작위 첫 글자를 문자 집합의 ASCII 영문자 중에서 고른다. 영문자가 없는 `digits`나 사용자 문자 집합은 거부한다.

조립 순서는 `[prefix][separator][timestamp][separator][random]`이며 없는 구성요소와 그 구분자는 생략한다. timestamp는 `case`와 무관하게 항상 소문자 base36 9자이며 앞을 `0`으로 채운다. `now()`는 0 이상 `36 ** 9` 미만 정수여야 하고 그렇지 않으면 그 호출이 `RangeError`다. timestamp의 사전순은 시간순이지만 같은 밀리초 안의 순서는 보장하지 않는다. 최종 ID의 시간순 비교에는 동일한 접두사와 구분자를 사용해야 한다.

구분자가 문자 집합과 겹쳐도 허용한다. 기본 `base64url`은 `_`와 `-`를 모두 포함하므로 구분자를 전부 지워 무작위 부분을 복원하면 문자를 잃을 수 있다. 접두사 뒤는 `id.slice(prefix.length + separator.length)`로 자른다(timestamp도 있으면 그 부분을 별도로 처리한다). 구분이 필요한 레시피에는 `base62`, `base36`, `readable`을 쓴다.

## `randomId(options?)`

```ts
function randomId(options?: RandomIdOptions): string;
```

호출마다 옵션을 검증하고 ID를 만든다. 기본값의 결과 형태는 `nanoid()`와 같은 base64url 21자다. 옵션 검증이 crypto 접근보다 먼저이므로 crypto가 없어도 잘못된 옵션은 `RangeError`다. 일회성 함수에는 `randomBytes`·`now`를 주입할 수 없으며 알 수 없는 키로 거부한다.

`isTaken`을 생략하면 한 번 조립해 반환한다. 지정하면 시도마다 시각과 무작위 부분을 새로 만들고 접두사·구분자·그룹 구분자를 포함한 최종 ID를 검사한다. `false`면 즉시 반환하고, `maxAttempts`번 모두 `true`면 `IdCollisionError`를 던진다. 기본 상한은 10이며 최초 시도를 포함한다. 반환값이 boolean이 아니면 Promise를 포함해 즉시 `RangeError`다. `isTaken`이 던진 예외는 재시도 없이 그대로 전파한다.

검사와 저장 사이의 경쟁은 막지 못한다. 여러 호출자가 같은 후보를 동시에 사용 가능하다고 판단할 수 있으므로 **DB 유일성 제약을 함께 사용해야 한다**. 라이브러리가 ID를 예약하거나 저장하지는 않는다.

오류는 `RangeError`(옵션·시계 값·검사 반환값), `SecureRandomUnavailableError`(기본 난수원 미지원), `IdCollisionError`(충돌 상한 소진)다. 난수원·시계·검사 함수가 직접 던진 예외는 그대로 전파된다. 형식·균등 문자 선택·엔트로피 계산은 계약이지만 결과값과 byte→문자 매핑·소비 순서는 계약이 아니다.

```ts
import { randomId } from "@cp949/random/id";

randomId({ prefix: "usr", preset: "base62", length: 16 });
randomId({ prefix: "req", preset: "base36", timestamp: true, length: 8 });
randomId({ preset: "readable", length: 12, group: 4 });
```

## `createRandomIdFactory(options?)`

```ts
function createRandomIdFactory(options?: RandomIdFactoryOptions): () => string;

interface RandomIdFactoryOptions extends RandomIdOptions {
  randomBytes?: (length: number) => Uint8Array;
  now?: () => number;
}
```

생성 시점에 옵션을 한 번 읽고 검증한다. 이후 원본 객체나 getter를 다시 읽지 않으며 객체를 변경해도 생성기의 동작은 바뀌지 않는다. 각 생성기는 독립된 옵션과 주입 함수를 갖는다. 같은 주입 함수를 여러 생성기에 직접 공유하면 그 함수가 가진 상태도 공유한다.

생성은 crypto·clock에 접근하거나 `randomBytes`·`now`·`isTaken`을 호출하지 않는다. 기본 crypto와 `Date.now`는 생성기를 호출할 때 찾는다. crypto가 없는 환경에서도 생성은 성공하고 `SecureRandomUnavailableError`는 첫 호출부터 난다. 잘못된 옵션은 생성 시점에 `RangeError`이며, 난수원·시계·검사 반환값의 위반은 해당 호출에서 `RangeError`다. 충돌 회피와 `IdCollisionError` 조건은 `randomId`와 같다.

주입한 `randomBytes`는 호출마다 요청한 길이와 같은 `Uint8Array`를 반환해야 한다. 빈·짧은·긴 배열, `null`, `Array`, `Uint16Array`, 문자열은 `RangeError`다. `instanceof Uint8Array`로 판정하므로 하위 클래스와 offset view는 받고 다른 realm의 배열은 거부한다. 주입 배열은 변경하지 않는다. 주입은 테스트용이고 **주입 난수원의 결과에는 보안 보증이 없다**. 고정 byte 주입 결과와 byte→문자 매핑·소비 순서는 계약이 아니다.

```ts
import { createRandomIdFactory } from "@cp949/random/id";

const used = new Set<string>();
const next = createRandomIdFactory({
  prefix: "usr",
  preset: "base62",
  length: 16,
  isTaken: (id) => used.has(id),
});
const id = next();
used.add(id);
```

## `uuidv4(format?)`

```ts
function uuidv4(format?: UuidFormat): string;
```

RFC 9562 UUID v4를 만든다. 무작위 122비트와 고정 6비트(version 4, variant 10)로 이루어진다. `crypto.randomUUID`를 쓰지 않고 `getRandomValues`로 얻은 16바이트에서 만든다. 난수원을 주입할 수 없는 일회성 함수이며, 결정적 테스트는 `createUuidv4Factory`로 한다.

| 항목          | 내용                                                                                                                                                                                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 입력 `format` | `undefined`(기본 형식) 또는 `{ dashes?, case? }` 객체(`UuidFormat`). 규칙은 `stringifyUuid`의 `format`과 같다. 난수원(`randomBytes`)과 시계는 받지 않는다. 알 수 없는 키라서 `RangeError`다                                                         |
| 오류          | `RangeError`(`format`, 환경과 무관), `SecureRandomUnavailableError`(지원 안 됨), `getRandomValues`가 던진 오류(그대로 전파)                                                                                                                         |
| 결과 형식     | 계약이다. 길이는 36(`dashes: false`이면 32)이고 version 자리(13번째 hex)가 `4`, variant 자리(17번째 hex)가 `8`, `9`, `a`, `b`이며 `case`에 따라 소문자 또는 대문자다. `isUuid(결과, { version: 4 })`가 `true`다(`dashes: false`이면 그 옵션도 준다) |
| 결과 값       | 무작위이며 재현할 수 없다(계약이 아니다). 난수원의 바이트가 UUID의 어느 자리로 가는지는 구현 세부이며 계약이 아니다                                                                                                                                 |
| 난수 사용     | 호출마다 16바이트를 한 번 요청하고 호출 사이에 상태를 남기지 않는다. `crypto.randomUUID`를 호출하지 않는다                                                                                                                                          |

```ts
import { uuidv4 } from "@cp949/random/id";

uuidv4(); // 예: "919108f7-52d1-4320-9bac-f847db4148a8"
uuidv4({ dashes: false }); // 예: "919108f752d143209bacf847db4148a8"
uuidv4({ case: "upper" }); // 예: "919108F7-52D1-4320-9BAC-F847DB4148A8"
```

## `createUuidv4Factory(options?)`

```ts
function createUuidv4Factory(options?: Uuidv4FactoryOptions): () => string;

interface Uuidv4FactoryOptions extends UuidFormat {
  randomBytes?: (length: number) => Uint8Array; // 테스트용 주입. 결과에 보안 보증이 없다.
}
```

같은 옵션으로 UUID v4를 반복해 만드는 생성기를 돌려준다. 옵션은 생성할 때 한 번만 검증하고 읽는다. 난수원을 주입할 수 있는 진입점이며 주입은 결정적 테스트용이다.

`Uuidv4FactoryOptions`는 `UuidFormat`(`dashes`, `case`)에 `randomBytes`를 더한다. 시계(`now`)는 받지 않는다. `randomBytes`의 타입은 `(length: number) => Uint8Array`이며 `@cp949/random/secure`의 `randomBytes`가 캐스팅 없이 맞는다. 주입한 난수원의 결과에는 보안 보증이 없다. 운영 코드에서는 `randomBytes`를 넘기지 않는다.

| 항목           | 내용                                                                                                                                                                                                                                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 입력 `options` | `undefined` 또는 `{ dashes?, case?, randomBytes? }` 객체. `dashes`·`case`는 `uuidv4`의 `format`과 같다. 알 수 없는 키(`now` 포함), 객체가 아닌 값, 함수가 아닌 `randomBytes`(`null` 포함), `dashes`·`case`의 잘못된 값은 `RangeError`다. 값이 `undefined`인 키는 생략과 같다                                                       |
| 생성 시점      | 옵션 검증만 한다. `crypto`에 접근하지 않고 `randomBytes`도 호출하지 않는다. 잘못된 옵션은 생성 시점에 `RangeError`다                                                                                                                                                                                                               |
| 생성기 호출    | 호출마다 난수원에 16바이트를 한 번 요청한다. `randomBytes`를 생략하면 호출할 때마다 `globalThis.crypto.getRandomValues`를 찾으므로, 생성한 뒤에 `crypto`가 생기면 같은 생성기가 동작한다                                                                                                                                           |
| 주입 결과 검사 | 주입한 `randomBytes`가 돌려준 값이 요청 길이(16)의 `Uint8Array`가 아니면(`null`, `Array`, `Uint16Array`, 문자열, 빈·짧은·긴 배열) 그 호출이 `RangeError`다. 재시도하지 않는다. 판정은 `instanceof Uint8Array`라서 하위 클래스(`Buffer` 포함)와 `byteOffset`이 있는 view는 받고 다른 realm(iframe, `vm` 컨텍스트)의 배열은 거부한다 |
| 주입 배열 불변 | 주입한 난수원이 돌려준 배열을 변경하지 않는다. 복사한 뒤 version·variant를 적용하므로 같은 배열을 매번 돌려줘도 내용이 그대로이고 같은 결과가 나온다                                                                                                                                                                               |
| 오류           | `RangeError`(옵션은 생성 시점, 주입 난수원의 결과는 그 호출), `SecureRandomUnavailableError`(기본 난수원을 쓸 수 없을 때 첫 호출부터), `getRandomValues`나 주입한 `randomBytes`가 던진 오류(그대로 전파)                                                                                                                           |
| 결과 형식      | `uuidv4`와 같다(계약)                                                                                                                                                                                                                                                                                                              |
| 결과 값        | 형식만 계약이다. 고정 바이트를 주입했을 때의 결과 문자열(주입한 바이트가 UUID의 어느 자리로 가는지, version·variant를 적용한 값)은 구현 세부이며 계약이 아니다. 같은 라이브러리 버전에서 같은 바이트는 같은 문자열이 되지만 라이브러리를 갱신하면 그 문자열이 바뀔 수 있다                                                         |
| 독립성         | 생성기는 각자 옵션과 난수원을 가지며 서로 상태를 공유하지 않는다. 생성한 뒤 옵션 객체를 바꿔도 이미 만든 생성기에는 영향이 없다                                                                                                                                                                                                    |

```ts
import { createUuidv4Factory } from "@cp949/random/id";

const next = createUuidv4Factory({ dashes: false, case: "upper" });
next(); // 예: "919108F752D143209BACF847DB4148A8"
next(); // 호출마다 새 UUID

// 결정적 테스트: 같은 바이트를 주입하면 같은 UUID가 나온다(값 자체는 계약이 아니다)
const fixed = () => new Uint8Array(16); // 호출마다 새 배열
createUuidv4Factory({ randomBytes: fixed })() ===
  createUuidv4Factory({ randomBytes: fixed })(); // true

// 잘못된 옵션은 생성 시점에 RangeError다
createUuidv4Factory({ randomBytes: "bytes" }); // RangeError
```

## `uuidv7(format?)`

```ts
function uuidv7(format?: UuidFormat): string;
```

RFC 9562 UUID v7을 만든다. 앞 48비트는 유닉스 시각(밀리초)이며 아래 단조성 보장 조건에서 문자열 정렬 순서가 생성 순서와 같다. 난수원과 시계를 주입할 수 없는 일회성 함수이며, 결정적 테스트는 `createUuidv7Factory`로 한다.

### 레이아웃

| 비트                | 내용                                                           |
| ------------------- | -------------------------------------------------------------- |
| 0~47 (`unix_ts_ms`) | 1970-01-01 UTC부터의 밀리초. big-endian 48비트 정수다          |
| 48~51 (version)     | `0111`. 문자열의 13번째 hex가 `7`이다                          |
| 52~63 (`rand_a`)    | 같은 밀리초 안에서 1씩 오르는 12비트 counter. 최댓값은 4,095다 |
| 64~65 (variant)     | `10`. 문자열의 17번째 hex가 `8`, `9`, `a`, `b`다               |
| 66~127 (`rand_b`)   | 난수 62비트                                                    |

counter의 초깃값은 난수의 하위 11비트라 0~2,047이다(최상위 비트를 0으로 둔다). 그래서 같은 밀리초에서 적어도 2,049개를 counter만으로 만들 수 있다. 그보다 많이 필요하면 아래 "단조성"의 고갈 규칙을 따른다.

| 항목          | 내용                                                                                                                                                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 입력 `format` | `undefined`(기본 형식) 또는 `{ dashes?, case? }` 객체(`UuidFormat`). 규칙은 `stringifyUuid`의 `format`과 같다. 난수원(`randomBytes`)과 시계(`now`)는 받지 않는다. 알 수 없는 키라서 `RangeError`다                          |
| 오류          | `RangeError`(`format` 위반, 시계 값이 0 이상 2^48 미만의 정수가 아님, counter 고갈로 timestamp 상한 초과), `SecureRandomUnavailableError`(지원 안 됨), 난수원·시계가 던진 오류(그대로 전파)                                 |
| 결과 형식     | 계약이다. 길이는 36(`dashes: false`이면 32)이고 version 자리가 `7`, variant 자리가 `8`, `9`, `a`, `b`이며 `case`에 따라 소문자 또는 대문자다. `isUuid(결과, { version: 7 })`가 `true`다(`dashes: false`이면 그 옵션도 준다) |
| 결과 값       | timestamp는 시계·고갈·되돌림 규칙에 따른 논리 시각이며 counter와 난수로 나머지를 채운다. 결과값과 난수 바이트 매핑은 계약이 아니다                                                                                          |
| 단조성        | 같은 인스턴스가 돌려준 문자열은 정렬 순서가 생성 순서와 같다(계약). 아래 "단조성의 보장 범위"의 조건이 붙는다                                                                                                               |
| 난수 사용     | 호출마다 10바이트를 한 번 요청한다. `crypto.randomUUID`를 호출하지 않는다                                                                                                                                                   |
| 기본 인스턴스 | 모든 `uuidv7()` 호출이 모듈 하나당 하나뿐인 기본 인스턴스를 공유한다. 인스턴스는 import 시점이 아니라 첫 호출에서 만들어지고, `format`이 달라도 같은 인스턴스를 쓴다. 시계는 호출할 때마다 `Date.now`를 찾는다              |

```ts
import { uuidv7 } from "@cp949/random/id";

uuidv7(); // 예: "018f3b2c-1a40-7c9e-b1f2-4d6a0b8e5c31"
uuidv7({ dashes: false }); // 예: "018f3b2c1a417c9eb1f24d6a0b8e5c31"

// 같은 인스턴스가 만든 값은 문자열 정렬이 생성 순서와 같다
const ids = [uuidv7(), uuidv7(), uuidv7()];
[...ids].sort(); // ids와 같은 순서
```

### 단조성의 보장 범위

- **인스턴스 단위다.** 보장 대상은 한 생성기(또는 `uuidv7`의 기본 인스턴스)가 돌려준 값끼리다. 탭, Worker, 프로세스, 서버 인스턴스 사이에서는 보장하지 않는다. 같은 페이지라도 번들러가 이 패키지를 두 번 포함하면 기본 인스턴스도 둘이고 둘 사이에는 보장이 없다.
- **비교는 같은 `format`끼리의 문자열 비교다.** `dashes`나 `case`가 섞이면 문자열 비교 결과가 순서와 달라진다(대문자 hex는 소문자보다 코드 포인트가 작다). 정렬해서 쓸 값은 형식을 하나로 고정한다.
- **counter가 고갈되면 timestamp가 시계보다 앞선다.** 같은 밀리초에서 counter가 4,095를 넘겨야 하면 기다리지 않고 timestamp를 1밀리초 앞세우고 counter를 다시 잡는다. 순서는 유지되지만 앞 48비트가 실제 시각보다 클 수 있다.
- **마지막 timestamp와 현재 시계의 차이가 10,000밀리초를 넘으면 재설정한다.** 현재 시계가 마지막 timestamp보다 10,000밀리초 이내로 뒤처지면 마지막 timestamp를 이어 쓰고, 그보다 뒤처지면 시계 기준으로 다시 시작한다. 이 재설정 구간에서는 이전 값보다 작은 값이 나온다. 고정된 시계로 약 2천만~4천만 개를 생성해 timestamp가 시계보다 10,000밀리초 넘게 앞서도 같은 재설정이 일어난다. 필요한 생성 수는 각 counter 초깃값에 따라 달라진다(한 timestamp당 2,049~4,096개, 약 2,049만~4,096만 개 규모).
- **실패한 호출은 순서를 건너뛰지 않는다.** 난수원이나 시계가 던지거나 잘못된 값을 돌려주면 그 호출만 실패하고 counter와 timestamp는 그대로다. 다음 호출이 이어서 만든다.
- **timestamp 상한.** 시계 값은 0 이상 2^48 미만의 정수여야 한다(그 밖의 값은 `RangeError`). timestamp가 2^48 - 1인데 counter까지 고갈되면 1밀리초를 앞세울 수 없어 그 호출이 `RangeError`이고 상태는 유지된다.

### 보안·프라이버시

UUID v7은 앞 48비트로 시각 정보(밀리초)를 드러낸다. 고갈·되돌림 때 실제 시각과 다를 수 있지만 시각을 숨기는 용도에는 맞지 않는다. 시각을 노출하면 안 되는 값에는 `uuidv4`나 timestamp 없는 `randomId`를 쓴다. UUID는 인증·인가 수단이 아니다. 값을 아는 것만으로 신원이나 접근 권한을 인정하지 않는다.

## `createUuidv7Factory(options?)`

```ts
function createUuidv7Factory(options?: Uuidv7FactoryOptions): () => string;

interface Uuidv7FactoryOptions extends UuidFormat {
  randomBytes?: (length: number) => Uint8Array; // 테스트용 주입. 결과에 보안 보증이 없다.
  now?: () => number; // 테스트용 주입
}
```

같은 옵션으로 UUID v7을 반복해 만드는 생성기를 돌려준다. 생성기마다 timestamp·counter 상태가 독립이며 `uuidv7`의 기본 인스턴스와도 공유하지 않는다. 난수원과 시계를 주입할 수 있는 진입점이며 주입은 결정적 테스트용이다.

`Uuidv7FactoryOptions`는 `UuidFormat`(`dashes`, `case`)에 `randomBytes`와 `now`를 더한다. `randomBytes`의 타입은 `(length: number) => Uint8Array`이며 `@cp949/random/secure`의 `randomBytes`가 캐스팅 없이 맞는다. 주입한 난수원의 결과에는 보안 보증이 없다. 운영 코드에서는 두 옵션을 넘기지 않는다.

| 항목           | 내용                                                                                                                                                                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 입력 `options` | `undefined` 또는 `{ dashes?, case?, randomBytes?, now? }` 객체. `dashes`·`case`는 `uuidv4`의 `format`과 같다. 알 수 없는 키, 객체가 아닌 값, 함수가 아닌 `randomBytes`·`now`(`null`, `Date` 객체 포함), `dashes`·`case`의 잘못된 값은 `RangeError`다. 값이 `undefined`인 키는 생략과 같다 |
| 생성 시점      | 옵션 검증만 한다. `crypto`와 시계에 접근하지 않고 `randomBytes`·`now`도 호출하지 않는다. 잘못된 옵션은 생성 시점에 `RangeError`다                                                                                                                                                         |
| 생성기 호출    | 호출마다 난수원에 10바이트를 한 번, 시계를 한 번 요청한다. `randomBytes`를 생략하면 호출할 때마다 `globalThis.crypto.getRandomValues`를, `now`를 생략하면 `Date.now`를 찾는다                                                                                                             |
| 주입 결과 검사 | 주입한 `randomBytes`가 돌려준 값이 요청 길이(10)의 `Uint8Array`가 아니면 그 호출이 `RangeError`다. 판정은 `instanceof Uint8Array`라서 하위 클래스(`Buffer` 포함)와 `byteOffset`이 있는 view는 받고 다른 realm(iframe, `vm` 컨텍스트)의 배열은 거부한다                                    |
| 주입 시계 검사 | 주입한 `now`가 0 이상 2^48 미만의 정수를 돌려주지 않으면(`NaN`, 음수, 소수, 문자열, `undefined`) 그 호출이 `RangeError`다                                                                                                                                                                 |
| 주입 배열 불변 | 주입한 난수원이 돌려준 배열을 읽기만 하고 변경하지 않는다. 같은 배열을 매번 돌려줘도 내용이 그대로다(결과는 counter가 올라 달라진다)                                                                                                                                                      |
| 오류           | `RangeError`(옵션은 생성 시점, 주입한 난수원·시계의 결과와 timestamp 상한 초과는 그 호출), `SecureRandomUnavailableError`(기본 난수원을 쓸 수 없을 때 첫 호출부터), `getRandomValues`나 주입한 함수가 던진 오류(그대로 전파)                                                              |
| 결과 형식      | `uuidv7`과 같다(계약). 단조성의 보장 범위도 같다                                                                                                                                                                                                                                          |
| 결과 값        | 형식과 단조성만 계약이다. 고정 바이트·고정 시계를 주입했을 때의 결과 문자열(어떤 바이트가 UUID의 어느 자리로 가는지, counter 초깃값을 어떻게 뽑는지)은 구현 세부이며 계약이 아니다. 같은 라이브러리 버전에서 같은 입력은 같은 문자열이 되지만 라이브러리를 갱신하면 바뀔 수 있다          |
| 독립성         | 생성기는 각자 옵션·난수원·시계와 상태(`lastMs`, counter)를 가지며 서로 공유하지 않는다. 생성한 뒤 옵션 객체를 바꿔도 이미 만든 생성기에는 영향이 없다                                                                                                                                     |

```ts
import { createUuidv7Factory } from "@cp949/random/id";

const next = createUuidv7Factory({ dashes: false });
next(); // 예: "018f3b2c1a407c9eb1f24d6a0b8e5c31"
next(); // 같은 밀리초면 counter가 1 오르고 난수 부분도 새로 만든다

// 결정적 테스트: 시계와 바이트를 고정하면 결과가 재현된다(값 자체는 계약이 아니다)
const fixed = createUuidv7Factory({
  randomBytes: (length) => new Uint8Array(length),
  now: () => 1_700_000_000_000,
});
fixed(); // "018bcfe5-6800-7000-8000-000000000000"
fixed(); // "018bcfe5-6800-7001-8000-000000000000" (counter만 오른다)

// 잘못된 옵션은 생성 시점에 RangeError다
createUuidv7Factory({ now: 0 }); // RangeError
```

## `createCyclicIdFactory(options)`

```ts
function createCyclicIdFactory(options: CyclicIdOptions): CyclicIdGenerator;

type CyclicIdPreset =
  "int8" | "uint8" | "int16" | "uint16" | "int32" | "uint32";

interface CyclicIdOptions {
  preset?: CyclicIdPreset;
  min?: number;
  max?: number;
  start?: number;
  step?: number;
}

interface CyclicIdGenerator {
  (): number;
  peek(): number;
  reset(start?: number): void;
}
```

정수 범위 `[min, max]`를 `step`씩 순환하는 생성기를 만든다. 호출은 현재 값을 돌려주고 `step`만큼 이동한다. 범위 끝을 넘으면 반대쪽에서 이어지며 `step`이 1이면 `max` 다음은 `min`이다(음수 `step`은 반대 방향). 첫 호출은 `start`다. 옵션은 생성 시점에 한 번만 읽고 검증하며, 생성과 호출은 난수원·시계·crypto에 접근하지 않는다. 생성기마다 상태가 독립이다.

| 옵션     | 기본값                              | 검증                                                                                                                                                                                                  |
| -------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `preset` | 없음                                | `int8` `[-128, 127]`, `uint8` `[0, 255]`, `int16` `[-32768, 32767]`, `uint16` `[0, 65535]`, `int32` `[-2147483648, 2147483647]`, `uint32` `[0, 4294967295]`. `min`·`max`와 함께 지정하면 `RangeError` |
| `min`    | 0                                   | safe integer                                                                                                                                                                                          |
| `max`    | 없음(`preset`이 없으면 필수)        | safe integer, `min` 이상. 범위 크기 `max - min + 1`이 `Number.MAX_SAFE_INTEGER` 이하                                                                                                                  |
| `start`  | 범위가 0을 포함하면 0, 아니면 `min` | `[min, max]` 안의 safe integer                                                                                                                                                                        |
| `step`   | 1                                   | 0이 아닌 safe integer. 음수와 범위보다 큰 절댓값을 허용한다(범위 크기로 나눈 나머지만큼 이동)                                                                                                         |

| 항목      | 계약                                                                                                                                                                                          |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 입력 검증 | 옵션 읽기 규칙을 따른다. 위 표의 위반, `preset` 없이 `max`가 없는 경우, 알 수 없는 키는 생성 시점 `RangeError`                                                                                |
| 오류      | `RangeError`(생성 시 옵션 위반, `reset` 인자 위반)뿐이다. 생성기 호출은 던지지 않는다                                                                                                         |
| 결과 값   | 계약이다. 같은 옵션은 항상 같은 수열을 낸다. 아래 고정 벡터가 이를 고정한다                                                                                                                   |
| 상태 API  | `peek()`은 이동 없이 다음 값을 돌려준다. `reset()`은 생성 시 `start`로, `reset(v)`는 `v`로 되돌린다(`v`는 범위 안의 safe integer, 아니면 `RangeError`이고 상태 불변). 그 밖의 상태 API는 없다 |
| 부분 순환 | `step`과 범위 크기가 서로소가 아니면 `범위 크기 / gcd(절댓값 step, 범위 크기)`개만 순환한다. `step`이 범위 크기의 배수면 값이 변하지 않는다. 오류가 아니다                                    |
| 고유성    | 한 주기 안에서만 고유하다. wrap 뒤 값 재사용은 정상이며 사용 중인 값과의 충돌은 호출자가 관리한다. 예측 가능하며 보안 용도가 아니다                                                           |
| 형태      | 생성기는 `() => number`에 대입할 수 있다. `peek`·`reset`은 분리해서 호출해도 동작하지만 `() => next()`로 감싸면 사라진다                                                                      |
| 독립성    | 생성 뒤 옵션 객체를 바꿔도 영향이 없다. 상태는 프로세스·Worker·탭 사이에 공유되지 않고 재시작하면 초기화된다. 복원은 `peek()`로 저장한 값을 새 팩토리의 `start`나 `reset`에 넘긴다            |

고정 벡터(호출 결과 순서):

| 옵션                                     | 결과                      |
| ---------------------------------------- | ------------------------- |
| `{ preset: "int32" }`                    | `0, 1, 2`                 |
| `{ preset: "int32", start: 2147483647 }` | `2147483647, -2147483648` |
| `{ preset: "uint8", step: -1 }`          | `0, 255, 254`             |
| `{ min: 0, max: 4, step: 2 }`            | `0, 2, 4, 1, 3, 0`        |
| `{ min: 0, max: 4, step: 7 }`            | `0, 2, 4, 1, 3`           |
| `{ min: 0, max: 3, step: 2 }`            | `0, 2, 0`(부분 순환)      |
| `{ min: 10, max: 12 }`                   | `10, 11, 12, 10`          |
| `{ min: 7, max: 7 }`                     | `7, 7`                    |

```ts
import { createCyclicIdFactory } from "@cp949/random/id";

const nextId = createCyclicIdFactory({ preset: "int32" });
nextId(); // 0
nextId(); // 1
nextId.peek(); // 2 (이동하지 않는다)
nextId.reset(2147483647);
nextId(); // 2147483647
nextId(); // -2147483648
const saved = nextId.peek(); // -2147483647 — 다음 값을 저장해 둔다
const resumed = createCyclicIdFactory({ preset: "int32", start: saved });
resumed(); // -2147483647 — 새 생성기에서 이어서 센다
```

## `createCounterIdFactory(options?)`

```ts
function createCounterIdFactory(options?: CounterIdOptions): CounterIdGenerator;

interface CounterIdOptions {
  prefix?: string;
  separator?: string;
  radix?: number;
  pad?: number;
  case?: "lower" | "upper";
  min?: number;
  max?: number;
  start?: number;
  step?: number;
}

interface CounterIdGenerator {
  (): string;
  peek(): string;
  reset(start?: number): void;
}
```

카운터 값을 진법으로 인코딩하고 접두사·0 패딩을 붙인 문자열 생성기를 만든다. 카운터 규칙(`min`·`max`·`start`·`step`, wrap, `peek`, `reset`)은 `createCyclicIdFactory`와 같되 `min`은 0 이상이고 `preset`은 받지 않는다. 옵션을 생략하면 `[0, 9007199254740990]`을 10진법으로 센다.

| 옵션        | 기본값                              | 검증                                                                       |
| ----------- | ----------------------------------- | -------------------------------------------------------------------------- |
| `prefix`    | 없음                                | 비어 있지 않은 문자열                                                      |
| `separator` | `"_"`                               | 문자열(빈 문자열 허용). `prefix` 없이 지정하면 `RangeError`                |
| `radix`     | 10                                  | 2 이상 36 이하의 정수                                                      |
| `pad`       | 0                                   | 0 이상 64 이하의 정수. 숫자 부분의 최소 자릿수이며 자르지 않는다           |
| `case`      | `"lower"`                           | `"lower"` 또는 `"upper"`. `radix`가 10 이하면 지정할 수 없다(`RangeError`) |
| `min`       | 0                                   | 0 이상의 safe integer                                                      |
| `max`       | `Number.MAX_SAFE_INTEGER - 1`       | safe integer, `min` 이상. 범위 크기가 `Number.MAX_SAFE_INTEGER` 이하       |
| `start`     | 범위가 0을 포함하면 0, 아니면 `min` | `[min, max]` 안의 safe integer                                             |
| `step`      | 1                                   | 0이 아닌 safe integer                                                      |

출력은 `[prefix][separator]` + 숫자 부분이다. 숫자 부분은 값을 `radix`진법(글자 `0-9a-z`, 선행 0 없음)으로 쓰고 `pad` 자리까지 왼쪽을 `0`으로 채운 뒤 `case: "upper"`면 대문자로 바꾼다. `prefix`가 없으면 구분자도 없다. `prefix`·`separator`는 해석하지 않으므로 숫자 부분과 겹치는 글자도 허용한다.

| 항목                        | 계약                                                                                                                                                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 입력 검증                   | 옵션 읽기 규칙을 따른다. 위 표의 위반, 알 수 없는 키(`preset` 포함)는 생성 시점 `RangeError`                                                                                                                         |
| 오류                        | `RangeError`(생성 시 옵션 위반, `reset` 인자 위반)뿐이다. 생성기 호출은 던지지 않는다                                                                                                                                |
| 결과 값                     | 계약이다. 아래 고정 벡터가 이를 고정한다                                                                                                                                                                             |
| 정렬                        | `prefix`·`separator`·`case`가 같고 `pad`가 `max`의 자릿수(`max.toString(radix).length`) 이상이면 wrap 전까지 사전순이 값순이다. 그렇지 않으면 보장하지 않는다                                                        |
| 상태 API·고유성·형태·독립성 | `createCyclicIdFactory`와 같다. 단 `peek()`은 인코딩된 문자열이라 `start`·`reset`에 넘길 수 없다(`reset(v)`의 `v`는 숫자). 복원은 호출자가 보관한 카운터 값(숫자)으로 한다. 생성기는 `() => string`에 대입할 수 있다 |

고정 벡터(호출 결과 순서):

| 옵션                                               | 결과                                   |
| -------------------------------------------------- | -------------------------------------- |
| 없음                                               | `"0", "1", "2"`                        |
| `{ prefix: "blockly", separator: "-", radix: 36 }` | `"blockly-0", "blockly-1"`             |
| 같은 옵션, `reset(35)` 뒤                          | `"blockly-z", "blockly-10"`            |
| `{ radix: 16, case: "upper", start: 255 }`         | `"FF"`                                 |
| `{ radix: 2, pad: 8, start: 5 }`                   | `"00000101"`                           |
| `{ pad: 3, start: 1234 }`                          | `"1234"`(자르지 않는다)                |
| `{ prefix: "ord", max: 999, pad: 3, start: 999 }`  | `"ord_999", "ord_000"`                 |
| `{ radix: 36, start: 9007199254740990 }`           | `"2gosa7pa2gu", "0"`                   |
| `{ case: "upper" }`                                | `RangeError`(10진법에는 영문자가 없다) |

```ts
import { createCounterIdFactory } from "@cp949/random/id";

const nextBlocklyId = createCounterIdFactory({
  prefix: "blockly",
  separator: "-",
  radix: 36,
});
nextBlocklyId(); // "blockly-0"
nextBlocklyId(); // "blockly-1"

const nextOrderId = createCounterIdFactory({
  prefix: "ord",
  max: 999999,
  pad: 6,
});
nextOrderId(); // "ord_000000" — pad가 max의 자릿수와 같아 wrap 전까지 사전순이 값순이다
nextOrderId.peek(); // "ord_000001" — 문자열이라 start·reset에 넘길 수 없다

// 복원은 호출자가 보관한 카운터 값(숫자)으로 한다
const resumed = createCounterIdFactory({
  prefix: "ord",
  max: 999999,
  pad: 6,
  start: 1,
});
resumed(); // "ord_000001"
```

## `stringifyUuid(bytes, format?)`

```ts
function stringifyUuid(bytes: Uint8Array, format?: UuidFormat): string;

interface UuidFormat {
  dashes?: boolean; // 기본 true
  case?: "lower" | "upper"; // 기본 "lower"
}
```

16바이트를 UUID 문자열로 바꾼다. 난수를 쓰지 않는 순수 함수이며 형식만 바꾼다.

| 항목            | 내용                                                                                                                                                                                                             |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 입력 `bytes`    | 길이 16의 `Uint8Array`. 하위 클래스(`Buffer` 포함)와 `byteOffset`이 있는 view는 받는다. 길이 15·17, `Array`, `Uint16Array`, `ArrayBuffer`, `null`, 문자열 등 그 밖의 값은 `RangeError`다                         |
| 다른 realm      | 판정이 `instanceof Uint8Array`라서 다른 realm(iframe, `vm` 컨텍스트)에서 만든 `Uint8Array`는 길이가 같아도 `RangeError`다. 그 배열은 `new Uint8Array(foreign)`으로 현재 realm의 배열로 복사해서 넘긴다           |
| 입력 `format`   | `undefined`(기본 형식) 또는 `{ dashes?, case? }` 객체. `dashes`는 boolean(기본 `true`), `case`는 `"lower"`(기본) 또는 `"upper"`다. 그 밖의 값과 옵션 객체 읽기 규칙 위반(알 수 없는 키, 비객체)은 `RangeError`다 |
| version·variant | 검사하지 않는다. Nil UUID(모두 0)와 Max UUID(모두 1)도 만든다. RFC 9562 UUID인지는 `isUuid`가 묻는다                                                                                                             |
| 오류            | `RangeError`(인자, 환경과 무관). crypto에 접근하지 않으므로 `SecureRandomUnavailableError`를 던지지 않는다                                                                                                       |
| 결과 형식       | `dashes: true`는 8-4-4-4-12 형식의 36자, `false`는 대시 없는 32자. `case`가 `"lower"`이면 소문자 hex, `"upper"`이면 대문자 hex                                                                                   |
| 결과 값         | 입력에서 결정된다(계약). 같은 바이트와 형식은 항상 같은 문자열이다. 인덱스 0의 바이트가 문자열의 왼쪽 두 자리이며(big-endian) 바이트 순서를 바꾸지 않는다                                                        |
| 입력 불변       | 입력 배열을 바꾸거나 보관하지 않는다                                                                                                                                                                             |

```ts
import { parseUuid, stringifyUuid } from "@cp949/random/id";

const bytes = parseUuid("017f22e2-79b0-7cc3-98c4-dc0c0c07398f");

stringifyUuid(bytes); // "017f22e2-79b0-7cc3-98c4-dc0c0c07398f"
stringifyUuid(bytes, { case: "upper" }); // "017F22E2-79B0-7CC3-98C4-DC0C0C07398F"
stringifyUuid(bytes, { dashes: false }); // "017f22e279b07cc398c4dc0c0c07398f"
```

## `parseUuid(value)`

```ts
function parseUuid(value: string): Uint8Array<ArrayBuffer>;
```

UUID 문자열을 16바이트로 바꾼다. 난수를 쓰지 않는 순수 함수다. "UUID 형식의 128비트인가"만 묻는다.

| 항목            | 내용                                                                                                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 입력            | 대시 있는 36자 형식(8-4-4-4-12) 또는 대시 없는 32자 hex. 대소문자를 구분하지 않고 섞어도 된다                                                                                                                                                                       |
| 거부하는 입력   | 길이 오류, hex가 아닌 문자, 대시 위치·개수 오류, 두 형식의 혼용은 `RangeError`다. 중괄호(`{...}`), `urn:uuid:` 접두사, 앞뒤 공백·줄바꿈도 받지 않는다. 문자열이 아닌 값(`null`, 숫자, `String` 객체, 원소가 UUID인 배열 포함)은 `TypeError`가 아니라 `RangeError`다 |
| version·variant | 검사하지 않는다. Nil UUID와 RFC 9562의 variant가 아닌 값도 파싱한다                                                                                                                                                                                                 |
| 오류            | `RangeError`(인자, 환경과 무관). crypto에 접근하지 않으므로 `SecureRandomUnavailableError`를 던지지 않는다                                                                                                                                                          |
| 결과 길이       | 16                                                                                                                                                                                                                                                                  |
| 결과 값         | 입력에서 결정된다(계약). 문자열의 왼쪽 두 자리가 인덱스 0의 바이트다(big-endian). 대소문자·대시 유무가 달라도 같은 UUID는 같은 바이트다                                                                                                                             |
| 결과 객체       | 호출마다 새로 만든 `Uint8Array`다. 자체 `ArrayBuffer`를 가지며(`byteOffset` 0, `buffer.byteLength` 16) 결과를 바꿔도 다음 호출에 영향이 없다                                                                                                                        |
| 결과 타입       | `Uint8Array<ArrayBuffer>`라서 `crypto.subtle.digest` 같은 `lib.dom` API(`BufferSource`)에 캐스팅 없이 넘길 수 있다. TypeScript 5.7 이상이 필요하다                                                                                                                  |

```ts
import { parseUuid } from "@cp949/random/id";

parseUuid("017F22E2-79B0-7CC3-98C4-DC0C0C07398F"); // Uint8Array(16) [1, 127, 34, 226, ...]
parseUuid("017f22e279b07cc398c4dc0c0c07398f"); // 위와 같은 바이트
parseUuid("00000000-0000-0000-0000-000000000000"); // Nil UUID도 파싱한다
parseUuid("not-a-uuid"); // RangeError
```

## `isUuid(value, options?)`

```ts
function isUuid(value: unknown, options?: IsUuidOptions): value is string;

interface IsUuidOptions {
  version?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  dashes?: boolean; // 기본 true
}
```

`value`가 RFC 9562 UUID 형식의 문자열인지 판정하는 타입 가드다. 난수를 쓰지 않는 순수 함수다. 참이면 `value`의 타입이 `string`으로 좁혀진다. **형식만 검사한다.** UUID가 발급됐는지, 호출자가 그 UUID가 가리키는 자원에 접근할 권한이 있는지는 알 수 없으며 인가 수단이 아니다. UUID를 알고 있다는 사실을 권한으로 취급하지 않는다.

`true`가 되려면 다음을 모두 만족해야 한다.

- `typeof value === "string"`이고 `dashes` 옵션이 고른 형식이다. `dashes`가 `true`(기본)이면 대시 있는 36자 형식(8-4-4-4-12), `false`이면 대시 없는 32자 hex다. 대소문자는 구분하지 않는다.
- version 문자(13번째 hex)가 `1`~`8`이다. `options.version`이 있으면 그 version만 받는다.
- variant 문자(17번째 hex)가 `8`, `9`, `a`, `b`다(RFC 9562의 variant, 대소문자 무관).

Nil UUID(`00000000-0000-0000-0000-000000000000`)와 Max UUID(`ffffffff-ffff-ffff-ffff-ffffffffffff`)는 version 문자가 `0`, `f`라서 `false`다.

| 항목           | 내용                                                                                                                                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 입력 `value`   | 문자열이 아닌 값(`null`, 숫자, 객체, `String` 객체, 원소가 UUID인 배열 포함)은 던지지 않고 `false`다                                                                                                                         |
| 입력 `options` | `undefined` 또는 `{ version?, dashes? }` 객체. `version`은 1~8의 정수이며 0, 9, 소수(`4.5`), 문자열(`"4"`), `null`은 `RangeError`다. `dashes`는 boolean이다. `case`는 `UuidFormat`의 옵션이라 알 수 없는 키로 `RangeError`다 |
| 옵션 검증 순서 | `value`를 판정하기 전에 옵션을 검증한다. 잘못된 옵션은 `value`와 무관하게 `RangeError`다(`isUuid(null, { version: 9 })`도 던진다)                                                                                            |
| 오류           | `RangeError`는 잘못된 옵션에만 난다. crypto에 접근하지 않으므로 `SecureRandomUnavailableError`를 던지지 않는다                                                                                                               |
| 결과           | 입력에서 결정된다(계약). 형식과 version·variant 문자만 보며 version별 의미(v1 timestamp의 유효성, v3·v5 해시 일치, v4·v7의 무작위성)는 검사하지 않는다                                                                       |

`parseUuid`와 `isUuid`는 묻는 것이 다르다. `parseUuid`는 "UUID 형식의 128비트인가", `isUuid`는 "RFC 9562 UUID인가"를 묻는다.

| 입력                                     | `parseUuid`  | `isUuid`                                                         |
| ---------------------------------------- | ------------ | ---------------------------------------------------------------- |
| Nil UUID, Max UUID                       | 파싱한다     | `false`                                                          |
| version 문자가 `0`, `9`, `a`~`f`         | 파싱한다     | `false`                                                          |
| variant 문자가 `8`, `9`, `a`, `b`가 아님 | 파싱한다     | `false`                                                          |
| 대시 없는 32자 hex                       | 파싱한다     | 기본(`dashes: true`)은 `false`, `{ dashes: false }`에서만 `true` |
| 문자열이 아닌 값                         | `RangeError` | `false`(던지지 않는다)                                           |

```ts
import { isUuid } from "@cp949/random/id";

isUuid("017f22e2-79b0-7cc3-98c4-dc0c0c07398f"); // true
isUuid("017f22e2-79b0-7cc3-98c4-dc0c0c07398f", { version: 4 }); // false(version 7이다)
isUuid("017f22e279b07cc398c4dc0c0c07398f", { dashes: false }); // true
isUuid("00000000-0000-0000-0000-000000000000"); // false(Nil UUID)
isUuid(null); // false

function normalize(input: unknown): string {
  if (!isUuid(input)) throw new Error("UUID가 아니다");
  return input.toLowerCase(); // string으로 좁혀진다
}
```

이미 `string`인 입력에서는 `value is string` 타입 술어 때문에 **거짓 분기가 `never`로 좁혀진다**. 실제로는 UUID 형식이 아닌 문자열도 거짓 분기에 들어올 수 있다. 그 분기에서 문자열 메서드가 필요하면 반환값을 `boolean`으로 받는 래퍼를 사용한다.

```ts
function hasUuidFormat(value: string): boolean {
  return isUuid(value);
}

function describeInput(value: string): string {
  if (!isUuid(value)) {
    // 여기서 value의 정적 타입은 never다. 런타임에는 일반 문자열일 수 있다.
  }
  if (!hasUuidFormat(value)) return value.toLowerCase();
  return value;
}
```

## 번들 측정

값 export 14개를 각각 단독 import한 minified + brotli 크기다. 측정일은 2026-09-21, 도구는 size-limit 14.0.0(`@size-limit/preset-small-lib` 14.0.0, rolldown 1.2.9)이다. 한도는 각 export를 처음 측정한 값에 `ceil(측정값 × 1.5 / 50) × 50` B를 적용해 정했고 `packages/random/.size-limit.json`에 기록한다. 표의 측정값은 현재 빌드의 수치라서 한도를 정한 값과 다를 수 있다(R2 export 7개는 -10 B~+7 B 달라졌고 모두 한도 안이다). 측정값은 API 결과값 계약이나 전체 앱 번들 크기를 뜻하지 않는다.

| export                         | 측정값 | 한도   |
| ------------------------------ | ------ | ------ |
| `randomId`                     | 2116 B | 3200 B |
| `createRandomIdFactory`        | 2246 B | 3400 B |
| `nanoid`                       | 445 B  | 700 B  |
| `uuidv4`                       | 635 B  | 950 B  |
| `uuidv7`                       | 938 B  | 1450 B |
| `createUuidv4Factory`          | 774 B  | 1200 B |
| `createUuidv7Factory`          | 1062 B | 1650 B |
| `createCyclicIdFactory`        | 821 B  | 1250 B |
| `createCounterIdFactory`       | 943 B  | 1450 B |
| `isUuid`                       | 468 B  | 750 B  |
| `parseUuid`                    | 245 B  | 400 B  |
| `stringifyUuid`                | 507 B  | 800 B  |
| `IdCollisionError`             | 90 B   | 150 B  |
| `SecureRandomUnavailableError` | 88 B   | 150 B  |

## `SecureRandomUnavailableError`

```ts
class SecureRandomUnavailableError extends Error {
  constructor();
  name: "SecureRandomUnavailableError";
}
```

`getRandomValues`를 쓸 수 없는 환경에서 난수를 요청하는 함수가 던진다. 다음 세 경우가 같은 오류다.

- `globalThis.crypto`가 없다.
- `globalThis.crypto.getRandomValues`가 함수가 아니다.
- `globalThis.crypto` 접근이 예외를 던진다. 원본 예외는 보존하지 않는다(`cause` 없음).

| 항목   | 내용                                                                                                        |
| ------ | ----------------------------------------------------------------------------------------------------------- |
| 상속   | `Error`의 하위 클래스이며 `RangeError`가 아니다. 인자 오류와 환경 미지원 오류를 구분해 잡는다               |
| `name` | `"SecureRandomUnavailableError"`                                                                            |
| 메시지 | 영어이며 문구는 계약이 아니다                                                                               |
| 동일성 | `@cp949/random/secure`가 내보내는 클래스와 같은 클래스다. 어느 진입점에서 가져와도 `instanceof` 결과가 같다 |

이 오류가 나면 다른 난수원으로 대체되지 않은 것이다. 호출자는 미지원 환경을 이 오류로 구분해 처리한다.

## `IdCollisionError`

```ts
class IdCollisionError extends Error {
  constructor(attempts: number);
  readonly attempts: number;
  name: "IdCollisionError";
}
```

`randomId` 또는 `createRandomIdFactory`가 만든 생성기에서 `isTaken`이 `maxAttempts`번 모두 `true`를 반환하면 던진다. 상한은 최초 시도를 포함하며 기본값은 10이다. `isTaken`이 없으면 충돌 검사를 하지 않는다. boolean이 아닌 반환값은 이 오류가 아니라 `RangeError`이고, 검사 함수가 던진 예외는 그대로 전파된다. `nanoid`와 UUID 생성 함수는 충돌 검사를 하지 않으므로 이 오류를 던지지 않는다.

직접 `new IdCollisionError(attempts)`로 만들면 전달한 `number`를 그대로 보관하며 생성자가 범위를 추가 검증하지 않는다. 라이브러리가 충돌 소진으로 던질 때의 `attempts`는 검증된 `maxAttempts`(1~1000)다. 오류 객체의 `name`·`attempts`와 클래스 동일성은 계약이고 메시지 문구는 계약이 아니다.

| 항목       | 내용                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------- |
| 상속       | `Error`의 하위 클래스이며 `RangeError`가 아니다. 인자 오류와 충돌 회피 실패를 구분해 잡는다 |
| `name`     | `"IdCollisionError"`                                                                        |
| `attempts` | `isTaken`이 `true`를 돌려준 시도 횟수이며 재시도 상한과 같다. 읽기 전용 `number`다          |
| 메시지     | 영어이며 시도 횟수를 담는다. 문구는 계약이 아니다                                           |

```ts
import {
  IdCollisionError,
  SecureRandomUnavailableError,
} from "@cp949/random/id";

function describeFailure(error: unknown): string {
  if (error instanceof IdCollisionError) return `충돌 ${error.attempts}회`;
  if (error instanceof SecureRandomUnavailableError) return "crypto 미지원";
  return "그 밖의 오류";
}
```
