/**
 * `@cp949/random`의 배포 tarball을 실제 브라우저(floor 빌드 컨테이너 또는 로컬 Chrome)에서 실행해
 * exports 계약과 대표 호출을 확인하는 runner(spec 4.2). CLI: `--target container|local [--chrome <경로>]`.
 *
 * 순수 함수(`parseArgs`, `parseChromeVersion`, `buildExpectedExports`, `extractResult`, `judge`,
 * `formatSummary`)는 여기서 export해 `test/run.test.mjs`가 단위 테스트한다. 실행마다
 * `_tmp/legacy-browser-smoke/`의 산출물을 지우고 다시 만든다(남은 산출물 재사용으로 거짓 통과가 난
 * geul Issue #123과 같은 함정을 막는다).
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadBaseline } from "../../../scripts/baseline.mjs";
import { packPackage } from "../../../scripts/pack.mjs";
import { buildChromeArgs } from "./chrome-flags.mjs";
import { runProcess } from "./spawn-async.mjs";
import { startServer } from "./serve.mjs";

/** 이 스크립트가 속한 저장소의 루트. */
const defaultRepoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const PACKAGE_DIR = "packages/random";
const PAGE_SOURCE_DIR = fileURLToPath(new URL("../page", import.meta.url));
const RESULT_PATTERN = /<pre id="result">([\s\S]*?)<\/pre>/;
const CHROME_VERSION_PATTERN = /(\d+\.\d+\.\d+\.\d+)/;
const PROCESS_TIMEOUT_MS = 120_000;

/**
 * `--target container|local [--chrome <경로>]`를 읽는다. `--chrome`을 생략하면 `google-chrome`.
 *
 * @param {string[]} argv
 * @returns {{ target: "container" | "local", chrome: string }}
 */
export function parseArgs(argv) {
  let target;
  let chrome = "google-chrome";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--target") {
      target = argv[i + 1];
      i += 1;
    } else if (arg === "--chrome") {
      chrome = argv[i + 1];
      i += 1;
    } else {
      throw new Error(`알 수 없는 인자다: ${arg}`);
    }
  }
  if (target !== "container" && target !== "local") {
    throw new Error(
      `--target은 container 또는 local이어야 한다(받은 값: ${JSON.stringify(target)})`,
    );
  }
  return { target, chrome };
}

/**
 * `"Google Chrome 152.0.7977.64"`나 `"Chromium 75.0.3765.0"` 같은 `--version` 출력에서
 * 네 자리 버전 문자열만 뽑는다.
 *
 * @param {string} stdout
 */
export function parseChromeVersion(stdout) {
  const match = CHROME_VERSION_PATTERN.exec(stdout);
  if (!match) {
    throw new Error(`chrome --version 출력에서 버전을 찾지 못했다: ${stdout}`);
  }
  return match[1];
}

/**
 * 패키지 manifest의 `exports` 키마다 대상 파일을 import해 `{ [entry]: { [exportName]: typeof } }`를
 * 만든다. 목록을 손으로 적지 않으므로 subpath·export가 늘어도 그대로 따라간다.
 *
 * @param {string} pkgDir manifest가 가리키는 상대 경로의 기준 디렉터리
 * @param {{ exports?: Record<string, unknown> }} manifest
 */
export async function buildExpectedExports(pkgDir, manifest) {
  const exportsField = manifest.exports ?? {};
  const result = {};
  for (const [entry, value] of Object.entries(exportsField)) {
    const relPath =
      typeof value === "string"
        ? value
        : /** @type {{ default: string }} */ (value).default;
    const moduleUrl = pathToFileURL(join(pkgDir, relPath)).href;
    const mod = await import(moduleUrl);
    const typesByName = {};
    for (const name of Object.keys(mod)) {
      typesByName[name] = typeof mod[name];
    }
    result[entry] = typesByName;
  }
  return result;
}

/**
 * `--dump-dom` 출력에서 `<pre id="result">`의 텍스트를 꺼내 JSON으로 파싱한다. 요소가 없거나
 * 디코딩·파싱에 실패하면 `null`(결과 없음 = 실패, fail-closed).
 *
 * @param {string} domText
 */
export function extractResult(domText) {
  const match = RESULT_PATTERN.exec(domText);
  if (!match) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  try {
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * 결과가 없거나(`null`) assertion이 하나라도 실패하면 FAIL.
 *
 * @param {{ assertions?: { ok: boolean }[] } | null} result
 */
export function judge(result) {
  if (!result || !Array.isArray(result.assertions)) return false;
  return (
    result.assertions.length > 0 &&
    result.assertions.every((a) => a.ok === true)
  );
}

/**
 * spec 4.4의 한 줄 요약 형식.
 *
 * @param {{ target: string, chrome: string, platform: string, os: string, date: string, passed: number, total: number, result: "PASS" | "FAIL" }} info
 */
export function formatSummary({
  target,
  chrome,
  platform,
  os,
  date,
  passed,
  total,
  result,
}) {
  return `smoke: target=${target} chrome=${chrome} platform=${platform} os=${os} headless=true date=${date} assertions=${passed}/${total} result=${result}`;
}

/** 디렉터리를 지우고 다시 만든다. */
function resetDir(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

/** floor 빌드 컨테이너를 빌드·실행해 chrome의 stdout을 돌려준다. */
function runContainer({ repoRoot, packageDir, pageDir, baseline }) {
  const smokePkgDir = join(repoRoot, "packages/legacy-browser-smoke");
  const build = spawnSync(
    "docker",
    [
      "build",
      "--build-arg",
      `CHROMIUM_PLATFORM=${baseline.chromium.platform}`,
      "--build-arg",
      `CHROMIUM_REVISION=${baseline.chromium.revision}`,
      "--build-arg",
      `CHROMIUM_SHA256=${baseline.chromium.sha256}`,
      "-t",
      "cp949-legacy-browser-smoke",
      smokePkgDir,
    ],
    { stdio: "inherit" },
  );
  if (build.status !== 0) {
    throw new Error("docker build가 실패했다(위 출력 참고)");
  }

  const run = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "-v",
      `${packageDir}:/smoke/pkg:ro`,
      "-v",
      `${pageDir}:/smoke/page:ro`,
      "-e",
      "SMOKE_EXPECT_RANDOM_UUID=false",
      "-e",
      `SMOKE_EXPECT_CHROME_VERSION=${baseline.chromium.version}`,
      "cp949-legacy-browser-smoke",
    ],
    { encoding: "utf8", timeout: PROCESS_TIMEOUT_MS },
  );
  if (run.stderr) process.stderr.write(run.stderr);

  return {
    stdout: run.stdout ?? "",
    chrome: baseline.chromium.version,
    platform: baseline.chromium.platform,
  };
}

/** 로컬 Chrome을 host에서 직접 띄워 stdout을 돌려준다. */
async function runLocal({ packageDir, pageDir, chromeBinary }) {
  const versionResult = spawnSync(chromeBinary, ["--version"], {
    encoding: "utf8",
  });
  if (versionResult.status !== 0) {
    throw new Error(
      `${chromeBinary} --version이 실패했다: ${versionResult.stderr || versionResult.stdout}`,
    );
  }
  const version = parseChromeVersion(versionResult.stdout);

  const server = await startServer({
    pageDir,
    pkgDir: packageDir,
    host: "127.0.0.1",
    port: 0,
  });
  const userDataDir = mkdtempSync(join(tmpdir(), "smoke-chrome-"));
  try {
    const params = new URLSearchParams({
      expectRandomUUID: "true",
      expectChromeVersion: version,
    });
    const url = `http://127.0.0.1:${server.port}/?${params.toString()}`;
    // 이 프로세스가 띄운 서버에 chrome이 접속하므로 spawnSync(이벤트 루프를 막는다)를 쓰면
    // chrome의 요청을 서버가 처리하지 못해 멈춘다 — spawn-async.mjs 헤더 설명 참고.
    const result = await runProcess(
      chromeBinary,
      buildChromeArgs({ url, userDataDir }),
      { timeout: PROCESS_TIMEOUT_MS },
    );
    if (result.stderr) process.stderr.write(result.stderr);
    return { stdout: result.stdout ?? "", chrome: version, platform: "host" };
  } finally {
    await server.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

async function main() {
  const { target, chrome } = parseArgs(process.argv.slice(2));
  const repoRoot = defaultRepoRoot;
  const distDir = join(repoRoot, PACKAGE_DIR, "dist");
  if (!existsSync(distDir)) {
    console.error(`${distDir}가 없다. pnpm build 먼저 실행한다`);
    process.exitCode = 1;
    return;
  }

  const tmpRoot = join(repoRoot, "_tmp/legacy-browser-smoke");
  const packageDir = join(tmpRoot, "package");
  const pageDir = join(tmpRoot, "page");
  mkdirSync(tmpRoot, { recursive: true });

  const packed = packPackage(join(repoRoot, PACKAGE_DIR), tmpRoot);
  resetDir(packageDir);
  const extract = spawnSync("tar", [
    "-xzf",
    packed.tarball,
    "-C",
    packageDir,
    "--strip-components=1",
  ]);
  if (extract.status !== 0) {
    throw new Error(`tarball 해제가 실패했다: ${extract.stderr}`);
  }

  const manifest = JSON.parse(
    readFileSync(join(packageDir, "package.json"), "utf8"),
  );
  const expectedExports = await buildExpectedExports(packageDir, manifest);

  resetDir(pageDir);
  await cp(PAGE_SOURCE_DIR, pageDir, { recursive: true });
  writeFileSync(
    join(pageDir, "expected-exports.json"),
    JSON.stringify(expectedExports),
  );

  const baseline = loadBaseline(repoRoot);
  const run =
    target === "container"
      ? runContainer({ repoRoot, packageDir, pageDir, baseline })
      : await runLocal({ packageDir, pageDir, chromeBinary: chrome });

  const result = extractResult(run.stdout);
  const ok = judge(result);
  const total =
    result && Array.isArray(result.assertions) ? result.assertions.length : 0;
  const passed =
    result && Array.isArray(result.assertions)
      ? result.assertions.filter((a) => a.ok).length
      : 0;
  const os = spawnSync("uname", ["-sm"], { encoding: "utf8" }).stdout.trim();
  const date = new Date().toISOString().slice(0, 10);

  console.log(
    formatSummary({
      target,
      chrome: run.chrome,
      platform: run.platform,
      os,
      date,
      passed,
      total,
      result: ok ? "PASS" : "FAIL",
    }),
  );
  if (!result) {
    console.error('결과 요소(<pre id="result">)를 찾지 못했다');
  } else if (!ok) {
    for (const assertion of result.assertions) {
      if (!assertion.ok) console.error(`${assertion.id}: ${assertion.detail}`);
    }
  }
  process.exitCode = ok ? 0 : 1;
}

// 직접 실행할 때만 돈다(테스트에서 import해도 프로세스 상태를 바꾸지 않는다).
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
