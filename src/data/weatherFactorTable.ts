/**
 * Wind / wave weather-factor calibration tables, ported from the reference
 * FleetView data export (a real per-vessel-class calibration table: deadweight
 * x Beaufort-force/wave-height x relative-angle -> factor). These are used to
 * estimate how much wind and waves degrade a vessel's performance (negative =
 * adverse / slower). Current uses a simpler, physically-derived formula (see
 * `currentFactor`) rather than a table, since current calibration tables have
 * proven unreliable in practice and the along-track vector-projection formula
 * is the standard navigational approach.
 *
 * Table shape: both tables share the same deadweight bands and relative-angle
 * bands (folded 0=head..180=following/stern by port/starboard symmetry); each
 * has its own magnitude axis (Beaufort force for wind, significant wave
 * height in metres for wave). Values outside the table's range are clamped
 * to the nearest edge band (never extrapolated); magnitudes below the
 * table's lowest band are treated as having no measurable effect (factor 0),
 * mirroring the legacy "below minimum magnitude -> factor 0" rule.
 *
 * Persistence: this same table is also seeded into the backend's
 * `WeatherFactorEntries` database table (global reference data, served by
 * `GET /api/performance/weather-factors`) so the calibration data lives in
 * the database, not just the frontend bundle — matching the legacy's own
 * database-backed `WeatherFactors` table design. The arrays below are the
 * initial/offline-fallback copy; call `loadWeatherFactorTableFromBackend`
 * once per app session (see `TracksheetGrid.tsx`) to fetch and switch to the
 * backend's copy, which is the single source of truth going forward.
 */

/** Deadweight bands (MT), shared by both tables. */
const DEFAULT_DWT_BANDS = [10000, 15000, 19000, 25000, 40000, 50000, 60000, 75000, 90000, 120000, 150000, 999999];

/** Relative-angle bands (deg), shared by both tables. */
const DEFAULT_ANGLE_BANDS = [0, 11.25, 45, 78.75, 101.25, 135, 168.75, 180];

/** Beaufort-force bands for the wind table. */
const DEFAULT_WIND_BEAUFORT_BANDS = [4, 5, 6, 7, 8, 9, 10];

/** Flattened wind factor values, ordered [deadweightIdx][beaufortIdx][angleIdx]. */
// prettier-ignore
const DEFAULT_WIND_VALUES: number[] = [
  -0.19, -0.17, -0.15, -0.13, -0.11, -0.07, -0.05, -0.03, -0.57, -0.51, -0.45, -0.41, -0.33, -0.26, -0.2, -0.12,
  -0.87, -0.78, -0.69, -0.64, -0.57, -0.4, -0.32, -0.27, -1.62, -1.44, -1.26, -1.19, -0.93, -0.75, -0.63, -0.37,
  -2.19, -1.92, -1.65, -1.46, -1.25, -1.04, -0.75, -0.54, -2.84, -2.49, -2.14, -1.89, -1.62, -1.37, -1, -0.72,
  -3.93, -3.45, -2.97, -2.62, -2.21, -1.83, -1.39, -1, -0.17, -0.15, -0.13, -0.12, -0.08, -0.06, -0.05, -0.03,
  -0.51, -0.46, -0.41, -0.37, -0.3, -0.24, -0.18, -0.11, -0.79, -0.71, -0.63, -0.58, -0.52, -0.36, -0.29, -0.21,
  -1.47, -1.31, -1.15, -1.08, -0.85, -0.68, -0.57, -0.34, -2.07, -1.82, -1.57, -1.39, -1.19, -0.98, -0.71, -0.51,
  -2.78, -2.44, -2.1, -1.85, -1.59, -1.34, -0.98, -0.71, -3.85, -3.38, -2.91, -2.57, -2.16, -1.79, -1.36, -0.98,
  -0.15, -0.13, -0.11, -0.1, -0.07, -0.05, -0.04, -0.03, -0.45, -0.4, -0.35, -0.32, -0.26, -0.2, -0.16, -0.1,
  -0.68, -0.61, -0.54, -0.5, -0.44, -0.31, -0.25, -0.18, -1.26, -1.12, -0.98, -0.93, -0.73, -0.58, -0.49, -0.29,
  -1.95, -1.71, -1.47, -1.3, -1.11, -0.92, -0.67, -0.48, -2.61, -2.29, -1.97, -1.74, -1.49, -1.26, -0.92, -0.66,
  -3.61, -3.17, -2.73, -2.41, -2.03, -1.68, -1.28, -0.92, -0.14, -0.12, -0.1, -0.09, -0.06, -0.05, -0.04, -0.02,
  -0.4, -0.36, -0.32, -0.29, -0.24, -0.18, -0.14, -0.09, -0.61, -0.55, -0.49, -0.45, -0.4, -0.28, -0.23, -0.16,
  -1.14, -1.02, -0.9, -0.85, -0.66, -0.53, -0.45, -0.26, -1.86, -1.63, -1.4, -1.24, -1.06, -0.88, -0.64, -0.46,
  -2.53, -2.22, -1.91, -1.68, -1.44, -1.22, -0.89, -0.64, -3.5, -3.07, -2.64, -2.33, -1.97, -1.63, -1.23, -0.89,
  -0.1, -0.09, -0.08, -0.07, -0.04, -0.04, -0.03, -0.02, -0.31, -0.27, -0.23, -0.21, -0.17, -0.14, -0.1, -0.06,
  -0.53, -0.48, -0.43, -0.4, -0.35, -0.25, -0.2, -0.14, -1, -0.9, -0.8, -0.75, -0.59, -0.47, -0.4, -0.24,
  -1.78, -1.56, -1.34, -1.18, -1.01, -0.84, -0.61, -0.44, -2.48, -2.17, -1.86, -1.65, -1.41, -1.19, -0.87, -0.63,
  -3.42, -3, -2.58, -2.28, -1.92, -1.59, -1.21, -0.87, -0.08, -0.07, -0.06, -0.05, -0.03, -0.03, -0.02, -0.01,
  -0.24, -0.21, -0.18, -0.17, -0.14, -0.11, -0.08, -0.05, -0.45, -0.4, -0.35, -0.33, -0.29, -0.2, -0.16, -0.12,
  -0.95, -0.85, -0.75, -0.7, -0.55, -0.44, -0.37, -0.22, -1.69, -1.48, -1.27, -1.12, -0.96, -0.8, -0.58, -0.41,
  -2.42, -2.12, -1.82, -1.61, -1.38, -1.16, -0.85, -0.61, -3.34, -2.93, -2.52, -2.23, -1.88, -1.55, -1.18, -0.85,
  -0.07, -0.06, -0.05, -0.05, -0.03, -0.02, -0.02, -0.01, -0.2, -0.18, -0.16, -0.14, -0.12, -0.09, -0.07, -0.04,
  -0.34, -0.3, -0.26, -0.24, -0.22, -0.15, -0.12, -0.09, -0.92, -0.82, -0.72, -0.68, -0.53, -0.43, -0.36, -0.21,
  -1.55, -1.36, -1.17, -1.04, -0.89, -0.74, -0.53, -0.38, -2.36, -2.07, -1.78, -1.57, -1.34, -1.14, -0.83, -0.6,
  -3.26, -2.86, -2.46, -2.18, -1.83, -1.52, -1.15, -0.83, -0.06, -0.05, -0.04, -0.04, -0.03, -0.02, -0.02, -0.01,
  -0.17, -0.15, -0.13, -0.12, -0.1, -0.08, -0.06, -0.04, -0.26, -0.24, -0.22, -0.2, -0.18, -0.12, -0.1, -0.07,
  -0.86, -0.77, -0.68, -0.64, -0.5, -0.4, -0.34, -0.2, -1.52, -1.34, -1.16, -1.02, -0.87, -0.73, -0.52, -0.38,
  -2.27, -1.99, -1.71, -1.51, -1.29, -1.1, -0.8, -0.58, -3.15, -2.76, -2.37, -2.1, -1.77, -1.46, -1.11, -0.8,
  -0.04, -0.04, -0.04, -0.03, -0.02, -0.02, -0.01, -0.01, -0.15, -0.13, -0.11, -0.1, -0.08, -0.07, -0.05, -0.03,
  -0.16, -0.14, -0.12, -0.12, -0.1, -0.07, -0.06, -0.04, -0.85, -0.76, -0.67, -0.63, -0.49, -0.4, -0.33, -0.2,
  -1.5, -1.32, -1.14, -1.01, -0.86, -0.72, -0.52, -0.37, -2.19, -1.92, -1.65, -1.46, -1.25, -1.05, -0.77, -0.56,
  -3.04, -2.66, -2.28, -2.02, -1.7, -1.41, -1.07, -0.77, -0.04, -0.03, -0.02, -0.02, -0.01, -0.01, -0.01, -0.01,
  -0.1, -0.09, -0.08, -0.07, -0.06, -0.05, -0.04, -0.02, -0.14, -0.12, -0.1, -0.1, -0.09, -0.06, -0.05, -0.03,
  -0.82, -0.73, -0.64, -0.61, -0.48, -0.38, -0.32, -0.19, -1.31, -1.15, -0.99, -0.88, -0.75, -0.62, -0.45, -0.32,
  -2.09, -1.83, -1.57, -1.39, -1.19, -1.01, -0.73, -0.53, -2.9, -2.54, -2.18, -1.93, -1.62, -1.34, -1.02, -0.74,
  -0.03, -0.02, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.09, -0.08, -0.07, -0.07, -0.05, -0.04, -0.03, -0.02,
  -0.09, -0.08, -0.07, -0.06, -0.06, -0.04, -0.03, -0.02, -0.7, -0.63, -0.56, -0.52, -0.41, -0.33, -0.28, -0.16,
  -1.31, -1.15, -0.99, -0.88, -0.75, -0.62, -0.45, -0.32, -2.04, -1.79, -1.54, -1.36, -1.17, -0.99, -0.72, -0.52,
  -2.82, -2.48, -2.14, -1.89, -1.59, -1.32, -1, -0.72, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01,
  -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01,
  -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01,
  -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01,
];

/** Significant wave-height bands (m) for the wave table. */
const DEFAULT_WAVE_HEIGHT_BANDS = [0.8, 1.26, 2.01, 2.31, 2.71, 3.01, 4.01, 5.01, 6.01];

/** Flattened wave factor values, ordered [deadweightIdx][waveHeightIdx][angleIdx]. */
// prettier-ignore
const DEFAULT_WAVE_VALUES: number[] = [
  -0.38, -0.33, -0.28, -0.25, -0.17, -0.13, -0.11, -0.06, -0.79, -0.69, -0.59, -0.52, -0.35, -0.28, -0.22, -0.12,
  -0.88, -0.77, -0.66, -0.59, -0.39, -0.31, -0.25, -0.15, -1.1, -0.97, -0.84, -0.74, -0.49, -0.39, -0.31, -0.22,
  -1.45, -1.27, -1.09, -0.97, -0.64, -0.51, -0.41, -0.29, -2.51, -2.2, -1.89, -1.67, -1.1, -0.88, -0.7, -0.51,
  -3.65, -3.2, -2.75, -2.43, -1.6, -1.28, -1.02, -0.77, -4.57, -4.01, -3.45, -3.05, -2.01, -1.6, -1.28, -0.92,
  -5.73, -5.03, -4.33, -3.82, -2.52, -2.01, -1.61, -1.11, -0.34, -0.3, -0.26, -0.23, -0.15, -0.12, -0.1, -0.06,
  -0.72, -0.63, -0.54, -0.48, -0.31, -0.25, -0.2, -0.11, -0.8, -0.7, -0.6, -0.53, -0.35, -0.28, -0.23, -0.13,
  -1.02, -0.89, -0.76, -0.67, -0.44, -0.35, -0.28, -0.2, -1.38, -1.21, -1.04, -0.92, -0.6, -0.48, -0.39, -0.28,
  -2.47, -2.16, -1.85, -1.64, -1.08, -0.86, -0.69, -0.5, -3.58, -3.14, -2.7, -2.38, -1.57, -1.25, -1, -0.75,
  -4.48, -3.93, -3.38, -2.99, -1.96, -1.57, -1.26, -0.9, -5.62, -4.93, -4.24, -3.75, -2.46, -1.97, -1.58, -1.08,
  -0.3, -0.26, -0.22, -0.2, -0.13, -0.1, -0.08, -0.05, -0.66, -0.58, -0.5, -0.44, -0.29, -0.23, -0.19, -0.1,
  -0.74, -0.65, -0.56, -0.49, -0.32, -0.26, -0.21, -0.12, -0.94, -0.82, -0.7, -0.62, -0.41, -0.33, -0.26, -0.19,
  -1.29, -1.13, -0.97, -0.86, -0.57, -0.45, -0.36, -0.26, -2.3, -2.02, -1.74, -1.54, -1.01, -0.81, -0.65, -0.47,
  -3.35, -2.94, -2.53, -2.24, -1.47, -1.18, -0.94, -0.71, -4.21, -3.69, -3.17, -2.8, -1.84, -1.48, -1.18, -0.85,
  -5.28, -4.63, -3.98, -3.52, -2.31, -1.85, -1.48, -1.02, -0.26, -0.23, -0.2, -0.18, -0.12, -0.09, -0.07, -0.04,
  -0.59, -0.52, -0.45, -0.39, -0.26, -0.21, -0.17, -0.09, -0.69, -0.6, -0.51, -0.45, -0.3, -0.24, -0.19, -0.11,
  -0.86, -0.75, -0.64, -0.57, -0.37, -0.3, -0.24, -0.17, -1.23, -1.08, -0.93, -0.82, -0.54, -0.43, -0.35, -0.25,
  -2.24, -1.96, -1.68, -1.49, -0.98, -0.78, -0.63, -0.45, -3.25, -2.85, -2.45, -2.16, -1.42, -1.14, -0.91, -0.68,
  -4.07, -3.57, -3.07, -2.71, -1.78, -1.43, -1.14, -0.82, -5.11, -4.48, -3.85, -3.4, -2.24, -1.79, -1.43, -0.98,
  -0.19, -0.17, -0.15, -0.13, -0.09, -0.07, -0.05, -0.03, -0.51, -0.45, -0.39, -0.34, -0.22, -0.18, -0.14, -0.08,
  -0.58, -0.51, -0.44, -0.39, -0.26, -0.2, -0.16, -0.1, -0.73, -0.64, -0.55, -0.49, -0.32, -0.26, -0.21, -0.15,
  -1.11, -0.97, -0.83, -0.73, -0.48, -0.39, -0.31, -0.22, -2.17, -1.91, -1.65, -1.45, -0.96, -0.77, -0.61, -0.44,
  -3.17, -2.78, -2.39, -2.12, -1.39, -1.11, -0.89, -0.67, -3.98, -3.49, -3, -2.65, -1.74, -1.4, -1.12, -0.8,
  -5, -4.38, -3.76, -3.33, -2.19, -1.75, -1.4, -0.96, -0.16, -0.14, -0.12, -0.1, -0.07, -0.05, -0.04, -0.03,
  -0.44, -0.39, -0.34, -0.3, -0.2, -0.16, -0.13, -0.07, -0.49, -0.43, -0.37, -0.32, -0.21, -0.17, -0.14, -0.08,
  -0.62, -0.54, -0.46, -0.41, -0.27, -0.21, -0.17, -0.12, -1.02, -0.89, -0.76, -0.68, -0.44, -0.36, -0.28, -0.2,
  -2.13, -1.87, -1.61, -1.42, -0.94, -0.75, -0.6, -0.43, -3.1, -2.72, -2.34, -2.07, -1.36, -1.09, -0.87, -0.65,
  -3.89, -3.41, -2.93, -2.59, -1.7, -1.36, -1.09, -0.78, -4.88, -4.28, -3.68, -3.25, -2.14, -1.71, -1.37, -0.94,
  -0.14, -0.12, -0.1, -0.09, -0.06, -0.05, -0.04, -0.02, -0.35, -0.31, -0.27, -0.24, -0.16, -0.12, -0.1, -0.06,
  -0.45, -0.39, -0.33, -0.29, -0.19, -0.15, -0.12, -0.07, -0.56, -0.49, -0.42, -0.37, -0.24, -0.19, -0.16, -0.11,
  -0.92, -0.81, -0.7, -0.62, -0.41, -0.33, -0.26, -0.19, -2.09, -1.83, -1.57, -1.39, -0.91, -0.73, -0.58, -0.42,
  -3.04, -2.66, -2.28, -2.02, -1.33, -1.06, -0.85, -0.64, -3.8, -3.33, -2.86, -2.53, -1.66, -1.33, -1.07, -0.77,
  -4.75, -4.17, -3.59, -3.17, -2.09, -1.67, -1.34, -0.92, -0.11, -0.1, -0.09, -0.08, -0.05, -0.04, -0.03, -0.02,
  -0.3, -0.26, -0.22, -0.19, -0.13, -0.1, -0.08, -0.05, -0.35, -0.31, -0.27, -0.23, -0.15, -0.12, -0.1, -0.06,
  -0.45, -0.39, -0.33, -0.3, -0.19, -0.16, -0.12, -0.09, -0.86, -0.76, -0.66, -0.58, -0.38, -0.3, -0.24, -0.18,
  -2.01, -1.76, -1.51, -1.34, -0.88, -0.7, -0.56, -0.4, -2.92, -2.56, -2.2, -1.95, -1.28, -1.02, -0.82, -0.61,
  -3.66, -3.21, -2.76, -2.44, -1.6, -1.28, -1.03, -0.74, -4.58, -4.02, -3.46, -3.06, -2.01, -1.61, -1.29, -0.89,
  -0.09, -0.08, -0.07, -0.06, -0.04, -0.03, -0.03, -0.02, -0.18, -0.16, -0.14, -0.12, -0.08, -0.06, -0.05, -0.03,
  -0.29, -0.25, -0.21, -0.19, -0.12, -0.1, -0.08, -0.05, -0.35, -0.31, -0.27, -0.24, -0.16, -0.12, -0.1, -0.07,
  -0.76, -0.67, -0.58, -0.51, -0.34, -0.27, -0.22, -0.15, -1.92, -1.69, -1.46, -1.29, -0.85, -0.68, -0.54, -0.39,
  -2.8, -2.46, -2.12, -1.87, -1.23, -0.99, -0.79, -0.59, -3.52, -3.09, -2.66, -2.35, -1.54, -1.24, -0.99, -0.71,
  -4.41, -3.87, -3.33, -2.94, -1.94, -1.55, -1.24, -0.85, -0.06, -0.05, -0.04, -0.04, -0.02, -0.02, -0.02, -0.01,
  -0.1, -0.09, -0.08, -0.07, -0.04, -0.04, -0.03, -0.02, -0.19, -0.17, -0.15, -0.13, -0.09, -0.07, -0.05, -0.03,
  -0.24, -0.21, -0.18, -0.16, -0.11, -0.09, -0.07, -0.05, -0.48, -0.42, -0.36, -0.32, -0.21, -0.17, -0.13, -0.1,
  -1.85, -1.62, -1.39, -1.23, -0.81, -0.65, -0.52, -0.37, -2.68, -2.35, -2.02, -1.79, -1.18, -0.94, -0.75, -0.56,
  -3.37, -2.95, -2.53, -2.24, -1.47, -1.18, -0.94, -0.68, -4.22, -3.7, -3.18, -2.81, -1.85, -1.48, -1.18, -0.81,
  -0.03, -0.03, -0.03, -0.03, -0.02, -0.01, -0.01, -0.01, -0.06, -0.05, -0.04, -0.04, -0.02, -0.02, -0.02, -0.01,
  -0.13, -0.11, -0.09, -0.08, -0.05, -0.04, -0.03, -0.02, -0.16, -0.14, -0.12, -0.1, -0.07, -0.05, -0.04, -0.03,
  -0.39, -0.34, -0.29, -0.26, -0.17, -0.14, -0.11, -0.08, -1.8, -1.58, -1.36, -1.2, -0.79, -0.63, -0.51, -0.36,
  -2.62, -2.3, -1.98, -1.75, -1.15, -0.92, -0.74, -0.55, -3.3, -2.89, -2.48, -2.19, -1.44, -1.15, -0.92, -0.66,
  -4.13, -3.62, -3.11, -2.75, -1.81, -1.45, -1.16, -0.8, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01,
  -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01,
  -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01,
  -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01,
  -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01, -0.01,
];

interface FactorGrid {
  dwBands: number[];
  magBands: number[];
  angleBands: number[];
  values: number[];
}

/**
 * The tables actually used by `windFactor`/`waveFactor` — initialised from
 * the embedded defaults above, and swapped out for the backend's copy (the
 * `WeatherFactorEntries` reference table) once `loadWeatherFactorTableFromBackend`
 * resolves successfully. Kept mutable (rather than re-exporting the consts
 * directly) so a later backend fetch can replace them without requiring
 * every caller to re-import anything.
 */
let activeWind: FactorGrid = {
  dwBands: DEFAULT_DWT_BANDS,
  magBands: DEFAULT_WIND_BEAUFORT_BANDS,
  angleBands: DEFAULT_ANGLE_BANDS,
  values: DEFAULT_WIND_VALUES,
};
let activeWave: FactorGrid = {
  dwBands: DEFAULT_DWT_BANDS,
  magBands: DEFAULT_WAVE_HEIGHT_BANDS,
  angleBands: DEFAULT_ANGLE_BANDS,
  values: DEFAULT_WAVE_VALUES,
};

/**
 * Rebuilds a dense `[dwIdx][magIdx][angleIdx]` grid from a flat list of
 * `{ deadWeight, magnitude, angle, value }` entries (e.g. from the backend's
 * `WeatherFactorEntries` table). Returns `null` (caller keeps the previous
 * grid) when the entries don't form a complete rectangular grid — a partial/
 * corrupt fetch should never silently produce wrong lookups.
 */
function buildGridFromEntries(
  entries: Array<{ deadWeight: number; magnitude: number; angle: number; value: number }>,
): FactorGrid | null {
  if (entries.length === 0) return null;
  const dwBands = [...new Set(entries.map((e) => e.deadWeight))].sort((a, b) => a - b);
  const magBands = [...new Set(entries.map((e) => e.magnitude))].sort((a, b) => a - b);
  const angleBands = [...new Set(entries.map((e) => e.angle))].sort((a, b) => a - b);
  const values: Array<number | null> = new Array(dwBands.length * magBands.length * angleBands.length).fill(null);
  for (const e of entries) {
    const i = dwBands.indexOf(e.deadWeight);
    const j = magBands.indexOf(e.magnitude);
    const k = angleBands.indexOf(e.angle);
    values[(i * magBands.length + j) * angleBands.length + k] = e.value;
  }
  if (values.some((v) => v === null)) return null;
  return { dwBands, magBands, angleBands, values: values as number[] };
}

let loadPromise: Promise<void> | null = null;

/**
 * Fetches the `WeatherFactorEntries` reference table from the backend once
 * and, if it parses into complete wind/wave grids, makes it the active
 * table for every subsequent `windFactor`/`waveFactor` call. Safe to call
 * repeatedly (memoized) and safe offline (keeps the embedded defaults on
 * failure). Call this before relying on live-table-accurate results (e.g.
 * at the start of Tracksheet "Validate").
 */
export function loadWeatherFactorTableFromBackend(
  fetchEntries: () => Promise<Array<{ weather: string; deadWeight: number; magnitude: number; angle: number; value: number }>>,
): Promise<void> {
  if (!loadPromise) {
    loadPromise = fetchEntries()
      .then((entries) => {
        const wind = buildGridFromEntries(entries.filter((e) => e.weather === 'Wind'));
        const wave = buildGridFromEntries(entries.filter((e) => e.weather === 'Wave'));
        if (wind) activeWind = wind;
        if (wave) activeWave = wave;
      })
      .catch(() => {
        /* offline / request failed — keep the embedded defaults */
      });
  }
  return loadPromise;
}

/** Fallback deadweight (MT) used when a voyage has no parseable vessel deadweight. */
export const DEFAULT_DEADWEIGHT_MT = 50000;

/** Parse a '180,000 MT' / '82000' style deadweight string into a number (MT), or null. */
export function parseDeadweightMt(text: string | null | undefined): number | null {
  if (!text) return null;
  const n = Number(text.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Beaufort force (0-12) for a wind speed in knots. */
export function beaufort(kn: number): number {
  const thresholds = [1, 4, 7, 11, 17, 22, 28, 34, 41, 48, 56, 64];
  let bf = 0;
  for (let i = 0; i < thresholds.length; i++) if (kn >= thresholds[i]) bf = i + 1;
  return bf;
}

/** Fold the absolute difference between two compass bearings (deg) into [0, 180]. */
export function foldRelativeAngle(a: number, b: number): number {
  const norm = (d: number) => ((d % 360) + 360) % 360;
  let diff = Math.abs(norm(a) - norm(b));
  if (diff > 180) diff = 360 - diff;
  return diff;
}

/** Find the bracketing pair of indices (and interpolation fraction) of `x` within sorted `bands`, clamping at the edges instead of extrapolating. */
function bracket(bands: number[], x: number): [number, number, number] {
  const last = bands.length - 1;
  if (x <= bands[0]) return [0, 0, 0];
  if (x >= bands[last]) return [last, last, 0];
  for (let i = 0; i < last; i += 1) {
    if (x >= bands[i] && x <= bands[i + 1]) {
      const span = bands[i + 1] - bands[i];
      const t = span === 0 ? 0 : (x - bands[i]) / span;
      return [i, i + 1, t];
    }
  }
  return [last, last, 0];
}

/** Trilinear interpolation (deadweight x magnitude x angle) over a flattened `[dwIdx][magIdx][angleIdx]` grid. */
function lookup3D(grid: FactorGrid, deadweightMt: number, magnitude: number, relativeAngleDeg: number): number {
  const [di0, di1, dt] = bracket(grid.dwBands, deadweightMt);
  const [mi0, mi1, mt] = bracket(grid.magBands, magnitude);
  const [ai0, ai1, at] = bracket(grid.angleBands, relativeAngleDeg);
  const nMag = grid.magBands.length;
  const nAngle = grid.angleBands.length;
  const cell = (i: number, j: number, k: number) => grid.values[(i * nMag + j) * nAngle + k];
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const atAngle = (i: number, j: number) => lerp(cell(i, j, ai0), cell(i, j, ai1), at);
  const atMag = (i: number) => lerp(atAngle(i, mi0), atAngle(i, mi1), mt);
  return lerp(atMag(di0), atMag(di1), dt);
}

/**
 * Wind weather factor: table lookup by vessel deadweight, Beaufort force
 * (converted from `windSpeedKn`) and the relative angle between the wind's
 * "from" direction and the vessel's course (0=headwind, 180=following wind).
 */
export function windFactor(
  deadweightMt: number,
  windSpeedKn: number,
  windFromDeg: number,
  courseDeg: number,
): number {
  const bf = beaufort(windSpeedKn);
  if (bf < activeWind.magBands[0]) return 0;
  const angle = foldRelativeAngle(windFromDeg, courseDeg);
  return lookup3D(activeWind, deadweightMt, bf, angle);
}

/**
 * Wave weather factor: table lookup by vessel deadweight, significant wave
 * height (m) and the relative angle between the waves' "from" direction and
 * the vessel's course (0=head sea, 180=following sea).
 */
export function waveFactor(
  deadweightMt: number,
  waveHeightM: number,
  waveFromDeg: number,
  courseDeg: number,
): number {
  if (waveHeightM < activeWave.magBands[0]) return 0;
  const angle = foldRelativeAngle(waveFromDeg, courseDeg);
  return lookup3D(activeWave, deadweightMt, waveHeightM, angle);
}

/**
 * Current factor: the along-track (set & drift) component of the current
 * vector, i.e. `currentSpeedKn * cos(relative angle)` between the current's
 * "towards" direction and the vessel's course. Positive = favourable (pushes
 * the vessel along its course), negative = adverse, ~0 at beam (a purely
 * beam current doesn't speed up or slow down progress along track). This is
 * the standard navigational formula for a current's effect on speed over
 * ground, so — unlike wind/wave — it needs no calibration table.
 */
export function currentFactor(currentSpeedKn: number, currentTowardDeg: number, courseDeg: number): number {
  const diffRad = ((currentTowardDeg - courseDeg) * Math.PI) / 180;
  return currentSpeedKn * Math.cos(diffRad);
}
