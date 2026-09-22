/**
 * 호출이 나뉘어도 이어서 0, 1, 2, ... (251로 나눈 나머지)를 채우는 fill을 만든다.
 * `installCryptoStub({ fill })`에 넘겨 chunk로 나눈 결과에 빈 곳이나 겹쳐 쓴 곳이 있는지 확인한다.
 * 251은 256과 서로소인 소수라 chunk 크기(65,536)만큼 어긋난 결과가 같은 패턴으로 위장하지 못한다.
 */
export function sequentialFill(): (view: Uint8Array) => void {
  let next = 0;
  return (view) => {
    for (let i = 0; i < view.length; i += 1) {
      view[i] = next % 251;
      next += 1;
    }
  };
}

/** `sequentialFill`이 채운 결과에서 기대와 다른 첫 위치를 돌려준다. 모두 같으면 -1이다. */
export function firstMismatch(buffer: Uint8Array): number {
  for (let i = 0; i < buffer.length; i += 1) {
    if (buffer[i] !== i % 251) return i;
  }
  return -1;
}
