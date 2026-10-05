import { api } from './client';

/**
 * Active tropical cyclone/typhoon/depression, normalised from NOAA's
 * National Hurricane Center and the Joint Typhoon Warning Center by the
 * backend's `/api/cyclones/active` endpoint.
 */
export interface CycloneDto {
  id: string;
  source: 'NOAA' | 'JTWC' | string;
  name: string;
  classification?: string | null;
  classificationLabel?: string | null;
  basin?: string | null;
  warningNumber?: string | null;
  latitude: number;
  longitude: number;
  maxSustainedWindKt?: number | null;
  pressureMb?: number | null;
  movementDirectionDeg?: number | null;
  movementSpeedKt?: number | null;
  lastUpdateUtc?: string | null;
  advisoryUrl?: string | null;
  graphicUrl?: string | null;
  imageUrl?: string | null;
  /** Ordered track points (current position first, then forecast positions). */
  track: CycloneLatLng[];
  /** Forecast cone-of-uncertainty polygon ring, when the source provides one (NOAA only). */
  conePolygon: CycloneLatLng[];
}

export interface CycloneLatLng {
  lat: number;
  lon: number;
}

/** Fetch every currently active cyclone from NOAA + JTWC (backend-cached, ~15 min). */
export function fetchActiveCyclones(): Promise<CycloneDto[]> {
  return api.get<CycloneDto[]>('/api/cyclones/active');
}
