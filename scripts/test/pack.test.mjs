import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { packPackage } from "../pack.mjs";

const tempDirs = [];

/** 경로→내용 맵으로 임시 패키지 디렉터리를 만든다. */
function makePackage(files) {
  const dir = mkdtempSync(join(tmpdir(), "pack-"));
  tempDirs.push(dir);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

const manifest = (extra = {}) =>
  JSON.stringify({ name: "lib", version: "1.2.3", files: ["dist"], ...extra });

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("packPackage", () => {
  it("tarball 경로, 접두사 없는 파일 목록, packed package.json을 돌려준다", () => {
    const dir = makePackage({
      "package.json": manifest({ dependencies: { x: "1.0.0" } }),
      "dist/index.js": "export {};\n",
      "dist/nested/a.js": "export {};\n",
      "src/index.ts": "export {};\n",
    });
    const out = makePackage({});

    const packed = packPackage(dir, out);

    expect(packed.tarball.startsWith(out)).toBe(true);
    expect(packed.tarball.endsWith(".tgz")).toBe(true);
    expect(packed.files).toEqual([
      "dist/index.js",
      "dist/nested/a.js",
      "package.json",
    ]);
    expect(packed.manifest.name).toBe("lib");
    expect(packed.manifest.dependencies).toEqual({ x: "1.0.0" });
    expect(packed.size).toBeGreaterThan(0);
  });

  it("files에 없는 디렉터리는 tarball에 들어가지 않는다", () => {
    const dir = makePackage({
      "package.json": manifest(),
      "dist/index.js": "export {};\n",
      "src/index.ts": "export {};\n",
    });

    expect(packPackage(dir, makePackage({})).files).not.toContain(
      "src/index.ts",
    );
  });

  it("package.json이 없으면 원인을 담아 예외를 던진다", () => {
    const dir = makePackage({ "dist/index.js": "export {};\n" });

    expect(() => packPackage(dir, makePackage({}))).toThrow(/pack/);
  });
});
