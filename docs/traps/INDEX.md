# 함정 목록

작업 중 발견한 함정 중 재현 조건을 특정할 수 있고, 성공한 것처럼 보이는 신호가 있으며, 재발 가능성이 있는 것만 기록한다.

- [TRP-001](TRP-001-stale-dist-and-turbo-cache.md) — `tsc`가 `dist`를 비우지 않고 turbo 캐시 hit도 여분 파일을 지우지 않아 이전 산출물이 남는다 (ACTIVE)
- [TRP-002](TRP-002-tests-mutating-shared-dist.md) — 실제 `dist`를 지우고 다시 만드는 테스트가 병렬 테스트를 간헐적으로 실패시킨다 (ACTIVE)
- [TRP-003](TRP-003-attw-passes-untyped-package.md) — `attw`는 타입이 없는 패키지를 오류 없이 통과시킨다 (ACTIVE)
- [TRP-004](TRP-004-stryker-skips-describe-tests.md) — Stryker가 `describe` 안의 테스트를 실행하지 않아 mutation 점수가 0%로 나온다 (ACTIVE)
- [TRP-005](TRP-005-mutation-score-misses-bit-layout.md) — Stryker 점수 100%가 비트 마스크·수치 상수·배열 레이아웃 회귀를 보장하지 않는다 (ACTIVE)
