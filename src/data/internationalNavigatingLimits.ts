/**
 * International Navigating Limits (INL) — formerly "Institute Warranty
 * Limits" (IWL), renamed and revised by the Institute of Chartered
 * Underwriters, London, effective 1 November 2003. INL defines the
 * geographical limits a vessel may trade within under standard English hull
 * insurance conditions without incurring additional premium / underwriter
 * approval. Source: Gard / Andrew Liu & Co Ltd. wording as reproduced by
 * Maritime Optima's ShipAtlas user guide
 * (https://help.maritimeoptima.com/en/articles/5909342-international-navigating-limits).
 *
 * This is a REAL, named insurance/navigation concept (not invented) — but the
 * boundaries below are transcribed from that secondary source, not the
 * primary Lloyd's/LMA wording itself, and some zones depend on conditions a
 * route generator cannot verify (vessel equipment, underwriter permission).
 * Treat `conditional` zones as advisory (surfaced as a warning), everything
 * else as a hard routing constraint.
 */

export interface InlSeasonalWindow {
  /** 1-12 */
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
}

export interface InlZone {
  id: string;
  area: string;
  label: string;
  /** Always in effect (no date window). */
  permanent: boolean;
  /** Only in effect within this month/day window each year (inclusive, may wrap the year-end). */
  seasonal?: InlSeasonalWindow;
  /** Restriction only applies above this deadweight (metric tons), e.g. the Gulf of Finland's DWT-split rule. */
  minDwt?: number;
  /** Geometry test for this zone. */
  contains: (lat: number, lon: number) => boolean;
  /**
   * True when compliance depends on conditions this engine cannot verify
   * (specific passage points, radar/GPS/GMDSS fit, underwriter permission) —
   * surfaced as an advisory warning rather than a hard block.
   */
  conditional?: boolean;
  note?: string;
}

function inRect(lat: number, lon: number, minLat: number, maxLat: number, minLon: number, maxLon: number): boolean {
  return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
}

/** Point-in-triangle via barycentric sign test (for Area 7's carved-out exception). */
function inTriangle(
  lat: number,
  lon: number,
  a: [number, number],
  b: [number, number],
  c: [number, number],
): boolean {
  const sign = (p: [number, number], q: [number, number], r: [number, number]) =>
    (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
  const p: [number, number] = [lat, lon];
  const d1 = sign(p, a, b);
  const d2 = sign(p, b, c);
  const d3 = sign(p, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

export const INL_ZONES: InlZone[] = [
  // --- Area 1: Arctic ---
  {
    id: 'inl-1a', area: 'Area 1 - Arctic', label: 'North of 70°N', permanent: true,
    contains: (lat) => lat > 70,
  },
  {
    id: 'inl-1b', area: 'Area 1 - Arctic', label: "Barents Sea (except Kola Bay/Murmansk/Norway calls) north of 72°30'N or east of 35°E",
    permanent: true,
    contains: (lat, lon) => inRect(lat, lon, 66, 85, 30, 70) && (lat > 72.5 || lon > 35),
  },
  // --- Area 2: Northern Seas ---
  {
    id: 'inl-2a', area: 'Area 2 - Northern Seas', label: 'White Sea', permanent: true,
    contains: (lat, lon) => inRect(lat, lon, 63.5, 68.5, 32, 44.5),
  },
  {
    id: 'inl-2b', area: 'Area 2 - Northern Seas', label: 'Chukchi Sea', permanent: true,
    // Crosses the antimeridian (roughly 165°E to 170°W) — lon here is always
    // canonical [-180, 180], so the wrap is an OR across 180°, not a continuous range.
    contains: (lat, lon) => lat >= 65.5 && lat <= 72 && (lon >= 165 || lon <= -170),
  },
  // --- Area 3: Baltic ---
  {
    id: 'inl-3a', area: 'Area 3 - Baltic', label: "Gulf of Bothnia north of Umea(63°50'N)/Vasa(63°06'N) line, 10 Dec - 25 May",
    permanent: false, seasonal: { startMonth: 12, startDay: 10, endMonth: 5, endDay: 25 },
    contains: (lat, lon) => inRect(lat, lon, 63, 66, 17.5, 23),
  },
  {
    id: 'inl-3b', area: 'Area 3 - Baltic', label: "Gulf of Finland east of 28°45'E, vessels ≤90,000 DWT, 15 Dec - 15 May",
    permanent: false, seasonal: { startMonth: 12, startDay: 15, endMonth: 5, endDay: 15 },
    contains: (lat, lon) => inRect(lat, lon, 59, 60.7, 28.75, 30.5),
    note: 'Only restricted for vessels of 90,000 DWT or less; larger vessels are restricted here at all times (see inl-3c).',
  },
  {
    id: 'inl-3c', area: 'Area 3 - Baltic', label: "Gulf of Finland east of 28°45'E, vessels >90,000 DWT",
    permanent: true, minDwt: 90000,
    contains: (lat, lon) => inRect(lat, lon, 59, 60.7, 28.75, 30.5),
  },
  {
    id: 'inl-3d', area: 'Area 3 - Baltic', label: 'Gulf of Bothnia/Finland and adjacent waters north of 59°24\'N (except Stockholm/Tallinn/Helsinki calls), 8 Jan - 5 May',
    permanent: false, seasonal: { startMonth: 1, startDay: 8, endMonth: 5, endDay: 5 },
    contains: (lat, lon) => lat > 59.4 && inRect(lat, lon, 59.4, 66, 17.5, 30.5),
    note: 'Does not apply to direct calls at Stockholm, Tallinn, or Helsinki — not evaluated geometrically here.',
  },
  {
    id: 'inl-3e', area: 'Area 3 - Baltic', label: "Gulf of Riga and adjacent waters east of 22°E, south of 59°N, 28 Dec - 5 May",
    permanent: false, seasonal: { startMonth: 12, startDay: 28, endMonth: 5, endDay: 5 },
    contains: (lat, lon) => lat < 59 && inRect(lat, lon, 56.5, 59, 22, 25),
  },
  // --- Area 4: Greenland territorial waters ---
  {
    id: 'inl-4', area: 'Area 4 - Greenland', label: 'Greenland territorial waters', permanent: true,
    contains: (lat, lon) => inRect(lat, lon, 59.5, 84, -73, -11),
    note: 'Approximated as Greenland\'s territorial-sea bounding box; not a precise 12 NM baseline.',
  },
  // --- Area 5: North America (east) ---
  {
    id: 'inl-5a', area: 'Area 5 - North America (east)', label: "North of 52°10'N between 50°W and 100°W", permanent: true,
    contains: (lat, lon) => lat > 52 + 10 / 60 && lon >= -100 && lon <= -50,
  },
  {
    id: 'inl-5b', area: 'Area 5 - North America (east)',
    label: 'Gulf/River St Lawrence, Strait of Belle Isle, Cabot Strait, Strait of Canso, 21 Dec - 30 Apr',
    permanent: false, seasonal: { startMonth: 12, startDay: 21, endMonth: 4, endDay: 30 },
    contains: (lat, lon) => inRect(lat, lon, 45, 52, -70, -56),
  },
  {
    id: 'inl-5c', area: 'Area 5 - North America (east)', label: 'St Lawrence River (west of Les Escoumins), 1 Dec - 30 Apr',
    permanent: false, seasonal: { startMonth: 12, startDay: 1, endMonth: 4, endDay: 30 },
    contains: (lat, lon) => inRect(lat, lon, 45, 47.5, -76, -69.5),
  },
  {
    id: 'inl-5d', area: 'Area 5 - North America (east)', label: 'St Lawrence Seaway', permanent: true,
    contains: (lat, lon) => inRect(lat, lon, 43.5, 45.5, -76.5, -73.5),
  },
  {
    id: 'inl-5e', area: 'Area 5 - North America (east)', label: 'Great Lakes', permanent: true,
    contains: (lat, lon) => inRect(lat, lon, 41, 49.5, -92.5, -76.2),
  },
  // --- Area 6: North America (west) ---
  {
    id: 'inl-6a', area: 'Area 6 - North America (west)', label: "North of 54°30'N between 100°W and 170°W", permanent: true,
    contains: (lat, lon) => lat > 54.5 && lon >= -170 && lon <= -100,
  },
  {
    id: 'inl-6b', area: 'Area 6 - North America (west)', label: 'Queen Charlotte Islands (Haida Gwaii)', permanent: true,
    contains: (lat, lon) => inRect(lat, lon, 51.8, 54.5, -133.5, -130.8),
  },
  {
    id: 'inl-6c', area: 'Area 6 - North America (west)', label: 'Aleutian Islands', permanent: true,
    // Crosses the antimeridian (roughly 172°E to 164°W).
    contains: (lat, lon) => lat >= 50.8 && lat <= 55.5 && (lon >= 172 || lon <= -164),
  },
  // --- Area 7: Southern Ocean ---
  {
    id: 'inl-7', area: 'Area 7 - Southern Ocean', label: 'South of 50°S (except the Drake Passage triangle)', permanent: true,
    contains: (lat, lon) =>
      lat < -50 && !inTriangle(lat, lon, [-50, -50], [-57, -67.5], [-50, -160]),
    note: 'Carve-out triangle vertices: 50°S/50°W, 57°S/67°30\'W, 50°S/160°W.',
  },
  // --- Area 8: Kerguelen/Crozet ---
  {
    id: 'inl-8', area: 'Area 8 - Kerguelen/Crozet', label: 'Territorial waters of Kerguelen and Crozet Islands', permanent: true,
    contains: (lat, lon) => inRect(lat, lon, -50.5, -45.5, 49.5, 70.5),
  },
  // --- Area 9: East Asia ---
  {
    id: 'inl-9a', area: 'Area 9 - East Asia', label: 'Sea of Okhotsk north of 55°N, east of 140°E, 1 Nov - 1 Jun',
    permanent: false, seasonal: { startMonth: 11, startDay: 1, endMonth: 6, endDay: 1 },
    contains: (lat, lon) => lat > 55 && lon > 140 && inRect(lat, lon, 55, 65, 140, 165),
  },
  {
    id: 'inl-9b', area: 'Area 9 - East Asia', label: 'Sea of Okhotsk north of 53°N, west of 140°E, 1 Nov - 1 Jun',
    permanent: false, seasonal: { startMonth: 11, startDay: 1, endMonth: 6, endDay: 1 },
    contains: (lat, lon) => lat > 53 && lon <= 140 && inRect(lat, lon, 53, 62, 135, 140),
  },
  {
    id: 'inl-9c', area: 'Area 9 - East Asia', label: 'East Asian waters north of 46°N, west of Kuriles/Kamchatka, 1 Dec - 1 May',
    permanent: false, seasonal: { startMonth: 12, startDay: 1, endMonth: 5, endDay: 1 },
    contains: (lat, lon) => inRect(lat, lon, 46, 56, 140, 157),
  },
  // --- Area 10: Bering Sea ---
  {
    id: 'inl-10', area: 'Area 10 - Bering Sea', label: 'Bering Sea', permanent: true, conditional: true,
    // Crosses the antimeridian (roughly 163°E to 157°W).
    contains: (lat, lon) => lat >= 52.5 && lat <= 66 && (lon >= 163 || lon <= -157),
    note:
      "Permitted on through voyages provided the vessel stays south of 54°30'N, enters/exits west of Buldir Island or via " +
      'the Amchitka, Amukta, or Unimak Pass, and carries 2 independent radars, GPS/Loran-C, radio+GMDSS, a weatherfax (or ' +
      'equivalent), a gyrocompass, and up-to-date charts/sailing directions/pilot books — none of which this engine can ' +
      'verify. Treated as advisory, not blocked.',
  },
];

function dateFallsInWindow(month: number, day: number, w: InlSeasonalWindow): boolean {
  const md = month * 100 + day;
  const start = w.startMonth * 100 + w.startDay;
  const end = w.endMonth * 100 + w.endDay;
  return start <= end ? md >= start && md <= end : md >= start || md <= end; // wraps the year-end
}

/** Zones currently in effect for the given reference date and (optional) vessel deadweight. */
export function activeInlZones(date: Date, vesselDwt?: number): InlZone[] {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return INL_ZONES.filter((z) => {
    if (z.minDwt != null && (vesselDwt == null || vesselDwt <= z.minDwt)) return false;
    if (z.permanent) return true;
    return z.seasonal ? dateFallsInWindow(month, day, z.seasonal) : false;
  });
}

/** The first currently-active INL zone containing the point, if any. */
export function inlZoneAt(lat: number, lon: number, date: Date, vesselDwt?: number): InlZone | null {
  for (const z of activeInlZones(date, vesselDwt)) {
    if (z.contains(lat, lon)) return z;
  }
  return null;
}
