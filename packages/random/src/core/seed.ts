/**
 * seed 문자열을 32비트로 줄이는 FNV-1a(offset basis `0x811c9dc5`, prime `0x01000193`) 해시.
 * UTF-16 코드 유닛 단위로 XOR한다(코드 포인트나 UTF-8 바이트 단위가 아니다).
 * ASCII 문자열에서는 코드 유닛 값과 UTF-8 바이트 값이 같아서 표준 byte 단위 FNV-1a-32와 결과가 같다.
 */
export function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * golden-ratio increment(`0x9e3779b9`)와 murmur3 fmix32 finalizer로 구성된 SplitMix32.
 * 호출마다 다음 32비트 word를 돌려주는 함수를 만든다. `seed`는 uint32로 다룬다(호출자가 정규화한다).
 */
export function createSplitMix32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 15), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

/**
 * seed를 `createSplitMix32`에 넘길 uint32로 정규화한다.
 * 숫자는 safe integer만 허용하고 `>>> 0`으로 줄인다(음수·2^32 이상 값도 결정적으로 매핑된다).
 * 문자열은 `fnv1a`로 해시한다. 그 밖의 타입, `NaN`, `Infinity`, 소수는 `RangeError`다.
 */
export function normalizeSeed(seed: unknown): number {
  if (typeof seed === "string") {
    return fnv1a(seed);
  }
  // `Number.isSafeInteger`는 number가 아닌 값에 false를 돌려주므로 `typeof` 검사가 따로 필요 없다.
  if (Number.isSafeInteger(seed)) {
    return (seed as number) >>> 0;
  }
  throw new RangeError("seed must be a safe integer or a string");
}
