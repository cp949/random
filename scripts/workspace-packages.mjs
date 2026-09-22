import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** 이 스크립트가 속한 저장소의 루트. */
const defaultRepoRoot = fileURLToPath(new URL("..", import.meta.url));

/** 지원하는 패턴은 `<디렉터리>/*` 한 단계뿐이다. */
const SUPPORTED_PATTERN = /^([A-Za-z0-9._-]+)\/\*$/;

/**
 * pnpm-workspace.yaml의 `packages` 목록을 읽는다.
 * 이 저장소의 단순한 형태(`- "dir/*"` 목록)만 다루고, 그 밖의 문법은 실패한다.
 */
function readPatterns(repoRoot) {
  const file = join(repoRoot, "pnpm-workspace.yaml");
  if (!existsSync(file)) {
    throw new Error(`${file}이 없다`);
  }

  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const start = lines.findIndex((line) => /^packages\s*:\s*$/.test(line));
  if (start === -1) {
    throw new Error(`${file}에 packages 키가 없다`);
  }

  const patterns = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const item = /^\s*-\s+(.*?)\s*$/.exec(line);
    // 목록 항목이 아닌 줄은 다음 최상위 키이므로 목록이 끝난 것이다.
    if (!item) break;
    patterns.push(item[1].replace(/^(["'])(.*)\1$/, "$2"));
  }

  for (const pattern of patterns) {
    if (!SUPPORTED_PATTERN.test(pattern)) {
      throw new Error(
        `지원하지 않는 workspace 패턴이다: ${pattern} (\`<디렉터리>/*\` 형태만 지원한다)`,
      );
    }
  }
  return patterns;
}

/**
 * workspace 패키지를 경로 순서로 열거한다. 게이트들이 대상 목록을 여기서 파생한다.
 *
 * @param {string} [repoRoot]
 * @returns {{ name: string, dir: string, relDir: string, packageJson: Record<string, unknown> }[]}
 */
export function listWorkspacePackages(repoRoot = defaultRepoRoot) {
  const found = new Map();

  for (const pattern of readPatterns(repoRoot)) {
    const parent = SUPPORTED_PATTERN.exec(pattern)[1];
    const parentDir = join(repoRoot, parent);
    if (!existsSync(parentDir) || !statSync(parentDir).isDirectory()) continue;

    for (const entry of readdirSync(parentDir)) {
      const dir = join(parentDir, entry);
      const manifest = join(dir, "package.json");
      if (!statSync(dir).isDirectory() || !existsSync(manifest)) continue;

      const relDir = `${parent}/${entry}`;
      const packageJson = JSON.parse(readFileSync(manifest, "utf8"));
      found.set(relDir, { name: packageJson.name, dir, relDir, packageJson });
    }
  }

  return [...found.values()].sort((a, b) =>
    a.relDir < b.relDir ? -1 : a.relDir > b.relDir ? 1 : 0,
  );
}

/**
 * 배포 대상 패키지: `packages/*` 중 private가 아닌 것. `apps/*`와 `fixtures/*`는 앱이거나 검증용이고,
 * private 설정 패키지(`@repo/*`)는 배포하지 않는다. 배포물 게이트(escompat, deps, pack, consumer)가 공유한다.
 *
 * @param {string} [repoRoot]
 */
export function listPublishablePackages(repoRoot = defaultRepoRoot) {
  return listWorkspacePackages(repoRoot).filter(
    (pkg) =>
      pkg.relDir.startsWith("packages/") && pkg.packageJson.private !== true,
  );
}
