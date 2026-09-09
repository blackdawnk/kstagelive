/**
 * KOPIS response → site contract (v0.7 §6).
 *
 * Rules that matter here:
 *   AC04  prfpdfrom/prfpdto are dates only. Never invent a time of day.
 *   AC09  poster / styurls are dropped entirely — licensing unverified.
 *   AC18  accessibility flags are three-state; `N` is NOT "absent" (see below).
 *   AC15  coded values are translated elsewhere, from a closed dictionary.
 */

const str = (v) => (v == null ? '' : String(v).trim());

/** "2026.09.19" → "2026-09-19". Returns null for anything unexpected. */
export function toIsoDate(value) {
  const s = str(value);
  const m = s.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/** "2019-07-25 10:03:14" / with fractional seconds → ISO-ish timestamp, or null. */
export function toIsoTimestamp(value) {
  const s = str(value);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return toIsoDate(s);
  const [, y, mo, d, h, mi, sec] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${sec}`;
}

/**
 * Three-state flag.
 *
 * KOPIS returns `Y`/`N`/empty, but SP05 §6 found that `N` means "not entered",
 * not "not present": Olympic Park reports N for every accessibility feature
 * while simultaneously reporting 22 wheelchair seats in its main hall.
 *
 * Treating N as "absent" would tell a wheelchair user a venue is inaccessible
 * when it is not. So only `Y` is affirmative; everything else is `unknown`.
 */
export function accessibilityFlag(value) {
  return str(value).toUpperCase() === 'Y' ? 'yes' : 'unknown';
}

/** Amenities use the same source encoding but carry no safety risk. */
export function amenityFlag(value) {
  const v = str(value).toUpperCase();
  if (v === 'Y') return 'yes';
  if (v === 'N') return 'no';
  return 'unknown';
}

/** Seat counts arrive as "15,000" or "" or "0". 0 usually means "not recorded". */
export function toSeatCount(value) {
  const s = str(value).replace(/,/g, '');
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Comma-separated cast list → array. Empty stays empty; we never guess. */
export function splitCast(value) {
  return str(value)
    .split(/\s*,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Coordinates are strings with long decimal tails; reject non-finite values. */
export function toCoord(value) {
  const s = str(value);
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

/** A list row from /pblprfr. */
export function normalizeListItem(raw) {
  return {
    id: str(raw.mt20id),
    title: str(raw.prfnm),
    startDate: toIsoDate(raw.prfpdfrom),
    endDate: toIsoDate(raw.prfpdto),
    venueName: str(raw.fcltynm),
    area: str(raw.area),
    genre: str(raw.genrenm),
    state: str(raw.prfstate),
    openRun: str(raw.openrun).toUpperCase() === 'Y',
  };
}

/** A detail row from /pblprfr/{id}, merged over the list row. */
export function normalizeDetail(raw) {
  const relates = raw?.relates?.relate;
  const relateList = relates == null ? [] : Array.isArray(relates) ? relates : [relates];

  return {
    id: str(raw.mt20id),
    title: str(raw.prfnm),
    venueId: str(raw.mt10id),
    hallId: str(raw.mt13id),
    venueName: str(raw.fcltynm),
    startDate: toIsoDate(raw.prfpdfrom),
    endDate: toIsoDate(raw.prfpdto),
    cast: splitCast(raw.prfcast),
    crew: splitCast(raw.prfcrew),
    runtime: str(raw.prfruntime),
    ageLimit: str(raw.prfage),
    producer: str(raw.entrpsnm),
    host: str(raw.entrpsnmH),
    organiser: str(raw.entrpsnmS),
    priceGuide: str(raw.pcseguidance),
    /** Free text such as "토요일(18:00), 일요일(17:00)". RISK10: shown verbatim. */
    scheduleGuide: str(raw.dtguidance),
    area: str(raw.area),
    genre: str(raw.genrenm),
    state: str(raw.prfstate),
    openRun: str(raw.openrun).toUpperCase() === 'Y',
    isVisiting: str(raw.visit).toUpperCase() === 'Y',
    isFestival: str(raw.festival).toUpperCase() === 'Y',
    firstRegisteredAt: toIsoTimestamp(raw.frstregdt),
    updatedAt: toIsoTimestamp(raw.updatedate),
    /** AC08: link targets only. We never request these hosts ourselves. */
    ticketLinks: relateList
      .map((r) => ({ name: str(r?.relatenm), url: str(r?.relateurl) }))
      .filter((r) => r.url && /^https?:\/\//i.test(r.url)),
    // AC09: `poster` and `styurls` are deliberately not carried over.
  };
}

/** A venue row from /prfplc/{id}. */
export function normalizeVenue(raw) {
  const halls = raw?.mt13s?.mt13;
  const hallList = halls == null ? [] : Array.isArray(halls) ? halls : [halls];

  return {
    id: str(raw.mt10id),
    name: str(raw.fcltynm),
    address: str(raw.adres),
    lat: toCoord(raw.la),
    lon: toCoord(raw.lo),
    phone: str(raw.telno),
    homepage: str(raw.relateurl),
    hallCount: toSeatCount(raw.mt13cnt),
    seatCount: toSeatCount(raw.seatscale),
    openedYear: str(raw.opende),
    kind: str(raw.fcltychartr),
    amenities: {
      restaurant: amenityFlag(raw.restaurant),
      cafe: amenityFlag(raw.cafe),
      store: amenityFlag(raw.store),
      nursingRoom: amenityFlag(raw.suyu),
      playRoom: amenityFlag(raw.nolibang),
      parking: amenityFlag(raw.parkinglot),
    },
    /** AC18 — `yes` or `unknown` only. Never `no`. See accessibilityFlag(). */
    accessibility: {
      parking: accessibilityFlag(raw.parkbarrier),
      restroom: accessibilityFlag(raw.restbarrier),
      ramp: accessibilityFlag(raw.runwbarrier),
      elevator: accessibilityFlag(raw.elevbarrier),
    },
    halls: hallList.map((h) => ({
      id: str(h?.mt13id),
      name: str(h?.prfplcnm),
      seatCount: toSeatCount(h?.seatscale),
      wheelchairSeats: toSeatCount(h?.disabledseatscale),
      stageArea: str(h?.stagearea),
    })),
  };
}
