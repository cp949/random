/**
 * `createUuidv4Factory`가 난수원을 감싸는 방식을 검증한다. 주입한 `randomBytes`는 팩토리를 만들 때 `guardSource`로
 * 한 번 감싸 호출마다 결과를 검사하고, 기본 난수원(`randomBytes` 생략)과 일회성 `uuidv4`는 감싸지 않는다.
 * 기본 난수원은 항상 요청한 길이의 새 `Uint8Array`를 돌려주므로 검사 wrapper를 씌워도 결과가 같다. 그래서 동작만 봐서는
 * wrapper 유무를 구분할 수 없고, `guardSource`를 그대로 통과시키는 spy로 바꿔 호출을 센다.
 * 주입 난수원의 계약 위반이 `RangeError`가 되는지는 `v4.test.ts`가 동작으로 검증한다.
 *
 * 이 파일은 `describe`를 쓰지 않는다. `v4.ts`가 mutation 대상이라서다(`v4.test.ts` 머리말 참고).
 * 모듈 mock은 이 파일에만 적용된다.
 */
import { expect, it, vi } from "vitest";
import { guardSource } from "../../../src/internal/bytes.js";
import { createUuidv4Factory, uuidv4 } from "../../../src/id/uuid/v4.js";
import { installCryptoStub } from "../../helpers/crypto-stub.js";

vi.mock("../../../src/internal/bytes.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/internal/bytes.js")>();
  return { ...actual, guardSource: vi.fn(actual.guardSource) };
});

it("기본 난수원: randomBytes를 생략한 팩토리는 guardSource로 감싸지 않는다", () => {
  vi.mocked(guardSource).mockClear();
  installCryptoStub();

  const next = createUuidv4Factory();
  next();
  next();

  expect(guardSource).not.toHaveBeenCalled();
});

it("기본 난수원: randomBytes가 undefined인 팩토리도 감싸지 않는다", () => {
  vi.mocked(guardSource).mockClear();
  installCryptoStub();

  const next = createUuidv4Factory({ randomBytes: undefined, dashes: false });
  next();

  expect(guardSource).not.toHaveBeenCalled();
});

it("기본 난수원: 일회성 uuidv4는 감싸지 않는다", () => {
  vi.mocked(guardSource).mockClear();
  installCryptoStub();

  uuidv4();
  uuidv4({ case: "upper" });

  expect(guardSource).not.toHaveBeenCalled();
});

it("주입 난수원: 팩토리를 만들 때 guardSource로 한 번 감싸고 호출마다 다시 감싸지 않는다", () => {
  vi.mocked(guardSource).mockClear();
  const source = (length: number): Uint8Array => new Uint8Array(length);

  const next = createUuidv4Factory({ randomBytes: source });
  expect(guardSource).toHaveBeenCalledTimes(1);
  expect(guardSource).toHaveBeenCalledWith(source);

  next();
  next();
  next();
  expect(guardSource).toHaveBeenCalledTimes(1);
});

it("주입 난수원: 팩토리마다 자기 난수원을 한 번씩 감싼다", () => {
  vi.mocked(guardSource).mockClear();
  const first = (length: number): Uint8Array => new Uint8Array(length);
  const second = (length: number): Uint8Array => new Uint8Array(length);

  createUuidv4Factory({ randomBytes: first });
  createUuidv4Factory({ randomBytes: second });

  expect(guardSource).toHaveBeenCalledTimes(2);
  expect(vi.mocked(guardSource).mock.calls).toEqual([[first], [second]]);
});
