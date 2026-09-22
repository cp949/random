# chance.js (chancejs/chancejs) 심층 분석

로컬 클론 `/work/thrd/chancejs`의 실제 소스(README가 아닌 `chance.js` 본문, `test/`, `docs/`)를 Read/Grep으로 직접 확인해 작성했다. 확인 날짜 2026-09-22.

## 1. 개요

| 항목          | 내용                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 목적          | 이름·주소·날짜·전화번호 등 **도메인별 가짜 데이터 생성**이 핵심. seed 재현성은 그 위에 얹힌 부가 기능(`docs/intro.md:3-5`).                                                                                                                                                                                                                                                                                                           |
| 버전          | `package.json`의 `version`은 `1.1.13`. 그러나 `chance.js:1`의 헤더 주석은 `//  Chance.js 1.1.12`로 남아 있고, `Chance.prototype.VERSION`(`chance.js:75`)은 `"1.1.13"`이다. 버전 문자열이 파일 내에서 불일치한다.                                                                                                                                                                                                                      |
| 라이선스      | MIT (`LICENSE:1-3`, Copyright 2015 Victor Quinn).                                                                                                                                                                                                                                                                                                                                                                                     |
| 마지막 커밋   | 로컬 클론은 **shallow(depth 1) clone**이라 히스토리 전체를 확인할 수 없다(`.git/shallow` 존재, `git log --oneline --all`이 1개 커밋만 반환, 브랜치는 `master`/`origin/master`뿐). 확인 가능한 tip 커밋은 `bd69bec "Version bump to 1.1.13"`, 날짜 `2025-05-18 17:02:32 -0400`. 전체 커밋 이력·기여자 수는 이 클론만으로는 확인 안 됨(로컬에서 보이는 커밋 작성자는 1명뿐이나 shallow clone 때문일 뿐 실제 기여자 수를 뜻하지 않는다). |
| 유지보수 인상 | `package.json`의 devDependencies는 `gulp`, `babel-eslint`, `ava` 등 2017~2019년대 툴체인(`package.json:16-30`)이고, README 배지는 Travis CI(`README.md:5`)를 가리킨다 — 최신 CI(GitHub Actions 등)로 이전됐는지는 이 클론만으로 확인 안 됨.                                                                                                                                                                                           |

## 2. 핵심 구현 상세 (파일:줄번호 인용)

### 2.1 Mersenne Twister는 내장 포팅, 외부 패키지 의존 아님

- `package.json`에 `dependencies` 필드 자체가 없다(런타임 의존성 0, devDependencies만 존재. `package.json:16-30`).
- `chance.js:11251` 주석: `// Mersenne Twister from https://gist.github.com/banksean/300494` — Sean McCullough의 gist를 **소스 그대로 파일 내부에 인라인 포팅**한 것이며 npm 패키지(`mersenne-twister` 등)를 의존성으로 끌어오지 않는다.
- `docs/intro.md:47`: "Thank you to Sean McCullough ... on which almost the entirety of this library is dependent. And to Takuji Nishimura and Makoto Matsumoto who wrote the original C version." — MT19937 원 논문 저자까지 명시적으로 출처를 밝힌다.
- MT 구현 본체는 `chance.js:11294-11419`(`var MersenneTwister = function (seed) {...}` ~ `genrand_res53`). 표준 MT19937 파라미터(`N=624, M=397, MATRIX_A=0x9908b0df` 등, `chance.js:11300-11304`)를 그대로 사용한다.
- 흥미로운 점: `init_by_array`(배열 기반 초기화, `chance.js:11331-11353`), `genrand_int31`/`genrand_real1`/`genrand_real3`/`genrand_res53`(53비트 해상도 등, `chance.js:11393-11419`)이 정의돼 있지만 **저장소 전체에서 호출되는 곳이 없다**(`grep -n "init_by_array\|genrand_real1\|genrand_real3\|genrand_res53\|genrand_int31" chance.js`가 각 함수의 "정의" 줄만 반환). 실제로 쓰이는 건 `genrand_int32`(`chance.js:11356-11390`)와 이를 감싼 `random()`(`chance.js:11404-11407`, `genrand_int32() * (1.0/4294967296.0)`, 32비트 해상도)뿐이다. 즉 seed는 항상 단일 32비트 정수 하나로만 `init_genrand`에 들어가고, 배열 기반의 더 강한 초기화 경로(`init_by_array`)는 죽은 코드다.

### 2.2 `new Chance(seed)` 생성자의 시드 정규화

전체 로직은 `chance.js:29-73`.

```js
function Chance(seed) {
  if (!(this instanceof Chance)) {
    if (!seed) {
      seed = null;
    }
    return seed === null ? new Chance() : new Chance(seed);
  }

  if (typeof seed === "function") {
    this.random = seed;
    return this;
  }

  if (arguments.length) {
    this.seed = 0;
  }

  for (var i = 0; i < arguments.length; i++) {
    var seedling = 0;
    if (Object.prototype.toString.call(arguments[i]) === "[object String]") {
      for (var j = 0; j < arguments[i].length; j++) {
        var hash = 0;
        for (var k = 0; k < arguments[i].length; k++) {
          hash = arguments[i].charCodeAt(k) + (hash << 6) + (hash << 16) - hash;
        }
        seedling += hash;
      }
    } else {
      seedling = arguments[i];
    }
    this.seed += (arguments.length - i) * seedling;
  }

  this.mt = this.mersenne_twister(this.seed);
  this.bimd5 = this.blueimp_md5();
  this.random = function () {
    return this.mt.random(this.seed);
  };

  return this;
}
```

정규화 규칙(각각 `chance.js` 줄번호로 확인):

- **함수형(seed 파생 아님)**: `typeof seed === 'function'`이면 `this.random = seed`로 통째로 교체하고 MT를 아예 만들지 않는다(`chance.js:36-39`). 테스트 `test.basic.js:138-144`에서 `new Chance(() => 123)`이 항상 123을 반환함을 검증한다.
- **숫자**: `else { seedling = arguments[i]; }`(`chance.js:60`)로 그대로 사용, 문자열이 아니면 타입 검사 없이 산술 연산에 투입된다.
- **문자열**: `chance.js:50-58`. **주의할 점**: 바깥 루프 변수 `j`(0..length-1)는 인덱스로 전혀 쓰이지 않는다 — 안쪽 루프는 매번 `k`를 0부터 문자열 끝까지 다시 돌며 **똑같은 해시값**(djb2 계열: `hash = charCodeAt(k) + (hash<<6) + (hash<<16) - hash`)을 처음부터 재계산한다. 결과적으로 `seedling`은 `문자열.length × hash(전체 문자열)`과 같다(같은 해시를 `length`번 반복해서 더함). 이는 사실상 버그에 가까운 비효율적 구현이며, 서로 다른 문자열이 우연히 `length × hash` 곱에서 충돌할 표면적을 넓힌다.
- **다중 인자**: `this.seed += (arguments.length - i) * seedling;`(`chance.js:62`) — 인자 위치마다 가중치(`남은 인자 개수`)를 곱해 합산한다. 이 덕에 `new Chance("hold","me","closer")`처럼 인자 순서·개수가 다르면 다른 seed가 나온다(`docs/usage/seed.md:34-47`에서 예시로 설명).
- **32비트로의 축소**: 위에서 계산한 `this.seed`(임의 크기의 JS number일 수 있음)를 `this.mersenne_twister(this.seed)` → `MersenneTwister(seed)` → `init_genrand(seed)`에 넘기면 `chance.js:11314`에서 `this.mt[0] = s >>> 0;`로 **무조건 32비트로 잘린다**. 즉 큰 문자열 해시나 다중 인자 합산도 최종적으로는 32비트 공간(약 42억 가지)에만 매핑되고 그 이상은 버려진다.
- **은닉된 죽은 인자**: `this.random = function () { return this.mt.random(this.seed); };`(`chance.js:68-70`)에서 `this.mt.random`은 `chance.js:11404`에 정의된 `MersenneTwister.prototype.random = function () {...}`로 **매개변수를 받지 않는다**. 즉 `this.seed` 인자는 매 호출마다 전달되지만 완전히 무시된다 — 재시딩이 아니라 순수 관성적 잔재 코드다.
- **falsy seed 처리**: `new Chance(null)`, `new Chance(0)`, `new Chance()` (인자 없음)의 구분이 미묘하다. `arguments.length`가 0이면 `this.seed`는 `undefined`로 남고(`chance.js:41-44`가 `if (arguments.length)`일 때만 0으로 초기화), 결과적으로 `MersenneTwister(undefined)`가 호출되어 `chance.js:11295-11298`의 `seed === undefined` 분기(`Math.random()*10^13`로 무작위 시드)를 탄다. `!(this instanceof Chance)` 팩토리 호출 경로(`chance.js:30-33`, 이슈 #322 대응 주석)는 `Chance(null)`, `Chance(0)`, `Chance(false)` 등 모든 falsy 값을 "seed 없음"으로 취급해 `new Chance()`로 리다이렉트한다.

### 2.3 재현성 계약의 테스트 검증 — golden vector는 없다, 상대 비교만

`test/test.basic.js`(전체 경로 `/work/thrd/chancejs/test/test.basic.js`)에 재현성 테스트가 존재한다:

- `test.basic.js:89-97` "Chance() returns repeatable results if seed provided on the Chance object": 같은 숫자 seed(`Date.now()`)로 두 인스턴스를 만들어 `random()`을 1000회 비교(`t.is(chance1.random(), chance2.random())`).
- `test.basic.js:99-107` "returns repeatable results if a string is provided as a seed": `"foo"` seed로 동일 검증.
- `test.basic.js:73-77`, `109-116`, `118-126`, `128-136`: 서로 다른 seed(다른 숫자/문자열/다중 인자)는 결과가 달라야 함을 `t.not`으로 검증(문자열 케이스는 `"abe"` vs `"acc"`처럼 해시 충돌 회귀 방지용 케이스도 있다 — `test.basic.js:118-126` 주석 "Credit to @dan-tilley for noticing this flaw in the old seed").
- `test.basic.js:62-71`, `79-87`: seed 없음(`null`)일 때는 재현되지 않아야 함을 검증.
- **golden vector(고정된 기대 출력값 하드코딩)는 없다.** 모든 테스트가 "같은 seed → 같은 인스턴스 간 상대적으로 같은 값" 또는 "다른 seed → 다른 값"만 확인할 뿐, `random()`이 정확히 어떤 숫자를 내야 하는지 리터럴로 고정한 테스트는 `test/` 디렉터리 전체(`test.basic.js`, `test.helpers.js` 등)에서 발견되지 않았다. 즉 **버전 간 raw 출력 스트림 호환성은 테스트로 보장되지 않는다** — MT 알고리즘이나 seed 해싱 공식이 바뀌어도 이 테스트 스위트는 여전히 통과한다.
- `docs/usage/seed.md`도 마찬가지로 "두 인스턴스가 같은 값을 낸다"는 상대적 서술만 하고 구체적 숫자를 golden vector로 문서화하지 않는다.

### 2.4 도메인 생성기의 PRNG 공유 아키텍처

단일 진입점 구조를 소스에서 직접 확인했다:

- `this.mt`는 생성자(`chance.js:66`)와 `random` 클로저(`chance.js:69`) 두 곳에서만 참조된다(`grep -n "this\.mt\b" chance.js` 결과, MT 구현 내부의 `this.mt`는 상태 배열이라 별개). 즉 인스턴스의 모든 도메인 함수는 `this.mt`에 직접 접근하지 않고 반드시 `this.random()`을 거친다.
- 계층 구조: `this.random()`(`chance.js:68-70`, MT `genrand_int32` 기반) → `Chance.prototype.integer`(`chance.js:277-284`, `Math.floor(this.random() * (max-min+1) + min)`) → `Chance.prototype.natural`(`chance.js:297-322`, `integer`를 호출) → `Chance.prototype.pick`/`pickone`/`shuffle`(`chance.js:650-717`, `natural`을 호출해 인덱스를 뽑음) → `name`/`address`/`animal` 등 도메인 함수(예: `chance.js:1154-1178`의 `name()`은 `this.first()`·`this.last()`·`this.character()`를 호출하고, 이들은 결국 `pick`/`natural`로 귀결).
- `random()`을 직접 호출하는 곳은 5곳뿐이다(`bool`, `floating`→`integer`, `normal`의 Marsaglia polar method(`chance.js:11157-11159`, `u = this.random()*2-1; v = this.random()*2-1;`) 등). 대신 `this.natural(...)` 호출은 56곳, `this.integer(...)` 호출은 17곳으로, 대부분의 도메인 생성기가 `natural`/`integer`를 경유해 간접적으로 같은 PRNG 인스턴스를 공유한다.
- 이 구조 덕에 **seed 하나(=MT 인스턴스 하나)로 이름·주소·날짜 등 서로 다른 도메인 함수를 어떤 순서로 섞어 호출해도 재현 가능**하다(같은 순서로 호출하면 같은 결과). 반대로 이는 "seed→상태" 분리가 없고 "seed→인스턴스 전체 호출 히스토리"에 재현성이 묶여 있다는 뜻이기도 하다 — 부분적으로만 소비하거나 호출 순서를 바꾸면 재현성이 깨진다.
- 사용자 지정 함수로 `this.random`을 완전히 대체할 수 있는 훅(`chance.js:36-39`)도 이 아키텍처 덕분에 성립한다 — 도메인 함수들이 MT 내부를 몰라도 되므로 어떤 함수든 `random`으로 주입 가능.

### 2.5 정수 추출 방식 — rejection sampling 없음

`Chance.prototype.integer`(`chance.js:277-284`):

```js
return Math.floor(
  this.random() * (options.max - options.min + 1) + options.min,
);
```

32비트 해상도의 `random()`(`[0,1)`, 실질 정밀도 2^32단)를 곱셈-스케일링해 정수로 변환한다. `@cp949/random`의 `int()`(rejection sampling, `docs/api/random-core.md` 118행 이하)와 달리 modulo/scaling bias 제거 로직이 없다 — 범위가 2^32와 서로소가 아니면 일부 정수가 근소하게 더 자주 나올 수 있다(범위가 작을 때는 실무상 무시할 수준이나, 문서화된 무편향 보장은 없다).

## 3. 장점

1. **런타임 의존성 0.** `package.json`에 `dependencies`가 없고 MT를 파일 내부에 완전히 인라인했다(`chance.js:11251-11419`). 설치 시 서드파티 PRNG 패키지의 공급망 리스크가 없다.
2. **seed 입력 오버로딩이 매우 유연하다.** 숫자, 문자열, 다중 인자, 심지어 임의의 생성기 함수까지 하나의 생성자로 받는다(`chance.js:29-63`). 사용자는 "이 함수가 seed를 어떻게 정규화하는가"를 신경 쓰지 않고 직관적으로 호출할 수 있다.
3. **테스트로 재현성 계약의 핵심 성질(같은 seed→같은 값, 다른 seed→다른 값, seed 없음→비재현)을 명시적으로 검증한다**(`test.basic.js:62-144`). 과거 문자열 해시 충돌 버그(`"abe"` vs `"acc"`)에 대한 회귀 테스트까지 남겨뒀다(`test.basic.js:118-126`).
4. **단일 PRNG 진입점(`this.random()`) 위에 계층적으로 쌓은 아키텍처**라 신규 도메인 생성기를 추가할 때 PRNG 세부사항을 몰라도 되고, `this.random`을 함수로 교체하면 라이브러리 전체의 난수 소스를 통째로 바꿀 수 있다(`chance.js:36-39`).
5. **암호학적 안전성에 대한 경고를 프로젝트 차원에서 명시**했다(`docs/intro.md:54`) — 오용 방지 문서화가 되어 있다.

## 4. 단점 / 트레이드오프

1. **PRNG 코어로서 예측 가능.** Mersenne Twister(MT19937) 자체가 암호학적으로 안전하지 않다 — 연속 출력 624개(32비트 워드)만 관측하면 내부 상태 전체를 복원해 이후 출력을 완벽히 예측할 수 있는 알고리즘으로 널리 알려져 있다. 프로젝트도 이를 알고 `docs/intro.md:54`에서 "이 라이브러리를 진짜 무작위성이 필요한 암호 응용에는 쓰지 말라"고 명시한다. `@cp949/random`의 xoshiro128\*\*도 CSPRNG는 아니지만, chance.js는 "암호 용도 아님"을 문서 각주에만 남기고 API 시그니처나 타입으로 강제하지 않는다.
2. **seed→상태 변환이 사실상 언더도큐먼트**되어 있고 구현에 결함 소지가 있다. 문자열 해싱 루프(`chance.js:50-58`)의 바깥 `j` 루프가 실질적으로 아무 역할을 하지 않는 채 같은 해시를 `length`번 반복 가산하는 구조라, 의도(문자별 위치를 반영한 해싱으로 보임)와 실제 동작이 다르다. 이 사실은 `docs/usage/seed.md`나 README 어디에도 설명되지 않는다.
3. **32비트로의 손실 압축.** 문자열이 아무리 길어도, 다중 인자를 아무리 많이 넣어도 최종적으로 `s >>> 0`(`chance.js:11314`)에서 32비트로 잘린다. 초기 상태 공간이 2^32로 제한되는 점은 `@cp949/random`의 `createXoshiro128Source`(숫자/문자열 모두 uint32 정규화 후 SplitMix32로 128비트 상태 확장, `docs/api/random-core.md:90`)와 유사한 한계이나, chance.js는 이 사실을 전혀 문서화하지 않는다.
4. **재현성 계약에 golden vector가 없다.** `test/`에는 "seed가 같으면 두 인스턴스가 서로 같다"는 상대 비교만 있고, 특정 seed에 대해 특정 숫자를 기대하는 리터럴 테스트가 없다(2.3절). MT19937 알고리즘 자체나 시드 해싱 공식이 향후 리팩터링되어도 테스트가 이를 잡아내지 못한다 — 버전 간 raw 출력 호환성이 사실상 보장되지 않는다.
5. **죽은 코드와 버전 불일치.** `init_by_array`, `genrand_int31`, `genrand_real1`, `genrand_real3`, `genrand_res53`가 정의만 되고 호출되지 않는다(2.1절). `chance.js:1`의 헤더 버전 주석(`1.1.12`)과 `Chance.prototype.VERSION`(`1.1.13`, `chance.js:75`)이 서로 다르다 — 릴리스 프로세스에 검증 누락이 있었음을 시사한다.
6. **정수 추출에 rejection sampling이 없다**(2.5절) — modulo/scaling bias에 대한 명시적 보정이나 문서화가 없다.
7. **`random()`에 전달되는 `this.seed` 인자가 완전히 무시된다**(2.2절 마지막 항목) — 죽은 매개변수가 API 표면에 남아 있어 코드를 읽는 사람에게 "매 호출마다 seed로 뭔가 한다"는 오해를 줄 수 있다.
8. **버전/유지보수 상태를 로컬 클론만으로는 확실히 판단하기 어렵다.** shallow clone이라 전체 커밋 이력을 볼 수 없고(`.git/shallow` 확인), README의 CI 배지는 Travis CI를 가리켜(`README.md:5`) 최신 CI 체계로 이전됐는지 불확실하다.

## 5. `@cp949/random`이 배울 점

1. **생성자 오버로드형 seed 입력(숫자/문자열/함수)의 편의성은 취하되, `createXoshiro128Source(seed)`의 타입 계약(`number | string`, `docs/api/random-core.md:78-79`)처럼 엄격한 타입 검증은 유지한다.** chance.js는 `typeof seed === 'function'`이면 사실상 "PRNG 전체를 사용자 함수로 대체"하는 것을 허용하는데(`chance.js:36-39`), 이는 `@cp949/random`의 `RandomSource`(사용자 정의 `() => number` 허용, `random-core.md:220-233`) 설계와 이미 같은 철학이다 — 대신 `@cp949/random`은 이를 "다른 함수"(`createXoshiro128Source`가 아닌 `RandomSource` 자체의 자유도)로 명확히 분리해뒀다는 점이 chance.js보다 우위다. 다만 chance.js의 "다중 인자 seed"(`new Chance("hold","me","closer")`)처럼 **여러 값을 하나의 seed로 합성하고 싶은 사용 사례**(예: 사용자 ID + 세션 ID + 라운드 번호를 조합해 결정론적 seed 생성)는 실전에서 자주 나온다. `@cp949/random`은 이를 API에 넣기보다 "여러 값을 문자열로 join해서 하나의 seed 문자열을 만들라"는 패턴을 문서(사용 예)에 명시적으로 제안하는 편이 낫다 — chance.js처럼 가중합 해싱을 자체 구현하면 2.2/4.2절 같은 결함(해시 재계산 버그, 32비트 손실)을 반복할 위험이 크다.
2. **golden vector 관행을 계속 지금 수준으로 유지·확장한다.** `@cp949/random`은 이미 `docs/api/random-core.md:94-104`에서 seed별 raw word와 `float`/`bool`/`sign` 결과 열을 리터럴로 고정하고 `packages/random/test/core/*.test.ts`에 전체 벡터를 두고 있다 — 이는 chance.js가 "상대 비교만 하고 golden vector가 없다"(4.4절)는 약점을 정확히 메운 설계다. 이 차별점을 README/랜딩 문서에서 "chance.js·seedrandom과 달리 버전 간 raw 출력 스트림을 golden vector로 고정해 검증 가능하다"고 명시적으로 강조할 수 있다.
3. **"암호 용도 아님"을 각주가 아니라 타입/네이밍/API 분리로 강제한다.** chance.js는 이를 `docs/intro.md:54` 각주 한 줄로만 경고하고 API 시그니처상 일반 PRNG와 구분하지 않는다. `@cp949/random`은 이미 `createXoshiro128Source`(비보안)와 `./secure`의 `createSecureSource()`(보안, `random-core.md:29,34`)를 **서로 다른 entrypoint/이름**으로 완전히 분리했다 — 이 설계를 유지하고, `createXoshiro128Source`의 TSDoc/문서에 chance.js식 "예측 가능성" 근거(624워드 연속 관측 시 내부 상태 복원 가능 등, 구체적 알고리즘 특성)를 한 줄 덧붙이면 chance.js보다 한 단계 더 명확한 경고가 된다.
4. **seed→상태 변환 로직에 대한 자체 코드 리뷰용 회귀 테스트를 참고한다.** chance.js의 `test.basic.js:118-126`("abe" vs "acc" 해시 충돌 회귀 테스트)처럼, `@cp949/random`도 FNV-1a 해시가 실수로 깨지는 리팩터링을 잡기 위한 "유사 문자열이 다른 상태를 만든다"는 회귀 테스트를 유지한다(이미 `random-core.md:87`의 표준 FNV-1a 테스트 벡터로 이 역할을 상당 부분 커버하고 있어, 반드시 추가할 항목이라기보다 현재 방향이 chance.js보다 낫다는 확인).
5. **PRNG 코어와 도메인 생성기를 계층 분리한 아키텍처를 참고할 가치가 있다(단, 반대 방향으로).** chance.js는 "도메인 생성기(이름/주소 등) 안에 PRNG를 캡슐화"해서 `this.random()` 하나로 모든 걸 공유하지만, 이 때문에 부분 소비·호출 순서 변경에 재현성이 취약하다(2.4절 마지막 문단). `@cp949/random`은 이미 반대로 `RandomSource`를 **명시적으로 함수 인자로 전달**하는 설계(`int(source, min, max)` 등)를 택했고, 이는 chance.js식 암묵적 인스턴스 공유보다 "어떤 호출이 word를 몇 개 소비하는지"를 예측하기 쉽게 한다(`docs/api/sampling.md`의 word 소비량 표가 이미 이 장점을 보여준다). 이 설계 방향을 앞으로도 유지할 근거로 chance.js 사례를 인용할 수 있다.

## 6. 참고 자료

- 로컬 클론: `/work/thrd/chancejs` (shallow clone, commit `bd69becf18edce68e140639400d10167c7173674`, "Version bump to 1.1.13", 2025-05-18)
- 원본 GitHub 저장소: https://github.com/chancejs/chancejs
- 원본 Mersenne Twister gist(포팅 출처, `chance.js:11251`에서 인용): https://gist.github.com/banksean/300494
- 공식 사이트/문서: https://chancejs.com
- 시드 사용법 문서(로컬): `/work/thrd/chancejs/docs/usage/seed.md`
- 소개 문서(암호 안전성 경고, 로컬): `/work/thrd/chancejs/docs/intro.md`
- 재현성 테스트(로컬): `/work/thrd/chancejs/test/test.basic.js`
- 참고용 개요(이번 심층 분석의 상위 문서): `/work/cp949/random/docs/research/similar-libraries.md`의 "chance.js" 절
