# kstagelive

**Korean live-performance data, in English.**

Every ticketed popular-music performance in Korea — concerts, fan meetings, festivals —
listed in English with venue details, accessibility information and official ticket links.

## Why this exists

The English-language K-pop concert sites all cover the same territory: North America and
Europe. Ticketmaster, which most of them lean on, [does not operate in Korea][tm]. So the
one place these artists perform most often is the one place none of them cover well.

The gap isn't an oversight — it's a data problem. Korean ticket sellers either block
crawlers outright or render everything client-side, so aggregating Korean shows by scraping
is neither practical nor permitted.

There is, however, a public record. Under the Performing Arts Act (Art. 4), every ticketed
performance in Korea must be registered with **KOPIS**, the statutory performance database
run by the Korea Arts Management Service. It's complete, it's free, and its licence places
no restriction on use. It is simply Korean-only and has never been surfaced in English.

That's what this site does.

[tm]: https://developer.ticketmaster.com/products-and-docs/apis/discovery-feed/

## What it does and doesn't do

**Does:** list performances, show venue capacity/halls/amenities/accessibility, give map
links that work in Korea, link to the official ticket seller the organiser named, and
publish market charts from the same record.

**Doesn't:** sell tickets, take payments, handle bookings, or collect any personal data.
It also **cannot tell you when tickets go on sale** — KOPIS registers a performance only
after sales have begun. Every performance page says so explicitly.

## Data source

All performance data comes from the [KOPIS Open API][kopis]. Venue accessibility fields are
reported conservatively: KOPIS returns `N` both for "absent" and "not entered", and we
verified it returns `N` for venues that demonstrably do have step-free access. So only `Y`
is shown as confirmed — nothing is ever presented as *unavailable*. Getting this wrong
would mislead the people who most need it to be right.

Poster and promotional artwork are excluded: the KOPIS licence does not clearly extend to
third-party images.

[kopis]: https://www.kopis.or.kr/por/cs/openapi/openApiInfo.do?menuId=MNU_00074

## Development

```bash
npm install
cp .env.example .env      # add your KOPIS service key
node scripts/sync.mjs     # fetch a snapshot into data/snapshots/
npm run dev
```

A KOPIS key is issued instantly (no account needed) from the
[key request form](https://www.kopis.or.kr/por/cs/openapi/openApiUseSend.do?menuId=MNU_00074).

### Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` | Static build to `dist/` |
| `npm test` | Unit tests |
| `npm run typecheck` | Astro + TypeScript check |
| `npm run check:compliance` | Source-terms gate (see below) |
| `npm run check:budget` | Performance budget gate |
| `npm run verify` | All of the above |

### Build gates

These fail the build rather than warn, because each one guards a commitment that is easy
to break silently:

- **No outbound requests to non-source origins.** Ticket-seller links are anchors only;
  the site never fetches, pings or validates a seller host. Interpark's `robots.txt` bans
  general crawlers, and a link that only fires on a click respects that.
- **No KOPIS artwork** in the output, in any form.
- **KOPIS attribution** present on every page (a condition of the API terms).
- **Coded values fully translated** — an unmapped region or genre fails the build instead
  of leaking a Korean string into an English page.
- **Performance budget** — ≤100KB HTML, ≤50KB gzipped JS, ≤200KB total per page.

The site ships no client JavaScript beyond a small progressive-enhancement filter; with
JS disabled every listing and detail page still renders in full.

## Deployment

GitHub Actions builds and deploys to GitHub Pages on push and twice daily, refreshing the
KOPIS snapshot each time. The service key is injected as a repository secret and never
committed.

## Licence

Site code is MIT. Performance data belongs to KOPIS / Korea Arts Management Service and is
used under its open licence.
