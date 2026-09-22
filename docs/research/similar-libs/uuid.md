# `uuid` (uuidjs/uuid) 소스 분석

`@cp949/random/id`의 `uuidv7()` 설계(옵션 없는 기본 호출만으로 인스턴스 단위 단조성 보장)를 업계 표준 참조 구현인 `uuid`(uuidjs/uuid)와 코드 수준에서 대조한다. README 요약이 아니라 로컬 클론(`/work/thrd/uuid`)의 실제 소스·테스트·CHANGELOG를 근거로 삼는다.

## 1. 개요

| 항목      | 값                                                                                             |
| --------- | ---------------------------------------------------------------------------------------------- |
| 버전      | `14.0.2` (`package.json:3`)                                                                    |
| 로컬 커밋 | `dd8c173521bb3faacb11ff244233df4a0dcde545` (2026-09-15)                                        |
| 라이선스  | MIT (`LICENSE.md:1-3`, Copyright 2010-2020 Robert Kieffer and other contributors)              |
| 모듈 형식 | ESM 전용. `package.json:5` `"type": "module"`                                                  |
| Node 지원 | LTS 릴리스 + 직전 1개(`README.md:467`). v14 기준 `node@20`-`node@24`                           |
| TS 지원   | released 후 2년 이내 버전만 지원(`README.md:469`)                                              |
| CJS 지원  | `uuid@12`부터 완전 중단(`README.md:22`, CHANGELOG `12.0.0` "remove CommonJS support ([#886])") |

## 2. 핵심 구현 상세

### 2.1 CJS 중단 및 최근 breaking change 이력 (CHANGELOG.md)

- **v12.0.0**: `remove CommonJS support (#886)`, `drop node@16 support (#883)`, `update to typescript@5.2 (#887)` — CJS(`require`) 완전 제거, 이후 `exports` 맵은 ESM만 가리킨다.
- **v13.0.0**: `make browser exports the default (#901)` — breaking change로 명시.
- **v14.0.0**: `crypto is now expected to be globally defined (requires node@20+)`, `drop node@18 support (#934)`, TypeScript 최소 버전 5.4.3 상향. 동시에 GHSA-w5hq-g745-h8pq 보안 수정(`v3()`/`v5()`/`v6()`의 buffer offset 미검증 OOB write, `RangeError`로 방어).
- **v14.0.2**: `align default seq formula in v7Bytes with updateV7State (#965)` — v7의 기본 `seq` 계산식 버그 수정(아래 2.3 참조). `v1` 관련 버그도 2건 동시 수정.

`package.json:24-31`의 `exports` 맵은 `"node"`/`"default"` 조건 모두 ESM(`dist-node/index.js`, `dist/index.js`)만 가리키며 CJS 조건이 없다. CJS 소비자는 v11까지만 쓸 수 있다.

### 2.2 `v7()` 구현 — 기본 호출의 단조성은 소스로 확정됨

`src/v7.ts:5-10`:

```ts
type V7State = {
  msecs?: number; // time, milliseconds
  seq?: number; // sequence number (32-bits)
};

const _state: V7State = {};
```

모듈 스코프에 `_state` 객체 하나를 만들어 `msecs`/`seq`를 저장한다(`@cp949/random`의 팩토리별 `lastMs`/counter 상태와 동일한 패턴).

`src/v7.ts:22-49`의 분기가 핵심이다.

```ts
function v7<TBuf extends Uint8Array = Uint8Array>(
  options?: Version7Options,
  buf?: TBuf,
  offset?: number,
): UUIDTypes<TBuf> {
  let bytes: Uint8Array;

  if (options) {
    // With options: Make UUID independent of internal state
    bytes = v7Bytes(
      options.random ?? options.rng?.() ?? rng(),
      options.msecs,
      options.seq,
      buf,
      offset,
    );
  } else {
    // No options: Use internal state
    const now = Date.now();
    const rnds = rng();

    updateV7State(_state, now, rnds);

    bytes = v7Bytes(rnds, _state.msecs, _state.seq, buf, offset);
  }

  return buf ?? unsafeStringify(bytes);
}
```

**확정 사실**: `options`가 falsy(옵션 없이 호출, 또는 `v7(undefined, buf)`처럼 버퍼만 넘기는 호출)일 때만 `else` 분기를 타고, 이때 반드시 모듈 스코프 `_state`를 `updateV7State`로 갱신한 뒤 그 결과(`_state.msecs`, `_state.seq`)로 바이트를 만든다(`src/v7.ts:38-45`). 즉 **`v7()`을 인자 없이 호출하면 옵션을 하나도 안 켜도 자동으로 단조성이 보장된다**. 이전 조사(`docs/research/similar-libraries.md:117`)의 "확인 안 됨"은 이 소스 확인으로 해소된다.

반대로 `options`를 하나라도 넘기면(`v7({ msecs: ... })`처럼 `msecs`만 지정해도) `if (options)` 분기로 빠져 `_state`를 전혀 읽거나 쓰지 않는다(주석 원문: `// With options: Make UUID independent of internal state`, `src/v7.ts:30`). 이 호출은 내부 단조성 체인과 완전히 분리된 "독립" UUID를 만든다 — 이후 기본 호출과 순서가 섞이면 정렬이 깨질 수 있다는 뜻이며, 이 경고는 소스 주석 한 줄에만 있고 런타임 오류나 타입 경고는 없다.

`updateV7State`(`src/v7.ts:53-74`, 테스트 목적으로만 export됨 — "Do not use"):

```ts
export function updateV7State(state: V7State, now: number, rnds: Uint8Array) {
  state.msecs ??= -Infinity;
  state.seq ??= 0;

  if (now > state.msecs) {
    // Time has moved on! Pick a new random sequence number
    state.seq = v7Sequence(rnds);
    state.msecs = now;
  } else {
    // Bump sequence counter w/ 32-bit rollover
    state.seq = (state.seq + 1) | 0;

    // In case of rollover, bump timestamp to preserve monotonicity. ...
    if (state.seq === 0) {
      state.msecs++;
    }
  }

  return state;
}
```

시계가 앞으로 가면(`now > state.msecs`) `seq`를 새 난수로 재설정하고 `msecs`를 갱신한다. 같은 밀리초거나 시계가 뒤로 가면(`now <= state.msecs`, 시계 역행 포함) `seq`를 1 올리고, 32비트 롤오버(`(state.seq + 1) | 0 === 0`)가 나면 `msecs`를 1 앞당겨서라도 단조성을 유지한다(`src/v7.ts:65-70` 주석이 RFC 9562 §6.2 문단 9.4를 직접 인용: `https://www.rfc-editor.org/rfc/rfc9562.html#section-6.2-9.4`).

### 2.3 seq → 바이트 배치와 v14.0.2 버그 수정

`v7Bytes`(`src/v7.ts:76-133`)는 48비트 timestamp, `seq`(32비트)를 `rand_a`(12비트, byte6 하위 니블+byte7) + `rand_b`의 상위 20비트(byte8 하위 6비트+byte9+byte10 상위 6비트)에 나눠 담고, `rand_b`의 나머지 42비트(byte10 하위 2비트+byte11~15)만 순수 난수로 채운다(`src/v7.ts:110-130`).

```ts
buf[offset++] = 0x70 | ((seq >>> 28) & 0x0f); // byte6: version | seq[31:28]
buf[offset++] = (seq >>> 20) & 0xff; // byte7: seq[27:20]
buf[offset++] = 0x80 | ((seq >>> 14) & 0x3f); // byte8: variant | seq[19:14]
buf[offset++] = (seq >>> 6) & 0xff; // byte9: seq[13:6]
buf[offset++] = ((seq << 2) & 0xff) | (rnds[10] & 0x03); // byte10: seq[5:0] | rand[1:0]
```

`v7Sequence`(`src/v7.ts:135-137`): `((rnds[6] & 0x7f) << 24) | (rnds[7] << 16) | (rnds[8] << 8) | rnds[9]`. 이 함수가 **두 곳**에서 쓰인다 — (a) `updateV7State`가 새 시간 구간에서 초기 `seq`를 뽑을 때(`src/v7.ts:59`), (b) `v7Bytes`가 `options`로 호출됐지만 `seq`를 안 준 경우 기본값을 채울 때(`src/v7.ts:100`, `seq ??= v7Sequence(rnds)`).

CHANGELOG `14.0.2`의 `align default seq formula in v7Bytes with updateV7State (#965)`가 바로 이 두 계산을 일치시킨 수정이다. `src/test/v7.test.ts:301-335`의 회귀 테스트가 버그를 명시한다: 수정 전 `v7Bytes`의 기본 `seq` 공식은 `(rnds[6] * 0x7f) << 24`(곱셈)였고 `updateV7State`는 `(rnds[6] & 0x7f) << 24`(마스크)였다(테스트 주석 `src/test/v7.test.ts:306-308`). 즉 옵션으로 `msecs`만 주고 `seq`를 생략한 "독립" 경로와 기본(내부 상태) 경로가 서로 다른 시드로 `seq`를 초기화하던 버그가 최근 패치(2026-08-18)로 고쳐졌다 — 참조 구현도 이런 정합성 버그를 실제로 냈었다는 근거다.

### 2.4 `getRandomValues`/`node:crypto` 분기 — v14부터 통합됨

`src/rng.ts` 전체(`src/rng.ts:1-7`):

```ts
// RNG values for use in UUID generation. This *must* use a high-quality source
// of entropy, such as `crypto.getRandomValues()`.  And we reuse an array for
// performance.
const rnds8 = new Uint8Array(16);
export default function rng() {
  return crypto.getRandomValues(rnds8);
}
```

이 파일 하나만 존재하며(`find`로 `*rng*` 검색 시 `src/rng.ts`와 `src/test/rng.test.ts`뿐, `rng-browser.ts` 없음) `v1.ts:1`, `v4.ts:1`, `v7.ts:1`이 모두 이 동일한 `rng`를 import한다. **`node:crypto` 분기가 없다.** 이는 v14.0.0의 breaking change `crypto is now expected to be globally defined (requires node@20+)`의 직접 결과다 — Node 20부터 `globalThis.crypto`가 항상 존재하므로, 과거 버전들이 갖고 있었을 법한 브라우저/Node 분기(예: node 쪽은 `node:crypto`의 `randomFillSync`)를 폐기하고 `crypto.getRandomValues` 단일 경로로 통합했다. 반면 해시 함수는 여전히 분기한다: `src/md5.ts`는 `node:crypto`의 `createHash('md5')`를 쓰고(`src/md5.ts:1,9`), `src/md5-browser.ts`는 순수 JS MD5 구현이다. `scripts/build.sh:24-34`가 빌드 시 `*-browser*` 파일을 Node 배포판에서 삭제하고 브라우저 배포판에서는 `-browser` 접미사를 떼고 그 자리에 덮어써서 두 배포판을 만든다. **`rng.ts`에는 `-browser` 대응 파일이 없으므로 두 배포판이 완전히 같은 rng 코드를 공유한다.**

`v4()`의 기본 경로(`src/v4.ts:5-21`)는 `crypto.randomUUID`가 있으면 그것부터 쓴다(`if (!buf && !options && crypto.randomUUID) return crypto.randomUUID();`, `src/v4.ts:18-20`). `@cp949/random/id`의 `uuidv4`는 `docs/api/id.md:270`에서 명시하듯 `crypto.randomUUID`를 쓰지 않고 항상 `getRandomValues`로 만든다 — 이 지점은 두 라이브러리의 명확한 설계 차이다.

### 2.5 v1~v7 코드 구조 공유

- **`rng.ts` 공유**: `v1.ts:1`, `v4.ts:1`, `v7.ts:1`이 동일 모듈 import.
- **`unsafeStringify`(`stringify.ts`) 공유**: v1/v4/v7 모두 최종 바이트→문자열 변환에 사용.
- **v3/v5는 `v35.ts`를 공유**: `src/v3.ts:1-27`은 `md5`를 주입해 `v35(0x30, md5, value, namespace, buf, offset)`를 호출하고(`src/v3.ts:26`), v5는 같은 `v35`에 `sha1`을 주입하는 구조(파일명 패턴 및 `src/v35.ts` 내 `HashFunction` 타입 파라미터로 확인). 해시 알고리즘만 다르고 RFC 4122 name-based 로직(`stringToBytes`, namespace 파싱, 바이트 조립)은 완전히 공유한다.
- **v1과 v7만 독립 모듈 상태(`_state`)를 가짐**: v1은 `V1State`(`node`, `clockseq`, `msecs`, `nsecs`, `src/v1.ts:10-22`), v7은 `V7State`(`msecs`, `seq`, `src/v7.ts:5-8`)로 서로 다른 상태 스키마를 각자의 모듈 스코프에 둔다. v4는 무상태(호출마다 완전히 독립).
- **`index.ts`**(`src/index.ts:1-15`)는 각 버전과 `parse`/`stringify`/`validate`/`version`/`MAX`/`NIL`을 재export하는 단순 배럴 파일.

### 2.6 v7 단조성 테스트 (`src/test/v7.test.ts`)

- **`v7() state transitions`**(`src/test/v7.test.ts:168-227`): `updateV7State`를 직접 호출하는 테이블 기반 테스트. 5가지 케이스를 검증한다 — 새 시간 구간(`msecs` 갱신, `seq` 재randomize), 같은 시간 구간(`seq`+1), 같은 구간에서 `seq` 롤오버(`msecs`+1, `seq=0`), **시계 역행**(`now < state.msecs`인데도 `msecs` 불변·`seq`+1), **시계 역행 + 롤오버**(`msecs`가 오히려 2 증가). 마지막 케이스의 테스트 주석(`src/test/v7.test.ts:210-217`)이 이 동작을 직접 설명한다: "the system clock goes backwards but the UUID timestamp moves forward? Weird, but it's what's required to maintain monotonicity". 이 테스트가 **기본 호출 경로(`else` 분기)가 실제로 사용하는 상태 전이 함수** 자체를 검증하므로, 기본 호출 단조성의 가장 직접적인 테스트 근거다.
- **`lexicographical sorting is preserved`**(`src/test/v7.test.ts:116-135`): `v7({ msecs, seq: i })`를 20,000번 호출하며 1,500회마다 `msecs`를 1 증가시켜 시간 경과를 흉내 내고, 매번 `prior < id`(문자열 비교)를 확인한다. 단, 이 테스트는 **`options`를 넘겨 "독립" 경로**(`v7Bytes`가 직접 받은 `msecs`/`seq`)로 호출하므로 `v7Bytes`의 바이트 레이아웃이 단조 증가하는 `(msecs, seq)` 쌍을 올바른 문자열 순서로 인코딩하는지를 검증하는 것이지, 모듈 내부 상태(`_state`)의 자동 증가 자체를 검증하는 것은 아니다.
- **`subsequent UUIDs are different`**(`src/test/v7.test.ts:38-42`): 기본 호출(`v7()`, `v7()`) 두 번의 **비동일성**만 확인한다. 순서(정렬)까지는 검사하지 않는다.
- **`default seq (no explicit seq option) is consistent with updateV7State formula`**(`src/test/v7.test.ts:301-335`): 2.3절의 버그(#965)에 대한 회귀 테스트.

**종합**: 기본 호출(무인자) 하나만 반복 호출해 문자열 정렬을 검사하는 end-to-end 테스트는 없다. 하지만 (a) 기본 경로가 호출하는 정확한 함수(`updateV7State`)의 상태 전이가 테이블 테스트로 전수 검증되고, (b) 그 상태 전이가 만드는 단조 증가 `(msecs, seq)` 쌍이 올바른 문자열 순서로 인코딩됨이 별도 테스트로 검증되므로, 두 테스트를 합치면 기본 호출의 단조성이 구성요소 단위로 커버된다. end-to-end 통합 테스트의 부재는 사실이며 지어내지 않는다.

## 3. 장점

- **업계 표준 참조 구현**. RFC 9562(구 RFC 4122) 전 버전(v1, v3, v4, v5, v6, v7)과 `v1ToV6`/`v6ToV1` 상호 변환까지 지원(`src/index.ts:5-13`). `@cp949/random/id`는 v4/v7만 지원한다.
- **RFC 추적 속도**. v14.0.2(2026-08-18)에 v7의 `seq` 계산 정합성 버그를 즉시 패치했고, v14.0.0에서 RFC 9562 갱신에 맞춰 이름을 유지하면서도 실제 보안 취약점(GHSA-w5hq-g745-h8pq, offset 미검증 OOB write)까지 함께 고쳤다. 이슈 번호(`#965`, `#972`, `#973`)가 붙은 커밋이 각 릴리스에 명확히 연결되어 추적 가능하다.
- **버퍼 직접 기록 API**. `v7(options, buf, offset)`처럼 호출자가 준 `Uint8Array`에 오프셋을 지정해 여러 UUID를 한 버퍼에 이어 쓸 수 있다(`src/test/v7.test.ts:85-110` "fills two UUIDs into a buffer"). `@cp949/random/id`의 `uuidv7`은 문자열만 반환한다.
- **`v4()`의 `crypto.randomUUID` 우선 경로**(`src/v4.ts:18-20`)로 지원 환경에서는 네이티브 구현 성능을 그대로 얻는다.
- **넓은 실사용 검증**. `v7() state transitions` 같은 테이블 테스트로 시계 역행·롤오버 등 실제 운영에서 드물게 터지는 엣지 케이스가 유닛 테스트 수준까지 명문화되어 있다.

## 4. 단점/트레이드오프

- **CJS 완전 중단(v12+)**. `README.md:22`, CHANGELOG `12.0.0`. `require("uuid")`를 쓰는 소비자는 v11에 고정해야 한다. `@cp949/random`은 아직 CJS 지원 여부를 별도로 결정해야 하는 처지지만, uuid는 이미 "결정 완료 + breaking major"로 정리했다는 선례를 보여준다.
- **"독립 경로"가 조용히 단조성 체인을 끊는다**. `options`를 하나라도 넘기면(`msecs`만 넘겨도) `_state`를 전혀 갱신하지 않는다(`src/v7.ts:30-37`). 문서화는 소스 주석 한 줄뿐이고, 타입 시스템이나 런타임 경고가 없다. 같은 프로세스에서 기본 호출과 옵션 호출을 섞어 쓰면 정렬이 깨질 수 있으나 이를 막는 장치가 없다.
- **`seq`가 32비트라 `rand_b`의 62비트 중 20비트를 잠식한다**(2.3절 비트 배치). RFC가 요구하는 `rand_a`(12비트) 외에 `rand_b`의 상위 20비트까지 카운터로 재활용하는 설계라, 한 UUID당 실제 순수 난수는 `rand_b`의 나머지 42비트(byte10 하위 2비트+byte11~15)뿐이다. 카운터 폭을 넓혀 같은 밀리초 처리량은 늘렸지만 그만큼 엔트로피를 대가로 치른다.
- **`node:crypto` 의존을 완전히 제거하지 못한 비대칭 구조**. `rng.ts`는 v14부터 `crypto.getRandomValues` 단일 경로지만, v3/v5의 해시(`md5.ts`/`sha1.ts`)는 여전히 `node:crypto`에 의존하고 브라우저용은 별도 순수 JS 구현(`md5-browser.ts`)을 유지해야 한다(`src/md5.ts:1`, `src/md5-browser.ts` 전체). 빌드 스크립트가 파일명 치환(`scripts/build.sh:24-34`)으로 두 배포판을 만드는 구조라, 신규 해시 알고리즘을 추가할 때마다 이 패턴을 다시 밟아야 한다.
- **Node 최소 버전이 빠르게 상향**. v14.0.0에서 `node@20+` 필수(전역 `crypto)`, README 지원 정책(`README.md:467`)도 "LTS + 직전 1개"라 오래된 LTS(예: node@18)를 쓰는 소비자는 곧 지원 대상에서 빠진다. `@cp949/random`의 Chrome 75 하한 같은 명시적 장기 하한 정책과는 반대 방향이다.

## 5. `@cp949/random`이 배울 점

### 5.1 기본-단조 설계는 같은 패턴, 노출 방식이 다르다

두 라이브러리 모두 "기본 호출은 모듈(또는 인스턴스) 스코프 상태를 자동으로 갱신해 단조성을 보장"하는 동일한 핵심 아이디어를 쓴다.

| 항목                             | uuid (`v7()`)                                                                               | `@cp949/random/id` (`uuidv7()`)                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 기본 상태                        | 모듈 스코프 `_state: V7State`(`src/v7.ts:10`), import 시점에 이미 생성                      | 첫 호출에서 생성되는 기본 인스턴스(`docs/api/id.md:358`), import 시점엔 없음                                                                                                     |
| 카운터 폭                        | 32비트, `rand_a`(12비트)+`rand_b` 상위 20비트를 잠식                                        | 12비트(`rand_a`만), `rand_b` 62비트는 순수 난수(`docs/api/id.md:344,346`)                                                                                                        |
| 카운터 초깃값                    | 새 시간 구간마다 32비트 전부 난수(`v7Sequence`)                                             | 난수 하위 11비트만 사용, 최상위 비트는 0 고정(`docs/api/id.md:348`)                                                                                                              |
| 롤오버 시 동작                   | `msecs++`(문서화는 코드 주석 1줄 + 테스트)                                                  | timestamp를 1ms 앞세움(`docs/api/id.md:375`, 명시적 문서 섹션)                                                                                                                   |
| 시계 역행/드리프트 재설정 규칙   | 코드에 명시적 "10초" 같은 재설정 임계값 없음. 시계가 뒤로 가면 `seq`만 계속 증가            | 마지막 timestamp와 시계차 10,000ms 초과 시 재설정, 문서에 정량적으로 명시(`docs/api/id.md:376`)                                                                                  |
| **"옵션 있는 호출"의 상태 영향** | **`options`를 하나라도 주면 `_state`를 전혀 안 건드림**(독립 UUID, 조용히 단조성 이탈 가능) | **그런 중간 경로가 없음**. 옵션 주입은 `createUuidv7Factory()`로만 가능하고, 그 팩토리는 기본 인스턴스와 완전히 분리된 자기 상태(`lastMs`, counter)를 가짐(`docs/api/id.md:410`) |
| 실패 시 상태                     | 명시적 문서 없음(소스상 `updateV7State`는 예외를 던지지 않는 순수 갱신 함수)                | "실패한 호출은 순서를 건너뛰지 않는다"를 계약으로 명시(`docs/api/id.md:377`)                                                                                                     |

**핵심 차이는 "옵션을 일부만 쓰고 싶을 때"의 API 표면이다.** uuid는 `v7(options)` 하나의 함수로 "완전 기본"과 "완전 독립(시드 지정)"을 모두 처리하려다, 그 경계(`if (options)`)가 status quo를 조용히 바꾸는 부작용을 만들었다. `@cp949/random`은 이를 애초에 함수 두 개(`uuidv7()` vs `createUuidv7Factory()`)로 분리해 "상태 공유 여부"를 타입/API 레벨에서 강제한다 — 옵션을 쓰려면 반드시 별도 인스턴스를 만들어야 하므로 기본 인스턴스의 단조성 체인이 우발적으로 끊길 수 없다. 이 설계가 이미 uuid보다 안전한 트레이드오프를 택했다는 뜻이므로, **현재 구조를 유지하는 것이 옳다**. 굳이 uuid식으로 `uuidv7(options)`에 `seq`/`msecs` 오버라이드를 추가할 필요는 없다 — 추가한다면 uuid와 똑같은 "조용한 상태 이탈" 함정이 생긴다.

### 5.2 카운터 폭 vs 엔트로피 트레이드오프를 문서에 정량적으로 남긴 것은 유지할 가치가 있다

uuid는 32비트 카운터로 처리량을 올렸지만 그 대가(엔트로피 42비트로 축소)를 README/CHANGELOG 어디에도 정량적으로 명시하지 않는다. `@cp949/random`은 이미 `docs/api/id.md:348`에서 "그래서 같은 밀리초에서 적어도 2,049개를 counter만으로 만들 수 있다"처럼 정량적 근거를 문서화하고 있다 — 이 습관을 계속 유지한다. 처리량이 부족하다는 이슈가 실제로 들어오면, uuid처럼 카운터 폭을 조용히 32비트로 늘리기보다 "여전히 `rand_a`(12비트) 안에서 처리하되 필요하면 옵션으로 초기 counter 시드나 상한을 조정할 수 있게" 하는 편이 지금 설계 철학(엔트로피 계약을 문서에 정량적으로 유지)과 일관된다.

### 5.3 `node:crypto`/`getRandomValues` 분기 실수를 재현하지 않는다

uuid는 v14부터 `rng.ts`를 `crypto.getRandomValues` 단일 경로로 통합했지만(2.4절), 해시 함수(md5/sha1)는 여전히 브라우저/Node 이중 구현을 유지한다(빌드 스크립트의 파일명 치환 트릭까지 필요). `@cp949/random/id`는 애초에 `node:crypto`를 import하지 않고 `getRandomValues` 단일 경로만 쓰는 정책(`docs/api/id.md:91`)이므로 이 이중 구현 부채가 아예 없다 — 새 기능(예: 향후 해시 기반 ID)을 추가할 때도 이 단일 경로 원칙을 지켜야 uuid가 겪은 "브라우저/Node 파일 쌍을 계속 동기화해야 하는 부채"를 피할 수 있다.

### 5.4 회귀 테스트 패턴: 상태 전이 함수를 독립적으로 export해 테이블 테스트하기

uuid는 `updateV7State`를 "테스트 전용, 사용 금지" 주석과 함께 export해서(`src/v7.ts:51-52`) 상태 전이 로직만 떼어 테이블 기반으로 전수 검증한다(2.6절). `@cp949/random`의 `createUuidv7Factory`가 내부적으로 비슷한 상태 전이 함수를 갖고 있다면, 유닛 테스트에서 "새 시간 구간 / 같은 구간 / 카운터 고갈 / 시계 역행 / 10초 재설정 임계값 경계"를 이런 테이블 형태로 커버하는지 점검할 가치가 있다. uuid의 회귀(#965)는 "두 곳에서 같은 공식을 써야 하는데 미묘하게 달랐던" 종류의 버그였다 — `@cp949/random`에서도 counter 초기화 공식이 여러 지점(기본 인스턴스 생성 vs 팩토리 생성)에 중복되어 있다면 같은 종류의 정합성 버그 위험이 있으므로, 공식을 단일 함수로 뽑아 양쪽이 그 함수를 호출하게 하는 편이 안전하다(uuid가 사후에 `v7Sequence()`로 통합한 것과 같은 방향).

## 6. 참고 자료

- 로컬 클론: `/work/thrd/uuid` (커밋 `dd8c173521bb3faacb11ff244233df4a0dcde545`, 2026-09-15)
- 원본 저장소: https://github.com/uuidjs/uuid
- 참조 파일(로컬 경로:줄번호)
  - `/work/thrd/uuid/package.json:1-31`
  - `/work/thrd/uuid/CHANGELOG.md:1-56` (v14.0.2 ~ v12.0.0 구간)
  - `/work/thrd/uuid/src/v7.ts:1-139`
  - `/work/thrd/uuid/src/rng.ts:1-7`
  - `/work/thrd/uuid/src/v1.ts:1-22`
  - `/work/thrd/uuid/src/v4.ts:1-64`
  - `/work/thrd/uuid/src/v3.ts:1-27`
  - `/work/thrd/uuid/src/v35.ts:1-40`
  - `/work/thrd/uuid/src/md5.ts:1-11`
  - `/work/thrd/uuid/src/md5-browser.ts:1-25`
  - `/work/thrd/uuid/src/index.ts:1-15`
  - `/work/thrd/uuid/src/test/v7.test.ts:1-337`
  - `/work/thrd/uuid/scripts/build.sh:1-48`
  - `/work/thrd/uuid/README.md:9-22,463-469`
  - `/work/thrd/uuid/LICENSE.md:1-3`
- 사전 개요(비교용, 이번 조사로 갱신됨): `/work/cp949/random/docs/research/similar-libraries.md:113-118`
- 대조 대상 계약 문서: `/work/cp949/random/docs/api/id.md` (`uuidv7`/`createUuidv7Factory` 절, "단조성의 보장 범위")
