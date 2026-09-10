/**
 * Field-level translation for KOPIS free-text values.
 *
 * Each of these is a closed pattern, verified against the live snapshot, so it
 * can be translated exactly — unlike a performance or venue name, which stays
 * in Korean. Anything that does not match its pattern is returned unchanged
 * rather than half-converted.
 */

const WEEKDAYS: Record<string, string> = {
  월요일: 'Mon',
  화요일: 'Tue',
  수요일: 'Wed',
  목요일: 'Thu',
  금요일: 'Fri',
  토요일: 'Sat',
  일요일: 'Sun',
  월: 'Mon',
  화: 'Tue',
  수: 'Wed',
  목: 'Thu',
  금: 'Fri',
  토: 'Sat',
  일: 'Sun',
};

/** Seat tiers, in longest-first order so "스탠딩석" beats "스탠딩". */
const SEAT_TIERS: Array<[string, string]> = [
  ['시야제한석', 'Restricted view'],
  ['스탠딩석', 'Standing'],
  ['스탠딩', 'Standing'],
  ['지정석', 'Reserved'],
  ['일반석', 'General'],
  ['전석', 'All seats'],
  ['1층석', '1F'],
  ['2층석', '2F'],
  ['3층석', '3F'],
  ['VIP석', 'VIP'],
  ['SR석', 'SR'],
  ['FS석', 'FS'],
  ['GA석', 'GA'],
  ['R석', 'R'],
  ['S석', 'S'],
  ['A석', 'A'],
  ['B석', 'B'],
  ['C석', 'C'],
  ['P석', 'P'],
  ['G석', 'G'],
];

/**
 * "토요일(18:00), 일요일(17:00)" → "Sat 18:00, Sun 17:00"
 *
 * RISK10: the field is free text. If no weekday is recognised the original is
 * returned so a visitor sees the official wording rather than a bad guess.
 */
export function formatSchedule(raw: string | null | undefined): { text: string; translated: boolean } {
  const s = (raw ?? '').trim();
  if (!s) return { text: '', translated: false };

  let hit = false;
  let out = s;

  // Longest keys first: 월요일 before 월.
  for (const ko of Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length)) {
    const re = new RegExp(ko, 'g');
    if (re.test(out)) {
      out = out.replace(re, WEEKDAYS[ko]);
      hit = true;
    }
  }
  if (!hit) return { text: s, translated: false };

  // "Sat(18:00)" reads better as "Sat 18:00"; drop the now-redundant brackets.
  out = out.replace(/\s*\(\s*([\d:,\s]+)\s*\)/g, ' $1').replace(/\s{2,}/g, ' ').trim();
  return { text: out, translated: true };
}

/** "만 7세 이상" → "Ages 7+" · "전체 관람가" → "All ages" */
export function formatAgeLimit(raw: string | null | undefined): { text: string; translated: boolean } {
  const s = (raw ?? '').trim();
  if (!s) return { text: '', translated: false };
  if (/전체\s*관람가/.test(s)) return { text: 'All ages', translated: true };
  const m = s.match(/만\s*(\d{1,2})\s*세\s*이상/);
  if (m) return { text: `Ages ${m[1]}+`, translated: true };
  return { text: s, translated: false };
}

/**
 * "VIP석 198,000원, 일반석 154,000원" → "VIP ₩198,000, General ₩154,000"
 *
 * The won sign goes in front of the figure, the way a dollar amount is written,
 * because that is the form an overseas visitor reads without thinking. Figures
 * themselves are left exactly as filed.
 */
export function formatPrice(raw: string | null | undefined): { text: string; translated: boolean } {
  const s = (raw ?? '').trim();
  if (!s) return { text: '', translated: false };

  let out = s;
  let hit = false;

  for (const [ko, en] of SEAT_TIERS) {
    if (out.includes(ko)) {
      out = out.split(ko).join(en);
      hit = true;
    }
  }

  if (/무료/.test(out)) {
    out = out.split('무료').join('Free');
    hit = true;
  }

  // "198,000원" → "₩198,000"
  if (/원/.test(out)) {
    out = out.replace(/([\d,]+)\s*원/g, '₩$1').replace(/\s*원/g, ' KRW');
    hit = true;
  }

  if (!hit) return { text: s, translated: false };
  return { text: out.replace(/\s{2,}/g, ' ').trim(), translated: true };
}

/** "1 시간 30 분" → "1h 30m"; "2시간" → "2h" */
export function formatRuntime(raw: string | null | undefined): { text: string; translated: boolean } {
  const s = (raw ?? '').trim();
  if (!s) return { text: '', translated: false };
  const h = s.match(/(\d+)\s*시간/);
  const m = s.match(/(\d+)\s*분/);
  if (!h && !m) return { text: s, translated: false };
  const parts: string[] = [];
  if (h) parts.push(`${h[1]}h`);
  if (m) parts.push(`${m[1]}m`);
  return { text: parts.join(' '), translated: true };
}
