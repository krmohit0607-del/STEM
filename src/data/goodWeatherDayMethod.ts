/**
 * Good Weather Day Method (GWDM) classification.
 *
 * Ports the legacy `FleetViewCore.BL\Voyage\GWDM\*` strategies. Reports are
 * grouped into "blocks": each block is one real (non-estimate) report plus
 * any estimate reports that preceded it since the last real report. A block
 * qualifies as good weather only when every report in it has valid weather
 * data, isn't a Departure/Resume ("start") report, meets the minimum good
 * hours threshold, and passes the method-specific wind/wave/current test.
 *
 * Maps 1:1 to the `CP_GOOD_WEATHER_OPTIONS` dropdown in
 * `components/voyage/types.ts`.
 */

export type GoodWeatherDayMethodType = 'STANDARD' | 'FIFTYPERCENT' | 'SEVENTYFIVEPERCENT';

/** Maps a `CP_GOOD_WEATHER_OPTIONS` label to its internal method key. */
export function goodWeatherMethodFromOption(option: string): GoodWeatherDayMethodType {
  switch (option) {
    case '50%':
      return 'FIFTYPERCENT';
    case '75%':
      return 'SEVENTYFIVEPERCENT';
    case 'Standard':
    default:
      return 'STANDARD';
  }
}

export type CurrentsOptionType =
  | 'ALL_CURRENTS'
  | 'NO_CURRENTS'
  | 'NO_ADVERSE_CURRENTS'
  | 'NO_ADVERSE_CURRENTS_NO_EFFECT_FAVORABLE'
  | 'ALL_ADVERSE_NO_EFFECT_FAVORABLE';

/** Maps a `CP_CURRENTS_OPTIONS` label to its internal option key. */
export function currentsOptionFromLabel(label: string): CurrentsOptionType {
  switch (label) {
    case 'All Currents':
      return 'ALL_CURRENTS';
    case 'No Currents':
      return 'NO_CURRENTS';
    case 'No Adverse Currents':
      return 'NO_ADVERSE_CURRENTS';
    case 'No Adverse Currents & No Effect of Favorable Currents':
      return 'NO_ADVERSE_CURRENTS_NO_EFFECT_FAVORABLE';
    case 'All Adverse Currents & No Effect of Favorable Currents':
    default:
      return 'ALL_ADVERSE_NO_EFFECT_FAVORABLE';
  }
}

/**
 * `GoodWeatherDayMethod.CurrentFactor()`: currents are excluded from the
 * good-weather current test entirely under these three options.
 */
export function normalizeCurrentFactor(originalFactor: number, option: CurrentsOptionType): number {
  if (option === 'ALL_CURRENTS' || option === 'NO_CURRENTS' || option === 'ALL_ADVERSE_NO_EFFECT_FAVORABLE') {
    return 0;
  }
  return originalFactor;
}

export interface GwdmReport {
  /** Hours elapsed since the previous report in sequence. */
  hours: number;
  windFactor: number;
  waveFactor: number;
  /**
   * Current factor for this single report, already passed through
   * `normalizeCurrentFactor`. The legacy test weights this by `hours`
   * internally, so pass the raw per-report current factor here (not a
   * pre-weighted value).
   */
  currentFactor: number;
  /** True for Departure / Resume rows. */
  isStart?: boolean;
  /** True when wind or wave data is missing/invalid for this report. */
  invalidWeather?: boolean;
  /** True when this report is an estimate (grouped forward into the next real report's block). */
  isEstimate?: boolean;
}

export interface GwdmBlock {
  reports: GwdmReport[];
}

/**
 * Groups a sequence of reports into GWDM blocks: consecutive estimate
 * reports are grouped forward with the next real (non-estimate) report. Any
 * trailing estimates with no following real report form an incomplete final
 * block (kept so overall array lengths/order stay predictable, but callers
 * should treat it as not-yet-resolved).
 */
export function buildGwdmBlocks(reports: GwdmReport[]): GwdmBlock[] {
  const blocks: GwdmBlock[] = [];
  let current: GwdmReport[] = [];
  for (const report of reports) {
    current.push(report);
    if (!report.isEstimate) {
      blocks.push({ reports: current });
      current = [];
    }
  }
  if (current.length > 0) blocks.push({ reports: current });
  return blocks;
}

/**
 * `GoodWeatherDayMethod.IsGoodWeatherDay()` + the concrete Standard/Percent
 * strategies. `isExcluded` covers the legacy's block-level exclusions (the
 * first/start block, or any other block the caller wants force-excluded).
 */
export function isGoodWeatherDay(
  block: GwdmBlock,
  method: GoodWeatherDayMethodType,
  minGoodHours: number,
  currentsOption: CurrentsOptionType,
  isExcluded = false,
): boolean {
  const reports = block.reports;
  if (isExcluded || reports.length === 0) return false;
  if (reports.some((r) => r.isStart || r.invalidWeather)) return false;

  const totalHours = reports.reduce((sum, r) => sum + r.hours, 0);
  if (totalHours < minGoodHours) return false;

  const currentWeighted = reports.reduce(
    (sum, r) => sum + normalizeCurrentFactor(r.currentFactor, currentsOption) * r.hours,
    0,
  );
  const avgCurrent = totalHours > 0 ? currentWeighted / totalHours : 0;
  if (avgCurrent < 0) return false;

  if (method === 'STANDARD') {
    return !reports.some((r) => r.windFactor < 0 || r.waveFactor < 0);
  }

  // FIFTYPERCENT / SEVENTYFIVEPERCENT: percentage of hours with non-negative wind & wave.
  const percent = method === 'FIFTYPERCENT' ? 50 : 75;
  const goodHours = reports.reduce(
    (sum, r) => (r.windFactor >= 0 && r.waveFactor >= 0 ? sum + r.hours : sum),
    0,
  );
  if (goodHours > 0) {
    // Strict `>`, not `>=` — matches the legacy implementation exactly.
    return (goodHours / totalHours) * 100 > percent;
  }
  return totalHours === 0;
}

/**
 * Classifies every report (by index) as good-weather or not: groups them
 * into GWDM blocks, evaluates each block once, then broadcasts that block's
 * result back to every report index inside it. The first block is always
 * excluded (mirrors the legacy's own "first block never counts" rule, since
 * it covers the Departure/Resume report with no preceding weather to judge).
 * Shared by `interimCalculations.ts` (voyage-wide "Good Weather %") and the
 * Tracksheet grid (per-row good/bad weather highlighting), so both always
 * agree on the same classification.
 */
export function classifyGoodWeatherRows(
  reports: GwdmReport[],
  method: GoodWeatherDayMethodType,
  minGoodHours: number,
  currentsOption: CurrentsOptionType,
): boolean[] {
  const blocks = buildGwdmBlocks(reports);
  const result: boolean[] = new Array(reports.length).fill(false);
  let cursor = 0;
  blocks.forEach((block, blockIdx) => {
    const good = isGoodWeatherDay(block, method, minGoodHours, currentsOption, blockIdx === 0);
    for (let k = 0; k < block.reports.length; k += 1) result[cursor + k] = good;
    cursor += block.reports.length;
  });
  return result;
}
