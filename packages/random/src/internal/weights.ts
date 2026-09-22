import { assertArray } from "./validate.js";

/**
 * 가중치를 검증하고 합계(`total`)를 돌려준다(design spec 6절 WT-1~WT-7). `weightedChoice`와
 * `createWeightedSampler`가 공유한다. 검증 순서: WT-1(배열) → WT-2(길이 일치) →
 * WT-3·WT-4(원소 검사와 누적을 한 번의 순회로 함께 한다).
 *
 * @throws {RangeError} `weights`가 배열이 아닐 때. `weights.length`가 `expectedLength`와 다를
 * 때. 원소가 `typeof "number"`가 아니거나 유한하지 않거나 음수일 때(첫 위반에서 던진다).
 * 누적 합계가 `Infinity`로 넘칠 때. 최종 합계가 `0`일 때(빈 배열, 전부 0 가중치 포함).
 */
export function validateWeights(
  weights: unknown,
  expectedLength: number,
): number {
  assertArray(weights, "weights");
  const list = weights as unknown[];
  if (list.length !== expectedLength) {
    throw new RangeError("weights.length must equal items.length");
  }

  let total = 0;
  for (const weight of list) {
    if (!Number.isFinite(weight) || (weight as number) < 0) {
      throw new RangeError(
        "weights must contain finite numbers that are 0 or greater",
      );
    }
    total += weight as number;
    if (!Number.isFinite(total)) {
      throw new RangeError("total weight must not overflow to Infinity");
    }
  }
  if (total <= 0) {
    throw new RangeError("total weight must be greater than 0");
  }
  return total;
}

/**
 * `threshold`(`[0, total)`)에 대해 왼쪽에서 오른쪽으로 누적합을 스캔하며 `threshold < cumulative`인
 * 첫 인덱스를 돌려준다. 누적합 배열을 할당하지 않는다(`weightedChoice`가 호출마다 쓰므로 O(1) 추가
 * 메모리를 지킨다). 부동소수점 반올림으로 끝까지 조건을 만족하는 인덱스가 없으면 가중치가 양수인
 * 마지막 인덱스를 돌려준다(fallback). `weights`는 이미 `validateWeights`를 통과했다고 가정한다.
 */
export function scanWeightedIndex(
  weights: readonly number[],
  threshold: number,
): number {
  let cumulative = 0;
  let lastPositive = -1;
  // Stryker disable next-line EqualityOperator: i <= weights.length는 마지막에 항상 undefined
  // 원소를 한 번 더 보는 것과 같고, threshold < undefined는 항상 false라 lastPositive도 조기 반환도
  // 바꾸지 못한다(진짜 동치 mutant, 직접 추적으로 확인).
  for (let i = 0; i < weights.length; i += 1) {
    const weight = weights[i]!;
    if (weight > 0) lastPositive = i;
    cumulative += weight;
    if (threshold < cumulative) return i;
  }
  return lastPositive;
}

/** `createWeightedSampler`가 생성 시 미리 계산해 클로저에 두는 값. */
export interface WeightedIndex {
  /** 왼쪽에서 오른쪽으로 더한 부분합. `cumulative[i] === weights[0] + ... + weights[i]`. */
  readonly cumulative: readonly number[];
  /** 가중치가 양수인 마지막 인덱스(fallback). `validateWeights`가 통과했으므로 항상 `0` 이상이다. */
  readonly lastPositive: number;
}

/**
 * 누적합 배열과 가중치가 양수인 마지막 인덱스를 한 번의 순회로 만든다. `createWeightedSampler`가
 * 생성 시 1회 호출한다. `weights`는 이미 `validateWeights`를 통과했다고 가정한다.
 */
export function buildWeightedIndex(weights: readonly number[]): WeightedIndex {
  // Stryker disable next-line ArrayDeclaration: new Array()로 시작해도 이어지는 루프가
  // cumulative[i]=sum을 인덱스 0부터 순서대로 대입해 배열을 그대로 채우므로(구멍 없음) 최종
  // 배열이 동일하다(동치 mutant, 사전 크기 지정은 성능 최적화일 뿐).
  const cumulative: number[] = new Array<number>(weights.length);
  let sum = 0;
  let lastPositive = -1;
  for (let i = 0; i < weights.length; i += 1) {
    const weight = weights[i]!;
    if (weight > 0) lastPositive = i;
    sum += weight;
    cumulative[i] = sum;
  }
  return { cumulative, lastPositive };
}

/**
 * `buildWeightedIndex`가 만든 누적합 배열에서 이진 탐색으로 `threshold < cumulative[i]`인
 * 최소 `i`를 찾는다. `scanWeightedIndex`와 같은 선택 조건과 같은 fallback을 쓰므로 같은 `weights`·
 * 같은 `threshold`에서 두 함수는 같은 인덱스를 돌려준다(design spec FN-7).
 */
export function searchWeightedIndex(
  index: WeightedIndex,
  threshold: number,
): number {
  const { cumulative, lastPositive } = index;
  let lo = 0;
  // Stryker disable next-line ArithmeticOperator: hi를 length+1로 넓혀도 그 구간의
  // cumulative는 undefined라 항상 threshold보다 "작다"고 취급돼(비교가 항상 false) lo가
  // 그 구간을 그냥 지나칠 뿐 최종 lo·fallback 결과를 바꾸지 못한다(여러 배열·threshold 조합으로
  // 직접 추적해 동치임을 확인).
  let hi = cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (threshold < cumulative[mid]!) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return threshold < cumulative[lo]! ? lo : lastPositive;
}
