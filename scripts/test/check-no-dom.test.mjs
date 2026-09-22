import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { REQUIRED_IDENTIFIERS, runNoDomCheck } from "../check-no-dom.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const tempDirs = [];

/** 게이트가 판정할 임시 fixture를 gitignore 대상 `_tmp`에 만들고 저장소 기준 상대 경로를 돌려준다. */
function makeFixture({ source, tsconfig }) {
  mkdirSync(join(repoRoot, "_tmp"), { recursive: true });
  const dir = mkdtempSync(join(repoRoot, "_tmp", "no-dom-"));
  tempDirs.push(dir);
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src/index.ts"), source);
  writeFileSync(join(dir, "tsconfig.json"), JSON.stringify(tsconfig));
  return relative(repoRoot, dir);
}

/** library.json을 상속하는 fixture tsconfig. */
const libraryTsconfig = (compilerOptions = {}) => ({
  extends: "../../packages/typescript-config/library.json",
  compilerOptions: { noEmit: true, ...compilerOptions },
  include: ["src"],
});

const domUsage = [
  "export const title = document.title;",
  "export const location = window.location;",
  "export const id = crypto.randomUUID();",
  "",
].join("\n");

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("runNoDomCheck", () => {
  it("검사 대상 식별자는 document, window, crypto 셋이다", () => {
    expect(REQUIRED_IDENTIFIERS).toEqual(["document", "window", "crypto"]);
  });

  it("저장소의 DOM 사용 fixture는 세 식별자 모두에서 실패해 통과로 판정된다", () => {
    const result = runNoDomCheck();

    expect(result.reasons).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.identifiers.sort()).toEqual(
      ["crypto", "document", "window"].sort(),
    );
  });

  it("DOM 전역을 쓰지 않는 정상 소스는 컴파일이 성공해 실패로 판정된다", () => {
    const project = makeFixture({
      source: "export const a = 1;\n",
      tsconfig: libraryTsconfig(),
    });

    const result = runNoDomCheck({ project });

    expect(result.ok).toBe(false);
    expect(result.reasons.join("\n")).toContain("컴파일이 성공");
  });

  it("DOM과 무관한 타입 오류로 실패하는 fixture는 실패로 판정된다", () => {
    const project = makeFixture({
      source: `${domUsage}export const wrong: number = "문자열";\n`,
      tsconfig: libraryTsconfig(),
    });

    const result = runNoDomCheck({ project });

    expect(result.ok).toBe(false);
    expect(result.reasons.join("\n")).toContain("TS2322");
  });

  it("식별자 일부만 쓰는 fixture는 빠진 식별자를 알리며 실패로 판정된다", () => {
    const project = makeFixture({
      source: "export const title = document.title;\n",
      tsconfig: libraryTsconfig(),
    });

    const result = runNoDomCheck({ project });

    expect(result.ok).toBe(false);
    const reason = result.reasons.join("\n");
    expect(reason).toContain("window");
    expect(reason).toContain("crypto");
    expect(reason).not.toContain("document,");
  });

  it("컴파일러가 설정 오류를 내는 fixture는 실패로 판정된다", () => {
    const project = makeFixture({
      source: domUsage,
      tsconfig: {
        extends: "./없는-설정.json",
        compilerOptions: { noEmit: true },
        include: ["src"],
      },
    });

    const result = runNoDomCheck({ project });

    expect(result.ok).toBe(false);
    expect(result.exitCode).not.toBe(0);
  });

  it("DOM lib을 켜면 DOM 전역이 컴파일돼 실패로 판정된다", () => {
    const project = makeFixture({
      source: domUsage,
      tsconfig: libraryTsconfig({ lib: ["ES2019", "DOM"] }),
    });

    const result = runNoDomCheck({ project });

    expect(result.ok).toBe(false);
    expect(result.reasons.join("\n")).toContain("컴파일이 성공");
  });

  it("Node 타입이 켜지면 crypto가 해석돼 실패로 판정된다", () => {
    const project = makeFixture({
      source: domUsage,
      tsconfig: libraryTsconfig({ types: ["node"] }),
    });

    const result = runNoDomCheck({ project });

    expect(result.ok).toBe(false);
    expect(result.reasons.join("\n")).toContain("crypto");
  });
});
