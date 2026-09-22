/** 설치된 패키지에서 한 식으로 만드는 사용성 사례. 타입 검사는 usage-id.ts의 같은 식이 담당한다. */
import assert from "node:assert/strict";
import {
  createCounterIdFactory,
  createCyclicIdFactory,
  randomId,
  uuidv4,
} from "@cp949/random/id";

assert.match(
  randomId({ prefix: "usr", length: 16 }),
  /^usr_[A-Za-z0-9_-]{16}$/,
);
assert.match(
  randomId({ prefix: "req", timestamp: true, length: 8 }),
  /^req_[0-9a-z]{9}_[A-Za-z0-9_-]{8}$/,
);
assert.match(randomId({ preset: "digits", length: 6 }), /^[0-9]{6}$/);
assert.match(
  randomId({ startWithLetter: true, length: 10 }),
  /^[A-Za-z][A-Za-z0-9_-]{9}$/,
);

// 첫 후보만 사용 중으로 표시해 실제 crypto에서도 충돌 재시도를 결정적으로 검증한다.
const used = new Set();
const candidates = [];
used.has = (id) => {
  candidates.push(id);
  if (candidates.length === 1) used.add(id);
  return Set.prototype.has.call(used, id);
};
const available = randomId({ length: 12, isTaken: (id) => used.has(id) });
assert.match(available, /^[A-Za-z0-9_-]{12}$/);
assert.ok(candidates.length >= 2);
assert.equal(candidates[candidates.length - 1], available);
assert.equal(Set.prototype.has.call(used, available), false);

assert.match(
  uuidv4({ dashes: false }),
  /^[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}$/,
);
assert.match(
  randomId({ preset: "readable", length: 12, group: 4 }),
  /^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){2}$/,
);

// 사용성 사례 7. int32 순환 ID: 0에서 시작해 2147483647 다음이 -2147483648이다.
const nextInt32 = createCyclicIdFactory({ preset: "int32" });
assert.equal(nextInt32(), 0);
assert.equal(nextInt32(), 1);
nextInt32.reset(2147483647);
assert.equal(nextInt32(), 2147483647);
assert.equal(nextInt32(), -2147483648);

// 사용성 사례 8. 접두사 + base36 카운터 ID(Blockly의 'blockly-' + (nextId++).toString(36) 형태).
const nextBlocklyId = createCounterIdFactory({
  prefix: "blockly",
  separator: "-",
  radix: 36,
});
assert.equal(nextBlocklyId(), "blockly-0");
assert.equal(nextBlocklyId(), "blockly-1");
nextBlocklyId.reset(35);
assert.equal(nextBlocklyId(), "blockly-z");
assert.equal(nextBlocklyId(), "blockly-10");
