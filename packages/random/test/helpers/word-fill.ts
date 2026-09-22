/**
 * 주입한 32비트 word를 big-endian 바이트로 풀어 채우는 fill을 만든다(`installCryptoStub({ fill })`용).
 * 요청 하나가 요청 크기만큼의 word를 큐에서 앞에서부터 꺼내고, 큐가 비면 0으로 채운다.
 * `randomInt`처럼 한 번에 32바이트(8 word)를 요청하면서 앞쪽 word만 쓰는 함수의 경계 시나리오를 만들 때 쓴다.
 * 넘긴 배열은 바꾸지 않는다.
 */
export function wordFill(words: number[]): (view: Uint8Array) => void {
  const queue = [...words];
  return (view) => {
    for (let offset = 0; offset < view.length; offset += 4) {
      const word = queue.shift() ?? 0;
      for (let i = 0; i < 4 && offset + i < view.length; i += 1) {
        view[offset + i] = (word >>> (24 - 8 * i)) & 0xff;
      }
    }
  };
}

/**
 * 53비트 값 `x`를 만드는 word 쌍(상위, 하위)을 돌려준다. 53비트 경로의 `uniformInt`가 소비하는 순서다.
 * 상위 word는 하위 11비트를 버리므로 그 자리를 일부러 1로 채워 무시되는지 함께 확인한다.
 */
export function wordsForUint53(x: bigint): [number, number] {
  const high = Number(x >> 32n);
  const low = Number(x & 0xffffffffn);
  return [high * 2048 + 0x7ff, low];
}
