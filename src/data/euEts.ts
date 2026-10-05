/**
 * EU ETS (EU Emissions Trading System) maritime coverage helpers.
 *
 * Per Regulation (EU) 2023/1805, a voyage leg's CO2 emissions count toward EU
 * ETS allowances based on the ports called:
 *  - Both ports in the EU/EEA    -> 100% of emissions covered
 *  - One port in the EU/EEA      -> 50% of emissions covered (to/from voyage)
 *  - Neither port in the EU/EEA  -> 0% (out of scope, no EUA cost applies)
 */
import type { WorldPort } from './ports';

/** EU member states + EEA states with sea access, matching the World Port Index's country naming. */
const EU_EEA_COUNTRIES = new Set([
  'AUSTRIA', 'BELGIUM', 'BULGARIA', 'CROATIA', 'CYPRUS', 'CZECHIA', 'DENMARK', 'ESTONIA',
  'FINLAND', 'FRANCE', 'GERMANY', 'GREECE', 'HUNGARY', 'IRELAND', 'ITALY', 'LATVIA',
  'LITHUANIA', 'LUXEMBOURG', 'MALTA', 'NETHERLANDS', 'POLAND', 'PORTUGAL', 'ROMANIA',
  'SLOVAKIA', 'SLOVENIA', 'SPAIN', 'SWEDEN', 'NORWAY', 'ICELAND',
]);

/** Pull the "<Country>" suffix some ports are stored with (e.g. "Vishakhapatnam <India>"). */
function bracketCountry(text: string): string | null {
  const m = text.match(/<([^>]+)>\s*$/);
  return m ? m[1].trim() : null;
}

/** Resolve a port string (plain name, "Name <Country>", or World Port Index label) to its country, else null. */
export function resolvePortCountry(portText: string, worldPorts: WorldPort[]): string | null {
  const text = (portText || '').trim();
  if (!text) return null;
  const bracketed = bracketCountry(text);
  if (bracketed) return bracketed;
  const bare = text.split(/\s*(?:<|,|;)\s*/)[0].trim().toLowerCase();
  const match = worldPorts.find((p) => p.label.toLowerCase() === text.toLowerCase())
    ?? worldPorts.find((p) => p.name.toLowerCase() === bare);
  return match?.country ?? null;
}

/** Is the given (resolved) country within the EU/EEA? */
export function isEuEtsCountry(country: string | null | undefined): boolean {
  return !!country && EU_EEA_COUNTRIES.has(country.trim().toUpperCase());
}

/** EU ETS coverage fraction for a single leg: 1 (both EU/EEA), 0.5 (one EU/EEA), 0 (neither — out of scope). */
export function euEtsCoverage(fromCountry: string | null | undefined, toCountry: string | null | undefined): number {
  const fromEu = isEuEtsCountry(fromCountry);
  const toEu = isEuEtsCountry(toCountry);
  if (fromEu && toEu) return 1;
  if (fromEu || toEu) return 0.5;
  return 0;
}
