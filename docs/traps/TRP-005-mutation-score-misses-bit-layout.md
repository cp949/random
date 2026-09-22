# TRP-005 Stryker 점수 100%가 비트 마스크·수치 상수·배열 레이아웃 회귀를 보장하지 않는다

- 상태: ACTIVE
- 적용 조건: Stryker mutation 대상 TypeScript에 비트 마스크, 숫자 상수, 배열 인덱스 또는 `as const` 튜플이 있고, 해당 값이 UUID 버전·variant·timestamp 같은 형식 레이아웃을 결정할 때.

## 오해하기 쉬운 신호

- mutation 점수가 100%이고 생존 mutant가 없다.
- 하지만 Stryker 10은 비트 연산자, 숫자 리터럴, 배열 인덱스, `as const` 요소에 mutant를 만들지 않을 수 있다.
- 따라서 버전·variant 마스크, timestamp 바이트 배치, 임계값이 바뀌어도 점수만으로는 회귀를 알 수 없다.

## 원인

- mutation 도구의 mutator 집합과 TypeScript 변환 범위가 모든 의미 단위를 대체하지 않는다.
- 점수는 생성된 mutant에 대한 테스트 강도이며, 생성되지 않은 연산의 정확성 증명은 아니다.

## 탐지/회피

- mutation 결과의 mutant 종류를 확인하고, 비트·상수·인덱스가 빠졌는지 점검한다.
- 고정 입력으로 형식 필드와 바이트 레이아웃을 검증하고, 핵심 마스크·상수·인덱스는 임시 수동 변형으로 실패를 확인한다.
- mutation 점수와 수동 변형·결정적 회귀 테스트의 증거 범위를 문서에서 구분한다.
