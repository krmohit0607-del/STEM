/**
 * Land polygon geometry for clipping the weather field's colour contour to
 * water only, with a true vector-accurate coastline — not a grid-sampled
 * approximation (see `WeatherFieldLayer.tsx`, which boolean-differences its
 * contour polygons against these). Separate from `landMask.ts` (a fast
 * point-in-polygon *test* used by the route optimizer) because this needs
 * actual ring geometry to feed into `polygon-clipping`.
 *
 * Backed by the same Natural Earth 1:50m land polygons. All coordinates are
 * GeoJSON order, `[lon, lat]`.
 */

import landData from './landPolygons.json';

type Ring = number[][];
type Polygon = Ring[]; // first ring = outer, rest = holes

export interface LonLatBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

interface Feature {
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
}

interface PreppedPolygon {
  polygon: Polygon;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

function bboxOf(ring: Ring) {
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
  return { minLat, maxLat, minLon, maxLon };
}

const POLYGONS: PreppedPolygon[] = [];
for (const feature of (landData as { features: Feature[] }).features) {
  const { type, coordinates } = feature.geometry;
  const polygons: Polygon[] = type === 'Polygon' ? [coordinates as Polygon] : (coordinates as Polygon[]);
  for (const polygon of polygons) {
    if (!polygon.length || polygon[0].length < 3) continue;
    POLYGONS.push({ polygon, ...bboxOf(polygon[0]) });
  }
}

function lerpPoint(a: number[], b: number[], t: number): number[] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Sutherland–Hodgman clip of a ring against an axis-aligned rectangle —
 *  bounds the vertex count fed into the (much pricier) polygon-clipping
 *  boolean op, regardless of how large the source landmass is. */
function clipRingToBounds(ring: Ring, b: LonLatBounds): Ring {
  if (ring.length < 3) return [];
  const clipEdge = (
    pts: Ring,
    inside: (p: number[]) => boolean,
    edge: (a: number[], c: number[]) => number[],
  ): Ring => {
    if (pts.length === 0) return pts;
    const out: Ring = [];
    for (let i = 0; i < pts.length; i += 1) {
      const curr = pts[i];
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const currIn = inside(curr);
      const prevIn = inside(prev);
      if (currIn) {
        if (!prevIn) out.push(edge(prev, curr));
        out.push(curr);
      } else if (prevIn) {
        out.push(edge(prev, curr));
      }
    }
    return out;
  };
  let pts: Ring = ring;
  pts = clipEdge(pts, (p) => p[0] >= b.west, (a, c) => lerpPoint(a, c, (b.west - a[0]) / (c[0] - a[0])));
  pts = clipEdge(pts, (p) => p[0] <= b.east, (a, c) => lerpPoint(a, c, (b.east - a[0]) / (c[0] - a[0])));
  pts = clipEdge(pts, (p) => p[1] >= b.south, (a, c) => lerpPoint(a, c, (b.south - a[1]) / (c[1] - a[1])));
  pts = clipEdge(pts, (p) => p[1] <= b.north, (a, c) => lerpPoint(a, c, (b.north - a[1]) / (c[1] - a[1])));
  return pts.length >= 3 ? pts : [];
}

/** Ramer–Douglas–Peucker simplification of a ring, run with the first/last
 *  point as fixed anchors. Degenerate on closed rings (first === last) for
 *  the very first split, but still converges to a reasonable simplification
 *  — good enough to bound vertex count, not a precision-critical operation. */
function simplifyRing(ring: Ring, epsilon: number): Ring {
  if (epsilon <= 0 || ring.length <= 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;
  const sqEpsilon = epsilon * epsilon;
  const stack: Array<[number, number]> = [[0, ring.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    if (end <= start + 1) continue;
    const [x1, y1] = ring[start];
    const [x2, y2] = ring[end];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    let maxDistSq = -1;
    let maxIdx = -1;
    for (let i = start + 1; i < end; i += 1) {
      const [px, py] = ring[i];
      let distSq: number;
      if (lenSq === 0) {
        const ddx = px - x1;
        const ddy = py - y1;
        distSq = ddx * ddx + ddy * ddy;
      } else {
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
        const cx = x1 + t * dx;
        const cy = y1 + t * dy;
        const ddx = px - cx;
        const ddy = py - cy;
        distSq = ddx * ddx + ddy * ddy;
      }
      if (distSq > maxDistSq) {
        maxDistSq = distSq;
        maxIdx = i;
      }
    }
    if (maxDistSq > sqEpsilon) {
      keep[maxIdx] = 1;
      stack.push([start, maxIdx]);
      stack.push([maxIdx, end]);
    }
  }
  const result: Ring = [];
  for (let i = 0; i < ring.length; i += 1) if (keep[i]) result.push(ring[i]);
  return result;
}

/**
 * Land polygons intersecting `bounds` (with a small padding margin), each
 * ring pre-clipped to that padded viewport so the boolean difference stays
 * cheap no matter how large the source landmass (e.g. all of Eurasia) is.
 */
export function landPolygonsInBounds(bounds: LonLatBounds): Polygon[] {
  const pad = Math.max(0.5, (bounds.east - bounds.west) * 0.05);
  const padded: LonLatBounds = {
    west: bounds.west - pad,
    east: bounds.east + pad,
    south: bounds.south - pad,
    north: bounds.north + pad,
  };
  // At a zoomed-out (world) view, essentially every coastline on Earth falls
  // inside the viewport at full 1:50m vertex detail, which is what made the
  // land-clip boolean op slow (and, past a point, unreliable) at low zoom.
  // Full detail isn't visually distinguishable at that scale anyway, so
  // simplify proportionally to how much of the world is in view; a normal,
  // reasonably-zoomed-in viewport gets epsilon 0 (no simplification, full
  // coastline precision).
  const viewportDeg = bounds.east - bounds.west;
  const epsilon = viewportDeg > 40 ? viewportDeg * 0.0025 : 0;
  const out: Polygon[] = [];
  for (const p of POLYGONS) {
    if (p.maxLat < padded.south || p.minLat > padded.north || p.maxLon < padded.west || p.minLon > padded.east) {
      continue;
    }
    const outer = simplifyRing(clipRingToBounds(p.polygon[0], padded), epsilon);
    if (outer.length < 3) continue;
    const holes = p.polygon
      .slice(1)
      .map((h) => simplifyRing(clipRingToBounds(h, padded), epsilon))
      .filter((h) => h.length >= 3);
    out.push([outer, ...holes]);
  }
  return out;
}
