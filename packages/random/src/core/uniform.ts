import { assertFiniteRange } from "../internal/validate.js";
import { float } from "./float.js";
import { assertRandomSource, type RandomSource } from "./random-source.js";

/**
 * `x` 미만의 가장 큰 double을 돌려준다(Java `Math.nextDown`에 해당). `x`는 유한해야 한다.
 * IEEE 754 비트 패턴을 DataView(big-endian 고정)로 다루므로 플랫폼 endianness와 무관하다.
 * 양수는 비트 패턴을 1 줄이고 음수는 1 늘린다. 0은 `-Number.MIN_VALUE`다.
 * `uniform`의 보정 경로에서만 호출되며 정상 범위에서는 거의 도달하지 않으므로 buffer를 호출마다 만든다.
 */
function nextDown(x: number): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  let high = view.getUint32(0);
  let low = view.getUint32(4);
  if (x > 0) {
    if (low === 0) {
      high -= 1;
      low = 0xffffffff;
    } else {
      low -= 1;
    }
  } else if (x < 0) {
    if (low === 0xffffffff) {
      high += 1;
      low = 0;
    } else {
      low += 1;
    }
  } else {
    return -Number.MIN_VALUE;
  }
  view.setUint32(0, high);
  view.setUint32(4, low);
  return view.getFloat64(0);
}

/**
 * `[min, max)` 반개구간에서 균등하게 실수를 뽑는다. `min + float(source) * (max - min)`을 계산하고,
 * 결과가 `max` 이상이면 `max` 미만의 가장 큰 double로 보정한다. `float`은 1 미만이지만 `min`의 크기가
 * 범위 폭보다 크면 합이 `max`로 반올림된다(예: `uniform(s, 10, 20)`에서 `20 - 10 * 2^-53`은 `20`이 된다).
 * word 2개를 소비한다. 결과값과 산식은 계약이 아니다.
 *
 * @throws {RangeError} `source`가 함수가 아닐 때(다른 인자 검증보다 먼저). `min`/`max`가 유한
 * 숫자가 아니거나 `min >= max`이거나 `max - min`이 `Infinity`일 때.
 */
export function uniform(
  source: RandomSource,
  min: number,
  max: number,
): number {
  assertRandomSource(source);
  assertFiniteRange(min, max);

  const value = min + float(source) * (max - min);
  return value >= max ? nextDown(max) : value;
}
