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
    max: 45,
    stops: [
      [0.0, '#dff3ff'],
      [0.18, '#a8d8ff'],
      [0.34, '#6fb7ff'],
      [0.5, '#3b82f6'],
      [0.66, '#7c6ff0'],
      [0.8, '#b15fd0'],
      [0.9, '#e05b9a'],
      [1.0, '#c0392b'],
    ],
    legend: ['BF1', 'BF5', 'BF8'],
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
  },
  {
    id: 'waves',
    label: 'Waves',
    icon: 'fa-water',
    unit: 'm',
    directional: true,
    max: 8,
    stops: [
      [0.0, '#e7fbff'],
      [0.2, '#9fe0ef'],
      [0.4, '#4fb6d6'],
      [0.6, '#2f7fb8'],
      [0.78, '#6f5fc0'],
      [1.0, '#b0387a'],
    ],
    legend: ['0 m', '4 m', '8 m'],
  },
  {
    id: 'swell',
    label: 'Swell',
    icon: 'fa-water',
    unit: 'm',
    directional: true,
    max: 6,
    stops: [
      [0.0, '#eafff4'],
      [0.25, '#a3ead0'],
      [0.5, '#4fc6a0'],
      [0.7, '#2f8fb8'],
      [1.0, '#5b4fc0'],
    ],
    legend: ['0 m', '3 m', '6 m'],
  },
  {
    id: 'currents',
    label: 'Currents',
    icon: 'fa-arrows-turn-right',
    unit: 'kt',
    directional: true,
    max: 4,
    stops: [
      [0.0, '#eef3ff'],
      [0.3, '#b9c8ff'],
      [0.55, '#7e9bff'],
      [0.75, '#5b6fe0'],
      [1.0, '#3b2fb0'],
    ],
    legend: ['0 kt', '2 kt', '4 kt'],
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

/** Per-factor seed so each field looks distinct but stays deterministic. */
function seedFor(factorId: string): number {
  let h = 0;
  for (let i = 0; i < factorId.length; i += 1) h = (h * 31 + factorId.charCodeAt(i)) % 997;
  return (h % 100) / 7;
}

/** Smooth pseudo field in roughly [0, 1] built from layered sinusoids. */
function smooth01(lat: number, lon: number, seed: number): number {
  const v =
    Math.sin(lat * 0.20 + seed) * 0.5 +
    Math.cos(lon * 0.16 - seed * 1.7) * 0.5 +
    Math.sin((lat + lon) * 0.09 + seed * 2.1) * 0.35 +
    Math.cos((lon - lat) * 0.13 - seed * 0.6) * 0.3;
  const n = (v / 1.65 + 1) / 2;
  return Math.max(0, Math.min(1, n));
}

/**
 * Sample the weather field at a coordinate for the given factor. Replace
 * the body with a backend grid lookup to drive the layer from live data.
 */
export function sampleWeatherField(
  lat: number,
  lon: number,
  factorId: string,
): FieldSample {
  const factor = FACTOR_BY_ID.get(factorId);
  if (!factor) return { magnitude: 0, directionDeg: 0 };
  const seed = seedFor(factorId);

  if (factor.id === 'pressure') {
    // Pressure clusters around 1013 hPa with gentle highs/lows.
    const n = smooth01(lat, lon, seed);
    return { magnitude: 980 + n * (1043 - 980), directionDeg: 0 };
  }
  if (factor.id === 'seaTemp' || factor.id === 'airTemp') {
    // Temperature falls off toward the poles plus a smooth anomaly field.
    const base = 1 - Math.min(1, Math.abs(lat) / 75);
    const n = base * 0.7 + smooth01(lat, lon, seed) * 0.3;
    return { magnitude: n * factor.max, directionDeg: 0 };
  }

  const n = smooth01(lat, lon, seed);
  const magnitude = n * factor.max;
  const dir =
    (Math.sin(lat * 0.11 - seed) * 110 +
      Math.cos(lon * 0.13 + seed * 1.4) * 130 +
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
