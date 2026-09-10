import { describe, it, expect } from 'vitest';
import { translatePlaceTag, parseTitle } from '../src/lib/i18n/places';
import { formatSchedule, formatAgeLimit, formatPrice, formatRuntime } from '../src/lib/i18n/format';
import { romanize, romanizeAddress, romanizePersonName } from '../src/lib/i18n/romanize';

describe('translatePlaceTag', () => {
  it.each([
    ['서울', 'Seoul'],
    ['부산', 'Busan'],
    ['전남광주', 'Gwangju–Jeonnam'],
    ['대학로', 'Daehangno'],
  ])('translates Korean city %s', (ko, en) => {
    expect(translatePlaceTag(ko)).toBe(en);
  });

  it.each([
    ['일본', 'Japan'],
    ['방콕', 'Bangkok'],
    ['베트남', 'Vietnam'],
    ['중국', 'China'],
  ])('translates foreign place %s', (ko, en) => {
    expect(translatePlaceTag(ko)).toBe(en);
  });

  it('translates a country and city together', () => {
    // The tag that prompted this work.
    expect(translatePlaceTag('일본 도쿄')).toBe('Japan (Tokyo)');
    expect(translatePlaceTag('일본 치바현')).toBe('Japan (Chiba)');
    expect(translatePlaceTag('일본 오키나와')).toBe('Japan (Okinawa)');
  });

  it('translates a city with a qualifier', () => {
    expect(translatePlaceTag('서울 (앵콜)')).toBe('Seoul (Encore)');
    expect(translatePlaceTag('부산 (앵콜)')).toBe('Busan (Encore)');
  });

  it('translates a city plus district', () => {
    expect(translatePlaceTag('서울 성수')).toBe('Seoul (Seongsu)');
    expect(translatePlaceTag('제주 서귀포')).toBe('Jeju (Seogwipo)');
    expect(translatePlaceTag('창원 진해')).toBe('Changwon (Jinhae)');
  });

  it('returns null for a tag that is not a place', () => {
    // Venue names appear in the same bracket position; we must not mangle them.
    expect(translatePlaceTag('롤링홀')).toBeNull();
    expect(translatePlaceTag('공상온도')).toBeNull();
    expect(translatePlaceTag('고라니특공대')).toBeNull();
  });

  it('returns null rather than half-translating', () => {
    expect(translatePlaceTag('서울 몽향')).toBeNull();
    expect(translatePlaceTag('거제 언드')).toBeNull();
  });

  it('keeps a Latin fragment alongside a place', () => {
    expect(translatePlaceTag('KT&G 상상마당 부산')).toBeNull(); // 상상마당 is not a place
  });

  it('handles empty input', () => {
    expect(translatePlaceTag('')).toBeNull();
    expect(translatePlaceTag('   ')).toBeNull();
  });
});

describe('parseTitle', () => {
  it('lifts the place out of the title', () => {
    const r = parseTitle('TWS TOUR, 24/7: FOR: YOU [일본]');
    expect(r.title).toBe('TWS TOUR, 24/7: FOR: YOU');
    expect(r.places).toEqual(['Japan']);
    expect(r.hasUntranslated).toBe(false);
  });

  it('handles an encore tag', () => {
    const r = parseTitle('&TEAM CONCERT TOUR: BLAZE THE WAY [서울 (앵콜) ]');
    expect(r.title).toBe('&TEAM CONCERT TOUR: BLAZE THE WAY');
    expect(r.places).toEqual(['Seoul (Encore)']);
  });

  it('leaves an untranslatable tag in the title', () => {
    const r = parseTitle('라라라온 [롤링홀]');
    expect(r.title).toBe('라라라온 [롤링홀]');
    expect(r.places).toEqual([]);
    expect(r.hasUntranslated).toBe(true);
  });

  it('lifts one tag and keeps another', () => {
    const r = parseTitle('공연 [서울] [롤링홀]');
    expect(r.places).toEqual(['Seoul']);
    expect(r.title).toBe('공연 [롤링홀]');
    expect(r.hasUntranslated).toBe(true);
  });

  it('leaves a title with no tags alone', () => {
    const r = parseTitle('aespa LIVE TOUR -SYNK: COMPLaeXITY-');
    expect(r.title).toBe('aespa LIVE TOUR -SYNK: COMPLaeXITY-');
    expect(r.places).toEqual([]);
  });
});

describe('formatSchedule', () => {
  it('converts weekdays and drops redundant brackets', () => {
    expect(formatSchedule('토요일(18:00), 일요일(17:00)')).toEqual({
      text: 'Sat 18:00, Sun 17:00',
      translated: true,
    });
  });

  it('handles a weekday range', () => {
    expect(formatSchedule('화요일 ~ 금요일(20:00)').text).toBe('Tue ~ Fri 20:00');
  });

  it('handles multiple times in one bracket', () => {
    expect(formatSchedule('토요일(16:00,19:00)').text).toBe('Sat 16:00,19:00');
  });

  it('returns the original when no weekday is present', () => {
    expect(formatSchedule('별도 안내')).toEqual({ text: '별도 안내', translated: false });
  });

  it('handles empty input', () => {
    expect(formatSchedule('').text).toBe('');
    expect(formatSchedule(null).text).toBe('');
  });
});

describe('formatAgeLimit', () => {
  it.each([
    ['만 7세 이상', 'Ages 7+'],
    ['만 19세 이상', 'Ages 19+'],
    ['전체 관람가', 'All ages'],
  ])('%s → %s', (ko, en) => {
    expect(formatAgeLimit(ko)).toEqual({ text: en, translated: true });
  });

  it('returns the original for an unexpected form', () => {
    expect(formatAgeLimit('초등학생 이상').translated).toBe(false);
  });
});

describe('formatPrice', () => {
  it('translates seat tiers and currency', () => {
    expect(formatPrice('VIP석 198,000원, 일반석 154,000원').text)
      .toBe('VIP ₩198,000, General ₩154,000');
  });

  it('handles 전석 and 스탠딩', () => {
    expect(formatPrice('전석 30,000원').text).toBe('All seats ₩30,000');
    expect(formatPrice('스탠딩 88,000원').text).toBe('Standing ₩88,000');
  });

  it('prefers the longer tier name', () => {
    // 스탠딩석 must not become "Standing석".
    expect(formatPrice('스탠딩석 99,000원').text).toBe('Standing ₩99,000');
    expect(formatPrice('시야제한석 40,000원').text).toBe('Restricted view ₩40,000');
  });

  it('leaves figures exactly as filed', () => {
    expect(formatPrice('R석 143,000원').text).toContain('143,000');
  });

  it('returns the original when nothing matches', () => {
    expect(formatPrice('무료').text).toBe('Free');
  });
});

describe('formatRuntime', () => {
  it.each([
    ['2시간', '2h'],
    ['1 시간 30 분', '1h 30m'],
    ['90분', '90m'],
  ])('%s → %s', (ko, en) => {
    expect(formatRuntime(ko).text).toBe(en);
  });

  it('returns the original when unparseable', () => {
    expect(formatRuntime('미정').translated).toBe(false);
  });
});

describe('romanize', () => {
  it('applies ㄹ+ㄹ assimilation', () => {
    // "Olrimpik" was wrong; ㄹ before ㄹ reads as ll.
    expect(romanize('올림')).toBe('Ollim');
    expect(romanize('롤링홀')).toBe('Rollinghol');
  });

  it('applies ㅇ+ㄹ assimilation', () => {
    expect(romanize('종로')).toBe('Jongno');
    expect(romanize('종로구')).toBe('Jongno-gu');
  });

  it('does not split a one-syllable stem off a suffix', () => {
    // 종로 is a place, not 종 + the road suffix -ro.
    expect(romanize('종로')).not.toContain('-ro');
  });

  it('uses the official English name where one exists', () => {
    expect(romanize('올림픽공원')).toBe('Olympic Park');
    expect(romanize('세종문화회관')).toBe('Sejong Center');
    expect(romanize('킨텍스')).toBe('KINTEX');
  });

  it('returns null when there is no Hangul', () => {
    expect(romanize('KINTEX')).toBeNull();
    expect(romanize('')).toBeNull();
    expect(romanize(null)).toBeNull();
  });
});

describe('romanizeAddress', () => {
  const provinces = { 서울특별시: 'Seoul', 부산광역시: 'Busan', 경기도: 'Gyeonggi' };

  it('romanises a full street address', () => {
    expect(romanizeAddress('서울특별시 송파구 올림픽로 424 올림픽공원 (방이동)', provinces))
      .toBe('Seoul Songpa-gu Olympic-ro 424 Olympic Park (Bangi-dong)');
  });

  it('capitalises inside brackets', () => {
    // A leading "(" used to swallow the capital: "(bangi-dong)".
    expect(romanizeAddress('서울특별시 강남구 도산대로 535 (청담동)', provinces))
      .toBe('Seoul Gangnam-gu Dosan-daero 535 (Cheongdam-dong)');
  });

  it('handles a province with districts', () => {
    expect(romanizeAddress('경기도 고양시 일산서구 대화동', provinces))
      .toBe('Gyeonggi Goyang-si Ilsanseo-gu Daehwa-dong');
  });

  it('returns null for empty input', () => {
    expect(romanizeAddress('', provinces)).toBeNull();
    expect(romanizeAddress(null, provinces)).toBeNull();
  });
});

describe('romanizePersonName', () => {
  it('uses the conventional surname spelling', () => {
    // "Gim Chaewon" would be the letter reading; nobody writes it that way.
    expect(romanizePersonName('김채원')).toBe('Kim Chaewon');
    expect(romanizePersonName('이동해')).toBe('Lee Donghae');
    // Revised Romanisation, not a personal preference: an idol may spell it
    // "Sooyoung" officially, but that is information we do not have.
    expect(romanizePersonName('박수영')).toBe('Park Suyeong');
    // Surnames follow convention (최 → Choi), given names follow Revised
    // Romanisation (정은 → Jeongeun, not the colloquial "Jungeun").
    expect(romanizePersonName('최정은')).toBe('Choi Jeongeun');
  });

  it('handles a two-syllable surname', () => {
    expect(romanizePersonName('남궁민')).toBe('Namgoong Min');
  });

  it('falls back to a plain reading for a non-Korean name', () => {
    // A Japanese member's name transliterated into Hangul is not Surname+Given.
    expect(romanizePersonName('미야와키 사쿠라')).not.toContain('Kim');
  });

  it('returns null for empty input', () => {
    expect(romanizePersonName('')).toBeNull();
    expect(romanizePersonName(null)).toBeNull();
  });
});
