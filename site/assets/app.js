import { h } from './dom.js';
import { PATTERNS } from './data.js';
import { PATTERN_IDS } from './sim.js';
import { initPlacement } from './views/placement.js';
import { initPath } from './views/path.js';
import { initQuiz } from './views/quiz.js';
import { initChooser } from './views/chooser.js';

const VIEWS = ['intro', 'placement', 'path', 'quiz', 'chooser'];
const BASE_TITLE = 'ECS ネットワークシミュレーター';

function renderPatternTable() {
  const body = document.getElementById('pattern-table-body');
  for (const id of PATTERN_IDS) {
    const p = PATTERNS[id];
    body.append(
      h('tr', null,
        h('th', { scope: 'row' }, h('span', { class: 'badge', 'data-p': id }, id)),
        h('td', null, p.capacity),
        h('td', null, p.mode, id === 'B1' ? '（トランキングなし）' : id === 'B2' ? '（トランキングあり）' : id === 'C' ? '（動的ポート）' : ''),
        h('td', null, p.target),
        h('td', null, p.summary),
      ),
    );
  }
}

function show(view, { focus }) {
  const name = VIEWS.includes(view) ? view : 'intro';
  for (const section of document.querySelectorAll('[data-view]')) {
    section.hidden = section.dataset.view !== name;
  }
  for (const link of document.querySelectorAll('[data-view-link]')) {
    if (link.dataset.viewLink === name) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  const heading = document.getElementById(`h-${name}`);
  document.title = name === 'intro' ? BASE_TITLE : `${heading.textContent} | ${BASE_TITLE}`;
  if (focus) {
    // 画面が切り替わったことを支援技術に伝えるため、見出しにフォーカスを移す
    heading.focus();
    window.scrollTo(0, 0);
  }
}

function currentView() {
  return decodeURIComponent(window.location.hash.replace(/^#/, ''));
}

function main() {
  const live = document.getElementById('live');
  renderPatternTable();

  const path = initPath({ live });
  const placement = initPlacement({ live, onPatternChange: (id) => path.selectPattern(id) });
  initQuiz();
  initChooser({
    onTry: (id) => {
      placement.selectPattern(id);
      window.location.hash = '#placement';
    },
  });

  // 「本文へスキップ」はビューの切り替えではないので無視する
  window.addEventListener('hashchange', () => {
    const view = currentView();
    if (VIEWS.includes(view)) show(view, { focus: true });
  });

  const initial = currentView();
  show(VIEWS.includes(initial) ? initial : 'intro', { focus: false });
}

main();
