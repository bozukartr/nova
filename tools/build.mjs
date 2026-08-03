#!/usr/bin/env node
/* NOVA · tek dosya derleyici
 *
 * src/ altındaki ES modüllerini bağımlılık sırasına dizip tek bir IIFE'ye
 * çevirir, CSS'i satır içine alır ve dist/index.html üretir. Sonuç dosyası
 * ağa hiç çıkmadan (file:// dahil) açılabilir.
 *
 * Bilinçli olarak minik tutuldu: bağımlılık yok, kaynak stili sınırlı
 *   - yalnız `export const|let|function|class` (default export yok)
 *   - yalnız göreli `./` importlar
 *   - modüller arasında aynı isimli üst düzey tanım olamaz (derleme hatası)
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = resolvePath(root, 'src/main.js');

const FROM_IMPORT = /^[ \t]*import\s+[\s\S]*?\s*from\s*['"]([^'"]+)['"];?[ \t]*$/gm;
const BARE_IMPORT = /^[ \t]*import\s*['"]([^'"]+)['"];?[ \t]*$/gm;
const EXPORT_DECL = /^export\s+(?=(?:const|let|var|function|async function|class)\b)/gm;
const TOP_DECL = /^(?:const|let|var|function|async function|class)\s+([A-Za-z_$][\w$]*)/gm;

function collectImports(src) {
  const deps = [];
  for (const m of src.matchAll(FROM_IMPORT)) deps.push(m[1]);
  for (const m of src.matchAll(BARE_IMPORT)) deps.push(m[1]);
  return deps;
}

const seen = new Map();
const ordered = [];

async function walk(file) {
  if (seen.has(file)) return;
  seen.set(file, true);
  const src = await readFile(file, 'utf8');

  if (/^export\s+default/m.test(src)) {
    throw new Error(`${file}: default export desteklenmiyor (adlandırılmış export kullan)`);
  }
  for (const spec of collectImports(src)) {
    if (!spec.startsWith('.')) {
      throw new Error(`${file}: yalnız göreli import destekleniyor, "${spec}" bulundu`);
    }
    await walk(resolvePath(dirname(file), spec));
  }

  const body = src
    .replace(FROM_IMPORT, '')
    .replace(BARE_IMPORT, '')
    .replace(EXPORT_DECL, '')
    .trim();

  ordered.push({ file, body });
}

function assertNoCollisions(modules) {
  const owner = new Map();
  for (const mod of modules) {
    for (const m of mod.body.matchAll(TOP_DECL)) {
      const name = m[1];
      if (owner.has(name)) {
        throw new Error(
          `üst düzey isim çakışması: "${name}" hem ${owner.get(name)} hem ${mod.file} içinde`
        );
      }
      owner.set(name, mod.file);
    }
  }
}

const rel = f => f.slice(root.length + 1).replace(/\\/g, '/');

async function build() {
  await walk(ENTRY);
  assertNoCollisions(ordered);

  const bundle = [
    '(() => {',
    "'use strict';",
    ...ordered.map(m => `\n/* ── ${rel(m.file)} ── */\n${m.body}\n`),
    '})();'
  ].join('\n');

  // Yürütmeden sözdizimi doğrulaması.
  // eslint-disable-next-line no-new-func
  new Function(bundle);

  const css = await readFile(resolvePath(root, 'src/style.css'), 'utf8');
  let html = await readFile(resolvePath(root, 'index.html'), 'utf8');

  html = html.replace(
    /[ \t]*<link rel="stylesheet" href="\.\/src\/style\.css">\n?/,
    `<style>\n${css.trim()}\n</style>\n`
  );
  html = html.replace(
    /[ \t]*<script type="module" src="\.\/src\/main\.js"><\/script>\n?/,
    `<script>\n${bundle}\n</script>\n`
  );

  if (/<link[^>]+src\/style\.css/.test(html) || /<script[^>]+src\/main\.js/.test(html)) {
    throw new Error('index.html içindeki kaynak bağlantıları satır içine alınamadı');
  }

  await mkdir(resolvePath(root, 'dist'), { recursive: true });
  const out = resolvePath(root, 'dist/index.html');
  await writeFile(out, html, 'utf8');

  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  console.log(`dist/index.html yazıldı — ${ordered.length} modül, ${kb} KB`);
}

build().catch(err => {
  console.error('derleme başarısız:', err.message);
  process.exit(1);
});
