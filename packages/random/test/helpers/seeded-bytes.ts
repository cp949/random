// 테스트 전용 고정 seed PRNG다. 배포 코드에 들어가지 않는다.
// 32비트 상태에 황금비 상수를 더하고 lowbias32 해시로 섞는 SplitMix 계열이며,
// R4의 기본 PRNG(SplitMix32 seed 확장)와 별개다. 통계 테스트가 재현되게 하는 용도다.

/** 호출할 때마다 다음 32비트 워드를 돌려주는 스트림을 만든다. */
function createWordStream(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x9e3779b9) | 0;
    let t = state ^ (state >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

/**
 * 같은 seed에서 같은 바이트 스트림을 내는 함수를 만든다.
 * 호출을 나눠도 이어 붙이면 한 번에 뽑은 것과 같다(남은 바이트를 다음 호출로 넘긴다).
 */
export function seededBytes(seed: number): (length: number) => Uint8Array {
  const nextWord = createWordStream(seed);
  let word = 0;
  let available = 0;

  return (length) => {
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
      if (available === 0) {
        word = nextWord();
        available = 4;
      }
      out[i] = word & 0xff;
      word >>>= 8;
      available -= 1;
    }
    return out;
  };
}
