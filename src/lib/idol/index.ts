/**
 * Idol classification and the group → member hierarchy.
 *
 * KOPIS genre CCCD ("popular music") is not "idol": jazz salons, trot, indie
 * club nights and acoustic sessions all share the code, and agency name alone
 * misfires (Antenna produces PEPPERTONES; IST turned up on a wine gala). So a
 * performance counts as idol only when a registered group or one of its members
 * is actually named.
 *
 * Members are derived, not curated: a group's own performance lists every member
 * in `prfcast` (SP05 §2). We only trust that list from a performance that matches
 * exactly one group and is not a festival — otherwise guests contaminate it.
 */
import type { Performance, Snapshot } from '../data';
import registry from '../../../data/artists/kpop-groups.json';

/** Korean particles that may follow a name without changing it. */
const PARTICLES = ['은', '는', '이', '가', '의', '을', '를', '와', '과', '도', '에', '서', '로', '으로', '만', '부터', '까지', '랑', '이랑'];

export interface Group {
  id: string;
  en: string;
  ko: string;
  aliases: string[];
  agency: string;
  fandom: string | null;
}

export interface Soloist {
  id: string;
  en: string;
  ko: string;
  /** Stage names — matched anywhere in a title or cast string. */
  aliases: string[];
  /**
   * The name KOPIS records. Matched ONLY against a complete cast entry, never
   * as a substring: 이찬 (DINO) is contained in trot singer 이찬원.
   */
  legalNames: string[];
  /** The group this member belongs to. */
  group: string;
}

export const GROUPS: Group[] = (registry as { groups: Group[] }).groups;

/**
 * Members who headline under their own name.
 *
 * Required because a solo bill names the member, not the group — "DONGHAE 1ST
 * SOLO ENCORE CONCERT" contains no group alias — and the group's own `prfcast`
 * is frequently empty, so the roster cannot always be derived from data.
 */
export const SOLOISTS: Soloist[] = (registry as { soloists?: Soloist[] }).soloists ?? [];

const SOLO_ALIASES: Array<{ alias: string; solo: Soloist; re: RegExp }> = SOLOISTS.flatMap((solo) =>
  solo.aliases.map((alias) => ({ alias, solo, re: aliasPattern(alias) })),
).sort((a, b) => b.alias.length - a.alias.length);

/** Soloists whose stage name appears in the given text. */
export function soloistsNamedIn(text: string): Soloist[] {
  if (!text) return [];
  const found = new Map<string, Soloist>();
  for (const { solo, re } of SOLO_ALIASES) {
    if (!found.has(solo.id) && re.test(text)) found.set(solo.id, solo);
  }
  return [...found.values()];
}

/**
 * Soloist for an exact cast entry.
 * Whole-value comparison only — this is what keeps 이찬원 out of DINO.
 */
export function soloistByCastEntry(entry: string): Soloist | undefined {
  const name = entry.trim();
  if (!name) return undefined;
  return SOLOISTS.find(
    (s) =>
      s.legalNames.some((n) => n === name) ||
      s.aliases.some((a) => a.toLowerCase() === name.toLowerCase()),
  );
}

export const groupById = (id: string): Group | undefined => GROUPS.find((g) => g.id === id);

/** Alias → group, with the longest alias first so "NCT DREAM" wins over "NCT". */
const ALIASES: Array<{ alias: string; group: Group; re: RegExp }> = GROUPS.flatMap((group) =>
  group.aliases.map((alias) => ({ alias, group, re: aliasPattern(alias) })),
).sort((a, b) => b.alias.length - a.alias.length);

/**
 * Build a matcher for one alias.
 *
 * Two different hazards:
 *  - Short Latin aliases: a bare "IVE" hits LIVE/DRIVE/FIVE, "EXO" hits EXODUS.
 *  - Hangul has no word boundary in JS regex, so a substring match on a personal
 *    name is dangerous: "이찬" (DINO) matched trot singer 이찬원 across 17
 *    performances before this guard existed.
 *
 * So both scripts get a boundary. For Hangul the trailing boundary also accepts
 * a particle, since "세븐틴의 콘서트" is still SEVENTEEN.
 */
function aliasPattern(alias: string): RegExp {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const startsAlnum = /^[A-Za-z0-9]/.test(alias);
  const endsAlnum = /[A-Za-z0-9]$/.test(alias);
  const startsHangul = /^[가-힣]/.test(alias);
  const endsHangul = /[가-힣]$/.test(alias);

  let left = '';
  if (startsAlnum) left = '(?<![A-Za-z0-9])';
  else if (startsHangul) left = '(?<![가-힣])';

  let right = '';
  if (endsAlnum) right = '(?![A-Za-z0-9])';
  else if (endsHangul) {
    const particles = PARTICLES.join('|');
    right = `(?:(?![가-힣])|(?=(?:${particles})(?![가-힣])))`;
  }

  return new RegExp(`${left}${escaped}${right}`, 'i');
}

/** Groups named in a string (title or cast), longest alias winning. */
export function groupsNamedIn(text: string): Group[] {
  if (!text) return [];
  const found = new Map<string, Group>();
  let remaining = text;
  for (const { group, re } of ALIASES) {
    if (found.has(group.id)) continue;
    if (re.test(remaining)) {
      found.set(group.id, group);
      // Remove the hit so a shorter alias inside it cannot match separately.
      remaining = remaining.replace(re, ' ');
    }
  }
  return [...found.values()];
}

export interface MemberRoster {
  /** group id → member names exactly as KOPIS recorded them. */
  byGroup: Map<string, Set<string>>;
  /** member name → group ids they appear under. */
  ownerOf: Map<string, Set<string>>;
}

/**
 * Derive member names from performances that unambiguously belong to one group.
 * A festival or a joint bill would mix in other acts, so both are skipped.
 */
export function deriveMembers(snapshot: Snapshot): MemberRoster {
  const byGroup = new Map<string, Set<string>>();
  const ownerOf = new Map<string, Set<string>>();

  for (const p of snapshot.performances) {
    if (p.isFestival) continue;
    const named = groupsNamedIn(p.title);
    if (named.length !== 1) continue;
    const cast = p.cast ?? [];
    // A single-group bill with a huge cast is almost certainly a showcase or
    // a joint event mislabelled; treat it as unreliable.
    if (cast.length === 0 || cast.length > 15) continue;

    const gid = named[0].id;
    if (!byGroup.has(gid)) byGroup.set(gid, new Set());
    for (const raw of cast) {
      const name = raw.trim();
      if (name.length < 2 || name.length > 30) continue;
      if (name.endsWith('등')) continue; // "…등" = "and others"
      byGroup.get(gid)!.add(name);
      if (!ownerOf.has(name)) ownerOf.set(name, new Set());
      ownerOf.get(name)!.add(gid);
    }
  }
  return { byGroup, ownerOf };
}

export type IdolKind = 'group' | 'member' | 'joint' | 'none';

export interface Classification {
  kind: IdolKind;
  /** Groups this performance belongs to. */
  groups: Group[];
  /** For a member performance, the cast names that resolved to a group. */
  members: string[];
}

/**
 * Classify one performance.
 *
 * - `group`  the group itself is billed (title names exactly one group)
 * - `member` no group in the title, but a known member is in the cast —
 *            a solo concert, a unit show, a fan-con
 * - `joint`  more than one group billed
 * - `none`   not an idol performance as far as the registry can tell
 */
export function classify(p: Performance, roster: MemberRoster): Classification {
  const titled = groupsNamedIn(p.title);
  if (titled.length === 1) return { kind: 'group', groups: titled, members: [] };
  if (titled.length > 1) return { kind: 'joint', groups: titled, members: [] };

  const groups = new Map<string, Group>();
  const members = new Set<string>();

  // Stage name in the title — "DONGHAE 1ST SOLO ENCORE CONCERT" names no group.
  for (const solo of soloistsNamedIn(p.title)) {
    const g = groupById(solo.group);
    if (!g) continue;
    groups.set(g.id, g);
    members.add(solo.en);
  }

  // Cast entries are compared whole, never as substrings.
  for (const raw of p.cast ?? []) {
    const name = raw.trim();

    const solo = soloistByCastEntry(name);
    if (solo) {
      const g = groupById(solo.group);
      if (g) {
        groups.set(g.id, g);
        members.add(solo.en);
      }
      continue;
    }

    // Otherwise fall back to a member name derived from group cast listings.
    const owners = roster.ownerOf.get(name);
    if (!owners) continue;
    members.add(name);
    for (const gid of owners) {
      const g = groupById(gid);
      if (g) groups.set(gid, g);
    }
  }

  if (groups.size > 0) {
    return { kind: 'member', groups: [...groups.values()], members: [...members] };
  }
  return { kind: 'none', groups: [], members: [] };
}

/** Display name → the group it belongs to, for soloist entries. */
export const soloistByName = (name: string): Soloist | undefined =>
  SOLOISTS.find((s) => s.en === name);

export interface GroupEntry {
  group: Group;
  /** Performances billed to the group itself. */
  groupPerformances: Performance[];
  /** Solo / unit performances by members, keyed by member name. */
  memberPerformances: Map<string, Performance[]>;
  /** Every member name known for this group. */
  members: string[];
  total: number;
}

/** Idol performances only, plus the group → group/member breakdown. */
export function buildIdolIndex(snapshot: Snapshot) {
  const roster = deriveMembers(snapshot);
  const entries = new Map<string, GroupEntry>();
  const idolPerformances: Performance[] = [];

  const entryFor = (group: Group): GroupEntry => {
    if (!entries.has(group.id)) {
      // Members come from two places: names derived from the group's own cast
      // listings, and registered soloists. Neither alone is complete.
      const derived = [...(roster.byGroup.get(group.id) ?? [])];
      const registered = SOLOISTS.filter((s) => s.group === group.id).map((s) => s.en);
      const all = [...new Set([...registered, ...derived])];
      entries.set(group.id, {
        group,
        groupPerformances: [],
        memberPerformances: new Map(),
        members: all.sort((a, b) => a.localeCompare(b, 'ko')),
        total: 0,
      });
    }
    return entries.get(group.id)!;
  };

  for (const p of snapshot.performances) {
    const c = classify(p, roster);
    if (c.kind === 'none') continue;
    idolPerformances.push(p);

    for (const g of c.groups) {
      const e = entryFor(g);
      e.total += 1;
      if (c.kind === 'member') {
        for (const name of c.members) {
          // A name may reach us as a derived roster entry or as a registered
          // soloist; either is a valid link to this group.
          const viaRoster = roster.ownerOf.get(name)?.has(g.id) ?? false;
          const viaSoloist = soloistByName(name)?.group === g.id;
          if (!viaRoster && !viaSoloist) continue;
          if (!e.memberPerformances.has(name)) e.memberPerformances.set(name, []);
          e.memberPerformances.get(name)!.push(p);
        }
      } else {
        e.groupPerformances.push(p);
      }
    }
  }

  const byDate = (a: Performance, b: Performance) =>
    (a.startDate ?? '').localeCompare(b.startDate ?? '');
  for (const e of entries.values()) {
    e.groupPerformances.sort(byDate);
    for (const list of e.memberPerformances.values()) list.sort(byDate);
  }

  return {
    roster,
    /** Groups that actually have a performance in this snapshot. */
    groups: [...entries.values()].sort((a, b) => b.total - a.total || a.group.en.localeCompare(b.group.en)),
    idolPerformances: idolPerformances.sort(byDate),
  };
}
