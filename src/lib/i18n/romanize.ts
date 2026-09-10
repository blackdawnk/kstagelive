/**
 * Hangul → Latin, following Revised Romanisation (국립국어원).
 *
 * Purpose: put an English reading next to the Korean rather than replacing it.
 * A visitor needs the Korean to paste into a map or show a taxi driver, and a
 * Latin reading to say it out loud and to recognise it in an English listing.
 *
 * Scope and honesty about it: this implements the letter mapping and the common
 * consonant assimilations. It does NOT know loanwords — 올림픽 romanises to
 * "Ollimpik" when the official sign says "Olympic" — so anything the dictionary
 * covers is looked up first, and generated readings are labelled as approximate
 * wherever they are shown.
 */

const INITIALS = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const VOWELS = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const FINALS = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];

/** Jamo indices we need for assimilation rules. */
const F_NIEUN = 4;
const F_RIEUL = 8;
const I_NIEUN = 2;
const I_RIEUL = 5;

interface Syllable {
  initial: number;
  vowel: number;
  final: number;
}

function decompose(ch: string): Syllable | null {
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return null;
  return {
    initial: Math.floor(code / 588),
    vowel: Math.floor((code % 588) / 28),
    final: code % 28,
  };
}

/** Well-known place names whose official spelling is not a letter-by-letter reading. */
const KNOWN: Record<string, string> = {
  올림픽: 'Olympic',
  올림픽로: 'Olympic-ro',
  월드컵: 'World Cup',
  센텀: 'Centum',
  디지털: 'Digital',
  테헤란: 'Teheran',
  아시아드: 'Asiad',
  엑스포: 'Expo',
  컨벤션: 'Convention',
  마이스: 'MICE',
  스타디움: 'Stadium',
  아레나: 'Arena',
  타워: 'Tower',
  센터: 'Center',
  플라자: 'Plaza',
  파크: 'Park',
  홀: 'Hall',
  올림픽공원: 'Olympic Park',
  올림픽홀: 'Olympic Hall',
  잠실종합운동장: 'Jamsil Sports Complex',
  체조경기장: 'Gymnastics Arena',
  핸드볼경기장: 'Handball Stadium',
  세종문화회관: 'Sejong Center',
  예술의전당: 'Seoul Arts Center',
  킨텍스: 'KINTEX',
  고척스카이돔: 'Gocheok Sky Dome',
  블루스퀘어: 'Blue Square',
  상상마당: 'Sangsangmadang',
  아트센터: 'Arts Center',
  문화회관: 'Culture Center',
  예술회관: 'Arts Center',
  종합운동장: 'Sports Complex',
  실내체육관: 'Indoor Stadium',
  체육관: 'Gymnasium',
  대공원: 'Grand Park',
  공원: 'Park',
};

/** Administrative suffixes, romanised with the standard hyphenation. */
const SUFFIXES: Array<[string, string]> = [
  ['특별자치시', 'Special Self-Governing City'],
  ['특별자치도', 'Special Self-Governing Province'],
  ['광역시', 'Metropolitan City'],
  ['특별시', ''],
  ['자치구', '-gu'],
  ['시', '-si'],
  ['군', '-gun'],
  ['구', '-gu'],
  ['읍', '-eup'],
  ['면', '-myeon'],
  ['동', '-dong'],
  ['리', '-ri'],
  ['대로', '-daero'],
  ['로', '-ro'],
  ['길', '-gil'],
  ['가', '-ga'],
];

/**
 * Romanise a run of Hangul, applying the assimilations that change the reading
 * most visibly: ㄱ/ㄷ/ㅂ + ㄴ/ㅁ nasalisation, ㄴ+ㄹ → ll, ㄹ+ㄴ → ll.
 */
function romanizeWord(word: string): string {
  const syllables: Array<Syllable | string> = [...word].map((ch) => decompose(ch) ?? ch);
  const out: string[] = [];
  // An assimilation can change the NEXT syllable's initial (종로 → Jong-no),
  // so rules write forward into this map.
  const overrides: Record<number, string> = {};

  for (let i = 0; i < syllables.length; i += 1) {
    const cur = syllables[i];
    if (typeof cur === 'string') {
      out.push(cur);
      continue;
    }
    const next = syllables[i + 1];
    let final = FINALS[cur.final];
    let nextInitialOverride: string | null = null;

    if (next && typeof next !== 'string') {
      const ni = next.initial;

      // Nasalisation before ㄴ/ㅁ: 국물 → Gungmul, 입니다 → imnida.
      if (final === 'k' && (ni === I_NIEUN || ni === 16)) final = 'ng';
      else if (final === 'p' && ni === I_NIEUN) final = 'm';
      else if (final === 't' && ni === I_NIEUN) final = 'n';

      // ㄴ + ㄹ and ㄹ + ㄴ both give "ll": 신라 → Silla, 올림 → Ollim.
      if (cur.final === F_NIEUN && ni === I_RIEUL) {
        final = 'l';
        nextInitialOverride = 'l';
      } else if (cur.final === F_RIEUL && ni === I_NIEUN) {
        final = 'l';
        nextInitialOverride = 'l';
      } else if (cur.final === F_RIEUL && ni === I_RIEUL) {
        // 올림픽 → Ollimpik, not "Olrimpik".
        final = 'l';
        nextInitialOverride = 'l';
      } else if (final === 'ng' && ni === I_RIEUL) {
        // 종로 → Jongno: ㄹ reads as n after ㅇ.
        nextInitialOverride = 'n';
      } else if (final === 'k' && ni === I_RIEUL) {
        // 독립 → Dongnip.
        final = 'ng';
        nextInitialOverride = 'n';
      }
    }

    const initial = overrides[i] ?? INITIALS[cur.initial];
    if (nextInitialOverride !== null) overrides[i + 1] = nextInitialOverride;
    out.push(initial + VOWELS[cur.vowel] + final);
  }

  const joined = out.join('');
  // Uppercase the first LETTER: a leading bracket used to leave "(bangi-dong)".
  return joined.replace(/[a-z]/, (c) => c.toUpperCase());
}

/**
 * Strip a known administrative suffix and romanise it separately.
 *
 * A one-syllable stem is left alone: 종로 is the place Jongno, not "Jong" plus
 * the road suffix -ro, and splitting it would also skip the ㅇ+ㄹ assimilation.
 */
function splitSuffix(token: string): { stem: string; suffix: string } {
  for (const [ko, en] of SUFFIXES) {
    if (token.length > ko.length && token.endsWith(ko)) {
      const stem = token.slice(0, -ko.length);
      if (stem.replace(/[^가-힣]/g, '').length < 2) continue;
      return { stem, suffix: en };
    }
  }
  return { stem: token, suffix: '' };
}

/** Romanise one whitespace-separated token. */
function romanizeToken(token: string): string {
  if (!/[가-힣]/.test(token)) return token;
  if (KNOWN[token]) return KNOWN[token];

  // Peel off surrounding punctuation so "(방이동)" gets suffix handling too.
  const wrapped = token.match(/^([([{"']*)(.*?)([)\]}"',.]*)$/s);
  if (wrapped && (wrapped[1] || wrapped[3]) && wrapped[2]) {
    return wrapped[1] + romanizeToken(wrapped[2]) + wrapped[3];
  }

  const { stem, suffix } = splitSuffix(token);
  if (KNOWN[stem]) {
    const base = KNOWN[stem];
    return suffix.startsWith('-') ? `${base}${suffix}` : `${base} ${suffix}`.trim();
  }

  // Keep any trailing digits attached: 424 stays 424.
  const m = stem.match(/^([가-힣]+)(.*)$/);
  if (!m) return romanizeWord(stem) + suffix;
  const [, hangul, rest] = m;
  const base = romanizeWord(hangul);
  const tail = suffix.startsWith('-') ? `${suffix}${rest}` : `${rest} ${suffix}`.trimEnd();
  return `${base}${tail}`;
}

/**
 * Romanise a whole string, leaving Latin text, digits and punctuation untouched.
 * Returns null when there was no Hangul to convert.
 */
export function romanize(text: string | null | undefined): string | null {
  const s = (text ?? '').trim();
  if (!s || !/[가-힣]/.test(s)) return null;
  const out = s
    .split(/(\s+)/)
    .map((part) => (/^\s+$/.test(part) ? part : romanizeToken(part)))
    .join('')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return out || null;
}

/**
 * Romanise an address, replacing the province/metro name with its English form
 * where we have one. Everything else is a generated reading.
 */
export function romanizeAddress(
  address: string | null | undefined,
  provinces: Record<string, string> = {},
): string | null {
  const s = (address ?? '').trim();
  if (!s) return null;

  // "서울특별시 송파구 …" — the first token is the province or metro city.
  const [first, ...rest] = s.split(/\s+/);
  const known = provinces[first];
  const head = known ?? romanizeToken(first);
  const tail = rest.map(romanizeToken).join(' ');
  const out = `${head} ${tail}`.replace(/\s{2,}/g, ' ').trim();
  return out === s ? null : out;
}

/**
 * Korean surnames use conventional spellings, not the letter mapping: 김 is
 * written Kim, never "Gim". These are the spellings a fan would recognise.
 */
const SURNAMES: Record<string, string> = {
  김: 'Kim', 이: 'Lee', 박: 'Park', 최: 'Choi', 정: 'Jung', 강: 'Kang',
  조: 'Cho', 윤: 'Yoon', 장: 'Jang', 임: 'Lim', 한: 'Han', 오: 'Oh',
  서: 'Seo', 신: 'Shin', 권: 'Kwon', 황: 'Hwang', 안: 'Ahn', 송: 'Song',
  류: 'Ryu', 전: 'Jeon', 홍: 'Hong', 고: 'Ko', 문: 'Moon', 양: 'Yang',
  손: 'Son', 배: 'Bae', 백: 'Baek', 허: 'Heo', 유: 'Yoo', 남: 'Nam',
  심: 'Shim', 노: 'Noh', 하: 'Ha', 곽: 'Kwak', 성: 'Sung', 차: 'Cha',
  주: 'Joo', 우: 'Woo', 구: 'Koo', 나: 'Na', 민: 'Min', 진: 'Jin',
  지: 'Ji', 엄: 'Eom', 채: 'Chae', 원: 'Won', 천: 'Chun', 방: 'Bang',
  공: 'Kong', 현: 'Hyun', 함: 'Ham', 변: 'Byun', 염: 'Yeom', 여: 'Yeo',
  추: 'Chu', 도: 'Do', 소: 'So', 석: 'Seok', 선: 'Sun', 설: 'Seol',
  마: 'Ma', 길: 'Gil', 연: 'Yeon', 위: 'Wi', 표: 'Pyo', 명: 'Myung',
  기: 'Ki', 반: 'Ban', 왕: 'Wang', 금: 'Keum', 옥: 'Ok', 육: 'Yook',
  인: 'In', 제: 'Je', 모: 'Mo', 봉: 'Bong', 탁: 'Tak', 국: 'Kook',
  어: 'Eo', 은: 'Eun', 편: 'Pyun', 용: 'Yong', 형: 'Hyung', 낭: 'Nang',
};

/** Two-syllable surnames, checked before the single-syllable table. */
const COMPOUND_SURNAMES: Record<string, string> = {
  남궁: 'Namgoong', 황보: 'Hwangbo', 선우: 'Sunwoo', 제갈: 'Jegal',
  독고: 'Dokgo', 사공: 'Sagong', 서문: 'Seomun',
};

/**
 * Romanise a personal name as "Surname Given".
 *
 * Only applied to a plain 2–4 syllable Korean name. Anything else — a foreign
 * member's name transliterated into Hangul, a stage name, a group — goes
 * through the generic reader, which is approximate by nature.
 */
export function romanizePersonName(name: string | null | undefined): string | null {
  const s = (name ?? '').trim();
  if (!s) return null;
  if (!/^[가-힣]{2,4}$/.test(s)) return romanize(s);

  const compound = COMPOUND_SURNAMES[s.slice(0, 2)];
  if (compound && s.length > 2) {
    const given = romanize(s.slice(2));
    return given ? `${compound} ${given}` : compound;
  }

  const surname = SURNAMES[s[0]];
  if (!surname) return romanize(s);
  const given = romanize(s.slice(1));
  return given ? `${surname} ${given}` : surname;
}
