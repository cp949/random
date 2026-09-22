import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface EntrySource {
  /** `exports`의 키. 예: `"."`, `"./secure"`. */
  key: string;
  /** 그 entry에 대응하는 `src` 아래 TypeScript 소스의 절대 경로. */
  sourcePath: string;
}

/**
 * `package.json`의 `exports`를 열거해 각 `default` 대상(`./dist/<경로>.js`)을 `src/<경로>.ts`로 바꾼다.
 * 새 subpath가 `exports`에 추가되면 자동으로 검증 대상이 된다. 매핑할 수 없으면 조용히 건너뛰지 않고 실패한다.
 */
export function listEntrySources(packageDir: string): EntrySource[] {
  const manifest = JSON.parse(
    readFileSync(join(packageDir, "package.json"), "utf8"),
  ) as { exports?: unknown };

  const exportsField = manifest.exports;
  if (typeof exportsField !== "object" || exportsField === null) {
    throw new Error("package.json에 exports 객체가 없다");
  }

  return Object.entries(exportsField).map(([key, target]) => {
    const file =
      typeof target === "string"
        ? target
        : (target as { default?: unknown }).default;
    if (typeof file !== "string") {
      throw new Error(`exports[${key}]에 default 대상이 없다`);
    }

    const stem = /^\.\/dist\/(.+)\.js$/.exec(file)?.[1];
    if (stem === undefined) {
      throw new Error(
        `exports[${key}]의 대상이 ./dist/<경로>.js 형태가 아니다: ${file}`,
      );
    }

    const sourcePath = join(packageDir, "src", `${stem}.ts`);
    if (!existsSync(sourcePath)) {
      throw new Error(`exports[${key}]에 대응하는 소스 src/${stem}.ts가 없다`);
    }
    return { key, sourcePath };
  });
}
