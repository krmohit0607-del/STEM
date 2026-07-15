/**
 * Shared per-voyage constraint fields that are synchronised between the
 * Voyage Details page and the Limits & Constraints page.
 *
 * Only the overlapping fields live here (market factors + weather safety
 * limits). Both pages seed from the voyage and then read/write this store, so
 * an edit on either page is reflected on the other. Keyed by voyage id in
 * localStorage; swap for the real API when the endpoint is exposed.
 */

export interface VoyageSharedFields {
  // Service type (drives which constraint sections are shown).
  serviceType: string;
  // Market factors
  hireRate: string;
  foPrice: string;
  goPrice: string;
  euaPrice: string;
  // Optional third fuel grade (blank when the vessel runs on two fuels only).
  // Read by the Tracksheet to show a third fuel column group.
  thirdFuelType: string;
  // Weather safety limits (ballast / laden)
  wslMaxSwhBallast: string;
  wslMaxSwhLaden: string;
  wslMaxWindsBallast: string;
  wslMaxWindsLaden: string;
  wslMaxSeaStateBallast: string;
  wslMaxSeaStateLaden: string;
}

export const SHARED_FIELD_KEYS: (keyof VoyageSharedFields)[] = [
  'serviceType',
  'hireRate',
  'foPrice',
  'goPrice',
  'euaPrice',
  'thirdFuelType',
  'wslMaxSwhBallast',
  'wslMaxSwhLaden',
  'wslMaxWindsBallast',
  'wslMaxWindsLaden',
  'wslMaxSeaStateBallast',
  'wslMaxSeaStateLaden',
];

const key = (voyageId: string) => `fv.voyageShared.${voyageId}`;

/** Read the saved shared fields for a voyage (partial; undefined when none). */
export function loadVoyageShared(voyageId: string | undefined): Partial<VoyageSharedFields> | undefined {
  if (!voyageId) return undefined;
  try {
    const raw = window.localStorage.getItem(key(voyageId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as Partial<VoyageSharedFields>;
  } catch {
    /* ignore */
  }
  return undefined;
}

/** Merge a patch into the saved shared fields for a voyage. */
export function mergeVoyageShared(
  voyageId: string | undefined,
  patch: Partial<VoyageSharedFields>,
): void {
  if (!voyageId) return;
  try {
    const current = loadVoyageShared(voyageId) ?? {};
    window.localStorage.setItem(key(voyageId), JSON.stringify({ ...current, ...patch }));
  } catch {
    /* storage unavailable */
  }
}
