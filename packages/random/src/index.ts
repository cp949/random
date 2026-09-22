// 공개 API 진입점. root entry는 "일반 random"(재현 가능한 난수 코어 + 컬렉션 샘플링)
// 영역이며 crypto에 접근하는 코드를 포함하지 않는다.
// `getRandomValues` 기반 source는 `./secure`의 `createSecureSource`가 만들어 root helper에 주입한다.
export * from "./core/index.js";
export * from "./sampling/index.js";
