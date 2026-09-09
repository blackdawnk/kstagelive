#!/usr/bin/env node
/**
 * Build-time compliance gate. Run against dist/ after `astro build`.
 *
 *   AC08  no automatic request to a non-T1 origin (anchor hrefs are exempt —
 *         they only fire on a click, which is how we reach ticket sellers
 *         without ever crawling them; Interpark's robots.txt bans crawlers).
 *   AC09  no KOPIS poster / intro artwork, in any form — licensing unverified.
 *   AC12  the KOPIS attribution appears on every page.
 *
 * Rules live in src/lib/compliance/rules.mjs so tests exercise the same code.
 * Exit 1 on any violation: this is a gate, not a report.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  findAutoFetchViolations,
  findPosterViolations,
  findAttributionViolations,
} from '../src/lib/compliance/rules.mjs';

const DIST = 'dist';

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

if (!existsSync(DIST)) {
  console.error(`compliance: ${DIST}/ not found — run \`npm run build\` first.`);
  process.exit(1);
}

const files = walk(DIST);
const htmlFiles = files.filter((f) => f.endsWith('.html'));

if (htmlFiles.length === 0) {
  console.error('compliance: no HTML in dist/ — nothing was built.');
  process.exit(1);
}

const violations = [];

for (const file of files) {
  const rel = relative(DIST, file);
  const content = readFileSync(file, 'utf8');

  if (file.endsWith('.html')) {
    for (const v of findAutoFetchViolations(content)) violations.push(`${v.rule} ${rel}: ${v.detail}`);
    for (const v of findAttributionViolations(content)) violations.push(`${v.rule} ${rel}: ${v.detail}`);
  }
  if (/\.(html|css|js|json)$/.test(file)) {
    for (const v of findPosterViolations(content)) violations.push(`${v.rule} ${rel}: ${v.detail}`);
  }
}

if (violations.length > 0) {
  console.error(`\n✗ compliance: ${violations.length} violation(s)\n`);
  for (const v of violations) console.error(`  ${v}`);
  console.error('');
  process.exit(1);
}

console.log(`✓ compliance: ${htmlFiles.length} page(s) clean (AC08 external requests, AC09 posters, AC12 attribution)`);
