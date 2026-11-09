import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_DIR } from '../lib/site-stack.js';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}
const all = files(SITE_DIR);
const read = (p: string) => readFileSync(p, 'utf8');

test('JS で innerHTML / outerHTML / insertAdjacentHTML / eval を使わない（XSS 対策）', () => {
  for (const f of all.filter((p) => p.endsWith('.js'))) {
    const src = read(f);
    assert.doesNotMatch(src, /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write|\beval\(|new Function\(/, f);
  }
});

test('HTML にインラインのスクリプト・スタイル・イベント属性がない（CSP で動く）', () => {
  for (const f of all.filter((p) => p.endsWith('.html'))) {
    const src = read(f);
    assert.doesNotMatch(src, /<script(?![^>]*\bsrc=)[^>]*>/i, `${f}: inline script`);
    assert.doesNotMatch(src, /<style[\s>]/i, `${f}: inline style`);
    assert.doesNotMatch(src, /\sstyle=/i, `${f}: style attribute`);
    assert.doesNotMatch(src, /\son[a-z]+=/i, `${f}: event handler attribute`);
  }
});

test('外部のスクリプトやスタイルを読み込まない', () => {
  for (const f of all.filter((p) => /\.(html|css|js)$/.test(p))) {
    const src = read(f);
    assert.doesNotMatch(src, /<(script|link)[^>]+(src|href)="https?:/i, f);
    assert.doesNotMatch(src, /@import|url\(\s*['"]?https?:/i, f);
    assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|WebSocket/, f);
  }
});

test('ページは lang を持ち、外部リンクは noopener noreferrer', () => {
  for (const f of all.filter((p) => p.endsWith('.html'))) {
    const src = read(f);
    assert.match(src, /<html lang="ja">/, f);
    for (const a of src.match(/<a [^>]*href="https?:[^>]*>/g) ?? []) {
      assert.match(a, /rel="noopener noreferrer"/, `${f}: ${a}`);
    }
  }
});
