/**
 * smoke Worker 진입 스크립트(`worker/worker-entry.js`)를 classic 스크립트(IIFE)로 번들한다.
 * 진입 스크립트는 `@cp949/random`과 subpath를 import하고, 여기서 tarball을 풀어 낸 `dist`로 연결한다.
 * 번들 target은 `baseline.json`의 `esTarget`이라 floor 브라우저가 파싱할 수 있는 문법만 나온다.
 * Chrome 75는 module Worker를 지원하지 않으므로 출력 형식은 `iife`다.
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const WORKER_ENTRY = fileURLToPath(
  new URL("../worker/worker-entry.js", import.meta.url),
);

/**
 * manifest의 `exports` 키마다 `<패키지명>[/subpath]` → 대상 파일 별칭을 만든다.
 * 목록을 손으로 적지 않으므로 subpath가 늘어도 따라간다. 정규식으로 끝을 고정해
 * `@cp949/random`이 `@cp949/random/secure`까지 삼키지 않게 한다.
 *
 * @param {string} packageDir tarball을 푼 디렉터리
 * @param {{ name: string, exports?: Record<string, unknown> }} manifest
 * @returns {{ find: RegExp, replacement: string }[]}
 */
export function buildWorkerAliases(packageDir, manifest) {
  const aliases = [];
  for (const [entry, value] of Object.entries(manifest.exports ?? {})) {
    const relPath =
      typeof value === "string"
        ? value
        : /** @type {{ default: string }} */ (value).default;
    const specifier =
      entry === "." ? manifest.name : `${manifest.name}/${entry.slice(2)}`;
    aliases.push({
      find: new RegExp(
        `^${specifier.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$`,
      ),
      replacement: join(packageDir, relPath),
    });
  }
  return aliases;
}

/**
 * Worker 번들을 `outFile`에 쓴다.
 *
 * @param {{ packageDir: string, manifest: { name: string, exports?: Record<string, unknown> }, esTarget: string, outDir: string }} options
 */
export async function buildWorkerBundle({
  packageDir,
  manifest,
  esTarget,
  outDir,
}) {
  await build({
    configFile: false,
    logLevel: "silent",
    root: packageDir,
    resolve: { alias: buildWorkerAliases(packageDir, manifest) },
    build: {
      target: esTarget.toLowerCase(),
      lib: {
        entry: WORKER_ENTRY,
        formats: ["iife"],
        name: "smokeWorker",
        fileName: () => "worker.js",
      },
      outDir,
      emptyOutDir: false,
      minify: false,
      write: true,
    },
  });
}
