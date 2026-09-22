/**
 * smoke 페이지·패키지 파일을 서빙하는 최소 정적 서버. 컨테이너 안(`container-entry.mjs`)과
 * 로컬(`run.mjs`)이 공유한다. Node 내장 `http`만 쓴다(런타임 의존성 0).
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const CONTENT_TYPES = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".html": "text/html; charset=utf-8",
};

/** `extname`이 돌려주는 확장자에 대응하는 content-type. 없으면 옥텟 스트림. */
function contentTypeFor(path) {
  return CONTENT_TYPES[extname(path)] ?? "application/octet-stream";
}

/**
 * `root` 밖으로 벗어나지 않는 요청 경로를 절대 경로로 만든다. 벗어나면 `null`.
 * `..`를 포함한 요청이 `resolve` 뒤 `root` 접두사를 잃는 것으로 판정한다.
 */
function resolveWithinRoot(root, requestPath) {
  const resolved = resolve(root, `.${requestPath}`);
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    return null;
  }
  return resolved;
}

/**
 * `pageDir`·`pkgDir`를 서빙하는 서버를 띄운다. 라우팅: `/` → `pageDir/index.html`,
 * `/<file>` → `pageDir/<file>`, `/pkg/<path>` → `pkgDir/<path>`. 없는 파일은 404.
 *
 * @param {{ pageDir: string, pkgDir: string, host?: string, port?: number }} options
 * @returns {Promise<{ port: number, close(): Promise<void> }>}
 */
export function startServer({ pageDir, pkgDir, host = "127.0.0.1", port = 0 }) {
  const pageRoot = resolve(pageDir);
  const pkgRoot = resolve(pkgDir);

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://smoke.invalid");
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;

    let file;
    if (pathname.startsWith("/pkg/")) {
      file = resolveWithinRoot(pkgRoot, pathname.slice("/pkg".length));
    } else {
      file = resolveWithinRoot(pageRoot, pathname);
    }

    if (!file) {
      response.writeHead(404).end("not found");
      return;
    }

    readFile(file)
      .then((body) => {
        response
          .writeHead(200, { "content-type": contentTypeFor(file) })
          .end(body);
      })
      .catch(() => {
        response.writeHead(404).end("not found");
      });
  });

  return new Promise((resolvePromise, rejectPromise) => {
    server.on("error", rejectPromise);
    server.listen(port, host, () => {
      const address = server.address();
      resolvePromise({
        port: typeof address === "object" && address ? address.port : port,
        close: () =>
          new Promise((resolveClose) => server.close(() => resolveClose())),
      });
    });
  });
}
