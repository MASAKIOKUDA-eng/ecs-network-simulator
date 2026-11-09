// ローカル確認用の静的サーバー。CloudFront と同じセキュリティヘッダーを付ける。
// 127.0.0.1 だけで待ち受け、site/ の外のファイルは返さない。
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../site', import.meta.url)));
const headers = JSON.parse(await readFile(new URL('../config/security-headers.json', import.meta.url), 'utf8'));
const port = Number(process.env.PORT ?? 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
};

const security = {
  'Content-Security-Policy': headers.contentSecurityPolicy,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': headers.referrerPolicy,
  'Permissions-Policy': headers.permissionsPolicy,
  'Cross-Origin-Opener-Policy': headers.crossOriginOpenerPolicy,
  'Cross-Origin-Resource-Policy': headers.crossOriginResourcePolicy,
};

async function resolveFile(urlPath) {
  let p;
  try {
    p = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  if (p.endsWith('/')) p += 'index.html';
  const full = resolve(join(root, normalize(p)));
  if (full !== root && !full.startsWith(root + sep)) return null; // ディレクトリトラバーサル対策
  try {
    return (await stat(full)).isFile() ? full : null;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', ...security }).end();
    return;
  }
  const file = await resolveFile(req.url ?? '/');
  const target = file ?? join(root, '404.html');
  const body = await readFile(target);
  res.writeHead(file ? 200 : 404, { 'Content-Type': TYPES[extname(target)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', ...security });
  res.end(req.method === 'HEAD' ? undefined : body);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`http://127.0.0.1:${port}/ で確認できます（Ctrl+C で停止）`);
});
