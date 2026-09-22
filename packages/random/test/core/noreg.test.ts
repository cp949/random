/**
 * `int`·`uniform`의 non-regression 스냅샷. 이 값들은 계약이 아니다(`docs/api/random-core.md` "재현성"
 * 절). 특정 시점의 결과를 고정해 산식이 의도치 않게 바뀌는 것을 잡는다. 산식을 바꿀 때는 CHANGELOG에
 * 기록하고 `vitest -u`로 갱신한다.
 *
 * `toMatchInlineSnapshot`은 같은 호출 위치에서 서로 다른 값을 기록할 수 없으므로 seed 루프 대신
 * helper마다 테스트 하나를 두고 seed별 결과를 객체 하나로 묶어 기록한다.
 *
 * 이 파일은 `describe`를 쓰지 않는다(TRP-004).
 */
import { expect, it } from "vitest";
import { int } from "../../src/core/int.js";
import { uniform } from "../../src/core/uniform.js";
import { createXoshiro128Source } from "../../src/core/xoshiro128.js";

const SEEDS: Array<number | string> = [0, 42, "hello"];

/** seed마다 새 source를 만들어 `fn`을 `count`번 호출한 결과를 seed 문자열 키로 모은다. */
function perSeed<T>(
  count: number,
  fn: (source: () => number) => T,
): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const seed of SEEDS) {
    const source = createXoshiro128Source(seed);
    result[String(seed)] = Array.from({ length: count }, () => fn(source));
  }
  return result;
}

it('noreg: seed 0·42·"hello"의 int(1, 6) 5개', () => {
  expect(perSeed(5, (source) => int(source, 1, 6))).toMatchInlineSnapshot(`
    {
      "0": [
        4,
        4,
        4,
        3,
        2,
      ],
      "42": [
        6,
        1,
        1,
        2,
        2,
      ],
      "hello": [
        1,
        3,
        4,
        2,
        5,
      ],
    }
  `);
});

it('noreg: seed 0·42·"hello"의 int(0, 2^40) 3개(53비트 경로)', () => {
  expect(perSeed(3, (source) => int(source, 0, 2 ** 40)))
    .toMatchInlineSnapshot(`
    {
      "0": [
        394148447023,
        1084670226439,
        4303836280,
      ],
      "42": [
        11006777934,
        948817525956,
        142984404392,
      ],
      "hello": [
        317253387456,
        89235138247,
        545935220314,
      ],
    }
  `);
});

it('noreg: seed 0·42·"hello"의 uniform(-1, 1) 3개', () => {
  expect(perSeed(3, (source) => uniform(source, -1, 1))).toMatchInlineSnapshot(`
    {
      "0": [
        -0.8036240820611,
        0.7246062389682026,
        -0.7941880523850744,
      ],
      "42": [
        0.6367210233616343,
        -0.15042437741464254,
        -0.12032965881896418,
      ],
      "hello": [
        0.38141782382595113,
        -0.935038629521806,
        -0.5152595920793832,
      ],
    }
  `);
});
