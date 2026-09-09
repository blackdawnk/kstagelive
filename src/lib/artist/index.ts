/**
 * Artist index built from `prfcast` (AC02).
 *
 * KOPIS has no artist field — it has a free-text cast list. SP05 confirmed the
 * list carries real names in full (izna's six members were all present), so we
 * can group performances by performer without a curated roster.
 *
 * What we deliberately do NOT do: guess. A name is matched only when the string
 * matches exactly after trimming. No transliteration, no fuzzy matching, no
 * stage-name↔real-name inference — SP05 saw DONGHAE listed as 이동해, and
 * bridging those two safely needs a verified roster we do not have yet.
 * Performances whose cast we cannot resolve still appear in every listing.
 */
import type { Performance, Snapshot } from '../data';

export interface ArtistEntry {
  /** The cast string exactly as KOPIS supplied it. */
  name: string;
  /** URL-safe identifier derived from the name. */
  slug: string;
  performances: Performance[];
}

/**
 * Route segment for an artist.
 *
 * Kept as the Korean name rather than a romanisation — transliteration would be
 * a guess, and the Korean string is what a visitor can paste into a ticket site.
 * Astro wants the *decoded* value in `params`, so encoding happens at link time
 * via `artistHref()`; only characters that would break routing are stripped.
 */
export function artistSlug(name: string): string {
  return name.trim().replace(/\s+/g, '-').replace(/[/?#%&+\\]/g, '');
}

/** Percent-encoded href for a slug produced by `artistSlug`. */
export function artistHref(base: string, slug: string): string {
  return `${base}/artist/${encodeURIComponent(slug)}`;
}

/**
 * Group performances by cast member.
 * `minPerformances` keeps the index meaningful: a one-off name on a single club
 * night is not yet an artist page worth generating.
 */
export function buildArtistIndex(snapshot: Snapshot, minPerformances = 2): ArtistEntry[] {
  const byName = new Map<string, Performance[]>();

  for (const p of snapshot.performances) {
    for (const raw of p.cast ?? []) {
      const name = raw.trim();
      // Skip fragments that are clearly not a person: pure punctuation, or
      // over-long strings that are really a description.
      if (name.length < 2 || name.length > 40) continue;
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name)!.push(p);
    }
  }

  // Stripping routing-unsafe characters can make two different names collide;
  // duplicate params would fail the build, so disambiguate deterministically.
  const used = new Map<string, number>();
  const uniqueSlug = (name: string) => {
    const base = artistSlug(name) || 'artist';
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen + 1}`;
  };

  return [...byName.entries()]
    .filter(([, list]) => list.length >= minPerformances)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'ko'))
    .map(([name, list]) => ({
      name,
      slug: uniqueSlug(name),
      performances: [...list].sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? '')),
    }));
}

/** Every distinct cast name, including singletons — used for coverage stats. */
export function castCoverage(snapshot: Snapshot) {
  const names = new Set<string>();
  let withCast = 0;
  for (const p of snapshot.performances) {
    if (p.cast?.length) {
      withCast += 1;
      for (const n of p.cast) names.add(n.trim());
    }
  }
  return {
    performancesWithCast: withCast,
    distinctNames: names.size,
    coverage: snapshot.performances.length ? withCast / snapshot.performances.length : 0,
  };
}
