# TRP-003 attw는 타입이 없는 패키지를 오류 없이 통과시킨다

- 상태: ACTIVE
- 적용 조건: `exports`에서 `types` 조건이 없거나 `.d.ts` 없이 배포하는 패키지를 `attw`로 검사할 때. 검증 도구를 `attw`로 대체하거나 `check:pack`의 `exports` 검사를 완화할 때.

## 오해하기 쉬운 신호

- `attw <tarball> --profile esm-only`가 종료 코드 0을 낸다. 출력은 `This package does not contain types.`이고 모든 profile(`strict`, `node16`, `esm-only`)에서 같다.
- 타입 검사가 통과한 것처럼 보이지만 소비자의 TypeScript는 타입을 얻지 못한다.

## 원인

- `attw`는 타입 부재를 오류가 아니라 정보로 보고한다.

## 탐지/회피

- `pnpm check:pack`이 모든 `exports` 키에 `types`와 `default` 조건을 직접 요구하고 그 파일이 tarball에 있는지 확인한다.
- `pnpm check:consumer`가 tarball을 설치해 `NodeNext`, `Bundler` 두 설정에서 타입이 해석되는지 확인한다. 타입이 없으면 해석에 실패한다.
- `attw`가 실패하는 사례는 ESM 코드를 CJS로 해석하게 만드는 `"type": "module"` 누락이다.
