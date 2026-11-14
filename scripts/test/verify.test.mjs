import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const scripts = JSON.parse(
  readFileSync(join(repoRoot, "package.json"), "utf8"),
).scripts;

/** `pnpm verify`가 실행하는 단계 목록. */
const steps = scripts.verify?.split("&&").map((step) => step.trim()) ?? [];

/** verify가 아니라 수동으로 실행하는 스크립트. */
const MANUAL = new Set([
  "mutation",
  "dev",
  "format",
  "verify",
  "smoke:legacy-browser",
  "smoke:local-browser",
  "release-it",
]);

describe("pnpm verify", () => {
  it("verify 스크립트가 있다", () => {
    expect(scripts.verify).toBeTypeOf("string");
    expect(steps.length).toBeGreaterThan(5);
  });

  it("모든 check:* 스크립트를 실행한다(게이트를 추가하고 연결하지 않는 실수를 막는다)", () => {
    const checks = Object.keys(scripts).filter((name) =>
      name.startsWith("check:"),
    );

    expect(checks.length).toBeGreaterThan(0);
    for (const name of checks) {
      expect(steps, `${name}이 verify에 없다`).toContain(`pnpm ${name}`);
    }
  });

  it.each(["lint", "format:check", "check-types", "test", "size"])(
    "`%s`를 실행한다",
    (name) => {
      expect(steps).toContain(`pnpm ${name}`);
    },
  );

  it("build는 turbo 캐시를 쓰지 않는 --force로 실행한다(캐시 hit의 dist 잔재를 배제)", () => {
    expect(steps).toContain("pnpm build --force");
  });

  it("dist가 필요한 검사는 build 뒤에 실행한다", () => {
    const build = steps.indexOf("pnpm build --force");
    const needsDist = [
      "pnpm check:escompat",
      "pnpm check:root-isolation",
      "pnpm check:deps",
      "pnpm check:pack",
      "pnpm check:consumer",
      "pnpm check:size-config",
      "pnpm size",
    ];

    expect(build).toBeGreaterThanOrEqual(0);
    for (const step of needsDist) {
      expect(
        steps.indexOf(step),
        `${step}이 build보다 앞이거나 없다`,
      ).toBeGreaterThan(build);
    }
  });

  it("check:pack과 check:consumer는 dist 검사 뒤 맨 끝에 온다(느린 검사를 뒤로)", () => {
    expect(steps.slice(-2)).toEqual(["pnpm check:pack", "pnpm check:consumer"]);
  });

  it("verify가 아닌 스크립트는 수동 실행 목록에 명시된 것뿐이다", () => {
    const verifyNames = new Set(
      steps.map((step) => step.replace(/^pnpm /, "").split(" ")[0]),
    );
    const unwired = Object.keys(scripts).filter(
      (name) =>
        !MANUAL.has(name) &&
        !verifyNames.has(name) &&
        !name.startsWith("lint:"),
    );

    expect(unwired).toEqual([]);
  });
});

describe("format 스크립트", () => {
  it("format과 format:check가 같은 파일 글롭을 쓴다", () => {
    const glob = (script) => /"([^"]+)"/.exec(script)?.[1];

    expect(glob(scripts["format:check"])).toBeDefined();
    expect(glob(scripts.format)).toBe(glob(scripts["format:check"]));
  });
});

describe(".github/workflows/ci.yml", () => {
  const ci = readFileSync(join(repoRoot, ".github/workflows/ci.yml"), "utf8");

  it("frozen lockfile로 설치하고 pnpm verify를 실행한다", () => {
    expect(ci).toContain("pnpm install --frozen-lockfile");
    expect(ci).toContain("pnpm verify");
  });

  it("Node 24를 설정하고 checkout한다", () => {
    expect(ci).toMatch(/node-version:\s*24/);
    expect(ci).toContain("actions/checkout@");
    expect(ci).toContain("pnpm/action-setup@");
  });

  it("verify를 실행하기 전에 설치한다", () => {
    expect(ci.indexOf("pnpm install --frozen-lockfile")).toBeLessThan(
      ci.indexOf("pnpm verify"),
    );
  });

  it("최소 권한(contents: read)만 요청한다", () => {
    expect(ci).toMatch(/permissions:\s*\n\s+contents:\s*read/);
  });
});

describe(".github/workflows/release.yml", () => {
  const release = readFileSync(
    join(repoRoot, ".github/workflows/release.yml"),
    "utf8",
  );
  const releaseIt = JSON.parse(
    readFileSync(join(repoRoot, "packages/random/.release-it.json"), "utf8"),
  );
  /** 문자열이 처음 나오는 위치. 없으면 실패한다. */
  const at = (needle) => {
    const index = release.indexOf(needle);
    expect(index, `${needle}이 release.yml에 없다`).toBeGreaterThanOrEqual(0);
    return index;
  };

  it("v* 태그 push에서만 실행한다", () => {
    expect(release).toMatch(/on:\s*\n\s+push:\s*\n\s+tags:\s*\[\s*"v\*"\s*\]/);
    expect(release).not.toMatch(/branches:/);
  });

  it("OIDC 토큰 요청 권한(id-token: write)과 읽기 권한만 요청한다", () => {
    expect(release).toMatch(
      /permissions:\s*\n\s+contents:\s*read\s*\n\s+id-token:\s*write/,
    );
  });

  it("npm 토큰 secret을 쓰지 않는다(trusted publishing으로 인증한다)", () => {
    expect(release).not.toMatch(/secrets\.|NODE_AUTH_TOKEN|NPM_TOKEN/);
  });

  it("설치, main 포함 확인, 버전 확인, verify, 재빌드, publish 순서로 실행한다", () => {
    const order = [
      at("pnpm install --frozen-lockfile"),
      at("git merge-base --is-ancestor"),
      at("GITHUB_REF_NAME"),
      at("pnpm verify"),
      at("pnpm build --force"),
      at("npm publish"),
    ];

    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("packages/random에서 provenance를 붙여 public으로 publish한다", () => {
    expect(release).toMatch(
      /npm publish --provenance --access public\s*\n\s+working-directory:\s*packages\/random/,
    );
  });

  it("release-it은 npm publish를 하지 않는다(publish는 이 workflow만 한다)", () => {
    expect(releaseIt.npm?.publish).toBe(false);
  });
});
