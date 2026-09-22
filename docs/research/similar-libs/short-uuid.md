# short-uuid (oculus42/short-uuid) 상세 분석

로컬 클론: `/work/thrd/short-uuid` (git HEAD `0705935eaaf933dfd42d8d56069bfa574bbe6aef`, 2025-12-01, 단일 커밋 — 히스토리가 스쿼시된 클론이라 v6.0.0 전환 커밋 자체는 로컬 git log로 추적 불가. CHANGELOG.md와 README.md의 기록으로 대체 확인).

## 1. 개요

- 목적(README.md:7): "Generate and translate standard UUIDs into shorter - or just _different_ - formats and back." RFC4122 v4 UUID를 생성하고, 이를 임의 alphabet으로 재인코딩(진법 변환)해서 짧게(또는 그냥 다르게) 표현했다가 되돌리는 라이브러리.
- 버전: `package.json:3` `"version": "6.0.3"`. CHANGELOG.md 기준 6.0.0(2025-11-30, TypeScript 재작성 + `uuid` 의존성 제거) → 6.0.2(README 수정) → 6.0.3(2025-12-01, 타입 정의 수정)까지 이어진 최신 상태.
- 라이선스: MIT. `LICENSE:1-3` "The MIT License (MIT) / Copyright (c) 2016 Samuel Rouse".
- 런타임 의존성: `package.json:19-21` `"dependencies": { "any-base": "^1.1.0" }` 단 하나. `uuid` 의존성은 없다 — CHANGELOG.md의 6.0.0 항목 "🛑 Removes the uuid library as a dependency." 및 README.md:39 "Removes the uuid library as a dependency."와 일치.
- 진법 변환 자체는 자체 구현이 아니라 `any-base`(별도 npm 패키지, MIT, 저자 Kamil Harasimowicz)에 위임한다. `src/convertor.ts:1,26-27`에서 `anyBase(setup.alphabet, anyBase.HEX)` / `anyBase(anyBase.HEX, setup.alphabet)`로 두 방향 변환기를 만든다. `@cp949/random`이 "런타임 의존성 0"을 목표로 한다는 점에서 이 차이는 중요하다: short-uuid는 UUID 생성 의존성(`uuid`)은 제거했지만 진법 변환 의존성(`any-base`)은 유지했다.

## 2. 핵심 구현 상세

### 2.1 uuid 의존성 제거와 `crypto.randomUUID` 전환

- CHANGELOG.md 6.0.0 항목 원문(주요 변경): "🛑 Removes the uuid library as a dependency." / "🛑 Removes the `uuid` method on the default export (previously imported from uuid/v4)." / "🛑 Removes the `new` method in favor of existing `generate`." / "🛑 Removes `createTranslator` as default export." / "🛑 The default `generate` method assumes crypto.randomUUID is available and may error prior to Node 18." / "⚠️ Node 18 and lower may require passing a `uuid` generator to the translator." / "Uses `crypto.randomUUID` by default." / "Accepts alternative UUID generators such as uuidv7".
- 실제 구현: `src/config.ts:1-8`
  ```ts
  import { flickrBase58 } from "./constants";
  export default {
    consistentLength: true,
    alphabet: flickrBase58,
    uuid: () => globalThis.crypto?.randomUUID(),
  };
  ```
  기본 UUID 생성기가 `globalThis.crypto.randomUUID()` 하나로 축소되었다. optional chaining(`?.`)만 있고 `crypto`가 없는 환경에 대한 폴백이나 전용 에러는 없다 — `crypto`가 없으면 `crypto?.randomUUID()`는 `undefined`를 반환하고, 이 `undefined`가 그대로 `shortenUUID`에 전달되어 `undefined.toLowerCase()` 호출 시점(`src/translate.ts:15`)에 `TypeError`가 난다(전용 에러 클래스 없음, README.md:43 "may error"라는 문구와 일치하지만 에러 종류는 구체적으로 문서화되지 않음).
- v5.2.0 이전에는 `uuid` 패키지(`uuid/v4`, 이후 `uuid@9.0.1` — CHANGELOG.md `[5.0.0]` "UUID version to 9.0.1")를 사용했다. package-lock.json에는 현재 `uuid` 항목이 없고 `any-base` 하나만 dependencies에 남아 있다(package.json:19-21에서 직접 확인).

### 2.2 진법 변환(base conversion) 알고리즘

`any-base@1.1.0`(GitHub `HarasimowiczKamil/any-base`, unpkg에서 원문 확인, 로컬에는 `node_modules`가 없어 소스는 unpkg 배포본으로 확인)의 `Converter.prototype.convert`:

```js
Converter.prototype.convert = function (number) {
  var i,
    divide,
    newlen,
    numberMap = {},
    fromBase = this.srcAlphabet.length,
    toBase = this.dstAlphabet.length,
    length = number.length,
    result = typeof number === "string" ? "" : [];

  if (!this.isValid(number)) {
    throw new Error(
      'Number "' +
        number +
        '" contains of non-alphabetic digits (' +
        this.srcAlphabet +
        ")",
    );
  }
  if (this.srcAlphabet === this.dstAlphabet) {
    return number;
  }
  for (i = 0; i < length; i++) {
    numberMap[i] = this.srcAlphabet.indexOf(number[i]);
  }
  do {
    divide = 0;
    newlen = 0;
    for (i = 0; i < length; i++) {
      divide = divide * fromBase + numberMap[i];
      if (divide >= toBase) {
        numberMap[newlen++] = parseInt(divide / toBase, 10);
        divide = divide % toBase;
      } else if (newlen > 0) {
        numberMap[newlen++] = 0;
      }
    }
    length = newlen;
    result = this.dstAlphabet.slice(divide, divide + 1).concat(result);
  } while (newlen !== 0);

  return result;
};
```

수학적으로는 임의 정밀도 긴 나눗셈(long division)이다. 입력 숫자를 `srcAlphabet` 자릿수 배열(`numberMap`)로 표현해두고, 매 반복마다 배열 전체를 "toBase로 나눈 몫(다음 자리 배열)과 나머지(현재 목적지 자리 문자)"로 갱신한다. 나머지가 목적지 alphabet의 한 문자가 되어 `result` 앞에 계속 붙는다(`concat(result)`로 최상위 자리부터 왼쪽에 쌓임). `newlen === 0`이 될 때까지, 즉 몫이 완전히 0이 될 때까지 반복한다. JS의 `Number`(53비트 정수 정밀도) 안에서 자릿수별 연산을 하므로 128비트 같은 큰 수도 배열 표현으로 안전하게 다룬다. 소스 alphabet과 목적 alphabet이 같으면(`this.srcAlphabet === this.dstAlphabet`) 조기 반환한다.

short-uuid 쪽 호출부(`src/translate.ts:1-23`):

```ts
export const restoreUUID = (config: Config, shortId: SUUID): UUID =>
  config
    .hexFromAlphabet(shortId)
    .padStart(32, "0")
    .match(/(\w{8})(\w{4})(\w{4})(\w{4})(\w{12})/)
    ?.slice(1)
    .join("-") as UUID;

export const shortenUUID = (config: Config, longId: UUID): SUUID => {
  const translated = config.hexToAlphabet(
    longId.toLowerCase().replace(/-/g, ""),
  );
  if (!config.consistentLength) return translated as SUUID;
  return translated.padStart(
    config.maxLength,
    config.paddingCharacter,
  ) as SUUID;
};
```

- `shortenUUID`: UUID 문자열의 대시를 제거하고 소문자로 만든 32자 hex 문자열을 `any-base`로 목적 alphabet 문자열로 변환한다(hex→alphabet). 즉 UUID를 "hex 문자열(16진 128비트 정수)"로 취급해 그대로 진법 변환기에 넣는다 — 바이트 배열이 아니라 **문자열 표현 그대로** 변환기에 전달한다.
- `restoreUUID`: alphabet→hex 역변환 후 `padStart(32, '0')`로 32자를 채우고(선행 0이 진법 변환 과정에서 소실될 수 있으므로), 정규식으로 8-4-4-4-12 그룹을 잘라 대시를 넣는다.
- `maxLength` 계산(`src/utilities.ts:6-8`): `Math.ceil(128 / Math.log2(alphabetLength))`. 128비트를 밑이 `alphabetLength`인 로그로 나눠 필요한 최대 자릿수를 구한다(예: flickrBase58 → `Math.ceil(128/Math.log2(58))` = 22자, 실제 테스트 `test/index.js`에서 `t.equal(b58default.maxLength, 22, ...)`로 고정 확인).

### 2.3 `createTranslator(alphabet, options)`와 `consistentLength` 패딩 로직

`src/convertor.ts:10-42`:

```ts
const createTranslatorFromOptions = (
  options: TranslatorOptions = {},
): Translator => {
  const setup = { ...defaultConfig, ...options };
  if (checkForDuplicates(setup.alphabet)) {
    throw new Error("Alphabet contains duplicate characters.");
  }
  const config = {
    ...setup,
    maxLength: calculateMaxLength(setup.alphabet.length),
    paddingCharacter: setup.alphabet[0],
    hexFromAlphabet: anyBase(setup.alphabet, anyBase.HEX),
    hexToAlphabet: anyBase(anyBase.HEX, setup.alphabet),
  } as Config;

  const translator = {
    alphabet: config.alphabet,
    fromUUID: (uuid: UUID): SUUID => shortenUUID(config, uuid),
    generate: (): SUUID => shortenUUID(config, config.uuid() as UUID),
    maxLength: config.maxLength,
    toUUID: (shortUuid: SUUID): UUID => restoreUUID(config, shortUuid),
    uuid: config.uuid,
    validate: validate(config),
  } as Translator;

  Object.freeze(translator);
  return translator;
};
```

`createTranslator(arg?, options?)`는 `src/convertor.ts:54-61`에서 `arg`가 문자열이면 alphabet으로, 객체면 옵션 전체로 취급하는 오버로드다(첫 인자가 alphabet 문자열이거나 옵션 객체 자체일 수 있음).

`consistentLength` 패딩은 `shortenUUID`(`src/translate.ts:14-23`)에서 처리한다: 옵션이 `true`(기본값, `src/config.ts:5`)면 변환 결과 문자열을 `padStart(config.maxLength, config.paddingCharacter)`로 왼쪽 패딩한다. `paddingCharacter`는 alphabet의 첫 문자로 고정된다(`src/convertor.ts:25` `paddingCharacter: setup.alphabet[0]`). `false`면 패딩 없이 가변 길이 문자열을 그대로 반환한다. 패딩은 표현상의 길이만 맞출 뿐 값 자체에는 영향이 없다는 것이 테스트로 명시적으로 검증된다(`test/index.js`의 "padded and unpadded values should translate back consistently" 테스트: 패딩된 값과 패딩되지 않은 값을 각각 패딩 translator/비패딩 translator에 넣어도 4가지 조합 모두 같은 UUID로 복원됨을 확인).

alphabet 중복 문자 검사는 `src/utilities.ts:10-13` `checkForDuplicates`(alphabet을 `Set`으로 변환해 크기 비교)로 하며, 중복이 있으면 `createTranslator` 호출 시점에 `Error('Alphabet contains duplicate characters.')`를 던진다(CHANGELOG.md `[4.0.0]` "short-uuid will now throw an error when provided an alphabet with duplicate characters"에서 도입된 4.0.0 이후 동작).

### 2.4 기본 alphabet과 프리셋 정의 위치

`src/constants.ts:1-12`:

```ts
export const cookieBase90 =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!#$%&'()*+-./:<=>?@[]^_`{|}~";
export const flickrBase58 =
  "123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
export const uuid25Base36 = "0123456789abcdefghijklmnopqrstuvwxyz";
export const rfcBase32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export default { cookieBase90, flickrBase58, rfcBase32, uuid25Base36 };
```

기본 alphabet은 `flickrBase58`(58자, `0`/`O`/`I`/`l` 등 혼동하기 쉬운 문자를 뺀 집합, 출처 주석: Flickr API 논의 링크)이며 `src/config.ts:6` `alphabet: flickrBase58`에서 기본값으로 지정된다. 그 외 프리셋은 `cookieBase90`(쿠키에 안전한 90자, 저자 자체 제작 — 주석 "cookieBase90 is my own creation"), `uuid25Base36`(uuid25 프로젝트 호환 36자 소문자), `rfcBase32`(RFC 4648 §6 base32). 이 상수들은 `src/index.ts:2` `export { default as constants } from "./constants";`로 `short.constants.*` 형태로 공개된다.

### 2.5 대체 UUID 생성기 주입 API

`TranslatorOptions.uuid`(`src/types.ts:4-8`)로 주입한다. 별도 팩토리 인자가 아니라 `createTranslator`의 **옵션 필드 하나**다.

```ts
export interface TranslatorOptions {
  alphabet?: string;
  consistentLength?: boolean;
  uuid?: () => UUID;
}
```

주입 함수의 시그니처는 `() => UUID`(문자열 UUID를 반환하는 인자 없는 함수)다 — `@cp949/random/id`의 `randomBytes: (length: number) => Uint8Array`(원시 바이트를 요구하는 형태)와 근본적으로 다르다(§5에서 비교). README.md:75-84에서 실사용 예시를 제공한다:

```js
const { uuidv7 } = require("uuidv7");
const v7translator = short.createTranslator({ uuid: uuidv7 });
v7translator.generate(); // 1cuDCtXJn1XgatiyAGv63h
```

테스트에서는 `test/index.js`의 "Different UUID Generators" 케이스가 이를 검증한다:

```js
const { uuidv7 } = require("uuidv7");
const b36WithUuid4 = createTranslator(constants.uuid25Base36);
const b36WithUuid7 = createTranslator(constants.uuid25Base36, { uuid: uuidv7 });
const shortFromV4 = b36WithUuid4.generate();
const shortFromV7 = b36WithUuid7.generate();
t.ok(b36.validate(shortFromV4));
t.ok(b36.validate(shortFromV7));
t.equal(b36WithUuid4.toUUID(shortFromV4), b36WithUuid7.toUUID(shortFromV4));
t.equal(b36WithUuid4.toUUID(shortFromV7), b36WithUuid7.toUUID(shortFromV7));
```

(주: 이 파일의 주석 처리된 줄 `// const b36WithUuid4 = createTranslator(constants.uuid25Base36, { uuid: uuid.v4 });`은 Node 14 테스트 호환성 유지를 위해 `uuid` 패키지 의존을 뺀 흔적이다 — 파일 상단 주석 "Dropping uuid to maintain Node 14 testing compatibility"와 일치.)

주입 함수가 반환한 값은 검증 없이(타입 캐스팅 `config.uuid() as UUID`만 있고 런타임 형식 검사 없음) 바로 `shortenUUID`에 전달된다. 잘못된 형식의 문자열을 반환하면 `any-base`의 `isValid` 검사(`isValid`가 hex 알파벳 밖의 문자를 만나면 `Error` 던짐, 위 §2.2)에서 실패하거나 `restoreUUID`의 정규식 매치가 실패해 `undefined`가 나올 수 있다.

### 2.6 왕복 변환(round-trip) 테스트 검증

`test/index.js`에서 여러 각도로 round-trip을 검증한다:

1. **일반 케이스**: `cycle()` 헬퍼(`test/index.js` 상단)가 `crypto.randomUUID()`로 UUID를 만들고 `b58`/`b90`/`b36` 세 translator로 각각 `fromUUID`한 뒤, "should translate back from multiple bases" 테스트에서 `t.equal(b58.toUUID(f58), uu, ...)` 형태로 10회 반복(`t.plan(60)`, 6 assertion × 10회) 원본과 일치하는지 확인한다.
2. **경계값**: "Handle UUIDs that begin with zeros"(`00000000-a70c-...`), "Handle UUIDs with all zeros"(`00000000-0000-0000-0000-000000000000`), "Handle UUIDs with all "f"s"(`ffffffff-ffff-ffff-ffff-ffffffffffff`) — 세 alphabet 모두에서 `toUUID(fromUUID(x)) === x`를 직접 비교. 선행 0 손실 문제를 `padStart(32, '0')`(`src/translate.ts:9`)로 처리했음을 실제로 검증하는 케이스다.
3. **대소문자**: "should handle UUID with uppercase letters" — 대문자 UUID와 소문자 UUID를 각각 `fromUUID`했을 때 결과가 같고(`shortenUUID`가 `.toLowerCase()`로 정규화), 역변환 결과도 항상 소문자로 일치함을 확인.
4. **패딩 일관성**: "padded and unpadded values should translate back consistently" — 고정 문자열 `paddedShort`/`unpaddedShort`를 패딩 translator·비패딩 translator 양쪽에 넣어 4가지 조합 모두 같은 UUID가 나오는지 비교(값 보존 검증).
5. **외부 호환성**: "uuid25 should be compatible with uuid25 examples" — `test/uuid25examples.js`(uuid25 프로젝트의 공식 테스트 벡터, 출처 주석 "https://github.com/uuid25/test_cases/blob/main/examples")를 로드해 `b36.toUUID(uuid25)`와 `b36.fromUUID(hyphenated)` 양방향을 골든 벡터로 검증한다. 자체 round-trip이 아니라 **다른 구현(uuid25)과의 상호 운용성**까지 확인하는 유일한 테스트다.
6. **대체 생성기와의 round-trip**: 위 §2.5의 "Different UUID Generators" 테스트가 서로 다른 생성기로 만든 값도 같은 translator 계열 안에서 `toUUID` round-trip이 성립함을 확인.

## 3. 장점 — 관심사 분리(생성 vs 표현 변환)

- **UUID "생성"과 "표현 변환"이 물리적으로 분리된 함수/모듈이다.** `src/quickTranslate.ts`(생성 편의 함수 `generate`)는 `src/convertor.ts`의 `createTranslator`에 의존하지만, 변환 로직 자체(`src/translate.ts`의 `shortenUUID`/`restoreUUID`)는 UUID를 "어떻게 만들었는지"를 전혀 모른다 — 인자로 받은 `longId: UUID` 문자열이 `crypto.randomUUID()`의 결과든, 사용자가 직접 만든 임의의 UUID 형식 문자열이든 구분하지 않는다. 이는 `TranslatorOptions.uuid`로 생성기를 완전히 교체할 수 있다는 사실 자체가 증명한다(§2.5).
- **alphabet과 변환 알고리즘이 독립적이다.** `any-base`에 위임한 진법 변환기는 alphabet 문자 집합의 의미(58자든 90자든 36자든)를 몰라도 동작하므로, 새 프리셋을 추가하는 데 `src/constants.ts`에 문자열 상수 하나만 추가하면 된다(실제로 `uuid25Base36`, `rfcBase32`가 이런 식으로 추가된 것으로 보인다 — CHANGELOG.md `[5.1.0]` "uuid25Base36 constant").
- **`validate`가 생성/변환과 독립된 순수 판정 함수다.** `src/validate.ts:29-41`은 config(alphabet, maxLength, consistentLength)만 알면 되고, `rigorous` 옵션이 켜졌을 때만 `restoreUUID`를 호출해 실제 UUID 정규식(`REGEX`, uuidjs 정규식을 참고했다고 주석에 명시)까지 검사하는 2단계 검증을 제공한다.
- **`consistentLength: false`로 값 손실 없이 표현만 바꿀 수 있음을 테스트로 보장**(§2.6의 4번)한다 — 패딩이 "표시상의 길이"이지 "값의 일부"가 아니라는 계약이 코드와 테스트 양쪽에서 일치한다.

## 4. 단점/트레이드오프

- **런타임 의존성이 완전히 0은 아니다.** `uuid` 의존성은 제거했지만 진법 변환은 여전히 `any-base@^1.1.0`에 의존한다(`package.json:19-21`). `@cp949/random`이 "런타임 의존성 0"을 지향한다면 이 지점이 직접적인 차별점이자 short-uuid의 한계다.
- **`crypto` 미지원 환경에 대한 명시적 처리가 없다.** `src/config.ts:7` `uuid: () => globalThis.crypto?.randomUUID()`는 optional chaining만 있고, `crypto`가 없으면 `undefined`를 그대로 반환한다. 이 `undefined`는 `shortenUUID`(`src/translate.ts:15`)의 `longId.toLowerCase()`에서 `TypeError: Cannot read properties of undefined`로 터진다 — `@cp949/random/id`의 `SecureRandomUnavailableError` 같은 전용 에러 클래스가 없어 호출자가 실패 원인을 프로그램적으로 구분할 수 없다.
- **`crypto.randomUUID` 자체의 환경 제약을 그대로 물려받는다.** README.md:43-44 "may error prior to Node 18" / "Node 18 and lower may require passing a `uuid` generator to the translator." — 구형 Node 대응은 라이브러리가 아니라 **호출자가 대체 생성기를 주입**해서 해결해야 한다. 즉 하한 호환성 문제를 API 소비자에게 떠넘기는 설계다.
- **주입 UUID 생성기의 반환값에 대한 런타임 검증이 없다.** `config.uuid() as UUID`는 TypeScript 컴파일 타임 캐스팅일 뿐 런타임 형식 검사가 없다(§2.5). 형식이 틀린 문자열을 반환해도 `createTranslator` 시점에는 걸러지지 않고, 실제로 `generate()`를 호출한 시점에 `any-base`의 `isValid` 검사 실패(모호한 `Error`)나 `restoreUUID`의 정규식 매치 실패(조용히 `undefined` 반환 가능성 — `?.slice(1)`가 `null`이면 `undefined`가 되고 `as UUID`로 타입만 속임)로 늦게, 불분명하게 드러난다.
- **버전 자리(예: v4의 `4`, v7의 `7`)에 대한 별도 검사가 없다.** `any-base` 변환은 128비트를 통짜 정수로 다루므로 UUID의 version/variant 비트 유효성은 전혀 검사하지 않는다 — 실제로 "Handle UUIDs with all zeros/all f's" 테스트가 "even invalid UUIDs"(주석 원문)도 왕복 변환되는 것을 의도적으로 허용함을 보여준다. `validate(shortId, true)`를 쓸 때만 `validateUUID`(RFC 정규식)로 걸러진다.
- **`Number` 기반 긴 나눗셈(`any-base`)의 성능·정밀도는 자릿수 배열 길이에 비례한다.** 128비트 하나 변환에는 무리 없지만, alphabet 크기가 작을수록(`maxLength`가 커질수록, 예: 2진 alphabet이면 128자) 내부 루프 반복 횟수가 늘어나는 구조적 트레이드오프가 있다(코드 구조상 확인, 별도 벤치마크 수치는 저장소에 없음 — "확인 안 됨").
- **CommonJS/`require` 사용성 관련 README 수정 이력**(CHANGELOG.md `[6.0.2]` "Fixed README.md to correctly represent `require` and `import`")과 `[6.0.3]` "Fixed TypeScript definitions"는 6.0.0 TypeScript 재작성 직후 안정화가 덜 된 상태였음을 시사한다 — 메이저 버전 릴리스 직후 2개 패치가 문서/타입 수정이었다.

## 5. `@cp949/random`이 배울 점

### 5.1 `stringifyUuid`/`parseUuid` vs short-uuid의 변환 로직 — 코드 수준 비교

| 항목               | `@cp949/random/id` (`stringifyUuid`/`parseUuid`)                                                                                                                                 | short-uuid (`shortenUUID`/`restoreUUID`)                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 입출력 타입        | `Uint8Array`(16바이트) ↔ `string`. `parseUuid`는 `Uint8Array<ArrayBuffer>`를 반환(`packages/random/src/id/uuid/format.ts:106-112`)                                               | `string`(hex) ↔ `string`(alphabet). 바이트 배열을 전혀 거치지 않는다(`src/translate.ts:1-23`)                         |
| 변환 알고리즘      | `toHex`(내부 인코딩 유틸)로 바이트→hex, 슬라이스로 대시 삽입(`format.ts:64-73`). alphabet 변환 없음, 항상 16진수 표현                                                            | `any-base`의 긴 나눗셈으로 hex(16진)와 임의 alphabet(N진) 사이 진법 변환(§2.2). 표현 alphabet을 자유롭게 바꿀 수 있음 |
| 임의 alphabet 지원 | 없음. `dashes`/`case`만 조절 가능(`UuidFormat`)                                                                                                                                  | 핵심 기능. `createTranslator(alphabet)`로 완전히 다른 문자 집합·길이의 문자열을 만든다                                |
| 길이               | 항상 32 또는 36자로 고정                                                                                                                                                         | alphabet 크기에 따라 가변(`calculateMaxLength`), `consistentLength`로 패딩 제어                                       |
| 순수성             | 둘 다 crypto 접근 없는 순수 함수(id.md:5 "난수와 무관한 순수 함수이며 crypto에 접근하지 않는다"; short-uuid도 `shortenUUID`/`restoreUUID`는 config와 입력 문자열만으로 결정론적) | 동일                                                                                                                  |
| 입력 검증          | `assertUuidBytes`/`assertUuidHex`로 `instanceof Uint8Array`·정규식 검사 후 `RangeError`(계약 문서 id.md:110-117)                                                                 | `any-base`의 `isValid`가 alphabet 밖 문자를 만나면 `Error`를 던지지만, 검사 시점이 늦고 에러 타입이 범용 `Error`      |

**시사점**: `@cp949/random`은 "UUID ↔ hex 문자열" 표현 하나만 지원하는 대신 입력 검증(`RangeError` 일원화, realm 안전성)이 short-uuid보다 엄격하다. short-uuid는 "hex ↔ 임의 alphabet" 진법 변환까지 지원 범위를 넓힌 대신 검증이 느슨하다. 만약 `@cp949/random`이 향후 "짧은 문자열 표현"(예: base58 인코딩된 UUID)을 지원하고 싶다면, short-uuid처럼 `any-base` 같은 외부 진법 변환 라이브러리에 의존하지 않고 **바이트 배열(`Uint8Array`) 기반 big-endian 진법 변환을 직접 구현**하면 런타임 의존성 0 원칙을 지키면서 동등한 기능을 얻을 수 있다 — short-uuid의 알고리즘(§2.2의 long division)은 문자열 자릿수 배열 대신 이미 파싱된 바이트 배열(16바이트, 각 자리 0~255)을 입력으로 쓰면 그대로 이식 가능한 로직이다.

### 5.2 생성기 주입 패턴 비교 — `createUuidv4Factory`/`createUuidv7Factory`와의 차이

| 항목                        | short-uuid `TranslatorOptions.uuid`                                                                                                           | `@cp949/random/id` `Uuidv4/7FactoryOptions.randomBytes`                                                                                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 주입 대상                   | **완성된 UUID 문자열을 반환하는 함수** `() => UUID`(`src/types.ts:7`)                                                                         | **원시 난수 바이트를 반환하는 함수** `(length: number) => Uint8Array`(id.md:294, 391)                                                                                                                                  |
| 주입자의 책임 범위          | 버전/variant 비트 설정, 포맷팅(대시 등)까지 전부 주입 함수가 책임진다 — `uuidv7` 패키지를 통째로 갈아 끼우는 방식                             | 난수 바이트만 책임진다. version/variant 비트 설정과 포맷팅은 팩토리 내부(`createUuidv4Factory`/`createUuidv7Factory`)가 계속 수행한다(id.md:308 "주입 배열 불변... version·variant를 적용하므로")                      |
| 검증                        | 반환값 형식 검증 없음(§2.5). 실패 시 하류에서 불분명한 에러                                                                                   | `instanceof Uint8Array`와 요청 길이 일치를 매 호출 검사, 위반 시 그 호출만 `RangeError`(id.md:307, 405)                                                                                                                |
| 생성 시점 vs 호출 시점 분리 | `createTranslator`가 옵션 검증과 동시에 `config.uuid`를 설정만 하고 호출은 `generate()` 시점(지연 호출은 동일)                                | 동일하게 생성 시점엔 옵션만 검증하고 crypto/주입 함수를 호출하지 않음(id.md:135, 305) — 이 원칙은 두 설계가 일치                                                                                                       |
| 목적                        | "완전히 다른 UUID 버전(v7 등)으로 통째로 바꿔 끼우기" — alphabet 인코딩과는 독립적으로 어떤 UUID 버전이든 재사용 가능하게 하는 범용 교체 지점 | "결정적 테스트"만을 위한 주입(id.md 전체에서 "테스트용 주입", "운영 코드에서는 넘기지 않는다"로 반복 명시) — 프로덕션에서 v4/v7 자체를 바꾸는 용도가 아니라 이미 `uuidv4`/`uuidv7`로 분리된 별도 함수가 그 역할을 한다 |

**시사점**: 두 설계는 "생성기를 주입 가능하게 한다"는 표면적 유사성은 있지만 주입 지점의 추상화 레벨이 다르다. short-uuid는 **UUID 전체**를 주입 대상으로 삼아 "어떤 버전의 UUID든 상관없이 표현만 바꾼다"는 관심사 분리를 얻는 대신, 주입값의 무결성(버전/variant 비트가 맞는지)을 전혀 보장하지 못한다. `@cp949/random`은 **난수 바이트**만 주입 대상으로 삼아 "버전별 비트 조작은 라이브러리가 언제나 책임진다"는 무결성을 지키면서, 대신 주입은 명시적으로 테스트 전용으로 한정한다(운영 코드 경로 없음). `@cp949/random`이 만약 short-uuid처럼 "완전히 다른 버전의 UUID 생성기 통째로 교체"를 지원하고 싶다면, 이는 현재의 `randomBytes` 주입으로는 불가능하고(예: v7의 counter 로직 자체를 다른 알고리즘으로 바꾸는 것) 별도의 최상위 훅(예: `stringifyUuid`에 이미 만들어진 16바이트를 넘기는 기존 경로 자체가 이 역할을 이미 수행하고 있다는 점)을 재확인하는 것으로 충분하다 — 오히려 short-uuid의 "생성기 전체 교체" 패턴을 그대로 들여올 필요는 없다는 결론이 더 타당하다: 무결성 보장이 없는 API 표면을 넓히는 트레이드오프이기 때문이다.

### 5.3 기타 실행 가능한 개선 아이디어

- `consistentLength` 같은 "표현 길이 고정 여부" 옵션 자체는 `@cp949/random/id`에 없는 개념(현재 `stringifyUuid`는 `dashes` 유무로만 길이가 32/36으로 고정)이라 직접 이식할 대상은 아니지만, 향후 임의 alphabet 인코딩을 추가한다면 "패딩이 값이 아니라 표현"이라는 계약을 short-uuid처럼 **round-trip 테스트로 명시적으로 고정**하는 방식(§2.6의 4번 테스트)은 그대로 채택할 만하다.
- short-uuid의 `validate(shortId, rigorous)` 2단계 검증(형식만 체크 vs 실제 UUID로 복원해서 RFC 검증까지)은 `@cp949/random/id`의 `isUuid`(형식+version+variant 검사, 항상 "rigorous"에 해당하는 수준)와 이미 동등하거나 더 엄격하므로 추가로 배울 점은 크지 않다.
- 외부 골든 벡터(uuid25 프로젝트의 공식 테스트 케이스)를 가져와 상호운용성을 검증하는 관행(§2.6의 5번)은, `@cp949/random`이 향후 표준화된 짧은 UUID 인코딩(uuid25, base58 등)을 지원하게 되면 그대로 채택할 가치가 있다.

## 6. 참고 자료

- 로컬 클론: `/work/thrd/short-uuid` (git HEAD `0705935eaaf933dfd42d8d56069bfa574bbe6aef`, 단일 커밋 클론이라 v6.0.0 전환 자체의 커밋 히스토리는 로컬에 없음 — CHANGELOG.md/README.md 기록으로 대체 확인)
  - `package.json`, `CHANGELOG.md`, `README.md`, `LICENSE`
  - `src/index.ts`, `src/config.ts`, `src/constants.ts`, `src/convertor.ts`, `src/translate.ts`, `src/utilities.ts`, `src/validate.ts`, `src/types.ts`, `src/quickTranslate.ts`
  - `test/index.js`, `test/uuid25examples.js`
- 원본 GitHub: https://github.com/oculus42/short-uuid
- `any-base@1.1.0` 원문 소스(로컬 미설치, unpkg CDN에서 확인): https://unpkg.com/any-base@1.1.0/index.js, https://unpkg.com/any-base@1.1.0/src/converter.js (원 저장소: https://github.com/HarasimowiczKamil/any-base)
- `@cp949/random` 비교 대상 소스: `/work/cp949/random/packages/random/src/id/uuid/format.ts`, `/work/cp949/random/packages/random/src/id/index.ts`, `/work/cp949/random/docs/api/id.md`
- 개요 수준 선행 조사(본 문서보다 얕음): `/work/cp949/random/docs/research/similar-libraries.md` 125-134행, 178행
