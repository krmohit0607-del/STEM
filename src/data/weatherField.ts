/**
 * Weather "base layer" field model for the MarineTraffic-style overlay.
 *
 * Each factor carries a colour ramp + legend so the map layer can paint a
 * smooth magnitude field and (for vector factors) direction arrows.
 *
 * `sampleWeatherField()` is the single point where data enters the layer.
 * It currently synthesises a smooth, deterministic field so the overlay
 * looks realistic without a paid weather-tile provider — to use real data
 * replace its body with a lookup into a backend grid / GRIB tile, e.g.:
 *
 *   export function sampleWeatherField(lat, lon, factorId) {
 *     const cell = backendGrid.nearest(lat, lon, factorId);
 *     return { magnitude: cell.value, directionDeg: cell.dir };
 *   }
 *
 * The component code never assumes the data is synthetic, so swapping the
 * source is a one-function change.
 */

export interface FieldFactor {
  id: string;
  label: string;
  /** Font Awesome icon (without family prefix). */
  icon: string;
  unit: string;
  /** When true the layer also draws direction/magnitude arrows. */
  directional: boolean;
  /** Upper bound used to normalise magnitude to the colour ramp. */
  max: number;
  /** Colour ramp: [fraction 0..1, hex] stops in ascending order. */
  stops: Array<[number, string]>;
  /** Legend tick labels shown under the gradient bar. */
  legend: string[];
  /** Solid tint for this factor's direction glyphs (barbs/arrows), kept
   *  distinct per factor so overlaid layers stay visually separable. */
  glyphColor?: string;
}

export interface FieldSample {
  /** Magnitude in the factor's `unit`. */
  magnitude: number;
  /** Compass bearing the vector points toward (deg clockwise from north). */
  directionDeg: number;
}

export const FIELD_FACTORS: FieldFactor[] = [
  {
    id: 'wind',
    label: 'Wind',
    icon: 'fa-wind',
    unit: 'kt',
    directional: true,
    // Each stop's colour covers from its own threshold up to the next one
    // (the last stop has nothing above it, so it covers everything from
    // there up) — converted to knots at each Beaufort force's lower bound.
    max: 48,
    stops: [
      [0 / 48, '#a6d96a'], // up to BF4, light green
      [11 / 48, '#2e7d32'], // BF4-5, dark green
      [17 / 48, '#f2d23c'], // BF5-6, yellowish
      [22 / 48, '#f2a53c'], // BF6-7, orange
      [28 / 48, '#f2726b'], // BF7-8, light red
      [34 / 48, '#a61c1c'], // BF8+, dark red
    ],
    legend: ['BF4', 'BF5', 'BF6', 'BF7', 'BF8+'],
    glyphColor: '#14305c',
  },
  {
    id: 'gusts',
    label: 'Gusts',
    icon: 'fa-wind',
    unit: 'kt',
    directional: true,
    max: 60,
    stops: [
      [0.0, '#e6f7e6'],
      [0.25, '#a8e6a3'],
      [0.45, '#f2e85c'],
      [0.65, '#f5a623'],
      [0.85, '#e0552b'],
      [1.0, '#a01818'],
    ],
    legend: ['Calm', 'Fresh', 'Storm'],
    glyphColor: '#c2410c',
  },
  {
    id: 'waves',
    label: 'Waves',
    icon: 'fa-water',
    unit: 'm',
    directional: true,
    max: 8,
    stops: [
      [0 / 8, '#8fd3f4'], // 0-3m, light blue
      [3 / 8, '#1d4e89'], // 3-4m, dark blue
      [4 / 8, '#eadd8c'], // 4-5m, pale yellow
      [5 / 8, '#f2726b'], // 5-6m, light red
      [6 / 8, '#e2342c'], // 6-7m, red
      [7 / 8, '#a61c1c'], // 7m+, dark red
    ],
    legend: ['3 m', '4 m', '5 m', '6 m', '7 m+'],
    glyphColor: '#0e7490',
  },
  {
    id: 'swell',
    label: 'Swell',
    icon: 'fa-water',
    unit: 'm',
    directional: true,
    max: 8,
    stops: [
      [0 / 8, '#8fd3f4'],
      [3 / 8, '#1d4e89'],
      [4 / 8, '#eadd8c'],
      [5 / 8, '#f2726b'],
      [6 / 8, '#e2342c'],
      [7 / 8, '#a61c1c'],
    ],
    legend: ['3 m', '4 m', '5 m', '6 m', '7 m+'],
    glyphColor: '#15803d',
  },
  {
    id: 'currents',
    label: 'Currents',
    icon: 'fa-arrows-turn-right',
    unit: 'kt',
    directional: true,
    max: 2.5,
    stops: [
      [0.0 / 2.5, '#8fd3f4'], // 0-0.2kt, light blue
      [0.2 / 2.5, '#a6d96a'], // 0.2-0.4kt, light green
      [0.4 / 2.5, '#2e7d32'], // 0.4-0.6kt, dark green
      [0.6 / 2.5, '#f2d23c'], // 0.6-0.8kt, yellowish
      [0.8 / 2.5, '#f2a53c'], // 0.8-1.0kt, orange
      [1.0 / 2.5, '#f2726b'], // 1.0-1.5kt, light red
      [1.5 / 2.5, '#a61c1c'], // 1.5kt+, dark red
    ],
    legend: ['0.2 kt', '0.4 kt', '0.6 kt', '0.8 kt', '1.0 kt', '1.5 kt+'],
    glyphColor: '#6d28d9',
  },
  {
    id: 'pressure',
    label: 'Pressure',
    icon: 'fa-gauge',
    unit: 'hPa',
    directional: false,
    max: 1043,
    stops: [
      [0.0, '#8b2f8b'],
      [0.4, '#5b6fe0'],
      [0.5, '#dfe8f5'],
      [0.6, '#7fc47f'],
      [1.0, '#c0392b'],
    ],
    legend: ['980', '1013', '1043'],
  },
  {
    id: 'precipitation',
    label: 'Precipitation',
    icon: 'fa-cloud-rain',
    unit: 'mm/h',
    directional: false,
    max: 20,
    stops: [
      [0.0, '#eef6ff'],
      [0.2, '#a8d4ff'],
      [0.45, '#5b9bff'],
      [0.7, '#3b5fe0'],
      [1.0, '#6f2fb0'],
    ],
    legend: ['0', '8', '20 mm/h'],
  },
  {
    id: 'seaTemp',
    label: 'Sea Surface Temp',
    icon: 'fa-temperature-half',
    unit: '°C',
    directional: false,
    max: 32,
    stops: [
      [0.0, '#3b2fb0'],
      [0.3, '#3b82f6'],
      [0.5, '#3f9f7f'],
      [0.7, '#f2c14e'],
      [0.88, '#e0552b'],
      [1.0, '#a01818'],
    ],
    legend: ['0°', '16°', '32°'],
  },
  {
    id: 'airTemp',
    label: 'Air Temp',
    icon: 'fa-temperature-half',
    unit: '°C',
    directional: false,
    max: 40,
    stops: [
      [0.0, '#5b6fe0'],
      [0.35, '#3f9fd6'],
      [0.55, '#7fc47f'],
      [0.75, '#f2c14e'],
      [1.0, '#c0392b'],
    ],
    legend: ['-10°', '15°', '40°'],
  },
];

const FACTOR_BY_ID = new Map(FIELD_FACTORS.map((f) => [f.id, f]));

export function getFieldFactor(id: string): FieldFactor | undefined {
  return FACTOR_BY_ID.get(id);
}

/** Index of the highest stop whose threshold is at or below `frac` — i.e.
 *  which discrete band a value falls into, for posterised/contour-chart
 *  style rendering instead of a smooth gradient. */
export function bandIndexFor(stops: Array<[number, string]>, frac: number): number {
  const f = Math.max(0, Math.min(1, frac));
  let idx = 0;
  for (let i = 0; i < stops.length; i += 1) {
    if (f >= stops[i][0]) idx = i;
  }
  return idx;
}

/** Flat colour for a discrete band index (no interpolation between stops). */
export function bandColor(stops: Array<[number, string]>, bandIndex: number, alpha = 1): string {
  const stop = stops[Math.max(0, Math.min(stops.length - 1, bandIndex))];
  const { r, g, b } = hexToRgb(stop[1]);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Per-factor seed so each field looks distinct but stays deterministic. */
function seedFor(factorId: string): number {
  let h = 0;
  for (let i = 0; i < factorId.length; i += 1) h = (h * 31 + factorId.charCodeAt(i)) % 997;
  return (h % 100) / 7;
}

/** Deterministic pseudo-random value in [0, 1) for an integer lattice point,
 *  over a 3rd (time) axis so the noise field can genuinely evolve over time
 *  instead of only ever being resampled at a shifted spatial coordinate
 *  (which just looks like panning). */
function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177 + seed * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 2654435761;
  h ^= h >>> 16;
  return ((h >>> 0) % 100000) / 100000;
}

/** Smootherstep easing so interpolated noise has no visible facets. */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Trilinear value noise at a continuous coordinate, third axis = time —
 *  the shape genuinely morphs as `z` advances, not just translates. */
function latticeNoise3(x: number, y: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const sx = fade(x - x0);
  const sy = fade(y - y0);
  const sz = fade(z - z0);
  const n000 = hash3(x0, y0, z0, seed);
  const n100 = hash3(x0 + 1, y0, z0, seed);
  const n010 = hash3(x0, y0 + 1, z0, seed);
  const n110 = hash3(x0 + 1, y0 + 1, z0, seed);
  const n001 = hash3(x0, y0, z0 + 1, seed);
  const n101 = hash3(x0 + 1, y0, z0 + 1, seed);
  const n011 = hash3(x0, y0 + 1, z0 + 1, seed);
  const n111 = hash3(x0 + 1, y0 + 1, z0 + 1, seed);
  const ix00 = n000 + (n100 - n000) * sx;
  const ix10 = n010 + (n110 - n010) * sx;
  const ix01 = n001 + (n101 - n001) * sx;
  const ix11 = n011 + (n111 - n011) * sx;
  const iy0 = ix00 + (ix10 - ix00) * sy;
  const iy1 = ix01 + (ix11 - ix01) * sy;
  return iy0 + (iy1 - iy0) * sz;
}

/**
 * Smooth pseudo field in roughly [0, 1], built from a few octaves of value
 * noise (irregular lacunarity so octaves never re-align into a repeating
 * grid). Unlike a sum of sinusoids, this never produces the periodic
 * "polka dot" artefact a wide, zoomed-out view would otherwise reveal —
 * each weather system reads as a one-off blob, like a real synoptic chart.
 * `hour` is a genuine 3rd noise axis (not just a spatial offset), so systems
 * intensify/weaken/reshape as the forecast advances instead of the same
 * frozen pattern only ever sliding sideways.
 */
function smooth01(lat: number, lon: number, seed: number, hour: number): number {
  let sum = 0;
  let norm = 0;
  let amplitude = 1;
  let frequency = 0.045; // ≈ 22° per base noise cell — synoptic-system scale
  let tFrequency = 0.05; // ≈ 20h per base noise cell — synoptic-system lifetime
  for (let octave = 0; octave < 4; octave += 1) {
    sum +=
      latticeNoise3(lon * frequency, lat * frequency, hour * tFrequency, seed + octave * 17.3) *
      amplitude;
    norm += amplitude;
    amplitude *= 0.52;
    frequency *= 2.17;
    tFrequency *= 2.17;
  }
  return Math.max(0, Math.min(1, sum / norm));
}

/**
 * Sample the weather field at a coordinate for the given factor. Replace
 * the body with a backend grid lookup to drive the layer from live data.
 *
 * `hour` (hours ahead of now) slowly drifts the synthetic pattern eastward
 * — real weather systems migrate with the prevailing flow — so the map
 * still visibly keeps moving in sync with elapsed simulated time even well
 * beyond the live forecast's window (`MAX_FORECAST_HOURS`), instead of
 * freezing on whatever the live grid last showed.
 */
export function sampleWeatherField(
  lat: number,
  lon: number,
  factorId: string,
  hour = 0,
): FieldSample {
  const factor = FACTOR_BY_ID.get(factorId);
  if (!factor) return { magnitude: 0, directionDeg: 0 };
  const seed = seedFor(factorId);
  // Gentle eastward advection (real systems migrate with the prevailing
  // flow) PLUS genuine evolution along the time axis (`smooth01`'s 3rd
  // argument) so systems actually intensify/weaken/reshape as the forecast
  // hour advances, instead of the same frozen pattern just sliding sideways.
  const driftLon = lon - hour * 0.05;

  if (factor.id === 'pressure') {
    // Pressure clusters around 1013 hPa with gentle highs/lows.
    const n = smooth01(lat, driftLon, seed, hour);
    return { magnitude: 980 + n * (1043 - 980), directionDeg: 0 };
  }
  if (factor.id === 'seaTemp' || factor.id === 'airTemp') {
    // Temperature falls off toward the poles plus a smooth anomaly field.
    const base = 1 - Math.min(1, Math.abs(lat) / 75);
    const n = base * 0.7 + smooth01(lat, driftLon, seed, hour) * 0.3;
    return { magnitude: n * factor.max, directionDeg: 0 };
  }

  const n = smooth01(lat, driftLon, seed, hour);
  const magnitude = n * factor.max;
  const dir =
    (Math.sin(lat * 0.11 - seed) * 110 +
      Math.cos(driftLon * 0.13 + seed * 1.4) * 130 +
      seed * 47 +
      720) %
    360;
  return { magnitude, directionDeg: dir };
}

/** Interpolate a factor's colour ramp at `frac` (0..1) → `rgba(...)`. */
export function rampColor(
  stops: Array<[number, string]>,
  frac: number,
  alpha = 1,
): string {
  const f = Math.max(0, Math.min(1, frac));
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i += 1) {
    if (f >= stops[i][0] && f <= stops[i + 1][0]) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }
  const span = hi[0] - lo[0] || 1;
  const t = (f - lo[0]) / span;
  const a = hexToRgb(lo[1]);
  const b = hexToRgb(hi[1]);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `rgba(${r},${g},${bl},${alpha})`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
