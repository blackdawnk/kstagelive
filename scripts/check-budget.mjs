#!/usr/bin/env node
/**
 * Performance budget gate (NFR07 / AC16).
 *
 * Per page:  HTML <= 100KB raw, JS <= 50KB gzipped, total payload <= 200KB raw.
 * "Total payload" counts the HTML plus every same-origin asset it references,
 * since external origins are already banned by check-compliance.mjs.
 *
 * Exit code 1 on any breach.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = 'dist';

const BUDGET = {
  htmlBytes: 100 * 1024,
  jsGzipBytes: 50 * 1024,
  totalBytes: 200 * 1024,
};

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function localAssets(html, htmlFile) {
  const refs = new Set();
  const re = /<(?:script|link|img|source)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = m[1].trim();
    if (/^(https?:|data:|#|mailto:|tel:)/.test(url)) continue;
    // Resolve against dist root for absolute paths, else against the page.
    const path = url.startsWith('/')
      ? join(DIST, url.replace(/^\/+/, '').replace(/^kstagelive\//, ''))
      : resolve(dirname(htmlFile), url);
    refs.add(path.split('?')[0].split('#')[0]);
  }
  return [...refs];
}

if (!existsSync(DIST)) {
  console.error(`budget: ${DIST}/ not found — run \`npm run build\` first.`);
  process.exit(1);
}

const failures = [];
const rows = [];

for (const file of walk(DIST).filter((f) => f.endsWith('.html'))) {
  const html = readFileSync(file, 'utf8');
  const htmlBytes = Buffer.byteLength(html);

  let jsBytes = 0;
  let totalBytes = htmlBytes;

  // Inline scripts count toward the JS budget.
  for (const m of html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    jsBytes += Buffer.byteLength(m[1]);
  }

  for (const asset of localAssets(html, file)) {
    if (!existsSync(asset)) continue;
    const size = statSync(asset).size;
    totalBytes += size;
    if (asset.endsWith('.js')) jsBytes += size;
  }

  const jsGzip = jsBytes > 0 ? gzipSync(Buffer.alloc(jsBytes)).length : 0;
  // Gzip of a zero-filled buffer is meaningless; measure real JS content instead.
  let realJsGzip = 0;
  if (jsBytes > 0) {
    let jsSource = '';
    for (const m of html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) jsSource += m[1];
    for (const asset of localAssets(html, file)) {
      if (asset.endsWith('.js') && existsSync(asset)) jsSource += readFileSync(asset, 'utf8');
    }
    realJsGzip = gzipSync(Buffer.from(jsSource)).length;
  }

  const page = relative(DIST, file);
  rows.push({ page, htmlBytes, jsGzip: realJsGzip, totalBytes });

  if (htmlBytes > BUDGET.htmlBytes) {
    failures.push(`${page}: HTML ${(htmlBytes / 1024).toFixed(1)}KB > ${BUDGET.htmlBytes / 1024}KB`);
  }
  if (realJsGzip > BUDGET.jsGzipBytes) {
    failures.push(`${page}: JS ${(realJsGzip / 1024).toFixed(1)}KB gzip > ${BUDGET.jsGzipBytes / 1024}KB`);
  }
  if (totalBytes > BUDGET.totalBytes) {
    failures.push(`${page}: total ${(totalBytes / 1024).toFixed(1)}KB > ${BUDGET.totalBytes / 1024}KB`);
  }
}

const fmt = (n) => `${(n / 1024).toFixed(1)}KB`;
const widest = Math.max(...rows.map((r) => r.page.length), 4);
console.log(`\n  ${'page'.padEnd(widest)}   html      js(gz)    total`);
for (const r of rows.sort((a, b) => b.totalBytes - a.totalBytes)) {
  console.log(`  ${r.page.padEnd(widest)}   ${fmt(r.htmlBytes).padStart(8)}  ${fmt(r.jsGzip).padStart(8)}  ${fmt(r.totalBytes).padStart(8)}`);
}

if (failures.length > 0) {
  console.error(`\n✗ budget: ${failures.length} breach(es)\n`);
  for (const f of failures) console.error(`  ${f}`);
  console.error('');
  process.exit(1);
}

console.log(`\n✓ budget: ${rows.length} page(s) within NFR07 (html ≤100KB, js ≤50KB gzip, total ≤200KB)\n`);
