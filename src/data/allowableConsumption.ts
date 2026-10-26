/**
 * Allowable Consumption Calculation (ACC) strategies.
 *
 * Ports the legacy `FleetViewCore.BL\Voyage\ACC\*` strategy classes exactly
 * (including their quirks, per product decision): each method answers "how
 * much fuel was the vessel allowed to burn for the distance/time covered
 * under its charter-party speed and consumption tolerances?", and the
 * resulting over/under-consumption is `currentConsumption - allowable`
 * (positive = over-consumption, negative = under-consumption), except for
 * Gaz Energy which instead uses a `[minimum, maximum]` tolerance band.
 *
 * Maps 1:1 to the `CP_ALLOWABLE_FUEL_METHOD_OPTIONS` dropdown in
 * `components/voyage/types.ts`.
 */

export type AllowableConsumptionMethodType =
  | 'DOUBLE_ABOUT'
  | 'FIVE_PERCENT'
  | 'HALF_KNOTS'
  | 'TIME_GAIN'
  | 'GAZ_ENERGY';

/** Maps a `CP_ALLOWABLE_FUEL_METHOD_OPTIONS` label to its internal method key. */
export function allowableConsumptionMethodFromOption(option: string): AllowableConsumptionMethodType {
  switch (option) {
    case '5%':
      return 'FIVE_PERCENT';
    case 'Gaz Energy':
      return 'GAZ_ENERGY';
    case 'Half Knots':
      return 'HALF_KNOTS';
    case 'Time Gain':
      return 'TIME_GAIN';
    case 'Double About':
    default:
      return 'DOUBLE_ABOUT';
  }
}

export interface AllowableConsumptionParams {
  /**
   * Distance through water (NM) for every method except Time Gain, which
   * reuses this same slot for elapsed time at sea (hours) — matching the
   * legacy `AllowableConsumptionTimeGain.Configure`, which despite its
   * parameter name treats the first argument as elapsed hours.
   */
  distanceThroughWaterOrTimeAtSeaHours: number;
  /** Observed/performance speed (knots). Ignored by Time Gain. */
  speed: number;
  /** Charter-party daily allowable consumption (MT/day). */
  dailyAllowable: number;
  /** CP speed tolerance (knots), subtracted from speed for Double About / Half Knots / Gaz Energy. */
  speedAbout: number;
  /** CP consumption tolerance as a fraction (e.g. `0.05` for 5%). */
  consumptionAbout: number;
}

export interface AllowableConsumptionResult {
  /** The single allowable value used by every method except Gaz Energy (which returns its minimum here). */
  allowable: number;
  minimum: number;
  maximum: number;
  /** `currentConsumption - allowable` for most methods; Gaz Energy returns `0` inside its `[minimum, maximum]` band. */
  getConsumptionDifference: (currentConsumption: number) => number;
}

/** `currentConsumption - allowable`: positive = over-consumption, negative = under-consumption. */
function simpleDifference(allowable: number) {
  return (currentConsumption: number) => currentConsumption - allowable;
}

export function computeAllowableConsumption(
  method: AllowableConsumptionMethodType,
  params: AllowableConsumptionParams,
): AllowableConsumptionResult {
  const { distanceThroughWaterOrTimeAtSeaHours: dtw, speed, dailyAllowable, speedAbout, consumptionAbout } = params;

  switch (method) {
    case 'DOUBLE_ABOUT': {
      const effectiveSpeed = speed === 0 ? 0 : speed - speedAbout;
      const days = effectiveSpeed === 0 ? 0 : dtw / effectiveSpeed / 24;
      const allowable = days * dailyAllowable * (1 + consumptionAbout);
      return { allowable, minimum: allowable, maximum: allowable, getConsumptionDifference: simpleDifference(allowable) };
    }
    case 'FIVE_PERCENT': {
      // Despite the name, the tolerance comes entirely from `consumptionAbout` —
      // this class does not hard-code 5%. Speed is used as-is (no speedAbout subtraction).
      const days = speed === 0 ? 0 : dtw / speed / 24;
      const allowable = days * dailyAllowable * (1 + consumptionAbout);
      return { allowable, minimum: allowable, maximum: allowable, getConsumptionDifference: simpleDifference(allowable) };
    }
    case 'HALF_KNOTS': {
      const effectiveSpeed = speed === 0 ? 0 : speed - speedAbout;
      const days = effectiveSpeed === 0 ? 0 : dtw / effectiveSpeed / 24;
      // consumptionAbout is ignored by this method.
      const allowable = days * dailyAllowable;
      return { allowable, minimum: allowable, maximum: allowable, getConsumptionDifference: simpleDifference(allowable) };
    }
    case 'TIME_GAIN': {
      const days = dtw === 0 ? 0 : dtw / 24;
      const allowable = days * dailyAllowable * (1 + consumptionAbout);
      return { allowable, minimum: allowable, maximum: allowable, getConsumptionDifference: simpleDifference(allowable) };
    }
    case 'GAZ_ENERGY': {
      const effectiveSpeed = speed === 0 ? 0 : speed - speedAbout;
      const days = dtw === 0 || effectiveSpeed === 0 ? 0 : dtw / (effectiveSpeed * 24);
      const minimum = days * dailyAllowable * (1 - consumptionAbout);
      const maximum = days * dailyAllowable * (1 + consumptionAbout);
      return {
        allowable: minimum,
        minimum,
        maximum,
        getConsumptionDifference: (currentConsumption: number) => {
          if (currentConsumption < minimum) return currentConsumption - minimum;
          if (currentConsumption > maximum) return currentConsumption - maximum;
          return 0;
        },
      };
    }
    default:
      return { allowable: 0, minimum: 0, maximum: 0, getConsumptionDifference: () => 0 };
  }
}
