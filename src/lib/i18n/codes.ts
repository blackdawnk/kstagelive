/**
 * Fixed English dictionaries for KOPIS coded values (D08 / AC15).
 *
 * Policy: coded values are translated from a closed dictionary; proper nouns
 * (performance titles, venue names, cast) are NEVER translated — they stay in
 * Korean so a visitor can paste them into a Korean ticket site and search.
 *
 * Every key here was observed in live API responses on 2026-09-09, not copied
 * from the code manual. That matters: the manual lists 광주광역시, but the live
 * data returns 전남광주통합특별시. Guessing would have shipped a wrong label.
 *
 * An unknown value must fail the build rather than render blank — see
 * `assertKnown`. Silent gaps are worse than a red build.
 */

/** Region names as they appear in the `area` response field. */
export const AREA_EN: Readonly<Record<string, string>> = Object.freeze({
  서울특별시: 'Seoul',
  부산광역시: 'Busan',
  대구광역시: 'Daegu',
  인천광역시: 'Incheon',
  대전광역시: 'Daejeon',
  울산광역시: 'Ulsan',
  세종특별자치시: 'Sejong',
  전남광주통합특별시: 'Gwangju–Jeonnam',
  광주광역시: 'Gwangju',
  경기도: 'Gyeonggi',
  강원특별자치도: 'Gangwon',
  충청북도: 'Chungbuk',
  충청남도: 'Chungnam',
  전북특별자치도: 'Jeonbuk',
  전라북도: 'Jeonbuk',
  전라남도: 'Jeonnam',
  경상북도: 'Gyeongbuk',
  경상남도: 'Gyeongnam',
  제주특별자치도: 'Jeju',
});

/** Genre names as they appear in the `genrenm` response field. */
export const GENRE_EN: Readonly<Record<string, string>> = Object.freeze({
  대중음악: 'Popular music',
  '서양음악(클래식)': 'Classical',
  '한국음악(국악)': 'Korean traditional',
  연극: 'Play',
  뮤지컬: 'Musical',
  '무용(서양/한국무용)': 'Dance',
  대중무용: 'Popular dance',
  '서커스/마술': 'Circus & magic',
  복합: 'Multidisciplinary',
});

/** Genre request codes (`shcate`). */
export const GENRE_CODE = Object.freeze({
  PLAY: 'AAAA',
  DANCE: 'BBBC',
  POPULAR_DANCE: 'BBBE',
  CLASSICAL: 'CCCA',
  KOREAN_TRADITIONAL: 'CCCC',
  /** K-pop concerts, fan meetings and festivals live here. */
  POPULAR_MUSIC: 'CCCD',
  MULTIDISCIPLINARY: 'EEEA',
  CIRCUS_MAGIC: 'EEEB',
  MUSICAL: 'GGGA',
} as const);

/** Performance status as it appears in the `prfstate` response field. */
export const STATE_EN: Readonly<Record<string, string>> = Object.freeze({
  공연예정: 'Upcoming',
  공연중: 'Now running',
  공연완료: 'Ended',
});

/** Machine-friendly status slug, for CSS hooks and filters. */
export const STATE_SLUG: Readonly<Record<string, 'upcoming' | 'running' | 'ended'>> = Object.freeze({
  공연예정: 'upcoming',
  공연중: 'running',
  공연완료: 'ended',
});

/** Venue character (`fcltychartr`). */
export const FACILITY_KIND_EN: Readonly<Record<string, string>> = Object.freeze({
  중앙정부: 'National government',
  문예회관: 'Arts centre',
  '기타(공공)': 'Public (other)',
  대학로: 'Daehangno district',
  '민간(대학로 외)': 'Private',
  '기타(해외등)': 'Other (incl. overseas)',
  '기타(비공연장)': 'Non-theatre venue',
});

export type Dictionary = Readonly<Record<string, string>>;

/** Collected while rendering so the build can report every gap at once. */
const unknowns = new Map<string, Set<string>>();

function record(dict: string, value: string) {
  if (!unknowns.has(dict)) unknowns.set(dict, new Set());
  unknowns.get(dict)!.add(value);
}

/**
 * Translate a coded value. Unknown values are recorded and returned verbatim so
 * a page still renders something truthful; `assertKnown()` then fails the build.
 */
export function translate(dict: Dictionary, value: string | null | undefined, dictName: string): string {
  if (value == null || value === '') return '';
  const hit = dict[value];
  if (hit !== undefined) return hit;
  record(dictName, value);
  return value;
}

export const areaEn = (v?: string | null) => translate(AREA_EN, v, 'area');
export const genreEn = (v?: string | null) => translate(GENRE_EN, v, 'genre');
export const stateEn = (v?: string | null) => translate(STATE_EN, v, 'state');
export const facilityKindEn = (v?: string | null) => translate(FACILITY_KIND_EN, v, 'facilityKind');

export const stateSlug = (v?: string | null): 'upcoming' | 'running' | 'ended' | 'unknown' =>
  (v && STATE_SLUG[v]) || 'unknown';

/** Every coded value seen so far that has no English entry. */
export function unknownValues(): Record<string, string[]> {
  return Object.fromEntries([...unknowns].map(([k, v]) => [k, [...v].sort()]));
}

export function resetUnknowns(): void {
  unknowns.clear();
}

/**
 * AC15 — fail the build when the API returns a coded value we have no entry for.
 * KOPIS adds regions and genres over time; a red build is the signal to update
 * the dictionary rather than ship a Korean string into an English page.
 */
export function assertKnown(): void {
  const gaps = unknownValues();
  const names = Object.keys(gaps);
  if (names.length === 0) return;
  const detail = names.map((n) => `  ${n}: ${gaps[n].join(', ')}`).join('\n');
  throw new Error(
    `AC15: KOPIS returned coded values with no English entry.\n${detail}\n` +
      `Add them to src/lib/i18n/codes.ts (verify against live data, not the code manual).`,
  );
}
