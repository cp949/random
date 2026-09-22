import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  runConsumerCheck,
  RECIPE_FIXTURES,
  SMOKE_FIXTURES,
  USAGE_FIXTURES,
} from "../check-consumer.mjs";
import { listPublishablePackages } from "../workspace-packages.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

describe("기본 fixture 등록부", () => {
  for (const [kind, registry, pattern] of [
    ["사용", USAGE_FIXTURES, /^usage-.*\.ts$/],
    ["smoke", SMOKE_FIXTURES, /^smoke-.*\.mjs$/],
    ["사용성 사례", RECIPE_FIXTURES, /^recipes-.*\.mjs$/],
  ]) {
    it(`${kind}: 모든 키는 배포 대상 패키지 이름이다`, () => {
      const names = listPublishablePackages(repoRoot).map((pkg) => pkg.name);
      for (const name of Object.keys(registry)) expect(names).toContain(name);
    });

    it(`${kind}: 디렉터리의 모든 fixture 파일이 등록돼 있다`, () => {
      const directory = join(repoRoot, "fixtures/consumer");
      const registered = Object.values(registry).flat();
      for (const file of readdirSync(directory).filter((file) =>
        pattern.test(file),
      )) {
        expect(registered).toContain(join(directory, file));
      }
    });
  }
});

// 각 케이스가 실제로 npm install을 수행해 느리다. 핵심 실패 유형만 하나씩 고정한다.
const SLOW = 120_000;

/** 저장소의 실제 소비자 사용 fixture(`randomBytes` → `crypto.subtle.digest`). 가짜 `@cp949/random`에 이 파일만 명시해 붙인다. */
const usageSecure = fileURLToPath(
  new URL("../../fixtures/consumer/usage-secure.ts", import.meta.url),
);

const tempDirs = [];

function makeRepo(files) {
  const root = mkdtempSync(join(tmpdir(), "consumer-"));
  tempDirs.push(root);
  const all = {
    "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',
    ...files,
  };
  for (const [path, content] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const exportsField = {
  ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
  "./secure": {
    types: "./dist/secure/index.d.ts",
    default: "./dist/secure/index.js",
  },
};

/** 올바른 배포 패키지. `files`로 파일을 바꾸거나 더하고(null이면 제거), `manifest`로 매니페스트를 바꾼다. */
function libFiles({ manifest = {}, files = {} } = {}) {
  const all = {
    "packages/lib/package.json": JSON.stringify({
      name: "lib",
      version: "1.0.0",
      license: "MIT",
      type: "module",
      files: ["dist"],
      exports: exportsField,
      ...manifest,
    }),
    "packages/lib/dist/index.js": "export const a = 1;\n",
    "packages/lib/dist/index.d.ts": "export declare const a: number;\n",
    "packages/lib/dist/secure/index.js": "export const b = 2;\n",
    "packages/lib/dist/secure/index.d.ts": "export declare const b: number;\n",
    ...files,
  };
  return Object.fromEntries(
    Object.entries(all).filter(([, content]) => content !== null),
  );
}

/**
 * 패키지 이름이 `@cp949/random`인 가짜 배포 패키지. 이 이름은 소비자 사용 fixture(`randomBytes` → `crypto.subtle.digest`)가
 * 붙는 대상이다. `returnType`은 `randomBytes` 선언의 반환 타입이다. 실제 런타임 smoke는 가짜 패키지가 통과할 수 없으므로
 * 이 패키지를 쓰는 테스트는 `smokeFixtures: {}`로 smoke를 끄고, 가짜 패키지에는 `./id`가 없으므로
 * `usageFixtures`로 `usage-secure.ts`만 명시해 사용 fixture를 검증한다.
 */
function randomLibFiles(returnType) {
  return libFiles({
    manifest: { name: "@cp949/random" },
    files: {
      "packages/lib/dist/secure/index.d.ts": `export declare function randomBytes(length: number): ${returnType};\n`,
      "packages/lib/dist/secure/index.js":
        "export function randomBytes(length) { return new Uint8Array(length); }\n",
    },
  });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("runConsumerCheck", () => {
  for (const kind of ["usageFixtures", "smokeFixtures", "recipeFixtures"]) {
    for (const [label, files] of [
      ["빈 배열", []],
      ["옛 문자열", "usage-old.ts"],
    ]) {
      it(
        `등록부: ${kind} 값이 ${label}이면 문제 한 건으로 거부한다`,
        async () => {
          const root = makeRepo(libFiles());
          const result = await runConsumerCheck(root, {
            lanes: [],
            usageFixtures: {},
            smokeFixtures: {},
            [kind]: { lib: files },
          });

          expect(result.ok).toBe(false);
          expect(result.problems).toHaveLength(1);
          expect(result.usageFiles).toEqual([]);
          expect(result.smokeFiles).toEqual([]);
        },
        SLOW,
      );
    }
  }
  for (const fails of [false, true]) {
    it(
      `사용성 사례는 기본 crypto에서 한 번 실행하고 실패를 전달한다: ${fails}`,
      async () => {
        const root = makeRepo({
          ...libFiles(),
          "recipes-fake.mjs": [
            'import { a } from "lib";',
            'if (process.argv[2] !== "present" || !globalThis.crypto) process.exit(2);',
            `if (a !== ${fails ? 2 : 1}) process.exit(3);`,
          ].join("\n"),
        });
        const result = await runConsumerCheck(root, {
          lanes: [],
          recipeFixtures: { lib: [join(root, "recipes-fake.mjs")] },
        });
        expect(result.ok).toBe(!fails);
        expect(result.recipeChecked).toEqual(["lib"]);
        expect(result.recipeFiles).toEqual(["recipes-fake.mjs"]);
        expect(result.problems).toHaveLength(fails ? 1 : 0);
      },
      SLOW,
    );
  }
  it(
    "올바른 패키지는 두 moduleResolution과 세 가지 crypto 상태에서 모두 통과한다",
    async () => {
      const result = await runConsumerCheck(makeRepo(libFiles()));

      expect(result.problems).toEqual([]);
      expect(result.ok).toBe(true);
      expect(result.checked).toEqual(["lib", "lib/secure"]);
      // 저장소의 TypeScript와 소비자 하한(5.7) lane이 모두 실행됐는지 확인한다. 하한 lane이 조용히 빠지면 실패해야 한다.
      expect(result.lanes).toHaveLength(2);
      expect(result.lanes[1]).toMatch(/^5\.7\./);
      // 패키지별 사용 fixture와 런타임 smoke가 없는 패키지는 건너뛴다.
      expect(result.usageChecked).toEqual([]);
      expect(result.smokeChecked).toEqual([]);
    },
    SLOW,
  );

  it(
    "smoke 스크립트가 있는 패키지는 설치된 패키지를 세 가지 crypto 상태에서 실행한다",
    async () => {
      // 스크립트는 인자로 받은 상태를 로그로 남기지 않으므로, 상태별 종료 코드로 세 번 실행됐음을 확인한다.
      const root = makeRepo({
        ...libFiles(),
        "smoke-fake.mjs": [
          "const mode = process.argv[2];",
          'const lib = await import("lib");',
          "if (lib.a !== 1) process.exit(2);",
          'if (mode === "absent") { console.error("crypto 없음 상태에서 smoke 실패"); process.exit(3); }',
          "",
        ].join("\n"),
      });

      const result = await runConsumerCheck(root, {
        smokeFixtures: { lib: [join(root, "smoke-fake.mjs")] },
      });

      expect(result.smokeChecked).toEqual(["lib"]);
      expect(result.ok).toBe(false);
      const report = result.problems.join("\n");
      expect(report).toContain("smoke");
      expect(report).toContain("crypto 제거");
      expect(report).toContain("crypto 없음 상태에서 smoke 실패");
      // 통과한 상태는 보고하지 않는다.
      expect(report).not.toContain("crypto 접근 예외");
    },
    SLOW,
  );

  it(
    "smoke가 세 상태에서 모두 통과하면 성공한다",
    async () => {
      const root = makeRepo({
        ...libFiles(),
        "smoke-fake.mjs": 'await import("lib");\n',
      });

      const result = await runConsumerCheck(root, {
        smokeFixtures: { lib: [join(root, "smoke-fake.mjs")] },
      });

      expect(result.problems).toEqual([]);
      expect(result.ok).toBe(true);
      expect(result.smokeChecked).toEqual(["lib"]);
    },
    SLOW,
  );

  it(
    "smoke에서 설치되지 않은 패키지를 import하면 실패한다",
    async () => {
      const root = makeRepo({
        ...libFiles(),
        "smoke-fake.mjs": 'await import("not-installed-package");\n',
      });

      const result = await runConsumerCheck(root, {
        smokeFixtures: { lib: [join(root, "smoke-fake.mjs")] },
      });

      expect(result.ok).toBe(false);
      expect(result.problems.join("\n")).toContain("smoke");
    },
    SLOW,
  );

  it(
    "randomBytes가 Uint8Array<ArrayBuffer>를 돌려주면 lib.dom의 subtle.digest fixture가 두 lane에서 통과한다",
    async () => {
      const root = makeRepo(randomLibFiles("Uint8Array<ArrayBuffer>"));

      const result = await runConsumerCheck(root, {
        usageFixtures: { "@cp949/random": [usageSecure] },
        smokeFixtures: {},
        recipeFixtures: {},
      });

      expect(result.problems).toEqual([]);
      expect(result.ok).toBe(true);
      expect(result.usageChecked).toEqual(["@cp949/random"]);
    },
    SLOW,
  );

  it(
    "randomBytes가 Uint8Array(ArrayBufferLike)를 돌려주면 subtle.digest fixture가 실패한다",
    async () => {
      // BufferSource에 대입되지 않아 TS2345가 난다. 반환 타입을 넓히는 회귀를 소비자 fixture가 잡아야 한다.
      const root = makeRepo(randomLibFiles("Uint8Array"));

      const result = await runConsumerCheck(root, {
        usageFixtures: { "@cp949/random": [usageSecure] },
        smokeFixtures: {},
        recipeFixtures: {},
      });

      expect(result.ok).toBe(false);
      expect(result.problems.join("\n")).toContain("사용 fixture");
      expect(result.problems.join("\n")).toContain("TS2345");
    },
    SLOW,
  );

  it(
    "사용 fixture 실패는 어느 컴파일러 lane과 moduleResolution에서 났는지 알려 준다",
    async () => {
      const root = makeRepo(randomLibFiles("Uint8Array"));

      const result = await runConsumerCheck(root, {
        usageFixtures: { "@cp949/random": [usageSecure] },
        smokeFixtures: {},
        recipeFixtures: {},
      });

      const report = result.problems.join("\n");
      expect(report).toContain("NodeNext");
      expect(report).toContain("Bundler");
      expect(report).toMatch(/TypeScript 6\./);
    },
    SLOW,
  );

  it(
    "사용 fixture를 여러 개 등록하면 모든 파일이 두 lane과 두 moduleResolution에서 컴파일된다",
    async () => {
      const root = makeRepo({
        ...libFiles(),
        "usage-first.ts":
          'import { a } from "lib";\nexport const first: number = a;\n',
        "usage-second.ts":
          'import { b } from "lib/secure";\nexport const second: number = b;\n',
      });

      const result = await runConsumerCheck(root, {
        usageFixtures: {
          lib: [join(root, "usage-first.ts"), join(root, "usage-second.ts")],
        },
        smokeFixtures: {},
      });

      expect(result.problems).toEqual([]);
      expect(result.ok).toBe(true);
      expect(result.usageChecked).toEqual(["lib"]);
      expect(result.usageFiles).toEqual(["usage-first.ts", "usage-second.ts"]);
    },
    SLOW,
  );

  it(
    "등록한 사용 fixture 중 하나에만 타입 오류가 있어도 실패하고 그 파일 이름을 알려 준다",
    async () => {
      const root = makeRepo({
        ...libFiles(),
        "usage-first.ts":
          'import { a } from "lib";\nexport const first: number = a;\n',
        // b는 number라서 string에 대입할 수 없다(TS2322).
        "usage-second.ts":
          'import { b } from "lib/secure";\nexport const second: string = b;\n',
      });

      const result = await runConsumerCheck(root, {
        usageFixtures: {
          lib: [join(root, "usage-first.ts"), join(root, "usage-second.ts")],
        },
        smokeFixtures: {},
      });

      expect(result.ok).toBe(false);
      const report = result.problems.join("\n");
      expect(report).toContain("사용 fixture");
      expect(report).toContain("usage-second.ts");
      expect(report).toContain("TS2322");
      // 오류가 없는 파일은 보고하지 않는다.
      expect(report).not.toContain("usage-first.ts");
    },
    SLOW,
  );

  it(
    "smoke를 여러 개 등록하면 모든 파일이 통과했을 때 성공하고 실행한 파일을 모두 알려 준다",
    async () => {
      const root = makeRepo({
        ...libFiles(),
        "smoke-first.mjs": 'await import("lib");\n',
        "smoke-second.mjs": 'await import("lib/secure");\n',
      });

      const result = await runConsumerCheck(root, {
        usageFixtures: {},
        smokeFixtures: {
          lib: [join(root, "smoke-first.mjs"), join(root, "smoke-second.mjs")],
        },
      });

      expect(result.problems).toEqual([]);
      expect(result.ok).toBe(true);
      expect(result.smokeChecked).toEqual(["lib"]);
      expect(result.smokeFiles).toEqual([
        "smoke-first.mjs",
        "smoke-second.mjs",
      ]);
    },
    SLOW,
  );

  it(
    "smoke를 여러 개 등록하면 파일마다 세 상태에서 실행하고 실패를 파일 이름과 상태로 구분해 보고한다",
    async () => {
      // 첫 파일은 crypto 제거 상태에서만, 둘째 파일은 crypto 접근 예외 상태에서만 실패한다.
      const failsIn = (failingMode) =>
        [
          "const mode = process.argv[2];",
          `if (mode === "${failingMode}") { console.error("${failingMode} 상태 실패"); process.exit(3); }`,
          "",
        ].join("\n");
      const root = makeRepo({
        ...libFiles(),
        "smoke-first.mjs": failsIn("absent"),
        "smoke-second.mjs": failsIn("throwing"),
      });

      const result = await runConsumerCheck(root, {
        usageFixtures: {},
        smokeFixtures: {
          lib: [join(root, "smoke-first.mjs"), join(root, "smoke-second.mjs")],
        },
      });

      expect(result.ok).toBe(false);
      expect(result.problems).toHaveLength(2);
      const [first, second] = result.problems;
      expect(first).toContain("smoke-first.mjs");
      expect(first).toContain("crypto 제거");
      expect(first).toContain("absent 상태 실패");
      expect(second).toContain("smoke-second.mjs");
      expect(second).toContain("crypto 접근 예외");
      expect(second).toContain("throwing 상태 실패");
    },
    SLOW,
  );

  it(
    "등록한 fixture 파일이 없으면 예외로 죽지 않고 파일 경로를 담은 문제로 보고한다",
    async () => {
      const root = makeRepo(libFiles());

      const result = await runConsumerCheck(root, {
        usageFixtures: { lib: [join(root, "usage-missing.ts")] },
        smokeFixtures: { lib: [join(root, "smoke-missing.mjs")] },
      });

      expect(result.ok).toBe(false);
      const report = result.problems.join("\n");
      expect(report).toContain("usage-missing.ts");
      expect(report).toContain("smoke-missing.mjs");
      expect(report).toContain("없다");
    },
    SLOW,
  );

  it(
    "사용 fixture 파일 이름이 usage-*.ts 규칙과 다르면 tsconfig가 컴파일하지 않으므로 실패한다",
    async () => {
      // tsconfig.usage-*.json의 include가 `usage-*.ts`라서 다른 이름은 조용히 검사에서 빠진다. 등록 단계에서 막아야 한다.
      const root = makeRepo({
        ...libFiles(),
        "usage-good.ts":
          'import { a } from "lib";\nexport const good: number = a;\n',
        "wrong-name.ts":
          'import { a } from "lib";\nexport const wrong: string = a;\n',
      });

      const result = await runConsumerCheck(root, {
        usageFixtures: {
          lib: [join(root, "usage-good.ts"), join(root, "wrong-name.ts")],
        },
        smokeFixtures: {},
      });

      expect(result.ok).toBe(false);
      const report = result.problems.join("\n");
      expect(report).toContain("wrong-name.ts");
      expect(report).toContain("usage-");
      // 규칙에 맞는 파일은 계속 검사한다.
      expect(result.usageFiles).toEqual(["usage-good.ts"]);
    },
    SLOW,
  );

  it(
    "같은 이름의 fixture를 서로 다른 경로에서 등록하면 서로 덮어쓰기 전에 실패한다",
    async () => {
      const root = makeRepo({
        ...libFiles(),
        "one/smoke-same.mjs": 'await import("lib");\n',
        "two/smoke-same.mjs": 'await import("lib/secure");\n',
      });

      const result = await runConsumerCheck(root, {
        usageFixtures: {},
        smokeFixtures: {
          lib: [
            join(root, "one/smoke-same.mjs"),
            join(root, "two/smoke-same.mjs"),
          ],
        },
      });

      expect(result.ok).toBe(false);
      expect(result.problems.join("\n")).toContain("smoke-same.mjs");
      expect(result.problems.join("\n")).toContain("겹");
    },
    SLOW,
  );

  it(
    "타입 선언에 오류가 있으면 타입 해석 실패로 보고한다",
    async () => {
      const root = makeRepo(
        libFiles({
          files: {
            "packages/lib/dist/index.d.ts":
              "export declare const a: NoSuchType;\n",
          },
        }),
      );

      const result = await runConsumerCheck(root);

      expect(result.ok).toBe(false);
      expect(result.problems.join("\n")).toContain("NodeNext");
      expect(result.problems.join("\n")).toContain("Bundler");
      // 두 컴파일러 lane 모두에서 같은 오류를 보고한다. 하한 lane이 실제로 실행되는지 확인한다.
      expect(result.problems.join("\n")).toMatch(/TypeScript 6\./);
      expect(result.problems.join("\n")).toMatch(/TypeScript 5\.7\./);
    },
    SLOW,
  );

  it(
    "컴파일러 lane의 TypeScript가 설치돼 있지 않으면 설치 방법과 함께 실패한다",
    async () => {
      const root = makeRepo(libFiles());

      const result = await runConsumerCheck(root, {
        lanes: ["typescript", "typescript-no-such-lane"],
      });

      expect(result.ok).toBe(false);
      expect(result.problems.join("\n")).toContain("typescript-no-such-lane");
      expect(result.problems.join("\n")).toContain("pnpm install");
      // 설치된 lane은 계속 실행한다.
      expect(result.lanes).toHaveLength(1);
    },
    SLOW,
  );

  it(
    "DOM 타입에 의존하는 선언은 헤드리스 타입 환경에서 실패한다",
    async () => {
      const root = makeRepo(
        libFiles({
          files: {
            "packages/lib/dist/secure/index.d.ts":
              "export declare const el: HTMLElement;\n",
          },
        }),
      );

      const result = await runConsumerCheck(root);

      expect(result.ok).toBe(false);
      expect(result.problems.join("\n")).toContain("HTMLElement");
    },
    SLOW,
  );

  it(
    "types 대상 파일이 없으면 타입이 해석되지 않아 실패한다",
    async () => {
      const root = makeRepo(
        libFiles({
          files: { "packages/lib/dist/secure/index.d.ts": null },
        }),
      );

      const result = await runConsumerCheck(root);

      expect(result.ok).toBe(false);
      expect(result.problems.join("\n")).toContain("secure");
    },
    SLOW,
  );

  it(
    "import 시점에 crypto를 호출하면 crypto가 없는 프로세스에서 실패한다",
    async () => {
      const root = makeRepo(
        libFiles({
          files: {
            "packages/lib/dist/index.js":
              "globalThis.crypto.getRandomValues(new Uint8Array(1));\nexport const a = 1;\n",
          },
        }),
      );

      const result = await runConsumerCheck(root);

      expect(result.ok).toBe(false);
      expect(result.problems.join("\n")).toContain("crypto");
    },
    SLOW,
  );

  it(
    "crypto 속성에 접근만 해도 접근이 예외를 던지는 환경에서 실패한다",
    async () => {
      const root = makeRepo(
        libFiles({
          files: {
            "packages/lib/dist/secure/index.js":
              "void globalThis.crypto;\nexport const b = 2;\n",
          },
        }),
      );

      const result = await runConsumerCheck(root);

      expect(result.ok).toBe(false);
      expect(result.problems.join("\n")).toContain("접근");
    },
    SLOW,
  );

  it(
    "설치되지 않는 외부 패키지를 import하면 Node import가 실패한다",
    async () => {
      const root = makeRepo(
        libFiles({
          files: {
            "packages/lib/dist/index.js":
              'import "left-pad-not-installed";\nexport const a = 1;\n',
          },
        }),
      );

      const result = await runConsumerCheck(root);

      expect(result.ok).toBe(false);
      expect(result.problems.join("\n")).toContain("import");
    },
    SLOW,
  );

  it(
    "crypto가 undefined일 때만 실패하는 배포물도 실패로 잡는다(접근 예외 시나리오와 구분)",
    async () => {
      // 접근 예외는 삼키지만 undefined는 거부한다. 그래서 "crypto 제거" 시나리오에서만 실패한다.
      const root = makeRepo(
        libFiles({
          files: {
            "packages/lib/dist/index.js": [
              "let c;",
              "try { c = globalThis.crypto; } catch { c = {}; }",
              'if (c === undefined) throw new Error("crypto 없음");',
              "export const a = 1;",
              "",
            ].join("\n"),
          },
        }),
      );

      const result = await runConsumerCheck(root);

      expect(result.ok).toBe(false);
      expect(result.problems.join("\n")).toContain("crypto 제거");
      expect(result.problems.join("\n")).not.toContain("crypto 접근 예외");
    },
    SLOW,
  );

  it(
    "설치 스크립트를 실행하지 않는다(--ignore-scripts)",
    async () => {
      // postinstall이 실행되면 npm install이 실패한다. 실행하지 않으면 통과해야 한다.
      const root = makeRepo(
        libFiles({
          manifest: { scripts: { postinstall: 'node -e "process.exit(1)"' } },
        }),
      );

      const result = await runConsumerCheck(root);

      expect(result.problems).toEqual([]);
      expect(result.ok).toBe(true);
    },
    SLOW,
  );

  it("배포 대상 패키지가 없으면 실패한다", async () => {
    const root = makeRepo({
      "packages/config/package.json": JSON.stringify({
        name: "config",
        private: true,
      }),
    });

    const result = await runConsumerCheck(root);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("배포 대상 패키지");
  });
});
