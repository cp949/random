import { createBaseConfig, restrictedSyntaxPlugin } from "./base.js";

const environmentMessage =
  "Chrome 75 라이브러리 소스에서 쓸 수 없는 DOM·Node 전역이다";

/** 소스에서 이름으로 참조할 수 없는 전역. 브라우저·Node 전역과 Chrome 75에 없는 API다. */
const restrictedGlobals = [
  "window",
  "document",
  "navigator",
  "self",
  "Buffer",
  "process",
  "require",
].map((name) => ({ name, message: environmentMessage }));
restrictedGlobals.push(
  {
    name: "structuredClone",
    message: "Chrome 98+ API라서 Chrome 75 하한에서 쓸 수 없다",
  },
  {
    name: "crypto",
    message:
      "`crypto`를 이름으로 참조하지 말고 `globalThis.crypto`를 호출 시점에 조회한다",
  },
);

const mathRandom = {
  object: "Math",
  property: "random",
  message: "Math.random은 패키지 어디에서도 호출하지 않는다",
};

/** `Math`를 통해 random에 우회 접근하는 형태와 계산된 동적 import를 막는 선택자. */
const restrictedSyntax = [
  {
    selector: "MemberExpression[object.name='Math'][computed=true]",
    message: "Math의 계산된 속성 접근은 금지한다(Math.random을 우회할 수 있다)",
  },
  {
    selector: "VariableDeclarator[init.name='Math']",
    message: "Math를 다른 변수에 담거나 구조 분해하지 않는다",
  },
  {
    selector: "AssignmentExpression[right.name='Math']",
    message: "Math를 다른 변수에 재할당하지 않는다",
  },
  {
    selector: "ImportExpression[source.type!='Literal']",
    message: "계산된 동적 import는 금지한다(런타임 의존성 0)",
  },
  {
    selector: "ImportExpression[source.value=/^[^./]/]",
    message: "외부 패키지의 동적 import는 금지한다(런타임 의존성 0)",
  },
];

/**
 * 라이브러리 코드의 환경 제한 규칙. 소스(`createLibraryConfig`)와 배포물 게이트(`scripts/check-escompat.mjs`)가
 * 같은 규칙을 쓰도록 export한다. `repo/no-restricted-syntax`는 `restrictedSyntaxPlugin`이 제공하므로
 * 이 규칙을 쓰는 설정은 `jsPlugins`에 그 플러그인을 넣어야 한다.
 *
 * @type {import("oxlint").OxlintConfig["rules"]}
 */
export const restrictedRules = {
  "no-restricted-globals": ["error", ...restrictedGlobals],
  "no-restricted-properties": [
    "error",
    mathRandom,
    {
      property: "randomUUID",
      message: "randomUUID는 Chrome 92+ API라서 사용하지 않는다",
    },
    {
      property: "subtle",
      message: "SubtleCrypto는 이 라이브러리의 범위 밖이다",
    },
  ],
  "repo/no-restricted-syntax": ["error", restrictedSyntax],
  // 상대 경로가 아닌 모든 import(패키지, `node:*`)를 막아 런타임 의존성 0을 소스에서 강제한다.
  "no-restricted-imports": [
    "error",
    {
      patterns: [
        {
          regex: "^[^./]",
          message: "상대 경로가 아닌 import는 금지한다(런타임 의존성 0)",
        },
      ],
    },
  ],
};

/**
 * `getCryptoCapabilities`가 있는 파일에 적용하는 규칙. 환경 진단 전용이라 randomUUID·subtle 참조만 허용하고
 * `Math.random`은 여기서도 금지한다.
 *
 * @type {import("oxlint").OxlintConfig["rules"]}
 */
export const capabilitiesRestrictedRules = {
  "no-restricted-properties": ["error", mathRandom],
};

/**
 * 브라우저 라이브러리(`@cp949/random`)용 oxlint 설정.
 * `src/**`는 DOM·Node 전역 없이 ES 내장 전역만 쓰고, 런타임 의존성이 없어야 한다.
 *
 * 타입 인식 규칙은 `oxlint-tsgolint`가 패키지의 `tsconfig.json`(src)과 `tsconfig.test.json`(src+test)을
 * 각각 찾는다.
 *
 * `typeAware`는 규칙 단위 테스트(`scripts/test/lint-rules.test.mjs`)가 tsconfig 없이 임시 파일을 검사하려고 끈다.
 *
 * @param {{ typeAware?: boolean }} [options]
 * @returns {import("oxlint").OxlintConfig}
 */
export const createLibraryConfig = ({ typeAware = true } = {}) => {
  const base = createBaseConfig({ typeAware });
  return {
    ...base,
    jsPlugins: [...base.jsPlugins, restrictedSyntaxPlugin],
    overrides: [
      {
        files: ["src/**/*.{ts,mts,cts,js,mjs,cjs}"],
        rules: restrictedRules,
      },
      {
        files: ["src/secure/capabilities.ts"],
        rules: capabilitiesRestrictedRules,
      },
      {
        files: ["test/**/*.{ts,mts,cts,js,mjs,cjs}"],
        env: { node: true },
      },
      {
        // lib.dom.d.ts의 Crypto.getRandomValues는 method-shorthand 타입이라 분리 참조가 항상 걸린다.
        // 이 파일은 분리 호출이 실제로 Illegal invocation을 던지는 네이티브 동작을 검증하는 게 목적이라
        // (globalThis.crypto가 아닌 우리 타입이 아니므로 인터페이스를 고칠 수 없다) 규칙을 끈다.
        files: ["test/crypto-stub.test.ts"],
        rules: { "typescript/unbound-method": "off" },
      },
    ],
  };
};
