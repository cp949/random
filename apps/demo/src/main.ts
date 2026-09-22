// 데모 진입점. subpath 4개를 import해 섹션 4개를 그린다(root, ./state, ./secure, ./id).
import { createXoshiro128Source, int, shuffle } from "@cp949/random";
import {
  randomBase64url,
  randomHex,
  randomInt,
  SecureRandomUnavailableError,
} from "@cp949/random/secure";
import {
  createCyclicIdFactory,
  nanoid,
  randomId,
  uuidv4,
  uuidv7,
} from "@cp949/random/id";
import { createRandomState, rand } from "@cp949/random/state";

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id}가 없다`);
  return el as T;
}

let lastRootFirstInt: number | null = null;

function runRootSection(): void {
  const seedInput = byId<HTMLInputElement>("root-seed");
  const out = byId<HTMLPreElement>("root-out");
  const seed = seedInput.value;

  const source = createXoshiro128Source(seed);
  const ints = Array.from({ length: 10 }, () => int(source, 1, 100));
  const shuffled = shuffle(source, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  lastRootFirstInt = ints[0] ?? null;
  out.textContent = [
    `int(1, 100) x10: ${ints.join(", ")}`,
    `shuffle([1..10]): ${shuffled.join(", ")}`,
  ].join("\n");
}

function runStateSection(): void {
  const rollOut = byId<HTMLPreElement>("state-roll-out");
  rollOut.textContent = `rand.int(1, 6) = ${rand.int(1, 6)}`;

  const seedInput = byId<HTMLInputElement>("root-seed");
  const checkOut = byId<HTMLPreElement>("state-check-out");
  const stateFirst = createRandomState(seedInput.value).int(1, 100);
  checkOut.textContent =
    lastRootFirstInt === null
      ? "root 섹션을 먼저 실행한다"
      : `createRandomState(seed).int(1, 100) = ${stateFirst} (root 첫 값과 ${
          stateFirst === lastRootFirstInt ? "같음" : "다름"
        })`;
}

function appendSecureOut(line: string): void {
  const out = byId<HTMLPreElement>("secure-out");
  out.textContent = out.textContent ? `${out.textContent}\n${line}` : line;
}

function runSecure(label: string, fn: () => string | number): void {
  try {
    appendSecureOut(`${label}: ${fn()}`);
  } catch (error) {
    if (error instanceof SecureRandomUnavailableError) {
      appendSecureOut(
        `${label}: SecureRandomUnavailableError — ${error.message}`,
      );
    } else {
      throw error;
    }
  }
}

function appendIdOut(line: string): void {
  const out = byId<HTMLPreElement>("id-out");
  out.textContent = out.textContent ? `${out.textContent}\n${line}` : line;
}

function main(): void {
  byId<HTMLButtonElement>("root-run").addEventListener("click", runRootSection);
  runRootSection();

  byId<HTMLButtonElement>("state-roll").addEventListener(
    "click",
    runStateSection,
  );

  byId<HTMLButtonElement>("secure-hex").addEventListener("click", () =>
    runSecure("randomHex(16)", () => randomHex(16)),
  );
  byId<HTMLButtonElement>("secure-base64url").addEventListener("click", () =>
    runSecure("randomBase64url(16)", () => randomBase64url(16)),
  );
  byId<HTMLButtonElement>("secure-int").addEventListener("click", () =>
    runSecure("randomInt(1, 100)", () => randomInt(1, 100)),
  );

  byId<HTMLButtonElement>("id-uuidv4").addEventListener("click", () =>
    appendIdOut(`uuidv4(): ${uuidv4()}`),
  );
  byId<HTMLButtonElement>("id-uuidv7").addEventListener("click", () =>
    appendIdOut(`uuidv7(): ${uuidv7()}`),
  );
  byId<HTMLButtonElement>("id-nanoid").addEventListener("click", () =>
    appendIdOut(`nanoid(): ${nanoid()}`),
  );
  byId<HTMLButtonElement>("id-randomid").addEventListener("click", () =>
    appendIdOut(`randomId({ prefix: "req" }): ${randomId({ prefix: "req" })}`),
  );
  byId<HTMLButtonElement>("id-cyclic").addEventListener("click", () => {
    const nextId = createCyclicIdFactory({ preset: "int32" });
    const values = [nextId(), nextId(), nextId()];
    appendIdOut(
      `createCyclicIdFactory({ preset: "int32" }) x3: ${values.join(", ")}`,
    );
  });
}

main();
