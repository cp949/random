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
  // mutate 대상 파일을 직접 커버하는 기존 테스트는 `describe` 없이 최상위 `it`으로 쓰여 있다(TRP-004).
  // Stryker 10.0.0 + vitest 5.0.1에서는 러너가 테스트 이름을 공백으로 이어 `-t` 패턴을 만들어 `describe > it` 이름과
  // 맞지 않았고, `describe` 안의 테스트가 선택되지 않아 점수가 0%로 나왔다. vitest-runner 10.1.1부터는 vitest 5 이상에서
  // ` > `로 이어 패턴을 만들어 `describe` 안의 테스트도 선택된다. 이 동작은 `scripts/test/stryker.test.mjs`가 감시한다.
  // Stryker 코어는 샌드박스에 복사한 tsconfig.json의 경로를 다시 쓰려고 TypeScript JS API
  // (`ts.parseConfigFileTextToJson`)를 호출한다. 저장소 TypeScript(현재 6.0.3)에는 이 API가 있지만
  // TypeScript 7(네이티브)에는 없어 그대로 두면 죽는다. 샌드박스에 없는 경로를 지정해 이 전처리를 건너뛴다.
  // tsconfig를 쓰는 다른 Stryker 플러그인은 쓰지 않는다.
  tsconfigFile: ".stryker-tsconfig-unused.json",
};
