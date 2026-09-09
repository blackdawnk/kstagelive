import { describe, it, expect } from 'vitest';
import {
  isExternal,
  findAutoFetchViolations,
  findPosterViolations,
  findAttributionViolations,
  auditHtml,
} from '../src/lib/compliance/rules.mjs';

const ATTRIBUTION = '<p data-kopis-attribution>Data from KOPIS.</p>';
const page = (body: string) => `<html><body>${body}${ATTRIBUTION}</body></html>`;

describe('AC08 — no automatic requests to non-T1 origins', () => {
  it('flags an external script', () => {
    const v = findAutoFetchViolations('<script src="https://cdn.example.com/a.js"></script>');
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('AC08');
  });

  it('flags an external image', () => {
    expect(findAutoFetchViolations('<img src="https://img.example.com/p.jpg">')).toHaveLength(1);
  });

  it('flags an external stylesheet', () => {
    expect(
      findAutoFetchViolations('<link rel="stylesheet" href="https://fonts.googleapis.com/css">'),
    ).toHaveLength(1);
  });

  it('flags an external CSS url()', () => {
    expect(findAutoFetchViolations('<style>body{background:url(https://x.example/bg.png)}</style>'))
      .toHaveLength(1);
  });

  it('flags an embedded map iframe', () => {
    // The reason AC19 settled on links: an embed would fetch on page load.
    expect(findAutoFetchViolations('<iframe src="https://www.google.com/maps/embed?pb=1"></iframe>'))
      .toHaveLength(1);
  });

  it.each([['fetch("/x")'], ['new XMLHttpRequest()'], ['new WebSocket("wss://x")'], ['navigator.sendBeacon("/b")']])(
    'flags client-side network call: %s',
    (snippet) => {
      expect(findAutoFetchViolations(`<script>${snippet}</script>`).length).toBeGreaterThan(0);
    },
  );

  it('ALLOWS an anchor to a ticket seller — links only fire on a click', () => {
    // This is the whole reason we can surface Interpark/YES24 without crawling them.
    const html = '<a href="http://ticket.interpark.com/Ticket/Goods/GoodsInfo.asp?GoodsCode=26010264">Book</a>';
    expect(findAutoFetchViolations(html)).toHaveLength(0);
  });

  it('allows relative and same-origin references', () => {
    expect(findAutoFetchViolations('<img src="/logo.svg"><script src="./app.js"></script>')).toHaveLength(0);
  });

  it('allows KOPIS itself', () => {
    expect(findAutoFetchViolations('<link rel="canonical" href="https://www.kopis.or.kr/x">')).toHaveLength(0);
  });

  it('allows inline data URIs', () => {
    expect(findAutoFetchViolations("<link rel=\"icon\" href=\"data:image/svg+xml,<svg/>\">")).toHaveLength(0);
  });
});

describe('AC09 — no KOPIS artwork', () => {
  it('flags a poster URL', () => {
    const v = findPosterViolations(
      '<img src="http://www.kopis.or.kr/upload/pfmPoster/PF_PF178134_210809.PNG">',
    );
    expect(v.length).toBeGreaterThan(0);
    expect(v[0].rule).toBe('AC09');
  });

  it('flags an intro image URL even inside JSON data', () => {
    expect(findPosterViolations('{"styurl":"http://www.kopis.or.kr/upload/pfmIntroImage/x.jpg"}').length)
      .toBeGreaterThan(0);
  });

  it('passes a KOPIS page link that is not artwork', () => {
    expect(findPosterViolations('<a href="https://www.kopis.or.kr/por/db/pblprfr/pblprfrView.do?mt20Id=PF1">KOPIS</a>'))
      .toHaveLength(0);
  });
});

describe('AC12 — KOPIS attribution on every page', () => {
  it('passes when the attribution marker and text are present', () => {
    expect(findAttributionViolations(page('<h1>Hi</h1>'))).toHaveLength(0);
  });

  it('flags a page missing the attribution', () => {
    const v = findAttributionViolations('<html><body><h1>Hi</h1></body></html>');
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('AC12');
  });

  it('flags a page that names KOPIS but drops the marker', () => {
    expect(findAttributionViolations('<html><body>KOPIS data</body></html>')).toHaveLength(1);
  });
});

describe('isExternal', () => {
  it.each([
    ['https://evil.example/x.js', true],
    ['//cdn.example.com/x.js', true],
    ['https://www.kopis.or.kr/a', false],
    ['https://apis.data.go.kr/B554287/x', false],
    ['/local.css', false],
    ['./rel.js', false],
    ['#anchor', false],
    ['data:image/png;base64,AAA', false],
    ['mailto:a@b.c', false],
    ['', false],
  ])('%s → external=%s', (url, expected) => {
    expect(isExternal(url as string)).toBe(expected);
  });
});

describe('auditHtml', () => {
  it('returns no findings for a clean page', () => {
    expect(auditHtml(page('<h1>Performances</h1><a href="https://ticket.yes24.com/Perf/1">Tickets</a>')))
      .toHaveLength(0);
  });

  it('accumulates findings across rules', () => {
    const bad = '<html><body><script src="https://cdn.example/a.js"></script>'
      + '<img src="http://www.kopis.or.kr/upload/pfmPoster/x.png"></body></html>';
    const rules = auditHtml(bad).map((v) => v.rule);
    expect(rules).toContain('AC08');
    expect(rules).toContain('AC09');
    expect(rules).toContain('AC12');
  });
});
