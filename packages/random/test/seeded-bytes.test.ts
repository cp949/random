import { describe, expect, it } from "vitest";
import { seededBytes } from "./helpers/seeded-bytes.js";

describe("seededBytes", () => {
  it("같은 seed는 같은 바이트열을 낸다", () => {
    expect(seededBytes(7)(64)).toEqual(seededBytes(7)(64));
  });

  it("다른 seed는 다른 바이트열을 낸다", () => {
    expect(seededBytes(1)(64)).not.toEqual(seededBytes(2)(64));
  });

  it("요청한 길이만큼 돌려주고 0바이트도 허용한다", () => {
    const next = seededBytes(3);

    expect(next(0)).toHaveLength(0);
    expect(next(13)).toHaveLength(13);
    expect(next(13)).toBeInstanceOf(Uint8Array);
  });

  it("호출을 나눠도 이어 붙이면 한 번에 뽑은 것과 같다", () => {
    const split = seededBytes(9);
    const parts = [split(5), split(7), split(4), split(1)];
    const joined = Uint8Array.from(parts.flatMap((part) => [...part]));

    expect(joined).toEqual(seededBytes(9)(17));
  });

  it("연속 호출은 서로 다른 바이트를 낸다", () => {
    const next = seededBytes(5);

    expect(next(32)).not.toEqual(next(32));
  });

  it("바이트 값이 균등하게 분포한다(카이제곱)", () => {
    const bytes = seededBytes(1)(256 * 256);
    const counts = new Array<number>(256).fill(0);
    for (const value of bytes) counts[value] = (counts[value] ?? 0) + 1;
    const expected = bytes.length / 256;
    const chiSquare = counts.reduce(
      (sum, count) => sum + (count - expected) ** 2 / expected,
      0,
    );

    // 자유도 255에서 유의수준 0.001의 임계값은 약 330이다. seed가 고정이라 결과는 결정적이다.
    expect(chiSquare).toBeLessThan(330);
  });
});
