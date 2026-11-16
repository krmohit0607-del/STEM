import { buildView } from '../components/voyage/buildView';
import type { OptimizationOperatingProfileApiDto } from '../api/optimizationApi';
import type { Voyage } from './voyages';
import { loadVoyageShared } from './voyageOverrides';

const readNumber = (value: string) => {
  const parsed = Number.parseFloat(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Load condition and configured Speed & Cons operating profiles of the selected voyage leg. Uses the rows the user saved for that leg when
 * present, otherwise falls back to the same leg's displayed (CP/instructed-derived) rows — mirroring VoyageDetailsPage's own display merge —
 * so optimization isn't blocked just because the Speed & Cons table was never explicitly opened and re-saved.
 */
export function buildOperatingProfiles(
  voyage: Voyage | undefined,
  selectedLegNo: string | undefined,
): { loadCondition: 'Ballast' | 'Laden'; profiles: OptimizationOperatingProfileApiDto[] } {
  const view = voyage ? buildView(voyage) : null;
  const leg = view?.legs.find((item) => item.no === selectedLegNo) ?? view?.legs[0];
  const loadCondition: 'Ballast' | 'Laden' = leg?.type.toLowerCase().includes('ballast') ? 'Ballast' : 'Laden';
  const legIndex = Math.max(0, view?.legs.findIndex((item) => item.no === selectedLegNo) ?? 0);
  const sharedRows = voyage ? loadVoyageShared(voyage.id)?.legSpeedProfiles?.[legIndex]?.speedCons : undefined;
  const rows = sharedRows?.length ? sharedRows : leg?.speedCons ?? [];
  const profiles = rows
    .map((row) => ({
      mode: row.description.trim().toUpperCase(),
      isCpDefault: !!row.isDefault,
      loadCondition,
      speedKn: readNumber(row.speed),
      rpm: null,
      powerKw: null,
      mcrPercent: null,
      fuelType1: row.fuelType1.trim(),
      dailyCons1Mt: readNumber(row.dailyCons1),
      fuelType2: row.fuelType2.trim(),
      dailyCons2Mt: readNumber(row.dailyCons2),
      fuelType3: row.fuelType3.trim(),
      dailyCons3Mt: readNumber(row.dailyCons3),
    }))
    .filter((profile) => profile.speedKn > 0);
  return { loadCondition, profiles };
}
