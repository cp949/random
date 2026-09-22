/** 설치 없이 실제 값 export와 소비자 fixture의 호출·오류 판정을 대조한다. */
import { readFileSync } from "node:fs";
import ts from "typescript-5.7";
import { expect, it } from "vitest";
import * as idEntry from "../../packages/random/src/id/index.ts";

for (const file of ["usage-id.ts", "smoke-id.mjs"]) {
  it(`소비자 완결성: ${file}에서 모든 id 값 export를 사용한다`, () => {
    const source = ts.createSourceFile(
      file,
      readFileSync(
        new URL(`../../fixtures/consumer/${file}`, import.meta.url),
        "utf8",
      ),
      ts.ScriptTarget.Latest,
      true,
    );
    const used = new Set();
    const visit = (node) => {
      // import·주석·문자열에 이름만 남긴 경우는 사용으로 세지 않는다.
      if (
        (ts.isCallExpression(node) || ts.isNewExpression(node)) &&
        ts.isIdentifier(node.expression)
      ) {
        used.add(node.expression.text);
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword &&
        ts.isIdentifier(node.right)
      ) {
        used.add(node.right.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    for (const name of Object.keys(idEntry)) expect(used, name).toContain(name);
  });
}
