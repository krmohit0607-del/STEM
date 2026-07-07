/**
 * Lazy client for the bundled World Port Index reference dataset
 * (`public/world-port-index.json`, ~3,669 ports from NGA WPI, enriched
 * with UN/LOCODE codes and full country names). Fetched on first use and
 * cached for the session.
 *
 * Used by Settings → Port Details to look up a port by name, UN/LOCODE or
 * country and add it with name, country, UN/LOCODE and coordinates filled.
 */

interface PortDb {
  fields: string[];
  rows: string[][];
}

let cache: PortDb | null = null;
let inflight: Promise<PortDb> | null = null;

export function loadPortIndex(): Promise<PortDb> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    const url = `${import.meta.env.BASE_URL}world-port-index.json`;
    inflight = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load port index (${r.status})`);
        return r.json() as Promise<PortDb>;
      })
      .then((db) => {
        cache = db;
        return db;
      })
      .catch((err) => {
        inflight = null;
        throw err;
      });
  }
  return inflight;
}

export interface PortHit {
  name: string;
  country: string;
  unlocode: string;
  lat: string;
  lon: string;
}

/** Case-insensitive search by port name, UN/LOCODE or country. */
export async function searchPortIndex(query: string, limit = 40): Promise<PortHit[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const db = await loadPortIndex();
  const iName = db.fields.indexOf('name');
  const iCountry = db.fields.indexOf('country');
  const iUnlocode = db.fields.indexOf('unlocode');
  const iLat = db.fields.indexOf('lat');
  const iLon = db.fields.indexOf('lon');
  const hits: PortHit[] = [];
  for (const row of db.rows) {
    const name = row[iName] ?? '';
    const country = row[iCountry] ?? '';
    const unlocode = row[iUnlocode] ?? '';
    if (
      name.toLowerCase().includes(q) ||
      unlocode.toLowerCase().includes(q) ||
      country.toLowerCase().includes(q)
    ) {
      hits.push({ name, country, unlocode, lat: row[iLat] ?? '', lon: row[iLon] ?? '' });
      if (hits.length >= limit) break;
    }
  }
  return hits;
}
