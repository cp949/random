import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runSizeConfigCheck } from "../check-size-config.mjs";

const tempDirs = [];

function makeRepo(files) {
  const root = mkdtempSync(join(tmpdir(), "sizeconfig-"));
  tempDirs.push(root);
  const all = {
    "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',
    ...files,
  };
  for (const [path, content] of Object.entries(all)) {
    if (content === null) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const exportsField = {
  ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
  "./secure": {
    types: "./dist/secure/index.d.ts",
    default: "./dist/secure/index.js",
  },
};

/** export가 있는 패키지. `config`는 `.size-limit.json` 내용(null이면 파일 없음). */
function libFiles({ config, manifest = {}, files = {} } = {}) {
  return {
    "packages/lib/package.json": JSON.stringify({
      name: "lib",
      version: "1.0.0",
      type: "module",
      exports: exportsField,
      ...manifest,
    }),
    "packages/lib/dist/index.js":
      "export const a = 1;\nexport function b() {}\n",
    "packages/lib/dist/secure/index.js": "export const c = 3;\n",
    "packages/lib/.size-limit.json":
      config === undefined
        ? null
        : config === null
          ? null
          : JSON.stringify(config),
    ...files,
  };
}

const entry = (path, name, extra = {}) => ({
  name,
  path,
  import: `{ ${name} }`,
  limit: "1 kB",
  ...extra,
});

const fullConfig = [
  entry("dist/index.js", "a"),
  entry("dist/index.js", "b"),
  entry("dist/secure/index.js", "c"),
];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("runSizeConfigCheck", () => {
  it("모든 값 export에 항목이 있으면 통과하고 열거한 export를 보고한다", async () => {
    const result = await runSizeConfigCheck(
      makeRepo(libFiles({ config: fullConfig })),
    );

    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.exports).toEqual([
      { package: "lib", path: "dist/index.js", name: "a" },
      { package: "lib", path: "dist/index.js", name: "b" },
      { package: "lib", path: "dist/secure/index.js", name: "c" },
    ]);
  });

  it("값 export가 없으면 설정 파일 없이도 통과한다(R0 상태)", async () => {
    const root = makeRepo({
      "packages/lib/package.json": JSON.stringify({
        name: "lib",
        type: "module",
        exports: {
          ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
        },
      }),
      "packages/lib/dist/index.js": "export {};\n",
    });

    const result = await runSizeConfigCheck(root);

    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.exports).toEqual([]);
  });

  it("값 export가 없고 빈 배열 설정이면 통과한다", async () => {
    const root = makeRepo({
      "packages/lib/package.json": JSON.stringify({
        name: "lib",
        type: "module",
        exports: {
          ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
        },
      }),
      "packages/lib/dist/index.js": "export {};\n",
      "packages/lib/.size-limit.json": "[]",
    });

    expect((await runSizeConfigCheck(root)).ok).toBe(true);
  });

  it("항목이 없는 export를 이름과 함께 보고한다", async () => {
    const root = makeRepo(
      libFiles({
        config: [
          entry("dist/index.js", "a"),
          entry("dist/secure/index.js", "c"),
        ],
      }),
    );

    const result = await runSizeConfigCheck(root);

    expect(result.ok).toBe(false);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain("b");
    expect(result.problems[0]).toContain("dist/index.js");
  });

  it("값 export가 있는데 설정 파일이 없으면 실패한다", async () => {
    const result = await runSizeConfigCheck(
      makeRepo(libFiles({ config: null })),
    );

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain(".size-limit.json가 없다");
    expect(result.problems.join("\n")).toContain("번들 한도 항목이 필요하다");
  });

  it("다른 subpath의 같은 이름 항목은 대신할 수 없다", async () => {
    const root = makeRepo(
      libFiles({
        config: [
          entry("dist/index.js", "a"),
          entry("dist/index.js", "b"),
          entry("dist/index.js", "c"),
        ],
      }),
    );

    const result = await runSizeConfigCheck(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("dist/secure/index.js");
  });

  it("import 표기가 `{ name }`이 아니면 항목으로 인정하지 않는다", async () => {
    const root = makeRepo(
      libFiles({
        config: [
          entry("dist/index.js", "a", { import: "{a}" }),
          entry("dist/index.js", "b"),
          entry("dist/secure/index.js", "c"),
        ],
      }),
    );

    const result = await runSizeConfigCheck(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("a");
  });

  it("경로 앞의 ./ 표기는 같은 경로로 본다", async () => {
    const root = makeRepo(
      libFiles({
        config: [
          entry("./dist/index.js", "a"),
          entry("./dist/index.js", "b"),
          entry("./dist/secure/index.js", "c"),
        ],
      }),
    );

    expect((await runSizeConfigCheck(root)).ok).toBe(true);
  });

  it("limit이 없는 항목은 한도를 검사하지 못하므로 실패한다", async () => {
    const root = makeRepo(
      libFiles({
        config: [
          entry("dist/index.js", "a", { limit: undefined }),
          entry("dist/index.js", "b"),
          entry("dist/secure/index.js", "c"),
        ],
      }),
    );

    const result = await runSizeConfigCheck(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("limit");
  });

  it("설정이 배열이 아니면 실패한다", async () => {
    const root = makeRepo(libFiles({ config: { a: 1 } }));

    const result = await runSizeConfigCheck(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("배열");
  });

  it("설정이 JSON이 아니면 실패한다", async () => {
    const root = makeRepo(
      libFiles({ config: [], files: { "packages/lib/.size-limit.json": "[" } }),
    );

    const result = await runSizeConfigCheck(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain(".size-limit.json");
  });

  it("dist가 없으면 조용히 통과하지 않고 실패한다", async () => {
    const root = makeRepo(
      libFiles({
        config: fullConfig,
        files: { "packages/lib/dist/index.js": null },
      }),
    );

    const result = await runSizeConfigCheck(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("dist/index.js");
  });

  it("배포 대상 패키지가 없으면 실패한다", async () => {
    const root = makeRepo({
      "packages/config/package.json": JSON.stringify({
        name: "config",
        private: true,
      }),
    });

    const result = await runSizeConfigCheck(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("배포 대상 패키지");
  });

  it("default 조건이 없는 export는 실패한다", async () => {
    const root = makeRepo(
      libFiles({
        config: fullConfig,
        manifest: { exports: { ".": { types: "./dist/index.d.ts" } } },
      }),
    );

    const result = await runSizeConfigCheck(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("default");
  });
});
