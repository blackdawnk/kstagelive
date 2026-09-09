#!/usr/bin/env node
/**
 * Collect KOPIS data into a snapshot the build consumes (T03/T04).
 *
 * Pipeline: fetch list windows → fetch detail per performance → fetch venues
 *           → validate → write one snapshot file.
 *
 * The build never calls the API; it reads the snapshot. That keeps every page
 * on one consistent dataset (AC01) and makes a failed sync non-destructive —
 * the previous snapshot stays in place (AC05).
 *
 * Usage:  node scripts/sync.mjs [--months-back N] [--months-ahead N] [--limit N]
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import {
  fetchPerformances,
  fetchPerformanceDetail,
  fetchVenueDetail,
} from '../src/lib/kopis/client.mjs';
import { normalizeListItem, normalizeDetail, normalizeVenue } from '../src/lib/normalize/performance.mjs';

const GENRE_POPULAR_MUSIC = 'CCCD';
const OUT_DIR = 'data/snapshots';
const OUT_FILE = join(OUT_DIR, 'latest.json');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback;
}

const MONTHS_BACK = arg('months-back', 2);
const MONTHS_AHEAD = arg('months-ahead', 5);
const DETAIL_LIMIT = arg('limit', Infinity);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Local runs read .env; CI injects the key as a secret instead. */
function loadEnvFile() {
  if (process.env.KOPIS_SERVICE_KEY || !existsSync('.env')) return;
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadEnvFile();

const serviceKey = process.env.KOPIS_SERVICE_KEY;
if (!serviceKey) {
  console.error('sync: KOPIS_SERVICE_KEY is not set. Add it to .env or the CI secrets.');
  process.exit(1);
}

const now = new Date();
const start = new Date(now.getFullYear(), now.getMonth() - MONTHS_BACK, 1);
const end = new Date(now.getFullYear(), now.getMonth() + MONTHS_AHEAD + 1, 0);

console.log(`sync: popular music (${GENRE_POPULAR_MUSIC})`);
console.log(`sync: window ${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}`);

const failures = [];

// ---- 1. list -------------------------------------------------------------
let listRows = [];
try {
  listRows = await fetchPerformances({
    start,
    end,
    extra: { shcate: GENRE_POPULAR_MUSIC },
    serviceKey: process.env.KOPIS_SERVICE_KEY,
    onPage: ({ stdate, page, count }) => process.stdout.write(`\r  list ${stdate} p${page}: ${count}   `),
  });
} catch (err) {
  console.error(`\nsync: list fetch failed — ${err.message}`);
  process.exit(1);
}
console.log(`\n  list: ${listRows.length} rows`);

const listItems = listRows.map(normalizeListItem).filter((p) => p.id);
const byId = new Map(listItems.map((p) => [p.id, p]));
console.log(`  unique performances: ${byId.size}`);

// ---- 2. detail -----------------------------------------------------------
const ids = [...byId.keys()].slice(0, DETAIL_LIMIT === Infinity ? undefined : DETAIL_LIMIT);
const details = new Map();
let done = 0;
for (const id of ids) {
  try {
    const raw = await fetchPerformanceDetail(id, { serviceKey: process.env.KOPIS_SERVICE_KEY });
    if (raw) details.set(id, normalizeDetail(raw));
  } catch (err) {
    failures.push({ stage: 'detail', id, message: err.message });
  }
  done += 1;
  if (done % 10 === 0 || done === ids.length) {
    process.stdout.write(`\r  detail ${done}/${ids.length} (${failures.length} failed)   `);
  }
  await sleep(60);
}
console.log('');

// ---- 3. venues -----------------------------------------------------------
const venueIds = [...new Set([...details.values()].map((d) => d.venueId).filter(Boolean))];
const venues = {};
let vdone = 0;
for (const vid of venueIds) {
  try {
    const raw = await fetchVenueDetail(vid, { serviceKey: process.env.KOPIS_SERVICE_KEY });
    if (raw) venues[vid] = normalizeVenue(raw);
  } catch (err) {
    failures.push({ stage: 'venue', id: vid, message: err.message });
  }
  vdone += 1;
  if (vdone % 10 === 0 || vdone === venueIds.length) {
    process.stdout.write(`\r  venue ${vdone}/${venueIds.length}   `);
  }
  await sleep(60);
}
console.log('');

// ---- 4. merge + validate -------------------------------------------------
const performances = [...byId.values()].map((item) => {
  const d = details.get(item.id);
  return d ? { ...item, ...d, hasDetail: true } : { ...item, hasDetail: false, ticketLinks: [], cast: [] };
});

const withDetail = performances.filter((p) => p.hasDetail).length;
const withTickets = performances.filter((p) => p.ticketLinks?.length).length;
const withCast = performances.filter((p) => p.cast?.length).length;

// Lead time: how far ahead of the performance does KOPIS register it? (RISK05)
const leadTimes = performances
  .filter((p) => p.firstRegisteredAt && p.startDate)
  .map((p) => Math.round((new Date(p.startDate) - new Date(p.firstRegisteredAt)) / 86400000))
  .filter((n) => Number.isFinite(n));
leadTimes.sort((a, b) => a - b);
const median = leadTimes.length ? leadTimes[Math.floor(leadTimes.length / 2)] : null;

const snapshot = {
  snapshotId: `kopis-${new Date().toISOString().replace(/[:.]/g, '-')}`,
  generatedAt: new Date().toISOString(),
  lastSuccessfulCheckAt: new Date().toISOString(),
  source: {
    name: 'KOPIS Open API',
    genre: GENRE_POPULAR_MUSIC,
    window: { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) },
  },
  counts: {
    performances: performances.length,
    withDetail,
    withTicketLinks: withTickets,
    withCast,
    venues: Object.keys(venues).length,
    failures: failures.length,
  },
  leadTimeDays: {
    count: leadTimes.length,
    median,
    p10: leadTimes.length ? leadTimes[Math.floor(leadTimes.length * 0.1)] : null,
    p90: leadTimes.length ? leadTimes[Math.floor(leadTimes.length * 0.9)] : null,
  },
  failures: failures.slice(0, 50),
  performances,
  venues,
};

// A sync that produced nothing must not overwrite a good snapshot (AC05/NFR06).
if (performances.length === 0) {
  console.error('sync: no performances collected — keeping the previous snapshot.');
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
const tmp = `${OUT_FILE}.tmp`;
writeFileSync(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
renameSync(tmp, OUT_FILE);

console.log(`\n✓ snapshot ${snapshot.snapshotId}`);
console.log(`  performances   ${performances.length} (detail ${withDetail}, tickets ${withTickets}, cast ${withCast})`);
console.log(`  venues         ${Object.keys(venues).length}`);
console.log(`  failures       ${failures.length}`);
console.log(`  lead time      median ${median} days (p10 ${snapshot.leadTimeDays.p10}, p90 ${snapshot.leadTimeDays.p90})`);
console.log(`  → ${OUT_FILE}`);
