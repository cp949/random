import { fillRandom } from "../internal/bytes.js";
import type { CryptoLike } from "../internal/crypto.js";

/** 호출 한 번이 `getRandomValues`로 한꺼번에 받는 바이트 수(32비트 word 8개). */
const WORD_BUFFER_BYTES = 32;

/**
 * `crypto`에서 32바이트씩 받아 32비트 word를 하나씩 내주는 함수를 만든다. 받은 word를 다 쓰면 새로 받는다.
 * 상태(버퍼와 위치)는 반환한 함수의 클로저 안에만 있다. `randomInt`는 호출마다 새로 만들어 호출 사이에 상태를
 * 남기지 않고, `createSecureSource`는 하나를 만들어 `RandomSource`로 돌려준다.
 * 바이트는 big-endian으로 읽는다. `getRandomValues`가 던진 오류는 그대로 전파하고, 위치를 바꾸지 않았으므로
 * 다음 호출은 다시 채우기를 시도한다.
 */
export function createWordSource(crypto: CryptoLike): () => number {
  const buffer = new Uint8Array(WORD_BUFFER_BYTES);
  const view = new DataView(buffer.buffer);
  let offset = WORD_BUFFER_BYTES;
  return () => {
    if (offset === WORD_BUFFER_BYTES) {
      fillRandom(crypto, buffer);
      offset = 0;
    }
    const word = view.getUint32(offset);
    offset += 4;
    return word;
  };
}
