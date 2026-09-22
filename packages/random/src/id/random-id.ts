import {
  defaultRandomBytes,
  guardSource,
  type ByteSource,
} from "../internal/bytes.js";
import { pickChars } from "../internal/sampling.js";
import { IdCollisionError } from "../internal/errors.js";
import {
  readIsTakenResult,
  readRandomIdFactoryOptions,
  readRandomIdOptions,
  type RandomIdFactoryOptions,
  type RandomIdOptions,
  type ResolvedRandomIdOptions,
} from "./random-id-options.js";
import { encodeTimestamp } from "./timestamp.js";

/** 검증된 옵션으로 ID 하나를 조립한다. 그룹은 무작위 부분의 코드 포인트에만 적용한다. */
function assemble(
  options: ResolvedRandomIdOptions,
  source: ByteSource,
): string {
  const parts: string[] = [];
  if (options.prefix !== undefined) parts.push(options.prefix);
  if (options.timestamp) {
    parts.push(
      encodeTimestamp(options.now === undefined ? Date.now() : options.now()),
    );
  }
  let random =
    options.letters === undefined
      ? pickChars(options.chars, options.length, source)
      : pickChars(options.letters, 1, source) +
        pickChars(options.chars, options.length - 1, source);
  if (options.group !== undefined) {
    const chars = Array.from(random);
    const groups: string[] = [];
    for (let i = 0; i < chars.length; i += options.group) {
      groups.push(chars.slice(i, i + options.group).join(""));
    }
    random = groups.join(options.groupSeparator);
  }
  parts.push(random);
  return parts.join(options.separator);
}

/** 검사 함수는 매 시도의 최종 ID를 받는다. 마지막 시도까지 충돌하면 상한과 함께 실패한다. */
function generate(
  options: ResolvedRandomIdOptions,
  source: ByteSource,
): string {
  if (options.isTaken === undefined) return assemble(options, source);
  for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
    const value = assemble(options, source);
    if (!readIsTakenResult(options.isTaken(value))) return value;
  }
  throw new IdCollisionError(options.maxAttempts);
}

/**
 * 옵션을 호출마다 검증하고 보안 난수로 ID를 만든다. 기본값은 base64url 21자다.
 * length는 무작위 부분의 문자 수이며 접두사·timestamp·구분자는 세지 않는다.
 * 난수원·시계 주입은 받지 않는다. 결정적 테스트에는 createRandomIdFactory를 쓴다.
 * timestamp는 소문자 base36 9자이고 시계 값은 0 이상 36^9 미만의 정수여야 한다.
 * isTaken은 최종 ID를 받는 동기 boolean 검사다. false면 반환하고 maxAttempts번 모두 true면 실패한다.
 * 시도마다 시각과 난수를 새로 만들며 boolean이 아닌 반환값은 RangeError, 검사 예외는 그대로 전파한다.
 * 검사와 저장 사이 경쟁은 막지 못하므로 DB 유일성 제약을 함께 써야 한다.
 * 결과의 형식과 엔트로피만 계약이며 결과값·바이트 매핑·소비 순서는 계약이 아니다.
 * @throws {RangeError} 옵션·시계 값·검사 반환값이 잘못됐을 때. 옵션 검증은 crypto 접근보다 먼저다.
 * @throws {SecureRandomUnavailableError} 기본 난수원을 쓸 수 없을 때.
 * @throws {IdCollisionError} isTaken이 maxAttempts번 모두 true를 반환할 때.
 */
export function randomId(options?: RandomIdOptions): string {
  return generate(readRandomIdOptions(options), defaultRandomBytes);
}

/**
 * 생성 시점에 옵션을 한 번 검증해 독립된 ID 생성기를 만든다. 이후 원본 옵션을 다시 읽지 않는다.
 * 생성은 crypto·clock에 접근하거나 randomBytes·now·isTaken을 호출하지 않는다.
 * 기본 난수원과 Date.now는 생성기를 호출할 때 찾는다.
 * 주입 난수원은 요청 길이의 Uint8Array를 반환해야 한다. 다른 realm의 배열은 거부한다.
 * 주입한 결과에는 보안 보증이 없고 고정 바이트의 결과값·매핑·소비 순서는 계약이 아니다.
 * 충돌 검사와 시각·문자 조립 계약은 randomId와 같다. 검사와 저장 사이 경쟁은 막지 못한다.
 * @throws {RangeError} 생성 시 옵션 위반, 호출 시 주입 난수원·시계·검사 반환값 계약 위반.
 * @throws {SecureRandomUnavailableError} 기본 난수원을 쓸 수 없을 때(첫 호출부터).
 * @throws {IdCollisionError} isTaken이 maxAttempts번 모두 true를 반환할 때.
 */
export function createRandomIdFactory(
  options?: RandomIdFactoryOptions,
): () => string {
  const resolved = readRandomIdFactoryOptions(options);
  const source =
    resolved.randomBytes === undefined
      ? defaultRandomBytes
      : guardSource(resolved.randomBytes);
  return () => generate(resolved, source);
}
