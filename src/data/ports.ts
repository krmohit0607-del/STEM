/**
 * World ports lookup.
 *
 * Reads the bundled World Port Index (`public/world-port-index.json`,
 * ~3.7k genuine sea ports) once and caches it for the session. Used to
 * populate port dropdowns (autocomplete). No external API is called.
 */

import { useEffect, useState } from 'react';

export interface WorldPort {
  /** UN/LOCODE, e.g. "SGSIN". */
  code: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  /** Display label: "Name, Country (CODE)". */
  label: string;
}

interface PortIndexJson {
  fields: string[];
  rows: string[][];
}

let cache: WorldPort[] | null = null;
let inflight: Promise<WorldPort[]> | null = null;

/** Load + cache the world ports list (sorted by name). */
export async function loadWorldPorts(): Promise<WorldPort[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}world-port-index.json`);
    if (!res.ok) throw new Error(`Failed to load ports (${res.status})`);
    const data = (await res.json()) as PortIndexJson;
    const iName = data.fields.indexOf('name');
    const iCountry = data.fields.indexOf('country');
    const iCode = data.fields.indexOf('unlocode');
    const iLat = data.fields.indexOf('lat');
    const iLon = data.fields.indexOf('lon');
    const ports: WorldPort[] = [];
    for (const row of data.rows ?? []) {
      const name = row[iName];
      const lat = Number(row[iLat]);
      const lon = Number(row[iLon]);
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const country = row[iCountry] ?? '';
      const code = (row[iCode] ?? '').trim();
      ports.push({
        code,
        name,
        country,
        lat,
        lon,
        label: code ? `${name}, ${country} (${code})` : `${name}, ${country}`,
      });
    }
    ports.sort((a, b) => a.name.localeCompare(b.name));
    cache = ports;
    return ports;
  })();
  return inflight;
}

/** Resolve a typed value (port name, label, or UN/LOCODE) to a port. */
export function resolveWorldPort(value: string, ports: WorldPort[]): WorldPort | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  return (
    ports.find((p) => p.label.toLowerCase() === v) ??
    ports.find((p) => p.code.toLowerCase() === v) ??
    ports.find((p) => p.name.toLowerCase() === v) ??
    null
  );
}

/** React hook: loads the world ports once and exposes the cached list. */
export function useWorldPorts(): WorldPort[] {
  const [ports, setPorts] = useState<WorldPort[]>(cache ?? []);
  useEffect(() => {
    if (cache) {
      setPorts(cache);
      return;
    }
    let active = true;
    loadWorldPorts()
      .then((p) => {
        if (active) setPorts(p);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return ports;
}
