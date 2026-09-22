import type { RandomSource } from "../core/random-source.js";
import { getCrypto } from "../internal/crypto.js";
import { createWordSource } from "./word-source.js";

/**
 * `globalThis.crypto.getRandomValues` 기반 `RandomSource`를 만든다. root entry의 helper(`int`, `float` 등)에
 * 주입하는 명시적 합성 지점이다. 재현 가능한 난수(root)와 보안 난수(`./secure`)는 이 함수로만 잇는다.
 * 호출(생성) 시점에 즉시 지원을 확인한다(eager). 미지원이면 그 자리에서 `SecureRandomUnavailableError`를 던지며
 * 첫 word 호출까지 미루지 않는다. 생성 후의 환경 변화는 고려하지 않는다.
 * word는 `randomInt`와 같은 `createWordSource`(32바이트 버퍼, big-endian)로 만들며 버퍼는 반환한 함수의
 * 클로저 안에만 있다(호출마다 독립). 결과값과 버퍼 크기는 계약이 아니다.
 * helper를 거친 결과에 보안 보증을 하지 않는다. token과 ID에는 `./secure`의 함수와 `./id`를 쓴다.
 *
 * @throws {SecureRandomUnavailableError} `getRandomValues`를 쓸 수 없을 때.
 */
export function createSecureSource(): RandomSource {
  return createWordSource(getCrypto());
}
