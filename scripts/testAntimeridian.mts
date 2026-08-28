import assert from 'node:assert/strict';
import {
  crossesAntimeridian,
  getAntimeridianAwareBounds,
  normalizeLongitude,
  splitRingAtAntimeridian,
  wrappedMapCopies,
  unwrapRouteCoordinates,
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
console.log('Antimeridian utility tests passed.');
