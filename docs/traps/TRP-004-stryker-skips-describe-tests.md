# TRP-004 Stryker가 `describe` 안의 테스트를 실행하지 않아 mutation 점수가 0%로 나온다

- 상태: ACTIVE
- 적용 조건: Stryker 10.0.0(`@stryker-mutator/vitest-runner` 10.0.0)과 vitest 5.0.1에서 mutation 대상 파일(`packages/random/stryker.config.mjs`의 `mutate`)을 커버하는 테스트가 `describe` 블록 안에 있을 때. `describe` 한 겹이면 충분하고 이름의 공백·특수문자와 무관하다. Stryker나 vitest를 올릴 때도 같은 조건을 다시 확인한다.

## 오해하기 쉬운 신호

- 초기 dry run은 성공하고 mutant마다 "covered N tests"가 정상으로 출력된다.
- mutation 단계에서 mutant가 전부 `Survived`이고 "Ran 0.00 tests per mutant on average"가 나온다. `if (false) return x;` 같은 자명한 mutant도 살아남는다.
- 점수 하한(`break`)이 없으면 종료 코드가 0이라 조용히 지나간다. 하한이 있으면 실패하지만 원인이 테스트 부족처럼 보인다.

## 원인

- Stryker 러너는 커버한 테스트 이름을 공백으로 이어 `testNamePattern` 정규식을 만든다(`vitest-test-runner.js`의 `run`).
- vitest 5.0.1의 `-t`는 `describe` 이름을 `>`로 이은 전체 이름(`그룹 > 제목`)과 대조한다. 공백으로 이은 패턴은 `describe` 안의 테스트와 일치하지 않는다. 최상위 `it`은 이름이 같아 일치한다.
- 프로브로 확인했다. `-t "그룹 제목"`은 0건, `-t "그룹 > 제목"`은 1건이 선택된다. 테스트가 평면인 프로젝트, 하위 폴더, 특수문자 제목, 테스트 25개는 정상 동작했고 `describe` 한 겹과 두 겹은 0건이었다.
- 두 패키지 모두 이 시점의 최신 버전(`@stryker-mutator/vitest-runner` 10.0.0)이라 상위 버전으로 해소되지 않는다.

## 탐지/회피

- 탐지: 실행 결과의 "Ran N tests per mutant"가 0.00이면 러너가 테스트를 고르지 못한 것이다.
- 회피: mutation 대상 파일을 직접 커버하는 핵심 테스트는 `describe` 없이 최상위 `it`으로 쓰고 그룹은 제목 접두어로 표현한다. `packages/random/stryker.config.mjs` 주석과 해당 테스트 파일의 머리말에 같은 규칙을 적어 두었다.
- 점수 하한(`break`)이 실제로 동작하는지는 `scripts/test/stryker.test.mjs`가 확인한다.
- `--logLevel debug`는 Stryker 10.0.0에서 순환 참조 직렬화 오류로 죽고 임시 디렉터리를 남긴다. 이 원인을 조사할 때 쓰지 않는다.
