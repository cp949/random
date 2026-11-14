/**
 * 컨테이너·로컬 실행이 공유하는 Chrome 실행 인자. 결과는 `--remote-debugging-port`로 연 CDP에서 읽는다
 * (`cdp-result.mjs`). `--no-sandbox`는 컨테이너에 user namespace가 없어서 필요하며 JS 의미론과 무관하다(검증 한계).
 * `--remote-allow-origins=*`는 Chrome 111+가 Origin이 있는 DevTools WebSocket을 거부하는 것에 대비한다
 * (Chrome 75는 이 인자를 모르고 무시한다).
 *
 * @param {{ url: string, userDataDir: string }} options
 * @returns {string[]}
 */
export function buildChromeArgs({ url, userDataDir }) {
  return [
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--remote-debugging-port=0",
    "--remote-allow-origins=*",
    `--user-data-dir=${userDataDir}`,
    url,
  ];
}
