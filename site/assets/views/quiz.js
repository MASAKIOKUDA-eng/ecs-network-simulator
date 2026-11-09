import { h, clear, store } from '../dom.js';
import { QUIZ } from '../data.js';

const BEST_KEY = 'ecs-netsim:quiz-best';

export function initQuiz() {
  const root = document.getElementById('quiz-root');
  document.getElementById('quiz-total').textContent = String(QUIZ.length);

  let index = 0;
  let answers = [];

  function showQuestion({ focus = false } = {}) {
    const q = QUIZ[index];
    clear(root);
    const errorId = `quiz-error-${q.id}`;
    const error = h('p', { id: errorId, class: 'form-error', hidden: true }, '選択肢を 1 つ選んでください。');
    const choices = q.choices.map((label, i) =>
      h('label', { class: 'radio-card' },
        h('input', { type: 'radio', name: 'choice', value: String(i), 'aria-describedby': errorId }),
        h('span', { class: 'choice-text' }, label),
      ),
    );
    const submit = h('button', { type: 'submit', class: 'button' }, '回答する');
    const heading = h('h2', { tabindex: '-1', class: 'quiz-heading' }, `問題 ${index + 1}`);

    const form = h('form', { novalidate: true },
      h('fieldset', null,
        h('legend', null,
          h('span', { class: 'quiz-scene' }, q.scene),
          h('span', { class: 'quiz-question', id: `quiz-q-${q.id}` }, q.question),
        ),
        h('div', { class: 'choice-list' }, choices),
      ),
      error,
      h('div', { class: 'button-row' }, submit),
    );

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const picked = form.querySelector('input[name="choice"]:checked');
      if (!picked) {
        error.hidden = false;
        form.querySelector('input[name="choice"]')?.focus();
        return;
      }
      showFeedback(form, choices, Number(picked.value), submit);
    });

    root.append(
      h('div', { class: 'quiz-progress' },
        h('label', { for: 'quiz-progress' }, `${QUIZ.length} 問中 ${index + 1} 問目`),
        h('progress', { id: 'quiz-progress', max: QUIZ.length, value: index }),
      ),
      heading,
      form,
    );
    if (focus) heading.focus();
  }

  function showFeedback(form, choices, picked, submit) {
    const q = QUIZ[index];
    const correct = picked === q.answer;
    answers[index] = picked;

    form.querySelectorAll('input[name="choice"]').forEach((input) => {
      input.disabled = true;
    });
    choices.forEach((label, i) => {
      if (i === q.answer) {
        label.classList.add('is-correct');
        label.append(h('span', { class: 'mark' }, '✓ 正解'));
      } else if (i === picked) {
        label.classList.add('is-wrong');
        label.append(h('span', { class: 'mark' }, '✗ あなたの回答'));
      }
    });
    submit.remove();

    const last = index === QUIZ.length - 1;
    const nextBtn = h('button', { type: 'button', class: 'button' }, last ? '結果を見る' : '次の問題へ');
    nextBtn.addEventListener('click', () => {
      if (last) showResult();
      else {
        index += 1;
        showQuestion({ focus: true });
      }
    });

    const title = h('h2', { tabindex: '-1' }, correct ? '✓ 正解！' : '✗ 不正解');
    const fb = h('div', { class: `feedback ${correct ? 'is-correct' : 'is-wrong'}` },
      title,
      correct ? null : h('p', null, `正解は「${q.choices[q.answer]}」です。`),
      h('p', null, q.explanation),
      h('div', { class: 'button-row' }, nextBtn),
    );
    form.append(fb);
    // 結果の見出しにフォーカスを移し、続けて解説を読めるようにする
    title.focus();
  }

  function showResult() {
    const score = answers.reduce((acc, a, i) => acc + (a === QUIZ[i].answer ? 1 : 0), 0);
    const best = Math.max(score, Number(store.get(BEST_KEY, 0)) || 0);
    store.set(BEST_KEY, best);

    let rank = 'もう一度、配置シミュレーターと通信経路で確かめてみましょう。';
    if (score === QUIZ.length) rank = '全問正解！ネットワークモード選びに、もう悩みません。';
    else if (score >= QUIZ.length * 0.75) rank = 'よくできました。間違えた問題の解説を見直しましょう。';
    else if (score >= QUIZ.length * 0.5) rank = 'あと少し。モードごとの違いを表で見直してみましょう。';

    clear(root);
    const heading = h('h2', { tabindex: '-1' }, '結果');
    const retry = h('button', { type: 'button', class: 'button' }, 'もう一度挑戦する');
    retry.addEventListener('click', () => {
      index = 0;
      answers = [];
      showQuestion({ focus: true });
    });

    root.append(
      heading,
      h('p', { class: 'score' }, `${QUIZ.length} 問中 ${score} 問正解`),
      h('p', null, rank),
      h('p', { class: 'hint' }, `これまでの最高：${best} 問（このブラウザにだけ保存）`),
      h('h3', null, '答え合わせ'),
      h('ol', null,
        QUIZ.map((q, i) => {
          const ok = answers[i] === q.answer;
          return h('li', null,
            h('span', { class: ok ? 'text-good' : 'text-bad' }, ok ? '✓ 正解 ' : '✗ 不正解 '),
            q.question,
            h('br'),
            h('span', { class: 'hint' }, `答え：${q.choices[q.answer]}`),
          );
        }),
      ),
      h('div', { class: 'button-row' }, retry, h('a', { class: 'button button-secondary', href: '#chooser' }, 'モード診断へ')),
    );
    heading.focus();
  }

  showQuestion();
}
