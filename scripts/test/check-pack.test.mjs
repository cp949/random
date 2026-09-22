/**
 * `check-pack.mjs`의 `runPackCheck` 테스트. 배포 대상 패키지를 실제로 pack해 허용 파일 집합,
 * 필수 파일(README·LICENSE), exports 대상, 배포 메타데이터 필드, tarball 크기 상한, attw·publint를
 * 검사한다. `makeRepo`·`libFiles`로 임시 저장소를 만들어 검증한다.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runPackCheck } from "../check-pack.mjs";

const tempDirs = [];

function makeRepo(files) {
  const root = mkdtempSync(join(tmpdir(), "packcheck-"));
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

const exportsField = {
  ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
};

/** 올바른 배포 패키지 파일 집합. `overrides`로 매니페스트 필드나 파일을 바꾸거나(null이면 제거) 더한다. */
function libFiles({ manifest = {}, files = {} } = {}) {
  const base = {
    "packages/lib/package.json": JSON.stringify({
      name: "lib",
      version: "1.0.0",
      license: "MIT",
      type: "module",
      files: ["dist", "README.md"],
      publishConfig: { access: "public" },
      repository: {
        type: "git",
        url: "git+https://example.com/lib.git",
        directory: "packages/lib",
      },
      homepage: "https://example.com/lib#readme",
      bugs: { url: "https://example.com/lib/issues" },
      keywords: ["lib"],
      exports: exportsField,
      ...manifest,
    }),
    "packages/lib/LICENSE": "MIT\n",
    "packages/lib/README.md": "# lib\n",
    "packages/lib/dist/index.js": "export const a = 1;\n",
    "packages/lib/dist/index.d.ts": "export declare const a: number;\n",
  };
  const merged = { ...base, ...files };
  return Object.fromEntries(
    Object.entries(merged).filter(([, content]) => content !== null),
  );
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** 도구(attw, publint) 없이 파일 검사만 돌린다. */
const filesOnly = { runTools: false };

describe("runPackCheck: 파일 허용 집합", () => {
  it("올바른 패키지는 통과하고 tarball 크기를 보고한다", async () => {
    const result = await runPackCheck(makeRepo(libFiles()), filesOnly);

    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.tarballs).toEqual([
      { name: "lib", size: expect.any(Number) },
    ]);
    expect(result.tarballs[0].size).toBeGreaterThan(0);
  });

  it("README.md가 없으면 실패한다", async () => {
    const root = makeRepo(
      libFiles({ files: { "packages/lib/README.md": null } }),
    );

    const result = await runPackCheck(root, filesOnly);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("README.md");
  });

  it("LICENSE가 없으면 실패한다", async () => {
    const root = makeRepo(
      libFiles({ files: { "packages/lib/LICENSE": null } }),
    );

    const result = await runPackCheck(root, filesOnly);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("LICENSE");
  });

  it.each([
    ["src/", "src/index.ts", "src/는 배포하지 않는다"],
    ["test/", "test/a.test.ts", "test/는 배포하지 않는다"],
    ["sourcemap", "dist/index.js.map", "*.map"],
    ["선언 지도", "dist/index.d.ts.map", "*.map"],
    ["tsbuildinfo", "dist/tsconfig.tsbuildinfo", "*.tsbuildinfo"],
  ])(
    "%s가 tarball에 들어가면 이유와 함께 실패한다",
    async (_이름, path, reason) => {
      const top = path.split("/")[0];
      const root = makeRepo(
        libFiles({
          manifest: { files: ["dist", top] },
          files: { [`packages/lib/${path}`]: "{}\n" },
        }),
      );

      const result = await runPackCheck(root, filesOnly);

      expect(result.ok).toBe(false);
      expect(result.problems.join("\n")).toContain(path);
      expect(result.problems.join("\n")).toContain(reason);
    },
  );

  it("허용 집합에 없는 파일이 있으면 실패한다", async () => {
    const root = makeRepo(
      libFiles({
        manifest: { files: ["dist", "CHANGELOG.md"] },
        files: { "packages/lib/CHANGELOG.md": "# 변경\n" },
      }),
    );

    const result = await runPackCheck(root, filesOnly);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("CHANGELOG.md");
    expect(result.problems.join("\n")).toContain("허용 집합");
  });
});

describe("runPackCheck: exports 대상", () => {
  it("default 대상 파일이 tarball에 없으면 실패한다", async () => {
    const root = makeRepo(
      libFiles({ files: { "packages/lib/dist/index.js": null } }),
    );

    const result = await runPackCheck(root, filesOnly);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("dist/index.js");
  });

  it("types 대상 파일이 tarball에 없으면 실패한다", async () => {
    const root = makeRepo(
      libFiles({ files: { "packages/lib/dist/index.d.ts": null } }),
    );

    const result = await runPackCheck(root, filesOnly);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("dist/index.d.ts");
  });

  it("모든 exports 키의 대상을 확인한다", async () => {
    const root = makeRepo(
      libFiles({
        manifest: {
          exports: {
            ...exportsField,
            "./secure": {
              types: "./dist/secure/index.d.ts",
              default: "./dist/secure/index.js",
            },
          },
        },
      }),
    );

    const result = await runPackCheck(root, filesOnly);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("./secure");
  });

  it("문자열로 적은 export 대상도 확인한다", async () => {
    const root = makeRepo(
      libFiles({ manifest: { exports: { ".": "./dist/missing.js" } } }),
    );

    const result = await runPackCheck(root, filesOnly);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("dist/missing.js");
  });

  it("types 조건이 없는 export는 파일이 있어도 실패한다(attw는 타입 부재를 오류로 보지 않는다)", async () => {
    const root = makeRepo(
      libFiles({
        manifest: { exports: { ".": { default: "./dist/index.js" } } },
      }),
    );

    const result = await runPackCheck(root, filesOnly);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("types 조건이 없다");
  });

  it("default 조건이 없는 export는 실패한다", async () => {
    const root = makeRepo(
      libFiles({
        manifest: { exports: { ".": { types: "./dist/index.d.ts" } } },
      }),
    );

    const result = await runPackCheck(root, filesOnly);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("default 조건이 없다");
  });

  it("exports가 없으면 실패한다", async () => {
    const root = makeRepo(libFiles({ manifest: { exports: undefined } }));

    const result = await runPackCheck(root, filesOnly);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("exports가 없다");
  });
});

describe("runPackCheck: 배포 메타데이터", () => {
  it("publishConfig.access가 없으면 실패한다", async () => {
    const root = makeRepo(libFiles({ manifest: { publishConfig: undefined } }));

    const result = await runPackCheck(root, filesOnly);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("publishConfig.access");
  });

  it("publishConfig.access가 restricted면 실패한다", async () => {
    const root = makeRepo(
      libFiles({ manifest: { publishConfig: { access: "restricted" } } }),
    );

    const result = await runPackCheck(root, filesOnly);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("publishConfig.access");
  });

  it("repository.directory가 없으면 실패한다", async () => {
    const root = makeRepo(
      libFiles({
        manifest: {
          repository: { type: "git", url: "git+https://example.com/lib.git" },
        },
      }),
    );

    const result = await runPackCheck(root, filesOnly);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("repository.directory");
  });

  it("homepage·bugs.url·license가 없으면 각각 실패한다", async () => {
    const root = makeRepo(
      libFiles({
        manifest: { homepage: undefined, bugs: undefined, license: undefined },
      }),
    );

    const result = await runPackCheck(root, filesOnly);
    const joined = result.problems.join("\n");

    expect(result.ok).toBe(false);
    expect(joined).toContain("homepage");
    expect(joined).toContain("bugs.url");
    expect(joined).toContain("license");
  });

  it("keywords가 빈 배열이면 실패한다", async () => {
    const root = makeRepo(libFiles({ manifest: { keywords: [] } }));

    const result = await runPackCheck(root, filesOnly);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("keywords");
  });
});

describe("runPackCheck: tarball 크기 상한", () => {
  it("상한을 넘으면 실패한다", async () => {
    const root = makeRepo(libFiles());

    const result = await runPackCheck(root, {
      ...filesOnly,
      maxTarballBytes: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("상한");
  });

  it("상한 이하면 통과한다", async () => {
    const root = makeRepo(libFiles());

    const result = await runPackCheck(root, {
      ...filesOnly,
      maxTarballBytes: 1_000_000,
    });

    expect(result.ok).toBe(true);
  });
});

describe("runPackCheck: 대상", () => {
  it("배포 대상 패키지가 없으면 실패한다", async () => {
    const root = makeRepo({
      "packages/config/package.json": JSON.stringify({
        name: "config",
        private: true,
      }),
    });

    const result = await runPackCheck(root, filesOnly);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("배포 대상 패키지");
  });

  it("private 패키지는 검사하지 않는다", async () => {
    const root = makeRepo({
      ...libFiles(),
      "packages/config/package.json": JSON.stringify({
        name: "config",
        private: true,
        files: ["src"],
      }),
      "packages/config/src/a.ts": "export {};\n",
    });

    expect((await runPackCheck(root, filesOnly)).ok).toBe(true);
  });
});

describe("runPackCheck: attw와 publint", () => {
  it("올바른 ESM 전용 패키지는 두 도구를 모두 통과한다", async () => {
    const result = await runPackCheck(makeRepo(libFiles()));

    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
  }, 60_000);

  it("ESM 코드를 CJS로 해석하게 만드는 매니페스트(type 누락)는 attw가 실패시킨다", async () => {
    const root = makeRepo(libFiles({ manifest: { type: undefined } }));

    const result = await runPackCheck(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("attw");
  }, 60_000);

  it("publint가 오류로 보는 매니페스트는 실패시킨다", async () => {
    const root = makeRepo(libFiles({ manifest: { main: "./dist/nope.js" } }));

    const result = await runPackCheck(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("publint");
  }, 60_000);
});
