import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { installCryptoStub, type CryptoMode } from "./helpers/crypto-stub.js";
import { listEntrySources } from "./helpers/entries.js";
import { importFresh } from "./helpers/import-fresh.js";

const packageDir = fileURLToPath(new URL("..", import.meta.url));

const tempDirs: string[] = [];

/** 경로→내용 맵으로 임시 패키지 디렉터리를 만든다. */
function makePackage(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "entries-"));
  tempDirs.push(dir);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("listEntrySources", () => {
  it("exports의 default 대상 dist 경로를 src의 .ts 소스로 매핑한다", () => {
    const dir = makePackage({
      "package.json": JSON.stringify({
        exports: {
          ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
          "./secure": {
            types: "./dist/secure/index.d.ts",
            default: "./dist/secure/index.js",
          },
        },
      }),
      "src/index.ts": "export {};\n",
      "src/secure/index.ts": "export {};\n",
    });

    expect(listEntrySources(dir)).toEqual([
      { key: ".", sourcePath: join(dir, "src/index.ts") },
      { key: "./secure", sourcePath: join(dir, "src/secure/index.ts") },
    ]);
  });

  it("문자열로 적은 export 대상도 처리한다", () => {
    const dir = makePackage({
      "package.json": JSON.stringify({ exports: { ".": "./dist/index.js" } }),
      "src/index.ts": "export {};\n",
    });

    expect(listEntrySources(dir).map((entry) => entry.key)).toEqual(["."]);
  });

  it("매핑한 소스 파일이 없으면 조용히 건너뛰지 않고 실패한다", () => {
    const dir = makePackage({
      "package.json": JSON.stringify({
        exports: { ".": { default: "./dist/index.js" } },
      }),
    });

    expect(() => listEntrySources(dir)).toThrow(/src\/index\.ts/);
  });

  it("dist 밖을 가리키는 export 대상은 실패한다", () => {
    const dir = makePackage({
      "package.json": JSON.stringify({ exports: { ".": "./lib/index.js" } }),
    });

    expect(() => listEntrySources(dir)).toThrow(/\.\/dist\//);
  });

  it("default 대상이 없는 export는 실패한다", () => {
    const dir = makePackage({
      "package.json": JSON.stringify({
        exports: { ".": { types: "./dist/index.d.ts" } },
      }),
    });

    expect(() => listEntrySources(dir)).toThrow(/default/);
  });

  it("exports가 없으면 실패한다", () => {
    const dir = makePackage({ "package.json": JSON.stringify({}) });

    expect(() => listEntrySources(dir)).toThrow(/exports/);
  });
});

describe("모든 entry는 import 시점에 crypto를 건드리지 않는다", () => {
  const entries = listEntrySources(packageDir);

  it("실제 패키지의 entry가 하나 이상 열거된다", () => {
    expect(entries.map((entry) => entry.key)).toContain(".");
    for (const entry of entries) {
      expect(existsSync(entry.sourcePath)).toBe(true);
    }
  });

  const brokenModes: CryptoMode[] = [
    "absent",
    "empty",
    "not-function",
    "throwing-accessor",
  ];

  for (const entry of entries) {
    for (const mode of brokenModes) {
      it(`${entry.key}: crypto가 ${mode}여도 예외 없이 import된다`, async () => {
        installCryptoStub({ mode });

        await expect(importFresh(entry.sourcePath)).resolves.toBeDefined();
      });
    }

    it(`${entry.key}: import만으로 getRandomValues를 호출하지 않는다`, async () => {
      const stub = installCryptoStub();

      await importFresh(entry.sourcePath);

      expect(stub.calls).toEqual([]);
    });
  }
});
