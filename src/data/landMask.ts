/**
 * Global land mask used by the route optimizer to keep tracks off land.
 *
 * Backed by the Natural Earth 1:50m land polygons (`landPolygons.json`). At
 * this resolution the major shipping straits (Malacca, Gibraltar, Dover,
 * Hormuz, etc.) stay open, so the optimizer can thread them instead of being
 * forced on a long detour, while every continent and significant island is
 * still an impassable obstacle.
 *
 * `isLand()` is called hundreds of thousands of times per optimisation, so
 * each polygon ring carries a latitude-band edge index: a point-in-polygon
 * test only visits the handful of edges that actually span the query latitude
 * instead of walking the whole (often huge) continental ring.
 *
 * All coordinates in the source file are GeoJSON order, `[lon, lat]`.
 */

import landData from './landPolygons.json';

type Ring = number[][]; // [ [lon, lat], ... ]

interface PreppedRing {
  ring: Ring;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  bandSize: number;
  /** For each latitude band, the indices of edges whose lat-span covers it. */
  bands: number[][];
}

interface PreppedPolygon {
  outer: PreppedRing;
  holes: PreppedRing[];
}

function prepRing(ring: Ring): PreppedRing {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const [lon, lat] of ring) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }

  const n = ring.length;
  const nBands = Math.min(512, Math.max(1, Math.round(n / 8)));
  const latRange = maxLat - minLat || 1e-9;
  const bandSize = latRange / nBands;
  const bands: number[][] = Array.from({ length: nBands }, () => []);
  for (let k = 0; k < n; k += 1) {
    const ay = ring[k][1];
    const by = ring[(k + 1) % n][1];
    const lo = ay < by ? ay : by;
    const hi = ay < by ? by : ay;
    let b0 = Math.floor((lo - minLat) / bandSize);
    let b1 = Math.floor((hi - minLat) / bandSize);
    if (b0 < 0) b0 = 0;
    if (b1 > nBands - 1) b1 = nBands - 1;
    for (let b = b0; b <= b1; b += 1) bands[b].push(k);
  }

  return { ring, minLat, maxLat, minLon, maxLon, bandSize, bands };
}

const PREPPED_LAND: PreppedPolygon[] = [];

interface Feature {
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
}

for (const feature of (landData as { features: Feature[] }).features) {
  const { type, coordinates } = feature.geometry;
  // Normalise Polygon (Ring[]) and MultiPolygon (Ring[][]) to a list of
  // polygons, each an array of rings where ring[0] is the outer boundary and
  // any following rings are holes (lakes / inland gaps).
  const polygons: Ring[][] =
    type === 'Polygon' ? [coordinates as Ring[]] : (coordinates as Ring[][]);
  for (const rings of polygons) {
    if (rings.length === 0) continue;
    PREPPED_LAND.push({
      outer: prepRing(rings[0]),
      holes: rings.slice(1).map(prepRing),
    });
  }
}

/** Wrap a longitude into [-180, 180). */
const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

/**
 * Ray-casting point-in-ring test that only inspects edges spanning `lat`,
 * using the ring's latitude-band index. Guarded by the ring bounding box.
 */
function pointInRing(lat: number, lon: number, pr: PreppedRing): boolean {
  if (lat < pr.minLat || lat > pr.maxLat || lon < pr.minLon || lon > pr.maxLon) {
    return false;
  }
  let b = Math.floor((lat - pr.minLat) / pr.bandSize);
  if (b < 0) b = 0;
  else if (b > pr.bands.length - 1) b = pr.bands.length - 1;
  const edges = pr.bands[b];
  const ring = pr.ring;
  const n = ring.length;
  let inside = false;
  for (let e = 0; e < edges.length; e += 1) {
    const k = edges[e];
    const a = ring[k];
    const c = ring[(k + 1) % n];
    const ax = a[0];
    const ay = a[1];
    const cx = c[0];
    const cy = c[1];
    if (ay > lat !== cy > lat) {
      if (lon < ((cx - ax) * (lat - ay)) / (cy - ay) + ax) inside = !inside;
    }
  }
  return inside;
}

/** True if the given point falls on land. */
export function isLand(lat: number, lon: number): boolean {
  const lo = wrapLon(lon);
  for (const poly of PREPPED_LAND) {
    if (!pointInRing(lat, lo, poly.outer)) continue;
    let inHole = false;
    for (const h of poly.holes) {
      if (pointInRing(lat, lo, h)) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}
