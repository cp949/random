/**
 * 위치×값 빈도 카이제곱 helper. `shuffle`/`shuffleInPlace`/`permutation`/`sample`처럼 결과가
 * `n`개의 위치를 가지는 함수의 편향을 검정할 때 쓴다. `draw()`를 `trials`번 불러 각 위치에 어떤 값이
 * 나왔는지 n×n 행렬로 모으고, 행(위치)마다 `chiSquare`(자유도 `n - 1`, `chi-square.ts`)로 검정한다.
 * 정상 구현은 모든 행의 통계량이 임계값(p=0.001) 미만이고, off-by-one 같은 결함은 특정 위치의 분포를
 * 왜곡해 그 행의 통계량이 임계값을 크게 넘긴다.
 */
import { chiSquare, chiSquareCritical } from "./chi-square.js";

/**
 * `draw()`를 `trials`번 불러 위치×값 빈도 행렬을 만든다. `draw()`는 길이 `n`이고 값이 `0..n-1`인
 * 배열을 돌려줘야 한다. `matrix[position][value]`가 그 위치에 그 값이 나온 횟수다.
 */
export function positionFrequencyMatrix(
  draw: () => readonly number[],
  n: number,
  trials: number,
): number[][] {
  const matrix: number[][] = Array.from(
    { length: n },
    () => new Array(n).fill(0) as number[],
  );
  for (let t = 0; t < trials; t += 1) {
    const result = draw();
    for (let position = 0; position < n; position += 1) {
      const row = matrix[position]!;
      const value = result[position]!;
      row[value] = row[value]! + 1;
    }
  }
  return matrix;
}

/** 위치별(행별) 카이제곱 통계량. 자유도는 `행 길이 - 1`이다. */
export function positionChiSquares(
  matrix: readonly (readonly number[])[],
): number[] {
  return matrix.map((row) => chiSquare(row));
}

/**
 * 행렬의 모든 위치가 유의수준 p=0.001에서 균등성 검정을 통과하는지 돌려준다. `n`은 행 길이(값 종류 수)다.
 * 하나라도 임계값(자유도 `n - 1`) 이상이면 `false`다.
 */
export function allPositionsUniform(
  matrix: readonly (readonly number[])[],
  n: number,
): boolean {
  const critical = chiSquareCritical(n - 1);
  return positionChiSquares(matrix).every((statistic) => statistic < critical);
}
