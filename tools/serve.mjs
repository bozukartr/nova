#!/usr/bin/env node
/* NOVA · geliştirme sunucusu
 *
 * ES modülleri file:// üzerinden yüklenemediği için kaynak sürümü bir HTTP
 * sunucusu ister. Bağımlılık kurmadan çalışsın diye node:http ile yazıldı.
 *   node tools/serve.mjs [port]
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve as resolvePath, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || process.env.PORT || 5173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let path = decodeURIComponent(url.pathname);
  if (path.endsWith('/')) path += 'index.html';

  const target = join(root, normalize(path));
  if (!target.startsWith(root + sep)) {           // dizin dışına çıkma girişimi
    res.writeHead(403).end('403');
    return;
  }

  try {
    const body = await readFile(target);
    res.writeHead(200, {
      'content-type': TYPES[extname(target)] || 'application/octet-stream',
      'cache-control': 'no-cache'
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 · ' + path);
  }
}).listen(port, () => {
  console.log(`NOVA · http://localhost:${port}/  (dist için /dist/)`);
});
