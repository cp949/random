# 호환성 매트릭스

공식 보증과 실측 증거를 분리해 기록한다. 0.1.0 이후 릴리스마다 실측 표의 행을 갱신한다(갱신 절차 참고).

## 1. 공식 floor

Chrome(Blink) 75 이상을 보증한다. Firefox·Safari는 보증하지 않는다.

근거: `baseline.json`의 `chromeFloor`, 정적 게이트(`pnpm check:escompat`, `pnpm check:no-dom`), `packages/typescript-config/library.json`의 `target`/`lib`.

## 2. 실측 표

| 대상                 | 버전          | 엔진     | OS        | 실행 방식                                    | 실행일     | 결과 | 근거 명령                   |
| -------------------- | ------------- | -------- | --------- | -------------------------------------------- | ---------- | ---- | --------------------------- |
| Chromium floor 빌드  | 75.0.3765.0   | Blink/V8 | Linux x64 | Docker 컨테이너, headless                    | 2026-09-21 | PASS | `pnpm smoke:legacy-browser` |
| Google Chrome 현재   | 152.0.7977.64 | Blink/V8 | Linux x64 | 로컬 설치본, headless                        | 2026-09-21 | PASS | `pnpm smoke:local-browser`  |
| TypeScript 하한 lane | 5.7.3         | —        | Linux x64 | `check:consumer`(NodeNext·Bundler)           | 2026-09-22 | PASS | `pnpm check:consumer`       |
| TypeScript 저장소    | 6.0.3         | —        | Linux x64 | 같음                                         | 2026-09-22 | PASS | `pnpm check:consumer`       |
| Node                 | 24.20.0       | V8       | Linux x64 | 단위·게이트 테스트 실행 환경(보증 대상 아님) | 2026-09-22 | PASS | `pnpm verify`               |

## 3. 보증하지 않는 것

- Firefox, Safari.
- Node 런타임(테스트·게이트 실행 환경일 뿐, 소비자 런타임이 아니다).
- `node10` 모듈 해석, webpack 4.

## 4. 검증 한계

- OS 1종(Linux x64)만 실측했다.
- 엔진은 Blink만 실측했다(Firefox의 Gecko, Safari의 WebKit 없음).
- 표본은 빌드 2개(floor·현재) × 실행 1회다.
- 실행은 모두 headless다.
- 컨테이너 실행은 sandbox를 해제한다(`--no-sandbox`, user namespace 부재).
- 통계·mutation 테스트는 Node에서만 돈다(실브라우저에서 통계 검증은 하지 않는다).
- 실행일 이후 나온 브라우저 갱신은 이 표에 반영돼 있지 않다.
- Podman은 검증하지 않았다(Docker만 고정).

## 5. 갱신 절차

호환 기준선(`baseline.json`)을 갱신하는 절차는 로드맵 `docs/product/roadmap.md` §5를 따른다. 실측 값은 `pnpm smoke:legacy-browser`·`pnpm smoke:local-browser`의 runner 요약 줄(예: `smoke: target=container chrome=75.0.3765.0 platform=Linux_x64 os=Linux x86_64 headless=true date=2026-09-21 assertions=13/13 result=PASS`)에서 이 표로 손으로 옮긴다. 생성 파일을 커밋하지 않는다.
