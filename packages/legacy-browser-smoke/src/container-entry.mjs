/**
 * 컨테이너 안에서 실행하는 진입점. 정적 서버를 띄우고 `SMOKE_CHROME`이 가리키는 floor 빌드를
 * `--headless --dump-dom`으로 구동한 뒤 chrome의 stdout을 그대로 stdout으로 흘려보낸다.
 * 결과 판정은 host의 runner(`run.mjs`)가 stdout을 파싱해서 한다.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildChromeArgs } from "./chrome-flags.mjs";
import { runProcess } from "./spawn-async.mjs";
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
    const result = await runProcess(
      chrome,
      buildChromeArgs({ url, userDataDir }),
      {
        timeout: 120_000,
      },
    );
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exitCode = result.status === 0 ? 0 : 1;
  } finally {
    await server.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

await main();
