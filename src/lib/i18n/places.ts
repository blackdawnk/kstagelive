/**
 * Place names, Revised Romanisation (국립국어원) for Korean cities and the
 * common English name for foreign ones.
 *
 * KOPIS puts the tour city in the title as a bracketed tag — "TWS TOUR, 24/7:
 * FOR: YOU [일본]" — which leaves Korean text sitting in an English listing.
 * The set is finite (100 distinct tags across the live snapshot), so these can
 * be translated exactly rather than guessed at.
 *
 * A tag that is not a place (a venue name, "패키지") is deliberately absent:
 * unmatched tags stay in the title untouched rather than being mangled.
 */

/** Korean cities and districts. */
const KOREA: Record<string, string> = {
  서울: 'Seoul',
  부산: 'Busan',
  대구: 'Daegu',
  인천: 'Incheon',
  광주: 'Gwangju',
  대전: 'Daejeon',
  울산: 'Ulsan',
  세종: 'Sejong',
  제주: 'Jeju',
  고양: 'Goyang',
  전주: 'Jeonju',
  수원: 'Suwon',
  김해: 'Gimhae',
  성남: 'Seongnam',
  창원: 'Changwon',
  춘천: 'Chuncheon',
  원주: 'Wonju',
  평택: 'Pyeongtaek',
  청주: 'Cheongju',
  강릉: 'Gangneung',
  용인: 'Yongin',
  부천: 'Bucheon',
  의정부: 'Uijeongbu',
  여수: 'Yeosu',
  익산: 'Iksan',
  천안: 'Cheonan',
  화성: 'Hwaseong',
  파주: 'Paju',
  거제: 'Geoje',
  진주: 'Jinju',
  안동: 'Andong',
  하남: 'Hanam',
  경주: 'Gyeongju',
  공주: 'Gongju',
  예산: 'Yesan',
  당진: 'Dangjin',
  연천: 'Yeoncheon',
  영천: 'Yeongcheon',
  안산: 'Ansan',
  김천: 'Gimcheon',
  광양: 'Gwangyang',
  순천: 'Suncheon',
  군포: 'Gunpo',
  서천: 'Seocheon',
  창녕: 'Changnyeong',
  동해: 'Donghae',
  금산: 'Geumsan',
  청양: 'Cheongyang',
  남원: 'Namwon',
  남양주: 'Namyangju',
  시흥: 'Siheung',
  군위: 'Gunwi',
  이천: 'Icheon',
  여주: 'Yeoju',
  아산: 'Asan',
  속초: 'Sokcho',
  계룡: 'Gyeryong',
  장성: 'Jangseong',
  사천: 'Sacheon',
  울진: 'Uljin',
  구미: 'Gumi',
  정선: 'Jeongseon',
  포천: 'Pocheon',
  담양: 'Damyang',
  군산: 'Gunsan',
  밀양: 'Miryang',
  고령: 'Goryeong',
  전남광주: 'Gwangju–Jeonnam',
  대학로: 'Daehangno',
  서귀포: 'Seogwipo',
  진해: 'Jinhae',
  강서: 'Gangseo',
  강동: 'Gangdong',
  마포: 'Mapo',
  성수: 'Seongsu',
  경기: 'Gyeonggi',
};

/** Foreign places, using the name an English speaker would search for. */
const ABROAD: Record<string, string> = {
  일본: 'Japan',
  도쿄: 'Tokyo',
  치바현: 'Chiba',
  치바: 'Chiba',
  가나가와: 'Kanagawa',
  오키나와: 'Okinawa',
  오사카: 'Osaka',
  나고야: 'Nagoya',
  후쿠오카: 'Fukuoka',
  삿포로: 'Sapporo',
  중국: 'China',
  베트남: 'Vietnam',
  방콕: 'Bangkok',
  타이베이: 'Taipei',
  홍콩: 'Hong Kong',
  싱가포르: 'Singapore',
  마카오: 'Macau',
  자카르타: 'Jakarta',
  마닐라: 'Manila',
  쿠알라룸푸르: 'Kuala Lumpur',
};

/** Modifiers that appear alongside a city. */
const QUALIFIERS: Record<string, string> = {
  앵콜: 'Encore',
  앙코르: 'Encore',
  단독: 'Solo',
  추가: 'Additional',
  패키지: 'Package',
  서울대공원: 'Seoul Grand Park',
};

const PLACES: Record<string, string> = { ...KOREA, ...ABROAD };

/**
 * Translate one bracketed tag.
 * Returns null when nothing in it is a known place, so the caller can leave the
 * original text alone instead of showing a half-translated string.
 */
export function translatePlaceTag(tag: string): string | null {
  const raw = tag.trim();
  if (!raw) return null;

  // "서울 (앵콜)" → parts ["서울", "앵콜"]
  const parts = raw
    .replace(/[()]/g, ' ')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const out: string[] = [];
  let matchedPlace = false;

  for (const part of parts) {
    const place = PLACES[part];
    if (place) {
      out.push(place);
      matchedPlace = true;
      continue;
    }
    const qual = QUALIFIERS[part];
    if (qual) {
      out.push(qual);
      continue;
    }
    // Unknown fragment: only keep it if it is already Latin script.
    if (!/[가-힣]/.test(part)) {
      out.push(part);
      continue;
    }
    return null; // Korean text we cannot translate — leave the tag as it was.
  }

  if (!matchedPlace) return null;

  // "Seoul Encore" reads better as "Seoul (Encore)".
  const [first, ...rest] = out;
  return rest.length > 0 ? `${first} (${rest.join(', ')})` : first;
}

export interface ParsedTitle {
  /** Title with translatable place tags removed. */
  title: string;
  /** Translated place labels, in the order they appeared. */
  places: string[];
  /** True when a tag was left in place because it was not a known place. */
  hasUntranslated: boolean;
}

/**
 * Split a KOPIS title into a clean title plus English place labels.
 *
 * The title itself is never rewritten — a tag is either lifted out whole or
 * left exactly as it was. That keeps the remaining string faithful to the
 * official record, which is what a visitor needs to search a ticket site.
 */
export function parseTitle(title: string): ParsedTitle {
  const places: string[] = [];
  let hasUntranslated = false;

  const stripped = title.replace(/\s*\[([^\]]{1,40})\]/g, (match, tag: string) => {
    const label = translatePlaceTag(tag);
    if (label === null) {
      hasUntranslated = true;
      return match;
    }
    places.push(label);
    return '';
  });

  return { title: stripped.trim().replace(/\s{2,}/g, ' '), places, hasUntranslated };
}
