/**
 * Map links (AC19).
 *
 * Links only — never an embed. An embedded map would fetch from Google on page
 * load, which AC08 forbids and NFR07 cannot afford. A link costs nothing, needs
 * no API key, and on a phone opens the map app the visitor already uses.
 *
 * Both Google and Naver are offered because Google Maps cannot give driving
 * directions inside Korea (export restrictions on mapping data), so visitors
 * who actually travel here end up needing a Korean map app.
 */

export interface MapLinks {
  google: string;
  naver: string;
  coords: string;
}

export function mapLinks(
  lat: number | null | undefined,
  lon: number | null | undefined,
  name?: string,
): MapLinks | null {
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const pair = `${lat},${lon}`;
  // Naver resolves a Korean venue name far better than a raw coordinate.
  const naverQuery = name ? encodeURIComponent(name) : pair;

  return {
    google: `https://www.google.com/maps/search/?api=1&query=${pair}`,
    naver: `https://map.naver.com/p/search/${naverQuery}`,
    coords: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
  };
}
