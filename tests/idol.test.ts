import { describe, it, expect } from 'vitest';
import { groupsNamedIn, soloistsNamedIn, soloistByCastEntry, GROUPS } from '../src/lib/idol';

const ids = (text: string) => groupsNamedIn(text).map((g) => g.id).sort();

describe('alias boundaries', () => {
  it('does not let IVE match inside LIVE / DRIVE / FIVE', () => {
    expect(ids('N.Flying LIVE, &CON5: into REM')).not.toContain('ive');
    expect(ids('FIVE NIGHTS')).not.toContain('ive');
    expect(ids('DRIVE ME CRAZY')).not.toContain('ive');
  });

  it('still matches IVE when it is the act', () => {
    expect(ids('IVE THE 2ND WORLD TOUR')).toContain('ive');
  });

  it('does not let EXO match inside EXODUS', () => {
    expect(ids('EXODUS FESTIVAL')).not.toContain('exo');
    expect(ids('EXO PLANET #6, EXhOrizon')).toContain('exo');
  });

  it('does not let TWS match inside a longer token', () => {
    expect(ids('BETWSEEN')).not.toContain('tws');
    expect(ids('TWS TOUR, 24/7: FOR: YOU')).toContain('tws');
  });

  it('prefers the longer alias so NCT DREAM is not NCT 127', () => {
    expect(ids('NCT DREAM TOUR')).toEqual(['nct-dream']);
    expect(ids('NCT 127 5TH TOUR, NEO CITY')).toEqual(['nct-127']);
  });

  it('matches aliases containing punctuation', () => {
    expect(ids('&TEAM CONCERT TOUR: BLAZE THE WAY')).toContain('and-team');
    expect(ids('(G)I-DLE WORLD TOUR')).toContain('gidle');
    expect(ids('fromis_9 CONCERT')).toContain('fromis9');
  });

  it('matches Korean aliases as substrings', () => {
    expect(ids('세븐틴의 앙코르 콘서트')).toContain('seventeen');
    expect(ids('르세라핌 팬미팅')).toContain('le-sserafim');
  });

  it('is case-insensitive', () => {
    expect(ids('twice world tour')).toContain('twice');
    expect(ids('Stray Kids World Tour: RUN IT')).toContain('stray-kids');
  });

  it('finds several groups on a joint bill', () => {
    const r = ids('TWICE X ITZY SPECIAL STAGE');
    expect(r).toContain('twice');
    expect(r).toContain('itzy');
  });

  it('returns nothing for a non-idol title', () => {
    expect(ids('재즈브릿지 컴퍼니 정기공연')).toEqual([]);
    expect(ids('두시 음악 살롱, 컨트리공방 (9월)')).toEqual([]);
    expect(ids('제5회 전주미니재즈페스티벌')).toEqual([]);
  });

  it('handles empty input', () => {
    expect(groupsNamedIn('')).toEqual([]);
  });
});

describe('registry integrity', () => {
  it('has unique ids', () => {
    const seen = new Set(GROUPS.map((g) => g.id));
    expect(seen.size).toBe(GROUPS.length);
  });

  it('gives every group at least one alias', () => {
    for (const g of GROUPS) expect(g.aliases.length).toBeGreaterThan(0);
  });

  it('has no alias shorter than two characters', () => {
    // A one-character alias would match almost any title.
    for (const g of GROUPS) {
      for (const a of g.aliases) expect(a.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('regressions found in live data', () => {
  it('does not read trot singer 이찬원 as SEVENTEEN via DINO', () => {
    // 이찬 (DINO) is a substring of 이찬원. This wrongly claimed 17 performances.
    expect(ids('이찬원 콘서트: 찬가')).toEqual([]);
    expect(soloistsNamedIn('이찬원 콘서트')).toEqual([]);
  });

  it('does not read 웨이브투어스 as TWS', () => {
    // 투어스 (TWS) is a substring of 웨이브투어스, a different act entirely —
    // and its cast was polluting the derived TWS roster.
    expect(ids('웨이브투어스 서울 단독 콘서트')).toEqual([]);
  });

  it('still matches the real TWS', () => {
    expect(ids('TWS TOUR, 24/7: FOR: YOU')).toContain('tws');
  });

  it('allows a Korean particle after a group name', () => {
    expect(ids('세븐틴의 앙코르 콘서트')).toContain('seventeen');
    expect(ids('트와이스와 친구들')).toContain('twice');
  });

  it('rejects a group name followed by another syllable', () => {
    // Not a particle — a different word.
    expect(ids('아이브라더스 공연')).not.toContain('ive');
  });

  it('matches a soloist stage name only as a whole token', () => {
    expect(soloistsNamedIn('DONGHAE 1ST SOLO ENCORE CONCERT').map((s) => s.id)).toEqual(['donghae']);
    expect(soloistsNamedIn('DINOSAUR SHOW')).toEqual([]);
  });

  it('resolves a cast entry only on an exact match', () => {
    expect(soloistByCastEntry('이찬')?.id).toBe('dino');
    expect(soloistByCastEntry('이찬원')).toBeUndefined();
    expect(soloistByCastEntry('이동해')?.id).toBe('donghae');
  });
});
