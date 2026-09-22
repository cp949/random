/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  // 핵심 파일에 한정한다. 파일이 생기는 구현 단계에서 이 목록에 추가한다.
  // 공개 함수의 얇은 래퍼(`random-bytes.ts`, `random-hex.ts` 등)는 넣지 않는다. 그 mutant는 대부분 인자 이름 같은
  // 오류 메시지 문자열인데 메시지 문구는 계약이 아니라서 테스트가 검사하지 않는다. 로직은 이 목록의 파일이 가진다.
  mutate: [
    "src/internal/sampling.ts",
    "src/internal/uniform-int.ts",
    "src/internal/bytes.ts",
    "src/internal/encoding.ts",
    "src/secure/random-int.ts",
    "src/id/nanoid.ts",
    "src/id/random-id.ts",
    "src/id/uuid/format.ts",
    "src/id/uuid/v4.ts",
    "src/id/uuid/v7.ts",
    "src/id/cyclic.ts",
    "src/id/counter.ts",
    "src/core/seed.ts",
    "src/core/xoshiro128.ts",
    "src/secure/word-source.ts",
    "src/secure/secure-source.ts",
    "src/core/int.ts",
    "src/core/float.ts",
    "src/core/bool.ts",
    "src/core/sign.ts",
    "src/core/uniform.ts",
    "src/internal/weights.ts",
    "src/sampling/choice.ts",
    "src/sampling/shuffle-in-place.ts",
    "src/sampling/shuffle.ts",
    "src/sampling/sample.ts",
    "src/sampling/permutation.ts",
    "src/sampling/weighted-choice.ts",
    "src/sampling/weighted-sampler.ts",
    "src/state/random-state.ts",
  ],
  reporters: ["clear-text", "progress"],
  coverageAnalysis: "perTest",
  // 점수 하한. R1의 첫 측정은 대상 파일 전체에서 생존 mutant 0(100%)이었다(timeout도 검출로 센다).
  // 점수가 `break` 아래로 내려가면 `pnpm mutation`이 실패한다. 파일을 추가할 때 동치 mutant 때문에 필요하면 재검토한다.
  thresholds: { high: 100, low: 98, break: 95 },
  // 주의: mutate 대상 파일을 직접 커버하는 테스트는 `describe` 없이 최상위 `it`으로 쓴다.
  // 이 러너(Stryker 10.0.0 + vitest 5.0.1)는 mutant를 실행할 때 커버한 테스트 이름을 공백으로 이어 `-t` 패턴을 만드는데,
  // vitest 5는 `describe > it` 형태의 이름과 대조한다. 그래서 `describe` 안의 테스트는 한 건도 선택되지 않고
  // mutant가 전부 살아남은 것(mutant당 0개 실행, 점수 0%)으로 보고된다. 분류는 제목 접두어로 한다.
  // Stryker 코어는 샌드박스에 복사한 tsconfig.json의 경로를 다시 쓰려고 TypeScript JS API
  // (`ts.parseConfigFileTextToJson`)를 호출하는데, TypeScript 7(네이티브)에는 그 API가 없어 죽는다.
  // 샌드박스에 없는 경로를 지정하면 이 전처리를 건너뛴다. tsconfig를 쓰는 다른 Stryker 플러그인은 쓰지 않는다.
  tsconfigFile: ".stryker-tsconfig-unused.json",
};
