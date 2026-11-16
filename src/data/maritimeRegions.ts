/**
 * Named maritime region (strait, channel, gulf, sea or ocean basin) lookup
 * for a given lat/lon — used to label waypoints on the map with something
 * more useful than a generic "WP N", e.g. "Strait of Malacca" or "Bay of
 * Bengal" when the waypoint sits inside one.
 *
 * Two layers, used together (see `useAuthoritativeRegionName` below, the
 * one actually used by the map tooltip):
 *
 *   1. `useAuthoritativeRegionName` — the primary, authoritative source:
 *      calls the backend's Marine Regions gazetteer proxy (real public data
 *      from marineregions.org, combining the IHO's official "Limits of
 *      Oceans and Seas" standard with the SeaVoX sea/strait/channel
 *      gazetteer — comprehensive worldwide coverage, not a hand-picked
 *      subset), with client-side caching/deduping/concurrency-limiting so a
 *      route with hundreds of waypoints doesn't fire hundreds of requests
 *      at once. Async by nature (network round-trip).
 *   2. `findMaritimeRegion` below — an instant, fully local, synchronous
 *      fallback for the brief moment before (1) resolves, or if it fails
 *      (offline, backend/upstream error): a hand-authored, approximate
 *      bounding-box dataset for major straits/channels/gulfs/seas/oceans,
 *      plus (checked first, for far better and still-authoritative
 *      coverage of many archipelago straits/channels/TSS zones) the real
 *      surveyed polygons already bundled for area constraints — see
 *      `AREA_CONSTRAINT_REGIONS` below.
 */

import { useEffect, useState } from 'react';
import { AREA_CONSTRAINTS } from './areaConstraints';
import { fetchMaritimeRegion } from '../api/maritimeRegionsApi';

export type MaritimeRegionKind = 'strait' | 'channel' | 'gulf' | 'bay' | 'sea' | 'ocean';

export interface MaritimeRegion {
  name: string;
  kind: MaritimeRegionKind;
  /** Either a simple bounding box, or (for a few long/narrow straits where a
   *  box would be too imprecise or would overlap a neighbour) an ordered
   *  polygon of [lat, lon] vertices. */
  bounds?: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  polygon?: Array<[number, number]>;
}
function inBox(
  lat: number,
  lon: number,
  b: { minLat: number; maxLat: number; minLon: number; maxLon: number },
): boolean {
  if (lat < b.minLat || lat > b.maxLat) return false;
  // `minLon > maxLon` marks a box that straddles the antimeridian (e.g. the
  // Bering Strait/Sea) — wrap the test instead of treating it as empty.
  if (b.minLon <= b.maxLon) return lon >= b.minLon && lon <= b.maxLon;
  return lon >= b.minLon || lon <= b.maxLon;
}

/** Ray-casting point-in-polygon test (same algorithm used for area-constraint
 *  hazard checks in `routeOptimizer.ts`, reimplemented standalone here to
 *  avoid pulling in that much heavier module for a simple label lookup). */
function inPolygon(lat: number, lon: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const yi = ring[i][0];
    const xi = ring[i][1];
    const yj = ring[j][0];
    const xj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function inRegion(lat: number, lon: number, r: MaritimeRegion): boolean {
  if (r.polygon) return inPolygon(lat, lon, r.polygon);
  if (r.bounds) return inBox(lat, lon, r.bounds);
  return false;
}

// --- Straits, channels & passages (checked first — narrowest/most specific) ---
const STRAITS: MaritimeRegion[] = [
  // Singapore Strait checked before the broader Malacca Strait box below,
  // since it's the more specific sub-region at the Malacca Strait's
  // southeastern end.
  { name: 'Singapore Strait', kind: 'strait', bounds: { minLat: 1.0, maxLat: 1.35, minLon: 103.5, maxLon: 104.3 } },
  // Malacca Strait: a simple box necessarily bleeds a bit into the
  // surrounding Andaman Sea (west) and South China Sea (east) at its two
  // open ends — acceptable for this "roughly where is this" label, and
  // consistent with how a real strait gradually widens into open sea.
  { name: 'Malacca Strait', kind: 'strait', bounds: { minLat: 0.8, maxLat: 6.5, minLon: 95.5, maxLon: 103.2 } },
  { name: 'Taiwan Strait', kind: 'strait', bounds: { minLat: 22.5, maxLat: 26.0, minLon: 117.5, maxLon: 121.0 } },
  { name: 'Luzon Strait', kind: 'strait', bounds: { minLat: 19.5, maxLat: 21.5, minLon: 119.5, maxLon: 122.5 } },
  // Philippine archipelago straits/passes — small and close together, so
  // kept tight and checked in a sensible north-to-south order; several more
  // (Balabac, Sibutu, Verde Island Passage, Tablas/Cebu/Mindanao Straits) are
  // also covered via the bundled `AREA_CONSTRAINTS` zones below, which have
  // real surveyed polygons rather than a hand-drawn box.
  { name: 'Mindoro Strait', kind: 'strait', bounds: { minLat: 11.6, maxLat: 13.0, minLon: 119.8, maxLon: 121.4 } },
  { name: 'Ticao Pass', kind: 'strait', bounds: { minLat: 12.4, maxLat: 12.85, minLon: 123.55, maxLon: 124.0 } },
  { name: 'San Bernardino Strait', kind: 'strait', bounds: { minLat: 12.45, maxLat: 12.75, minLon: 124.05, maxLon: 124.35 } },
  { name: 'Naranjo Pass', kind: 'strait', bounds: { minLat: 12.3, maxLat: 12.48, minLon: 124.0, maxLon: 124.2 } },
  { name: 'Korea Strait', kind: 'strait', bounds: { minLat: 33.5, maxLat: 35.5, minLon: 127.5, maxLon: 130.5 } },
  { name: 'Tsugaru Strait', kind: 'strait', bounds: { minLat: 41.2, maxLat: 41.9, minLon: 139.8, maxLon: 141.6 } },
  { name: 'La Perouse Strait', kind: 'strait', bounds: { minLat: 45.3, maxLat: 46.0, minLon: 141.5, maxLon: 143.0 } },
  { name: 'Bering Strait', kind: 'strait', bounds: { minLat: 64.5, maxLat: 66.5, minLon: -170.0, maxLon: -167.0 } },
  { name: 'Sunda Strait', kind: 'strait', bounds: { minLat: -6.5, maxLat: -5.3, minLon: 105.0, maxLon: 106.2 } },
  { name: 'Lombok Strait', kind: 'strait', bounds: { minLat: -9.0, maxLat: -8.0, minLon: 115.6, maxLon: 116.1 } },
  { name: 'Makassar Strait', kind: 'strait', bounds: { minLat: -5.0, maxLat: 2.0, minLon: 116.5, maxLon: 119.5 } },
  { name: 'Torres Strait', kind: 'strait', bounds: { minLat: -10.9, maxLat: -9.8, minLon: 141.8, maxLon: 143.6 } },
  { name: 'Bass Strait', kind: 'strait', bounds: { minLat: -40.5, maxLat: -38.3, minLon: 143.5, maxLon: 150.0 } },
  { name: 'Cook Strait', kind: 'strait', bounds: { minLat: -41.6, maxLat: -40.9, minLon: 173.8, maxLon: 175.0 } },
  { name: 'Strait of Hormuz', kind: 'strait', bounds: { minLat: 25.5, maxLat: 27.2, minLon: 55.5, maxLon: 57.0 } },
  { name: 'Bab-el-Mandeb', kind: 'strait', bounds: { minLat: 12.3, maxLat: 13.1, minLon: 42.8, maxLon: 43.6 } },
  { name: 'Strait of Gibraltar', kind: 'strait', bounds: { minLat: 35.8, maxLat: 36.2, minLon: -5.8, maxLon: -5.2 } },
  { name: 'Strait of Sicily', kind: 'strait', bounds: { minLat: 36.3, maxLat: 37.8, minLon: 11.0, maxLon: 13.0 } },
  { name: 'Bosphorus', kind: 'strait', bounds: { minLat: 40.9, maxLat: 41.3, minLon: 28.9, maxLon: 29.2 } },
  { name: 'Dardanelles', kind: 'strait', bounds: { minLat: 39.9, maxLat: 40.5, minLon: 25.9, maxLon: 26.7 } },
  { name: 'Strait of Dover / English Channel', kind: 'strait', bounds: { minLat: 49.6, maxLat: 51.5, minLon: -2.0, maxLon: 2.0 } },
  { name: 'Danish Straits', kind: 'strait', bounds: { minLat: 54.5, maxLat: 56.0, minLon: 9.5, maxLon: 13.0 } },
  { name: 'Strait of Magellan', kind: 'strait', bounds: { minLat: -54.5, maxLat: -52.0, minLon: -75.0, maxLon: -68.0 } },
  { name: 'Davis Strait', kind: 'strait', bounds: { minLat: 62.0, maxLat: 70.0, minLon: -65.0, maxLon: -53.0 } },
  { name: 'Denmark Strait', kind: 'strait', bounds: { minLat: 63.5, maxLat: 68.0, minLon: -35.0, maxLon: -20.0 } },
  { name: 'Drake Passage', kind: 'strait', bounds: { minLat: -62.0, maxLat: -55.0, minLon: -70.0, maxLon: -55.0 } },
  { name: 'Mozambique Channel', kind: 'channel', bounds: { minLat: -26.0, maxLat: -10.0, minLon: 32.0, maxLon: 50.0 } },
  { name: 'Yucatan Channel', kind: 'channel', bounds: { minLat: 20.5, maxLat: 22.0, minLon: -87.0, maxLon: -84.5 } },
  // Bahamas/Florida approaches — ordered narrowest-first (Santaren Channel
  // and the Straits of Florida are each more specific sub-areas than the
  // broader Old Bahama Channel/Caribbean Sea/Gulf of Mexico around them).
  { name: 'Santaren Channel', kind: 'channel', bounds: { minLat: 21.5, maxLat: 24.5, minLon: -80.0, maxLon: -78.5 } },
  { name: 'Northwest Providence Channel', kind: 'channel', bounds: { minLat: 25.3, maxLat: 26.8, minLon: -79.0, maxLon: -77.0 } },
  { name: 'Straits of Florida', kind: 'strait', bounds: { minLat: 23.0, maxLat: 25.5, minLon: -82.0, maxLon: -79.0 } },
  { name: 'Old Bahama Channel', kind: 'channel', bounds: { minLat: 21.5, maxLat: 23.0, minLon: -79.5, maxLon: -74.5 } },
];

// --- Gulfs & bays ---
const GULFS: MaritimeRegion[] = [
  { name: 'Persian Gulf', kind: 'gulf', bounds: { minLat: 23.5, maxLat: 30.5, minLon: 48.0, maxLon: 56.5 } },
  { name: 'Gulf of Oman', kind: 'gulf', bounds: { minLat: 22.5, maxLat: 26.5, minLon: 56.0, maxLon: 61.0 } },
  { name: 'Gulf of Aden', kind: 'gulf', bounds: { minLat: 10.5, maxLat: 14.5, minLon: 43.0, maxLon: 51.5 } },
  { name: 'Gulf of Mexico', kind: 'gulf', bounds: { minLat: 18.0, maxLat: 30.5, minLon: -98.0, maxLon: -81.0 } },
  { name: 'Gulf of Guinea', kind: 'gulf', bounds: { minLat: -3.0, maxLat: 6.5, minLon: -10.0, maxLon: 9.5 } },
  { name: 'Gulf of Thailand', kind: 'gulf', bounds: { minLat: 5.5, maxLat: 13.5, minLon: 99.5, maxLon: 105.5 } },
  { name: 'Gulf of Aqaba', kind: 'gulf', bounds: { minLat: 27.7, maxLat: 29.6, minLon: 34.4, maxLon: 35.2 } },
  { name: 'Gulf of Suez', kind: 'gulf', bounds: { minLat: 27.7, maxLat: 30.0, minLon: 32.3, maxLon: 33.4 } },
  { name: 'Gulf of Bothnia', kind: 'gulf', bounds: { minLat: 60.0, maxLat: 65.9, minLon: 17.0, maxLon: 24.5 } },
  { name: 'Gulf of Finland', kind: 'gulf', bounds: { minLat: 59.0, maxLat: 60.6, minLon: 22.0, maxLon: 30.5 } },
  { name: 'Gulf of Riga', kind: 'gulf', bounds: { minLat: 56.8, maxLat: 58.6, minLon: 21.5, maxLon: 24.8 } },
  { name: 'Gulf of St. Lawrence', kind: 'gulf', bounds: { minLat: 45.0, maxLat: 51.5, minLon: -66.5, maxLon: -56.5 } },
  { name: 'Gulf of Alaska', kind: 'gulf', bounds: { minLat: 54.0, maxLat: 60.5, minLon: -150.0, maxLon: -132.0 } },
  { name: 'Gulf of California', kind: 'gulf', bounds: { minLat: 22.5, maxLat: 32.0, minLon: -115.0, maxLon: -106.0 } },
  { name: 'Gulf of Panama', kind: 'gulf', bounds: { minLat: 6.5, maxLat: 9.0, minLon: -80.5, maxLon: -77.5 } },
  { name: 'Gulf of Carpentaria', kind: 'gulf', bounds: { minLat: -17.5, maxLat: -11.0, minLon: 135.5, maxLon: 141.5 } },
  { name: 'Great Australian Bight', kind: 'gulf', bounds: { minLat: -38.0, maxLat: -32.0, minLon: 124.0, maxLon: 135.0 } },
  { name: 'Bay of Bengal', kind: 'bay', bounds: { minLat: 5.0, maxLat: 22.5, minLon: 78.0, maxLon: 95.0 } },
  { name: 'Hudson Bay', kind: 'bay', bounds: { minLat: 51.0, maxLat: 65.0, minLon: -95.5, maxLon: -75.0 } },
  { name: 'Bay of Biscay', kind: 'bay', bounds: { minLat: 43.0, maxLat: 48.5, minLon: -8.0, maxLon: -1.0 } },
  { name: 'Bay of Plenty', kind: 'bay', bounds: { minLat: -38.3, maxLat: -36.6, minLon: 176.0, maxLon: 178.3 } },
];

// --- Seas ---
const SEAS: MaritimeRegion[] = [
  { name: 'Mediterranean Sea', kind: 'sea', bounds: { minLat: 30.0, maxLat: 46.0, minLon: -6.0, maxLon: 36.5 } },
  { name: 'Red Sea', kind: 'sea', bounds: { minLat: 12.0, maxLat: 30.0, minLon: 32.0, maxLon: 43.5 } },
  { name: 'Black Sea', kind: 'sea', bounds: { minLat: 40.8, maxLat: 46.8, minLon: 27.3, maxLon: 42.0 } },
  { name: 'Sea of Marmara', kind: 'sea', bounds: { minLat: 40.3, maxLat: 41.1, minLon: 26.6, maxLon: 29.9 } },
  { name: 'Caspian Sea', kind: 'sea', bounds: { minLat: 36.5, maxLat: 47.2, minLon: 46.5, maxLon: 54.5 } },
  { name: 'Arabian Sea', kind: 'sea', bounds: { minLat: 5.0, maxLat: 25.0, minLon: 55.0, maxLon: 78.0 } },
  { name: 'Laccadive Sea', kind: 'sea', bounds: { minLat: 4.0, maxLat: 13.0, minLon: 71.5, maxLon: 78.0 } },
  { name: 'Andaman Sea', kind: 'sea', bounds: { minLat: 4.0, maxLat: 18.0, minLon: 92.0, maxLon: 99.5 } },
  { name: 'South China Sea', kind: 'sea', bounds: { minLat: -3.0, maxLat: 23.5, minLon: 99.0, maxLon: 121.0 } },
  { name: 'East China Sea', kind: 'sea', bounds: { minLat: 23.5, maxLat: 33.0, minLon: 117.0, maxLon: 131.0 } },
  { name: 'Yellow Sea', kind: 'sea', bounds: { minLat: 33.0, maxLat: 41.0, minLon: 119.0, maxLon: 126.5 } },
  { name: 'Sea of Japan', kind: 'sea', bounds: { minLat: 34.5, maxLat: 51.5, minLon: 127.5, maxLon: 142.0 } },
  { name: 'Sea of Okhotsk', kind: 'sea', bounds: { minLat: 43.5, maxLat: 62.0, minLon: 135.0, maxLon: 163.0 } },
  { name: 'Bering Sea', kind: 'sea', bounds: { minLat: 52.0, maxLat: 66.0, minLon: 162.0, maxLon: -157.0 } },
  { name: 'Philippine Sea', kind: 'sea', bounds: { minLat: 5.0, maxLat: 25.0, minLon: 121.0, maxLon: 150.0 } },
  { name: 'Celebes Sea', kind: 'sea', bounds: { minLat: 0.0, maxLat: 7.5, minLon: 118.0, maxLon: 125.5 } },
  { name: 'Sulu Sea', kind: 'sea', bounds: { minLat: 5.0, maxLat: 12.0, minLon: 118.0, maxLon: 123.0 } },
  { name: 'Java Sea', kind: 'sea', bounds: { minLat: -8.0, maxLat: -2.0, minLon: 105.0, maxLon: 117.0 } },
  { name: 'Flores Sea', kind: 'sea', bounds: { minLat: -8.5, maxLat: -6.5, minLon: 117.0, maxLon: 123.0 } },
  { name: 'Banda Sea', kind: 'sea', bounds: { minLat: -8.0, maxLat: -3.0, minLon: 123.0, maxLon: 133.0 } },
  { name: 'Arafura Sea', kind: 'sea', bounds: { minLat: -11.5, maxLat: -5.0, minLon: 131.0, maxLon: 138.0 } },
  { name: 'Timor Sea', kind: 'sea', bounds: { minLat: -13.5, maxLat: -8.5, minLon: 123.0, maxLon: 131.0 } },
  { name: 'Coral Sea', kind: 'sea', bounds: { minLat: -24.0, maxLat: -8.0, minLon: 142.0, maxLon: 160.0 } },
  { name: 'Tasman Sea', kind: 'sea', bounds: { minLat: -47.0, maxLat: -30.0, minLon: 148.0, maxLon: 172.0 } },
  { name: 'North Sea', kind: 'sea', bounds: { minLat: 51.0, maxLat: 61.5, minLon: -4.5, maxLon: 9.5 } },
  { name: 'Baltic Sea', kind: 'sea', bounds: { minLat: 53.5, maxLat: 60.0, minLon: 9.5, maxLon: 22.0 } },
  { name: 'Norwegian Sea', kind: 'sea', bounds: { minLat: 62.0, maxLat: 73.0, minLon: -8.0, maxLon: 18.0 } },
  { name: 'Barents Sea', kind: 'sea', bounds: { minLat: 70.0, maxLat: 80.0, minLon: 18.0, maxLon: 60.0 } },
  { name: 'Irish Sea', kind: 'sea', bounds: { minLat: 51.5, maxLat: 55.5, minLon: -7.0, maxLon: -2.5 } },
  { name: 'Caribbean Sea', kind: 'sea', bounds: { minLat: 9.0, maxLat: 22.0, minLon: -88.0, maxLon: -59.0 } },
  { name: 'Sargasso Sea', kind: 'sea', bounds: { minLat: 20.0, maxLat: 35.0, minLon: -75.0, maxLon: -40.0 } },
  { name: 'Labrador Sea', kind: 'sea', bounds: { minLat: 53.0, maxLat: 65.0, minLon: -65.0, maxLon: -45.0 } },
  { name: 'Ross Sea', kind: 'sea', bounds: { minLat: -78.5, maxLat: -70.0, minLon: 160.0, maxLon: -150.0 } },
  { name: 'Weddell Sea', kind: 'sea', bounds: { minLat: -78.0, maxLat: -65.0, minLon: -60.0, maxLon: -20.0 } },
];

// --- Ocean basins (checked last — broadest catch-all) ---
const OCEANS: MaritimeRegion[] = [
  { name: 'Arctic Ocean', kind: 'ocean', bounds: { minLat: 66.5, maxLat: 90.0, minLon: -180, maxLon: 180 } },
  { name: 'Southern Ocean', kind: 'ocean', bounds: { minLat: -90.0, maxLat: -60.0, minLon: -180, maxLon: 180 } },
  { name: 'North Atlantic Ocean', kind: 'ocean', bounds: { minLat: 0.0, maxLat: 66.5, minLon: -80.0, maxLon: 0.0 } },
  { name: 'South Atlantic Ocean', kind: 'ocean', bounds: { minLat: -60.0, maxLat: 0.0, minLon: -70.0, maxLon: 20.0 } },
  { name: 'Indian Ocean', kind: 'ocean', bounds: { minLat: -60.0, maxLat: 30.0, minLon: 20.0, maxLon: 147.0 } },
  { name: 'North Pacific Ocean', kind: 'ocean', bounds: { minLat: 0.0, maxLat: 66.5, minLon: 100.0, maxLon: -80.0 } },
  { name: 'South Pacific Ocean', kind: 'ocean', bounds: { minLat: -60.0, maxLat: 0.0, minLon: 140.0, maxLon: -67.0 } },
];

/**
 * Strips the operational annotations the bundled area-constraints export
 * tacks onto some names (speed/draft notes, pilotage requirements, warning
 * banners, ...) down to just the bare navigational-feature name, and for a
 * "Feature A / Feature B" combined zone (several Philippine strait zones are
 * exported this way) keeps only the first one — e.g.
 * "Gelasa Strait // < 100k DWT // Low Drafts" -> "Gelasa Strait",
 * "Tanon Strait / San Bernardino" -> "Tanon Strait".
 */
function cleanConstraintName(raw: string): string {
  return raw
    .replace(/^PILOTAGE:\s*/i, '')
    .split('//')[0]
    .split('/')[0]
    .replace(/\*\*.*?\*\*/g, '')
    .trim();
}

/** Zone names too generic/incomplete to show as a standalone location label
 *  once cleaned (e.g. a bare Traffic Separation Scheme reference with no
 *  identifying strait/area name attached). */
const GENERIC_CONSTRAINT_NAMES = new Set(['TSS', 'Coastal TSS', 'North of TSS']);

const STRAIT_LIKE_NAME = /strait|channel|passage|pass\b|tss|selat/i;

/** A handful of zones in this export (e.g. "Karimata Strait") are drawn as a
 *  broad navigable-corridor polygon spanning a huge area — effectively "the
 *  whole route through here", not the compact named feature itself — which
 *  would make them a misleading "where is this" label (worse, one large
 *  enough can swallow the real, much smaller strait right next to it, as
 *  happens with Karimata's polygon versus the actual Gelasa Strait). Zones
 *  whose own bounding box is implausibly large for a single named strait/
 *  channel/pass are excluded here rather than hand-fixing each one's
 *  original export geometry. */
const MAX_PLAUSIBLE_SPAN_DEG = 8;

function ringsBoundingSpan(rings: Array<[number, number][]>): { latSpan: number; lonSpan: number } {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const ring of rings) {
    for (const [lat, lon] of ring) {
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
    }
  }
  return { latSpan: maxLat - minLat, lonSpan: maxLon - minLon };
}

/**
 * Named straits/channels/passes/Traffic Separation Schemes pulled from the
 * bundled area-constraints export (real surveyed polygons from the SOFAR
 * Wayfinder KML data, not a hand-drawn box) — covers a good number of named
 * features, especially across the Indonesian and Philippine archipelagos,
 * that this file's own hand-curated list doesn't individually include.
 * Built once at module load since `AREA_CONSTRAINTS` itself never changes
 * at runtime.
 */
const AREA_CONSTRAINT_REGIONS: Array<{ name: string; rings: Array<[number, number][]> }> =
  AREA_CONSTRAINTS.filter((c) => STRAIT_LIKE_NAME.test(c.name))
    .map((c) => ({ name: cleanConstraintName(c.name), rings: c.rings }))
    .filter((c) => c.name.length > 0 && !GENERIC_CONSTRAINT_NAMES.has(c.name))
    .filter((c) => {
      const { latSpan, lonSpan } = ringsBoundingSpan(c.rings);
      return latSpan <= MAX_PLAUSIBLE_SPAN_DEG && lonSpan <= MAX_PLAUSIBLE_SPAN_DEG;
    });

function findAreaConstraintRegion(lat: number, lon: number): MaritimeRegion | null {
  for (const c of AREA_CONSTRAINT_REGIONS) {
    for (const ring of c.rings) {
      if (inPolygon(lat, lon, ring)) return { name: c.name, kind: 'strait' };
    }
  }
  return null;
}

/**
 * The named maritime region (strait/channel/gulf/bay/sea/ocean) at a given
 * lat/lon, or `null` if it doesn't fall within any of the regions known here
 * (e.g. well inland, or a gap in this approximate, hand-authored dataset).
 * Checked from most specific to broadest: this file's own hand-curated,
 * individually-verified straits first, then the real-polygon straits/
 * channels/TSS zones reused from the bundled area-constraints data, then its
 * own broader gulfs/bays, seas, and finally ocean basins — so a point inside
 * a strait's tighter area is always reported as that strait rather than the
 * sea/ocean around it.
 */
export function findMaritimeRegion(lat: number, lon: number): MaritimeRegion | null {
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  for (const region of STRAITS) {
    if (inRegion(lat, lon, region)) return region;
  }
  const areaConstraintMatch = findAreaConstraintRegion(lat, lon);
  if (areaConstraintMatch) return areaConstraintMatch;
  for (const region of [...GULFS, ...SEAS, ...OCEANS]) {
    if (inRegion(lat, lon, region)) return region;
  }
  return null;
}

// --- Authoritative (network-backed) lookup, with caching/throttling ------

/** Rounds to a stable cache-key precision — fine enough that it's
 *  effectively "exact" for any real coordinate (~11m), only normalising
 *  floating-point string formatting so the same point always hits the same
 *  cache entry. */
function regionCacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

/** Resolved results (including confirmed "no result") and in-flight request
 *  promises, keyed by `regionCacheKey` — shared across every call site/
 *  hook instance for the lifetime of the page, so re-rendering, re-hovering
 *  or a second waypoint that happens to share a point never re-fetches. */
interface AuthoritativeResult {
  name: string;
  /** Raw upstream placeType (e.g. "Strait", "IHO Sea Area", "Marine
   *  Region") — kept alongside the name so callers can decide whether this
   *  result is specific enough to override a more specific local fallback
   *  (see `isSpecificKind`/`useAuthoritativeRegionName`). */
  kind: string | null;
}
const resolvedCache = new Map<string, AuthoritativeResult | null>();
const inFlight = new Map<string, Promise<AuthoritativeResult | null>>();

/** Upstream placeTypes that name a narrow, specific feature (strait/
 *  channel/passage/bay/gulf) rather than a broad enclosing sea/ocean —
 *  mirrors `MaritimeRegionService.cs`'s own top priority tier. A result in
 *  this tier is specific enough to always override the local fallback
 *  (even a specific local one); anything else (IHO Sea Area, SeaVoX
 *  sub-region, Marine Region, General Sea Area) is only used to override a
 *  local fallback that was itself a broad sea/ocean (or none at all) — see
 *  `useAuthoritativeRegionName`.
 *
 *  Some genuinely specific features (e.g. "Strait of Malacca", "Singapore
 *  Strait") are only present in the IHO "Limits of Oceans and Seas"
 *  gazetteer as a placeType of "IHO Sea Area" rather than a dedicated
 *  "Strait" record, so the placeType tier alone isn't a reliable signal —
 *  the result's own name is also checked for a strait/channel/passage/
 *  sound/bay/gulf/narrows keyword, which catches these IHO-filed straits
 *  too without having to special-case them. */
const SPECIFIC_UPSTREAM_KINDS = new Set(['strait', 'channel', 'passage', 'sound', 'bay', 'gulf']);
const SPECIFIC_NAME_PATTERN = /\b(strait|channel|passage|sound|narrows|bay|gulf)\b/i;
function isSpecificResult(result: AuthoritativeResult): boolean {
  return (result.kind != null && SPECIFIC_UPSTREAM_KINDS.has(result.kind.toLowerCase())) ||
    SPECIFIC_NAME_PATTERN.test(result.name);
}
const SPECIFIC_LOCAL_KINDS = new Set<MaritimeRegionKind>(['strait', 'channel', 'gulf', 'bay']);

/** How many lookups may be in flight to the backend at once — a route can
 *  have hundreds of waypoints; firing a request per waypoint simultaneously
 *  would be both wasteful (the vast majority share just a handful of
 *  distinct named regions) and inconsiderate to the free public upstream
 *  service the backend proxies. Extra requests beyond this queue instead of
 *  firing immediately. */
const MAX_CONCURRENT_LOOKUPS = 4;
let activeLookups = 0;
const pendingQueue: Array<() => void> = [];

function runQueued(): void {
  if (activeLookups >= MAX_CONCURRENT_LOOKUPS) return;
  const next = pendingQueue.shift();
  if (next) {
    activeLookups += 1;
    next();
  }
}

function queuedFetch(lat: number, lon: number): Promise<AuthoritativeResult | null> {
  return new Promise((resolve) => {
    const run = () => {
      fetchMaritimeRegion(lat, lon)
        .then((result) => resolve(result ? { name: result.name, kind: result.kind } : null))
        .catch(() => resolve(null))
        .finally(() => {
          activeLookups -= 1;
          runQueued();
        });
    };
    pendingQueue.push(run);
    runQueued();
  });
}

/**
 * The authoritative region (name + upstream placeType), resolved from the
 * backend's Marine Regions gazetteer proxy, with this module-level cache/
 * dedupe/concurrency-limiting applied. Returns `null` until the (possibly
 * shared, possibly queued) request resolves, and forever after if the
 * gazetteer has no result for this point or the request fails — callers
 * should pair this with `findMaritimeRegion`'s instant local fallback for
 * what to show in the meantime (see `useAuthoritativeRegionName`).
 */
function getAuthoritativeRegion(lat: number, lon: number): Promise<AuthoritativeResult | null> {
  const key = regionCacheKey(lat, lon);
  if (resolvedCache.has(key)) return Promise.resolve(resolvedCache.get(key) ?? null);
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = queuedFetch(lat, lon).then((result) => {
    resolvedCache.set(key, result);
    inFlight.delete(key);
    return result;
  });
  inFlight.set(key, promise);
  return promise;
}

/**
 * React hook: the best available region name for a lat/lon — the
 * authoritative (network) result once resolved, or `fallback` (this file's
 * own instant local lookup) until then/if the authoritative lookup fails or
 * has no result. Used by the map's waypoint tooltip — see
 * `RouteEditorMap.tsx`.
 *
 * Specificity is compared, not just presence: many well-known straits (e.g.
 * Sunda Strait) exist in the gazetteer only as a bare named point with no
 * polygon, so a spatial lookup can never return them — it falls back to the
 * broad enclosing sea/ocean instead. Letting that unconditionally replace a
 * more specific local fallback would be a regression (e.g. "Sunda Strait"
 * silently becoming "Indian Ocean"), so a broad authoritative result
 * (anything other than Strait/Channel/Passage/Sound/Bay/Gulf) only wins
 * when the local fallback wasn't itself a specific strait/channel/gulf/bay.
 * A specific authoritative result (it has its own real polygon) always
 * wins, since it's the official name for the exact same kind of feature.
 */
export function useAuthoritativeRegionName(
  lat: number,
  lon: number,
  fallback: MaritimeRegion | null,
): string | null {
  const key = Number.isNaN(lat) || Number.isNaN(lon) ? null : regionCacheKey(lat, lon);
  const [resolved, setResolved] = useState<AuthoritativeResult | null | undefined>(() =>
    key ? resolvedCache.get(key) : undefined,
  );

  useEffect(() => {
    if (!key) return;
    const cached = resolvedCache.get(key);
    if (cached !== undefined) {
      setResolved(cached);
      return;
    }
    let cancelled = false;
    void getAuthoritativeRegion(lat, lon).then((result) => {
      if (!cancelled) setResolved(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const fallbackName = fallback?.name ?? null;
  const fallbackIsSpecific = fallback != null && SPECIFIC_LOCAL_KINDS.has(fallback.kind);
  if (resolved && (isSpecificResult(resolved) || !fallbackIsSpecific)) return resolved.name;
  return fallbackName;
}
