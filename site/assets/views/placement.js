import { h, s, clear, announce, prefersReducedMotion, usd, num } from '../dom.js';
import { PATTERNS, LIMIT_LABEL } from '../data.js';
import { PATTERN_IDS, TASK_SIZES, INSTANCE, place, estimateAll } from '../sim.js';

const SLOT = 26;
const GAP = 6;
const COLS = 4;
const INST_W = COLS * SLOT + (COLS - 1) * GAP + 24; // 146
const INST_GAP = 14;
const MAX_W = 640;

/** 図は表示幅と同じ座標で描き、文字が本文と同じ大きさで見えるようにする */
function widthOf(el) {
  return Math.max(300, Math.min(MAX_W, Math.floor(el.clientWidth || MAX_W)));
}
const MAX_FARGATE_DRAWN = 40;

export function initPlacement({ live, onPatternChange }) {
  const form = document.getElementById('sim-form');
  const patternBox = document.getElementById('sim-patterns');
  const sizeSel = document.getElementById('sim-size');
  const tasksIn = document.getElementById('sim-tasks');
  const tasksOut = document.getElementById('sim-tasks-out');
  const instIn = document.getElementById('sim-instances');
  const instOut = document.getElementById('sim-instances-out');
  const figure = document.getElementById('sim-figure');
  const summary = document.getElementById('sim-summary');
  const explain = document.getElementById('sim-explain');

  for (const id of PATTERN_IDS) {
    const p = PATTERNS[id];
    patternBox.append(
      h('label', { class: 'radio-card' },
        h('input', { type: 'radio', name: 'pattern', value: id, checked: id === 'B1' }),
        h('span', null,
          h('span', { class: 'radio-title' }, h('span', { class: 'badge', 'data-p': id }, id), p.name),
          h('span', { class: 'radio-desc' }, p.summary),
        ),
      ),
    );
  }
  for (const size of TASK_SIZES) sizeSel.append(h('option', { value: size.id }, size.label));

  // 図の説明はスクリーンリーダーに読み上げるため、変更が落ち着いてからまとめて通知する
  let announceTimer = 0;

  function state() {
    const data = new FormData(form);
    return {
      pattern: String(data.get('pattern') ?? 'B1'),
      task: TASK_SIZES.find((t) => t.id === sizeSel.value) ?? TASK_SIZES[0],
      tasks: Number(tasksIn.value),
      instances: Number(instIn.value),
    };
  }

  function render({ quiet = false } = {}) {
    const st = state();
    const isFargate = st.pattern === 'A';
    tasksOut.value = `${st.tasks} 個`;
    instOut.value = isFargate ? '―' : `${st.instances} 台`;
    instIn.disabled = isFargate;

    document.getElementById('sim-legend').dataset.p = st.pattern;
    const result = place(st.pattern, st);
    drawFigure(figure, st, result);
    const text = renderSummary(summary, explain, st, result);
    renderCompare(st);
    onPatternChange?.(st.pattern);

    if (!quiet) {
      window.clearTimeout(announceTimer);
      announceTimer = window.setTimeout(() => announce(live, text), 600);
    }
  }

  form.addEventListener('input', () => render());
  form.addEventListener('change', () => render());
  form.addEventListener('submit', (e) => e.preventDefault());

  initRace();
  render({ quiet: true });

  // 画面幅が変わったら図を描き直す（文字の大きさを保つため）
  let lastWidth = figure.clientWidth;
  new ResizeObserver(() => {
    if (figure.clientWidth !== lastWidth && !figure.closest('[hidden]')) {
      lastWidth = figure.clientWidth;
      render({ quiet: true });
    }
  }).observe(figure);

  return {
    selectPattern(id) {
      const input = form.querySelector(`input[name="pattern"][value="${CSS.escape(id)}"]`);
      if (input) {
        input.checked = true;
        render({ quiet: true });
      }
    },
  };
}

function figureText(st, result) {
  const p = PATTERNS[st.pattern];
  if (st.pattern === 'A') {
    return `${p.name}：${st.tasks} 個のタスクがすべて実行中。インスタンスはなく、タスクごとに ENI と VPC の IP を 1 つずつ使います。`;
  }
  const limit = result.limit;
  let t = `${p.name}：c6i.large ${st.instances} 台に ${st.tasks} 個を要求し、実行中 ${result.running} 個`;
  t += result.pending > 0 ? `、保留 ${result.pending} 個（${result.reason}）。` : '。';
  t += `1 台あたりの上限は ${limit.count} 個で、理由は${LIMIT_LABEL[limit.limitedBy]}。`;
  if (limit.capacity > limit.count) {
    t += `CPU とメモリだけなら 1 台 ${limit.capacity} 個置けるので、1 台あたり ${limit.capacity - limit.count} 枠が使えません。`;
  }
  return t;
}

function drawFigure(container, st, result) {
  clear(container);
  const titleId = 'sim-fig-title';
  const descId = 'sim-fig-desc';
  const desc = figureText(st, result);

  const defs = s('defs', null,
    s('pattern', { id: 'hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
      s('line', { x1: 0, y1: 0, x2: 0, y2: 6, class: 'svg-hatch-line' }),
    ),
  );

  const parts = [];
  const VIEW_W = widthOf(container);
  let height;

  if (st.pattern === 'A') {
    const drawn = Math.min(st.tasks, MAX_FARGATE_DRAWN);
    const cell = 52;
    const perRow = Math.max(1, Math.floor(VIEW_W / cell));
    parts.push(s('text', { x: 0, y: 16, 'font-size': 14, 'font-weight': 700 }, 'Fargate（タスクごとに独立した実行環境と ENI）'));
    for (let i = 0; i < drawn; i++) {
      const x = (i % perRow) * cell + 4;
      const y = Math.floor(i / perRow) * cell + 30;
      parts.push(
        s('rect', { x, y, width: cell - 10, height: cell - 10, rx: 6, class: 'svg-instance' }),
        s('rect', { x: x + 8, y: y + 8, width: cell - 26, height: cell - 26, rx: 4, class: 'svg-task', 'data-p': 'A' }),
        s('text', { x: x + (cell - 10) / 2, y: y + cell - 13, 'font-size': 9, 'text-anchor': 'middle', class: 't-muted' }, 'ENI'),
      );
    }
    height = Math.ceil(drawn / perRow) * cell + 34;
  } else {
    const perRow = Math.max(1, Math.floor((VIEW_W + INST_GAP) / (INST_W + INST_GAP)));
    const capacity = result.limit.capacity;
    const rows = Math.max(1, Math.ceil(capacity / COLS));
    const instH = 52 + rows * SLOT + (rows - 1) * GAP + 10;
    result.perInstanceTasks.forEach((count, i) => {
      const x = (i % perRow) * (INST_W + INST_GAP) + 2;
      const y = Math.floor(i / perRow) * (instH + INST_GAP) + 2;
      parts.push(...drawInstance(st.pattern, i, x, y, instH, count, result.limit));
    });
    const instRows = Math.ceil(result.perInstanceTasks.length / perRow);
    let yEnd = instRows * (instH + INST_GAP) + 4;

    if (result.pending > 0) {
      const tray = [];
      const perTrayRow = Math.max(1, Math.floor((VIEW_W - 28) / 26));
      const shown = Math.min(result.pending, perTrayRow * 2);
      const trayH = 30 + Math.ceil(shown / perTrayRow) * 26 + 8;
      tray.push(
        s('rect', { x: 2, y: yEnd, width: VIEW_W - 4, height: trayH, rx: 8, class: 'svg-pending' }),
        s('text', { x: 14, y: yEnd + 20, 'font-size': 13, class: 't-bad' }, `保留 ${result.pending} 個：${result.reason}`),
      );
      for (let i = 0; i < shown; i++) {
        tray.push(s('rect', {
          x: 14 + (i % perTrayRow) * 26, y: yEnd + 30 + Math.floor(i / perTrayRow) * 26, width: 20, height: 20, rx: 3, class: 'svg-pending-task',
        }));
      }
      parts.push(...tray);
      yEnd += trayH + 4;
    }
    height = yEnd;
  }

  const svg = s('svg', {
    viewBox: `0 0 ${VIEW_W} ${Math.max(height, 60)}`,
    width: VIEW_W,
    height: Math.max(height, 60),
    role: 'img',
    'aria-labelledby': `${titleId} ${descId}`,
    focusable: 'false',
  },
  s('title', { id: titleId }, '配置の図'),
  s('desc', { id: descId }, desc),
  defs,
  ...parts,
  );
  container.append(svg);
}

function drawInstance(patternId, index, x, y, instH, count, limit) {
  const out = [
    s('rect', { x, y, width: INST_W, height: instH, rx: 8, class: 'svg-instance' }),
    s('text', { x: x + 12, y: y + 20, 'font-size': 13, 'font-weight': 700 }, `EC2 #${index + 1}`),
  ];
  // パターンごとのネットワークの部品を小さなチップで示す
  const chip = {
    B1: `ENI ${INSTANCE.maxEni - 1}/${INSTANCE.maxEni - 1}`,
    B2: 'トランク ENI ×1',
    C: 'docker0 ＋ 動的ポート',
    D: 'port 8080 占有',
  }[patternId];
  out.push(
    s('rect', { x: x + 10, y: y + 27, width: INST_W - 20, height: 18, rx: 4, class: 'svg-chip' }),
    s('text', { x: x + INST_W / 2, y: y + 40, 'font-size': 10.5, 'text-anchor': 'middle' }, chip),
  );
  for (let slot = 0; slot < limit.capacity; slot++) {
    const sx = x + 12 + (slot % COLS) * (SLOT + GAP);
    const sy = y + 52 + Math.floor(slot / COLS) * (SLOT + GAP);
    let cls = 'svg-free';
    if (slot < count) cls = 'svg-task';
    else if (slot >= limit.count) cls = 'svg-blocked';
    out.push(s('rect', { x: sx, y: sy, width: SLOT, height: SLOT, rx: 4, class: cls, 'data-p': cls === 'svg-task' ? patternId : null }));
  }
  return out;
}

function stat(label, value, bad = false) {
  return h('div', { class: bad ? 'is-bad' : null }, h('dt', null, label), h('dd', null, value));
}

function renderSummary(summary, explain, st, result) {
  const p = PATTERNS[st.pattern];
  clear(summary);
  summary.append(
    stat('実行中', `${result.running} 個`),
    stat('保留', result.pending > 0 ? `${result.pending} 個（${result.reason}）` : '0 個', result.pending > 0),
    stat('1 台あたりの上限', st.pattern === 'A' ? '―（Fargate）' : `${result.limit.count} 個（${LIMIT_LABEL[result.limit.limitedBy]}）`),
    stat('VPC の IP 消費', `${num.format(result.ips)} 個`),
    stat('起動時間（実測の中央値）', `${p.startup.median.toFixed(1)} 秒`),
  );

  let msg = '';
  if (st.pattern === 'B1' && result.pending > 0) {
    msg = 'ENI が足りずに保留になりました（障害 F-3 と同じ状況）。B2（トランキングあり）に切り替えると、同じ台数でも多く置けます。';
  } else if (st.pattern === 'D' && result.pending > 0) {
    msg = 'host モードは同じポートを 2 つのタスクで使えないため、1 台 1 タスクです。デプロイ時も予備の台数が必要になります（障害 F-2）。';
  } else if (st.pattern === 'A') {
    msg = 'Fargate は台数を気にしなくてよい代わりに、起動時に毎回イメージを取得するため起動が最も遅くなりました（中央値 17 秒）。';
  } else if (st.pattern === 'C') {
    msg = 'bridge は IP をタスクごとに使わず、上限はメモリで決まります。ただし Flow Logs や SG はインスタンス単位になります。';
  } else if (st.pattern === 'B2') {
    msg = 'トランキングで ENI の上限が 10 になり、先にメモリ（7 個）が上限になります。IP はタスクごとに 1 つ、加えてトランク ENI の分を使います。';
  } else if (result.pending > 0) {
    msg = 'CPU かメモリが足りずに保留になりました。台数を増やすか、タスクを小さくします。';
  }
  explain.textContent = msg;

  return `${figureText(st, result)} ${msg}`;
}

function renderCompare(st) {
  const body = document.getElementById('compare-body');
  const chart = document.getElementById('compare-chart');
  const descEl = document.getElementById('compare-desc');
  const rows = estimateAll(st.tasks, st.task);
  descEl.textContent = `${st.task.label}のタスクを ${st.tasks} 個、すべて動かすのに必要な台数と月額の試算です。`;

  clear(body);
  for (const r of rows) {
    const p = PATTERNS[r.patternId];
    const current = r.patternId === st.pattern;
    body.append(
      h('tr', { class: current ? 'is-current' : null },
        h('th', { scope: 'row' }, h('span', { class: 'badge', 'data-p': r.patternId }, r.patternId), p.short, current ? h('span', { class: 'visually-hidden' }, '（選択中）') : null),
        h('td', { class: 'num' }, r.perInstance === null ? '―' : `${r.perInstance} 個`),
        h('td', null, r.limitedBy ? LIMIT_LABEL[r.limitedBy] : 'タスクごとに課金'),
        h('td', { class: 'num' }, r.instances === null ? '―' : `${r.instances} 台`),
        h('td', { class: 'num' }, r.monthly === null ? '置けない' : usd.format(r.monthly)),
        h('td', { class: 'num' }, r.ips === null ? '―' : `${num.format(r.ips)} 個`),
      ),
    );
  }

  // 月額の横棒グラフ（表と同じ内容なので支援技術からは隠す）
  clear(chart);
  const max = Math.max(...rows.map((r) => r.monthly ?? 0), 1);
  const VIEW_W = widthOf(chart);
  const labelW = VIEW_W < 480 ? 110 : 170;
  const valueW = 80;
  const barH = 22;
  const gap = 10;
  const plotW = VIEW_W - labelW - valueW;
  const parts = [];
  rows.forEach((r, i) => {
    const y = i * (barH + gap);
    const w = r.monthly === null ? 0 : Math.max(4, (r.monthly / max) * plotW);
    const current = r.patternId === st.pattern;
    parts.push(
      s('text', { x: 0, y: y + 16, 'font-size': 13, 'font-weight': current ? 700 : 400 }, VIEW_W < 480 ? r.patternId : `${r.patternId} ${PATTERNS[r.patternId].short}`),
      s('rect', { x: labelW, y, width: w, height: barH, rx: 4, class: 'svg-task', 'data-p': r.patternId }),
      s('text', { x: labelW + w + 6, y: y + 16, 'font-size': 13, 'font-weight': current ? 700 : 400 }, r.monthly === null ? '置けない' : usd.format(r.monthly)),
    );
  });
  chart.append(s('svg', { viewBox: `0 0 ${VIEW_W} ${rows.length * (barH + gap)}`, width: VIEW_W, height: rows.length * (barH + gap), 'aria-hidden': 'true', focusable: 'false' }, ...parts));
}

function initRace() {
  const btn = document.getElementById('race-start');
  const lanes = document.getElementById('race-lanes');
  const result = document.getElementById('race-result');
  const live = document.getElementById('live');
  const max = Math.max(...PATTERN_IDS.map((id) => PATTERNS[id].startup.median));
  const SPEED = 4;
  const bars = new Map();

  for (const id of PATTERN_IDS) {
    const p = PATTERNS[id];
    const rect = s('rect', { x: 0, y: 0, width: 0, height: 20, rx: 3 });
    const time = h('span', { class: 'time' }, '―');
    bars.set(id, { rect, time, total: p.startup.median });
    lanes.append(
      h('li', { 'data-p': id },
        h('span', { class: 'race-name' }, h('span', { class: 'badge', 'data-p': id }, id), p.short),
        h('span', { class: 'lane' }, s('svg', { class: 'bar', viewBox: '0 0 100 20', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' }, rect)),
        time,
      ),
    );
  }

  let frame = 0;
  function finish() {
    for (const [, b] of bars) {
      b.rect.setAttribute('width', String((b.total / max) * 100));
      b.time.textContent = `${b.total.toFixed(1)} 秒`;
    }
    const order = [...PATTERN_IDS].sort((a, b) => PATTERNS[a].startup.median - PATTERNS[b].startup.median);
    const text = `結果：${order.map((id, i) => `${i + 1} 位 ${id}（${PATTERNS[id].startup.median.toFixed(1)} 秒）`).join('、')}。` +
      'awsvpc は ENI の準備に約 9 秒かかり、Fargate はさらにイメージの取得が加わります。';
    result.textContent = text;
    announce(live, text);
    btn.disabled = false;
    btn.textContent = 'もう一度';
  }

  btn.addEventListener('click', () => {
    window.cancelAnimationFrame(frame);
    result.textContent = '';
    if (prefersReducedMotion()) {
      finish();
      return;
    }
    btn.disabled = true;
    announce(live, 'レースを開始しました。');
    const start = performance.now();
    const step = (now) => {
      const elapsed = ((now - start) / 1000) * SPEED;
      for (const [, b] of bars) {
        const t = Math.min(elapsed, b.total);
        b.rect.setAttribute('width', String((t / max) * 100));
        b.time.textContent = `${t.toFixed(1)} 秒`;
      }
      if (elapsed < max) frame = window.requestAnimationFrame(step);
      else finish();
    };
    frame = window.requestAnimationFrame(step);
  });
}

