import { h, clear } from '../dom.js';
import { CHOOSER, PATTERNS } from '../data.js';

export function initChooser({ onTry }) {
  const root = document.getElementById('chooser-root');
  let trail = []; // { nodeId, answer: 'yes' | 'no' }

  function current() {
    let id = CHOOSER.start;
    for (const step of trail) id = CHOOSER.nodes[step.nodeId][step.answer];
    return id;
  }

  function trailList() {
    if (trail.length === 0) return null;
    return h('div', null,
      h('h3', null, 'これまでの回答'),
      h('ol', { class: 'trail' },
        trail.map((t) => h('li', null, `${CHOOSER.nodes[t.nodeId].question} → ${t.answer === 'yes' ? 'はい' : 'いいえ'}`)),
      ),
    );
  }

  function render({ focus = false } = {}) {
    clear(root);
    const id = current();
    const back = h('button', { type: 'button', class: 'button button-secondary', disabled: trail.length === 0 }, '1 つ戻る');
    back.addEventListener('click', () => {
      trail = trail.slice(0, -1);
      render({ focus: true });
    });
    const restart = h('button', { type: 'button', class: 'button button-secondary', disabled: trail.length === 0 }, '最初から');
    restart.addEventListener('click', () => {
      trail = [];
      render({ focus: true });
    });

    let heading;
    if (CHOOSER.results[id]) {
      const r = CHOOSER.results[id];
      const p = PATTERNS[r.pattern];
      heading = h('h2', { tabindex: '-1' }, `おすすめ：${r.title}`);
      const tryBtn = h('button', { type: 'button', class: 'button' }, `${r.pattern}（${p.short}）を配置シミュレーターで試す`);
      tryBtn.addEventListener('click', () => onTry(r.pattern));
      root.append(
        h('div', { class: 'result-card' },
          heading,
          h('p', null, h('span', { class: 'badge', 'data-p': r.pattern }, r.pattern), p.name),
          h('p', null, r.body),
        ),
        trailList(),
        h('div', { class: 'button-row' }, tryBtn, back, restart),
      );
    } else {
      const node = CHOOSER.nodes[id];
      heading = h('h2', { tabindex: '-1' }, `質問 ${trail.length + 1}`);
      const answer = (value) => {
        trail = [...trail, { nodeId: id, answer: value }];
        render({ focus: true });
      };
      const yes = h('button', { type: 'button', class: 'button' }, 'はい');
      const no = h('button', { type: 'button', class: 'button' }, 'いいえ');
      yes.addEventListener('click', () => answer('yes'));
      no.addEventListener('click', () => answer('no'));
      root.append(
        heading,
        h('p', { class: 'quiz-question' }, node.question),
        h('div', { class: 'button-row', role: 'group', 'aria-label': '回答' }, yes, no),
        trailList(),
        h('div', { class: 'button-row' }, back, restart),
      );
    }
    if (focus) heading.focus();
  }

  render();
}
