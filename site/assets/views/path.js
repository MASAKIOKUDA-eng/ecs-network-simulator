import { h, clear, announce } from '../dom.js';
import { PATTERNS, PATHS, PROBES, PROBE_INTERFACES, OBSERVABILITY } from '../data.js';
import { PATTERN_IDS } from '../sim.js';

export function initPath({ live }) {
  const radios = document.getElementById('path-patterns');
  const list = document.getElementById('path-steps');
  const prev = document.getElementById('path-prev');
  const next = document.getElementById('path-next');
  const reset = document.getElementById('path-reset');
  const status = document.getElementById('path-status');

  let pattern = 'A';
  let step = 0;

  for (const id of PATTERN_IDS) {
    radios.append(
      h('label', { class: 'radio-card' },
        h('input', {
          type: 'radio',
          name: 'path-pattern',
          value: id,
          checked: id === pattern,
          on: {
            change: () => {
              pattern = id;
              step = 0;
              render();
              announce(live, `${PATTERNS[id].name} の経路に切り替えました。${statusText()}`);
            },
          },
        }),
        h('span', null, h('span', { class: 'radio-title' }, h('span', { class: 'badge', 'data-p': id }, id), PATTERNS[id].short)),
      ),
    );
  }

  function statusText() {
    const hops = PATHS[pattern];
    const hop = hops[step];
    return `${hops.length} か所中 ${step + 1} か所目：${hop.node}。${hop.detail}`;
  }

  function render() {
    const hops = PATHS[pattern];
    clear(list);
    hops.forEach((hop, i) => {
      const current = i === step;
      list.append(
        h('li', { class: i < step ? 'is-visited' : null, 'aria-current': current ? 'step' : null },
          h('span', { class: 'hop-node' }, current ? h('span', { class: 'hop-here' }, '現在地：') : null, hop.node),
          h('span', { class: 'hop-detail' }, i <= step ? hop.detail : ''),
          i > step ? h('span', { class: 'visually-hidden' }, '（まだ通っていません）') : null,
        ),
      );
    });
    prev.disabled = step === 0;
    next.disabled = step === hops.length - 1;
    status.textContent = step === hops.length - 1
      ? `コンテナに届きました。${PATTERNS[pattern].name} はターゲットタイプ ${PATTERNS[pattern].target}、ALB リスナー :${PATTERNS[pattern].listener} です。`
      : '';
    renderTables();
  }

  function move(delta) {
    const hops = PATHS[pattern];
    step = Math.min(hops.length - 1, Math.max(0, step + delta));
    render();
    announce(live, statusText());
    // 端まで来て押せなくなったボタンにフォーカスが残らないよう移す
    if (document.activeElement instanceof HTMLButtonElement && document.activeElement.disabled) {
      (delta > 0 ? prev : next).focus();
    }
  }

  prev.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  reset.addEventListener('click', () => {
    step = 0;
    render();
    announce(live, `最初に戻りました。${statusText()}`);
  });

  function headRow() {
    return h('tr', null,
      h('th', { scope: 'col' }, '項目'),
      ...PATTERN_IDS.map((id) => h('th', { scope: 'col', class: id === pattern ? 'is-current-col' : null },
        h('span', { class: 'badge', 'data-p': id }, id),
        id === pattern ? h('span', { class: 'visually-hidden' }, '（選択中）') : null,
      )),
    );
  }

  function renderTables() {
    const probeHead = clear(document.getElementById('probe-head'));
    const probeBody = clear(document.getElementById('probe-body'));
    probeHead.append(headRow());
    for (const row of PROBES) {
      probeBody.append(
        h('tr', null,
          h('th', { scope: 'row' }, row.item, h('span', { class: 'hint' }, h('br'), row.note)),
          ...PATTERN_IDS.map((id) => h('td', { class: id === pattern ? 'is-current-col' : null },
            row[id] ? h('span', { class: 'text-bad' }, '⚠ 届く') : h('span', { class: 'text-good' }, '✓ 届かない'),
          )),
        ),
      );
    }
    probeBody.append(
      h('tr', null,
        h('th', { scope: 'row' }, '見えるネットワークインターフェース'),
        ...PATTERN_IDS.map((id) => h('td', { class: id === pattern ? 'is-current-col' : null }, PROBE_INTERFACES[id])),
      ),
    );

    const obsHead = clear(document.getElementById('obs-head'));
    const obsBody = clear(document.getElementById('obs-body'));
    obsHead.append(headRow());
    for (const row of OBSERVABILITY) {
      obsBody.append(
        h('tr', null,
          h('th', { scope: 'row' }, row.item),
          ...PATTERN_IDS.map((id) => h('td', { class: id === pattern ? 'is-current-col' : null }, row[id])),
        ),
      );
    }
  }

  render();

  return {
    selectPattern(id) {
      if (id === pattern) return;
      const input = radios.querySelector(`input[value="${CSS.escape(id)}"]`);
      if (input) {
        input.checked = true;
        pattern = id;
        step = 0;
        render();
      }
    },
  };
}
