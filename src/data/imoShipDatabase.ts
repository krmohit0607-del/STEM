/**
 * Lazy client for the bundled IMO ship reference database
 * (`public/imo-ship-database.json`, ~63k ships from the IMO ship-search
 * workbook). The dataset is fetched on first use only — it is not part of
 * the main bundle — and cached for the session.
 *
 * Used by Settings → Vessels Details to look up a ship by IMO or name and
 * add it to the fleet with its particulars auto-filled.
 */

import { makeBlankVessel, type Vessel, type VesselFieldKey } from './vessels';

interface ImoDb {
  fields: string[];
  rows: string[][];
}

let cache: ImoDb | null = null;
let inflight: Promise<ImoDb> | null = null;

/** Fetch + cache the reference dataset (on demand). */
export function loadImoDatabase(): Promise<ImoDb> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    const url = `${import.meta.env.BASE_URL}imo-ship-database.json`;
    inflight = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load ship database (${r.status})`);
        return r.json() as Promise<ImoDb>;
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

export interface ImoSearchHit {
  imo: string;
  name: string;
  vesselType: string;
  builtYear: string;
  /** Index into the dataset rows, used to build the full vessel. */
  row: string[];
}

/** Case-insensitive search by IMO or ship name. */
export async function searchImoDatabase(query: string, limit = 40): Promise<ImoSearchHit[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const db = await loadImoDatabase();
  const iImo = db.fields.indexOf('imo');
  const iName = db.fields.indexOf('name');
  const iType = db.fields.indexOf('vesselType');
  const iBuilt = db.fields.indexOf('builtYear');
  const hits: ImoSearchHit[] = [];
  for (const row of db.rows) {
    const imo = row[iImo] ?? '';
    const name = row[iName] ?? '';
    if (imo.toLowerCase().includes(q) || name.toLowerCase().includes(q)) {
      hits.push({ imo, name, vesselType: row[iType] ?? '', builtYear: row[iBuilt] ?? '', row });
      if (hits.length >= limit) break;
    }
  }
  return hits;
}

/** Map a dataset row into a new (unsaved) vessel with fields filled in. */
export function hitToVessel(hit: ImoSearchHit): Vessel {
  const v = makeBlankVessel();
  const rec = v as unknown as Record<string, string>;
  const fields = cache?.fields ?? [];
  fields.forEach((f, i) => {
    rec[f as VesselFieldKey] = hit.row[i] ?? '';
  });
  return v;
}
