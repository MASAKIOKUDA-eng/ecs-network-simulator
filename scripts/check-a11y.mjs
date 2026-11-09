// ブラウザで全画面を開き、axe-core（WCAG 2.2 AA）と CSP 違反・コンソールエラーを検査する。
// 前提：Playwright（npm i -D playwright && npx playwright install chromium）。
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const axeSource = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');

const PORT = 8765;
const server = spawn(process.execPath, ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

const VIEWS = ['intro', 'placement', 'path', 'quiz', 'chooser'];
let failed = false;
const browser = await chromium.launch();
try {
  for (const scheme of ['light', 'dark']) {
    const page = await browser.newPage({ colorScheme: scheme, viewport: { width: 1280, height: 900 } });
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    for (const view of VIEWS) {
      await page.goto(`http://127.0.0.1:${PORT}/#${view}`);
      await page.waitForTimeout(200);
      // CSP の都合で addScriptTag は使えないので、検査用に CDP 経由で評価する
      await page.evaluate(axeSource);
      const result = await page.evaluate(async () =>
        // eslint-disable-next-line no-undef
        axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }));
      for (const v of result.violations) {
        failed = true;
        console.log(`[${scheme}] #${view} ${v.id} (${v.impact}): ${v.help}`);
        for (const n of v.nodes.slice(0, 3)) console.log(`    ${n.target.join(' ')} — ${n.failureSummary?.split('\n')[1] ?? ''}`);
      }
    }
    if (problems.length) {
      failed = true;
      console.log(`[${scheme}]`, problems.join('\n'));
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(failed ? 'NG: 上の問題を直してください' : 'OK: axe-core の違反・CSP 違反・JS エラーなし');
process.exit(failed ? 1 : 0);
