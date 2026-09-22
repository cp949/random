# TRP-001 tsc가 dist를 비우지 않고 turbo 캐시 hit도 여분 파일을 지우지 않는다

- 상태: ACTIVE
- 적용 조건: 소스 파일을 지우거나 이름을 바꾸거나, 산출물이 달라지는 tsconfig 옵션(`declarationMap` 등)을 바꾼 뒤 `pnpm build`를 실행할 때. 또는 `dist`에 직접 파일을 만든 뒤 turbo 캐시 hit로 `pnpm build`가 재생될 때.

## 오해하기 쉬운 신호

- `pnpm build`가 성공하고 새 설정으로 컴파일되지만 `dist/`에는 이전 빌드의 파일이 그대로 남는다.
- `tsc`로 새 outDir에 직접 빌드하면 잔재가 나타나지 않아서 설정이 틀린 것으로 오해하기 쉽다.
- turbo는 `dist/**`를 잔재째 캐시하고, 캐시 hit일 때는 `build` 스크립트(정리 단계 포함)를 실행하지 않고 산출물만 복원한다. `dist`를 지워도 잔재를 복원한다.

## 원인

- `tsc`는 outDir를 비우지 않는다.
- turbo의 `outputs`(`dist/**`)는 산출물을 캐시에서 복원만 하고 캐시에 없는 여분 파일을 지우지 않는다.

## 탐지/회피

- `packages/random`의 `build` 스크립트가 `dist`를 먼저 지운다. 캐시 miss일 때만 실행된다.
- `pnpm verify`는 빌드를 `--force`로 실행해 캐시와 무관하게 정리 단계를 거친다.
- 잔재가 배포 tarball에 실리면 `pnpm check:pack`의 파일 허용 집합 검사(`*.map` 금지 등)가 실패한다. 이 검사가 마지막 방어선이다.
- 로컬에서 정리하려면 `pnpm --filter @cp949/random build`로 스크립트를 직접 실행하거나 `dist`를 지운다.
