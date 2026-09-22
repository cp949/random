import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  entryScript,
  ISOLATION_RULES,
  runRootIsolationCheck,
} from "../check-root-isolation.mjs";
import { listPublishablePackages } from "../workspace-packages.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const SLOW = 120_000;

const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** 경로→내용 맵으로 합성 저장소를 만든다. */
function makeRepo({ root, secure, exportsField, rules }) {
  mkdirSync(join(repoRoot, "_tmp"), { recursive: true });
  const dir = mkdtempSync(join(repoRoot, "_tmp", "root-isolation-test-"));
  tempDirs.push(dir);
  const files = {
    "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',
    "packages/lib/package.json": JSON.stringify({
      name: "lib",
      version: "1.0.0",
      type: "module",
      exports: exportsField ?? {
        ".": { default: "./dist/index.js" },
        "./secure": { default: "./dist/secure/index.js" },
      },
    }),
    "packages/lib/dist/index.js": root,
    "packages/lib/dist/secure/index.js": secure,
  };
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return { dir, rules };
}

const LEAF = "export function int(n) {\n  return n * 2;\n}\n";
const SECURE =
  "export function bytes() {\n  return globalThis.crypto.getRandomValues(new Uint8Array(4));\n}\n";
const LEAKING_ROOT =
  'import { bytes } from "./secure/index.js";\nexport function int() {\n  return bytes()[0];\n}\n';
const RULES = {
  lib: {
    ".": { forbidden: ["getRandomValues"] },
    "./secure": { required: ["getRandomValues"] },
  },
};

describe("runRootIsolationCheck", () => {
  it(
    "root가 leaf만 export하면 통과하고 entry마다 번들 하나를 보고한다",
    async () => {
      const { dir, rules } = makeRepo({
        root: LEAF,
        secure: SECURE,
        rules: RULES,
      });

      const result = await runRootIsolationCheck(dir, { rules });

      expect(result.ok).toBe(true);
      expect(result.bundled.map((b) => b.entry).sort()).toEqual([
        ".",
        "./secure",
      ]);
    },
    SLOW,
  );

  it(
    "root가 crypto 코드를 끌어오면 금지 표식으로 실패한다",
    async () => {
      const { dir, rules } = makeRepo({
        root: LEAKING_ROOT,
        secure: SECURE,
        rules: RULES,
      });

      const result = await runRootIsolationCheck(dir, { rules });

      expect(result.ok).toBe(false);
      const problems = result.problems.join("\n");
      expect(problems).toContain("금지 표식 getRandomValues");
      expect(problems).toContain("exports[.]");
    },
    SLOW,
  );

  it(
    "subpath 번들에 필수 표식이 없으면 실패한다(표식 이름 변경 감지)",
    async () => {
      const { dir, rules } = makeRepo({
        root: LEAF,
        secure: LEAF,
        rules: RULES,
      });

      const result = await runRootIsolationCheck(dir, { rules });

      expect(result.ok).toBe(false);
      expect(result.problems.join("\n")).toContain("필수 표식 getRandomValues");
    },
    SLOW,
  );

  it(
    "규칙이 없는 entry는 실패한다",
    async () => {
      const { dir, rules } = makeRepo({
        root: LEAF,
        secure: SECURE,
        rules: { lib: { ".": RULES.lib["."] } },
      });

      const result = await runRootIsolationCheck(dir, { rules });

      expect(result.ok).toBe(false);
      expect(result.problems.join("\n")).toContain("격리 규칙이 없다");
    },
    SLOW,
  );

  it(
    "exports에 없는 entry의 규칙은 실패한다(낡은 규칙)",
    async () => {
      const { dir, rules } = makeRepo({
        root: LEAF,
        secure: SECURE,
        rules: { lib: { ...RULES.lib, "./nope": { forbidden: [] } } },
      });

      const result = await runRootIsolationCheck(dir, { rules });

      expect(result.ok).toBe(false);
      expect(result.problems.join("\n")).toContain("낡은 규칙");
    },
    SLOW,
  );

  it("dist가 없으면 실패한다", async () => {
    const { dir, rules } = makeRepo({
      root: LEAF,
      secure: SECURE,
      rules: RULES,
    });
    rmSync(join(dir, "packages/lib/dist/index.js"), { force: true });

    const result = await runRootIsolationCheck(dir, { rules });

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("pnpm build");
  });

  it("배포 대상 패키지가 없으면 실패한다", async () => {
    mkdirSync(join(repoRoot, "_tmp"), { recursive: true });
    const dir = mkdtempSync(join(repoRoot, "_tmp", "root-isolation-test-"));
    tempDirs.push(dir);
    writeFileSync(
      join(dir, "pnpm-workspace.yaml"),
      'packages:\n  - "packages/*"\n',
    );
    mkdirSync(join(dir, "packages/config"), { recursive: true });
    writeFileSync(
      join(dir, "packages/config/package.json"),
      JSON.stringify({ name: "config", private: true }),
    );

    const result = await runRootIsolationCheck(dir, { rules: {} });

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("배포 대상 패키지");
  });
});

describe("entryScript", () => {
  it("import와 console.log를 만든다", () => {
    const code = entryScript("/x/dist/index.js", ["a", "b"]);

    expect(code).toContain('import { a, b } from "file:///x/dist/index.js";');
    expect(code).toContain("console.log(a, b);");
  });
});

describe("실제 저장소 규칙", () => {
  it("ISOLATION_RULES의 키가 exports 키 집합과 같다", () => {
    const [pkg] = listPublishablePackages(repoRoot).filter(
      (candidate) => candidate.name === "@cp949/random",
    );

    expect(pkg).toBeDefined();
    const exportKeys = Object.keys(pkg.packageJson.exports ?? {}).sort();
    const ruleKeys = Object.keys(ISOLATION_RULES["@cp949/random"]).sort();

    expect(ruleKeys).toEqual(exportKeys);
  });
});
