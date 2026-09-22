/**
 * ES2020 이후로 분류돼 es-x의 `restrict-to-es2019` 프리셋이 막지만, 특정 Chrome 버전부터 이미 지원되는 기능의 표.
 *
 * `since`는 MDN browser-compat-data(`@mdn/browser-compat-data` 8.1.2)의 Chrome 최초 정식 지원 버전이다
 * (플래그·접두사·부분 구현은 제외). `chromeFloor >= since`이면 게이트가 해당 규칙을 끈다.
 * floor를 올리거나 내리면 이 표에서 허용 규칙이 자동으로 바뀐다.
 *
 * 표에 없는 프리셋 규칙은 floor와 무관하게 항상 막는다(fail-closed). 다음이 그렇다: Iterator helper,
 * Set 메서드, RegExp 유니코드 속성 이스케이프(엔진의 ICU 버전에 따라 달라 단일 버전이 없다), import 속성,
 * JSON 모듈, Float16 등. 이 기능이 필요한 floor로 올릴 때 MDN에서 확인해 여기에 추가한다.
 *
 * geul의 출발점 8개는 모두 MDN과 일치했고, geul 목록에 없던 4개(클래스 필드·private 필드·hashbang)가
 * Chrome 75 이하 지원으로 확인돼 추가했다. tsc가 ES2019로 낮춘 dist에는 나타나지 않지만 floor 기준으로는 허용이 맞다.
 *
 * @type {{ rule: string, since: number, feature: string }[]}
 */
export const ESCOMPAT_RULES = [
  { rule: "es-x/no-dynamic-import", since: 63, feature: "import()" },
  { rule: "es-x/no-import-meta", since: 64, feature: "import.meta" },
  { rule: "es-x/no-bigint", since: 67, feature: "BigInt" },
  { rule: "es-x/no-global-this", since: 71, feature: "globalThis" },
  { rule: "es-x/no-export-ns-from", since: 72, feature: "export * as ns" },
  {
    rule: "es-x/no-class-instance-fields",
    since: 72,
    feature: "public instance class fields",
  },
  {
    rule: "es-x/no-class-static-fields",
    since: 72,
    feature: "static class fields",
  },
  {
    rule: "es-x/no-string-prototype-matchall",
    since: 73,
    feature: "String.prototype.matchAll",
  },
  { rule: "es-x/no-symbol-matchall", since: 73, feature: "Symbol.matchAll" },
  {
    rule: "es-x/no-class-private-fields",
    since: 74,
    feature: "private class fields",
  },
  { rule: "es-x/no-hashbang", since: 74, feature: "hashbang comments" },
  {
    rule: "es-x/no-numeric-separators",
    since: 75,
    feature: "numeric separators",
  },
  {
    rule: "es-x/no-promise-all-settled",
    since: 76,
    feature: "Promise.allSettled",
  },
  {
    rule: "es-x/no-nullish-coalescing-operators",
    since: 80,
    feature: "nullish coalescing (??)",
  },
  {
    rule: "es-x/no-optional-chaining",
    since: 80,
    feature: "optional chaining (?.)",
  },
  {
    rule: "es-x/no-class-private-methods",
    since: 84,
    feature: "private class methods",
  },
  {
    rule: "es-x/no-weakrefs",
    since: 84,
    feature: "WeakRef, FinalizationRegistry",
  },
  {
    rule: "es-x/no-logical-assignment-operators",
    since: 85,
    feature: "logical assignment (&&=, ||=, ??=)",
  },
  {
    rule: "es-x/no-promise-any",
    since: 85,
    feature: "Promise.any, AggregateError",
  },
  {
    rule: "es-x/no-string-prototype-replaceall",
    since: 85,
    feature: "String.prototype.replaceAll",
  },
  {
    rule: "es-x/no-arbitrary-module-namespace-names",
    since: 88,
    feature: "arbitrary module namespace names",
  },
  { rule: "es-x/no-top-level-await", since: 89, feature: "top-level await" },
  { rule: "es-x/no-regexp-d-flag", since: 90, feature: "RegExp d flag" },
  {
    rule: "es-x/no-array-prototype-at",
    since: 92,
    feature: "Array.prototype.at",
  },
  {
    rule: "es-x/no-string-prototype-at",
    since: 92,
    feature: "String.prototype.at",
  },
  { rule: "es-x/no-object-hasown", since: 93, feature: "Object.hasOwn" },
  { rule: "es-x/no-error-cause", since: 93, feature: "Error cause" },
  {
    rule: "es-x/no-class-static-block",
    since: 94,
    feature: "class static block",
  },
  {
    rule: "es-x/no-array-prototype-findlast-findlastindex",
    since: 97,
    feature: "Array.prototype.findLast, findLastIndex",
  },
  {
    rule: "es-x/no-array-prototype-toreversed",
    since: 110,
    feature: "Array.prototype.toReversed",
  },
  {
    rule: "es-x/no-array-prototype-tosorted",
    since: 110,
    feature: "Array.prototype.toSorted",
  },
  {
    rule: "es-x/no-array-prototype-tospliced",
    since: 110,
    feature: "Array.prototype.toSpliced",
  },
  {
    rule: "es-x/no-array-prototype-with",
    since: 110,
    feature: "Array.prototype.with",
  },
  { rule: "es-x/no-regexp-v-flag", since: 112, feature: "RegExp v flag" },
  { rule: "es-x/no-regexp-escape", since: 136, feature: "RegExp.escape" },
];

/**
 * `esTarget`(예: `"ES2019"`)에 대응하는 es-x 프리셋 이름.
 *
 * @param {string} esTarget
 */
export function presetName(esTarget) {
  return `flat/restrict-to-${esTarget.toLowerCase()}`;
}

/**
 * `chromeFloor`에서 이미 지원돼 게이트가 풀어야 하는 규칙을 `"off"` 설정으로 돌려준다.
 *
 * @param {number} chromeFloor
 * @returns {Record<string, "off">}
 */
export function rulesAllowedAt(chromeFloor) {
  return Object.fromEntries(
    ESCOMPAT_RULES.filter((entry) => entry.since <= chromeFloor).map(
      (entry) => [entry.rule, "off"],
    ),
  );
}
