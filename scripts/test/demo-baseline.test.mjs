import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfigFromFile } from "vite";
import { afterEach, describe, expect, it } from "vitest";
import { loadBaseline } from "../baseline.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const demoConfigPath = join(repoRoot, "apps/demo/vite.config.ts");

const tempDirs = [];

/** vite 설정을 `command: "build"`로 읽어 build.target을 돌려준다. */
async function loadBuildTarget(configFile, root) {
  const loaded = await loadConfigFromFile(
    { command: "build", mode: "production" },
    configFile,
    root,
  );
  return loaded?.config.build?.target;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("apps/demo의 vite 설정", () => {
  it("실제 저장소의 build.target은 baseline.json의 chromeFloor에서 나온다", async () => {
    const { chromeFloor } = loadBaseline();

    expect(
      await loadBuildTarget(demoConfigPath, join(repoRoot, "apps/demo")),
    ).toBe(`chrome${chromeFloor}`);
  });

  it("baseline.json의 chromeFloor를 바꾸면 build.target이 따라간다", async () => {
    // 설정 안의 `vite` import가 해석되도록 저장소 안의 gitignore 대상 _tmp에 사본을 만든다.
    mkdirSync(join(repoRoot, "_tmp"), { recursive: true });
    const sandbox = mkdtempSync(join(repoRoot, "_tmp", "demo-baseline-"));
    tempDirs.push(sandbox);
    mkdirSync(join(sandbox, "apps/demo"), { recursive: true });
    copyFileSync(demoConfigPath, join(sandbox, "apps/demo/vite.config.ts"));
    writeFileSync(
      join(sandbox, "baseline.json"),
      JSON.stringify({
        chromeFloor: 99,
        esTarget: "ES2019",
        chromium: { version: "99.0.0.0", revision: 1 },
      }),
    );

    expect(
      await loadBuildTarget(
        join(sandbox, "apps/demo/vite.config.ts"),
        join(sandbox, "apps/demo"),
      ),
    ).toBe("chrome99");
  });
});
