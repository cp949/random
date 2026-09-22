# ID 사용처별 레시피

`@cp949/random/id`의 공개 API를 그대로 호출하는 예시다. 기본 난수원은 `crypto.getRandomValues`이며, 주입 난수원의 결과에는 보안 보증이 없다. 상세 옵션·오류·결과값 계약은 [ID API 계약](../api/id.md)을 따른다.

아래 생성식 9개는 `fixtures/consumer/recipes-id.mjs`가 tarball 설치본에서 실행하며, 같은 식을 `usage-id.ts`가 TypeScript 5.7.3·저장소 TypeScript의 NodeNext·Bundler 설정에서 검사한다. 정규식은 결과 형식을 검증한다. Chrome 75 실브라우저, DB 저장, 파일 생성, DOM 삽입, 인증 서비스 통합을 실행한 증거는 아니다.

## 요청 ID

```ts
import { randomId } from "@cp949/random/id";

const requestId = randomId({ prefix: "req", timestamp: true, length: 8 });
```

형식은 `req_` + 소문자 base36 시각 9자 + `_` + base64url 무작위 8자다. 무작위 부분은 48비트이고 고정 접두사·시각은 엔트로피를 늘리지 않는다. timestamp는 시각 정보를 드러내며 같은 밀리초 안의 생성 순서는 보장하지 않는다. 요청 ID의 충돌을 허용할 수 없는 저장소에는 유일성 제약과 충돌 처리를 둔다.

base64url에는 `_`도 있으므로 `split("_")`으로 모든 부분을 나누지 않는다. 접두사·timestamp의 알려진 길이로 경계를 잡는다.

## 사용자 ID

```ts
import { randomId } from "@cp949/random/id";

const userId = randomId({ prefix: "usr", length: 16 });
```

형식은 `usr_` + base64url 16자(96비트)다. ID를 알고 있다는 사실은 사용자 신원이나 자원 접근 권한을 증명하지 않는다. 서버에서 인증·인가를 별도로 처리한다.

동기적으로 조회할 수 있는 사용 중 목록이 있으면 충돌 회피를 붙일 수 있다.

```ts
const used = new Set<string>();
const id = randomId({ length: 12, isTaken: (id) => used.has(id) });
used.add(id);
```

검사는 접두사·구분자를 포함한 최종 ID를 받는다. 기본 10번(최초 시도 포함) 모두 사용 중이면 `IdCollisionError`다. `isTaken`은 동기 boolean만 받고 Promise는 `RangeError`다. 검사와 저장은 원자적이지 않으므로 여러 호출자가 저장하는 DB에는 유일성 제약을 함께 사용하고, 제약 위반 시 새 ID를 만들어 저장을 재시도한다.

## 파일 이름

```ts
import { uuidv4 } from "@cp949/random/id";

const fileId = uuidv4({ dashes: false });
```

결과는 version·variant가 들어 있는 소문자 hex 32자다. 애플리케이션이 허용한 확장자를 붙여 `fileId + ".png"`처럼 저장 이름을 구성할 수 있다. 이 호출은 파일을 생성하거나 이름을 예약하지 않는다. 실제 파일 생성 시 기존 파일을 덮어쓰지 않는 저장소 연산으로 충돌을 처리한다.

## HTML id

```ts
import { randomId } from "@cp949/random/id";

const elementId = randomId({ startWithLetter: true, length: 10 });
```

첫 글자는 ASCII 영문자이며 나머지 9자는 base64url 문자다. `length`는 첫 글자를 포함한 무작위 부분의 길이다. 문서 안의 유일성은 자동 보장하지 않으므로 같은 페이지에 삽입하는 애플리케이션이 중복을 처리한다. 다른 옵션으로 사용자 문자 집합이나 접두사를 허용하면 HTML/CSS 문맥에 맞는 처리를 별도로 한다.

## 인증 코드

```ts
import { randomId } from "@cp949/random/id";

const code = randomId({ preset: "digits", length: 6 });
```

앞자리 `0`을 포함할 수 있는 숫자 문자열 6자다. 숫자로 변환하면 앞의 `0`을 잃는다. 가능한 값은 1,000,000개(약 19.93비트)이며, 보안 난수로 생성했다는 사실만으로 인증 수단이 완성되지 않는다.

발급·검증 서비스가 다음 조건을 적용해야 한다.

- 짧은 만료 시간과 시도 횟수 제한을 둔다.
- 코드와 대상 사용자·요청·용도를 연결하고 검증 성공 시 원자적으로 한 번만 소비한다.
- 재발급하면 이전 코드를 무효화하고, 성공한 코드·만료한 코드를 다시 사용하지 못하게 한다.
- 발급·검증 요청의 빈도를 제한한다. 장기 비밀이나 세션 토큰으로 이 6자리 값을 사용하지 않는다.

사람이 읽어 전달하는 더 긴 코드는 `readable`과 그룹을 조합할 수 있다.

```ts
const readableCode = randomId({ preset: "readable", length: 12, group: 4 });
```

`ABCD-EFGH-JKLM`처럼 4자씩 3개 그룹이다. 문자 집합은 `0`, `1`, `I`, `O`를 제외한 32자이며 무작위 부분은 60비트다. `-`는 길이·엔트로피에 포함되지 않는다. 이 형식에도 만료·시도 제한·일회성 소비와 재사용 방지가 필요하며 라이브러리가 저장하거나 검증해 주지는 않는다.

## 순환 정수 ID

```ts
import { createCyclicIdFactory } from "@cp949/random/id";

const nextId = createCyclicIdFactory({ preset: "int32" });
const id = nextId(); // 0, 1, 2, … 2147483647, -2147483648, …
```

형식은 `[-2147483648, 2147483647]`을 도는 정수다. 양수만 필요하면 `{ min: 0, max: 2147483647 }`처럼 범위를 직접 준다. 값은 예측 가능하며 보안 용도가 아니다. 한 바퀴를 돌면 같은 값이 다시 나오므로 사용 중인 값과의 충돌은 호출자가 관리한다.

생성기는 메모리 상태만 가진다. 페이지를 새로 열거나 Worker가 다르면 0부터 다시 시작한다. 이어서 세려면 다음 값을 저장해 두고 새 생성기의 `start`로 넘긴다.

```ts
const saved = nextId.peek(); // 저장소에 기록
const resumed = createCyclicIdFactory({ preset: "int32", start: saved });
```

## 접두사 카운터 ID

```ts
import { createCounterIdFactory } from "@cp949/random/id";

const nextBlockId = createCounterIdFactory({
  prefix: "blockly",
  separator: "-",
  radix: 36,
});
const id = nextBlockId(); // "blockly-0", "blockly-1", … "blockly-z", "blockly-10", …
```

형식은 접두사 + 구분자 + 36진법 소문자 카운터다. `radix`를 생략하면 10진법이다.

정렬이 값 순서와 같아야 하면 `max`를 정하고 `pad`를 그 자릿수로 준다.

```ts
const nextOrderId = createCounterIdFactory({
  prefix: "ord",
  max: 999999,
  pad: 6,
});
nextOrderId(); // "ord_000000"
```

`pad`가 자릿수보다 작으면 `"9"`와 `"10"`처럼 사전순이 값순과 달라진다. 카운터도 wrap 뒤 같은 문자열이 다시 나온다. 이어서 세려면 `peek()`(문자열)이 아니라 호출자가 보관한 숫자를 새 생성기의 `start`로 넘긴다.
