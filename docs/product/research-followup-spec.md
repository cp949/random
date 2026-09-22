# 유사 라이브러리 리서치 반영 spec

- 상태: 승인 (2026-09-22)
- 관련 단계: 없음(브레인스토밍 단독 확정 작업). 단, DELTA-02가 `docs/product/roadmap.md`의 §2와 R9를
  수정한다.
- 근거 문서: `docs/research/similar-libraries.md`(요약)와 `docs/research/similar-libs/*.md`(상세 11편).
  모든 비교 서술은 이 문서들의 절 번호를 인용하며 새로 조사하지 않는다.

## 1. 목표

리서치가 확인한 "배울 점" 약 40개를 코드 변경 없이 저장소에 반영한다. 반영 형태는 셋이다.

1. 문서 보강: 비교 문서 신설, 마이그레이션 함정, 설계 근거, seed 합성 레시피, 요약 동기화.
2. 테스트 보강: `int`·`uniform`·샘플링의 non-regression 스냅샷.
3. 로드맵 보강: §2 운영 원칙 1줄, R9 후보 4개에 설계 메모, 벤치마크 실험 후보 3개.

## 2. 범위 밖

- 라이브러리 코드(`packages/random/src`) 변경. 리서치가 제안한 코드 변경 3건(§5 DELTA-02의 실험 후보)은
  벤치마크 근거가 없어 실행하지 않는다(로드맵 §2 "성능 주장은 벤치마크 전에는 하지 않는다").
- 새 공개 API. 상태 스냅샷·ULID·짧은 UUID 표현은 R9 후보로 남고 설계 메모만 붙인다.
- 기각 결정의 ADR. 채택하지 않은 패턴은 `docs/comparison.md` §3에 짧게 남긴다.
- GitHub Issue 등록. 이 spec과 rubber-workflow 작업 폴더로 추적한다.
- 리서치 자체의 재검증. 상세 문서가 소스 인용으로 확정한 사실은 그대로 신뢰한다.

## 3. 리서치 항목 분류 결과

상세 문서의 "배울 점" 절을 전부 대조한 결과다. "이미 충족"은 이번 작업에서 아무것도 하지 않는다.

| 분류        | 항목                                                                                                                                                                                                                                                                                                                                                                                      | 처리             |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 이미 충족   | rejection sampling 공식(nanoid §5.1), 65,536 chunk(nanoid §5.4), 코드 인접 주석(nanoid §5.5), xoshiro 참조 구현 언급(pure-rand §5.1), FNV-1a 유사 문자열 회귀(chance §5.4), v7 counter 초기화 단일 함수 `initialCounter`(uuid §5.4), `getRandomValues` 호출 횟수·바이트 검증(random-js §5.6, `test/secure/random-int.test.ts`), 주입 반환값 검증(cuid2 §5.2), 통계 허용오차(cuid2 §5.2-4) | 없음             |
| 문서 보강   | 차별점 6축, 마이그레이션 함정 4건, 설계 근거 4건, seed 합성 레시피, 요약 stale 3건                                                                                                                                                                                                                                                                                                        | DELTA-01, 03, 04 |
| 테스트 보강 | non-regression 스냅샷(pure-rand §5.2)                                                                                                                                                                                                                                                                                                                                                     | DELTA-05         |
| 로드맵 보강 | breaking "한 릴리스에 하나씩"(pure-rand §5.7), 상태 스냅샷 설계(seedrandom §6, pure-rand §5.3, random-js §5.4), ULID 설계(ulid §5.2), 짧은 UUID 표현(short-uuid §5.1·5.3), 벤치마크 실험 후보(random-js §5.2·5.3, nanoid §5.2)                                                                                                                                                            | DELTA-02         |
| 기각        | nanoid 문자열 풀링(§5.3), cuid2 다중 entropy·`Math.random` 폴백(§5.1), uuid `v7(options)` 오버라이드(§5.1), short-uuid 생성기 통째 주입(§5.2), chance.js 다중 인자 seed 해싱(§5-1), seedrandom식 상태 객체 노출(§6-1), nanoid 비트마스크 경로(§5.1)                                                                                                                                       | DELTA-03 §3      |

## 4. 작업 형태

rubber-workflow 작업 하나. 작업 폴더 `_works/20260922-05-research-followup/`, 브랜치
`research-followup`(`dev`에서 분기). DELTA 6개를 아래 순서로 진행하되 01→02→03은 순서 고정(뒤 DELTA가
앞 DELTA의 문서를 인용한다)이고 04·05·06은 순서 무관이다.

## 5. DELTA 정의

### DELTA-01 리서치 문서 추적과 요약 동기화

- 목적: untracked인 `docs/research/`를 커밋하고, 요약 문서가 상세 문서와 어긋나는 3곳을 고친다.
- 변경 대상: `docs/research/similar-libraries.md`의 내용 수정. 상세 문서는 내용을 수정하지 않는다.
- 서식: `docs/research/` 12개 파일 전부가 현재 `prettier --check`에 실패한다(`pnpm verify`의
  `format:check`가 `**/*.md`를 검사한다). 커밋 전에 `pnpm exec prettier --write docs/research/`를 실행한다.
  서식 변경만이고 내용 변경이 아님을 diff로 확인한다.
- 수정 내용:
  1. ulidx 절 "PRNG 커스터마이징(prng 옵션) 여부: 문서에서 확인 안 됨" → `monotonicFactory(prng?)`와
     `ulid(seedTime?, prng?)`로 주입 가능(`similar-libs/ulid.md` §2.5).
  2. uuid 절 "기본 동작만으로 단조성이 자동 보장되는지는 이번 조사에서 확인 안 됨" → 기본 호출은
     모듈 스코프 `_state`로 단조. `options`를 하나라도 주면 `_state`를 건드리지 않아 단조성에서 이탈
     (`similar-libs/uuid.md` §2.2).
  3. Node `crypto` 절 "엔트로피 부족 시 전용 에러 처리: 확인 안 됨" → 전용 에러 없음. 범용
     `ERR_CRYPTO_OPERATION_FAILED`("Deriving bits failed")로 수렴(`similar-libs/node-crypto.md` §2.3).
  4. 말미 "확인하지 못한 사항" 목록에서 위 3건을 제거한다. 나머지 항목은 그대로 둔다.
  5. 종합 절의 uuid `seq` 서술("옵션 의존형")은 사실이 바뀌지 않았으므로 유지하되, 2번의 "옵션을 주면
     이탈" 사실을 한 문장 덧붙인다.
- 완료 기준: 수정한 3곳이 인용한 상세 문서 절 번호가 실제로 존재한다(`grep`). `pnpm format:check` 통과.

### DELTA-02 로드맵 §2·R9 보강

- 목적: 리서치가 확인한 운영 원칙 1개와 R9 설계 메모를 로드맵에 기록한다. 로드맵은 "구현 순서와 단계
  완료 조건만" 소유하므로 시그니처는 적지 않는다.
- 변경 대상: `docs/product/roadmap.md`.
- §2 운영 원칙에 추가할 1줄:
  - "breaking change는 한 릴리스에 하나의 축만 넣는다. 여러 축을 한 릴리스에 모으지 않는다."
    (pure-rand v7→v8이 5개 축을 한 major에 몰아 마이그레이션 비용이 컸다는 사례가 근거. 근거는 로드맵에
    적지 않고 `docs/comparison.md`가 인용한다.)
- R9 항목별 설계 메모(각 항목 뒤에 괄호 또는 하위 bullet 1줄):
  - 상태 스냅샷: "`RandomSource`(`() => number`) 계약은 유지한다. 스냅샷은 별도 인터페이스(예: clone 가능
    source) 또는 'seed + 소비한 word 수' 재생 방식으로 root 계약 밖에서 제공한다. 상태 객체 형태 위반은
    `RangeError`."
  - 독립 스트림 분기(`fork`, jump): "jump는 xoshiro128\*\* 참조 구현의 jump 다항식을 쓴다. `jump` 후
    `next`와 `next` 후 `jump`가 같은 상태를 내는 순서 무관성을 속성 테스트로 고정한다(pure-rand
    `noOrderNextJump`)."
  - ULID 등 추가 시간 정렬 ID: "counter 고갈 시 예외가 아니라 timestamp 전진. clock-skew 임계값은 uuidv7의
    10,000ms 정책을 공통 규칙으로 쓴다. 난수 주입은 `randomBytes: (length) => Uint8Array` 형태로 통일한다."
  - 정렬 보존 base62·base32 ID 인코딩: "`Uint8Array` big-endian 진법 변환을 직접 구현한다(외부 진법
    라이브러리 없음). 패딩은 값이 아니라 표현임을 round-trip 테스트로 고정한다."
  - 벤치마크 baseline: 하위 bullet로 실험 후보 3개를 적는다. 각 후보는 "벤치마크로 이득이 확인될 때만
    적용"이 조건이다.
    1. `uniformInt`의 `n`이 2의 거듭제곱일 때 비트마스크 경로(rejection 없음). `int` 결과는 계약이 아니라
       non-breaking, CHANGELOG 기록.
    2. `pickChars`의 첫 요청에 오버슈트 계수(`getRandomValues` 호출 횟수 감소 vs 바이트 낭비).
    3. `createWordSource`의 버퍼 32B 확대(`createSecureSource` 경로만. `randomInt`는 호출마다 새 버퍼라
       무관).
- 완료 기준: 추가한 문장이 기존 항목의 뜻을 바꾸지 않는다(diff 검토). `pnpm format:check` 통과.

### DELTA-03 비교 문서 신설

- 목적: 리서치가 확인한 차별점과 마이그레이션 함정을 소비자가 읽는 문서 한 곳에 모은다.
- 변경 대상: `docs/comparison.md`(신설), `README.md`(루트) "공개 API" 절 아래 링크 1줄,
  `packages/random/README.md` "요건" 절 아래 링크 1줄.
- 문서 구성:
  - 머리말: 확인 날짜 2026-09-22, 근거는 `docs/research/`, 비교 대상 버전은 상세 문서가 기록한 값을
    그대로 쓴다. 성능 비교는 없다(벤치마크 전).
  - §1 차별점 표. 열은 `항목 | @cp949/random | 비교 대상 | 근거`. 행 6개:
    1. 재현성 계약: raw 스트림·seed 변환·`float`/`bool`/`sign`을 golden vector로 고정 | pure-rand·seedrandom은
       seed 1개 벡터, chance.js는 상대 비교만 | pure-rand §2.7, seedrandom §3, chance §2.3
    2. 문자열 seed: FNV-1a 표준 벡터로 고정 | pure-rand는 숫자만, seedrandom은 비표준 mixkey | pure-rand
       §2.6, seedrandom §2.3
    3. 미지원 환경 오류: `SecureRandomUnavailableError` 하나(없음·함수 아님·접근 예외) | crypto-random-string은
       미문서 `ReferenceError`/`TypeError`, Node는 `ERR_CRYPTO_OPERATION_FAILED` 범용 | crypto-random-string
       §2.4, node-crypto §2.3
    4. 지원 여부 조회: `getCryptoCapabilities()` 예외 없음 | 비교 대상 중 없음 | 요약 §3-3
    5. `randomInt` 범위: `2^53 - 1`, BigInt 없음 | Node `2^48` | node-crypto §5.1
    6. uuidv7 단조성: 인스턴스 단위 보장 범위, 고갈 시 timestamp 전진, 10,000ms skew 정책 문서화 | uuid는
       `options` 주면 조용히 이탈, ulidx는 고갈 시 예외, Node `randomUUIDv7`은 단조 미보장 | uuid §2.2,
       ulid §2.3, node-crypto §2.5
  - §2 마이그레이션 함정. 항목 4개, 각각 "원래 코드 → 옳은 이식" 형식의 코드 블록 1개.
    1. Node `crypto.randomInt(min, max)`는 `max` 배제. 주사위 `randomInt(1, 7)`을 그대로 옮기면 `1..7`.
       옳은 이식은 `randomInt(1, 6)`.
    2. crypto-random-string `{length}`는 결과 문자 수, `randomHex(byteLength)`·`randomBase64url(byteLength)`는
       바이트 수. `length: 32`인 hex는 `randomHex(16)`.
    3. nanoid `customAlphabet(alphabet, size)()`는 `randomString(alphabet, size)` 또는 `randomId({ alphabet,
length })`. 본 라이브러리의 `nanoid(length)`는 alphabet 인자가 없다.
    4. cuid2·seedrandom `{entropy:true}`처럼 CSPRNG 부재 시 자동 폴백하는 라이브러리에서 옮길 때: 본
       라이브러리는 폴백하지 않고 `SecureRandomUnavailableError`를 던진다. `getCryptoCapabilities()`로 먼저
       확인한다.
  - §3 채택하지 않은 패턴. 표 `패턴 | 출처 | 채택하지 않은 이유` 7행(§3 분류표의 "기각" 항목). 이유는 각
    1문장.
- 완료 기준: 표의 근거 열이 인용한 절이 상세 문서에 존재한다. README 두 곳에서 링크가 도달한다.
  `pnpm format:check`, `pnpm check:pack`(패키지 README 변경 반영) 통과.

### DELTA-04 API 문서 설계 근거

- 목적: 리서치가 "왜 이렇게 설계했는지 한 줄 더 쓰면 좋다"고 지목한 4곳에 근거를 덧붙이고 seed 합성
  레시피를 추가한다. 계약은 바꾸지 않는다.
- 변경 대상과 내용:
  1. `docs/api/secure.md` `createSecureSource()` 절: "word 버퍼를 호출 간·인스턴스 간 공유하지 않는 이유는
     모듈 수준 상태를 두지 않아 오류 후 복구와 인스턴스 독립성을 보장하기 위해서다." 1문장.
  2. `docs/api/id.md` `createUuidv7Factory(options?)` 절: "`randomBytes`를 `(length) => Uint8Array`로 받는
     이유: 요청당 1회 호출이고 반환값을 `instanceof Uint8Array`·길이로 검증할 수 있다. `() => number`
     방식은 바이트마다 호출하고 반환값 검증이 어렵다." 1~2문장.
  3. `docs/api/id.md` "단조성의 보장 범위" 절: "10,000ms 임계값 정책은 이 라이브러리의 시간 기반 ID 공통
     규칙이다. 시간 정렬 ID를 추가할 때 같은 규칙을 쓴다." 1문장.
  4. `docs/api/random-core.md` `createXoshiro128Source(seed)` 절: "출력은 예측 가능하다. 연속 출력 몇 개로
     내부 상태를 복원할 수 있으므로 token·ID에는 `./secure`·`./id`를 쓴다." 1문장. (이미 유사 문구가
     `./state`에 있으므로 root 절에도 같은 수준으로 맞춘다.)
  5. `docs/api/random-core.md` `createXoshiro128Source` 예제 아래 레시피 1개: 여러 값을 하나의 seed로
     합성한다. 구분자를 넣는 이유(`"ab" + "c"`와 `"a" + "bc"` 구분) 1문장. 라이브러리가 다중 인자 seed를
     받지 않는 이유는 `docs/comparison.md` §3으로 링크.

     ```ts
     const source = createXoshiro128Source(`${userId}:${sessionId}:${round}`);
     ```
- 완료 기준: 계약 표(입력 검증·오류·계약 여부)는 한 글자도 바뀌지 않는다(diff로 확인). `pnpm format:check`
  통과.

### DELTA-05 non-regression 스냅샷 테스트

- 목적: 계약이 아닌 결과값(`int`, `uniform`, 샘플링 6개)의 의도치 않은 변경을 검출한다. 계약으로
  승격하지 않는다.
- 변경 대상: `packages/random/test/core/noreg.test.ts`, `packages/random/test/sampling/noreg.test.ts`
  신설.
- 형식:
  - 파일 상단 개요 주석: "이 값들은 계약이 아니다. 특정 시점의 스냅샷이며 산식 변경 시 CHANGELOG 기록 후
    갱신한다."(`docs/api/random-core.md` "재현성" 절 인용).
  - `describe` 없이 최상위 `it`(`docs/traps/TRP-004`). 스냅샷은 `toMatchInlineSnapshot`으로 파일 안에 둔다
    (외부 `__snapshots__` 디렉터리 없음).
  - seed는 `0`, `42`, `"hello"` 3개. 각 seed마다 `int(source, 1, 6)` 5회, `int(source, 0, 2**40)` 3회,
    `uniform(source, -1, 1)` 3회. 샘플링은 seed `42`로 `choice`, `shuffle`, `sample(k=3)`,
    `permutation(5)`, `weightedChoice`, `createWeightedSampler` 각 1회, 입력은 `[0..9]`.
- 완료 기준: RED 확인은 `uniformInt`의 `limit32` 계산을 임시로 바꿔 실패를 보고 되돌린다(커밋하지 않음).
  `pnpm test` 통과. `pnpm mutation` 대상(`stryker.config.mjs`의 `mutate`)은 바꾸지 않는다.

### DELTA-06 CHANGELOG

- 목적: `Unreleased` 절에 이번 작업을 기록한다.
- 변경 대상: `CHANGELOG.md` `Unreleased`.
- 내용: "문서: 비교 문서 `docs/comparison.md`, API 문서 설계 근거, seed 합성 레시피, 리서치 문서
  `docs/research/`. 테스트: `int`·`uniform`·샘플링 non-regression 스냅샷. 로드맵: breaking 원칙, R9 설계 메모,
  벤치마크 실험 후보." 공개 API 변경 없음을 명시.
- 완료 기준: `pnpm format:check` 통과.

## 6. 완료 조건

- [ ] `pnpm verify` 통과.
- [ ] `docs/comparison.md`가 루트·패키지 README에서 링크로 도달한다.
- [ ] `docs/research/similar-libraries.md`에 DELTA-01의 stale 3건이 없다.
- [ ] `docs/product/roadmap.md` §2에 breaking 원칙 1줄, R9 후보 4개에 설계 메모, 벤치마크 항목에 실험
      후보 3개가 있다.
- [ ] `docs/api/*.md`의 계약 표는 변경되지 않았다.
- [ ] non-regression 테스트 2파일이 `pnpm test`에 포함되고 RED→GREEN 근거가 DELTA-05 결과에 있다.
- [ ] `CHANGELOG.md` `Unreleased`에 기록됐다.

## 7. 결정 기록

- 기각 ADR을 만들지 않는다. 기각 근거는 `docs/comparison.md` §3에 남긴다(사용자 결정, 2026-09-22).
- 비교 문서는 API 문서에 분산하지 않고 `docs/comparison.md` 한 파일로 둔다. API 문서는 계약만 유지한다.
- 코드 변경 후보 3건은 R9 벤치마크 항목의 실험 후보로만 기록한다. 벤치마크 인프라가 없는 상태에서 성능
  근거 없이 바꾸면 로드맵 §2 위반이다.
- 리서치 문서는 `docs/research/`에 그대로 추적한다. 요약 문서만 stale 3건을 고치고 상세 문서는 손대지
  않는다.
