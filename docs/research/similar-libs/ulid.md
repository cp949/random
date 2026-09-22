# ULID 스펙 + ulidx 상세 조사

`docs/research/similar-libraries.md`의 "ULID 스펙 + ulidx" 절은 README 수준 개요다. 이 문서는 그 절이 "확인 안 됨"으로 남긴 `prng` 옵션 여부를 포함해, 로컬 클론 소스 코드(`ulid-spec`, `ulidx`)를 파일:줄번호 단위로 직접 근거를 잡아 재조사한 것이다.

## 1. 개요

- **스펙 목적**: ULID(Universally Unique Lexicographically Sortable Identifier)는 UUID의 128비트 호환성을 유지하면서 "사전순 정렬 가능"·"문자 효율(26자 Crockford Base32 vs UUID 36자)"·"같은 밀리초 내 단조성"을 추가한 식별자 포맷이다(`ulid-spec/README.md:14-33`).
- **ulidx 버전/커밋**: `package.json`에 `"version": "2.4.1"`(`ulidx/package.json:3`). 로컬 클론 HEAD 커밋은 `5043c511406fb9b836ddf126583c80ffb90cbb73`(2025-02-04, `#46 Merge pull request from MarcelWaldvogel/fix-bench`). `CHANGELOG.md`에 따르면 2.4.1은 2024-08-25 릴리스로 `#44` 패키지 exports 수정만 포함한다(`ulidx/CHANGELOG.md:1-6`).
- **라이선스**:
  - `ulid-spec`: 저장소 루트 `LICENSE` 파일이 **GNU GPL v3**다(`ulid-spec/LICENSE:1-2`, 전체 674줄). README 자체에는 라이선스 언급이 없다. 스펙 문서(사양 텍스트)치고는 이례적으로 강한 카피레프트 라이선스이므로, `@cp949/random` 문서에서 이 스펙을 참조·인용할 때 코드 이식이 아니라 "사양 서술"만 참고했다는 점을 명확히 구분해야 한다.
  - `ulidx`: `package.json`의 `"license": "MIT"`(`ulidx/package.json:78`) 및 저장소 `LICENSE` 파일이 "MIT License / Copyright (c) 2021 Perry Mitchell"(`ulidx/LICENSE:1-3`).

## 2. 핵심 구현 상세

### 2.1 인코딩 규칙 (스펙 원문)

- 레이아웃: `48bit timestamp + 80bit randomness` = 128비트, 그림으로 명시(`ulid-spec/README.md:94-100`).
- Timestamp: "48 bit integer, UNIX-time in milliseconds, Won't run out of space 'til the year 10889 AD"(`ulid-spec/README.md:104-107`).
- Randomness: "80 bits, Cryptographically secure source of randomness, if possible"(`ulid-spec/README.md:109-111`) — "if possible"라는 표현으로 보안 난수를 강제(MUST)가 아니라 권고(SHOULD류)로 남겨둔 것이 스펙 원문의 특징이다.
- 정렬: "The left-most character must be sorted first... Within the same millisecond, sort order is not guaranteed"(`ulid-spec/README.md:115`) — 즉 스펙 자체는 같은 ms 내 순서를 보장하지 않으며, 단조성은 별도 "Monotonicity" 절(아래)에서 `monotonicFactory` 같은 구현 패턴으로 추가 보장하는 옵션 기능이다.
- 정규 표현: `ttttttttttrrrrrrrrrrrrrrrr`(t=10자 timestamp, r=16자 randomness)(`ulid-spec/README.md:117-125`).
- 인코딩 알파벳: "Crockford's Base32 is used... excludes the letters I, L, O, and U to avoid confusion and abuse" — `0123456789ABCDEFGHJKMNPQRSTVWXYZ`(`ulid-spec/README.md:127-133`).

ulidx의 실제 상수도 이 알파벳과 정확히 일치한다.

```
const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford's Base32
```

(`ulidx/source/ulid.ts:9`, `ulidx/source/constants.ts:1`)

`TIME_MAX = 281474976710655`(= 2^48 - 1), `TIME_LEN = 10`, `RANDOM_LEN = 16`(`ulidx/source/ulid.ts:11-13`)로 스펙의 48/80비트·10/16자 분할을 그대로 구현한다.

### 2.2 monotonicity 절 원문과 구현의 일치

스펙 원문:

> "When generating a ULID within the same millisecond, we can provide some guarantees regarding sort order. Namely, if the same millisecond is detected, the `random` component is incremented by 1 bit in the least significant bit position (with carrying)."
> (`ulid-spec/README.md:135-138`)

> "If, in the extremely unlikely event that, you manage to generate more than 2^80 ULIDs within the same millisecond, or cause the random component to overflow with less, the generation will fail."
> (`ulid-spec/README.md:150`)

### 2.3 `monotonicFactory()`의 정확한 구현

```ts
export function monotonicFactory(prng?: PRNG): ULIDFactory {
  const currentPRNG = prng || detectPRNG();
  let lastTime: number = 0,
    lastRandom: string;
  return function _ulid(seedTime?: number): ULID {
    const seed = isNaN(seedTime) ? Date.now() : seedTime;
    if (seed <= lastTime) {
      const incrementedRandom = (lastRandom = incrementBase32(lastRandom));
      return encodeTime(lastTime, TIME_LEN) + incrementedRandom;
    }
    lastTime = seed;
    const newRandom = (lastRandom = encodeRandom(RANDOM_LEN, currentPRNG));
    return encodeTime(seed, TIME_LEN) + newRandom;
  };
}
```

(`ulidx/source/ulid.ts:267-281`)

핵심 로직:

- **비교 기준은 `seed <= lastTime`**, 즉 "같은 ms" 판정이 아니라 "새 시각이 마지막 시각보다 뒤로 가지 않았는가"다(`ulidx/source/ulid.ts:273`). 시계가 뒤로 가는(clock-skew, 되돌림) 경우도 이 분기로 흡수되어 `lastTime`을 그대로 쓰고 random만 증가시킨다. 시계가 실제로 얼마나 뒤로 갔는지는 판단하지 않는다 — 1ms 뒤든 1시간 뒤든 동일하게 "random 1 증가"로 처리한다.
- **증가는 `incrementBase32(lastRandom)`**로 위임한다. 자체 랜덤 문자열 전체(16 Base32 문자 = 80비트)를 대상으로 마지막 문자부터 최댓값(`ENCODING_LEN - 1` = 31, 문자 `Z`)이면 `0`으로 되돌리고 캐리를 왼쪽으로 전파한다(`ulidx/source/ulid.ts:193-232`, 특히 루프 `while (!done && index-- >= 0)`와 `if (charIndex === maxCharIndex) { output = replaceCharAt(output, index, ENCODING[0]); continue; }`). 모든 16자리가 `Z`(즉 80비트가 전부 1)면 캐리가 index `-1`까지 넘어가 `done`이 여전히 `undefined`로 남고, 루프가 끝나 `throw new Layerr(..., "Failed incrementing string")`로 예외를 던진다(`ulidx/source/ulid.ts:220-231`) — 이것이 스펙의 "2^80개 넘게 생성하면 실패한다" 조항의 실제 구현이다.
- **`lastTime`을 새로 세팅하는 경로**(`seed > lastTime`)에서만 `encodeRandom(RANDOM_LEN, currentPRNG)`로 랜덤 16문자(80비트) 전부를 PRNG로 새로 뽑는다(`ulidx/source/ulid.ts:277-279`). 즉 새 ms에서는 랜덤값의 최상위 비트를 제한하지 않고 80비트 전부를 무작위로 채운다(`@cp949/random`의 `uuidv7` counter 초기값이 "하위 11비트만" 쓰는 것과 다름 — 아래 5절 비교 참고).
- **`incrementBase32`가 던지는 예외는 클로저 상태(`lastTime`, `lastRandom`)를 되돌리지 않는다.** 실패 시점의 `lastRandom`은 이미 캐리 전파 도중 부분적으로 변경된 `output` 문자열 참조가 아니라, 예외가 나면 애초에 `lastRandom = incrementBase32(lastRandom)` 대입 자체가 일어나지 않으므로(우변 평가 중 throw) 상태는 실패 이전 값 그대로 유지된다.

### 2.4 crypto 소스 선택 로직 — `detectPRNG()`

```ts
export function detectPRNG(root?: any): PRNG {
    const rootLookup = root || detectRoot();
    const globalCrypto =
        (rootLookup && (rootLookup.crypto || rootLookup.msCrypto)) ||
        (typeof crypto !== "undefined" ? crypto : null);
    if (typeof globalCrypto?.getRandomValues === "function") {
        return () => {
            const buffer = new Uint8Array(1);
            globalCrypto.getRandomValues(buffer);
            return buffer[0] / 0xff;
        };
    } else if (typeof globalCrypto?.randomBytes === "function") {
        return () => globalCrypto.randomBytes(1).readUInt8() / 0xff;
    } else if (crypto?.randomBytes) {
        return () => crypto.randomBytes(1).readUInt8() / 0xff;
    }
    throw new Layerr(..., "Failed to find a reliable PRNG");
}
```

(`ulidx/source/ulid.ts:75-100`)

환경 감지 순서:

1. `detectRoot()`로 전역 객체를 찾는다: Web Worker면 `self`, 아니면 `window` → `global` → `globalThis` 순으로 존재하는 첫 값(`ulidx/source/ulid.ts:102-114`).
2. 그 루트 객체의 `.crypto` 또는 `.msCrypto`(레거시 IE)를 우선 쓰고, 없으면 모듈 스코프에 `import crypto from "node:crypto"`로 이미 임포트해 둔 Node `crypto`(`ulidx/source/ulid.ts:1`)로 폴백한다(`ulidx/source/ulid.ts:77-79`).
3. `getRandomValues`가 함수면 브라우저 경로: 1바이트 `Uint8Array`를 채워 `buffer[0] / 0xff`로 0~1 실수를 만든다(`ulidx/source/ulid.ts:80-85`).
4. 아니고 `randomBytes`가 함수면(전역 crypto 쪽 또는 Node `crypto` 모듈 직접) `randomBytes(1).readUInt8() / 0xff`(`ulidx/source/ulid.ts:86-90`).
5. 셋 다 없으면 `"Failed to find a reliable PRNG"` 예외(`ulidx/source/ulid.ts:91-99`).

주의점: 이 함수는 **Node 전용 빌드에서도 `node:crypto`를 최상단에서 무조건 import**한다(`ulidx/source/ulid.ts:1`). `package.json`의 `exports` 맵이 `node`/`default` 조건으로 브라우저 번들(`dist/browser/*`)과 Node 번들(`dist/node/*`)을 분리하므로(`ulidx/package.json:6-18`), 번들러가 조건별 엔트리를 올바르게 골라야 브라우저에서 `node:crypto` 임포트를 피할 수 있다. `@cp949/random`처럼 "런타임에 `globalThis.crypto`만 참조하고 `node:crypto`를 아예 import하지 않는" 설계와는 다른 접근이다.

### 2.5 PRNG 커스터마이징 — `prng` 옵션 여부 확정

**있다.** 이전 조사(`docs/research/similar-libraries.md:108,215`)가 "문서에서 확인 안 됨"으로 남긴 항목을 소스에서 직접 확인했다.

- 타입: `export type PRNG = () => number;`(`ulidx/source/types.ts:1`) — 0~1 사이 실수를 반환하는 0-인자 함수.
- `monotonicFactory(prng?: PRNG): ULIDFactory`(`ulidx/source/ulid.ts:267`) — 팩토리 생성 시 1회 주입. 생략하면 `detectPRNG()`로 자동 감지(`ulidx/source/ulid.ts:268`).
- `ulid(seedTime?: number, prng?: PRNG): ULID`(`ulidx/source/ulid.ts:306`) — 단발성 함수도 두 번째 인자로 동일하게 주입 가능. 생략 시 마찬가지로 `detectPRNG()`(`ulidx/source/ulid.ts:307`).
- 사용 예(테스트): `sinon.stub().returns(0.96)`을 `monotonicFactory(this.prng)`에 주입해 결정적 랜덤 문자를 고정한다(`ulidx/test/node-esm/index.spec.js:179,188`). PRNG가 항상 `0.96`을 반환하면 `randomChar`가 `Math.floor(0.96 * 32) = 30` → `ENCODING[30] = "Y"`를 16번 반복해 `"YYYYYYYYYYYYYYYY"`가 되고(`ulidx/source/ulid.ts:283-289`), 이후 호출은 `incrementBase32`로 `...Y`→`...Z`→`...Z0`→`...Z1`로 캐리가 전파된다(테스트 기댓값 `01ARYZ6S41YYYYYYYYYYYYYYYY` → `...YYZ` → `...YYZ0` → `...YYZ1`, `ulidx/test/node-esm/index.spec.js:195-209`).
- 단, `prng`는 "1바이트를 0~1 실수로 매핑하는 값 생성 함수" 하나만 교체하는 지점이다. 알고리즘(암호학적 안전성, 시드 관리, 분포)은 전적으로 호출자가 넘긴 함수에 달려 있고, ulidx 쪽에서 시드나 알고리즘을 선택하는 옵션은 없다 — 즉 "PRNG 알고리즘 선택 옵션"이 아니라 "난수 소스 자체를 함수로 완전 대체하는 주입 지점"이다.

### 2.6 `decodeTime()`

```ts
export function decodeTime(id: string): number {
    if (id.length !== TIME_LEN + RANDOM_LEN) { throw ...; }
    const time = id
        .substr(0, TIME_LEN)
        .toUpperCase()
        .split("")
        .reverse()
        .reduce((carry, char, index) => {
            const encodingIndex = ENCODING.indexOf(char);
            if (encodingIndex === -1) { throw ...; }
            return (carry += encodingIndex * Math.pow(ENCODING_LEN, index));
        }, 0);
    if (time > TIME_MAX) { throw ...; }
    return time;
}
```

(`ulidx/source/ulid.ts:24-68`)

- 길이(26자) 검증 → 앞 10자를 대문자화 후 뒤집어(`reverse`) 각 문자를 `ENCODING`에서 찾은 인덱스 × `32^자리수`로 누적하는 표준 base32→정수 디코딩이다.
- 알파벳에 없는 문자(`indexOf === -1`)와 `TIME_MAX` 초과(스펙의 "overflow 방지" 요구, `ulid-spec/README.md:169-173` "Overflow Errors when Parsing Base32 Strings" 절)를 각각 별도 에러 코드(`DEC_TIME_CHAR`, 재사용됨)로 던진다.
- 대소문자를 가리지 않는다(`toUpperCase()`) — 스펙의 "Case insensitive" 성질(`ulid-spec/README.md:31`)을 구현한 부분.

### 2.7 `isValid()`

```ts
export function isValid(id: string): boolean {
  return (
    typeof id === "string" &&
    id.length === TIME_LEN + RANDOM_LEN &&
    id
      .toUpperCase()
      .split("")
      .every((char) => ENCODING.indexOf(char) !== -1)
  );
}
```

(`ulidx/source/ulid.ts:247-256`)

- 타입 가드(`typeof id === "string"`) → 길이 26 → 모든 문자가 Crockford Base32 알파벳에 속하는지(`every`)까지 3단 검증. `decodeTime`과 달리 `TIME_MAX` 초과 여부는 검사하지 않는다 — 즉 `isValid`는 "형식"만 보고 "값 범위"는 안 본다(타임스탬프가 2^48을 넘는 26자 base32 문자열도 `isValid`는 `true`를 반환할 수 있다. `decodeTime`을 호출해야 그 초과가 잡힌다).

### 2.8 `fixULIDBase32()`(오타 교정)

```ts
export function fixULIDBase32(id: string): string {
  return id
    .replace(/i/gi, "1")
    .replace(/l/gi, "1")
    .replace(/o/gi, "0")
    .replace(/-/g, "");
}
```

(`ulidx/source/ulid.ts:189-191`)

- 대소문자 무시(`i` flag)로 `i`/`l`(대소문자 불문)을 `1`로, `o`를 `0`으로 치환하고 하이픈을 전부 제거한다. Crockford Base32 스펙이 정의하는 "혼동되는 문자" 교정 규칙(`0`/`O`, `1`/`I`/`L` 혼동 방지)을 그대로 반영한 것 — 다만 이 교정 규칙 자체는 `ulid-spec/README.md`에는 명시돼 있지 않고(스펙은 애초에 `I`, `L`, `O`, `U`를 알파벳에서 제외한다고만 함, `ulid-spec/README.md:129`), Crockford Base32 원안(스펙 저장소 밖)의 관례를 ulidx가 구현체 차원에서 추가한 편의 기능이다. `U`에 대한 교정은 없다(교정 규칙에 `u`→`v` 매핑이 없음 — Crockford 원안은 `U`를 `V`로도 사용하지 않도록 아예 금지 문자로만 다룬다).
- 결과 문자열이 유효한 ULID임을 보장하지 않는다(교정 후 `isValid`를 별도로 호출해야 함) — 함수 자체는 검증하지 않고 치환만 수행한다.

### 2.9 테스트의 monotonic 시퀀스 검증 방식

- `sinon.useFakeTimers({ now: 1469918176385, toFake: ["Date"] })`로 `Date.now()`를 고정하고, `sinon.stub().returns(0.96)`으로 PRNG를 고정한 뒤 `monotonicFactory(this.prng)`를 호출해 만든 함수를 `before`/`after` 훅으로 감싼 순차 `it` 블록 4개에서 1~4번째 호출 결과를 하드코딩된 문자열과 비교한다(`ulidx/test/node-esm/index.spec.js:172-212`).
- 검증 대상은 "매 호출이 정확히 이전 결과 + 1"이라는 사전순 증가 자체이며, 시간 축(`seedTime` 인자)을 바꾸는 케이스(다른 ms로 넘어갈 때 랜덤이 재추출되는지)는 이 스펙 파일에서는 별도로 검증하지 않는다(모두 `seed <= lastTime` 분기만 지나는 4연속 호출).
- `decodeTime`, `fixULIDBase32`, `isValid` 각각의 단위 테스트는 위 2.6~2.8에서 인용한 대로 정상/오류 케이스를 개별 `it`로 나눠 검증한다(`ulidx/test/node-esm/index.spec.js:20-170`).

## 3. 장점

- **스펙과 구현이 상수 단위로 일치**: `ENCODING` 알파벳, `TIME_MAX = 2^48 - 1`, 26자 길이(10+16)가 스펙 원문 수치와 정확히 일치한다(`ulidx/source/ulid.ts:9-13` vs `ulid-spec/README.md:94-133`). 이식 시 별도 상수 재도출이 필요 없다.
- **PRNG 완전 교체 가능**: `ulid()`/`monotonicFactory()` 둘 다 `prng?: PRNG` 인자를 받는다(`ulidx/source/ulid.ts:267,306`). 테스트에서 `sinon.stub()`으로 완전히 결정적인 시퀀스를 만들 수 있다는 것이 실증됐다(`ulidx/test/node-esm/index.spec.js:179,188`). 이는 `@cp949/random`의 `createUuidv7Factory({ randomBytes })` 패턴과 같은 "테스트용 난수원 주입" 철학이다.
- **오류를 코드로 구분**: 모든 예외가 `Layerr`로 `info.code`(`DEC_TIME_MALFORMED`, `DEC_TIME_CHAR`, `ENC_TIME_NAN`, `ENC_TIME_SIZE_EXCEED`, `ENC_TIME_NEG`, `ENC_TIME_TYPE`, `B32_INC_ENC`, `B32_INC_INVALID`, `PRNG_DETECT`, `INVALID_ULID`, `INVALID_UUID`)를 갖는다(`ulidx/source/ulid.ts:15-17` 및 각 `throw` 지점). 문자열 메시지 파싱 없이 실패 원인을 프로그램적으로 구분할 수 있다.
- **오타 교정 유틸을 1급 API로 제공**: `fixULIDBase32`(`ulidx/source/ulid.ts:189-191`)는 사용자 입력(URL, 수기 입력) 정규화라는 실전 요구를 별도 함수로 명시적으로 지원한다.

## 4. 단점/트레이드오프

- **`monotonicFactory`의 인스턴스 단위 상태 한계**: `lastTime`, `lastRandom`은 클로저 지역 변수로만 존재한다(`ulidx/source/ulid.ts:269-270`). 여러 프로세스·탭·서버 인스턴스가 각자 `monotonicFactory()`를 호출하면 서로 다른 상태를 가지므로 전역 단조성은 보장하지 않는다. 이는 `@cp949/random/id`의 `uuidv7` "단조성의 보장 범위"가 명시하는 "인스턴스 단위" 제약(`docs/api/id.md:373`)과 동일한 근본 한계이며, ulidx 문서·README 어디에도 이 범위를 별도로 명문화한 절은 없다(스펙 원문에도 없음 — `ulid-spec/README.md`의 Monotonicity 절은 단일 팩토리 인스턴스를 전제로만 서술한다).
- **clock skew 처리가 "뒤로 감"과 "정상 진행"을 구분하지 않는다**: 판정식이 `seed <= lastTime` 하나뿐이다(`ulidx/source/ulid.ts:273`). 시계가 1ms만 뒤로 가도, 1시간 뒤로 가도 동일하게 "random 컴포넌트 +1, timestamp는 `lastTime` 유지" 경로를 탄다. `@cp949/random`의 `uuidv7`처럼 "10,000ms 이내면 이어쓰고 그 이상이면 재설정"(`docs/api/id.md:376`) 같은 임계값 기반 재설정 로직이 전혀 없다 — ulidx는 클럭이 아무리 오래 뒤처져도 영원히 `lastTime`(가장 앞서 나갔던 시각)에 머무르며 계속 random만 증가시킨다. 클럭이 크게 앞으로 튀었다가 원래대로 돌아온 경우, ulidx는 그 튄 시각을 기준으로 계속 랜덤만 소모하게 되어 실제 시각과 timestamp의 괴리가 무한정 누적될 수 있다(재설정 메커니즘 부재).
- **랜덤 소진(exhaustion) 시 예외로 생성 자체가 실패한다**: 80비트(16자) 랜덤 컴포넌트가 전부 `Z`(all-1)에 도달하면 `incrementBase32`가 `"Failed incrementing string"`을 던진다(`ulidx/source/ulid.ts:220-231`). 호출자가 이 예외를 잡지 않으면 그 밀리초 동안 ID 생성이 완전히 중단된다. `@cp949/random`의 `uuidv7`은 counter 고갈 시 "timestamp를 1ms 앞세우고 counter를 재설정"(`docs/api/id.md:375`)해 생성을 계속하는 반면, ulidx는 재시도·타임스탬프 전진 없이 예외로 끝난다(스펙 자체도 "the generation will fail"이라고 명시, `ulid-spec/README.md:150` — 즉 이는 스펙이 의도한 동작이며 ulidx 고유의 결함은 아니다).
- **크로스 환경 빌드 경계에 대한 의존**: `detectPRNG`가 `node:crypto`를 소스 최상단에서 항상 import하고(`ulidx/source/ulid.ts:1`) 런타임에 `getRandomValues` 유무로 분기한다(`ulidx/source/ulid.ts:80-90`). 브라우저에서 이 함수가 실제로 `node:crypto`를 실행하지 않는 것은 `package.json`의 조건부 `exports`(`node` vs `default` 필드가 별도 빌드 산출물을 가리킴, `ulidx/package.json:6-18`)로 번들 단계에서 분리되기 때문이며, 소스 코드 자체는 두 런타임을 한 파일 안에서 분기한다. 번들러가 `exports` 조건을 지원하지 않거나 잘못 설정되면 브라우저 번들에 `node:crypto`가 섞여 들어갈 위험이 이론적으로 존재한다. `@cp949/random`처럼 "소스 코드 자체가 `node:crypto`를 import하지 않는" 설계(`docs/api/id.md:91`)보다 번들러 의존도가 높다.
- **`isValid`가 값 범위를 검사하지 않는다**: 형식(길이·알파벳)만 검사하고 `TIME_MAX` 초과 여부는 보지 않는다(`ulidx/source/ulid.ts:247-256` vs `decodeTime`의 `time > TIME_MAX` 검사 `ulidx/source/ulid.ts:56-66`). `isValid`가 `true`를 반환해도 `decodeTime`이 던질 수 있는 입력이 존재한다 — 두 함수의 검증 수준이 비대칭이다.

## 5. `@cp949/random`이 배울 점

### 5.1 counter/random 증가 방식의 코드 수준 비교

| 항목              | `@cp949/random` `uuidv7`                                                                                                              | ulidx `monotonicFactory`                                                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 증가 대상         | 전용 12비트 정수 counter(`rand_a`, `docs/api/id.md:344`)                                                                              | 80비트 랜덤 전체를 표현한 16자 Base32 문자열(`lastRandom`, `ulidx/source/ulid.ts:270`)                                                                                                                           |
| 증가 방법         | 정수 `+1` 연산(구현 세부는 비공개, 계약상 "1씩 오르는 counter")                                                                       | 문자열 최우측 문자부터 `ENCODING`에서 다음 문자로 치환, 최댓값(`Z`)이면 `0`으로 되돌리고 좌측으로 캐리 전파(`incrementBase32`, `ulidx/source/ulid.ts:193-232`) — 정수 변환 없이 base32 표현 위에서 직접 자리올림 |
| 초깃값            | "난수의 하위 11비트"(0~2,047), 최상위 비트는 0 고정(`docs/api/id.md:348`) — 새 ms 랜덤 폭을 의도적으로 절반으로 제한해 여유 공간 확보 | `encodeRandom(RANDOM_LEN, prng)`로 80비트 전부를 매번 무작위로 채움(`ulidx/source/ulid.ts:278`) — 상위 비트 제한 없음                                                                                            |
| 같은 시각 판정    | 인스턴스가 관리하는 `lastMs`와 현재 시계 비교(문서상 "10,000ms" 임계값 존재)                                                          | `seed <= lastTime` 단일 부등호, 임계값 개념 없음(`ulidx/source/ulid.ts:273`)                                                                                                                                     |
| 고갈 시 동작      | timestamp를 1ms 앞세우고 counter 재설정, 계속 생성(`docs/api/id.md:375`)                                                              | 예외를 던지고 생성 중단(`ulidx/source/ulid.ts:223-231`) — 스펙이 의도한 동작                                                                                                                                     |
| 시계 역행 시 동작 | 10,000ms 이내는 이어쓰고, 그 이상은 시계 기준으로 재설정(작은 값 나올 수 있음, `docs/api/id.md:376`)                                  | 역행 폭과 무관하게 항상 `lastTime` 유지 + random 증가(재설정 없음)                                                                                                                                               |

### 5.2 실행 가능한 시사점

1. **"증가 폭이 유한하면 반드시 재설정 경로를 만든다"는 설계는 이미 `uuidv7`이 ulidx보다 낫다.** ulidx는 80비트 랜덤 소진 시 예외로 끝나지만(스펙이 그렇게 규정), `@cp949/random`의 `uuidv7`은 12비트 counter 고갈 시 timestamp를 앞세워 계속 진행한다. 이 차이를 `docs/api/id.md`의 단조성 절 서술처럼 앞으로도 "고갈 시 예외가 아니라 timestamp 전진"이라는 계약으로 명문화해 유지할 근거가 이번 조사로 보강됐다 — ulidx 방식(예외)을 벤치마킹해 바꿀 필요가 없다는 확인.
2. **clock-skew 임계값(10,000ms) 정책은 ulidx에 없는 `@cp949/random`만의 차별점**이다. ulidx는 판정식이 `seed <= lastTime` 하나뿐이라 시계가 크게 앞으로 튀었다가 되돌아오면 영구히 그 튄 시각에 갇힌다. `@cp949/random`의 "10,000ms 이내 이어쓰기 / 초과 시 재설정" 정책을 다른 시간 기반 ID(예: 향후 ULID류 유틸을 추가한다면)에도 재사용할 표준 패턴으로 문서화해둘 가치가 있다.
3. **PRNG 주입 지점을 "함수 인자"로 노출하는 ulidx 패턴은 `@cp949/random`이 이미 채택 중인 접근과 같다.** `ulid(seedTime?, prng?)`/`monotonicFactory(prng?)`(`ulidx/source/ulid.ts:267,306`)와 `createUuidv7Factory({ randomBytes, now })`(`docs/api/id.md:387-393`)는 "운영 코드는 기본 난수원, 테스트만 주입"이라는 같은 철학이다. 차이는 ulidx가 "0~1 실수 하나를 반환하는 함수"(`PRNG = () => number`, 바이트 단위 반복 호출 필요)를 주입받는 반면, `@cp949/random`은 "요청 길이만큼의 `Uint8Array`를 반환하는 함수"(`randomBytes: (length: number) => Uint8Array`)를 주입받는다는 것이다. 후자가 호출 횟수가 적고(요청마다 1회) 바이트 배열 검증(`instanceof Uint8Array` 등, `docs/api/id.md:307`)을 하기 쉬워 현재 설계가 더 견고하다 — 바꿀 필요 없음, 다만 이 비교를 근거로 향후 API 문서에 "왜 바이트 배열 주입 방식을 택했는지"를 한 줄 덧붙일 수 있다.
4. **`fixULIDBase32` 같은 "오타 교정" 유틸은 `@cp949/random/id`에 없는 기능이다.** UUID 문자열에는 Crockford Base32 같은 혼동 문자 이슈가 없어 직접적 이식 대상은 아니지만, `randomId`의 `readable` preset(`0`·`1`·`I`·`O` 제외, `docs/api/id.md:201`)이 이미 "혼동 문자 회피"라는 같은 목표를 문자 집합 설계 단계에서 선제적으로 해결하고 있음을 재확인했다 — ulidx는 사후 교정(생성된 뒤 사용자가 잘못 입력한 것을 고침)이고 `@cp949/random`은 사전 예방(애초에 혼동 문자를 생성하지 않음)이라는 설계 차이이며, 후자가 `@cp949/random`의 "생성"과 "파싱" 책임 분리 원칙에 더 부합한다.
5. **`isValid`/`decodeTime`의 비대칭 검증(형식만 보는 함수와 값 범위까지 보는 함수가 분리됨)은 `@cp949/random`의 `isUuid`(형식 판정 전용, `docs/api/id.md:24`)와 `parseUuid`(형식만 검사, `docs/api/id.md:23`) 관계와 유사한 패턴이다. 다만 ulidx는 이 비대칭을 문서화하지 않아 소비자가 혼동할 수 있다는 점이 반면교사다 — `@cp949/random`은 `docs/api/id.md`의 "보장 범위" 표처럼 각 함수가 정확히 무엇을 검사하고 무엇을 검사하지 않는지 표로 명문화하는 현재 방식을 유지할 근거가 된다.

## 6. 참고 자료

- 로컬 클론:
  - `ulid-spec` — `/work/thrd/ulid-spec` (commit `d0c7170df4517939e70129b4d6462cc162f2d5bf`, 2019-05-23)
  - `ulidx` — `/work/thrd/ulidx` (commit `5043c511406fb9b836ddf126583c80ffb90cbb73`, 2025-02-04, package version `2.4.1`)
- 원본 GitHub:
  - ULID 스펙: https://github.com/ulid/spec
  - ulidx: https://github.com/perry-mitchell/ulidx
- 조사 중 직접 읽은 소스 파일: `ulid-spec/README.md`, `ulid-spec/LICENSE`, `ulidx/package.json`, `ulidx/CHANGELOG.md`, `ulidx/LICENSE`, `ulidx/source/ulid.ts`, `ulidx/source/types.ts`, `ulidx/source/constants.ts`, `ulidx/test/node-esm/index.spec.js`.
