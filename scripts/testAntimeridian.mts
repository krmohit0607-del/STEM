import assert from 'node:assert/strict';
import {
  crossesAntimeridian,
  getAntimeridianAwareBounds,
  normalizeLongitude,
  splitRingAtAntimeridian,
  wrappedMapCopies,
  unwrapRouteCoordinates,
  wrapLongitudeNear,
  wrapPointNear,
  antimeridianAwareBoundsBox,
  needsWorldCopies,
  worldCopyOffsets,
  offsetPoint,
  offsetPoints,
} from '../src/data/antimeridian.ts';

assert.equal(normalizeLongitude(181), -179);
assert.equal(normalizeLongitude(540), -180);
assert.equal(normalizeLongitude(-181), 179);
assert.deepEqual(unwrapRouteCoordinates([[10, 179], [10, -179], [11, -178]]), [[10, 179], [10, 181], [11, 182]]);
assert.deepEqual(unwrapRouteCoordinates([[10, -179], [10, 179], [11, 178]]), [[10, -179], [10, -181], [11, -182]]);
assert.deepEqual(unwrapRouteCoordinates([[10, 10], [10, 20], [10, 30]]), [[10, 10], [10, 20], [10, 30]]);
assert.equal(crossesAntimeridian([[10, 179], [10, -179]]), true);
assert.equal(crossesAntimeridian([[10, 10], [10, 20]]), false);
const bounds = getAntimeridianAwareBounds([[10, 179], [10, -179], [20, 178], [20, -178]]);
assert.ok(bounds);
assert.ok(bounds[1][1] - bounds[0][1] < 10);
const parts = splitRingAtAntimeridian([[10, 179], [10, -179], [20, -179], [20, 179], [10, 179]]);
assert.equal(parts.length, 2);
for (const part of parts) {
  assert.deepEqual(part[0], part[part.length - 1]);
  assert.ok(part.every(([, lon]) => lon >= -180 && lon <= 180));
}
assert.equal(wrappedMapCopies(parts[0]).length, 3);

// Markers must land in the same world-copy as a route polyline that was unwrapped near 180.
assert.equal(wrapLongitudeNear(-179, 181), 181);
assert.equal(wrapLongitudeNear(179, -181), -181);
assert.equal(wrapLongitudeNear(10, 5), 10);
assert.deepEqual(wrapPointNear([5, -179], 181), [5, 181]);

// A route crossing the dateline gets a narrow box around it, not a near-whole-world one.
const crossingBox = antimeridianAwareBoundsBox([[10, 179], [12, -178]]);
assert.ok(crossingBox);
assert.ok(crossingBox.east - crossingBox.west < 10, `expected a narrow box, got west=${crossingBox.west} east=${crossingBox.east}`);
assert.ok(crossingBox.east > 180, 'expected the box to extend past 180 rather than wrap back around');
const plainBox = antimeridianAwareBoundsBox([[10, 10], [12, 20]]);
assert.ok(plainBox);
assert.ok(Math.abs(plainBox.west - 10) < 1 && Math.abs(plainBox.east - 20) < 1, `expected ~10..20, got west=${plainBox.west} east=${plainBox.east}`);

// Geometry near the dateline needs rendering at the adjacent world copies too
// (worldCopyJump lets a user pan freely into them), plain geometry doesn't.
assert.equal(needsWorldCopies([[10, 179]]), true);
assert.equal(needsWorldCopies([[10, -175]]), true);
assert.equal(needsWorldCopies([[10, 10]]), false);
assert.deepEqual(worldCopyOffsets([[10, 179]]), [-360, 0, 360]);
assert.deepEqual(worldCopyOffsets([[10, 10]]), [0]);
assert.deepEqual(offsetPoint([10, 179], 360), [10, 539]);
assert.deepEqual(offsetPoint([10, 179], 0), [10, 179]);
assert.deepEqual(offsetPoints([[10, 179], [11, 180]], -360), [[10, -181], [11, -180]]);

console.log('Antimeridian utility tests passed.');
