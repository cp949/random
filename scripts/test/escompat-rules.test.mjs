import esX from "eslint-plugin-es-x";
import { describe, expect, it } from "vitest";
import {
  ESCOMPAT_RULES,
  presetName,
  rulesAllowedAt,
} from "../escompat-rules.mjs";

const presetRules = Object.keys(
  esX.configs["flat/restrict-to-es2019"].rules ?? {},
);

describe("presetName", () => {
  it("esTarget에서 es-x 프리셋 이름을 만든다", () => {
    expect(presetName("ES2019")).toBe("flat/restrict-to-es2019");
    expect(presetName("ES2022")).toBe("flat/restrict-to-es2022");
  });

  it("만든 프리셋 이름이 es-x에 실제로 존재한다", () => {
    expect(esX.configs[presetName("ES2019")]).toBeDefined();
  });
});

describe("ESCOMPAT_RULES 표", () => {
  it("모든 규칙 이름이 es2019 프리셋에 실제로 있다(오타·플러그인 갱신 검출)", () => {
    const unknown = ESCOMPAT_RULES.filter(
      (entry) => !presetRules.includes(entry.rule),
    ).map((entry) => entry.rule);

    expect(unknown).toEqual([]);
  });

  it("규칙 이름이 중복되지 않는다", () => {
    const names = ESCOMPAT_RULES.map((entry) => entry.rule);

    expect(new Set(names).size).toBe(names.length);
  });

  it("모든 항목이 양의 정수 since와 근거 설명을 가진다", () => {
    for (const entry of ESCOMPAT_RULES) {
      expect(Number.isInteger(entry.since) && entry.since > 0).toBe(true);
      expect(entry.feature.length).toBeGreaterThan(0);
    }
  });

  it("geul 출발점 8개는 MDN 대조 결과와 같은 버전이다", () => {
    const since = Object.fromEntries(
      ESCOMPAT_RULES.map((entry) => [entry.rule, entry.since]),
    );

    expect(since).toMatchObject({
      "es-x/no-bigint": 67,
      "es-x/no-dynamic-import": 63,
      "es-x/no-export-ns-from": 72,
      "es-x/no-global-this": 71,
      "es-x/no-import-meta": 64,
      "es-x/no-numeric-separators": 75,
      "es-x/no-string-prototype-matchall": 73,
      "es-x/no-symbol-matchall": 73,
    });
  });

  it("geul 목록에 없던 Chrome 75 이하 지원 기능(클래스 필드, private 필드, hashbang)을 포함한다", () => {
    const since = Object.fromEntries(
      ESCOMPAT_RULES.map((entry) => [entry.rule, entry.since]),
    );

    expect(since).toMatchObject({
      "es-x/no-class-instance-fields": 72,
      "es-x/no-class-static-fields": 72,
      "es-x/no-class-private-fields": 74,
      "es-x/no-hashbang": 74,
    });
  });
});

describe("rulesAllowedAt", () => {
  it("floor 75에서는 since가 75 이하인 규칙만 끈다", () => {
    const allowed = rulesAllowedAt(75);

    expect(allowed["es-x/no-numeric-separators"]).toBe("off");
    expect(allowed["es-x/no-class-private-fields"]).toBe("off");
    expect(allowed["es-x/no-promise-all-settled"]).toBeUndefined();
    expect(allowed["es-x/no-optional-chaining"]).toBeUndefined();
  });

  it("floor가 since와 같으면 허용하고 하나 낮으면 허용하지 않는다", () => {
    expect(rulesAllowedAt(75)["es-x/no-numeric-separators"]).toBe("off");
    expect(rulesAllowedAt(74)["es-x/no-numeric-separators"]).toBeUndefined();
  });

  it("floor를 올리면 더 많은 규칙이 풀린다", () => {
    expect(Object.keys(rulesAllowedAt(80)).length).toBeGreaterThan(
      Object.keys(rulesAllowedAt(75)).length,
    );
    expect(rulesAllowedAt(80)["es-x/no-optional-chaining"]).toBe("off");
  });

  it("표에 없는 프리셋 규칙은 어떤 floor에서도 풀리지 않는다", () => {
    const allowed = rulesAllowedAt(999);
    const listed = new Set(ESCOMPAT_RULES.map((entry) => entry.rule));
    const neverAllowed = presetRules.filter((rule) => !listed.has(rule));

    expect(neverAllowed.length).toBeGreaterThan(0);
    for (const rule of neverAllowed) {
      expect(allowed[rule]).toBeUndefined();
    }
  });
});
