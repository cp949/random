/**
 * oxlint JS 플러그인: ESLint 코어의 `no-restricted-syntax`와 같은 방식으로 AST 선택자를 금지한다.
 *
 * oxlint는 `no-restricted-syntax`를 네이티브로 제공하지 않아 이 저장소가 쓰는 선택자 규칙만 직접 구현한다.
 * 옵션은 `[{ selector, message }]` 배열 하나를 받는다(oxlint의 JS 플러그인 옵션 검증이 인자를 1개로 제한한다).
 *
 * @type {import("oxlint/plugins").Plugin}
 */
export default {
  meta: { name: "repo" },
  rules: {
    "no-restricted-syntax": {
      meta: {
        schema: [
          {
            type: "array",
            items: {
              type: "object",
              properties: {
                selector: { type: "string" },
                message: { type: "string" },
              },
              required: ["selector", "message"],
              additionalProperties: false,
            },
          },
        ],
      },
      create(context) {
        const visitor = {};
        for (const { selector, message } of context.options[0] ?? []) {
          visitor[selector] = (node) => context.report({ node, message });
        }
        return visitor;
      },
    },
  },
};
