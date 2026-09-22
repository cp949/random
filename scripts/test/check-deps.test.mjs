import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { findRuntimeDependencies, runDepsCheck } from "../check-deps.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

describe("findRuntimeDependencies", () => {
  it("의존성 필드가 없거나 비어 있으면 아무것도 찾지 않는다", () => {
    expect(findRuntimeDependencies({})).toEqual([]);
    expect(
      findRuntimeDependencies({
        dependencies: {},
        peerDependencies: {},
        optionalDependencies: {},
        bundledDependencies: [],
        bundleDependencies: [],
      }),
    ).toEqual([]);
  });

  it("devDependencies는 허용한다", () => {
    expect(
      findRuntimeDependencies({ devDependencies: { vitest: "5.0.1" } }),
    ).toEqual([]);
  });

  it.each([
    ["dependencies", { left: "1.0.0" }],
    ["peerDependencies", { react: "^18" }],
    ["optionalDependencies", { fsevents: "2.0.0" }],
    ["bundledDependencies", ["left"]],
    ["bundleDependencies", ["left"]],
  ])("%s가 비어 있지 않으면 찾는다", (field, value) => {
    const found = findRuntimeDependencies({ [field]: value });

    expect(found).toEqual([{ field, names: expect.any(Array) }]);
    expect(found[0].names.length).toBeGreaterThan(0);
  });

  it("bundledDependencies가 true(전부 번들)이면 찾는다", () => {
    expect(findRuntimeDependencies({ bundledDependencies: true })).toEqual([
      { field: "bundledDependencies", names: ["(전부)"] },
    ]);
  });
});

const tempDirs = [];

function makeRepo(files) {
  const root = mkdtempSync(join(tmpdir(), "deps-"));
  tempDirs.push(root);
  const all = {
    "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',
    ...files,
  };
  for (const [path, content] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const lib = (extra = {}) =>
  JSON.stringify({ name: "lib", version: "1.0.0", files: ["dist"], ...extra });

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("runDepsCheck", () => {
  it("실제 저장소는 통과한다", () => {
    const result = runDepsCheck(repoRoot);

    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("런타임 의존성이 없는 패키지는 통과한다", () => {
    const root = makeRepo({
      "packages/lib/package.json": lib({ devDependencies: { x: "1.0.0" } }),
    });

    expect(runDepsCheck(root).ok).toBe(true);
  });

  it("소스 package.json의 의존성을 검출한다", () => {
    const root = makeRepo({
      "packages/lib/package.json": lib({ dependencies: { left: "1.0.0" } }),
    });

    const result = runDepsCheck(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("packages/lib/package.json");
    expect(result.problems.join("\n")).toContain("dependencies");
    expect(result.problems.join("\n")).toContain("left");
  });

  it("packed package.json의 의존성도 검출한다", () => {
    // pnpm은 packed manifest를 만들 때 필드를 바꿀 수 있어 tarball 안의 값을 따로 확인한다.
    const root = makeRepo({
      "packages/lib/package.json": lib({
        peerDependencies: { react: "^18" },
      }),
    });

    const result = runDepsCheck(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("tarball");
    expect(result.problems.join("\n")).toContain("peerDependencies");
  });

  it("private 패키지는 대상이 아니다", () => {
    const root = makeRepo({
      "packages/lib/package.json": lib(),
      "packages/config/package.json": JSON.stringify({
        name: "config",
        private: true,
        dependencies: { left: "1.0.0" },
      }),
    });

    expect(runDepsCheck(root).ok).toBe(true);
  });

  it("배포 대상 패키지가 없으면 실패한다", () => {
    const root = makeRepo({
      "packages/config/package.json": JSON.stringify({
        name: "config",
        private: true,
      }),
    });

    const result = runDepsCheck(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("배포 대상 패키지");
  });
});
