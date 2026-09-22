import { onTestFinished } from "vitest";
import { seededBytes } from "./seeded-bytes.js";

/** `globalThis.crypto`의 상태. */
export type CryptoMode =
  "present" | "absent" | "empty" | "not-function" | "throwing-accessor";

export interface CryptoStubOptions {
  /** 기본 `"present"`. */
  mode?: CryptoMode;
  /** 한 번에 채울 수 있는 최대 바이트 수. 기본 65,536(브라우저 한도). 초과 요청은 예외를 던진다. */
  quota?: number;
  /** true면 `this`가 crypto가 아닐 때 `TypeError("Illegal invocation")`를 던진다. 기본 true. */
  bindCheck?: boolean;
  /** 바이트를 채우는 함수. 기본은 고정 seed PRNG. */
  fill?: (view: Uint8Array) => void;
}

export interface CryptoStub {
  /** `getRandomValues` 호출마다 요청한 바이트 크기. 한도를 넘긴 요청도 기록한다. */
  calls: number[];
}

const DEFAULT_QUOTA = 65_536;
const DEFAULT_SEED = 0x2545f491;

// 첫 설치 시점의 원래 속성. 테스트가 끝나면 이 상태로 되돌린다.
let saved: { descriptor: PropertyDescriptor | undefined } | undefined;

function restore(): void {
  if (!saved) return;
  const { descriptor } = saved;
  saved = undefined;
  if (descriptor) {
    Object.defineProperty(globalThis, "crypto", descriptor);
  } else {
    Reflect.deleteProperty(globalThis, "crypto");
  }
}

function defineCrypto(value: unknown): void {
  Object.defineProperty(globalThis, "crypto", {
    value,
    writable: true,
    configurable: true,
    enumerable: true,
  });
}

/**
 * `globalThis.crypto`를 지정한 상태로 바꾼다. 테스트가 끝나면 원래 속성으로 자동 복원된다.
 * 테스트 본문이나 `beforeEach` 안에서만 호출한다. 한 테스트에서 여러 번 호출하면 마지막 호출이 유효하다.
 *
 * `present`는 실제 브라우저 동작을 재현한다: 호출당 바이트 한도와 `this` 바인딩 검사가 없으면
 * 큰 요청 분할 누락이나 메서드를 변수로 꺼내 호출하는 오류를 테스트가 잡지 못한다.
 * 정수 배열이면 어떤 종류든 바이트 단위로 채우고, 실수 배열 거부 같은 나머지 검사는 재현하지 않는다.
 */
export function installCryptoStub(options: CryptoStubOptions = {}): CryptoStub {
  const { mode = "present", quota = DEFAULT_QUOTA, bindCheck = true } = options;
  const calls: number[] = [];

  if (!saved) {
    saved = {
      descriptor: Object.getOwnPropertyDescriptor(globalThis, "crypto"),
    };
    onTestFinished(restore);
  }

  switch (mode) {
    case "absent":
      defineCrypto(undefined);
      break;
    case "empty":
      defineCrypto({});
      break;
    case "not-function":
      defineCrypto({ getRandomValues: "함수가 아니다" });
      break;
    case "throwing-accessor":
      Object.defineProperty(globalThis, "crypto", {
        get() {
          throw new Error("crypto 접근이 거부되었다");
        },
        configurable: true,
        enumerable: true,
      });
      break;
    case "present": {
      const nextBytes = seededBytes(DEFAULT_SEED);
      const fill =
        options.fill ??
        ((view: Uint8Array) => view.set(nextBytes(view.length)));

      const fake = {
        getRandomValues<T extends ArrayBufferView>(this: unknown, array: T): T {
          if (bindCheck && this !== fake) {
            throw new TypeError("Illegal invocation");
          }
          calls.push(array.byteLength);
          if (array.byteLength > quota) {
            throw new DOMException(
              `The ArrayBufferView's byte length (${array.byteLength}) exceeds the number of bytes of entropy available via this API (${quota})`,
              "QuotaExceededError",
            );
          }
          fill(
            new Uint8Array(array.buffer, array.byteOffset, array.byteLength),
          );
          return array;
        },
      };
      defineCrypto(fake);
      break;
    }
  }

  return { calls };
}
