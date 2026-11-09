// 配置とコストの計算（DOM に依存しない純粋な関数）。
// 計算方法はハンズオンの scripts/cost-calc.py と同じ。単価と実測値は docs/reports.md（2026-11-09, us-east-1）より。

export const INSTANCE = Object.freeze({
  type: 'c6i.large',
  vcpu: 2,
  memGiB: 4,
  usableMemRatio: 0.932, // 登録メモリ 3,819 MiB / 4,096 MiB
  maxEni: 3, // プライマリ ENI を含む
  trunkLimit: 10, // ENI トランキング時の awsvpc タスク上限
  hourly: 0.085,
});

export const FARGATE = Object.freeze({ vcpuHourly: 0.04048, gbHourly: 0.004445 });
export const HOURS_PER_MONTH = 730;

export const TASK_SIZES = Object.freeze([
  { id: 'small', vcpu: 0.25, memGiB: 0.5, label: '0.25 vCPU / 512 MiB（ハンズオンと同じ）' },
  { id: 'medium', vcpu: 0.5, memGiB: 1, label: '0.5 vCPU / 1 GiB' },
  { id: 'large', vcpu: 1, memGiB: 2, label: '1 vCPU / 2 GiB' },
]);

export const PATTERN_IDS = Object.freeze(['A', 'B1', 'B2', 'C', 'D']);

/** 保留理由（ECS が run-task の failures で返す理由に合わせる） */
export const REASON = Object.freeze({
  ENI: 'RESOURCE:ENI',
  PORTS: 'RESOURCE:PORTS',
  MEMORY: 'RESOURCE:MEMORY',
  CPU: 'RESOURCE:CPU',
});

function assertPattern(id) {
  if (!PATTERN_IDS.includes(id)) throw new RangeError(`unknown pattern: ${id}`);
}

function assertTask(task) {
  if (!task || !(task.vcpu > 0) || !(task.memGiB > 0)) throw new RangeError('invalid task size');
}

/** CPU とメモリだけで決まる 1 台あたりのタスク数 */
export function cpuMemLimit(task) {
  assertTask(task);
  // 浮動小数の誤差で 1 つ少なくならないよう、小さな値を足してから切り捨てる
  const byCpu = Math.floor(INSTANCE.vcpu / task.vcpu + 1e-9);
  const byMem = Math.floor((INSTANCE.memGiB * INSTANCE.usableMemRatio) / task.memGiB + 1e-9);
  return { count: Math.min(byCpu, byMem), limitedBy: byMem <= byCpu ? 'memory' : 'cpu' };
}

/**
 * 1 台あたりに置けるタスク数と、その上限を決めている要素。
 * limitedBy: 'eni' | 'trunk' | 'port' | 'memory' | 'cpu' | null（Fargate）
 */
export function perInstance(patternId, task) {
  assertPattern(patternId);
  if (patternId === 'A') return { count: null, capacity: null, limitedBy: null };
  const base = cpuMemLimit(task);
  const capacity = base.count;
  switch (patternId) {
    case 'B1': {
      const eni = INSTANCE.maxEni - 1;
      return eni < capacity ? { count: eni, capacity, limitedBy: 'eni' } : { count: capacity, capacity, limitedBy: base.limitedBy };
    }
    case 'B2':
      return INSTANCE.trunkLimit < capacity
        ? { count: INSTANCE.trunkLimit, capacity, limitedBy: 'trunk' }
        : { count: capacity, capacity, limitedBy: base.limitedBy };
    case 'C':
      return { count: capacity, capacity, limitedBy: base.limitedBy };
    case 'D':
      // 全タスクが同じポート（8080）で待ち受けるため 1 台に 1 タスク
      return capacity > 1 ? { count: 1, capacity, limitedBy: 'port' } : { count: capacity, capacity, limitedBy: base.limitedBy };
    default:
      throw new RangeError(patternId);
  }
}

function reasonFor(limitedBy) {
  return { eni: REASON.ENI, trunk: REASON.ENI, port: REASON.PORTS, memory: REASON.MEMORY, cpu: REASON.CPU }[limitedBy] ?? null;
}

/** VPC の IP 消費（cost-calc.py と同じ数え方） */
export function vpcIps(patternId, tasks, instances) {
  switch (patternId) {
    case 'A':
      return tasks;
    case 'B1':
      return tasks + instances; // タスク ENI + プライマリ ENI
    case 'B2':
      return tasks + instances * 2; // ブランチ ENI + プライマリ ENI + トランク ENI
    default:
      return instances; // bridge / host はインスタンス分だけ
  }
}

const round2 = (n) => Math.round(n * 100) / 100;

export function fargateMonthly(tasks, task) {
  return round2(tasks * (task.vcpu * FARGATE.vcpuHourly + task.memGiB * FARGATE.gbHourly) * HOURS_PER_MONTH);
}

export function ec2Monthly(instances) {
  return round2(instances * INSTANCE.hourly * HOURS_PER_MONTH);
}

/**
 * 決まった台数のインスタンスにタスクを配置する（ハンズオン 4.2 の再現）。
 * 戻り値の perInstanceTasks は台ごとの実行中タスク数（均等に分散）。
 */
export function place(patternId, { tasks, instances, task }) {
  assertPattern(patternId);
  assertTask(task);
  const want = Math.max(0, Math.floor(tasks));
  if (patternId === 'A') {
    return {
      running: want,
      pending: 0,
      reason: null,
      perInstanceTasks: [],
      limit: perInstance('A', task),
      ips: vpcIps('A', want, 0),
    };
  }
  const n = Math.max(0, Math.floor(instances));
  const limit = perInstance(patternId, task);
  const running = Math.min(want, limit.count * n);
  const perInstanceTasks = Array.from({ length: n }, (_, i) => Math.floor(running / n) + (i < running % n ? 1 : 0));
  const pending = want - running;
  return {
    running,
    pending,
    reason: pending > 0 ? reasonFor(limit.limitedBy) : null,
    perInstanceTasks,
    limit,
    ips: vpcIps(patternId, running, n),
  };
}

/** 指定タスク数をすべて動かすのに必要な台数と月額（cost-calc.py の estimate と同じ） */
export function estimate(patternId, tasks, task) {
  assertPattern(patternId);
  assertTask(task);
  const want = Math.max(0, Math.floor(tasks));
  if (patternId === 'A') {
    return { patternId, instances: null, perInstance: null, limitedBy: null, monthly: fargateMonthly(want, task), ips: want };
  }
  const limit = perInstance(patternId, task);
  if (limit.count < 1) {
    return { patternId, instances: null, perInstance: 0, limitedBy: limit.limitedBy, monthly: null, ips: null };
  }
  const instances = Math.ceil(want / limit.count);
  return {
    patternId,
    instances,
    perInstance: limit.count,
    limitedBy: limit.limitedBy,
    monthly: ec2Monthly(instances),
    ips: vpcIps(patternId, want, instances),
  };
}

export function estimateAll(tasks, task) {
  return PATTERN_IDS.map((id) => estimate(id, tasks, task));
}
