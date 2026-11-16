import { api } from './client';

/** Mirrors the backend's `MaritimeRegionDto` (see MaritimeRegionsController.cs). */
export interface MaritimeRegionApiDto {
  name: string;
  kind: string | null;
}

/**
 * Looks up the named maritime region (strait/channel/passage/gulf/bay/sea/
 * ocean) at a lat/lon via the backend's Marine Regions gazetteer proxy —
 * see `MaritimeRegionsController.cs`/`MaritimeRegionService.cs`. Backed by
 * the authoritative public marineregions.org service (IHO "Limits of Oceans
 * and Seas" + the SeaVoX sea/strait/channel gazetteer), cached server-side
 * indefinitely since this is static geography.
 */
export function fetchMaritimeRegion(lat: number, lon: number): Promise<MaritimeRegionApiDto | null> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  return api.get<MaritimeRegionApiDto | null>(`/api/maritime-regions/lookup?${params.toString()}`);
}
