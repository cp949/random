import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listPublishablePackages,
  listWorkspacePackages,
} from "../workspace-packages.mjs";

const tempDirs = [];

/** 경로→내용 맵으로 임시 저장소 루트를 만든다. */
function makeRepo(files) {
  const root = mkdtempSync(join(tmpdir(), "workspace-"));
  tempDirs.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const pkg = (name) => JSON.stringify({ name });

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("listWorkspacePackages", () => {
  it("저장소의 workspace 패키지를 경로 순서로 돌려준다", () => {
    const packages = listWorkspacePackages();

    expect(packages.map((p) => p.relDir)).toEqual([
      "apps/demo",
      "packages/eslint-config",
      "packages/legacy-browser-smoke",
      "packages/random",
      "packages/typescript-config",
    ]);
    expect(packages.map((p) => p.name)).toEqual([
      "demo",
      "@repo/eslint-config",
      "@cp949/legacy-browser-smoke",
      "@cp949/random",
      "@repo/typescript-config",
    ]);
  });

  it("각 항목은 절대 경로 dir과 파싱된 package.json을 가진다", () => {
    const random = listWorkspacePackages().find(
      (p) => p.name === "@cp949/random",
    );

    expect(isAbsolute(random.dir)).toBe(true);
    expect(random.packageJson.name).toBe("@cp949/random");
  });

  it("package.json이 없는 디렉터리는 건너뛴다", () => {
    const root = makeRepo({
      "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',
      "packages/a/package.json": pkg("a"),
      "packages/notes/README.md": "package.json 없음",
    });

    expect(listWorkspacePackages(root).map((p) => p.name)).toEqual(["a"]);
  });

  it("패턴이 가리키는 상위 디렉터리가 없으면 그 패턴은 결과가 없다", () => {
    const root = makeRepo({
      "pnpm-workspace.yaml": 'packages:\n  - "apps/*"\n  - "packages/*"\n',
      "packages/a/package.json": pkg("a"),
    });

    expect(listWorkspacePackages(root).map((p) => p.name)).toEqual(["a"]);
  });

  it("따옴표 없는 패턴과 작은따옴표 패턴도 읽는다", () => {
    const root = makeRepo({
      "pnpm-workspace.yaml": "packages:\n  - apps/*\n  - 'packages/*'\n",
      "apps/a/package.json": pkg("a"),
      "packages/b/package.json": pkg("b"),
    });

    expect(listWorkspacePackages(root).map((p) => p.name)).toEqual(["a", "b"]);
  });

  it("패턴을 적은 순서와 무관하게 경로 순서로 돌려준다", () => {
    // 패턴 순서(packages 먼저)와 디렉터리 순서(z, b)를 모두 정렬의 역으로 둔다.
    const root = makeRepo({
      "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n  - "apps/*"\n',
      "apps/z/package.json": pkg("z"),
      "apps/b/package.json": pkg("b"),
      "packages/y/package.json": pkg("y"),
      "packages/a/package.json": pkg("a"),
    });

    expect(listWorkspacePackages(root).map((p) => p.relDir)).toEqual([
      "apps/b",
      "apps/z",
      "packages/a",
      "packages/y",
    ]);
  });

  it("packages 이후의 다른 최상위 키는 패턴으로 읽지 않는다", () => {
    const root = makeRepo({
      "pnpm-workspace.yaml":
        'packages:\n  - "packages/*"\nonlyBuiltDependencies:\n  - esbuild\n',
      "packages/a/package.json": pkg("a"),
    });

    expect(listWorkspacePackages(root).map((p) => p.name)).toEqual(["a"]);
  });

  it.each([
    ["제외 패턴 `!`", '  - "packages/*"\n  - "!packages/legacy"'],
    ["다단계 패턴 `**`", '  - "packages/**"'],
    ["하위 경로 패턴", '  - "packages/*/sub"'],
    ["루트 패턴", '  - "*"'],
  ])(
    "지원하지 않는 패턴(%s)은 조용히 무시하지 않고 실패한다",
    (_이름, lines) => {
      const root = makeRepo({
        "pnpm-workspace.yaml": `packages:\n${lines}\n`,
      });

      expect(() => listWorkspacePackages(root)).toThrow(/지원하지 않는/);
    },
  );

  it("packages 키가 없으면 실패한다", () => {
    const root = makeRepo({
      "pnpm-workspace.yaml": "onlyBuiltDependencies: []\n",
    });

    expect(() => listWorkspacePackages(root)).toThrow(/packages/);
  });

  it("pnpm-workspace.yaml이 없으면 실패한다", () => {
    const root = makeRepo({});

    expect(() => listWorkspacePackages(root)).toThrow(/pnpm-workspace\.yaml/);
  });
});

describe("listPublishablePackages", () => {
  it("packages 아래의 private가 아닌 패키지만 돌려준다", () => {
    const root = makeRepo({
      "pnpm-workspace.yaml": 'packages:\n  - "apps/*"\n  - "packages/*"\n',
      "packages/lib/package.json": pkg("lib"),
      "packages/config/package.json": JSON.stringify({
        name: "config",
        private: true,
      }),
      "apps/site/package.json": pkg("site"),
    });

    expect(listPublishablePackages(root).map((p) => p.name)).toEqual(["lib"]);
  });

  it("저장소에서는 @cp949/random 하나다", () => {
    expect(listPublishablePackages().map((p) => p.name)).toEqual([
      "@cp949/random",
    ]);
  });
});
