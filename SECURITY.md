# 보안 정책

## 지원 버전

| 버전  | 보안 수정 |
| ----- | --------- |
| 0.1.x | 지원      |

## 취약점 신고

공개 이슈에 올리지 않는다. GitHub의 비공개 신고로 보낸다.

- 저장소 Security 탭 → Report a vulnerability
- 바로 가기: <https://github.com/cp949/random/security/advisories/new>

다음을 적으면 확인이 빠르다.

- 영향받는 버전과 subpath(`@cp949/random/secure` 등)
- 재현 코드와 실행 환경(브라우저·버전, Worker 여부)
- 예상 결과와 실제 결과

진행 상황은 같은 Security Advisory에서 공유한다.

## 보안 보증 범위

보안 용도로 설계한 API와 그렇지 않은 API의 구분은 [`packages/random/README.md`의 "예측 가능성과 선택 가이드"](packages/random/README.md#예측-가능성과-선택-가이드)를 따른다. 보안 용도가 아닌 API(`rand`, seed 기반 난수, 순환·카운터 ID)가 예측 가능하다는 것은 설계된 동작이며 취약점이 아니다.
