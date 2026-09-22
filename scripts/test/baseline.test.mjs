/**
 * baseline.json의 형식(chromeFloor, esTarget, chromium)을 읽고 검증하는
 * loadBaseline·parseBaseline 테스트. 올바른 값, 저장소 루트 지정, 파일 부재,
 * 문법 오류, 필드별 형식 위반, 알 수 없는 키를 다룬다.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadBaseline, parseBaseline } from "../baseline.mjs";

const valid = {
  chromeFloor: 75,
  esTarget: "ES2019",
  chromium: {
    version: "75.0.3765.0",
    revision: 650583,
    platform: "Linux_x64",
    sha256: "10ae4e05d9f01a8b646dd2ccc2ac1135e597c472abe5be71552aae7d8a35e2ac",
  },
};

const tempDirs = [];

/** baseline.json 내용을 담은 임시 저장소 루트를 만든다. */
function makeRepo(baselineText) {
  const dir = mkdtempSync(join(tmpdir(), "baseline-"));
  tempDirs.push(dir);
  if (baselineText !== undefined) {
    writeFileSync(join(dir, "baseline.json"), baselineText);
  }
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("loadBaseline", () => {
  it("저장소의 baseline.json을 읽어 Chrome 75 하한과 ES2019 타깃을 돌려준다", () => {
    expect(loadBaseline()).toEqual(valid);
  });

  it("지정한 저장소 루트의 baseline.json을 읽는다", () => {
    const root = makeRepo(JSON.stringify({ ...valid, chromeFloor: 99 }));

    expect(loadBaseline(root).chromeFloor).toBe(99);
  });

  it("baseline.json이 없으면 파일 경로가 담긴 오류로 실패한다", () => {
    const root = makeRepo();

    expect(() => loadBaseline(root)).toThrow(join(root, "baseline.json"));
  });

  it("JSON 문법 오류는 파일 경로가 담긴 오류로 실패한다", () => {
    const root = makeRepo("{ chromeFloor: 75");

    expect(() => loadBaseline(root)).toThrow(join(root, "baseline.json"));
  });

  it("형식 위반은 파일 경로가 담긴 오류로 실패한다", () => {
    const root = makeRepo(JSON.stringify({ ...valid, chromeFloor: "75" }));

    expect(() => loadBaseline(root)).toThrow(join(root, "baseline.json"));
  });
});

describe("parseBaseline", () => {
  it("올바른 값은 그대로 돌려준다", () => {
    expect(parseBaseline(valid)).toEqual(valid);
  });

  it.each([
    ["null", null, /객체/],
    ["배열", [], /객체/],
    ["문자열", "ES2019", /객체/],
  ])("최상위 값이 %s이면 거부한다", (_이름, value, message) => {
    expect(() => parseBaseline(value)).toThrow(message);
  });

  it.each([
    ["누락", undefined],
    ["문자열", "75"],
    ["소수", 75.5],
    ["0", 0],
    ["음수", -75],
  ])("chromeFloor가 %s이면 거부한다", (_이름, value) => {
    const input = { ...valid, chromeFloor: value };
    if (value === undefined) delete input.chromeFloor;

    expect(() => parseBaseline(input)).toThrow(/chromeFloor/);
  });

  it.each([
    ["누락", undefined],
    ["소문자", "es2019"],
    ["연도 자리수 부족", "ES19"],
    ["공백 포함", "ES2019 "],
    ["숫자", 2019],
  ])("esTarget이 %s이면 거부한다", (_이름, value) => {
    const input = { ...valid, esTarget: value };
    if (value === undefined) delete input.esTarget;

    expect(() => parseBaseline(input)).toThrow(/esTarget/);
  });

  it.each([
    ["누락", undefined],
    ["문자열", "75.0.3765.0"],
    ["null", null],
  ])("chromium이 %s이면 거부한다", (_이름, value) => {
    const input = { ...valid, chromium: value };
    if (value === undefined) delete input.chromium;

    expect(() => parseBaseline(input)).toThrow(/chromium/);
  });

  it.each([
    ["누락", undefined],
    ["세 자리 버전", "75.0.3765"],
    ["숫자", 75],
  ])("chromium.version이 %s이면 거부한다", (_이름, value) => {
    const chromium = { ...valid.chromium, version: value };
    if (value === undefined) delete chromium.version;

    expect(() => parseBaseline({ ...valid, chromium })).toThrow(
      /chromium\.version/,
    );
  });

  it.each([
    ["누락", undefined],
    ["문자열", "650583"],
    ["0", 0],
    ["소수", 1.5],
  ])("chromium.revision이 %s이면 거부한다", (_이름, value) => {
    const chromium = { ...valid.chromium, revision: value };
    if (value === undefined) delete chromium.revision;

    expect(() => parseBaseline({ ...valid, chromium })).toThrow(
      /chromium\.revision/,
    );
  });

  it.each([
    ["누락", undefined],
    ["빈 문자열", ""],
    ["슬래시 포함", "Linux_x64/"],
    ["공백 포함", "Linux x64"],
    ["숫자", 64],
  ])("chromium.platform이 %s이면 거부한다", (_이름, value) => {
    const chromium = { ...valid.chromium, platform: value };
    if (value === undefined) delete chromium.platform;

    expect(() => parseBaseline({ ...valid, chromium })).toThrow(
      /chromium\.platform/,
    );
  });

  it.each([
    ["누락", undefined],
    ["63자", "10ae4e05d9f01a8b646dd2ccc2ac1135e597c472abe5be71552aae7d8a35e2a"],
    [
      "65자",
      "10ae4e05d9f01a8b646dd2ccc2ac1135e597c472abe5be71552aae7d8a35e2acc",
    ],
    [
      "대문자 hex",
      "10AE4E05D9F01A8B646DD2CCC2AC1135E597C472ABE5BE71552AAE7D8A35E2AC",
    ],
    [
      "hex 아닌 문자 포함",
      "g0ae4e05d9f01a8b646dd2ccc2ac1135e597c472abe5be71552aae7d8a35e2ac",
    ],
    ["숫자", 1],
  ])("chromium.sha256이 %s이면 거부한다", (_이름, value) => {
    const chromium = { ...valid.chromium, sha256: value };
    if (value === undefined) delete chromium.sha256;

    expect(() => parseBaseline({ ...valid, chromium })).toThrow(
      /chromium\.sha256/,
    );
  });

  it("최상위의 알 수 없는 키는 오타를 막기 위해 거부한다", () => {
    expect(() => parseBaseline({ ...valid, chromeFlor: 75 })).toThrow(
      /chromeFlor/,
    );
  });

  it("chromium 안의 알 수 없는 키도 거부한다", () => {
    const chromium = { ...valid.chromium, channel: "stable" };

    expect(() => parseBaseline({ ...valid, chromium })).toThrow(/channel/);
  });
});
