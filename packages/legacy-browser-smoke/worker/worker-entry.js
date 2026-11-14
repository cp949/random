/**
 * Worker 안에서 배포 패키지를 실행하는 assertion(W1~W5). runner가 Vite로 번들해 classic 스크립트
 * (`/worker.js`)로 만든다. Chrome 75는 module Worker(`type: "module"`)를 지원하지 않아서, floor에서
 * 쓸 수 있는 형태는 소비자가 번들러로 만든 classic Worker뿐이다. 번들 대상은 tarball을 풀어 낸 `dist`다.
 * Chrome 75 문법·API만 쓴다(`page/smoke.js`와 같은 제한).
 */
import { createXoshiro128Source } from "@cp949/random";
import {
  createSecureSource,
  getCryptoCapabilities,
  randomBytes,
  randomInt,
} from "@cp949/random/secure";
import { isUuid, nanoid, uuidv4, uuidv7 } from "@cp949/random/id";
import { rand } from "@cp949/random/state";

/** assertion 함수를 실행해 예외를 `{ id, ok, detail }`로 접는다. */
function run(id, fn) {
  try {
    var outcome = fn();
    return { id: id, ok: outcome.ok, detail: outcome.detail };
  } catch (error) {
    var message = error && error.message ? error.message : String(error);
    return { id: id, ok: false, detail: message };
  }
}

/** 두 숫자 배열이 순서까지 같은지 본다. */
function sameNumberArray(a, b) {
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

var assertions = [];

assertions.push(
  run("W1", function () {
    // 이 코드가 Worker에서 도는지, DOM 전역이 없는지, crypto가 Worker에도 있는지 본다.
    var workerScope = globalThis.WorkerGlobalScope;
    var inWorker =
      typeof workerScope === "function" && self instanceof workerScope;
    var noDom =
      typeof window === "undefined" && typeof document === "undefined";
    var capabilities = getCryptoCapabilities();
    return {
      ok: inWorker && noDom && capabilities.getRandomValues === true,
      detail:
        "inWorker=" +
        inWorker +
        " noDom=" +
        noDom +
        " capabilities.getRandomValues=" +
        capabilities.getRandomValues,
    };
  }),
);

assertions.push(
  run("W2", function () {
    // `page/smoke.js` A6의 seed 42 기댓값과 같다. 메인 스레드와 Worker의 PRNG 결과가 같아야 한다.
    var source = createXoshiro128Source(42);
    var words = [source(), source(), source(), source(), source()];
    var expected = [3514831625, 2416850046, 1824449730, 3924724315, 1889077669];
    return {
      ok: sameNumberArray(words, expected),
      detail: "seed42=" + words.join(","),
    };
  }),
);

assertions.push(
  run("W3", function () {
    var bytes = randomBytes(65537);
    var allZero = true;
    for (var i = 0; i < bytes.length; i += 1) {
      if (bytes[i] !== 0) {
        allZero = false;
        break;
      }
    }
    var intValue = randomInt(1, 6);
    var word = createSecureSource()();
    var ok =
      bytes.length === 65537 &&
      !allZero &&
      intValue >= 1 &&
      intValue <= 6 &&
      word >= 0 &&
      word < 4294967296;
    return {
      ok: ok,
      detail:
        "length=" +
        bytes.length +
        " allZero=" +
        allZero +
        " randomInt=" +
        intValue +
        " word=" +
        word,
    };
  }),
);

assertions.push(
  run("W4", function () {
    var v4 = uuidv4();
    var v7 = uuidv7();
    var id = nanoid();
    var v4Ok =
      isUuid(v4) &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        v4,
      );
    var v7Ok =
      isUuid(v7) &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        v7,
      );
    var idOk = /^[A-Za-z0-9_-]{21}$/.test(id);
    return {
      ok: v4Ok && v7Ok && idOk,
      detail: "uuidv4=" + v4 + " uuidv7=" + v7 + " nanoid=" + id,
    };
  }),
);

assertions.push(
  run("W5", function () {
    // `rand`는 Worker마다 모듈 인스턴스가 따로다. 값 범위만 본다(재현할 수 없는 상태다).
    var intValue = rand.int(1, 6);
    var floatValue = rand.float();
    return {
      ok:
        Number.isInteger(intValue) &&
        intValue >= 1 &&
        intValue <= 6 &&
        floatValue >= 0 &&
        floatValue < 1,
      detail: "int=" + intValue + " float=" + floatValue,
    };
  }),
);

self.postMessage({ assertions: assertions });
