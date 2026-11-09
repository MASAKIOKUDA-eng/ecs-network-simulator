// DOM を安全に組み立てる小さなヘルパー。
// innerHTML は使わない（CSP の require-trusted-types-for 'script' で禁止している）。
// 文字列の子要素は必ずテキストノードになるので、HTML として解釈されない。

const SVG_NS = 'http://www.w3.org/2000/svg';

function apply(el, attrs) {
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'on') {
      for (const [type, handler] of Object.entries(value)) el.addEventListener(type, handler);
      continue;
    }
    if (/^on/i.test(key) || key === 'style' || key === 'innerHTML') {
      // イベントは on: {...} で渡す。インライン属性とスタイルは CSP に反するので受け付けない
      throw new Error(`attribute not allowed: ${key}`);
    }
    if (key === 'text') {
      el.textContent = String(value);
      continue;
    }
    el.setAttribute(key, value === true ? '' : String(value));
  }
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  apply(el, attrs);
  append(el, children);
  return el;
}

export function s(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  apply(el, attrs);
  append(el, children);
  return el;
}

export function clear(el) {
  el.replaceChildren();
  return el;
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** スクリーンリーダー向けのお知らせ（同じ文でも読み上げ直されるよう、一度空にしてから入れる） */
export function announce(region, message) {
  region.textContent = '';
  window.setTimeout(() => {
    region.textContent = message;
  }, 50);
}

/** localStorage は使えないことがある（プライベートモードなど）ので必ず try/catch */
export const store = {
  get(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* 保存できなくてもゲームは続けられる */
    }
  },
};

export const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export const num = new Intl.NumberFormat('ja-JP');
