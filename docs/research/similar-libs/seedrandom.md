# 심층 리서치: seedrandom (davidbau/seedrandom)

`/work/thrd/seedrandom`에 로컬 클론된 소스를 직접 Read/Grep한 결과다. README 요약이 아니라 실제 구현 코드 기준이며, 모든 근거는 `파일경로:줄번호`로 인용한다(로컬 클론 루트 기준 상대경로). `docs/research/similar-libraries.md`의 "seedrandom" 절(개요 수준 조사)보다 구체적인 검증이 목적이다.

## 1. 개요

- **목적**: "Seeded random number generator for JavaScript."(`README.md:7`)
- **버전**: `3.0.5`(`package.json:3`, `README.md:9`)
- **커밋/릴리스 날짜**: 로컬 클론은 단일 커밋(shallow, 커밋 수 1개)이다. `git log`: `4460ad325a0a15273a211e509f03ae0beb99511a "release 3.0.5"`, 저자 날짜 `Tue Sep 17 06:37:21 2019 -0400`. README에도 `Date: 2019-09-14`로 명시(`README.md:13`).
- **라이선스**: MIT. `package.json:21`의 `"license": "MIT"`, 그리고 `seedrandom.js:1-23`·`lib/alea.js:4-24` 등 각 파일 헤더에 MIT 전문이 반복 삽입되어 있다(별도 `LICENSE` 파일은 로컬 클론에 없다 — 저장소 루트에 `LICENSE` 없음, `ls` 확인).
- **유지보수 상태**: 마지막 릴리즈가 2019-09-17이며 이후 커밋이 없다(로컬 클론 기준 확인 가능한 전부가 이 한 커밋이다). 조사 시점(2026-09-22) 기준 약 7년간 갱신이 없다는 사실만 로컬 소스로 확인 가능하다. GitHub 저장소 자체의 아카이브 여부·이슈/PR 활동은 이번 조사 범위(로컬 클론)에서 확인하지 않았다.
- **런타임 의존성**: `package.json`의 `dependencies` 필드 없음(전부 `devDependencies`, `package.json:42-59`). Node 환경에서는 `require('crypto')`를 시도하지만 실패해도 무시한다(`seedrandom.js:234-237`).

## 2. 핵심 구현 상세

### 2.1 기본 알고리즘 ARC4

- 상수: `width = 256`(RC4 출력 바이트 범위), `chunks = 6`(더블당 최소 6바이트), `digits = 52`, `startdenom = 256^6`, `significance = 2^52`, `overflow = significance*2`, `mask = 255` — `seedrandom.js:30-38`.
- `ARC4(key)` 생성자: 표준 KSA(Key Scheduling Algorithm)로 `S[0..255]`를 초기화한다(`seedrandom.js:116-130`). 빈 키(`[]`)는 `[0]`으로 치환(`seedrandom.js:121`).
- `g(count)` (PRGA): RC4의 표준 PRGA 루프를 `count`회 반복해 하나의 정수로 이어붙인다(`seedrandom.js:132-146`).
- **RC4-drop[256] 하드닝**: `ARC4` 생성자 마지막에 `(me.g = function(count){...})(width)`로 `g`를 정의함과 동시에 `width`(=256)를 인자로 즉시 1회 호출해 초기 출력 256개를 버린다(`seedrandom.js:133-146`, 특히 종료 괄호 `)(width);`가 있는 `146`행). 주석: "For robust unpredictability, the function call below automatically discards an initial batch of values. This is called RC4-drop[256]."(`seedrandom.js:143-145`)
- `prng()`: `arc4.g(chunks)`(최대 48비트)로 시작해 유효자릿수(52비트)를 다 채울 때까지 바이트를 추가하고, 반올림 오차를 피하기 위해 초과분을 정수 시프트로 되돌려 `[0,1)` 실수를 만든다(`seedrandom.js:58-73`). `prng.int32()`는 `arc4.g(4)|0`, `prng.quick()`은 `arc4.g(4)/0x100000000`(`seedrandom.js:75-76`).
- 참고: `README.md`의 벤치마크 표는 ARC4 기반 `quick`을 "1.8x 네이티브 대비 3.80ns", 주기 `~2^1600`으로 명시한다(`README.md:107`).

### 2.2 대안 알고리즘 6종의 파일 위치

| 알고리즘                                        | 파일               | 상태 필드(`copy()` 기준)                                                     |
| ----------------------------------------------- | ------------------ | ---------------------------------------------------------------------------- |
| alea (Baagøe, 주기 ~2^116)                      | `lib/alea.js`      | `{c, s0, s1, s2}` (`lib/alea.js:54-60`)                                      |
| xor128 (Marsaglia, 주기 2^128-1)                | `lib/xor128.js`    | `{x, y, z, w}` (`lib/xor128.js:38-44`)                                       |
| xorwow (Marsaglia, 주기 2^192-2^32)             | `lib/xorwow.js`    | `{x, y, z, w, v, d}` (`lib/xorwow.js:41-49`)                                 |
| xor4096 (Brent, 주기 2^4096-2^32)               | `lib/xor4096.js`   | `{i, w, X}`(`X`는 배열, `.slice()`로 복사) (`lib/xor4096.js:105-109`)        |
| xorshift7 (Panneton/L'Ecuyer, 주기 2^256-1)     | `lib/xorshift7.js` | `{x, i}`(`x`는 배열) (`lib/xorshift7.js:56-60`)                              |
| tychei (Neves/Araujo, ChaCha 파생, 주기 ~2^127) | `lib/tychei.js`    | `{a, b, c, d}` (`lib/tychei.js:60-66`)                                       |
| (index) 통합 export                             | `index.js`         | `sr.alea = alea; ...`로 `seedrandom()`에 네임스페이스 부착(`index.js:53-60`) |

각 파일은 `seedrandom.js`의 ARC4 경로와 별개로 **자체 `impl(seed, opts)` + `copy(f, t)`**를 갖는 독립 모듈이며, 공통 디스패처(`index.js`)가 있을 뿐 내부 구현은 공유하지 않는다.

### 2.3 문자열 seed 종료자 처리와 해시 방식 — 중요한 정정

과제 지시문과 `docs/research/similar-libraries.md:41`은 "문자열 seed에 종료자를 추가해 `'ab' !== 'abab'`를 방지한다"는 전제를 깔고 있는데, **실제 소스를 확인하면 이 전제는 순수 문자열 seed에는 적용되지 않는다.**

- `flatten(obj, depth)`: 결과가 없을 때 `typ == 'string' ? obj : obj + '\0'`을 반환한다(`seedrandom.js:171`). 즉,
  - seed가 **문자열**이면 `typ == 'string'`이 참이라 원본 문자열을 그대로 반환한다. **종료자가 붙지 않는다.**
  - seed가 **문자열이 아니면**(숫자, `null` 이후의 autoseed 결과 등) `obj + '\0'`로 종료자가 자동으로 붙는다.
- README도 이를 명시한다: "The standard ARC4 key scheduler cycles short keys, which means that seedrandom('ab') is equivalent to seedrandom('abab') and 'ababab'. Therefore it is a good idea to add a terminator to avoid trivial equivalences on short string seeds, e.g., Math.seedrandom(str + '\0'). **Starting with version 2.0, a terminator is added automatically for non-string seeds**, so seeding with the number 111 is the same as seeding with '111\0'."(`README.md:266-272`)
- 즉 `seedrandom('ab')`와 `seedrandom('abab')`는 **버전 3.0.5에서도 여전히 다르지 않을 수 있는 문제(ARC4 키 스케줄러가 짧은 키를 순환시키는 성질)** 이며, 라이브러리는 이를 "고쳤다"고 주장하지 않는다. 오히려 사용자가 직접 `str + '\0'`를 붙이라고 권고할 뿐이고, 자동 종료자는 **숫자/객체 등 non-string seed 전용**이다.
- `mixkey(seed, key)`(`seedrandom.js:179-186`)는 seed 문자열을 256바이트 순환 버퍼(`key[mask & j]`, `mask = 255`)에 섞어 넣는 롤링 믹서다:
  ```js
  key[mask & j] =
    mask & ((smear ^= key[mask & j] * 19) + stringseed.charCodeAt(j++));
  ```
  이것은 **FNV류 해시가 아니다.** FNV-1a는 고정 32/64비트 offset-basis와 소수(prime)로 `hash = (hash XOR byte) * prime`을 반복하는 알고리즘인데, `mixkey`는 그런 구조가 아니라 "이전 키 바이트 × 19"를 누적 XOR(`smear`)하며 256개 슬롯에 라운드로빈으로 채워 넣는, ARC4의 키 배열 크기(256)에 맞춘 전용 믹서다. `@cp949/random`의 `createXoshiro128Source` 문자열 seed 해시(FNV-1a 32비트, offset basis `0x811C9DC5`, prime `0x01000193`, `docs/api/random-core.md:87`)와는 알고리즘 계열 자체가 다르다.
- alea의 자체 문자열 해시도 FNV가 아니다. `Mash()`(`lib/alea.js:78-97`)는 부동소수점 기반 곱셈 해시로, 초기값 `n = 0xefc8249d`에서 시작해 각 문자 코드마다 `n += charCode; h = 0.02519603282416938 * n; ...` 형태의 실수 연산을 거친다. FNV 계열과 무관한 Baagøe 고유 설계다.

### 2.4 `{state: true}` 상태 저장/복원

- **ARC4(기본) 경로**: `seedrandom()`이 반환하는 기본 콜백 함수(`options.pass`나 세 번째 인자 콜백이 없을 때 사용되는 디폴트)가 상태 로직을 전담한다(`seedrandom.js:83-99`).
  - `state`(=`options.state`)가 truthy면: `state.S`가 있을 때만 `copy(state, arc4)`로 기존 ARC4 인스턴스에 상태를 덮어쓰고(`seedrandom.js:87`), `prng.state = function(){ return copy(arc4, {}); }`로 저장용 메서드를 부착한다(`seedrandom.js:89`). `state` 옵션을 주지 않으면 `.state()` 메서드 자체가 생기지 않는다(내부 상태 완전 은닉).
  - `copy(f, t)`는 `{i, j, S}` 세 필드를 복사한다(`seedrandom.js:153-158`). `S`는 `.slice()`로 얕은 배열 복사(`seedrandom.js:156`).
  - 복원 예시(`README.md:229-235`):
    ```js
    var saveable = seedrandom("secret-seed", { state: true });
    for (var j = 0; j < 1e5; ++j) saveable();
    var saved = saveable.state();
    var replica = seedrandom("", { state: saved });
    assert(replica() == saveable());
    ```
    **주목할 점**: 복원 시 넘기는 seed(`""`)는 사실상 더미다. `seedrandom("", {state: saved})`는 일단 빈 문자열로 완전히 새 ARC4를 초기화한 뒤(`seedrandom.js:54`), 콜백 단계에서 `state.S`가 있으므로 그 결과를 즉시 `saved`의 `{i,j,S}`로 덮어쓴다(`seedrandom.js:87`). 즉 seed 인자는 상태 복원 경로에서 아무 의미가 없고, 상태 객체가 전부를 결정한다.
  - 회귀 테스트로 실제 동작을 확인: `test/nodetest.js:143-165`("should support state api")가 `saveable`/`ordinary`/`replica`/`virgin` 네 인스턴스로 상태 저장·복원 후 시퀀스 일치를 단언한다. `.state` 옵션을 안 주면 `dummy.state`가 없고(`for...in`에도 안 잡힘) `TypeError`가 난다는 것까지 검증한다(`test/nodetest.js:130-142`).
- **대안 알고리즘 경로(alea/xor128/xorwow/xorshift7/xor4096/tychei)**: ARC4처럼 콜백에 위임하지 않고 **각 `impl(seed, opts)`가 자체적으로 처리**한다. 공통 패턴(예: `lib/xorwow.js:65-68`):
  ```js
  if (state) {
    if (typeof state == "object") copy(state, xg);
    prng.state = function () {
      return copy(xg, {});
    };
  }
  ```
  배열 기반 상태(`xorshift7`, `xor4096`)는 `typeof(state)=='object'` 대신 배열 존재 여부(`state.x`/`state.X`)로 판별한다(`lib/xorshift7.js:78`, `lib/xor4096.js:127-128`— grep 결과 기준). 이는 API 표면이 통일돼 있지 않다는 뜻이기도 하다: 판별 조건이 알고리즘마다 다르다(`typeof state == 'object'` vs `state.S` vs `state.x` vs `state.X`).
  - 대안 알고리즘의 golden vector + 상태 복원 회귀 테스트는 `test/prngtest.js:15-63`의 `test(label, alg, ...)` 헬퍼에 있다: `alg('hello.', {state:true})`로 만든 `fn2`에서 `state()`를 뽑아(`ss`) 새 인스턴스(`alg(0, {state: ss})`)를 만들고 `fn3() === rs`(저장 직후 다음 출력과 동일)를 단언한다(`test/prngtest.js:35, 60-62`).

### 2.5 `{entropy: true}`

- `seedrandom(seed, options)` 안에서: `options.entropy`가 참이면 seed로 `[seed, tostring(pool)]`(주어진 seed와 누적 엔트로피 풀을 함께)을 사용하고, 아니면 `seed == null`일 때만 `autoseed()`, 그 외엔 주어진 `seed` 그대로 사용한다(`seedrandom.js:49-51`):
  ```js
  var shortseed = mixkey(
    flatten(
      options.entropy
        ? [seed, tostring(pool)]
        : seed == null
          ? autoseed()
          : seed,
      3,
    ),
    key,
  );
  ```
- `pool`은 모듈 스코프의 배열로 시작은 비어 있고(`seedrandom.js:251`), 로드 시점에 `mixkey(math.random(), pool)`로 1회 시딩되며(`seedrandom.js:226`), 그 후 `seedrandom()`을 호출할 때마다 매번 `mixkey(tostring(arc4.S), pool)`로 그 호출의 ARC4 최종 상태를 풀에 추가로 섞는다(`seedrandom.js:80`). 즉 `entropy` 옵션은 "현재까지 이 프로세스에서 만들어진 모든 seedrandom 인스턴스의 잔여 상태"를 재료로 추가 혼합하는 방식이다.
- README 예시(`README.md:44-46`, `135-137`): `prng = seedrandom('added entropy.', { entropy: true })` → "As unpredictable as added entropy." 즉 재현성을 포기하고 예측 불가능성을 높이는 옵션이며, 완전한 암호학적 안전성을 주장하지 않는다(풀 자체가 `math.random()`으로 초기화되므로).

### 2.6 `{global: true}`

- `seedrandom.js:102-103`에서 `is_math_call`을 결정한다: `'global' in options ? options.global : (this == math)`. 즉 `{global: true}`를 명시하면 `this == math` 여부와 무관하게 무조건 `is_math_call = true`가 된다.
- 콜백(`seedrandom.js:83-99`) 안에서 `is_math_call`이 참이면 `math[rngname] = prng; return seed;`(`seedrandom.js:94`) — `Math.random`(rngname='random', `seedrandom.js:33`)을 새 PRNG로 **교체**하고, PRNG 함수 대신 정규화된 **seed 문자열을 반환**한다. 거짓이면 `prng`를 그대로 반환한다(`seedrandom.js:98`).
- 회귀 테스트로 정확한 동작 확인: `test/nodetest.js:33-38`이 `seedrandom('hello.', { global: true })`가 `'hello.'`(짧은 seed 문자열)를 반환하고 `Math.random`을 실제로 바꾸는지 단언한다. `{global: false}`를 명시하면 `this == math`이더라도 강제로 함수를 반환하고 `Math.random`을 바꾸지 않는 것도 별도로 검증한다(`test/nodetest.js:112-118`).

### 2.7 `{pass: fn}`

- `seedrandom(seed, options, callback)`의 반환문 자체가 `options.pass || callback || <기본 콜백>`을 호출한 결과다(`seedrandom.js:83-99`). `pass`가 있으면 상태/전역 로직을 담은 기본 콜백을 완전히 대체하고, `pass(prng, shortseed, is_math_call, options.state)` 형태로 4개 인자를 그대로 넘겨준다(`seedrandom.js:99-103`).
- README 예시(`README.md:219-223`):
  ```js
  var obj = Math.seedrandom(null, {
    pass: function (prng, seed) {
      return { random: prng, seed: seed };
    },
  });
  ```
  seed가 `null`이면 내부적으로 `autoseed()`가 실행되어 `shortseed`가 생성되고(`seedrandom.js:51`), `pass` 콜백은 그 `prng`와 정규화된 `seed` 문자열을 동시에 받아 원하는 형태로 재포장할 수 있다.
- `pass`를 쓰면 `{state: true}`나 `{global: true}`가 제공하던 자동 처리(`.state()` 부착, `Math.random` 교체)는 전혀 실행되지 않는다 — 그 로직 자체가 기본 콜백 안에만 있기 때문이다(`seedrandom.js:84-98`). 즉 `pass`는 "완전한 탈출구"이며 다른 옵션과 배타적으로 동작한다는 점이 코드로 확인된다.
- 회귀 테스트: `test/nodetest.js:79-100`이 `pass` 콜백의 인자 3개(`prng`, `seed`, `global`)와 반환값 그대로 전달을 단언한다(콜백이 `'def'`를 반환하면 `seedrandom()` 호출 자체가 `'def'`를 반환).

## 3. 테스트 코드 구조

- **재현성 회귀 테스트**: `test/nodetest.js`(mocha, `describe("Nodejs API Test")`)가 `seedrandom('hello.')`의 첫 두 출력이 항상 `0.9282578795792454`임을 하드코딩된 golden value로 검증한다(`test/nodetest.js:26-29` 등, 파일 전체에서 반복). alea 등 다른 알고리즘도 README에서 같은 방식으로 `myrng()`가 항상 `0.9282578795792454`, `arng()`가 항상 `0.4783254903741181` 같은 고정값을 낸다고 명시한다(`README.md:28-33`, `85-91`).
- **golden vector 존재 여부**: 존재한다. `test/prngtest.js:66-79`가 알고리즘 7종(ARC4 포함) 각각에 대해 `alg(1)` seed로 `.double()`, `.quick()`, `.int32()`의 정확한 리터럴 값과, 1024회 반복 후 임계값 미만 카운트(`h`, `q`, `e`, `e2`)까지 하드코딩해 단언한다. 예: `test("seedrandom", sr, 0.1776348083296759, 0.2160690303426236, 1397712774, 526, 282, 131, 137)`(`test/prngtest.js:76-77`).
- **상태 저장/복원 테스트**: `test/nodetest.js:128-166`("should support state api")와 `test/prngtest.js:35, 60-62`(범용 `test()` 헬퍼 안의 `fn3 = alg(0, {state: ss}); assert.equal(fn3(), rs)`)가 각각 ARC4 경로와 대안 알고리즘 경로를 커버한다.
- **테스트 러너**: `package.json:14`의 `"test": "grunt travis"`, `Gruntfile.js`가 mocha(`grunt-contrib-mocha`/`grunt-mocha-nyc`)와 qunit(`grunt-contrib-qunit`, 브라우저용 `.html` 테스트 — `test/*.html`)를 모두 구동한다. `test/run_dieharder.sh` + `test/out/dieharder-report.txt`는 통계적 난수성 검정(Dieharder) 리포트로, 단위 테스트가 아니라 별도 통계 검증 산출물이다.
- **CJS/AMD/전역 세 가지 로딩 방식**을 각각 테스트: `test/nodetest.js`(CJS + requirejs), `test/browserified.js`/`browserified.html`(browserify 번들), `test/require.html`(AMD).

## 4. 장점

- **알고리즘 7종을 같은 `{state, entropy, global, pass}` 옵션 어휘로 다룬다.** ARC4는 콜백 위임, 나머지 6종은 자체 처리라는 구현 차이는 있지만(2.4절), 사용자가 보는 API 표면(`impl(seed, {state: true})` → `.state()`)은 일관적이다.
- **`.state()`/`{state: saved}` 라운드트립이 명시적이고 테스트로 보증된다.** `test/nodetest.js:128-166`, `test/prngtest.js:60-62`가 저장 직후 다음 출력이 정확히 이어짐을 검증한다. 장시간 시뮬레이션의 체크포인트/재개 유즈케이스에 실전 검증된 API다.
- **RC4-drop[256] 같은 구현 세부 하드닝을 명시적 주석과 함께 남겼다**(`seedrandom.js:143-145`). 왜 그렇게 했는지(Fluhrer-Mantin-Shamir류 RC4 키 스케줄 편향 회피) 코드 옆에 근거를 남기는 관행은 문서화 품질이 높다.
- **golden vector 기반 회귀 테스트가 7개 알고리즘 전부에 있다**(`test/prngtest.js:66-79`). 릴리즈 간 raw 출력 안정성을 실제로 강제한다.
- **문자열 종료자 문제를 README에서 숨기지 않고 "여전히 사용자 책임"이라고 정직하게 서술한다**(`README.md:266-272`). 자동으로 다 해결됐다고 과장하지 않는다.

## 5. 단점/트레이드오프

- **문자열 seed의 짧은-키 순환 취약점이 실제로 남아 있다(2.3절).** `seedrandom('ab')`와 `seedrandom('abab')`가 다르다는 보장이 라이브러리 차원에는 없다. `flatten()`의 자동 종료자는 non-string seed 전용이며(`seedrandom.js:171`), 문자열 seed는 사용자가 `str + '\0'`를 직접 붙여야 한다(`README.md:268-269`). API 설계상 "안전한 기본값"이 아니라 "문서를 읽어야 피할 수 있는 함정"이다.
- **상태 객체 판별 로직이 알고리즘마다 다르다.** ARC4는 `state.S` 존재 여부(`seedrandom.js:87`), xor128/xorwow/tychei/alea는 `typeof(state) == 'object'`(예: `lib/xorwow.js:66`), xorshift7/xor4096은 `state.x`/`state.X` 배열 존재 여부(`lib/xorshift7.js:78`, `lib/xor4096.js:127`)로 각각 다르게 판별한다. 상태 객체를 다른 알고리즘에 잘못 넘기면 `typeof(state)=='object'` 계열은 조용히(에러 없이) `undefined` 필드들을 복사해 깨진 상태를 만들 수 있다 — 타입 안전성이 없다.
- **ARC4 상태 객체(`{i, j, S}`)는 JSON 직렬화는 가능하지만 크다.** `S`는 256개 정수 배열이라(`seedrandom.js:156`) 직렬화 크기가 대안 알고리즘(4~6개 숫자 필드)보다 훨씬 크다. "가벼운 체크포인트"가 목적이면 ARC4보다 xor128/alea 쪽이 유리하다.
- **엔트로피 풀(`pool`)이 모듈 전역 mutable 상태다.** `mixkey(math.random(), pool)`로 로드 시 1회, 이후 매 `seedrandom()` 호출마다 갱신된다(`seedrandom.js:80, 226, 251`). 이는 `entropy: true`의 재현 불가능성을 프로세스 전역 부작용으로 만든다 — 같은 코드를 같은 순서로 실행해도 그 이전에 다른 `seedrandom()` 호출이 있었는지에 따라 결과가 달라질 수 있다(설계상 의도된 동작이지만 순수성은 없다).
- **`{global: true}`가 `Math.random`을 실제로 교체한다.** README 자체가 "production 라이브러리에서는 이렇게 하지 말라"고 경고하며 cryptico 라이브러리의 실제 오용 사례를 인용한다(`README.md:56-65`). 전역 부작용을 옵션 하나로 켤 수 있다는 것 자체가 API 위험 표면이다.
- **마지막 릴리즈가 2019년으로 6~7년간 정지 상태다(1절).** 이후 ECMAScript/브라우저 변화(예: `crypto.getRandomValues` 표준화 이후의 관행, ESM 대응)를 반영하지 않았다. `package.json`에 `exports` 필드가 없고 `main`(CJS)만 있다(`package.json:5`) — 현대적 dual ESM/CJS 배포가 아니다.
- **믹서(`mixkey`)와 alea의 `Mash()`가 둘 다 비표준 자체 설계 해시다(2.3절).** FNV류처럼 공개된 표준 테스트 벡터가 없어 독립 재구현 시 정확성을 검증할 참조 자료가 라이브러리 자체(코드)뿐이다.

## 6. `@cp949/random`이 배울 점

`@cp949/random`의 `RandomSource`는 `() => number`인 순수 함수이고, `RandomState`(`packages/random`의 `./state`, `docs/api/state.md`)는 그 위에 leaf 11개를 클로저로 바인딩한 facade다. `docs/api/state.md:126`에 명시된 대로 "`this`를 쓰지 않는 클로저"이며 `state.source`는 `RandomSource`(`() => number`) 그 자체다 — 내부에 직렬화 가능한 순수 데이터 필드(`{i,j,S}` 같은)가 없다. seedrandom의 state API를 그대로 이식하려면 다음 구조적 차이를 넘어야 한다.

1. **seedrandom의 `.state()`가 가능한 이유는 PRNG 구현이 "숫자 필드가 붙은 객체(`this`/`me`)"이기 때문이다.** ARC4는 `me.i, me.j, me.S`(`seedrandom.js:118`), xorwow는 `me.x..me.v, me.d`(`lib/xorwow.js:17-21`)처럼 객체 프로퍼티로 상태를 노출해 두고, `copy()`가 그 필드를 얕은 복사한다. 반면 `@cp949/random`의 `createXoshiro128Source`는 `s0..s3`을 함수 클로저 지역 변수로 캡슐화한다(`docs/api/random-core.md:88`의 SplitMix32 확장 설명 참고) — 이는 의도된 설계(캡슐화, 외부 변형 방지)이지 실수가 아니다. seedrandom 방식으로 전환하려면 **상태를 객체 프로퍼티로 노출**해야 하는데, 이는 "소스가 순수 함수(`RandomSource: () => number`)"라는 root 계약(`docs/api/random-core.md:67-73`) 자체를 깨는 변경이라 breaking이다.
2. **이식 가능한 절충안은 "직렬화 가능한 상태"를 별도 값으로 반환하는 `createXoshiro128Source`의 변형(예: `createXoshiro128SourceWithState(seed)` 같은 별도 export)이다.** seedrandom의 xor128/xorwow류처럼 `{s0,s1,s2,s3}` 4개 정수만 있으면 충분하므로(`docs/api/random-core.md:88`), ARC4의 `{i,j,S}`(256워드 배열)보다 오히려 **가볍게 구현 가능**하다. 다만 이 경우 `RandomSource`가 `() => number`가 아니라 `{ next: () => number; getState(): State; setState(s: State): void }` 같은 별도 인터페이스가 되어 현재 root 계약(순수 함수 하나)과 양립하지 않는다 — 새 export/새 subpath(`./state`가 아니라 별도, 예: 가칭 `./checkpoint`)로 분리하는 편이 기존 계약을 안 깨는 길이다.
3. **`RandomState`(`./state`) 계층에서 흉내낼 수 있는 부분은 "seed 재구성"이지 "중간 상태 스냅샷"이 아니다.** seedrandom의 상태 복원은 `seedrandom("", {state: saved})`처럼 **seed와 무관하게 상태 객체가 전부를 결정**한다(2.4절, `seedrandom.js:87`). `@cp949/random`의 `createRandomState(seed)`는 seed로부터 결정론적으로 상태를 만들 뿐(`docs/api/state.md:38`), "N번 호출한 이후의 중간 지점"을 저장하는 기능은 없다. 이를 흉내내려면 word 소비 횟수(호출 카운트)를 별도로 추적해 "seed + 재생 횟수"를 상태로 직렬화하는 방법이 있는데, 이는 seedrandom의 O(1) 상태 크기 대비 재생 비용이 O(호출 횟수)라는 트레이드오프를 갖는다 — xoshiro128\*\*는 상태가 4워드뿐이라 재생 비용이 사실상 무의미하게 작다는 점(1억 회 호출도 수십 ms)을 고려하면, "seed + 소비한 word 수"를 상태로 저장하고 필요 시 재생(replay)하는 방식이 `@cp949/random`의 순수 함수 계약을 깨지 않는 가장 실용적인 절충안이다.
4. **판별 로직 일관성은 그대로 반면교사로 삼을 만하다.** seedrandom은 알고리즘마다 상태 객체 판별 방식이 제각각이라(5절) 잘못된 상태 객체를 넘겨도 조용히 깨진다. `@cp949/random`이 만약 상태 직렬화 기능을 추가한다면, `docs/api/state.md:60-66`의 "오류 계약"처럼 상태 객체 형태 검증을 명시적 `RangeError`로 통일하는 편이 seedrandom보다 안전하다.
5. **문자열 종료자 이슈는 이미 회피돼 있다.** `@cp949/random`의 FNV-1a는 seedrandom의 mixkey(2.3절, 256바이트 순환 버퍼)와 달리 임의 길이 문자열을 고정 32비트로 축약하는 표준 알고리즘이라 "짧은 키 순환" 문제 자체가 구조적으로 다르다(다만 FNV-1a도 서로 다른 문자열이 같은 해시로 충돌할 수 있다는 점은 `docs/api/random-core.md:90`의 "서로 다른 문자열이 같은 상태를 만들 수 있다"에 이미 명시돼 있다). seedrandom처럼 "일부만 자동 처리하고 나머지는 사용자 책임"으로 남기는 반쪽짜리 해결책은 채택하지 않는 편이 낫다는 근거로 seedrandom의 사례를 인용할 수 있다.
6. **golden vector 회귀 테스트 관행은 이미 `@cp949/random` 쪽이 더 엄격하다.** seedrandom은 7개 알고리즘 각각 seed 하나(`alg(1)` 또는 `alg('hello.')`)의 golden vector만 고정한다(`test/prngtest.js:66-79`). `@cp949/random`은 `docs/api/random-core.md:94-104`에서 여러 seed(숫자/음수/문자열/빈 문자열)의 다중 word golden vector를 문서 표로도 노출한다 — 이 우위는 유지하면 된다.

## 7. 참고 자료

- 로컬 클론: `/work/thrd/seedrandom`, 커밋 `4460ad325a0a15273a211e509f03ae0beb99511a`("release 3.0.5", 저자 날짜 2019-09-17)
- 원본 GitHub: https://github.com/davidbau/seedrandom
- npm: https://www.npmjs.com/package/seedrandom
- 이번 조사에서 직접 읽은 파일: `seedrandom.js`, `index.js`, `package.json`, `README.md`, `lib/alea.js`, `lib/xor128.js`, `lib/xorwow.js`, `lib/xorshift7.js`, `lib/xor4096.js`, `lib/tychei.js`, `lib/crypto.js`, `test/nodetest.js`, `test/prngtest.js`
- 확인하지 못한 사항(지어내지 않고 명시): GitHub 저장소의 아카이브 여부·이슈/PR 활동(로컬 클론이 단일 커밋이라 원격 이력 확인 불가), `test/*.html`(qunit 브라우저 테스트)의 상세 실행 결과(정적으로만 읽었고 실행하지 않음), `test/out/dieharder-report.txt`의 통계 검정 세부 수치(파일 존재만 확인, 내용 미분석).
