/**
 * CDP 결과 회수(`src/cdp-result.mjs`)와 Chrome 실행 인자(`src/chrome-flags.mjs`)의 순수 함수 테스트.
 * Chrome을 띄우는 실행 경로는 `pnpm smoke:legacy-browser`가 검증한다.
 */
import { describe, expect, it } from "vitest";
import { buildChromeArgs } from "../src/chrome-flags.mjs";
import {
  formatResultElement,
  isDoneTitle,
  parseDevtoolsPort,
} from "../src/cdp-result.mjs";
import { extractResult } from "../src/run.mjs";

describe("parseDevtoolsPort", () => {
  it("Chrome stderr의 DevTools 줄에서 포트를 읽는다", () => {
    const stderr =
      "[1114/013751.914442:ERROR:foo] bar\nDevTools listening on ws://127.0.0.1:35679/devtools/browser/0a1b-2c\n";

    expect(parseDevtoolsPort(stderr)).toBe(35679);
  });

  it("DevTools 줄이 없으면 null이다", () => {
    expect(parseDevtoolsPort("Waited 3 ms for network service")).toBeNull();
  });

  it("loopback이 아닌 주소는 읽지 않는다", () => {
    expect(
      parseDevtoolsPort("DevTools listening on ws://0.0.0.0:9222/devtools/x"),
    ).toBeNull();
  });
});

describe("isDoneTitle", () => {
  it("SMOKE PASS와 SMOKE FAIL만 완료로 본다", () => {
    expect(isDoneTitle("SMOKE PASS")).toBe(true);
    expect(isDoneTitle("SMOKE FAIL")).toBe(true);
  });

  it("실행 중 제목과 문자열이 아닌 값은 완료가 아니다", () => {
    expect(isDoneTitle("smoke")).toBe(false);
    expect(isDoneTitle("SMOKE PASS ")).toBe(false);
    expect(isDoneTitle(undefined)).toBe(false);
  });
});

describe("formatResultElement", () => {
  it("extractResult가 그대로 읽는 형식이다", () => {
    const payload = {
      ok: true,
      assertions: [{ id: "W1", ok: true, detail: "a < b & c" }],
    };
    const text = encodeURIComponent(JSON.stringify(payload));

    expect(extractResult(formatResultElement(text))).toEqual(payload);
  });
});

describe("buildChromeArgs", () => {
  const args = buildChromeArgs({
    url: "http://127.0.0.1:1234/?a=b",
    userDataDir: "/tmp/udd",
  });

  it("CDP 포트를 임의로 열고 URL을 마지막 인자로 넘긴다", () => {
    expect(args).toContain("--remote-debugging-port=0");
    expect(args.at(-1)).toBe("http://127.0.0.1:1234/?a=b");
    expect(args).toContain("--user-data-dir=/tmp/udd");
  });

  it("가상 시간과 DOM 덤프 인자를 쓰지 않는다", () => {
    expect(args.some((arg) => arg.startsWith("--virtual-time-budget"))).toBe(
      false,
    );
    expect(args).not.toContain("--dump-dom");
  });
});
