# `crypto-random-string` 심층 분석

로컬 클론: `/work/thrd/crypto-random-string`(커밋 `63c3390343250d8bcb5ed42583ee367ab9305343`, 2026-09-19). 이 문서는 `docs/research/similar-libraries.md`의 개요 절을 확장한 것이며, README가 아니라 `index.js`/`index.d.ts`/`test.js`/`package.json` 원본을 직접 근거로 쓴다.

## 1. 개요

| 항목            | 내용                                                                  | 근거                 |
| --------------- | --------------------------------------------------------------------- | -------------------- |
| 목적            | "Generate a cryptographically strong random string"                   | `package.json:5`     |
| 버전            | `6.0.0`                                                               | `package.json:3`     |
| 라이선스        | MIT                                                                   | `package.json:6`     |
| 런타임 의존성   | `type-fest@^5.8.0`(타입 전용), `uint8array-extras@^1.5.0`(런타임)     | `package.json:26-29` |
| devDependencies | `ava@^8.0.1`, `tsd@^0.33.0`, `xo@^4.0.0`                              | `package.json:31-35` |
| `engines.node`  | `>=22`                                                                | `package.json:20-22` |
| 모듈 형식       | `"type": "module"`, `exports.default`/`exports.types`로 ESM 전용 배포 | `package.json:9-13`  |
| 최근 커밋       | `63c3390 Meta tweaks`(단일 로그 항목, 로컬 클론이 shallow)            | `git log --oneline`  |

이전 조사(`docs/research/similar-libraries.md`)에서 "의존성 목록 확인 안 됨"으로 남겼던 항목이 여기서 확정된다: **런타임 의존성이 0이 아니다.** `uint8array-extras`를 `import`해서 실제로 쓴다(`index.js:2`). `type-fest`는 `index.d.ts:1`에서 `MergeExclusive` 타입에만 쓰이므로 런타임에는 영향 없음.

## 2. 핵심 구현 상세

### 2.1 타입 분기 구조

`cryptoRandomString`은 `type`을 두 그룹으로 나눠 완전히 다른 경로를 탄다(`index.js:62-105`).

- **문자 집합 기반 그룹**: `'url-safe'`, `'numeric'`, `'distinguishable'`, `'ascii-printable'`, `'alphanumeric'`, 그리고 사용자 지정 `characters` 옵션. `characterSets` Map(`index.js:52-58`)에 등록되어 있고 `generateForCustomCharacters(length, characterSet)`(`index.js:23-50`)로 처리한다.
- **바이트 인코딩 그룹**: `'hex'`(기본값)과 `'base64'`만 별도 분기(`index.js:100-104`)로, 바이트를 만들어 인코딩 후 `slice`한다.

이 구분은 이전 개요 문서가 "타입별로 필요한 바이트 수를 계산해 slice한다"고 뭉뚱그린 것과 다르다. **byte-length-then-slice 방식은 `'hex'`/`'base64'` 두 타입에만 적용되고, 나머지 5개 문자 집합 타입은 슬라이싱을 전혀 쓰지 않는다.**

### 2.2 `'hex'` / `'base64'` — 바이트 계산과 slicing

```js
// index.js:100-104
if (type === "base64") {
  return uint8ArrayToBase64(randomBytes(Math.ceil(length * 0.75))).slice(
    0,
    length,
  ); // Needs 0.75 bytes of entropy per character
}

return uint8ArrayToHex(randomBytes(Math.ceil(length * 0.5))).slice(0, length); // Needs 0.5 bytes of entropy per character
```

- `hex`: `Math.ceil(length * 0.5)` 바이트 요청 → `uint8ArrayToHex`로 인코딩(바이트당 정확히 2 hex 문자) → 문자열을 `length`로 `slice`.
- `base64`: `Math.ceil(length * 0.75)` 바이트 요청 → `uint8ArrayToBase64`로 인코딩(바이트 3개당 정확히 4문자, 즉 문자당 0.75바이트) → `slice(0, length)`.
- `randomBytes = byteLength => fillWithRandomValues(new Uint8Array(byteLength))`(`index.js:21`). `fillWithRandomValues`(`index.js:10-19`)는 `maxBytesPerRequest = 65_536`(`index.js:5`) 단위로 `crypto.getRandomValues(typedArray.subarray(...))`를 반복 호출해 65,536바이트 제한을 우회한다. 이는 `@cp949/random/secure`의 `fillRandom`(아래 5절 비교)과 동일한 chunking 전략이다.
- `slice`가 인코딩된 문자열 뒤쪽을 잘라내므로, 과도하게 뽑은 여분 바이트(ceil 올림분)에 대응하는 여분 문자가 버려진다. **hex/base64 인코딩 자체는 비트를 고정폭(4비트→1 hex 문자, 6비트→1 base64 문자)으로 그대로 매핑하는 bijection이라 modulo 연산이 없다.** 즉 이 두 타입에는 애초에 modulo bias가 발생할 수 있는 지점이 없다(슬라이싱으로 버려지는 것도 "썼던 랜덤 비트의 일부"이지 편향된 값이 아니다).
- base64 padding(`=`) 처리: 별도 로직 없이 `slice`가 자연히 padding 문자를 잘라낸다는 사실을 테스트가 명시적으로 검증한다(`test.js:30-33`, "These are the lengths where the slice ends closest to the padding, so it must never survive").

### 2.3 문자 집합 타입 — rejection sampling으로 modulo bias 제거

`generateForCustomCharacters`(`index.js:23-50`):

```js
const characterCount = characters.length;
const validSelectorCount =
  Math.floor(maxCharacterSetSize / characterCount) * characterCount; // index.js:26
const entropyLength = Math.ceil(
  1.1 * length * (maxCharacterSetSize / validSelectorCount),
); // index.js:28

while (stringLength < length) {
  const entropy = fillWithRandomValues(new Uint16Array(entropyLength));
  for (let index = 0; index < entropyLength; index++) {
    const entropyValue = entropy[index];
    if (entropyValue < validSelectorCount) {
      // 편향을 만들 값은 버린다
      string += characters[entropyValue % characterCount];
      stringLength++;
      if (stringLength === length) return string;
    }
  }
}
```

- 선택자 폭은 `Uint16`(`maxCharacterSetSize = 0x1_00_00 = 65536`, `index.js:8`) 하나이므로 `characters`는 65,536개(코드 포인트) 이하로 제한된다(초과 시 `TypeError`, `index.js:83-85`).
- `validSelectorCount`는 `characterCount`의 배수 중 65536 이하 최댓값. `entropyValue >= validSelectorCount`인 값은 버려서(discard) `entropyValue % characterCount`가 균등 분포가 되도록 만든다. **이것이 이 라이브러리의 유일한 modulo bias 제거 로직이며, 명백한 rejection sampling이다.**
- `entropyLength = ceil(1.1 * length * (65536 / validSelectorCount))`: 필요한 것보다 약 10% + 폐기율 보정만큼 더 뽑아서, 대개 한 번의 `while` 순회로 끝나게 하는 휴리스틱. 부족하면 `while` 루프가 다시 `Uint16Array`를 채운다(무한 루프 가능성은 이론상 존재하나 `validSelectorCount >= characterCount`이고 최소 1개 값은 항상 유효하므로 실질적으로 종료).
- 테스트가 이 로직을 직접 검증한다: `test.js:94-105`(경계값 32768/32769/40000/65535/65536에서 폐기율 확인), `test.js:107-115`("discarding selector values keeps the distribution uniform" — 40000처럼 65536을 나누어떨어지지 않는 크기에서 discard 없이는 앞쪽 절반이 2배 확률로 뽑힘을 수치로 검증, 0.61 대 실제 0.5).

**결론**: 이전 개요 문서의 "단순 slicing이라면 bias 가능성"이라는 추정은 절반만 맞다. `hex`/`base64`는 slicing이지만 bias 소지 자체가 없고(비트 고정폭 인코딩), 문자 집합 타입(5종 + custom characters)은 slicing이 아니라 **명시적 rejection sampling**을 이미 구현해 bias를 제거한다. bias가 실제로 존재할 수 있는 지점은 이 저장소 소스 안에서 발견되지 않았다.

### 2.4 `globalThis.crypto.getRandomValues` 호출부와 미지원 환경 에러

```js
// index.js:15
crypto.getRandomValues(
  typedArray.subarray(offset, offset + maxElementsPerRequest),
);
```

- `globalThis.crypto`를 명시적으로 쓰지 않고 렉시컬 전역 식별자 `crypto`를 직접 참조한다(`index.js:15`뿐, 파일 전체에 `globalThis` 문자열 없음. `grep -n globalThis index.js`가 매치 없음을 직접 확인함).
- 미지원 환경에서 실제로 던져지는 오류는 **환경에 따라 두 가지로 갈린다**(이번 조사에서 로컬 재현으로 확정, 이전 문서의 "확인 안 됨"을 해소):
  1. **`crypto`라는 전역 식별자 자체가 없는 환경**(예: DOM/Node 전역 crypto가 전혀 주입되지 않은 sandbox): `ReferenceError: crypto is not defined`. Node.js `vm` 모듈로 `crypto`가 없는 빈 컨텍스트에서 `crypto.getRandomValues`를 평가해 직접 재현함(`node --version` v24.20.0, `vm.runInContext('crypto.getRandomValues', vm.createContext({}))` → `ReferenceError: crypto is not defined`).
  2. **`crypto` 전역은 있지만 `getRandomValues`가 없는 부분 지원 환경**: `TypeError: crypto.getRandomValues is not a function`(코드 흐름상 필연적 결과이며 별도 방어 코드 없음. `index.js` 전체에 `typeof crypto`, `crypto === undefined` 류의 가드가 전혀 없음을 직접 확인함).
- 두 경우 모두 **라이브러리가 캐치하거나 감싸지 않는다.** 전용 에러 클래스, `try/catch`, 사전 지원 확인 함수가 소스에 전혀 없다(`index.js` 전체 105줄에 `try`/`catch` 키워드 없음).

### 2.5 TODO 주석

```js
// index.js:1
// TODO: Use Uint8Array#toBase64 and Uint8Array#toHex when targeting Node.js 26
import { uint8ArrayToBase64, uint8ArrayToHex } from "uint8array-extras";
```

- 파일 최상단, `import` 직전 줄. Stage 3(2026년 시점 Node 미탑재) 제안인 `Uint8Array.prototype.toBase64`/`toHex`가 Node 26에서 표준 탑재되면 `uint8array-extras` 의존성을 걷어내고 네이티브 메서드로 교체하겠다는 예고. 즉 현재 버전(6.0.0)은 **아직 네이티브 API로 전환하지 않았고**, `uint8array-extras`를 폴리필처럼 쓰고 있다.

### 2.6 테스트 코드 구조

`test.js`(ava 프레임워크, `package.json:19` `"test": "xo && ava && tsd"`)는 타입별 개별 테스트(`test.js:7-75`: `main`/`hex`/`base64`/`url-safe`/`numeric`/`distinguishable`/`ascii-printable`/`alphanumeric`)로 구성되고 각각:

- 길이 0/10/100에서 결과 `.length`가 정확한지.
- 정규식으로 문자 집합이 맞는지(확률적 sanity check라고 주석에 명시, 예: `test.js:11,19`).
- `generatedCharacterSetSize` 헬퍼(`test.js:5`)로 `targetSize * 640`글자를 뽑아 `Set` 크기가 목표 크기와 같은지 검증(1e-256 이하 오탐 확률이라고 주석에 명시).

추가로 커스텀 문자(`test.js:77-92`, BMP 밖 이모지 포함), 경계값에서의 discard 비율(`test.js:94-105`), 분포 균일성 수치 검증(`test.js:107-115`), `crypto.getRandomValues` 65,536바이트 제한을 넘는 대용량(`length: 300_000`, `test.js:117-128`), 연속 호출 결과가 다른지(`test.js:130-132`), 인자 오류 케이스 11종(`test.js:134-182`: `Infinity`/`NaN`/음수/소수/문자열/타입 충돌/`characters` 타입 오류/빈 문자열/65537자 초과/알 수 없는 `type`/프로토타입 오염 시도 `'constructor'`)을 다룬다. 타입 테스트는 별도 `index.test-d.ts`(tsd)에서 `expectType`/`expectError`로 처리(예: `type`과 `characters` 동시 지정 시 컴파일 타임 에러, `index.test-d.ts:9`).

## 3. 장점

- **`globalThis` 전역 crypto 하나만 신뢰하는 설계**로 브라우저·Node(18.19+/20.0+에서 전역 노출, 여기 `engines`는 `>=22`로 더 보수적) 양쪽을 하나의 코드 경로로 커버한다(`index.js:15`, `package.json:20-22`).
- 문자 집합 기반 타입에 **rejection sampling을 실제로 구현**해 modulo bias를 제거한다(2.3절). 경계값·분포 균일성까지 자동화 테스트로 검증한다(`test.js:94-115`).
- `Uint8Array` 대신 `Uint16Array` 선택자를 써서 문자 집합(최대 65536개)을 한 번의 `getRandomValues` word로 커버하는 효율적 설계(`index.js:33`).
- 65,536바이트/word 호출 제한을 `subarray` 기반 chunking으로 투명하게 처리(`index.js:10-19`), 대용량 문자열도 지원(`test.js:117-128`로 실측 검증).
- 인자 검증이 촘촘하고(`Number.isSafeInteger`, `type`/`characters` 상호배제, 문자 집합 크기 상한) 에러 메시지가 구체적이다(`index.js:63-92`).

## 4. 단점 / 트레이드오프

- **미지원 환경 처리 완전 부재**(2.4절). 전용 에러 클래스도, 사전 지원 확인 함수도, `try/catch`도 없다. 호출자는 `ReferenceError`(전역 자체 없음) 또는 `TypeError`(부분 지원)를 코드로 직접 갈라 처리해야 하는데, 어느 쪽이 나올지는 **라이브러리 문서 어디에도 명시되어 있지 않다**(README에도 없음, `readme.md` 전체 스캔 결과 "error"/"unavailable"/"unsupported" 언급 없음).
- 런타임 의존성이 0이 아니다(`uint8array-extras`). `@cp949/random`의 "런타임 의존성 0" 목표와 정면으로 다른 설계 선택.
- `engines.node: ">=22"`(`package.json:20-22`)로 최신 Node만 지원. `@cp949/random`의 "브라우저 Chrome75 하한"과 같은 구형 타깃 배려가 없다.
- `hex`/`base64`에 `Math.ceil` + `slice`를 쓰므로, 요청한 것보다 최대 1바이트(hex) 또는 최대 2바이트(base64, 3의 배수 경계) 상당의 엔트로피를 더 뽑고 버린다. 치명적이진 않지만 낭비이며, `@cp949/random/secure`의 `randomHex`/`randomBase64url`처럼 "정확히 `byteLength`바이트 → 결정된 길이의 인코딩 문자열"(슬라이싱 없음, 2.6절 하단 비교) 방식보다 API 계약이 느슨하다(요청 `length`가 실제 엔트로피 바이트 수와 정수 배수로 맞아떨어지지 않음).
- `while` 루프(2.3절)에 반복 횟수 상한이 없다. 정상 난수원에서는 문제 없지만 `@cp949/random/secure`처럼 "결함 난수원" 위협 모델을 문서에 명시하지 않는다(`docs/api/secure.md`의 "결함 난수원" 절과 대비됨).
- 사전 지원 확인에 해당하는 `getCryptoCapabilities()` 같은 진단 API가 없다.

## 5. `@cp949/random`이 배울 점

### 5.1 에러 처리 대조 (코드 수준)

crypto-random-string:

```js
// index.js:15 — 가드 없이 즉시 사용
crypto.getRandomValues(
  typedArray.subarray(offset, offset + maxElementsPerRequest),
);
```

가드가 없으므로 실패 모드가 환경마다 다르다(2.4절: `ReferenceError` 또는 `TypeError`, 문서화 없음).

`@cp949/random/secure`:

```ts
// packages/random/src/internal/crypto.ts:51-57
export function getCrypto(): CryptoLike {
  const crypto = readCrypto();
  if (!canGetRandomValues(crypto)) {
    throw new SecureRandomUnavailableError();
  }
  return crypto;
}
```

`readCrypto()`(`crypto.ts:25-34`)가 `globalThis.crypto` 접근 자체를 `try/catch`로 감싸 "접근 시 예외를 던지는 환경"까지 포함해 세 가지 미지원 경우(없음/함수 아님/접근 예외)를 **`SecureRandomUnavailableError` 하나로 수렴**시킨다(`internal/errors.ts:6-13`). crypto-random-string이 커버하지 못하는 "접근 자체가 예외를 던지는 권한 정책 환경"까지 명시적으로 다루는 점이 실질적 우위다. 이미 구현돼 있으므로 유지하고, README/비교 문서에서 "crypto-random-string은 `ReferenceError`/`TypeError`가 문서화 없이 새어나가고, `@cp949/random/secure`는 항상 `SecureRandomUnavailableError` 하나"라는 대조를 명시적으로 쓸 가치가 있다.

### 5.2 바이트 계산 방식 대조

- crypto-random-string `hex`: `Math.ceil(length * 0.5)` 바이트 요청 → 인코딩 → `slice(0, length)`(문자 수 기준 API, 여분 바이트 버림, `index.js:104`).
- `@cp949/random/secure` `randomHex`: `toHex(defaultRandomBytes(byteLength))`(`random-hex.ts:20`) — **바이트 수 기준 API**. `byteLength`가 곧 엔트로피 바이트 수이고 결과 길이는 `byteLength * 2`로 결정적이다. `slice` 없음, 버려지는 바이트 없음.
- crypto-random-string `base64`: `Math.ceil(length * 0.75)` 바이트 요청 → `uint8ArrayToBase64` → `slice(0, length)`(`index.js:101`, 3바이트 경계에 안 맞으면 padding 문자까지 잘라내는 결과에 의존).
- `@cp949/random/secure` `randomBase64url`: `toBase64url(defaultRandomBytes(byteLength))`(`random-base64url.ts:21`) — 자체 구현 인코더(`internal/encoding.ts:29-46`, `btoa`/`Buffer` 미의존)가 3/2/1바이트 나머지를 직접 처리해 4/3/2문자를 만들고, padding을 애초에 만들지 않는다(slice로 잘라내는 게 아니라 알고리즘상 생성 안 함). 결과 길이는 `ceil(byteLength * 4/3)`로 결정적.

**대조가 주는 시사점**: crypto-random-string은 "결과 문자 수(`length`)"를 API 계약으로 노출하고 내부에서 바이트 수로 역산 + slice하는 방식이라, 사용자가 요청하는 게 문자 수인지 엔트로피인지 API 이름만으로 헷갈릴 수 있다(`options.length`가 hex든 custom characters든 전부 "문자 수"로 통일돼 있음, `index.d.ts:11` 주석 "This is the number of characters..."). `@cp949/random/secure`는 반대로 "엔트로피 바이트 수(`byteLength`)"를 계약으로 노출하고 결과 문자 수는 공식(`byteLength*2`, `ceil(byteLength*4/3)`)으로 문서화한다(`docs/api/secure.md`의 `randomHex`/`randomBase64url` 표). 이미 이렇게 설계돼 있으므로 변경 불필요. 다만 두 계약의 차이(문자 수 vs. 바이트 수)를 README나 마이그레이션 가이드에서 "crypto-random-string 사용자가 `length` 옵션을 그대로 `byteLength`로 오해하지 않도록" 명시하면 API 문서 품질에 도움이 된다 — 실행 항목: `docs/api/secure.md` 또는 README에 "crypto-random-string의 `length`는 결과 문자 수, `@cp949/random/secure`의 `byteLength`는 인코딩 전 바이트 수"라는 한 줄 비교를 추가.

### 5.3 rejection sampling 존재 자체는 두 라이브러리 다 갖췄다 — 차이는 적용 범위

crypto-random-string은 문자 집합 타입에만 rejection sampling을 적용하고 `hex`/`base64`에는 적용하지 않는다(그럴 필요가 없어서, 2.2절). `@cp949/random/secure`의 `randomInt`/`randomString`도 동일하게 rejection sampling으로 modulo bias를 없앤다(`docs/api/secure.md` "결함 난수원" 절, `randomInt`/`randomString` 표의 "분포" 행). 차이는 **문서화 수준**: `@cp949/random/secure`는 결함 난수원(상수만 채우는 rejection 무한루프)을 위협 모델 절에서 명시적으로 다루는데(`docs/api/secure.md:64-66`), crypto-random-string은 `while` 루프의 반복 상한 없음을 어디에도 언급하지 않는다. 기존 문서화 방침을 유지할 근거로 이 대조를 인용할 수 있다.

### 5.4 실행 항목 요약

1. (선택, 낮은 우선순위) README/비교 문서에 "미지원 환경 에러: crypto-random-string은 `ReferenceError`/`TypeError`(비문서화) vs. `@cp949/random/secure`는 항상 `SecureRandomUnavailableError`" 표를 추가.
2. (선택) API 문서에 "`length`(문자 수, crypto-random-string 스타일) vs. `byteLength`(엔트로피 바이트 수, 본 라이브러리 스타일)" 계약 차이를 한 줄로 명시.
3. 코드 변경 불필요: `randomHex`/`randomBase64url`/`randomInt`/`randomString`의 현재 구현(바이트 수 기준 계약, rejection sampling, `SecureRandomUnavailableError`)이 이미 crypto-random-string 대비 우위 지점을 갖추고 있음을 이번 조사로 확인함.

## 6. 참고 자료

- 로컬 클론: `/work/thrd/crypto-random-string`, 커밋 `63c3390343250d8bcb5ed42583ee367ab9305343`("Meta tweaks", 2026-09-19).
  - 소스: `/work/thrd/crypto-random-string/index.js`
  - 타입: `/work/thrd/crypto-random-string/index.d.ts`
  - 테스트: `/work/thrd/crypto-random-string/test.js`, `/work/thrd/crypto-random-string/index.test-d.ts`
  - 메타: `/work/thrd/crypto-random-string/package.json`, `/work/thrd/crypto-random-string/readme.md`
- 원본 GitHub: https://github.com/sindresorhus/crypto-random-string
- `@cp949/random` 비교 대상 소스:
  - `/work/cp949/random/packages/random/src/secure/random-hex.ts`
  - `/work/cp949/random/packages/random/src/secure/random-base64url.ts`
  - `/work/cp949/random/packages/random/src/internal/bytes.ts`
  - `/work/cp949/random/packages/random/src/internal/encoding.ts`
  - `/work/cp949/random/packages/random/src/internal/crypto.ts`
  - `/work/cp949/random/packages/random/src/internal/errors.ts`
  - `/work/cp949/random/docs/api/secure.md`
- 재현 실험: Node.js v24.20.0, `node:vm`으로 `crypto` 전역이 없는 빈 컨텍스트에서 `crypto.getRandomValues` 평가 → `ReferenceError: crypto is not defined`(2.4절 근거).
