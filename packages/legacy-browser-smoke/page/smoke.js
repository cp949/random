/**
 * smoke 페이지의 assertion(spec 4.3 A1~A13). Chrome 75 문법·API만 쓴다(금지: `?.`, `??`,
 * top-level await, `Promise.allSettled`, `String.prototype.replaceAll`, `Array.prototype.at`).
 * `--dump-dom`은 innerHTML을 이스케이프해 직렬화하므로 결과는 `encodeURIComponent`로 감싼다.
 */
(function () {
  "use strict";

  var ENTRIES = [
    { key: ".", path: "/pkg/dist/index.js" },
    { key: "./secure", path: "/pkg/dist/secure/index.js" },
    { key: "./id", path: "/pkg/dist/id/index.js" },
    { key: "./state", path: "/pkg/dist/state/index.js" },
  ];

  /** query 문자열을 읽는다. */
  function readQuery() {
    var params = new URLSearchParams(window.location.search);
    return {
      expectRandomUUID: params.get("expectRandomUUID"),
      expectChromeVersion: params.get("expectChromeVersion"),
    };
  }

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

  /** 결과를 `#result`에 인코딩해 쓰고 title로 판정을 드러낸다. */
  function writeResult(result) {
    var pre = document.getElementById("result");
    pre.textContent = encodeURIComponent(JSON.stringify(result));
    document.title = result.ok ? "SMOKE PASS" : "SMOKE FAIL";
  }

  /** entry 하나를 `import()`하고 실패해도 나머지 로딩을 막지 않도록 결과 객체로 접는다. */
  function loadEntry(entry) {
    return import(entry.path)
      .then(function (mod) {
        return { key: entry.key, mod: mod, error: null };
      })
      .catch(function (error) {
        return { key: entry.key, mod: null, error: error };
      });
  }

  /** 두 숫자 배열이 순서까지 같은지 본다. */
  function sameNumberArray(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /** export 키 집합과 각 값의 typeof가 기대와 같은지 본다(순서 무관). */
  function sameExportShape(actual, expected) {
    var actualKeys = Object.keys(actual).sort();
    var expectedKeys = Object.keys(expected).sort();
    if (actualKeys.length !== expectedKeys.length) return false;
    for (var i = 0; i < actualKeys.length; i += 1) {
      if (actualKeys[i] !== expectedKeys[i]) return false;
    }
    for (var j = 0; j < expectedKeys.length; j += 1) {
      var key = expectedKeys[j];
      if (actual[key] !== expected[key]) return false;
    }
    return true;
  }

  /** 13개 assertion을 순서대로 실행해 결과 배열을 만든다. */
  function runAssertions(query, expectedExports, modulesByKey, loadErrorsByKey) {
    var root = modulesByKey["."];
    var secure = modulesByKey["./secure"];
    var idModule = modulesByKey["./id"];
    var state = modulesByKey["./state"];
    var assertions = [];

    assertions.push(
      run("A1", function () {
        var expected =
          query.expectRandomUUID === "true" ? "function" : "undefined";
        var actual = typeof crypto.randomUUID;
        return {
          ok: actual === expected,
          detail: "typeof crypto.randomUUID === " + JSON.stringify(actual),
        };
      }),
    );

    assertions.push(
      run("A2", function () {
        var hasGetRandomValues =
          typeof globalThis.crypto.getRandomValues === "function";
        var capabilities = secure.getCryptoCapabilities();
        return {
          ok: hasGetRandomValues && capabilities.getRandomValues === true,
          detail:
            "getRandomValues=" +
            hasGetRandomValues +
            " capabilities.getRandomValues=" +
            capabilities.getRandomValues,
        };
      }),
    );

    assertions.push(
      run("A3", function () {
        // Chrome 110+는 UA Reduction으로 navigator.userAgent의 전체 버전을 "<major>.0.0.0"으로
        // 고정한다(floor 빌드는 UA Reduction 이전이라 전체 버전이 그대로 나온다). 두 경우 모두
        // 안전한 major 버전만 대조한다("Chrome/"·"HeadlessChrome/" 토큰 둘 다 허용).
        var expectedMajor = String(query.expectChromeVersion).split(".")[0];
        var match = /(?:Headless)?Chrome\/(\d+)\./.exec(navigator.userAgent);
        var actualMajor = match ? match[1] : null;
        var ok = actualMajor === expectedMajor;
        return {
          ok: ok,
          detail:
            navigator.userAgent +
            " (expected major " +
            expectedMajor +
            ", got " +
            actualMajor +
            ")",
        };
      }),
    );

    assertions.push(
      run("A4", function () {
        var failedKeys = [];
        for (var i = 0; i < ENTRIES.length; i += 1) {
          var key = ENTRIES[i].key;
          if (loadErrorsByKey[key]) failedKeys.push(key);
        }
        return {
          ok: failedKeys.length === 0,
          detail:
            failedKeys.length === 0
              ? "entry 4개 import 성공"
              : "실패: " + failedKeys.join(", "),
        };
      }),
    );

    assertions.push(
      run("A5", function () {
        var mismatches = [];
        for (var i = 0; i < ENTRIES.length; i += 1) {
          var key = ENTRIES[i].key;
          var mod = modulesByKey[key];
          if (!mod) {
            mismatches.push(key + ": import 실패");
            continue;
          }
          var actualTypes = {};
          var names = Object.keys(mod);
          for (var j = 0; j < names.length; j += 1) {
            actualTypes[names[j]] = typeof mod[names[j]];
          }
          if (!sameExportShape(actualTypes, expectedExports[key])) {
            mismatches.push(
              key +
                ": " +
                JSON.stringify(actualTypes) +
                " !== " +
                JSON.stringify(expectedExports[key]),
            );
          }
        }
        return {
          ok: mismatches.length === 0,
          detail: mismatches.length === 0 ? "일치" : mismatches.join("; "),
        };
      }),
    );

    assertions.push(
      run("A6", function () {
        var seed42 = root.createXoshiro128Source(42);
        var words42 = [seed42(), seed42(), seed42(), seed42(), seed42()];
        var expected42 = [
          3514831625, 2416850046, 1824449730, 3924724315, 1889077669,
        ];
        var seedHello = root.createXoshiro128Source("hello");
        var wordsHello = [
          seedHello(),
          seedHello(),
          seedHello(),
          seedHello(),
          seedHello(),
        ];
        var expectedHello = [
          2966572188, 3720780506, 139503483, 3335792593, 1040972122,
        ];
        var ok =
          sameNumberArray(words42, expected42) &&
          sameNumberArray(wordsHello, expectedHello);
        return {
          ok: ok,
          detail:
            "seed42=" + words42.join(",") + " seedHello=" + wordsHello.join(","),
        };
      }),
    );

    assertions.push(
      run("A7", function () {
        var stateValue = state.createRandomState(42).int(1, 100);
        var directValue = root.int(root.createXoshiro128Source(42), 1, 100);
        return {
          ok: stateValue === directValue,
          detail: "state=" + stateValue + " direct=" + directValue,
        };
      }),
    );

    assertions.push(
      run("A8", function () {
        var uuid = idModule.uuidv4();
        var v4Pattern =
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
        var formatOk = v4Pattern.test(uuid);
        var isUuidOk = idModule.isUuid(uuid) === true;
        var bytes = idModule.parseUuid(uuid);
        var lengthOk = bytes.length === 16;
        var roundTrip = idModule.stringifyUuid(bytes) === uuid;
        return {
          ok: formatOk && isUuidOk && lengthOk && roundTrip,
          detail:
            "uuid=" +
            uuid +
            " format=" +
            formatOk +
            " isUuid=" +
            isUuidOk +
            " length=" +
            bytes.length +
            " roundTrip=" +
            roundTrip,
        };
      }),
    );

    assertions.push(
      run("A9", function () {
        var bytes = secure.randomBytes(65537);
        var allZero = true;
        for (var i = 0; i < bytes.length; i += 1) {
          if (bytes[i] !== 0) {
            allZero = false;
            break;
          }
        }
        return {
          ok: bytes.length === 65537 && !allZero,
          detail: "length=" + bytes.length + " allZero=" + allZero,
        };
      }),
    );

    assertions.push(
      run("A10", function () {
        var intValue = state.rand.int(1, 6);
        var floatValue = state.rand.float();
        var intOk =
          Number.isInteger(intValue) && intValue >= 1 && intValue <= 6;
        var floatOk = floatValue >= 0 && floatValue < 1;
        return {
          ok: intOk && floatOk,
          detail: "int=" + intValue + " float=" + floatValue,
        };
      }),
    );

    assertions.push(
      run("A11", function () {
        var gen = idModule.createCyclicIdFactory({
          preset: "int32",
          start: 2147483647,
        });
        var first = gen();
        var second = gen();
        return {
          ok: first === 2147483647 && second === -2147483648,
          detail: "first=" + first + " second=" + second,
        };
      }),
    );

    assertions.push(
      run("A12", function () {
        var source = secure.createSecureSource();
        var value = source();
        return {
          ok: Number.isInteger(value) && value >= 0 && value < 4294967296,
          detail: "value=" + value,
        };
      }),
    );

    assertions.push(
      run("A13", function () {
        var nanoidValue = idModule.nanoid();
        var nanoidPattern = /^[A-Za-z0-9_-]{21}$/;
        var nanoidOk =
          nanoidValue.length === 21 && nanoidPattern.test(nanoidValue);
        var randomIdValue = idModule.randomId();
        var randomIdOk =
          typeof randomIdValue === "string" && randomIdValue.length > 0;
        return {
          ok: nanoidOk && randomIdOk,
          detail: "nanoid=" + nanoidValue + " randomId=" + randomIdValue,
        };
      }),
    );

    var ok = true;
    for (var k = 0; k < assertions.length; k += 1) {
      if (!assertions[k].ok) ok = false;
    }
    writeResult({
      userAgent: navigator.userAgent,
      assertions: assertions,
      ok: ok,
    });
  }

  function main() {
    var query = readQuery();
    var modulesByKey = {};
    var loadErrorsByKey = {};

    return fetch("/expected-exports.json")
      .then(function (response) {
        return response.json();
      })
      .then(function (expectedExports) {
        return Promise.all(ENTRIES.map(loadEntry)).then(function (loaded) {
          for (var i = 0; i < loaded.length; i += 1) {
            var item = loaded[i];
            if (item.error) {
              loadErrorsByKey[item.key] = item.error;
            } else {
              modulesByKey[item.key] = item.mod;
            }
          }
          runAssertions(query, expectedExports, modulesByKey, loadErrorsByKey);
        });
      })
      .catch(function (error) {
        var message = error && error.message ? error.message : String(error);
        writeResult({
          userAgent: navigator.userAgent,
          assertions: [{ id: "SETUP", ok: false, detail: message }],
          ok: false,
        });
      });
  }

  main();
})();
