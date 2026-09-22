/**
 * 컨테이너·로컬 실행이 공유하는 Chrome 실행 인자. `--dump-dom`은 페이지가 `<pre id="result">`에 쓴
 * 최종 DOM을 stdout으로 직렬화한다(spec 4.1). `--no-sandbox`는 컨테이너에 user namespace가 없어서
 * 필요하며 JS 의미론과 무관하다(검증 한계).
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
    "--virtual-time-budget=10000",
    "--dump-dom",
    `--user-data-dir=${userDataDir}`,
    url,
  ];
}
