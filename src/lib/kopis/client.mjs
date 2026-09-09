/**
 * KOPIS Open API client.
 *
 * The API has two hard limits that shape everything here (AC11):
 *   - a query window may not exceed 31 days  → result code 05
 *   - a page may not exceed 100 rows         → result code 06
 * So every list read is a sequence of ≤31-day windows, each paged to exhaustion.
 *
 * The service key is read from the environment and never logged or persisted.
 */
import { XMLParser } from 'fast-xml-parser';

const BASE = 'http://www.kopis.or.kr/openApi/restful';

export const MAX_WINDOW_DAYS = 31;
export const MAX_ROWS = 100;

/** Documented result codes. 04 means "no rows", which is not a failure. */
export const RESULT_CODES = {
  '00': 'NORMAL SERVICE',
  '01': 'INVALID REQUEST PARAMETER ERROR',
  '02': 'SERVICE KEY IS NOT REGISTERED ERROR',
  '03': 'DB_ERROR',
  '04': 'NODATA ERROR',
  '05': 'Query window exceeds 31 days',
  '06': 'Row count exceeds 100',
};

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
});

export class KopisError extends Error {
  constructor(code, message) {
    super(`KOPIS ${code}: ${message}`);
    this.code = code;
  }
}

/** yyyymmdd for the KOPIS date parameters. */
export const ymd = (d) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

/**
 * Split [start, end] into windows of at most 31 days.
 * Returns [{ stdate, eddate }] in chronological order.
 */
export function splitWindows(start, end, days = MAX_WINDOW_DAYS) {
  if (end < start) return [];
  const windows = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    const last = new Date(cursor);
    last.setDate(last.getDate() + days - 1);
    windows.push({ stdate: ymd(cursor), eddate: ymd(last > end ? end : last) });
    cursor = new Date(last);
    cursor.setDate(cursor.getDate() + 1);
  }
  return windows;
}

function assertLimits(params) {
  const rows = Number(params.rows ?? MAX_ROWS);
  if (rows > MAX_ROWS) {
    throw new RangeError(`AC11: rows=${rows} exceeds the KOPIS maximum of ${MAX_ROWS}`);
  }
  if (params.stdate && params.eddate) {
    const toDate = (s) => new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00Z`);
    const span = (toDate(params.eddate) - toDate(params.stdate)) / 86400000 + 1;
    if (span > MAX_WINDOW_DAYS) {
      throw new RangeError(`AC11: window of ${span} days exceeds the KOPIS maximum of ${MAX_WINDOW_DAYS}`);
    }
  }
}

/**
 * Low-level GET. Returns parsed XML, or throws KopisError for a real failure.
 * Result code 04 (no data) resolves to an empty result — it is a normal answer.
 */
async function request(path, params, { serviceKey, retries = 3, timeoutMs = 20000 } = {}) {
  if (!serviceKey) throw new Error('KOPIS service key is missing (set KOPIS_SERVICE_KEY).');
  assertLimits(params);

  const query = new URLSearchParams({ service: serviceKey, ...params });
  const url = `${BASE}/${path}?${query}`;
  // Never let the key reach a log line.
  const safeUrl = url.replace(serviceKey, '***');

  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${safeUrl}`);
      const xml = await res.text();
      const doc = parser.parse(xml);

      const code = doc?.dbs?.db?.returncode ?? doc?.dbs?.returncode;
      if (code !== undefined && code !== null && String(code) !== '00') {
        const c = String(code).padStart(2, '0');
        if (c === '04') return { empty: true, doc };
        throw new KopisError(c, RESULT_CODES[c] ?? 'unknown result code');
      }
      return { empty: false, doc };
    } catch (err) {
      clearTimeout(timer);
      // A rejected key or bad parameter will not fix itself — stop immediately.
      if (err instanceof KopisError) throw err;
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }
  throw new Error(`KOPIS request failed after ${retries} attempts: ${lastError?.message}`);
}

/** Normalise fast-xml-parser's "one child collapses to an object" behaviour. */
export const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

/**
 * Fetch every performance in a window, following pages until exhausted.
 * `extra` accepts shcate, signgucode, afterdate, prfstate, shprfnmfct, …
 */
export async function fetchPerformanceWindow({ stdate, eddate, extra = {}, serviceKey, onPage }) {
  const rows = [];
  for (let page = 1; ; page += 1) {
    const { empty, doc } = await request(
      'pblprfr',
      { stdate, eddate, cpage: String(page), rows: String(MAX_ROWS), ...extra },
      { serviceKey },
    );
    if (empty) break;
    const batch = asArray(doc?.dbs?.db);
    rows.push(...batch);
    onPage?.({ stdate, eddate, page, count: batch.length });
    if (batch.length < MAX_ROWS) break;
  }
  return rows;
}

/** Fetch a whole date range by splitting it into legal windows. */
export async function fetchPerformances({ start, end, extra = {}, serviceKey, onPage }) {
  const all = [];
  for (const w of splitWindows(start, end)) {
    all.push(...(await fetchPerformanceWindow({ ...w, extra, serviceKey, onPage })));
  }
  return all;
}

/** Detail for one performance, including `relates` (ticket sellers). */
export async function fetchPerformanceDetail(mt20id, { serviceKey } = {}) {
  const { empty, doc } = await request(`pblprfr/${encodeURIComponent(mt20id)}`, {}, { serviceKey });
  if (empty) return null;
  return asArray(doc?.dbs?.db)[0] ?? null;
}

/** Detail for one venue, including halls and accessibility flags. */
export async function fetchVenueDetail(mt10id, { serviceKey } = {}) {
  const { empty, doc } = await request(`prfplc/${encodeURIComponent(mt10id)}`, {}, { serviceKey });
  if (empty) return null;
  return asArray(doc?.dbs?.db)[0] ?? null;
}

/** Box-office ranking for a period. */
export async function fetchBoxOffice({ stdate, eddate, extra = {}, serviceKey }) {
  const { empty, doc } = await request('boxoffice', { stdate, eddate, ...extra }, { serviceKey });
  if (empty) return [];
  return asArray(doc?.boxofs?.boxof);
}
