import { test } from 'node:test';
import assert from 'node:assert/strict';
// サイトの JS はブラウザ用の ES モジュールだが、DOM を使わないのでそのまま読み込める
import { TASK_SIZES, estimate, place, perInstance, REASON } from '../site/assets/sim.js';

const small = TASK_SIZES[0];

test('1 台あたりのタスク数がハンズオンの実測と一致する（0.25 vCPU / 512 MiB）', () => {
  assert.deepEqual(perInstance('B1', small), { count: 2, capacity: 7, limitedBy: 'eni' });
  assert.deepEqual(perInstance('B2', small), { count: 7, capacity: 7, limitedBy: 'memory' });
  assert.deepEqual(perInstance('C', small), { count: 7, capacity: 7, limitedBy: 'memory' });
  assert.deepEqual(perInstance('D', small), { count: 1, capacity: 7, limitedBy: 'port' });
});

test('40 タスクの月額がレポートの試算と一致する', () => {
  assert.equal(estimate('A', 40, small).monthly, 360.4);
  assert.equal(estimate('B1', 40, small).monthly, 1241);
  assert.equal(estimate('B1', 40, small).instances, 20);
  assert.equal(estimate('B2', 40, small).monthly, 372.3);
  assert.equal(estimate('C', 40, small).instances, 6);
  assert.equal(estimate('D', 40, small).monthly, 2482);
});

test('タスク数ごとの台数がレポートの表と一致する', () => {
  const expected: Record<number, [number, number, number]> = {
    10: [5, 2, 10],
    20: [10, 3, 20],
    80: [40, 12, 80],
    160: [80, 23, 160],
  };
  for (const [tasks, [b1, b2, d]] of Object.entries(expected)) {
    assert.equal(estimate('B1', Number(tasks), small).instances, b1, `B1 ${tasks}`);
    assert.equal(estimate('B2', Number(tasks), small).instances, b2, `B2 ${tasks}`);
    assert.equal(estimate('C', Number(tasks), small).instances, b2, `C ${tasks}`);
    assert.equal(estimate('D', Number(tasks), small).instances, d, `D ${tasks}`);
  }
});

test('B1 の 2 台に 10 タスクを要求すると 4 個だけ動き、残りは RESOURCE:ENI', () => {
  const r = place('B1', { tasks: 10, instances: 2, task: small });
  assert.equal(r.running, 4);
  assert.equal(r.pending, 6);
  assert.equal(r.reason, REASON.ENI);
  assert.deepEqual(r.perInstanceTasks, [2, 2]);
});

test('host は 1 台 1 タスクで、超えた分は RESOURCE:PORTS', () => {
  const r = place('D', { tasks: 3, instances: 2, task: small });
  assert.equal(r.running, 2);
  assert.equal(r.reason, REASON.PORTS);
});

test('IP の消費：bridge と host はタスクを増やしても増えない', () => {
  assert.equal(place('C', { tasks: 10, instances: 2, task: small }).ips, 2);
  assert.equal(place('A', { tasks: 20, instances: 0, task: small }).ips, 20);
  // B2：タスク 10 + プライマリ 2 + トランク 2
  assert.equal(place('B2', { tasks: 10, instances: 2, task: small }).ips, 14);
});

test('大きいタスクではメモリが先に上限になり、ENI の差がなくなる', () => {
  const large = TASK_SIZES[2];
  assert.equal(perInstance('B1', large).count, 1);
  assert.equal(perInstance('B1', large).limitedBy, 'memory');
  assert.equal(estimate('B1', 10, large).instances, estimate('C', 10, large).instances);
});

test('不正な入力は例外になる', () => {
  assert.throws(() => perInstance('X', small), RangeError);
  assert.throws(() => estimate('C', 1, { vcpu: 0, memGiB: 1 }), RangeError);
});
