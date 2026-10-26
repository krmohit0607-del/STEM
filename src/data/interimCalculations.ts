/**
 * Interim Dashboard calculation engine.
 *
 * Ports `FleetViewCore.BL\NoonReport\Interim\InterimCalculatedData.cs` (the
 * legacy's central interim-metrics calculator) onto our Tracksheet rows
 * (`TrackRow[]`) and the Step 2 Good Weather Day Method / Allowable
 * Consumption modules. Every metric is produced in an `overall` and
 * `goodWeather` variant, matching the legacy's two-column ("Overall" /
 * "Good Weather") presentation.
 *
 * Known simplifications vs. the legacy engine (documented rather than
 * silently applied):
 *  - Our wind/wave/current "factor" values are computed by
 *    `TracksheetGrid.tsx` using a real deadweight/magnitude/relative-angle
 *    calibration table for wind and wave (ported from a reference FleetView
 *    data export — see `weatherFactorTable.ts`) and a physically-derived
 *    along-track vector-projection formula for current (`currentSpeed *
 *    cos(relative angle)`, since current calibration tables have proven
 *    unreliable in practice). Deadweight comes from the voyage's vessel
 *    deadweight (falling back to a default mid-size value when unset), and
 *    the vessel's heading is approximated as the course-made-good bearing
 *    between consecutive report positions (no separate logged heading field
 *    exists in this system).
 *  - The legacy selects two independently-configured allowable-consumption
 *    method instances (one for the time-loss branch, one for the time-gain
 *    branch). Our CP data model exposes a single selected method
 *    (`cpAllowableFuelMethod`) shared by both branches, with separate
 *    tolerance percentages (`cpTimeLoss` / `cpTimeGain`). The one exception
 *    is the Time Gain method itself, which — consistent with its own
 *    purpose — is always configured from elapsed hours rather than
 *    distance-through-water, regardless of which branch is active.
 *  - "Other" fuel deliberately reuses the time-loss-configured allowance in
 *    the time-gain branch too, replicating the legacy's own quirk.
 *  - The voyage-progress ratio used to extrapolate an in-voyage result to a
 *    full-voyage projection is `distanceSoFar / totalLegDistance` (from
 *    `LegRow.distanceNm`), since our model has no separate
 *    "TravelledDistanceVoyage" field.
 *  - `TimeLossGain`'s sign was reconstructed from first principles
 *    (positive = ahead of schedule / gain, negative = behind schedule /
 *    loss) to match this app's existing `projectionTimeCell` convention,
 *    since the legacy pseudocode available for this port did not preserve
 *    the sign derivation unambiguously.
 */

import type { TrackRow, ConsFuel } from '../components/TracksheetGrid';
import {
  computeHrs,
  computeDistO,
  computeCons,
} from '../components/TracksheetGrid';
import {
  type AllowableConsumptionMethodType,
  allowableConsumptionMethodFromOption,
  computeAllowableConsumption,
} from './allowableConsumption';
import {
  type GoodWeatherDayMethodType,
  type CurrentsOptionType,
  type GwdmReport,
  classifyGoodWeatherRows,
  normalizeCurrentFactor,
  goodWeatherMethodFromOption,
  currentsOptionFromLabel,
} from './goodWeatherDayMethod';
import type { LegRow } from '../components/voyage/types';

export interface InterimCpConfig {
  /** Warranted charter-party speed (knots) — the voyage's default Speed & Cons row. */
  charterPartySpeedKn: number;
  /** "About Speed" tolerance amount (knots, or a percentage when `speedAboutIsPercent`). */
  speedAbout: number;
  speedAboutIsPercent: boolean;
  /** CP daily allowable consumption (MT/day) per fuel. */
  dailyAllowable: Record<ConsFuel, number>;
  allowableMethod: AllowableConsumptionMethodType;
  /** Consumption tolerance fraction (e.g. 0.05 for 5%) applied in the time-loss branch. */
  timeLossConsumptionAbout: number;
  /** Consumption tolerance fraction applied in the time-gain branch. */
  timeGainConsumptionAbout: number;
  goodWeatherMethod: GoodWeatherDayMethodType;
  minGoodHours: number;
  currentsOption: CurrentsOptionType;
  /** Total leg distance (NM), used as the voyage-progress denominator for projections. */
  totalVoyageDistanceNm: number;
}

/** Parse a number out of a string like "3,240 NM" or "0.5 kt". */
function parseLabelNum(value: string): number {
  const m = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : 0;
}

/**
 * Builds the engine's CP configuration from a `LegRow` (the same CP / good
 * weather fields edited in the Voyage Details page's `LegsSection`). Shared
 * by the Interim Dashboard and the Vessel Performance report so both pages
 * derive the same CP configuration the same way.
 */
export function cpConfigFromLeg(leg: LegRow | undefined, fallbackSpeedKn = 13): InterimCpConfig {
  const defaultSpeedRow = leg?.speedCons.find((row) => row.isDefault) ?? leg?.speedCons[0];
  return {
    charterPartySpeedKn: Number(defaultSpeedRow?.speed) || fallbackSpeedKn,
    speedAbout: Number(leg?.cpAboutSpeed) || 0,
    speedAboutIsPercent: leg?.cpAboutSpeedUnit === '%',
    dailyAllowable: {
      vlsfo: Number(defaultSpeedRow?.dailyCons1) || 0,
      lsmgo: Number(defaultSpeedRow?.dailyCons2) || 0,
      none: Number(defaultSpeedRow?.dailyCons3) || 0,
    },
    allowableMethod: allowableConsumptionMethodFromOption(leg?.cpAllowableFuelMethod ?? ''),
    timeLossConsumptionAbout: (Number(leg?.cpTimeLoss) || 0) / 100,
    timeGainConsumptionAbout: (Number(leg?.cpTimeGain) || 0) / 100,
    goodWeatherMethod: goodWeatherMethodFromOption(leg?.cpGoodWeatherSelection ?? ''),
    minGoodHours: Number(leg?.cpMinHours) || 0,
    currentsOption: currentsOptionFromLabel(leg?.cpCurrents ?? ''),
    totalVoyageDistanceNm: parseLabelNum(leg?.distanceNm ?? ''),
  };
}

export interface OverallGoodWeather {
  overall: number;
  goodWeather: number;
}

export interface InterimResult {
  timeAtSea: OverallGoodWeather;
  distance: OverallGoodWeather;
  distanceThroughWater: OverallGoodWeather;
  averageSpeed: OverallGoodWeather;
  averagePerformanceSpeed: OverallGoodWeather;
  averageConsumption: Record<ConsFuel, OverallGoodWeather>;
  /** CP speed minus the About Speed tolerance. */
  aboutSpeed: number;
  hasTimeLoss: { overall: boolean; goodWeather: boolean };
  /** Hours ahead (+) / behind (-) schedule, extrapolated to the full voyage. */
  projectedTimeLossGain: OverallGoodWeather;
  /** MT over (+) / under (-) the CP allowance, extrapolated to the full voyage, per fuel. */
  projectedConsumption: Record<ConsFuel, OverallGoodWeather>;
  /** Share of time-at-sea classified as good weather, 0-100. */
  goodWeatherPercent: number;
}

const FUELS: ConsFuel[] = ['vlsfo', 'lsmgo', 'none'];

/** Per-report derived values shared by every aggregate below. */
interface DerivedReport {
  row: TrackRow;
  hours: number;
  distance: number;
  consumption: Record<ConsFuel, number>;
  windFactor: number;
  waveFactor: number;
  currentFactor: number;
  isStart: boolean;
  isEstimate: boolean;
  isGoodWeather: boolean;
}

/**
 * `InterimModel.PerformanceFactors` selection: whether the current factor
 * participates in the performance correction depends on the CP's currents
 * option.
 */
function performanceFactor(r: DerivedReport, currentsOption: CurrentsOptionType): number {
  const includeCurrent =
    currentsOption === 'ALL_CURRENTS' ||
    currentsOption === 'NO_ADVERSE_CURRENTS' ||
    (currentsOption === 'ALL_ADVERSE_NO_EFFECT_FAVORABLE' && r.currentFactor < 0);
  return includeCurrent ? r.windFactor + r.waveFactor + r.currentFactor : r.windFactor + r.waveFactor;
}

function buildDerivedReports(rows: TrackRow[], config: InterimCpConfig, path: Array<[number, number]>): DerivedReport[] {
  const gwdmReports: GwdmReport[] = rows.map((row, i) => ({
    hours: i > 0 ? computeHrs(rows[i - 1], row) ?? 0 : 0,
    windFactor: row.windF,
    waveFactor: row.waveF,
    currentFactor: row.currF,
    isStart: row.rt === 'D' || row.rt === 'R',
    isEstimate: row.rt.trim() === '',
  }));
  const blockByIndex = classifyGoodWeatherRows(gwdmReports, config.goodWeatherMethod, config.minGoodHours, config.currentsOption);

  return rows.map((row, i) => {
    const hours = i > 0 ? computeHrs(rows[i - 1], row) ?? 0 : 0;
    const distance = i > 0 ? computeDistO(rows, i, path) ?? 0 : 0;
    const consumption = FUELS.reduce((acc, fuel) => {
      acc[fuel] = i > 0 ? computeCons(rows, i, fuel) ?? 0 : 0;
      return acc;
    }, {} as Record<ConsFuel, number>);
    return {
      row,
      hours,
      distance,
      consumption,
      windFactor: row.windF,
      waveFactor: row.waveF,
      currentFactor: row.currF,
      isStart: row.rt === 'D' || row.rt === 'R',
      isEstimate: row.rt.trim() === '',
      isGoodWeather: blockByIndex[i],
    };
  });
}

function sum(reports: DerivedReport[], pick: (r: DerivedReport) => number): number {
  return reports.reduce((acc, r) => acc + pick(r), 0);
}

function aggregate(reports: DerivedReport[], config: InterimCpConfig) {
  const all = reports.filter((r) => !r.isStart);
  const gw = reports.filter((r) => !r.isStart && r.isGoodWeather);

  const timeAtSeaOverall = sum(all, (r) => r.hours);
  const timeAtSeaGw = sum(gw, (r) => r.hours);
  const distanceOverall = sum(all, (r) => r.distance);
  const distanceGw = sum(gw, (r) => r.distance);

  // Overall distance-through-water always nets out every weather component;
  // the good-weather variant respects the CP's currents-option selection
  // (`PerformanceWeightFactors`).
  const weightOverall = sum(all, (r) => (r.windFactor + r.waveFactor + r.currentFactor) * r.hours);
  const weightGw = sum(gw, (r) => performanceFactor(r, config.currentsOption) * r.hours);
  const dtwOverall = distanceOverall - weightOverall;
  const dtwGw = distanceGw - weightGw;

  const averageSpeed: OverallGoodWeather = {
    overall: timeAtSeaOverall > 0 ? distanceOverall / timeAtSeaOverall : 0,
    goodWeather: timeAtSeaGw > 0 ? distanceGw / timeAtSeaGw : 0,
  };
  const averagePerformanceSpeed: OverallGoodWeather = {
    overall: timeAtSeaOverall > 0 ? dtwOverall / timeAtSeaOverall : 0,
    goodWeather: timeAtSeaGw > 0 ? dtwGw / timeAtSeaGw : 0,
  };

  const averageConsumption = {} as Record<ConsFuel, OverallGoodWeather>;
  const consumedOverall = {} as Record<ConsFuel, number>;
  const consumedGw = {} as Record<ConsFuel, number>;
  for (const fuel of FUELS) {
    consumedOverall[fuel] = sum(all, (r) => r.consumption[fuel]);
    consumedGw[fuel] = sum(gw, (r) => r.consumption[fuel]);
    averageConsumption[fuel] = {
      overall: timeAtSeaOverall > 0 ? consumedOverall[fuel] / (timeAtSeaOverall / 24) : 0,
      goodWeather: timeAtSeaGw > 0 ? consumedGw[fuel] / (timeAtSeaGw / 24) : 0,
    };
  }

  return {
    timeAtSea: { overall: timeAtSeaOverall, goodWeather: timeAtSeaGw },
    distance: { overall: distanceOverall, goodWeather: distanceGw },
    distanceThroughWater: { overall: dtwOverall, goodWeather: dtwGw },
    averageSpeed,
    averagePerformanceSpeed,
    averageConsumption,
    consumedOverall,
    consumedGw,
  };
}

export function computeInterimResult(
  rows: TrackRow[],
  config: InterimCpConfig,
  routePath: Array<[number, number]> = [],
): InterimResult {
  const reports = buildDerivedReports(rows, config, routePath);
  const agg = aggregate(reports, config);

  const aboutSpeed = config.speedAboutIsPercent
    ? config.charterPartySpeedKn - (config.charterPartySpeedKn * config.speedAbout) / 100
    : config.charterPartySpeedKn - config.speedAbout;

  const hasTimeLoss = {
    overall: aboutSpeed > agg.averagePerformanceSpeed.overall,
    goodWeather: aboutSpeed > agg.averagePerformanceSpeed.goodWeather,
  };

  const distanceRatio =
    config.totalVoyageDistanceNm > 0 ? agg.distance.overall / config.totalVoyageDistanceNm : 1;
  const safeRatio = distanceRatio > 0 ? distanceRatio : 1;

  const projectedTimeLossGain: OverallGoodWeather = {
    overall:
      aboutSpeed > 0
        ? (agg.distanceThroughWater.overall / aboutSpeed - agg.timeAtSea.overall) / safeRatio
        : 0,
    goodWeather:
      aboutSpeed > 0
        ? (agg.distanceThroughWater.goodWeather / aboutSpeed - agg.timeAtSea.goodWeather) / safeRatio
        : 0,
  };

  const projectedConsumption = {} as Record<ConsFuel, OverallGoodWeather>;
  for (const fuel of FUELS) {
    const dailyAllowable = config.dailyAllowable[fuel] ?? 0;
    // Time Gain's own formula needs elapsed hours, not distance-through-water;
    // every other method needs distance-through-water — see module doc.
    const projectFor = (
      hasLoss: boolean,
      dtw: number,
      timeAtSea: number,
      actualConsumption: number,
    ): number => {
      if (actualConsumption === 0) return 0;
      // "Other" fuel replicates the legacy quirk of using the time-loss
      // tolerance even in the time-gain branch.
      const consumptionAbout =
        hasLoss || fuel === 'none' ? config.timeLossConsumptionAbout : config.timeGainConsumptionAbout;
      const firstArg = config.allowableMethod === 'TIME_GAIN' ? timeAtSea : dtw;
      const allowable = computeAllowableConsumption(config.allowableMethod, {
        distanceThroughWaterOrTimeAtSeaHours: firstArg,
        speed: config.charterPartySpeedKn,
        dailyAllowable,
        speedAbout: config.speedAbout,
        consumptionAbout,
      });
      return allowable.getConsumptionDifference(actualConsumption) / safeRatio;
    };

    projectedConsumption[fuel] = {
      overall: projectFor(
        hasTimeLoss.overall,
        agg.distanceThroughWater.overall,
        agg.timeAtSea.overall,
        agg.consumedOverall[fuel],
      ),
      goodWeather: projectFor(
        hasTimeLoss.goodWeather,
        agg.distanceThroughWater.goodWeather,
        agg.timeAtSea.goodWeather,
        agg.consumedGw[fuel],
      ),
    };
  }

  const goodWeatherPercent =
    agg.timeAtSea.overall > 0 ? (agg.timeAtSea.goodWeather / agg.timeAtSea.overall) * 100 : 0;

  return {
    timeAtSea: agg.timeAtSea,
    distance: agg.distance,
    distanceThroughWater: agg.distanceThroughWater,
    averageSpeed: agg.averageSpeed,
    averagePerformanceSpeed: agg.averagePerformanceSpeed,
    averageConsumption: agg.averageConsumption,
    aboutSpeed,
    hasTimeLoss,
    projectedTimeLossGain,
    projectedConsumption,
    goodWeatherPercent,
  };
}

export { normalizeCurrentFactor };
