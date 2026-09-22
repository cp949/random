/**
 * `pickChars`의 rejection sampling과 요청 크기를 검증한다.
 * cutoff 이상의 바이트를 거부하지 않는 편향은 글자 빈도로도 드러나지만, 경계(예: n=3의 255, n=62의 248)는
 * 바이트를 직접 주입해야 정확히 확인된다. 라운드별 바이트 배열의 길이가 기대 요청 크기이므로
 * `ceil(remaining * 256 / cutoff)` 공식이 어긋나면 이 테스트가 실패한다.
 *
 * 이 파일은 `describe`를 쓰지 않는다. `sampling.ts`가 mutation 대상이라서다. Stryker 10.0.0의 vitest 러너는
 * `describe` 안의 테스트를 mutant 실행 때 선택하지 못한다(`uniform-int.test.ts` 머리말 참고). 분류는 제목 접두어로 한다.
 */
import { expect, it } from "vitest";
import { type ByteSource } from "../../src/internal/bytes.js";
import { pickChars } from "../../src/internal/sampling.js";
import { seededBytes } from "../helpers/seeded-bytes.js";

/** 서로 다른 BMP 문자 `count`개. 서로게이트 영역은 피한다. */
const bmpChars = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => String.fromCharCode(0x100 + i));

const chars3 = ["a", "b", "c"];

/**
 * 라운드별 바이트를 순서대로 돌려주는 `ByteSource`. 각 라운드 배열의 길이가 그 라운드에서 기대하는 요청 크기다.
 * 요청 크기가 다르거나 라운드가 모자라면 예외를 던진다. 실제 요청 크기는 `requests`에 남는다.
 */
function roundsSource(rounds: number[][]) {
  let round = 0;
  const requests: number[] = [];
  const source: ByteSource = (length) => {
    requests.push(length);
    const bytes = rounds[round];
    if (bytes === undefined) {
      throw new Error(`예상하지 못한 ${round + 1}번째 요청(길이 ${length})`);
    }
    round += 1;
    if (bytes.length !== length) {
      throw new Error(
        `${round}번째 요청 크기가 ${length}이다. 기대는 ${bytes.length}이다`,
      );
    }
    return Uint8Array.from(bytes);
  };
  return { source, requests };
}

it("n=3: 254는 수용해 254 % 3 = 2번 글자를 쓴다", () => {
  const { source, requests } = roundsSource([[254, 255]]);

  expect(pickChars(chars3, 1, source)).toBe("c");
  expect(requests).toEqual([2]);
});

it("n=3: 255는 cutoff와 같아 거부하고 다음 바이트를 쓴다", () => {
  const { source } = roundsSource([[255, 254]]);

  expect(pickChars(chars3, 1, source)).toBe("c");
});

it("n=3: 요청한 바이트를 모두 거부하면 남은 글자 수로 다시 요청한다", () => {
  const { source, requests } = roundsSource([
    [255, 255],
    [0, 0],
  ]);

  expect(pickChars(chars3, 1, source)).toBe("a");
  expect(requests).toEqual([2, 2]);
});

it("n=3: 필요한 글자보다 많이 요청하고 남는 바이트는 쓰지 않는다", () => {
  // ceil(4 * 256 / 255) = 5바이트를 요청하지만 앞의 4바이트만 쓴다.
  const { source, requests } = roundsSource([[0, 1, 2, 3, 4]]);

  expect(pickChars(chars3, 4, source)).toBe("abca");
  expect(requests).toEqual([5]);
});

it("n=3: 일부만 거부되면 부족한 만큼만 다시 요청한다", () => {
  // ceil(10 * 256 / 255) = 11바이트. 255 두 개가 거부되어 9글자를 얻고 1글자가 남아 ceil(256 / 255) = 2바이트를 다시 요청한다.
  const { source, requests } = roundsSource([
    [255, 0, 1, 2, 255, 3, 4, 5, 6, 7, 8],
    [9, 10],
  ]);

  expect(pickChars(chars3, 10, source)).toBe("abcabcabca");
  expect(requests).toEqual([11, 2]);
});

it("n=6: 251은 수용하고 252는 cutoff라 거부한다", () => {
  // 256 % 6 = 4라서 cutoff는 252다. 251 % 6 = 5.
  const chars6 = ["a", "b", "c", "d", "e", "f"];

  expect(pickChars(chars6, 1, roundsSource([[251, 252]]).source)).toBe("f");
  expect(pickChars(chars6, 1, roundsSource([[252, 251]]).source)).toBe("f");
});

it("n=62: 247은 수용하고 248은 cutoff라 거부한다", () => {
  // 256 % 62 = 8이라서 cutoff는 248이다. ceil(10 * 256 / 248) = 11바이트를 요청한다.
  const chars = bmpChars(62);
  const { source, requests } = roundsSource([
    [247, 248, 0, 1, 2, 3, 4, 5, 6, 7, 8],
  ]);

  const result = pickChars(chars, 10, source);

  expect(Array.from(result)).toEqual(
    [61, 0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => chars[i]),
  );
  expect(requests).toEqual([11]);
});

it("n=62: cutoff 이상의 바이트 248~255를 모두 거부하고 부족한 만큼 다시 요청한다", () => {
  // 11바이트 중 248~255 여덟 개가 거부되어 3글자를 얻고, 7글자가 남아 ceil(7 * 256 / 248) = 8바이트를 다시 요청한다.
  const chars = bmpChars(62);
  const { source, requests } = roundsSource([
    [248, 249, 250, 251, 252, 253, 254, 255, 0, 1, 2],
    [3, 4, 5, 6, 7, 8, 9, 10],
  ]);

  const result = pickChars(chars, 10, source);

  expect(Array.from(result)).toEqual(
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => chars[i]),
  );
  expect(requests).toEqual([11, 8]);
});

it("2의 거듭제곱 n=2: 모든 바이트를 수용하고 정확히 length바이트를 요청한다", () => {
  const { source, requests } = roundsSource([[0, 1, 2, 3, 255]]);

  expect(pickChars(["0", "1"], 5, source)).toBe("01011");
  expect(requests).toEqual([5]);
});

it("2의 거듭제곱 n=64: 128 이상의 바이트도 수용해 64로 나눈 나머지를 쓴다", () => {
  const chars = bmpChars(64);
  const { source, requests } = roundsSource([[63, 64, 127, 128, 255]]);

  const result = pickChars(chars, 5, source);

  expect(Array.from(result)).toEqual([63, 0, 63, 0, 63].map((i) => chars[i]));
  expect(requests).toEqual([5]);
});

it("2의 거듭제곱 n=256: 바이트 값이 그대로 글자 위치다", () => {
  const chars = bmpChars(256);
  const { source, requests } = roundsSource([[0, 255, 128]]);

  const result = pickChars(chars, 3, source);

  expect(Array.from(result)).toEqual([chars[0], chars[255], chars[128]]);
  expect(requests).toEqual([3]);
});

it("length가 0이면 난수원을 호출하지 않고 빈 문자열을 돌려준다", () => {
  const { source, requests } = roundsSource([]);

  expect(pickChars(chars3, 0, source)).toBe("");
  expect(requests).toEqual([]);
});

it("보충 평면 문자(이모지)를 이어 붙여도 코드 포인트 수가 length와 같다", () => {
  const { source } = roundsSource([[0, 1, 2, 3, 4]]);

  const result = pickChars(["😀", "😁", "😂"], 4, source);

  expect(result).toBe("😀😁😂😀");
  expect(Array.from(result)).toHaveLength(4);
  expect(result).toHaveLength(8);
});

it("chars 배열을 바꾸지 않는다", () => {
  const chars = Object.freeze(["a", "b", "c"]);

  expect(pickChars(chars, 2, roundsSource([[0, 1, 2]]).source)).toBe("ab");
  expect(chars).toEqual(["a", "b", "c"]);
});

/** 바이트를 하나씩 훑는 참조 구현. 요청 크기 열도 함께 돌려준다. */
function referencePick(
  chars: string[],
  length: number,
  nextBytes: (length: number) => Uint8Array,
): { result: string; requests: number[] } {
  const cutoff = 256 - (256 % chars.length);
  const requests: number[] = [];
  let result = "";
  let remaining = length;
  while (remaining > 0) {
    const request = Math.ceil((remaining * 256) / cutoff);
    requests.push(request);
    const accepted = [...nextBytes(request)].filter((byte) => byte < cutoff);
    for (const byte of accepted.slice(0, remaining)) {
      result += chars[byte % chars.length];
      remaining -= 1;
    }
  }
  return { result, requests };
}

const crossCheckSizes = [
  2, 3, 5, 6, 7, 10, 31, 32, 33, 62, 63, 64, 65, 127, 128, 129, 200, 255, 256,
];
const crossCheckLengths = [1, 2, 10, 100, 1000];

/** 같은 seed의 바이트 스트림으로 `pickChars`와 참조 구현을 함께 실행한다. */
function crossCheckCase(n: number, length: number) {
  const chars = bmpChars(n);
  const seed = 0x9e3779b9 ^ (n * 7919 + length);
  const requests: number[] = [];
  const nextBytes = seededBytes(seed);
  const source: ByteSource = (requested) => {
    requests.push(requested);
    return nextBytes(requested);
  };

  const result = pickChars(chars, length, source);
  const expected = referencePick(chars, length, seededBytes(seed));
  return { n, length, result, requests, expected };
}

it("참조 구현 교차 검증: 여러 n과 length에서 결과와 요청 크기 열이 같다", () => {
  for (const n of crossCheckSizes) {
    for (const length of crossCheckLengths) {
      const { result, requests, expected } = crossCheckCase(n, length);

      expect({ n, length, result, requests }).toEqual({
        n,
        length,
        result: expected.result,
        requests: expected.requests,
      });
    }
  }
});

it("참조 구현 교차 검증: 거부로 재요청이 필요해진 조합이 실제로 있다", () => {
  // 첫 요청은 수용 개수의 기댓값에 맞추므로 절반쯤은 모자라 다시 요청한다. 교차 검증이 그 경로를 지나가는지 확인한다
  // (참조와 구현이 함께 재요청 경로를 건너뛰는 위장 방지). seed가 고정이라 결과는 재현된다.
  const multiRound = crossCheckSizes.flatMap((n) =>
    crossCheckLengths.filter(
      (length) => crossCheckCase(n, length).requests.length > 1,
    ),
  );

  expect(multiRound.length).toBeGreaterThan(10);
});
