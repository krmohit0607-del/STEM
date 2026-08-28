/** Shared antimeridian helpers. Coordinates are Leaflet order: [lat, lon]. */
export type LatLon = [number, number];
export type LatLngBoundsTuple = [[number, number], [number, number]];

/** Normalize a longitude to the canonical storage/API range [-180, 180). */
export function normalizeLongitude(longitude: number): number {
  if (!Number.isFinite(longitude)) return longitude;
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

export function normalizeCoordinate([lat, lon]: LatLon): LatLon {
  return [lat, normalizeLongitude(lon)];
}

export function normalizeCoordinates(points: LatLon[]): LatLon[] {
  return points.map(normalizeCoordinate);
}

/** Unwrap an ordered path so consecutive longitudes take the shortest route. */
export function unwrapLongitudes(points: LatLon[]): LatLon[] {
  if (points.length === 0) return [];
  const first = normalizeLongitude(points[0][1]);
  const result: LatLon[] = [[points[0][0], first]];
  for (let index = 1; index < points.length; index += 1) {
    let longitude = normalizeLongitude(points[index][1]);
    const previous = result[index - 1][1];
    while (longitude - previous > 180) longitude -= 360;
    while (longitude - previous < -180) longitude += 360;
    result.push([points[index][0], longitude]);
  }
  return result;
}

export const unwrapRouteCoordinates = unwrapLongitudes;

export function crossesAntimeridian(points: LatLon[], closed = false): boolean {
  if (points.length < 2) return false;
  const normalized = normalizeCoordinates(points);
  const count = closed ? normalized.length : normalized.length - 1;
  for (let index = 0; index < count; index += 1) {
    const next = normalized[(index + 1) % normalized.length];
    if (Math.abs(next[1] - normalized[index][1]) > 180) return true;
  }
  return false;
}

/**
 * Return the smallest longitude arc containing all points. The east bound may
 * exceed 180 because it is a rendering bound, never a persisted coordinate.
 */
export function getAntimeridianAwareBounds(points: LatLon[], padding = 0): LatLngBoundsTuple | null {
  if (points.length === 0) return null;
  const normalized = normalizeCoordinates(points);
  const latitudes = normalized.map(([lat]) => lat);
  const longitudes = normalized.map(([, lon]) => (lon + 360) % 360).sort((a, b) => a - b);
  let largestGap = -1;
  let gapStart = longitudes[0];
  for (let index = 0; index < longitudes.length; index += 1) {
    const current = longitudes[index];
    const next = index === longitudes.length - 1 ? longitudes[0] + 360 : longitudes[index + 1];
    const gap = next - current;
    if (gap > largestGap) {
      largestGap = gap;
      gapStart = next;
    }
  }
  const westUnwrapped = gapStart;
  const eastUnwrapped = westUnwrapped + (360 - largestGap);
  const unwrappedLons = normalized.map(([, lon]) => {
    let value = lon < westUnwrapped ? lon + 360 : lon;
    while (value < westUnwrapped) value += 360;
    while (value > eastUnwrapped) value -= 360;
    return value;
  });
  const west = Math.min(...unwrappedLons) - padding;
  const east = Math.max(...unwrappedLons) + padding;
  return [[Math.min(...latitudes) - padding, west], [Math.max(...latitudes) + padding, east]];
}

/** Split a closed [lat, lon] ring into dateline-safe rendering rings. */
export function splitRingAtAntimeridian(ring: LatLon[]): LatLon[][] {
  if (ring.length < 3 || !crossesAntimeridian(ring, true)) return [normalizeCoordinates(ring)];
  const normalizedRing = normalizeCoordinates(ring);
  const discontinuities = normalizedRing
    .map((point, index) => ({ index, jump: Math.abs(normalizedRing[(index + 1) % normalizedRing.length][1] - point[1]) }))
    .filter((edge) => edge.jump > 120)
    .map((edge) => edge.index);

  // Some imported KML records concatenate separate distant polygons into one
  // ring. When multiple complete fragments are separated by dateline-sized
  // jumps, render the fragments independently instead of filling the oceans
  // between them as one polygon.
  if (discontinuities.length >= 2) {
    const fragments: LatLon[][] = [];
    for (let index = 0; index < discontinuities.length; index += 1) {
      const start = (discontinuities[index] + 1) % normalizedRing.length;
      const end = discontinuities[(index + 1) % discontinuities.length];
      const fragment: LatLon[] = [];
      let cursor = start;
      while (true) {
        fragment.push(normalizedRing[cursor]);
        if (cursor === end) break;
        cursor = (cursor + 1) % normalizedRing.length;
      }
      if (fragment.length >= 4) fragments.push([...fragment, [...fragment[0]] as LatLon]);
    }
    if (fragments.length >= 2) return fragments;
  }

  const shifted: LatLon[] = normalizedRing.map(([lat, lon]) => [lat, lon < 0 ? lon + 360 : lon]);
  const clip = (keepGreater: boolean): LatLon[] => {
    const result: LatLon[] = [];
    const inside = (lon: number) => keepGreater ? lon >= 180 : lon <= 180;
    for (let index = 0; index < shifted.length; index += 1) {
      const current = shifted[index];
      const previous = shifted[(index + shifted.length - 1) % shifted.length];
      const currentInside = inside(current[1]);
      const previousInside = inside(previous[1]);
      if (currentInside !== previousInside) {
        const ratio = (180 - previous[1]) / (current[1] - previous[1]);
        result.push([previous[0] + (current[0] - previous[0]) * ratio, 180]);
      }
      if (currentInside) result.push(current);
    }
    return result;
  };
  const closeForRendering = (points: LatLon[]): LatLon[] => {
    // Keep both pieces in the same Leaflet world around +180. Converting the
    // eastern piece to -180 makes Leaflet close it across the entire map.
    const rendered = points.map(([lat, lon]) => [lat, lon] as LatLon);
    if (rendered.length > 0) rendered.push([...rendered[0]] as LatLon);
    return rendered;
  };
  const western = clip(false);
  const eastern = clip(true).map(([lat, lon]) => [lat, lon - 360] as LatLon);
  return [western, eastern].filter((part) => part.length >= 4).map(closeForRendering);
}

/**
 * Return adjacent Leaflet world copies for a dateline-split part. Leaflet
 * wraps the base map, but vector layers do not always duplicate themselves at
 * the viewport edges, so both meridian sides must be supplied explicitly.
 */
export function wrappedMapCopies(points: LatLon[]): LatLon[][] {
  return [-360, 0, 360].map((offset) => points.map(([lat, lon]) => [lat, lon + offset] as LatLon));
}

export function normalizeGeometryForStorage(points: LatLon[]): LatLon[] {
  return normalizeCoordinates(points);
}
