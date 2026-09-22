import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** 이 스크립트가 속한 저장소의 루트. */
const defaultRepoRoot = fileURLToPath(new URL("..", import.meta.url));

const TOP_LEVEL_KEYS = ["chromeFloor", "esTarget", "chromium"];
const CHROMIUM_KEYS = ["version", "revision", "platform", "sha256"];

const isPlainObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isPositiveInteger = (value) => Number.isSafeInteger(value) && value > 0;

/** 허용 목록에 없는 키가 있으면 오타를 조용히 넘기지 않도록 실패한다. */
function assertKnownKeys(value, allowed, where) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new Error(`${where}에 알 수 없는 키가 있다: ${key}`);
    }
  }
}

/**
 * baseline.json에서 읽은 값을 검증해 돌려준다.
 *
 * `chromeFloor`(공식 보증 하한)와 `chromium`(R8에서 실제 실행할 고정 빌드)은
 * 서로 다른 개념이라 값이 같아야 한다고 강제하지 않는다.
 *
 * @param {unknown} value
 * @returns {{ chromeFloor: number, esTarget: string, chromium: { version: string, revision: number, platform: string, sha256: string } }}
 */
export function parseBaseline(value) {
  if (!isPlainObject(value)) {
    throw new Error("baseline은 객체여야 한다");
  }
  assertKnownKeys(value, TOP_LEVEL_KEYS, "baseline");

  const { chromeFloor, esTarget, chromium } = value;
  if (!isPositiveInteger(chromeFloor)) {
    throw new Error("chromeFloor는 양의 정수여야 한다");
  }
  if (typeof esTarget !== "string" || !/^ES\d{4}$/.test(esTarget)) {
    throw new Error("esTarget은 `ES2019` 같은 형식의 문자열이어야 한다");
  }
  if (!isPlainObject(chromium)) {
    throw new Error("chromium은 객체여야 한다");
  }
  assertKnownKeys(chromium, CHROMIUM_KEYS, "chromium");
  if (
    typeof chromium.version !== "string" ||
    !/^\d+\.\d+\.\d+\.\d+$/.test(chromium.version)
  ) {
    throw new Error(
      "chromium.version은 `75.0.3765.0` 같은 네 자리 버전이어야 한다",
    );
  }
  if (!isPositiveInteger(chromium.revision)) {
    throw new Error("chromium.revision은 양의 정수여야 한다");
  }
  if (
    typeof chromium.platform !== "string" ||
    !/^[A-Za-z0-9_]+$/.test(chromium.platform)
  ) {
    throw new Error(
      "chromium.platform은 `Linux_x64` 같은 영숫자·밑줄 문자열이어야 한다",
    );
  }
  if (
    typeof chromium.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(chromium.sha256)
  ) {
    throw new Error("chromium.sha256은 소문자 hex 64자여야 한다");
  }

  return {
    chromeFloor,
    esTarget,
    chromium: {
      version: chromium.version,
      revision: chromium.revision,
      platform: chromium.platform,
      sha256: chromium.sha256,
    },
  };
}

/**
 * 저장소 루트의 baseline.json을 읽어 검증한다. 모든 게이트가 이 함수로 Chrome 하한을 읽는다.
 *
 * @param {string} [repoRoot]
 */
export function loadBaseline(repoRoot = defaultRepoRoot) {
  const file = join(repoRoot, "baseline.json");

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (cause) {
    throw new Error(`${file}을 읽을 수 없다: ${cause.message}`, { cause });
  }

  try {
    return parseBaseline(parsed);
  } catch (cause) {
    throw new Error(`${file}: ${cause.message}`, { cause });
  }
}
