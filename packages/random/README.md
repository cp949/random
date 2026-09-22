# @cp949/random

브라우저용 ID 생성기와 그 토대인 보안·재현 가능 난수 라이브러리. 무작위 ID·UUID·순환 ID(`./id`), 보안
난수(`./secure`), 재현 가능한 PRNG·샘플링(root, `./state`)을 subpath로 나눠 제공한다. 런타임 의존성이 없다.

## 설치

```bash
pnpm add @cp949/random
```

## 요건

- Chrome 75 이상(실측·검증 한계는 [`docs/compatibility.md`](https://github.com/cp949/random/blob/main/docs/compatibility.md) 참고).
- TypeScript 5.7 이상.
- `exports` 필드만 제공한다. `moduleResolution`이 `Bundler` 또는 `NodeNext`여야 한다. `node10`
  모듈 해석과 webpack 4는 지원하지 않는다.
- 다른 라이브러리에서 옮겨올 때의 차이(`crypto.randomInt` 상한, `length`와 `byteLength` 등)는 [`docs/comparison.md`](https://github.com/cp949/random/blob/main/docs/comparison.md) 참고.

## subpath

| subpath    | 용도                                    | 난수원 요건                                                |
| ---------- | --------------------------------------- | ---------------------------------------------------------- |
| `.`        | 재현 가능한 PRNG(xoshiro128**), 샘플링  | 없음(seed 또는 주입한 source로 동작)                       |
| `./state`  | `.`의 함수를 바인딩한 상태 객체, `rand` | seed 없는 상태·`rand`는 첫 사용 시 `getRandomValues`로 초기화만 한다(lazy). 이후 출력은 비보안 PRNG — 아래 "예측 가능성" 참고 |
| `./secure` | 보안 난수(bytes, hex, base64url, int)   | `globalThis.crypto.getRandomValues`                        |
| `./id`     | UUID, nanoid, 순환/카운터 ID            | `getRandomValues`(대부분), `Date.now`(uuidv7 계열)         |

## 예제

### seed 재현(`.`, `./state`)

```ts
import { createXoshiro128Source, int } from "@cp949/random";
import { rand } from "@cp949/random/state";

const source = createXoshiro128Source(42);
int(source, 1, 100); // 같은 seed는 항상 같은 순서를 낸다

rand.int(1, 6); // seed 없는 상태: 주사위, 매번 다르다(보안 용도 아님)
```

### 컬렉션 샘플링(`.`, `./state`)

```ts
import { rand } from "@cp949/random/state";

rand.choice(["a", "b", "c"]); // 무작위 원소 하나
rand.shuffle([1, 2, 3, 4]); // 복사본을 섞어 돌려준다(원본 불변)
rand.sample([1, 2, 3, 4, 5], 3); // 비복원 추출 3개
rand.weightedChoice(["low", "mid", "high"], [1, 2, 7]); // 가중치 비례 선택
```

`rand`는 seed 없이 매번 다르게 초기화되므로 섞기·추출 결과가 실행마다 다르다. 같은 결과를
재현해야 하면(테스트, 재생 가능한 게임 로그 등) seed를 준 상태를 만든다.

```ts
import { createRandomState } from "@cp949/random/state";

const seeded = createRandomState(42); // seed 42로 고정
seeded.shuffle([1, 2, 3, 4]); // 이 코드를 몇 번 실행해도 항상 같은 순서
```

`rand`·`seeded`가 감싼 저수준 함수(`choice`, `shuffle`, `sample`, `permutation`,
`weightedChoice`, `createWeightedSampler`)는 root(`.`)에서 `source`를 직접 첫 인자로 넘겨
쓸 수도 있다. 결과는 같다.

```ts
import { createXoshiro128Source, shuffle } from "@cp949/random";

const source = createXoshiro128Source(42);
shuffle(source, [1, 2, 3, 4]); // seeded.shuffle([1, 2, 3, 4])와 같은 값
```

### 보안 난수(`./secure`)

```ts
import { randomHex } from "@cp949/random/secure";

randomHex(16); // 32자 hex, crypto.getRandomValues 기반
```

### nanoid — UUID와 뭐가 다른가(`./id`)

```ts
import { nanoid } from "@cp949/random/id";

nanoid(); // 21자, 예: "V1StGXR8_Z5jdHi6B-myT"
nanoid(10); // 길이만 바꿀 수 있다(알파벳 고정 A-Za-z0-9-_, custom alphabet은 ./secure의 randomString)
```

"nanoid"는 UUID와 달리 표준 기구가 정한 형식이 아니다. 둘의 차이는 이렇다.

- **UUID**(RFC 9562): 자리마다 의미가 고정된 표준 형식이다. `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`
  36자(대시 포함) 안에 128비트를 담되 6비트는 버전·variant로 고정이라 실제 무작위는 122비트다.
  이 형식을 검증·파싱하는 `isUuid`·`parseUuid`도 따로 있다(`./id`).
- **nanoid**: 표준이 아니라 `ai/nanoid`라는 특정 npm 패키지(2017년 공개, 지금은 JS 생태계에서
  널리 쓰이는 관례가 됐다)가 정착시킨 방식이다. 자리마다 고정된 의미 없이 64자 알파벳
  (`A-Za-z0-9-_`, 문자당 6비트)에서 무작위로 뽑는다. 기본 21자 × 6비트 = 126비트로 UUID v4(122비트)와
  충돌 확률은 비슷하지만 대시 없이 5자 더 짧다. "이게 nanoid 형식인지" 검사하는 표준 파서는 없다
  — 그냥 무작위 문자열이다.

이 라이브러리의 `nanoid()`는 `ai/nanoid` 패키지를 의존성으로 가져오는 게 아니라, 그 패키지의
기본 출력 형식(길이 21, 같은 64자 알파벳)을 독자 구현으로 재현한 것이다. 난수원은 다른 `./id`
함수와 같은 `globalThis.crypto.getRandomValues`를 쓴다.

### UUID·편의 ID(`./id`)

```ts
import { uuidv4, randomId } from "@cp949/random/id";

uuidv4(); // "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
randomId({ prefix: "req" }); // "req_xxxxxxxxxxxxxxxxxxxxx"
```

### 순환 ID(`./id`)

```ts
import { createCyclicIdFactory } from "@cp949/random/id";

const nextId = createCyclicIdFactory({ preset: "int32" });
nextId(); // 호출마다 1씩 증가, 범위 끝에서 반대쪽으로 순환
```

## 예측 가능성과 선택 가이드

"보안 난수"라는 주장의 근거는 자체 알고리즘이 아니라 위임이다. `./secure`와 `./id`의 무작위
함수는 `globalThis.crypto.getRandomValues`(OS·브라우저의 CSPRNG — Linux `getrandom`, Windows
`BCryptGenRandom` 등)를 얇게 감싸기만 하고, `Math.random`이나 자체 PRNG로 대체하지 않는다.
신뢰 근거는 이 라이브러리가 아니라 OS·브라우저 구현에 있다.

root(`.`)와 `./state`는 반대다. xoshiro128\*\*(비암호 PRNG)로 값을 만든다. seed를 주면
(`createXoshiro128Source(seed)`) 같은 seed는 항상 같은 수열을 낸다 — **재현이 목적이라 예측
가능한 게 정상이다.** seed 없는 `rand`(`./state`)도 초기 상태 4 word만 `getRandomValues`로
뽑고 이후는 PRNG 상태 전이로 진행하므로, 연속된 출력 몇 개만 보면 내부 상태를 복원해 이후 값을
예측할 수 있다. 초기 시딩에 CSPRNG를 썼다는 사실이 출력의 예측 불가능성을 보장하지 않는다.

`./id`는 함수마다 다르다. 여기서 "추측 가능"은 **다음 값이나 다른 사용자의 값을 알아낼 수
있는가**를 뜻한다. 전체 문자열의 일부(예: 무작위 부분)만 CSPRNG이고 나머지가 고정 규칙이어도,
그 무작위 부분의 엔트로피가 충분하면 전체 값은 여전히 추측 불가능하다 — 자물쇠에 눈에 보이는
제조사 각인이 있어도 비밀번호 자체는 못 맞추는 것과 같다.

| 함수                                               | 다음 값·다른 사용자의 값을 추측할 수 있는가                                                                                     |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `nanoid`, `uuidv4`, `randomId`(`timestamp` 옵션 포함) | 아니오. 무작위 부분 전체가 `getRandomValues` 직결이며, `timestamp: true`를 켜도 무작위 부분의 길이·엔트로피는 그대로다             |
| `uuidv7`                                            | 부분적으로 예. counter 12비트는 같은 밀리초의 첫 값만 난수이고 이후 `+1`로 순차 증가해, 같은 밀리초 안의 다음 값을 좁혀 추측할 수 있다 |
| `createCyclicIdFactory`, `createCounterIdFactory`   | 예. crypto를 쓰지 않는 등차수열이라 다음 값이 완전히 결정된다                                                                      |
| `randomBytes`·`now`를 주입한 팩토리의 결과          | 보증 없음. 주입값이 곧 결과를 결정하므로 테스트 전용이며 운영 코드에서는 넘기지 않는다                                             |

값 추측 가능성과 별개로, **생성 시각이 드러나는가**의 문제도 있다. `uuidv7`과
`randomId({ timestamp: true })`는 접두사에 `Date.now()`를 그대로 인코딩하므로 값을 추측할 수
없어도 "언제 만들어졌는지"는 누구나 읽을 수 있다. 생성 시각을 감춰야 하면 `uuidv4`나 timestamp
없는 `randomId`를 쓴다.

UUID는 형식이 정해진 식별자일 뿐 인가 수단이 아니다. 값을 안다고 신원이나 접근 권한을 인정하지
않는다.

### 용도별 선택

| 용도                                      | 피할 것                                           | 쓸 것                                                       |
| ----------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| 인증 토큰·세션 ID·비밀번호 재설정 링크    | `rand`·seed 있는 PRNG(추측 가능해서), UUID(추측은 어려워도 식별자일 뿐 비밀값이 아니라서) | `./secure`의 `randomHex`·`randomBase64url`·`randomInt`       |
| 추측 불가해야 하는 공개 슬러그·초대 코드  | `createCyclicIdFactory`·`createCounterIdFactory`   | `randomId`, `./secure`의 `randomBase64url`                   |
| 생성 시각을 감춰야 하는 DB PK              | `uuidv7`, `randomId({ timestamp: true })`(둘 다 접두사가 시각) | `uuidv4`, timestamp 없는 `randomId`                |
| 정렬 가능한 DB PK(시각 노출 허용)          | -                                                   | `uuidv7`                                                      |
| 테스트·시뮬레이션(재현 필요)               | `./secure`, `./id`의 기본 난수원                   | seed 있는 `.`/`./state`, 또는 주입한 `source`·`randomBytes`   |
| 주사위·셔플 등 보안과 무관한 일반 난수     | -                                                   | `./state`의 `rand`                                            |

테스트·시뮬레이션에서 재현 가능한 ID가 필요하면 seed 상태의 `source`를 `./id` 팩토리의
`randomBytes`로 감싼다([레시피](https://github.com/cp949/random/blob/main/docs/api/state.md#재현-가능한-id-statesource를-randombytes로-바꾼다)).

## 문서

- API: [random-core](https://github.com/cp949/random/blob/main/docs/api/random-core.md),
  [sampling](https://github.com/cp949/random/blob/main/docs/api/sampling.md),
  [state](https://github.com/cp949/random/blob/main/docs/api/state.md),
  [secure](https://github.com/cp949/random/blob/main/docs/api/secure.md),
  [id](https://github.com/cp949/random/blob/main/docs/api/id.md)
- 호환성 매트릭스: [`docs/compatibility.md`](https://github.com/cp949/random/blob/main/docs/compatibility.md)
- ID 조합 레시피: [`docs/guides/id-recipes.md`](https://github.com/cp949/random/blob/main/docs/guides/id-recipes.md)
- 변경 이력: [`CHANGELOG.md`](https://github.com/cp949/random/blob/main/CHANGELOG.md)

## 라이선스

MIT
