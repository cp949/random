// 이 파일은 컴파일에 실패해야 한다(scripts/check-no-dom.mjs가 확인한다).
// 라이브러리 tsconfig(library.json)에서 DOM·Node 전역이 해석되지 않는다는 것을 고정하는 fixture다.
export const title = document.title;
export const location = window.location;
export const id = crypto.randomUUID();
