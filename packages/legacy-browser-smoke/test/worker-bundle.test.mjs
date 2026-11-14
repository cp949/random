/**
 * Worker 번들의 별칭 구성(`src/worker-bundle.mjs`)을 다룬다. 번들 자체는 `pnpm smoke:legacy-browser`가 실행한다.
 */
import { describe, expect, it } from "vitest";
import { buildWorkerAliases } from "../src/worker-bundle.mjs";

const manifest = {
  name: "@cp949/random",
  exports: {
    ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
    "./secure": { default: "./dist/secure/index.js" },
    "./id": "./dist/id/index.js",
  },
};

/** 별칭 목록에서 import 구문 문자열이 가리키는 파일을 찾는다. */
function resolveSpecifier(aliases, specifier) {
  const hit = aliases.find((alias) => alias.find.test(specifier));
  return hit?.replacement;
}

describe("buildWorkerAliases", () => {
  const aliases = buildWorkerAliases("/pkg", manifest);

  it("exports 키마다 패키지명 기준 별칭을 만든다", () => {
    expect(resolveSpecifier(aliases, "@cp949/random")).toBe(
      "/pkg/dist/index.js",
    );
    expect(resolveSpecifier(aliases, "@cp949/random/secure")).toBe(
      "/pkg/dist/secure/index.js",
    );
  });

  it("exports 값이 문자열이어도 경로로 쓴다", () => {
    expect(resolveSpecifier(aliases, "@cp949/random/id")).toBe(
      "/pkg/dist/id/index.js",
    );
  });

  it("루트 별칭이 subpath를 삼키지 않는다", () => {
    const rootOnly = aliases.filter((alias) =>
      alias.find.test("@cp949/random"),
    );

    expect(rootOnly).toHaveLength(1);
    expect(resolveSpecifier(aliases, "@cp949/random/state")).toBeUndefined();
  });
});
