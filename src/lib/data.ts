/**
 * Snapshot access for the build (AC01, AC05).
 *
 * Every page reads from one snapshot file, so a list, a detail page and the
 * charts can never disagree. If the snapshot is missing the build fails —
 * an empty site would be indistinguishable from "no performances", which is
 * exactly the confusion AC05 forbids.
 */
import { readFileSync, existsSync } from 'node:fs';

export type Flag = 'yes' | 'no' | 'unknown';
/** Accessibility is narrower on purpose: KOPIS `N` means "not entered". */
export type AccessibilityFlag = 'yes' | 'unknown';

export interface TicketLink {
  name: string;
  url: string;
}

export interface Hall {
  id: string;
  name: string;
  seatCount: number | null;
  wheelchairSeats: number | null;
  stageArea: string;
}

export interface Venue {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lon: number | null;
  phone: string;
  homepage: string;
  hallCount: number | null;
  seatCount: number | null;
  openedYear: string;
  kind: string;
  amenities: Record<string, Flag>;
  accessibility: Record<string, AccessibilityFlag>;
  halls: Hall[];
}

export interface Performance {
  id: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  venueId?: string;
  venueName: string;
  area: string;
  genre: string;
  state: string;
  openRun: boolean;
  hasDetail: boolean;
  cast: string[];
  crew?: string[];
  runtime?: string;
  ageLimit?: string;
  producer?: string;
  host?: string;
  organiser?: string;
  priceGuide?: string;
  scheduleGuide?: string;
  isVisiting?: boolean;
  isFestival?: boolean;
  firstRegisteredAt?: string | null;
  updatedAt?: string | null;
  ticketLinks: TicketLink[];
}

export interface Snapshot {
  snapshotId: string;
  generatedAt: string;
  lastSuccessfulCheckAt: string;
  source: { name: string; genre: string; window: { start: string; end: string } };
  counts: Record<string, number>;
  leadTimeDays: { count: number; median: number | null; p10: number | null; p90: number | null };
  failures: unknown[];
  performances: Performance[];
  venues: Record<string, Venue>;
}

const SNAPSHOT_PATH = 'data/snapshots/latest.json';

let cached: Snapshot | null = null;

export function loadSnapshot(): Snapshot {
  if (cached) return cached;
  if (!existsSync(SNAPSHOT_PATH)) {
    throw new Error(
      `No snapshot at ${SNAPSHOT_PATH}. Run \`node scripts/sync.mjs\` before building.\n` +
        `Building without data would render an empty site that looks like "no performances".`,
    );
  }
  cached = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as Snapshot;
  return cached;
}

/** Performances that have not finished yet, soonest first. */
export function upcoming(snapshot: Snapshot): Performance[] {
  const today = new Date().toISOString().slice(0, 10);
  return snapshot.performances
    .filter((p) => (p.endDate ?? p.startDate ?? '') >= today)
    .sort((a, b) => (a.startDate ?? '9999').localeCompare(b.startDate ?? '9999'));
}

/** Everything, newest first — used for the archive view. */
export function byDateDesc(snapshot: Snapshot): Performance[] {
  return [...snapshot.performances].sort((a, b) =>
    (b.startDate ?? '').localeCompare(a.startDate ?? ''),
  );
}

export function venueOf(snapshot: Snapshot, p: Performance): Venue | null {
  return p.venueId ? snapshot.venues[p.venueId] ?? null : null;
}

/** Venues that actually host something in this snapshot, biggest first. */
export function venuesWithPerformances(snapshot: Snapshot): Array<Venue & { count: number }> {
  const counts = new Map<string, number>();
  for (const p of snapshot.performances) {
    if (p.venueId) counts.set(p.venueId, (counts.get(p.venueId) ?? 0) + 1);
  }
  return Object.values(snapshot.venues)
    .map((v) => ({ ...v, count: counts.get(v.id) ?? 0 }))
    .filter((v) => v.count > 0)
    .sort((a, b) => b.count - a.count || (b.seatCount ?? 0) - (a.seatCount ?? 0));
}

export function performancesAtVenue(snapshot: Snapshot, venueId: string): Performance[] {
  return snapshot.performances
    .filter((p) => p.venueId === venueId)
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''));
}

/**
 * Age of the data, derived at render time from the snapshot timestamp.
 * The page states an absolute time too, so a stale build still tells the truth
 * without needing JavaScript (AC05/AC16).
 */
export function freshness(snapshot: Snapshot) {
  const checked = new Date(snapshot.lastSuccessfulCheckAt);
  const hours = Math.max(0, Math.round((Date.now() - checked.getTime()) / 3600000));
  return {
    checkedAt: snapshot.lastSuccessfulCheckAt,
    checkedAtLabel: checked.toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
    hoursAgo: hours,
    isStale: hours > 48,
  };
}

/** "2026-09-19" + "2026-09-20" → "19–20 Sep 2026"; single dates collapse. */
export function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return 'Date to be announced';
  const s = new Date(`${start}T00:00:00Z`);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const sd = s.getUTCDate();
  const sm = months[s.getUTCMonth()];
  const sy = s.getUTCFullYear();
  if (!end || end === start) return `${sd} ${sm} ${sy}`;
  const e = new Date(`${end}T00:00:00Z`);
  const ed = e.getUTCDate();
  const em = months[e.getUTCMonth()];
  const ey = e.getUTCFullYear();
  if (sy === ey && sm === em) return `${sd}–${ed} ${sm} ${sy}`;
  if (sy === ey) return `${sd} ${sm} – ${ed} ${em} ${sy}`;
  return `${sd} ${sm} ${sy} – ${ed} ${em} ${ey}`;
}
