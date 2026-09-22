import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { importFresh } from "./helpers/import-fresh.js";

const statefulPath = fileURLToPath(
  new URL("./helpers/fixtures/stateful.ts", import.meta.url),
);

interface Stateful {
  next(): number;
}

describe("importFresh", () => {
  it("호출할 때마다 모듈 상태가 새로 만들어진다", async () => {
    const first = await importFresh<Stateful>(statefulPath);
    expect(first.next()).toBe(1);
    expect(first.next()).toBe(2);

    const second = await importFresh<Stateful>(statefulPath);
    expect(second.next()).toBe(1);
  });

  it("일반 동적 import는 캐시된 같은 인스턴스를 공유한다", async () => {
    const a = await import("./helpers/fixtures/stateful.js");
    const b = await import("./helpers/fixtures/stateful.js");

    expect(a).toBe(b);
  });
});
