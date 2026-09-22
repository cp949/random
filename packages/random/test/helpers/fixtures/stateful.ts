// importFresh가 모듈 상태를 새로 만드는지 확인하는 테스트 전용 fixture다.
let count = 0;

export function next(): number {
  count += 1;
  return count;
}
