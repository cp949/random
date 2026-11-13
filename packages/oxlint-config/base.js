import { fileURLToPath } from "node:url";

/** `no-restricted-syntax` 대체 플러그인(`plugins/restricted-syntax.js`). 규칙 ID는 `repo/no-restricted-syntax`. */
export const restrictedSyntaxPlugin = fileURLToPath(
  new URL("./plugins/restricted-syntax.js", import.meta.url),
);

/**
 * typescript-eslint `recommendedTypeChecked`에 해당하는 타입 인식 규칙 중 oxlint가 구현한 것.
 * `options.typeAware`를 켠 설정에서만 실행된다(oxlint-tsgolint 필요).
 *
 * @type {Record<string, "error">}
 */
export const typeAwareRules = Object.fromEntries(
  [
    "await-thenable",
    "no-array-delete",
    "no-base-to-string",
    "no-duplicate-type-constituents",
    "no-floating-promises",
    "no-for-in-array",
    "no-implied-eval",
    "no-misused-promises",
    "no-redundant-type-constituents",
    "no-unnecessary-type-assertion",
    "no-unsafe-argument",
    "no-unsafe-assignment",
    "no-unsafe-call",
    "no-unsafe-enum-comparison",
    "no-unsafe-member-access",
    "no-unsafe-return",
    "no-unsafe-unary-minus",
    "only-throw-error",
    "prefer-promise-reject-errors",
    "require-await",
    "restrict-plus-operands",
    "restrict-template-expressions",
    "unbound-method",
  ].map((name) => [`typescript/${name}`, "error"]),
);

/**
 * 저장소 공통 oxlint 설정.
 *
 * - 경고도 실패로 다루려고 모든 규칙을 `error`로 둔다(실행 스크립트는 `--deny-warnings`를 함께 쓴다).
 * - TS 파일의 미사용·미정의 이름은 컴파일러(`noUnusedLocals`, `noUnusedParameters`)가 검사한다.
 *
 * @param {{ typeAware?: boolean }} [options]
 * @returns {import("oxlint").OxlintConfig}
 */
export const createBaseConfig = ({ typeAware = false } = {}) => ({
  // 기존 ESLint 구성(js recommended, typescript-eslint recommendedTypeChecked)과 같은 범위를 유지하려고
  // unicorn 플러그인은 켜지 않는다.
  plugins: ["eslint", "typescript", "oxc"],
  categories: { correctness: "error" },
  options: { typeAware, denyWarnings: true },
  rules: {
    "no-undef": "error",
    ...(typeAware
      ? {
          ...typeAwareRules,
          // oxlint의 correctness에 들어 있지만 recommendedTypeChecked에는 없던 규칙이다.
          // 문자열 배열의 기본 정렬과 문자열 전개는 이 저장소 테스트가 의도해서 쓴다.
          "typescript/require-array-sort-compare": "off",
          "typescript/no-misused-spread": "off",
        }
      : {}),
  },
  ignorePatterns: ["dist/**"],
});
