import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runSize } from "../size.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const SLOW = 120_000;

const tempDirs = [];

/**
 * size-limit이 플러그인을 저장소의 node_modules에서 찾도록 저장소 안 `_tmp`에 임시 저장소를 만든다.
 * `config`가 undefined면 `.size-limit.json`을 만들지 않는다.
 */
function makeRepo({ config, dist } = {}) {
  mkdirSync(join(repoRoot, "_tmp"), { recursive: true });
  const root = mkdtempSync(join(repoRoot, "_tmp", "size-"));
  tempDirs.push(root);
  const files = {
    "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',
    "packages/lib/package.json": JSON.stringify({
      name: "lib",
      version: "1.0.0",
      type: "module",
    }),
    "packages/lib/dist/index.js":
      dist ??
      'export const a = "x".repeat(100);\nexport function b(n) { return n * 2; }\n',
  };
  if (config !== undefined) {
    files["packages/lib/.size-limit.json"] = JSON.stringify(config);
  }
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const entry = (name, limit) => ({
  name,
  path: "dist/index.js",
  import: `{ ${name} }`,
  limit,
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("runSize", () => {
  it("항목이 없는 패키지는 size-limit을 실행하지 않고 건너뛴다(빈 설정은 size-limit 자체가 오류)", () => {
    const result = runSize(makeRepo({ config: [] }));

    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.skipped).toEqual(["lib"]);
    expect(result.measured).toEqual([]);
  });

  it("설정 파일이 없는 패키지도 건너뛴다(존재 여부는 check:size-config가 강제한다)", () => {
    const result = runSize(makeRepo());

    expect(result.ok).toBe(true);
    expect(result.skipped).toEqual(["lib"]);
  });

  it(
    "한도 안의 항목은 통과하고 측정한 패키지를 보고한다",
    () => {
      const result = runSize(
        makeRepo({ config: [entry("a", "1 kB"), entry("b", "1 kB")] }),
      );

      expect(result.problems).toEqual([]);
      expect(result.ok).toBe(true);
      expect(result.measured).toEqual(["lib"]);
    },
    SLOW,
  );

  it(
    "한도를 넘으면 실패하고 초과한 항목을 알린다",
    () => {
      const result = runSize(
        makeRepo({ config: [entry("a", "1 kB"), entry("b", "5 B")] }),
      );

      expect(result.ok).toBe(false);
      expect(result.problems.join("\n")).toContain("lib");
      expect(result.problems.join("\n")).toContain("exceeded");
    },
    SLOW,
  );

  it(
    "이미 없어진 export를 가리키는 낡은 항목은 실패한다",
    () => {
      const result = runSize(
        makeRepo({ config: [entry("a", "1 kB"), entry("removed", "1 kB")] }),
      );

      expect(result.ok).toBe(false);
      expect(result.problems.join("\n")).toContain("lib");
    },
    SLOW,
  );

  it("배포 대상 패키지가 없으면 실패한다", () => {
    mkdirSync(join(repoRoot, "_tmp"), { recursive: true });
    const root = mkdtempSync(join(repoRoot, "_tmp", "size-"));
    tempDirs.push(root);
    writeFileSync(
      join(root, "pnpm-workspace.yaml"),
      'packages:\n  - "packages/*"\n',
    );
    mkdirSync(join(root, "packages/config"), { recursive: true });
    writeFileSync(
      join(root, "packages/config/package.json"),
      JSON.stringify({ name: "config", private: true }),
    );

    const result = runSize(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("배포 대상 패키지");
  });
});
