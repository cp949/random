# 0001 tsdown 빌드 마이그레이션

- 상태: 채택 (2026-09-22)
- 관련 단계: 없음(브레인스토밍 단독 확정 작업, `docs/product/roadmap.md`의 R0~R9 어디에도 속하지
  않음)
- 대상: `packages/random`(`@cp949/random`)의 `build` 스크립트만. 다른 패키지·앱은 범위 밖.

## 배경

`packages/random`의 `build`는 현재 `tsc`가 `src/**`를 파일 단위로 그대로 `dist/**`에 컴파일한다
(번들 없음). 이를 tsdown(rolldown 기반 번들러)으로 바꾼다. 저장소는 TypeScript 6.0.3과
typescript-eslint를 쓴다.

## 제약(변경 불가, 기존 계약)

- `package.json`의 `exports` 4개, 1:1 대응 소스: `src/index.ts`(`.`), `src/secure/index.ts`
  (`./secure`), `src/id/index.ts`(`./id`), `src/state/index.ts`(`./state`). **`exports` 필드
  자체는 변경하지 않는다.**
- 런타임 의존성 0(`check:deps`), Chrome 75(ES2019) 문법 상한(`check:escompat`,
  `baseline.json`의 `esTarget`), DOM·Node 전역 금지, `root`(`.`) leaf가 `./state`·`./secure`·
  `./id` 코드를 끌어오지 않는 subpath 격리(`check:root-isolation`).
- `pnpm verify`의 게이트 순서(`package.json` `scripts.verify`)는 변경하지 않는다.
- 커밋 메시지·산출물에 생성 도구 언급(`Generated with`, `Co-Authored-By` 등)을 넣지 않는다
  (rubber-workflow 규약).

## 조사 결과 — tsdown(0.23.0) 관련 사실

- `platform` 기본값은 `node`다. 브라우저/유니버설 라이브러리에 그대로 두면 Node 전용 헬퍼(예:
  `require`/`process` 참조)가 산출물에 섞여 들어갈 위험이 있어 `check:escompat`의
  `restrictedRules`(no-restricted-globals: Buffer/process/require 등)를 위반할 수 있다.
  `platform: "neutral"`로 명시해야 한다.
- `target`은 `"es2019"` 같은 소문자 ECMAScript 버전 문자열을 받는다. 기본값은
  `package.json`의 `engines.node`에서 파생되는데, `packages/random/package.json`에는
  `engines` 필드가 없어 기본값이 "변환 없음"(`target: false`와 동일)이 된다. **명시하지
  않으면 ES2019 문법 상한이 깨진다.** `baseline.json`의 `esTarget`(`scripts/baseline.mjs`의
  `loadBaseline()`)에서 파생시켜 단일 출처를 지킨다.
- `sourcemap` 기본값은 `false`다. `check:pack`이 `*.map` 파일을 배포 금지 목록으로 막으므로
  기본값을 유지하되 설정에 명시해 의도를 남긴다.
- `dts`는 `package.json`의 `exports`에 `types` 조건이 있으면 자동 활성화되지만, 명시적으로
  `true`를 적어 의도를 드러낸다.
- `clean` 기본값은 `true`(빌드 전 `outDir` 삭제) — 현재 `build` 스크립트의 수동
  `rm dist` 스텝을 제거할 수 있다.
- **code splitting은 항상 켜져 있고 문서화된 `splitting: false`로는 끌 수 없다**
  (`rolldown/tsdown#760`, 알려진 버그로 보고됨). 4개 entry가 내부 모듈(`core/*`, `internal/*`
  등)을 공유하면 해시 이름의 공유 chunk 파일(`dist/chunk-*.js`)이 자동 생성되고 여러 entry가
  이를 relative import로 참조한다. `outputOptions.codeSplitting.type = "disabled"`로 강제하는
  비공식 우회가 있으나(GitHub 이슈에서만 확인, tsdown 공식 문서에 없음) 쓰지 않는다 — 이미
  "silently ignored" 버그가 보고된 표면에 기대는 대신, 기본 동작을 받는다(사용자 승인,
  아래 "결정" 참고).

## 결정

### tsdown 설정(`packages/random/tsdown.config.ts`, 신규 파일)

```ts
import { defineConfig } from "tsdown";
import { loadBaseline } from "../../scripts/baseline.mjs";

const { esTarget } = loadBaseline();

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "secure/index": "src/secure/index.ts",
    "id/index": "src/id/index.ts",
    "state/index": "src/state/index.ts",
  },
  outDir: "dist",
  format: "esm",
  platform: "neutral",
  target: esTarget.toLowerCase(),
  dts: true,
  sourcemap: false,
});
```

entry 키가 그대로 출력 경로가 돼 `dist/index.js`, `dist/secure/index.js`,
`dist/id/index.js`, `dist/state/index.js`를 만든다 — 현재 `exports` 대상과 1:1 유지.
tsconfig는 `packages/random/tsconfig.json`을 자동 탐색해 쓴다(명시 불필요).

### `packages/random/package.json`

```diff
- "build": "node -e \"require('node:fs').rmSync('dist',{recursive:true,force:true})\" && tsc",
+ "build": "tsdown",
```

`devDependencies`에 `"tsdown": "0.23.0"`(exact pin, 저장소 관례) 추가. root
`package.json`에는 추가하지 않는다 — tsdown은 `packages/random`의 `build` 스크립트에서만
실행되고 root 스크립트는 실행 후 dist만 소비한다.

### `scripts/check-baseline.mjs` 확장

이 스크립트는 `esTarget`을 하드코딩 대신 `baseline.json`에서 파생시켜야 하는 소비자 목록
(`packages/typescript-config/library.json`, `apps/demo/vite.config.ts`,
`packages/legacy-browser-smoke/src/run.mjs`)을 강제한다. `packages/random/tsdown.config.ts`를
이 목록에 추가한다 — `../../scripts/baseline.mjs`를 import하는지 검사(기존 smoke runner
검사와 같은 패턴). 로드맵 "호환 기준선 갱신" 절차(`docs/product/roadmap.md` 5절)와의 일치를
위한 것 — floor 값이 바뀔 때 tsdown 설정이 조용히 안 따라가는 회귀를 막는다. 대응하는
`scripts/test/check-baseline.test.mjs`도 새 검사 케이스를 반영해야 한다.

### code splitting 기본 동작 수용 vs. 비공식 우회로 비활성화

기본 동작을 받기로 사용자 승인(2026-09-22). 근거: `pnpm verify`의 모든 게이트가 dist 파일
목록을 열거하지 않고 `package.json`의 `exports` target 경로만 신뢰하도록 이미 설계돼 있어,
이미 "silently ignored" 버그가 보고된 비공식 옵션(`outputOptions.codeSplitting.type:
"disabled"`)에 기대 "예전 dist 모양"을 흉내낼 이유가 없다. 틀렸을 때 비용: 공유 chunk
파일이 실제로 어느 게이트를 깨면(예: `check:pack`의 tarball 크기 상한 초과) DELTA 안에서
상한을 실측 근거로 올리거나, 필요 시 이 결정을 재검토한다.

## 영향받지 않는 것

- `package.json`의 `exports` 필드(변경 없음).
- `check-types`(`tsc --noEmit`, `src`를 직접 대상), `test`(vitest, `src`를 직접 import) —
  둘 다 빌드 산출물이 아니라 소스를 대상으로 해 build 도구 교체와 무관.
- `check:no-dom`(`fixtures/dom-usage`를 tsc로 직접 컴파일, dist 무관).
- `check:deps`(`package.json` 필드 검사).
- `check:root-isolation`(dist를 Vite로 재번들해 검사하는 별도 절차 — tsdown이 만든 공유
  chunk 파일 존재 여부와 무관하게 동작).
- `check:consumer`(tarball을 npm install로 소비 — 파일 구조 무관).
- `turbo.json`의 `build` task(`outputs: ["dist/**"]`) — 변경 없음.

## 실측 후 조정이 필요할 수 있는 항목(구현 중 확인)

- `packages/random/.size-limit.json`의 개별 `limit` 수치 — 내부 코드 공유 방식이 파일당
  tsc 출력에서 entry당 tsdown 번들(+ 공유 chunk)로 바뀌므로 export별 실측 바이트가
  달라질 수 있다.
- `scripts/check-pack.mjs`의 `MAX_TARBALL_BYTES`(현재 108,000B) — 공유 chunk 파일이 tarball에
  추가되면 총 크기가 늘 수 있다. 실제로 상한을 넘을 때만 올린다(추측 조정 금지).

두 수치는 DELTA 완료 기준의 "실제 게이트 통과"로 검증하고, 필요할 때만 문서화된 근거(측정
시점, 새 크기)를 남기고 올린다 — `check-pack.mjs`의 기존 주석 패턴을 따른다.

## 완료 기준

- `pnpm --filter @cp949/random build`가 tsdown으로 4개 entry(`dist/index.js`,
  `dist/secure/index.js`, `dist/id/index.js`, `dist/state/index.js`)와 대응 `.d.ts`를 만든다.
- `pnpm verify` 전체가 통과한다(위 실측 조정 항목 반영 후).
- `check-baseline`이 `packages/random/tsdown.config.ts`의 `baseline.mjs` import를 검사하고
  통과한다.
