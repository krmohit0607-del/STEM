import { normalizeLongitude, type LatLon } from './antimeridian';

export interface ImportedRoute {
  name: string;
  /** Waypoints in file order, [lat, lon]. */
  points: LatLon[];
}

export interface RouteImportResult {
  routes: ImportedRoute[];
  /** Things the user should know, e.g. repaired or skipped data. */
  notes: string[];
}

const EARTH_RADIUS_NM = 3440.065;

function distanceNm(a: LatLon, b: LatLon): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Decimal degrees from a number or text: `12.5`, `-12,5`, `12°30.5'N`, `N 12 30 30`, `0545N`, `15347.250E`.
 * NaN when the text is not a coordinate. Range is not checked here (see `cleanRoutePoints`), so swapped columns can be detected.
 */
export function parseCoordinate(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const raw = String(value ?? '').trim().replace(/(\d),(\d)/g, '$1.$2');
  if (!raw || !/^[\d\s.+\-\u00b0'"\u2032\u2033:NSEWnsew]+$/.test(raw)) return NaN;
  if (/^[-+]?\d+(\.\d+)?$/.test(raw)) return Number(raw);

  const hemisphere = raw.match(/[NSEW]/i)?.[0].toUpperCase();
  const negative = /^\s*-/.test(raw) || hemisphere === 'S' || hemisphere === 'W';
  const body = raw.replace(/[NSEW]/gi, ' ').replace(/^[\s+-]+/, '').trim();

  // Compact ddmm.mmm / dddmm.mmm (the last two integer digits are whole minutes).
  const compact = body.match(/^(\d{4,})(\.\d+)?$/);
  let degrees: number;
  if (compact) {
    const minutes = Number(compact[1].slice(-2) + (compact[2] ?? ''));
    if (minutes > 60) return NaN;
    degrees = Number(compact[1].slice(0, -2)) + minutes / 60;
  } else {
    const parts = body.match(/\d+(?:\.\d+)?/g)?.map(Number);
    if (!parts || parts.length > 3) return NaN;
    const [deg, min = 0, sec = 0] = parts;
    if (min > 60 || sec > 60) return NaN;
    degrees = deg + min / 60 + sec / 3600;
  }
  return negative ? -degrees : degrees;
}

/**
 * Makes a parsed point list safe to plot: swaps latitude/longitude when every point only fits that way round,
 * drops out-of-range points, wraps longitudes into -180..180 and removes consecutive duplicate waypoints.
 */
export function cleanRoutePoints(points: Array<[number, number]>, label: string, notes: string[]): LatLon[] {
  let finite = points.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  if (finite.length < points.length) notes.push(`${label}: ${points.length - finite.length} line(s) without a readable position were skipped.`);

  if (finite.some(([lat]) => Math.abs(lat) > 90) && finite.every(([, lon]) => Math.abs(lon) <= 90)) {
    finite = finite.map(([a, b]) => [b, a]);
    notes.push(`${label}: latitude and longitude were the wrong way round in the file and were swapped.`);
  }

  const valid = finite.filter(([lat, lon]) => Math.abs(lat) <= 90 && Math.abs(lon) <= 360);
  if (valid.length < finite.length) notes.push(`${label}: ${finite.length - valid.length} point(s) outside the valid latitude/longitude range were skipped.`);

  const out: LatLon[] = [];
  let duplicates = 0;
  valid.forEach(([lat, lon]) => {
    const point: LatLon = [lat, Math.abs(lon) <= 180 ? lon : normalizeLongitude(lon)];
    if (out.length > 0 && distanceNm(out[out.length - 1], point) < 0.01) {
      duplicates += 1;
      return;
    }
    out.push(point);
  });
  if (duplicates > 0) notes.push(`${label}: ${duplicates} repeated waypoint(s) were merged.`);
  return out;
}

function finishRoutes(candidates: Array<{ name: string; points: Array<[number, number]> }>, notes: string[]): ImportedRoute[] {
  const routes: ImportedRoute[] = [];
  candidates.forEach(({ name, points }) => {
    const cleaned = cleanRoutePoints(points, name, notes);
    if (cleaned.length >= 2) routes.push({ name, points: cleaned });
    else notes.push(`${name}: fewer than two usable waypoints, not imported.`);
  });
  return routes;
}

// --- XML (RTZ, GPX, KML) -------------------------------------------------------

const attributeOf = (tag: string, name: string): string | null =>
  tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1] ?? null;

const decodeXml = (text: string) =>
  text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function pointsFromTags(xml: string, tagName: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const match of xml.matchAll(new RegExp(`<(?:\\w+:)?${tagName}\\b[^>]*>`, 'gi'))) {
    out.push([parseCoordinate(attributeOf(match[0], 'lat')), parseCoordinate(attributeOf(match[0], 'lon'))]);
  }
  return out;
}

function blocksOf(xml: string, tagName: string): string[] {
  return [...xml.matchAll(new RegExp(`<(?:\\w+:)?${tagName}\\b[^>]*>[\\s\\S]*?</(?:\\w+:)?${tagName}>`, 'gi'))].map((m) => m[0]);
}

const nameInBlock = (block: string): string | null => {
  const text = block.match(/<(?:\w+:)?name>\s*(?:<!\[CDATA\[)?([^<\]]*)/i)?.[1]?.trim();
  return text ? decodeXml(text) : null;
};

function parseXml(text: string, baseName: string, notes: string[]): ImportedRoute[] {
  const candidates: Array<{ name: string; points: Array<[number, number]> }> = [];

  // RTZ: every <route> keeps its own waypoints.
  blocksOf(text, 'route').forEach((block, index) => {
    const info = block.match(/<(?:\w+:)?routeInfo\b[^>]*>/i)?.[0];
    const points = pointsFromTags(block, 'position');
    if (points.length > 0) candidates.push({ name: (info && attributeOf(info, 'routeName')) || `${baseName} ${index + 1}`, points });
  });

  // GPX routes and tracks.
  if (candidates.length === 0) {
    blocksOf(text, 'rte').forEach((block, index) => {
      candidates.push({ name: nameInBlock(block) || `${baseName} ${index + 1}`, points: pointsFromTags(block, 'rtept') });
    });
    blocksOf(text, 'trk').forEach((block, index) => {
      candidates.push({ name: nameInBlock(block) || `${baseName} track ${index + 1}`, points: pointsFromTags(block, 'trkpt') });
    });
    const waypoints = pointsFromTags(text.replace(/<(?:\w+:)?(rte|trk)\b[\s\S]*?<\/(?:\w+:)?\1>/gi, ''), 'wpt');
    if (candidates.every((c) => c.points.length === 0) && waypoints.length > 0) candidates.push({ name: baseName, points: waypoints });
  }

  // KML line strings: "lon,lat[,alt] lon,lat[,alt] ...".
  if (candidates.every((c) => c.points.length === 0)) {
    blocksOf(text, 'Placemark').forEach((block, index) => {
      const coordinates = block.match(/<(?:\w+:)?coordinates>([\s\S]*?)<\/(?:\w+:)?coordinates>/i)?.[1];
      if (!coordinates) return;
      const points = coordinates.trim().split(/\s+/).map((triple) => {
        const [lon, lat] = triple.split(',');
        return [parseCoordinate(lat), parseCoordinate(lon)] as [number, number];
      });
      candidates.push({ name: nameInBlock(block) || `${baseName} ${index + 1}`, points });
    });
  }

  // Anything else with <position> tags (an RTZ without <route> wrappers).
  if (candidates.every((c) => c.points.length === 0)) {
    const points = pointsFromTags(text, 'position');
    if (points.length > 0) candidates.push({ name: baseName, points });
  }

  return finishRoutes(candidates.filter((c) => c.points.length > 0), notes);
}

// --- JSON / GeoJSON ----------------------------------------------------------

const isPair = (value: unknown): value is [number | string, number | string] =>
  Array.isArray(value) && value.length >= 2 && value.slice(0, 2).every((v) => typeof v === 'number' || typeof v === 'string');

function pointFromObject(value: Record<string, unknown>): [number, number] {
  const lat = value.lat ?? value.latitude ?? value.y;
  const lon = value.lon ?? value.lng ?? value.long ?? value.longitude ?? value.x;
  return [parseCoordinate(lat), parseCoordinate(lon)];
}

function pointsFromList(list: unknown[], lonFirst: boolean): Array<[number, number]> {
  return list.flatMap((item): Array<[number, number]> => {
    if (isPair(item)) {
      const [a, b] = [parseCoordinate(item[0]), parseCoordinate(item[1])];
      return [lonFirst ? [b, a] : [a, b]];
    }
    if (item && typeof item === 'object') return [pointFromObject(item as Record<string, unknown>)];
    return [];
  });
}

function jsonRoutes(node: unknown, fallbackName: string): Array<{ name: string; points: Array<[number, number]> }> {
  if (Array.isArray(node)) {
    if (node.length > 0 && node.every(isPair)) return [{ name: fallbackName, points: pointsFromList(node, false) }];
    return node.flatMap((item, index) => jsonRoutes(item, node.length > 1 ? `${fallbackName} ${index + 1}` : fallbackName));
  }
  if (!node || typeof node !== 'object') return [];
  const object = node as Record<string, unknown>;
  const name = typeof object.name === 'string' && object.name.trim() ? object.name.trim() : fallbackName;
  const properties = object.properties as Record<string, unknown> | undefined;
  const featureName = typeof properties?.name === 'string' && properties.name.trim() ? properties.name.trim() : name;

  if (Array.isArray(object.features)) return jsonRoutes(object.features, fallbackName);
  if (object.type === 'Feature') return jsonRoutes(object.geometry, featureName);
  if (object.type === 'LineString' && Array.isArray(object.coordinates)) return [{ name, points: pointsFromList(object.coordinates, true) }];
  if (object.type === 'MultiLineString' && Array.isArray(object.coordinates)) {
    return (object.coordinates as unknown[][]).map((line, index) => ({ name: `${name} ${index + 1}`, points: pointsFromList(line, true) }));
  }
  if (Array.isArray(object.waypoints)) return [{ name, points: pointsFromList(object.waypoints, false) }];
  if (Array.isArray(object.points)) return [{ name, points: pointsFromList(object.points, false) }];
  if (Array.isArray(object.routes)) return jsonRoutes(object.routes, fallbackName);
  return [];
}

// --- Tables: CSV / TXT / Excel -----------------------------------------------

const letters = (value: unknown): string => String(value ?? '').toLowerCase().replace(/[^a-z]/g, '');

const latitudeColumn = (header: string[]): number =>
  header.findIndex((h) => h === 'y' || h === 'northing' || h.startsWith('lat'));
const longitudeColumn = (header: string[]): number =>
  header.findIndex((h) => h === 'x' || h === 'easting' || h === 'lng' || h.startsWith('lon'));

const ROUTE_COLUMNS = ['route', 'routename', 'routeid', 'routeno', 'routenumber'];
const INDEX_COLUMNS = ['no', 'index', 'id', 'wpt', 'wp', 'seq', 'sequence', 'number', 'wptno', 'waypointno', 'waypointnumber'];
// Header names that continue a coordinate that is spread over several columns (degrees, minutes, hemisphere).
const CONTINUATION_COLUMNS = ['', 'd', 'deg', 'degree', 'degrees', 'm', 'min', 'mins', 'minute', 'minutes', 's', 'sec', 'secs', 'second', 'seconds', 'ns', 'ew', 'hem', 'hemi', 'hemisphere', 'dir', 'direction'];

/**
 * Number of columns a coordinate occupies, starting at its header column: 1 for a single "12.5" or "12°30'N" cell,
 * up to 4 when it is split (e.g. `LAT,,,` over "1, 15.884, N"). Stops at the other coordinate's column.
 */
function coordinateSpan(header: string[], start: number, stop: number, prefixes: string[]): number {
  let span = 1;
  while (span < 4 && start + span < stop) {
    const name = header[start + span];
    const continues = name === undefined || CONTINUATION_COLUMNS.includes(name) || prefixes.some((prefix) => name.startsWith(prefix));
    if (!continues) break;
    span += 1;
  }
  return span;
}

function findHeaderRow(rows: unknown[][]): number {
  return rows.slice(0, 30).findIndex((row) => {
    const header = row.map(letters);
    return latitudeColumn(header) >= 0 && longitudeColumn(header) >= 0;
  });
}

/** Routes from rows that have a header naming a latitude and a longitude column. */
export function parseRouteTable(rows: unknown[][], baseName: string, notes: string[]): ImportedRoute[] {
  const headerIndex = findHeaderRow(rows);
  if (headerIndex < 0) return [];
  const header = rows[headerIndex].map(letters);
  const latCol = latitudeColumn(header);
  const lonCol = longitudeColumn(header);
  const routeCol = header.findIndex((h) => ROUTE_COLUMNS.includes(h));
  const indexCol = header.findIndex((h) => INDEX_COLUMNS.includes(h));
  const rowWidth = rows.slice(headerIndex + 1).reduce((width, row) => Math.max(width, row.length), header.length);
  const latSpan = coordinateSpan(header, latCol, lonCol > latCol ? lonCol : rowWidth, ['lat']);
  const lonSpan = coordinateSpan(header, lonCol, latCol > lonCol ? latCol : rowWidth, ['lon', 'lng']);
  const coordinateOf = (row: unknown[], start: number, span: number): unknown =>
    span === 1
      ? row[start]
      : row.slice(start, start + span).map((cell) => String(cell ?? '').trim()).filter(Boolean).join(' ');

  const groups: Array<{ name: string; points: Array<[number, number]> }> = [];
  let lastIndex: number | null = null;
  rows.slice(headerIndex + 1).forEach((row) => {
    if (row.every((cell) => String(cell ?? '').trim() === '')) return;
    const point: [number, number] = [parseCoordinate(coordinateOf(row, latCol, latSpan)), parseCoordinate(coordinateOf(row, lonCol, lonSpan))];
    const routeName = routeCol >= 0 ? String(row[routeCol] ?? '').trim() : '';
    const index = indexCol >= 0 && String(row[indexCol] ?? '').trim() !== '' ? Number(row[indexCol]) : NaN;

    let group = groups[groups.length - 1];
    const newRoute = !group
      || (routeCol >= 0 ? routeName !== '' && routeName !== group.name : Number.isFinite(index) && lastIndex !== null && index <= lastIndex);
    if (newRoute) {
      group = { name: routeName, points: [] };
      groups.push(group);
    }
    if (Number.isFinite(index)) lastIndex = index;
    group.points.push(point);
  });

  return finishRoutes(
    groups.map((group, i) => ({ ...group, name: group.name || (groups.length > 1 ? `${baseName} ${i + 1}` : baseName) })),
    notes,
  );
}

function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i += 1; } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      out.push(current.trim());
      current = '';
    } else current += char;
  }
  out.push(current.trim());
  return out;
}

function parseDelimited(text: string, baseName: string, notes: string[]): ImportedRoute[] {
  // Header and title lines are often written as comments ("// WPT No.,LAT,,,LON"); read them as normal lines.
  const rawLines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const lines = rawLines.map((line) => line.replace(/^\s*(\/\/+|#+)\s?/, '')).filter((line) => line.trim());
  if (lines.length === 0) return [];
  const titleLine = rawLines.find((line) => /^\s*(\/\/+|#+)/.test(line) && !(/lat/i.test(line) && /lon|lng/i.test(line)) && line.replace(/^\s*(\/\/+|#+)/, '').replace(/[,;\t\s]/g, '') !== '');
  const title = titleLine?.replace(/^\s*(\/\/+|#+)/, '').split(/[,;\t]/).map((part) => part.trim()).filter(Boolean).join(' ').slice(0, 80);

  // Furuno "simple" files: "$ROUTE,name" followed by "01,ddmm.mmmN,dddmm.mmmE".
  if (lines.some((line) => /^\$ROUTE/i.test(line.trim()))) {
    const candidates: Array<{ name: string; points: Array<[number, number]> }> = [];
    lines.forEach((line) => {
      const cells = splitLine(line, ',');
      if (/^\$ROUTE/i.test(cells[0])) {
        candidates.push({ name: cells[1] || `${baseName} ${candidates.length + 1}`, points: [] });
      } else if (candidates.length > 0 && cells.length >= 3) {
        candidates[candidates.length - 1].points.push([parseCoordinate(cells[1]), parseCoordinate(cells[2])]);
      }
    });
    return finishRoutes(candidates, notes);
  }

  // The header line decides the separator (a decimal comma in the data must not win over ';').
  const headerLine = lines.slice(0, 30).find((line) => /lat/i.test(line) && /lon|lng/i.test(line));
  const sample = headerLine ? [headerLine] : lines.slice(0, 8);
  const delimiter = [',', ';', '\t'].map((d) => ({ d, count: sample.reduce((n, line) => n + (line.split(d).length - 1), 0) }))
    .sort((a, b) => b.count - a.count)[0].d;
  const rows = lines.map((line) => splitLine(line, delimiter));

  const withHeader = parseRouteTable(rows, title || baseName, notes);
  if (withHeader.length > 0) return withHeader;

  // No header: every line is "lat,lon".
  const points = rows.map((cells) => [parseCoordinate(cells[0]), parseCoordinate(cells[1])] as [number, number]);
  if (points.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b)).length >= 2) {
    return finishRoutes([{ name: baseName, points }], notes);
  }
  return [];
}

/**
 * Routes from the text of a route file: RTZ/XML, GPX, KML, JSON/GeoJSON, CSV/TXT (comma, semicolon or tab separated; Furuno simple).
 * A file with several routes gives several routes. Returns no routes when nothing readable was found.
 */
export function parseRouteText(text: string, extension: string, baseName = 'Imported route'): RouteImportResult {
  const notes: string[] = [];
  const kind = extension.toLowerCase();
  let routes: ImportedRoute[] = [];

  if (['rtz', 'xml', 'gpx', 'kml'].includes(kind) || /^\s*<\?xml|^\s*<(route|gpx|kml)\b/i.test(text)) {
    routes = parseXml(text, baseName, notes);
  } else if (['json', 'geojson'].includes(kind) || /^\s*[[{]/.test(text)) {
    routes = finishRoutes(jsonRoutes(JSON.parse(text), baseName), notes);
  } else {
    routes = parseDelimited(text, baseName, notes);
  }
  return { routes, notes };
}
