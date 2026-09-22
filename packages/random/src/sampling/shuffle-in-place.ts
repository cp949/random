import {
  assertRandomSource,
  type RandomSource,
} from "../core/random-source.js";
import { assertArray } from "../internal/validate.js";
import { uniformInt } from "../internal/uniform-int.js";

/**
 * 뒤에서 앞으로 가는 Fisher-Yates. `items`를 제자리에서 섞고 같은 참조를 돌려준다.
 * `i = items.length - 1`부터 `i > 0`인 동안 `j = uniformInt(source, i + 1)`을 뽑아
 * `items[i]`와 `items[j]`를 바꾼다. `source`/`items`를 검증하지 않는다 — 호출자(`shuffleInPlace`,
 * `shuffle`, `permutation`)가 검증 후 넘긴다.
 */
export function fisherYatesInPlace<T>(source: RandomSource, items: T[]): T[] {
  // Stryker disable next-line EqualityOperator: i >= 0으로 넓혀도 마지막에 i=0인 반복이
  // 추가될 뿐이고, 그때 j = uniformInt(source, 1)은 항상 word를 소비하지 않고 0을 돌려주므로
  // items[0]을 자기 자신과 바꾸는(no-op) 반복이 하나 늘어난다 — 결과 배열도 word 소비도
  // 동일하다(진짜 동치 mutant, uniformInt의 n===1 특수 처리로 직접 확인).
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = uniformInt(source, i + 1);
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}

/**
 * `items`를 제자리에서 섞고 같은 참조를 돌려준다(`fisherYatesInPlace`). 길이 0·1이면 `source`를
 * 호출하지 않는다. 동결(frozen) 배열을 넘기면 엔진이 `TypeError`를 던진다(이 함수는 검사하지 않는다).
 *
 * @throws {RangeError} `source`가 함수가 아닐 때(다른 인자 검증보다 먼저). `items`가 배열이
 * 아닐 때.
 */
export function shuffleInPlace<T>(source: RandomSource, items: T[]): T[] {
  assertRandomSource(source);
  assertArray(items, "items");
  return fisherYatesInPlace(source, items);
}
