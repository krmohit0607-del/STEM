/**
 * Chaikin corner-cutting for closed polygon rings — shared by the weather
 * field's contour rendering (`WeatherFieldLayer.tsx`) and the land-mask
 * clipping geometry (`landMaskGeo.ts`).
 *
 * Each iteration replaces every edge with two points at 1/4 and 3/4 along
 * it, which rounds off every corner without materially changing the
 * enclosed area or shifting the boundary far from its original position —
 * exactly what turns a marching-squares / simplified-polygon "staircase"
 * into the smooth, organic curve real coastlines and weather-chart isolines
 * actually have, at a small, bounded (roughly ×2 per iteration) vertex-count
 * cost rather than needing far denser source sampling to look smooth.
 */

type Ring = number[][]; // cyclic polygon ring, possibly closed (first === last)

/**
 * Smooth a polygon ring with `iterations` passes of Chaikin corner-cutting.
 * Rings produced elsewhere in this codebase are cyclic but not always
 * explicitly closed (d3-contour duplicates the first point as the last;
 * geometry that has passed through a Sutherland–Hodgman bounds clip may not)
 * — detected here rather than assumed, so a non-duplicated ring doesn't
 * silently lose its last vertex, and closure is only restored if the input
 * actually had it.
 */
export function chaikinSmoothRing(ring: Ring, iterations = 2): Ring {
  if (ring.length < 5 || iterations <= 0) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  const closed = first[0] === last[0] && first[1] === last[1];
  let pts = closed ? ring.slice(0, -1) : ring.slice();
  for (let it = 0; it < iterations && pts.length >= 3; it += 1) {
    const n = pts.length;
    const next: Ring = new Array(n * 2);
    for (let i = 0; i < n; i += 1) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % n];
      next[i * 2] = [p0[0] * 0.75 + p1[0] * 0.25, p0[1] * 0.75 + p1[1] * 0.25];
      next[i * 2 + 1] = [p0[0] * 0.25 + p1[0] * 0.75, p0[1] * 0.25 + p1[1] * 0.75];
    }
    pts = next;
  }
  if (closed) pts.push(pts[0]);
  return pts;
}
