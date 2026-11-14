/**
 * 컨테이너 안에서 실행하는 진입점. 정적 서버를 띄우고 `SMOKE_CHROME`이 가리키는 floor 빌드를 headless로
 * 구동해 CDP로 `#result`를 읽고(`cdp-result.mjs`), `<pre id="result">…</pre>` 형식으로 stdout에 쓴다.
 * 결과 판정은 host의 runner(`run.mjs`)가 stdout을 파싱해서 한다. 결과를 못 받으면 아무것도 쓰지 않고 실패한다.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildChromeArgs } from "./chrome-flags.mjs";
import { formatResultElement, runChromeForResult } from "./cdp-result.mjs";
import { startServer } from "./serve.mjs";

/** query 문자열 형태의 URL을 만든다. */
function buildUrl(port, { expectRandomUUID, expectChromeVersion }) {
  const params = new URLSearchParams({
    expectRandomUUID: expectRandomUUID ?? "",
    expectChromeVersion: expectChromeVersion ?? "",
  });
  return `http://127.0.0.1:${port}/?${params.toString()}`;
}

async function main() {
  const chrome = process.env.SMOKE_CHROME;
  if (!chrome) {
    console.error("SMOKE_CHROME 환경변수가 없다");
    process.exitCode = 1;
    return;
  }

  const server = await startServer({
    pageDir: "/smoke/page",
    pkgDir: "/smoke/pkg",
  });
  const userDataDir = mkdtempSync(join(tmpdir(), "smoke-chrome-"));
  try {
    const url = buildUrl(server.port, {
      expectRandomUUID: process.env.SMOKE_EXPECT_RANDOM_UUID,
      expectChromeVersion: process.env.SMOKE_EXPECT_CHROME_VERSION,
    });
    const result = await runChromeForResult({
      chromeBinary: chrome,
      args: buildChromeArgs({ url, userDataDir }),
      timeoutMs: 120_000,
    });
    if (result.text) process.stdout.write(formatResultElement(result.text));
    process.exitCode = result.text ? 0 : 1;
  } finally {
    await server.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

await main();
