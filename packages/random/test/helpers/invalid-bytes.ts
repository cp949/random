import { runInNewContext } from "node:vm";

/** 요청 길이 4에서 바이트 검증과 주입 난수원 검증이 함께 거부해야 하는 값. */
export const invalidBytes: [label: string, value: unknown][] = [
  ["프로토타입만 위조한 객체", Object.create(Uint8Array.prototype)],
  ["Uint8Array를 감싼 Proxy", new Proxy(new Uint8Array(4), {})],
  ["빈 Uint8Array", new Uint8Array(0)],
  ["짧은 Uint8Array(3)", new Uint8Array(3)],
  ["1바이트만 있는 Uint8Array", new Uint8Array(1)],
  ["긴 Uint8Array(5)", new Uint8Array(5)],
  ["훨씬 긴 Uint8Array(4096)", new Uint8Array(4096)],
  ["null", null],
  ["undefined", undefined],
  ["숫자 배열(Array)", [1, 2, 3, 4]],
  ["Uint16Array(4)", new Uint16Array(4)],
  ["Uint8ClampedArray(4)", new Uint8ClampedArray(4)],
  ["Int8Array(4)", new Int8Array(4)],
  ["Uint32Array(4)", new Uint32Array(4)],
  ["ArrayBuffer(4)", new ArrayBuffer(4)],
  ["DataView(4)", new DataView(new ArrayBuffer(4))],
  ["길이가 같은 문자열", "abcd"],
  ["숫자", 4],
  ["boolean", true],
  ["빈 객체", {}],
  ["Uint8Array처럼 보이는 유사 객체", { length: 4, 0: 1, 1: 2, 2: 3, 3: 4 }],
  [
    "프로토타입을 바꾼 Uint8Array",
    Object.setPrototypeOf(new Uint8Array(4), Object.prototype),
  ],
  [
    "다른 realm의 Uint8Array(vm 컨텍스트)",
    runInNewContext("new Uint8Array(4)") as unknown,
  ],
];
