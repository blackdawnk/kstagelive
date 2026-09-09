/**
 * Compliance rules, shared by the build gate (scripts/check-compliance.mjs)
 * and the regression tests (tests/guardrails.test.ts).
 *
 * Kept as .mjs so plain `node` can run it without a build step while vitest
 * still imports it directly.
 */

/** Origins we are permitted to fetch from. T1 sources only. */
export const ALLOWED_ORIGINS = ['www.kopis.or.kr', 'kopis.or.kr', 'apis.data.go.kr'];

/**
 * Attributes that make a browser issue a request without user action.
 * `<a href>` is deliberately absent: a link only fires when a person clicks it,
 * which is how we reach ticket sellers without ever crawling them (AC08).
 */
const AUTO_FETCH_ATTRS = [
  ['script', 'src'], ['img', 'src'], ['image', 'href'], ['iframe', 'src'],
  ['embed', 'src'], ['object', 'data'], ['video', 'src'], ['audio', 'src'],
  ['source', 'src'], ['track', 'src'], ['link', 'href'],
];

const NETWORK_CALLS = [
  [/\bfetch\s*\(/, 'fetch()'],
  [/XMLHttpRequest/, 'XMLHttpRequest'],
  [/new\s+WebSocket/, 'WebSocket'],
  [/navigator\.sendBeacon/, 'sendBeacon'],
];

/** KOPIS-hosted artwork whose licensing we have not verified (AC09). */
const POSTER_PATTERNS = [/upload\/pfmPoster/i, /pfmIntroImage/i];

/**
 * True when the URL would leave our allowed origins.
 * Relative/anchor/data/mailto/tel never do.
 */
export function isExternal(url, allowed = ALLOWED_ORIGINS) {
  if (!url) return false;
  const trimmed = url.trim();
  if (trimmed === '' || /^(#|data:|mailto:|tel:)/.test(trimmed)) return false;

  // Protocol-relative ("//cdn.example.com/x.js") looks like a path but really
  // fetches from another host, so it must be resolved before the path check.
  if (trimmed.startsWith('//')) {
    try {
      return !allowed.includes(new URL(`https:${trimmed}`).hostname);
    } catch {
      return false;
    }
  }

  // Root-relative ("/x.css") or document-relative ("./x.js") stays on our origin.
  if (/^[/.]/.test(trimmed)) return false;

  let host;
  try {
    host = new URL(trimmed, 'https://placeholder.invalid').hostname;
  } catch {
    return false;
  }
  if (host === 'placeholder.invalid') return false;
  return !allowed.includes(host);
}

/** AC08 — anything that fetches from a non-T1 origin on page load. */
export function findAutoFetchViolations(html, allowed = ALLOWED_ORIGINS) {
  const found = [];
  for (const [tag, attr] of AUTO_FETCH_ATTRS) {
    const re = new RegExp(`<${tag}\\b[^>]*?\\b${attr}\\s*=\\s*["']([^"']+)["']`, 'gi');
    let m;
    while ((m = re.exec(html)) !== null) {
      if (isExternal(m[1], allowed)) {
        found.push({ rule: 'AC08', detail: `<${tag} ${attr}> → ${m[1]}` });
      }
    }
  }
  const urlRe = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  let u;
  while ((u = urlRe.exec(html)) !== null) {
    if (isExternal(u[1], allowed)) {
      found.push({ rule: 'AC08', detail: `CSS url() → ${u[1]}` });
    }
  }
  for (const [pattern, label] of NETWORK_CALLS) {
    if (pattern.test(html)) {
      found.push({ rule: 'AC08', detail: `client-side network call: ${label}` });
    }
  }
  return found;
}

/** AC09 — KOPIS poster / intro images must not appear in the output at all. */
export function findPosterViolations(content) {
  return POSTER_PATTERNS.filter((p) => p.test(content)).map((p) => ({
    rule: 'AC09',
    detail: `references KOPIS artwork (${p})`,
  }));
}

/** AC12 — the KOPIS attribution is a condition of the API terms of use. */
export function findAttributionViolations(html) {
  const hasMarker = /data-kopis-attribution/.test(html);
  const hasText = /KOPIS/.test(html);
  return hasMarker && hasText
    ? []
    : [{ rule: 'AC12', detail: 'missing KOPIS attribution' }];
}

/** Run every rule that applies to a rendered HTML page. */
export function auditHtml(html, allowed = ALLOWED_ORIGINS) {
  return [
    ...findAutoFetchViolations(html, allowed),
    ...findPosterViolations(html),
    ...findAttributionViolations(html),
  ];
}
