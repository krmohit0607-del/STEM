// One-off converter: AreaConstraints.csv -> src/data/areaConstraints.ts
import { readFileSync, writeFileSync } from 'node:fs';

const CSV = 'c:/Users/CHMOKUM/Downloads/AreaConstraints.csv';
const OUT = 'src/data/areaConstraints.ts';

const raw = readFileSync(CSV, 'utf8');
const lines = raw.split(/\r?\n/);

function splitCsv(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (ch === ',' && !inQ) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

const round = (n) => Math.round(n * 1e5) / 1e5;

// Parse rows, splitting into contiguous rings. A new ring begins whenever the
// constraint name changes between consecutive data rows. Rings that share the
// same name belong to one multi-part constraint (KML MultiGeometry).
const constraints = new Map();
let order = 0;
let prevName = null;
let curRing = null;

for (const line of lines) {
  const t = line.trim();
  if (!t || t.startsWith('//')) continue;
  const cols = splitCsv(line);
  if (cols.length < 5) continue;
  const [name, zoneType, geomType, latS, lonS, rpmMin, rpmMax, spMin, spMax] = cols;
  const lat = Number(latS);
  const lon = Number(lonS);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

  if (!constraints.has(name)) {
    constraints.set(name, {
      order: order++,
      name,
      zoneType: zoneType.trim(),
      geomType: geomType.trim(),
      rpmMin: rpmMin?.trim() || '',
      rpmMax: rpmMax?.trim() || '',
      speedMin: spMin?.trim() || '',
      speedMax: spMax?.trim() || '',
      rings: [],
    });
  }
  const c = constraints.get(name);
  if (!c.rpmMin && rpmMin?.trim()) c.rpmMin = rpmMin.trim();
  if (!c.rpmMax && rpmMax?.trim()) c.rpmMax = rpmMax.trim();
  if (!c.speedMin && spMin?.trim()) c.speedMin = spMin.trim();
  if (!c.speedMax && spMax?.trim()) c.speedMax = spMax.trim();

  if (name !== prevName) {
    curRing = [];
    c.rings.push(curRing);
    prevName = name;
  }
  curRing.push([round(lat), round(lon)]);
}

const all = [...constraints.values()].sort((a, b) => a.order - b.order);

function shortName(name, idx) {
  const m = name.match(/constraint\s+#?(\d+)/i);
  const num = m ? m[1] : String(idx + 1);
  const file = name.match(/\/([^/]+)\.kml/i);
  const src = file ? file[1].replace(/([a-z])([A-Z])/g, '$1 $2') : 'Constraint';
  return `${src} #${num}`;
}

// Drop degenerate rings (fewer than 3 vertices can't form an area).
const records = all
  .map((c, i) => ({
    id: `ac-${i + 1}`,
    name: shortName(c.name, i),
    rawName: c.name,
    zoneType: c.zoneType,
    geomType: c.geomType,
    rpmMin: c.rpmMin,
    rpmMax: c.rpmMax,
    speedMin: c.speedMin,
    speedMax: c.speedMax,
    rings: c.rings.filter((r) => r.length >= 3),
  }))
  .filter((c) => c.rings.length > 0);

const header = `// AUTO-GENERATED from AreaConstraints.csv — do not edit by hand.
// Regenerate with: node scripts/convertAreaConstraints.mjs
//
// Each record is one area constraint. A constraint may have several polygon
// \`rings\` (the original KML export stored some zones as multi-part geometry).
// Each ring is an ordered list of [lat, lon] vertices. Speed limits are in
// metres per second exactly as exported by SOFAR Wayfinder.

export interface AreaConstraint {
  id: string;
  /** Friendly label shown in the UI. */
  name: string;
  /** Original exporter name. */
  rawName: string;
  /** e.g. "limited-passage-zone", "no-go-zone", "speed-control-zone", "eca-zone". */
  zoneType: string;
  /** e.g. "limited-passage", "no-go", "none". */
  geomType: string;
  rpmMin: string;
  rpmMax: string;
  /** Speed limit in m/s as exported. */
  speedMin: string;
  speedMax: string;
  /** One or more polygon rings, each an ordered list of [lat, lon] vertices. */
  rings: [number, number][][];
}

`;

const body =
  'export const AREA_CONSTRAINTS: AreaConstraint[] = ' +
  JSON.stringify(records, null, 0)
    .replace(/\},\{/g, '},\n  {')
    .replace(/^\[/, '[\n  ')
    .replace(/\]$/, ',\n]') +
  ';\n';

writeFileSync(OUT, header + body, 'utf8');

const zoneTypes = [...new Set(all.map((g) => g.zoneType))];
console.log(`Wrote ${records.length} constraints to ${OUT}`);
console.log('Zone types:', zoneTypes.join(', '));
console.log('Total rings:', records.reduce((n, c) => n + c.rings.length, 0));
console.log(
  'Total vertices:',
  records.reduce((n, c) => n + c.rings.reduce((m, r) => m + r.length, 0), 0)
);
