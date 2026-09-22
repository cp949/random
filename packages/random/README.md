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
| `./state`  | `.`의 함수를 바인딩한 상태 객체, `rand` | seed 없는 상태·`rand`는 첫 사용 시 `getRandomValues`(lazy) |
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

### 보안 난수(`./secure`)

```ts
import { randomHex } from "@cp949/random/secure";

randomHex(16); // 32자 hex, crypto.getRandomValues 기반
```

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

## 종류를 구분한다

- `rand`와 seed 있는 PRNG(`.`, `./state`)의 결과는 예측 가능하다. 보안 토큰·비밀번호 재설정
  링크에는 `./secure`를 쓴다.
- UUID(`./id`의 `uuidv4`·`uuidv7`)는 식별자이지 인가 수단이 아니다. 추측 불가를 보장해야 하면
  `./secure`의 `randomHex`·`randomBase64url`을 쓴다.
- 순환 ID(`createCyclicIdFactory`)는 다음 값을 예측할 수 있다. 공개 URL 슬러그·초대 코드에는
  맞지 않는다.
- 테스트·시뮬레이션에서 재현 가능한 ID가 필요하면 seed 상태의 `source`를 `./id` 팩토리의
  `randomBytes`로 감싼다([레시피](https://github.com/cp949/random/blob/main/docs/api/state.md#재현-가능한-id-statesource를-randombytes로-바꾼다)).
  주입한 난수원으로 만든 ID에는 보안 보증이 없다.

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
