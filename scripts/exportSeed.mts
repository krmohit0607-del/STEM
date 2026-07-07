/**
 * Exports the frontend's static sample datasets to JSON files that the
 * FleetView backend seeds into the database. Run with:
 *
 *   npx tsx scripts/exportSeed.mts
 *
 * Output goes to ../FleetView.Backend/FleetView.Api/Seed/*.json so the backend
 * and frontend stay in sync from a single source of truth (the TS data files).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AREA_CONSTRAINTS } from '../src/data/areaConstraints';
import { CLIENTS, CLIENT_ROLES } from '../src/data/clients';
import { STUB_ROWS as FLEET_ROWS, PORT_COORDS } from '../src/data/fleet';
import { FLEET_TASKS } from '../src/data/fleetTasks';
import { VOYAGES } from '../src/data/voyages';
import { EMAIL_TEMPLATES, EMAIL_TEMPLATE_CATEGORIES } from '../src/data/emailTemplates';
import { WEATHER_MARGIN_ROUTES } from '../src/data/weatherMargins';
import { DEFAULT_LIMITS } from '../src/data/limitsConstraints';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../../FleetView.Backend/FleetView.Api/Seed');
mkdirSync(outDir, { recursive: true });

/** Ports as an array so the backend can seed a Ports table. */
const PORTS = Object.entries(PORT_COORDS).map(([name, [lat, lon]]) => ({
  name,
  lat,
  lon,
}));

const CLIENT_ROLES_ARR = [...CLIENT_ROLES];
const EMAIL_CATS_ARR = [...EMAIL_TEMPLATE_CATEGORIES];

const datasets: Record<string, unknown> = {
  areaConstraints: AREA_CONSTRAINTS,
  clients: CLIENTS,
  clientRoles: CLIENT_ROLES_ARR,
  ports: PORTS,
  fleet: FLEET_ROWS,
  fleetTasks: FLEET_TASKS,
  voyages: VOYAGES,
  emailTemplates: EMAIL_TEMPLATES,
  emailTemplateCategories: EMAIL_CATS_ARR,
  weatherMarginRoutes: WEATHER_MARGIN_ROUTES,
  limitsDefaults: DEFAULT_LIMITS,
};

for (const [key, value] of Object.entries(datasets)) {
  const file = path.join(outDir, `${key}.json`);
  writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
  const count = Array.isArray(value) ? `${value.length} items` : 'object';
  console.log(`  ${key}.json — ${count}`);
}

console.log(`\nWrote ${Object.keys(datasets).length} seed files to ${outDir}`);
