/**
 * Chrome을 띄워 smoke 페이지가 `#result`에 쓴 결과를 raw CDP로 회수한다(spec 4.5 SM-5 fallback 1). 의존성은 없다:
 * Node 내장 `WebSocket`과 `fetch`만 쓴다.
 *
 * `--dump-dom` + `--virtual-time-budget`은 가상 시간이 먼저 끝나면 결과를 쓰기 전에 DOM을 덤프한다. 모듈 약 40개를
 * `import()`하는 로딩과 Worker 스레드 응답을 기다리지 못해, 같은 빌드에서도 실행마다 결과가 비는 경우가 있었다.
 * 이 방식은 실제 시간으로 `document.title`이 `SMOKE PASS|FAIL`이 될 때까지 기다린다.
 * 결과가 끝내 안 오면 `null`을 돌려주고, 호출부의 `judge`가 FAIL로 판정한다(fail-closed).
 */
import { spawn } from "node:child_process";

const DEVTOOLS_LINE = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//;
const DONE_TITLE = /^SMOKE (PASS|FAIL)$/;
const POLL_INTERVAL_MS = 100;

/**
 * Chrome이 stderr에 쓰는 `DevTools listening on ws://127.0.0.1:<port>/...` 줄에서 포트를 읽는다.
 *
 * @param {string} stderrText
 * @returns {number | null}
 */
export function parseDevtoolsPort(stderrText) {
  const match = DEVTOOLS_LINE.exec(stderrText);
  return match ? Number(match[1]) : null;
}

/**
 * 페이지 제목이 판정이 끝났음을 뜻하는지 본다(`page/smoke.js`의 `writeResult`가 제목을 바꾼다).
 *
 * @param {unknown} title
 */
export function isDoneTitle(title) {
  return typeof title === "string" && DONE_TITLE.test(title);
}

/**
 * 결과 텍스트를 `<pre id="result">` 요소 문자열로 감싼다. 컨테이너 entry가 이 형식으로 stdout에 내보내고
 * host의 `extractResult`가 같은 형식을 읽는다.
 *
 * @param {string} text
 */
export function formatResultElement(text) {
  return `<pre id="result">${text}</pre>`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 조건이 참인 값을 돌려줄 때까지 `deadline`(epoch ms)까지 반복한다. 끝내 못 얻으면 `null`. */
async function waitFor(produce, deadline) {
  while (Date.now() < deadline) {
    try {
      const value = await produce();
      if (value) return value;
    } catch {
      // 아직 준비되지 않았다. 마감까지 다시 시도한다.
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return null;
}

/** CDP 명령을 보내고 응답을 기다리는 최소 클라이언트. */
function createCdpClient(socket) {
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const resolve = pending.get(message.id);
    if (resolve) {
      pending.delete(message.id);
      resolve(message);
    }
  });
  return {
    send(method, params = {}) {
      nextId += 1;
      const id = nextId;
      return new Promise((resolve) => {
        pending.set(id, resolve);
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

/**
 * `Runtime.evaluate`로 식을 평가해 값을 돌려준다. 오류나 값 없음은 `undefined`.
 *
 * @param {{ send(method: string, params?: object): Promise<any> }} client
 * @param {string} expression
 */
async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
  });
  return response.result?.result?.value;
}

/**
 * Chrome을 띄워 `url`을 열고 `#result`의 textContent를 돌려준다.
 *
 * @param {{ chromeBinary: string, args: string[], timeoutMs?: number }} options
 *   `args`는 `--remote-debugging-port=0`과 열 URL을 포함해야 한다(`buildChromeArgs`).
 * @returns {Promise<{ text: string | null, stderr: string }>}
 */
export async function runChromeForResult({
  chromeBinary,
  args,
  timeoutMs = 60_000,
}) {
  const deadline = Date.now() + timeoutMs;
  const chrome = spawn(chromeBinary, args);
  let stderr = "";
  chrome.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  chrome.stdout.resume();
  const exited = new Promise((resolve) => chrome.on("close", resolve));
  let socket = null;

  try {
    const port = await waitFor(() => parseDevtoolsPort(stderr), deadline);
    if (port === null) return { text: null, stderr };

    const target = await waitFor(async () => {
      const targets = await (
        await fetch(`http://127.0.0.1:${port}/json/list`)
      ).json();
      return targets.find((item) => item.type === "page");
    }, deadline);
    if (!target) return { text: null, stderr };

    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    const client = createCdpClient(socket);

    const done = await waitFor(
      async () => isDoneTitle(await evaluate(client, "document.title")),
      deadline,
    );
    if (!done) return { text: null, stderr };

    const text = await evaluate(
      client,
      'document.getElementById("result").textContent',
    );
    return { text: typeof text === "string" && text ? text : null, stderr };
  } finally {
    if (socket) socket.close();
    chrome.kill("SIGKILL");
    await exited;
  }
}
