import assert from 'node:assert/strict';
import { cleanRoutePoints, parseCoordinate, parseRouteText } from '../src/data/routeImport.ts';

const close = (actual: number, expected: number, tolerance = 1e-4) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

// Coordinates
close(parseCoordinate(12.5), 12.5);
close(parseCoordinate('-12,5'), -12.5);
close(parseCoordinate("01\u00b0 16.0' N"), 1 + 16 / 60);
close(parseCoordinate("103\u00b0 50.250' W"), -(103 + 50.25 / 60));
close(parseCoordinate('N 12 30 30'), 12 + 30 / 60 + 30 / 3600);
close(parseCoordinate("-12\u00b0 30'"), -12.5);
close(parseCoordinate('0545N'), 5 + 45 / 60);
close(parseCoordinate('15347E'), 153 + 47 / 60);
close(parseCoordinate('0116.500S'), -(1 + 16.5 / 60));
assert.ok(Number.isNaN(parseCoordinate('WP1')));
assert.ok(Number.isNaN(parseCoordinate('')));

// RTZ with two routes, longitude written before latitude
const rtz = `<?xml version="1.0"?><routes>
<route version="1.1" xmlns="http://www.cirm.org/RTZ/1/1"><routeInfo routeName="Out"/><waypoints>
<waypoint id="1"><position lon="103.8" lat="1.2"/></waypoint>
<waypoint id="2"><position lat="5.5" lon="100.1"/></waypoint></waypoints></route>
<route version="1.1"><routeInfo routeName="Back"/><waypoints>
<waypoint id="1"><position lat="5.5" lon="100.1"/></waypoint>
<waypoint id="2"><position lat="1.2" lon="103.8"/></waypoint></waypoints></route></routes>`;
const rtzResult = parseRouteText(rtz, 'rtz');
assert.equal(rtzResult.routes.length, 2);
assert.equal(rtzResult.routes[0].name, 'Out');
assert.deepEqual(rtzResult.routes[0].points, [[1.2, 103.8], [5.5, 100.1]]);
assert.deepEqual(rtzResult.routes[1].points, [[5.5, 100.1], [1.2, 103.8]]);

// GPX route
const gpx = '<gpx><rte><name>Test</name><rtept lat="10" lon="20"/><rtept lat="11" lon="21"/></rte></gpx>';
assert.deepEqual(parseRouteText(gpx, 'gpx').routes[0].points, [[10, 20], [11, 21]]);

// GeoJSON is [lon, lat]
const geo = JSON.stringify({ type: 'Feature', properties: { name: 'Geo' }, geometry: { type: 'LineString', coordinates: [[103.8, 1.2], [100.1, 5.5]] } });
const geoResult = parseRouteText(geo, 'json');
assert.equal(geoResult.routes[0].name, 'Geo');
assert.deepEqual(geoResult.routes[0].points, [[1.2, 103.8], [5.5, 100.1]]);

// Waypoint objects with DM text
const wp = JSON.stringify({ name: 'WP', waypoints: [{ lat: "01\u00b0 16.0' N", lon: "103\u00b0 50.0' E" }, { lat: 5.5, lng: 100.1 }] });
close(parseRouteText(wp, 'json').routes[0].points[0][0], 1 + 16 / 60);

// A file with latitude and longitude the wrong way round is repaired
const swapped = parseRouteText('lat,lon\n103.8,1.2\n100.1,5.5', 'csv');
assert.deepEqual(swapped.routes[0].points, [[1.2, 103.8], [5.5, 100.1]]);
assert.ok(swapped.notes.some((note) => note.includes('swapped')));

// JRC export with two routes in one file stays two routes
const jrc = 'Route,No,Latitude,Longitude\r\nA,1,1.2,103.8\r\nA,2,5.5,100.1\r\nB,1,5.5,100.1\r\nB,2,1.2,103.8\r\n';
const jrcResult = parseRouteText(jrc, 'csv');
assert.equal(jrcResult.routes.length, 2);
assert.equal(jrcResult.routes[1].name, 'B');

// Same without a route column: the waypoint number starting again begins a new route
const indexed = parseRouteText('Index,Lat,Lon\n1,1.2,103.8\n2,5.5,100.1\n1,10,110\n2,11,111', 'csv', 'file');
assert.equal(indexed.routes.length, 2);
assert.equal(indexed.routes[0].name, 'file 1');

// Semicolon and decimal comma
const european = parseRouteText('Lat;Lon\n1,2;103,8\n5,5;100,1', 'csv');
assert.deepEqual(european.routes[0].points, [[1.2, 103.8], [5.5, 100.1]]);

// Tokimec style degrees/minutes
const tokimec = parseRouteText("WPT,LAT,LON,SPD\n1,01\u00b0 16.0' N,103\u00b0 50.0' E,12\n2,05\u00b0 30.0' N,100\u00b0 06.0' E,12", 'csv');
close(tokimec.routes[0].points[1][0], 5.5);
close(tokimec.routes[0].points[1][1], 100.1);

// Furuno simple
const furuno = '$ROUTE,Strait\r\n01,0116.000N,10350.000E\r\n02,0530.000N,10006.000E\r\n';
const furunoResult = parseRouteText(furuno, 'txt');
assert.equal(furunoResult.routes[0].name, 'Strait');
close(furunoResult.routes[0].points[0][0], 1 + 16 / 60);

// Degrees, minutes and hemisphere in separate columns, header written as a comment
const split = [
  '// V13 L2,,SINGAPORE TO QINGDAO VIA TAIWAN STRAIT,,,,',
  '// WPT No.,LAT,,,LON,,',
  '0,1,15.884,N,103,57.856,E',
  '1,1,14.432,N,103,58.729,E',
  '2,35,58.632,N,120,34.773,E',
].join('\r\n');
const splitResult = parseRouteText(split, 'csv', 'file');
assert.equal(splitResult.routes.length, 1);
assert.equal(splitResult.routes[0].name, 'V13 L2 SINGAPORE TO QINGDAO VIA TAIWAN STRAIT');
assert.equal(splitResult.routes[0].points.length, 3);
close(splitResult.routes[0].points[0][0], 1 + 15.884 / 60);
close(splitResult.routes[0].points[0][1], 103 + 57.856 / 60);
close(splitResult.routes[0].points[2][1], 120 + 34.773 / 60);

// Separate deg/min/hemisphere columns with their own headers, southern and western hemispheres
const named = parseRouteText('Lat Deg,Lat Min,Lat NS,Lon Deg,Lon Min,Lon EW\n10,30,S,20,15,W\n11,0,S,21,0,W', 'csv');
close(named.routes[0].points[0][0], -10.5);
close(named.routes[0].points[0][1], -(20 + 15 / 60));

// Repeated waypoints are merged, longitudes wrapped
const notes: string[] = [];
assert.deepEqual(cleanRoutePoints([[1, 1], [1, 1], [2, 2]], 'r', notes), [[1, 1], [2, 2]]);
assert.deepEqual(cleanRoutePoints([[10, 190], [11, 191]], 'r', []), [[10, -170], [11, -169]]);

// Unreadable file gives no routes
assert.equal(parseRouteText('hello world', 'csv').routes.length, 0);

console.log('Route import tests passed.');
