/**
 * Load Line Zones (ILLC 1966 / Annex II)
 * WGS84 / EPSG:4326
 * International Convention on Load Lines, 1966
 * 
 * COORDINATE SYSTEM: GeoJSON [LONGITUDE, LATITUDE]
 * React-Leaflet will convert to [LATITUDE, LONGITUDE] internally
 */

export interface BoundarySegment {
  type: 'LATITUDE' | 'LONGITUDE' | 'RHUMB_LINE' | 'COASTLINE';
  start: [number, number]; // [lon, lat]
  end: [number, number];   // [lon, lat]
  name?: string;
}

export interface LoadLineZone {
  id: string;
  name: string;
  type: 'PERMANENT' | 'WINTER' | 'WINTER_SEASONAL' | 'SEASONAL_TROPICAL' | 'SMALL_SHIP_WINTER';
  color: string;
  segments: BoundarySegment[];
  labelPosition: [number, number]; // [lon, lat]
  season?: {
    label: string;
    start: string; // MM-DD format
    end: string;   // MM-DD format
  };
  vesselSize?: '<=100m' | '>100m';
  description: string;
  /** True when `segments` fully enclose a simple lat/lon rectangle (2 LATITUDE + 2 LONGITUDE
   *  edges) — these render as a soft filled area via `closedZoneRing()` instead of bare
   *  boundary lines, which otherwise look like a stray box with no fill. */
  closed?: boolean;
}

/**
 * Convert GeoJSON coordinates [lon, lat] to Leaflet format [lat, lon]
 */
export function toLeafletCoords(coords: [number, number]): [number, number] {
  return [coords[1], coords[0]];
}

/**
 * Generate intermediate points for a rhumb line segment
 * Rhumb lines follow a constant bearing
 */
function generateRhumbLinePoints(
  start: [number, number],
  end: [number, number],
  steps: number = 10
): Array<[number, number]> {
  const [lon1, lat1] = start;
  let lon2 = end[0];
  const lat2 = end[1];

  // Normalize delta to [-180, 180] so we always cross via the shortest path
  while (lon2 - lon1 > 180) lon2 -= 360;
  while (lon2 - lon1 < -180) lon2 += 360;

  const pts: Array<[number, number]> = [start];
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    pts.push([lon1 + (lon2 - lon1) * t, lat1 + (lat2 - lat1) * t]);
  }
  pts.push([lon2, lat2]);
  return pts;
}

/**
 * Convert boundary segments to Leaflet polyline coordinates
 */
export function segmentToLineString(segment: BoundarySegment): Array<[number, number]> {
  const { type, start, end } = segment;

  if (type === 'LATITUDE') {
    // Horizontal line - constant latitude
    // Generate intermediate points along the latitude
    if (Math.abs(start[1] - end[1]) > 0.001) {
      console.warn(`LATITUDE segment has different latitudes: ${start[1]} vs ${end[1]}`);
    }
    return generateRhumbLinePoints(start, end, 15);
  } else if (type === 'LONGITUDE') {
    // Vertical line - constant longitude
    // Generate intermediate points along the longitude
    if (Math.abs(start[0] - end[0]) > 0.001) {
      console.warn(`LONGITUDE segment has different longitudes: ${start[0]} vs ${end[0]}`);
    }
    return generateRhumbLinePoints(start, end, 15);
  } else if (type === 'RHUMB_LINE') {
    // Rhumb line with intermediate points
    return generateRhumbLinePoints(start, end, 20);
  } else {
    // Coastline or other - straight line for now
    return [start, end];
  }
}

/**
 * Build the 4 Leaflet [lat, lon] corners of a `closed: true` zone's rectangle, derived purely
 * from its 2 LATITUDE + 2 LONGITUDE segment values (not their authoring order, which is
 * inconsistent across the dataset) — returns `null` if the zone isn't a clean rectangle.
 */
export function closedZoneRing(zone: LoadLineZone): [number, number][] | null {
  const lats = Array.from(new Set(zone.segments.filter((s) => s.type === 'LATITUDE').map((s) => s.start[1])));
  const lons = Array.from(new Set(zone.segments.filter((s) => s.type === 'LONGITUDE').map((s) => s.start[0])));
  if (lats.length !== 2 || lons.length !== 2) return null;
  const [latA, latB] = lats;
  const lonA = lons[0];
  // Shortest-path longitude so an antimeridian-spanning box (e.g. 145°E → -150°) still closes
  // as one rectangle instead of wrapping the long way round the globe.
  let lonB = lons[1];
  while (lonB - lonA > 180) lonB -= 360;
  while (lonB - lonA < -180) lonB += 360;
  return [
    [latA, lonA],
    [latB, lonA],
    [latB, lonB],
    [latA, lonB],
  ];
}


/**
 * Validate a segment for correct coordinate order and latitude/longitude consistency
 */
export function validateSegment(segment: BoundarySegment): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  if (segment.type === 'LATITUDE') {
    if (Math.abs(segment.start[1] - segment.end[1]) > 0.001) {
      warnings.push(
        `${segment.type} segment has varying latitudes: ` +
        `start=${segment.start[1]}, end=${segment.end[1]}`
      );
    }
  } else if (segment.type === 'LONGITUDE') {
    if (Math.abs(segment.start[0] - segment.end[0]) > 0.001) {
      warnings.push(
        `${segment.type} segment has varying longitudes: ` +
        `start=${segment.start[0]}, end=${segment.end[0]}`
      );
    }
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

// Load Line Zones — digitised from the ILLC 1966 / Annex II boundary text (meridians, parallels,
// rhumb lines and named coastal landmarks). `COASTLINE` segments connect two named coastal points
// with a straight line as a stand-in — real coastline polyline data isn't wired into this
// reference file, so these are explicitly typed/approximate rather than silently drawn as if they
// were a precise geometric (parallel/meridian/rhumb-line) boundary.
export const LOAD_LINE_ZONES: LoadLineZone[] = [
  {
    id: 'TROPICAL',
    name: 'Tropical Zone',
    type: 'PERMANENT',
    color: '#FF9800',
    segments: [
      // ---- Northern boundary (Annex II) ----
      { type: 'LATITUDE', start: [-82, 13], end: [-60, 13], name: 'American coast 13°N' },
      { type: 'RHUMB_LINE', start: [-60, 13], end: [-58, 10] },
      { type: 'LATITUDE', start: [-58, 10], end: [-20, 10] },
      { type: 'LONGITUDE', start: [-20, 10], end: [-20, 30] },
      { type: 'LATITUDE', start: [-20, 30], end: [-17, 30], name: 'West coast of Africa' },
      { type: 'COASTLINE', start: [-17, 30], end: [45, 8], name: 'West & south Africa coast to Gulf of Aden (approx.)' },
      { type: 'LATITUDE', start: [45, 8], end: [70, 8] },
      { type: 'LONGITUDE', start: [70, 8], end: [70, 13] },
      { type: 'LATITUDE', start: [70, 13], end: [74, 13], name: 'West coast of India' },
      { type: 'COASTLINE', start: [74, 13], end: [80.3, 10.5], name: 'South coast of India (approx.)' },
      { type: 'RHUMB_LINE', start: [80.3, 10.5], end: [82, 9] },
      { type: 'LONGITUDE', start: [82, 9], end: [82, 8] },
      { type: 'LATITUDE', start: [82, 8], end: [100, 8], name: 'West coast of Malaysia' },
      { type: 'COASTLINE', start: [100, 8], end: [109, 10], name: 'SE Asia coast to east Vietnam (Saigon on boundary)' },
      { type: 'LATITUDE', start: [109, 10], end: [145, 10] },
      { type: 'LONGITUDE', start: [145, 10], end: [145, 13] },
      // Crosses the Pacific back to the American coast (antimeridian crossing is intentional)
      { type: 'LATITUDE', start: [145, 13], end: [-82, 13] },
      // ---- Southern boundary (Annex II) ----
      { type: 'RHUMB_LINE', start: [-46.33, -23.96], end: [-40, -23.43], name: 'Santos, Brazil to Tropic of Capricorn/40°W' },
      { type: 'LATITUDE', start: [-40, -23.43], end: [12, -23.43], name: 'Tropic of Capricorn to West Africa' },
      { type: 'COASTLINE', start: [12, -23.43], end: [40, -20], name: 'Southern Africa coast (approx.)' },
      { type: 'LATITUDE', start: [40, -20], end: [44, -20], name: 'To west Madagascar' },
      { type: 'COASTLINE', start: [44, -20], end: [50, -12], name: 'West & north Madagascar coast (approx.)' },
      { type: 'LONGITUDE', start: [50, -12], end: [50, -10] },
      { type: 'LATITUDE', start: [50, -10], end: [98, -10] },
      { type: 'RHUMB_LINE', start: [98, -10], end: [130.84, -12.46], name: 'To Port Darwin' },
      { type: 'COASTLINE', start: [130.84, -12.46], end: [136.75, -11], name: 'Australian & Wessel Island coasts to Cape Wessel' },
      { type: 'LATITUDE', start: [136.75, -11], end: [142.53, -11], name: 'To west Cape York' },
      // Continues along 11°S across the Pacific to 150°W (antimeridian crossing is intentional)
      { type: 'LATITUDE', start: [142.53, -11], end: [-150, -11] },
      { type: 'RHUMB_LINE', start: [-150, -11], end: [-75, -26] },
      { type: 'RHUMB_LINE', start: [-75, -26], end: [-72, -32.78] },
      { type: 'LATITUDE', start: [-72, -32.78], end: [-71.6, -32.78], name: 'To west coast of South America (Valparaíso)' },
    ],
    labelPosition: [20, 5],
    description: 'Tropical Zone - Permanent throughout the year. Includes the Suez Canal, Red Sea, Gulf of Aden (to 45°E), Persian Gulf (to 59°E) and the Great Barrier Reef area. Saigon, Valparaíso and Santos lie on the boundary.',
  },

  {
    id: 'NA_WINTER_I',
    name: 'North Atlantic Winter I',
    type: 'WINTER',
    color: '#2196F3',
    segments: [
      { type: 'LONGITUDE', start: [-50, 45], end: [-50, 60], name: 'Meridian 50°W from Greenland coast' },
      { type: 'LATITUDE', start: [-50, 45], end: [-15, 45], name: 'Parallel 45°N' },
      { type: 'LONGITUDE', start: [-15, 45], end: [-15, 60], name: 'Meridian 15°W' },
      // Shetland Islands lie on/near this boundary per the Convention.
      { type: 'LATITUDE', start: [-15, 60], end: [0, 60], name: 'Parallel 60°N to Greenwich (Shetland Islands on boundary)' },
      { type: 'LONGITUDE', start: [0, 60], end: [0, 70], name: 'Greenwich meridian, northward' },
    ],
    labelPosition: [-28, 53],
    season: {
      label: 'Oct 16 - Apr 15',
      start: '10-16',
      end: '04-15',
    },
    description: 'North Atlantic Winter Seasonal Zone I. The North Atlantic Winter Load Line rule applies to the whole of this zone.',
  },

  {
    id: 'NA_WINTER_II',
    name: 'North Atlantic Winter II',
    type: 'WINTER',
    color: '#1976D2',
    segments: [
      { type: 'LONGITUDE', start: [-68.5, 38], end: [-68.5, 40], name: 'Meridian 68°30\'W from US coast' },
      { type: 'RHUMB_LINE', start: [-68.5, 40], end: [-73, 36] },
      { type: 'LATITUDE', start: [-73, 36], end: [-25, 36] },
      { type: 'RHUMB_LINE', start: [-25, 36], end: [-9.28, 43.05], name: 'To Cape Toriñana' },
    ],
    labelPosition: [-45, 38],
    season: {
      label: 'Nov 1 - Mar 31',
      start: '11-01',
      end: '03-31',
    },
    description: 'North Atlantic Winter Seasonal Zone II. Excludes Zone I, the North Atlantic Winter Seasonal Area and the Baltic Sea. The North Atlantic Winter Load Line rule applies to the part of this zone between 15°W and 50°W.',
  },

  {
    id: 'NA_WINTER_SEASONAL',
    name: 'North Atlantic Winter Seasonal',
    type: 'WINTER_SEASONAL',
    color: '#64B5F6',
    segments: [
      { type: 'LONGITUDE', start: [-68.5, 38], end: [-68.5, 40], name: 'Meridian 68°30\'W from US coast' },
      { type: 'RHUMB_LINE', start: [-68.5, 40], end: [-61, 44], name: 'To Canadian coast at 61°W' },
      { type: 'COASTLINE', start: [-61, 44], end: [-68.5, 38], name: 'Canadian & US east coast (approx.)' },
    ],
    labelPosition: [-65, 42],
    vesselSize: '<=100m',
    season: {
      label: '≤100m: Nov 1 - Mar 31 | >100m: Dec 16 - Feb 15',
      start: '11-01',
      end: '03-31',
    },
    description: 'North Atlantic Winter Seasonal Area.',
  },

  {
    id: 'NA_EAST_COAST_SEASONAL',
    name: 'North American East Coast Winter Seasonal Area',
    type: 'WINTER_SEASONAL',
    color: '#4FC3F7',
    vesselSize: '<=100m',
    segments: [
      { type: 'LONGITUDE', start: [-68.5, 38], end: [-68.5, 40], name: 'Meridian 68°30\'W from US coast' },
      { type: 'RHUMB_LINE', start: [-68.5, 40], end: [-73, 36] },
      { type: 'LATITUDE', start: [-73, 36], end: [-76, 36], name: 'Parallel 36°N to US coast' },
      { type: 'COASTLINE', start: [-76, 36], end: [-68.5, 38], name: 'US east coast (approx.)' },
    ],
    labelPosition: [-70, 38],
    season: {
      label: 'Nov 1 - Mar 31',
      start: '11-01',
      end: '03-31',
    },
    description: 'North American East Coast Winter Seasonal Area — ships 100m or less only.',
  },

  {
    id: 'NP_WINTER',
    name: 'North Pacific Winter',
    type: 'WINTER',
    color: '#1565C0',
    segments: [
      { type: 'LATITUDE', start: [141.7, 50], end: [142.1, 50], name: 'Parallel 50°N, Russia coast to Sakhalin' },
      { type: 'COASTLINE', start: [142.1, 50], end: [142.1, 45.91], name: 'West coast of Sakhalin to Cape Kuril\'on' },
      { type: 'RHUMB_LINE', start: [142.1, 45.91], end: [141.67, 45.42], name: 'To Wakkanai, Hokkaido' },
      { type: 'COASTLINE', start: [141.67, 45.42], end: [145, 43], name: 'East & south coast of Hokkaido to 145°E' },
      { type: 'LONGITUDE', start: [145, 43], end: [145, 35] },
      { type: 'LATITUDE', start: [145, 35], end: [-150, 35] },
      { type: 'RHUMB_LINE', start: [-150, 35], end: [-133.05, 54.9], name: 'To southern extremity of Dall Island, Alaska' },
    ],
    labelPosition: [170, 42],
    season: {
      label: 'Oct 16 - Apr 15',
      start: '10-16',
      end: '04-15',
    },
    description: 'North Pacific Winter Seasonal Zone.',
  },

  {
    id: 'S_WINTER',
    name: 'Southern Winter',
    type: 'WINTER',
    color: '#0D47A1',
    segments: [
      { type: 'RHUMB_LINE', start: [-65.9, -47.08], end: [-50, -34], name: 'Cape Tres Puntas to 34°S/50°W' },
      { type: 'LATITUDE', start: [-50, -34], end: [16, -34] },
      { type: 'RHUMB_LINE', start: [16, -34], end: [20, -36] },
      { type: 'RHUMB_LINE', start: [20, -36], end: [30, -34] },
      { type: 'RHUMB_LINE', start: [30, -34], end: [118, -35.5] },
      { type: 'RHUMB_LINE', start: [118, -35.5], end: [144.68, -40.68], name: 'To Cape Grim, Tasmania' },
      { type: 'COASTLINE', start: [144.68, -40.68], end: [147.15, -43.53], name: 'North/east Tasmania coast to Bruny Island' },
      { type: 'RHUMB_LINE', start: [147.15, -43.53], end: [167.7, -47.17], name: 'To Black Rock Point, Stewart Island' },
      { type: 'RHUMB_LINE', start: [167.7, -47.17], end: [170, -47] },
      // Crosses antimeridian eastward: 170°E → 190°E (=170°W)
      { type: 'RHUMB_LINE', start: [170, -47], end: [-170, -33] },
      { type: 'LATITUDE', start: [-170, -33], end: [-79, -33] },
      { type: 'RHUMB_LINE', start: [-79, -33], end: [-75, -41] },
      { type: 'RHUMB_LINE', start: [-75, -41], end: [-73.883, -41.783], name: 'To Punta Corona lighthouse, Chiloé' },
      { type: 'COASTLINE', start: [-73.883, -41.783], end: [-74.33, -43.33], name: 'North/east/south Chiloé coast' },
      { type: 'LONGITUDE', start: [-74.33, -43.33], end: [-74.33, -45.75], name: 'Meridian 74°20\'W southward (incl. inner Chiloé channels)' },
    ],
    labelPosition: [20, -40],
    season: {
      label: 'Apr 16 - Oct 15',
      start: '04-16',
      end: '10-15',
    },
    description: 'Southern Winter Seasonal Zone.',
  },

  {
    id: 'STA_NATL',
    name: 'Seasonal Tropical - Atlantic',
    type: 'SEASONAL_TROPICAL',
    color: '#FFB74D',
    segments: [
      { type: 'RHUMB_LINE', start: [-87.12, 21.6], end: [-84.95, 21.87], name: 'Cape Catoche, Yucatán to Cape San Antonio, Cuba' },
      { type: 'COASTLINE', start: [-84.95, 21.87], end: [-75, 20], name: 'North coast of Cuba to 20°N' },
      { type: 'LATITUDE', start: [-75, 20], end: [-20, 20] },
      { type: 'RHUMB_LINE', start: [-20, 20], end: [-20, 10], name: 'Down to the Tropical Zone northern boundary' },
    ],
    labelPosition: [-55, 16],
    season: {
      label: 'Nov 1 - Jul 15',
      start: '11-01',
      end: '07-15',
    },
    description: 'Seasonal Tropical Area - North Atlantic. Southern/eastern boundary follows the Tropical Zone\'s northern boundary.',
  },

  {
    id: 'STA_ARABIAN',
    name: 'Seasonal Tropical - Arabian Sea',
    type: 'SEASONAL_TROPICAL',
    color: '#FFD54F',
    segments: [
      { type: 'COASTLINE', start: [45, 10], end: [45, 12], name: 'African coast, 45°E in Gulf of Aden' },
      { type: 'COASTLINE', start: [45, 12], end: [59, 17], name: 'South Arabian coast to Gulf of Oman' },
      { type: 'LONGITUDE', start: [59, 17], end: [59, 20], name: '59°E in Gulf of Oman' },
      { type: 'COASTLINE', start: [59, 20], end: [62, 21], name: 'Pakistan coast' },
      { type: 'COASTLINE', start: [62, 21], end: [70, 13], name: 'India coast, down to the Tropical Zone boundary' },
    ],
    labelPosition: [55, 15],
    season: {
      label: 'Dec 1 - Apr 30',
      start: '12-01',
      end: '04-30',
    },
    description: 'Seasonal Tropical Area - Arabian Sea. Southern boundary follows the Tropical Zone\'s northern boundary.',
  },

  {
    id: 'STA_PERSIAN_GULF',
    name: 'Seasonal Tropical - Persian Gulf',
    type: 'SEASONAL_TROPICAL',
    color: '#FFC107',
    segments: [
      { type: 'LONGITUDE', start: [56, 24], end: [56, 27], name: 'Gulf entrance 56°E' },
      { type: 'COASTLINE', start: [56, 27], end: [51, 30], name: 'Up the Persian Gulf (approx.)' },
      { type: 'RHUMB_LINE', start: [51, 30], end: [59, 25], name: 'To Gulf of Oman, 59°E' },
    ],
    labelPosition: [55, 26],
    season: {
      label: 'Sep 1 - May 31',
      start: '09-01',
      end: '05-31',
    },
    description: 'Seasonal Tropical Area - Persian Gulf (to 59°E).',
  },

  {
    id: 'STA_BAY_BENGAL',
    name: 'Seasonal Tropical - Bay of Bengal',
    type: 'SEASONAL_TROPICAL',
    color: '#FFCA28',
    // Not rendered filled — this is the Bay of Bengal water area north of the Tropical Zone
    // boundary; a solid rectangular fill would cover a lot of India/Bangladesh/Myanmar land.
    segments: [
      { type: 'LATITUDE', start: [82, 8], end: [98, 8], name: 'Tropical Zone boundary (south)' },
      { type: 'COASTLINE', start: [98, 8], end: [98, 20], name: 'Myanmar coast (approx.)' },
      { type: 'COASTLINE', start: [98, 20], end: [82, 20], name: 'Head of the bay (approx.)' },
      { type: 'COASTLINE', start: [82, 20], end: [82, 8], name: 'East coast of India (approx.)' },
    ],
    labelPosition: [90, 14],
    season: {
      label: 'Dec 1 - Apr 30',
      start: '12-01',
      end: '04-30',
    },
    description: 'Seasonal Tropical Area - Bay of Bengal, north of the Tropical Zone\'s northern boundary.',
  },

  {
    id: 'STA_SIO_A',
    name: 'Seasonal Tropical - Indian Ocean A',
    type: 'SEASONAL_TROPICAL',
    color: '#FFA726',
    segments: [
      { type: 'LATITUDE', start: [44, -20], end: [50, -20], name: 'Southern boundary 20°S' },
      { type: 'RHUMB_LINE', start: [50, -20], end: [51.5, -15] },
      { type: 'LONGITUDE', start: [51.5, -15], end: [51.5, -10] },
      { type: 'COASTLINE', start: [51.5, -10], end: [44, -20], name: 'East coast of Madagascar (approx.), closing to Tropical Zone boundary' },
    ],
    labelPosition: [51, -15],
    season: {
      label: 'Apr 1 - Nov 30',
      start: '04-01',
      end: '11-30',
    },
    description: 'Seasonal Tropical Area - South Indian Ocean A. North/west boundary follows the Tropical Zone\'s southern boundary and the east coast of Madagascar.',
  },

  {
    id: 'STA_SIO_B',
    name: 'Seasonal Tropical - Indian Ocean B',
    type: 'SEASONAL_TROPICAL',
    color: '#FF7043',
    segments: [
      { type: 'LONGITUDE', start: [51.5, -10], end: [51.5, -15], name: 'West boundary, meridian 51°30\'E' },
      { type: 'LATITUDE', start: [51.5, -15], end: [114, -15] },
      { type: 'LONGITUDE', start: [114, -15], end: [114, -21.5], name: 'Meridian 114°E to Australia' },
      { type: 'COASTLINE', start: [114, -21.5], end: [98, -10], name: 'NW Australia coast, closing to Tropical Zone boundary' },
    ],
    labelPosition: [85, -13],
    season: {
      label: 'May 1 - Nov 30',
      start: '05-01',
      end: '11-30',
    },
    description: 'Seasonal Tropical Area - South Indian Ocean B. North boundary follows the Tropical Zone\'s southern boundary; east boundary is Australia.',
  },

  {
    id: 'STA_CHINA',
    name: 'Seasonal Tropical - China Sea',
    type: 'SEASONAL_TROPICAL',
    color: '#FF6E40',
    segments: [
      { type: 'COASTLINE', start: [109, 10], end: [114.17, 22.3], name: 'Vietnam/China coast, 10°N to Hong Kong' },
      { type: 'RHUMB_LINE', start: [114.17, 22.3], end: [119.9, 15.9], name: 'Hong Kong to Sual, Luzon' },
      { type: 'COASTLINE', start: [119.9, 15.9], end: [124.5, 10], name: 'West coast of Luzon/Samar/Leyte to 10°N' },
      { type: 'LATITUDE', start: [124.5, 10], end: [109, 10] },
    ],
    labelPosition: [120, 13],
    season: {
      label: 'Jan 21 - Apr 30',
      start: '01-21',
      end: '04-30',
    },
    description: 'Seasonal Tropical Area - China Sea. Hong Kong and Sual lie on the boundary.',
  },

  {
    id: 'STA_NP_A',
    name: 'Seasonal Tropical - North Pacific A',
    type: 'SEASONAL_TROPICAL',
    color: '#F57C00',
    closed: true,
    segments: [
      // South 13°N — crosses antimeridian eastward (160°E → 130°W)
      { type: 'LATITUDE', start: [160, 13], end: [-130, 13] },
      { type: 'LONGITUDE', start: [-130, 13], end: [-130, 25] },
      // North 25°N — crosses antimeridian westward (130°W → 160°E)
      { type: 'LATITUDE', start: [-130, 25], end: [160, 25] },
      { type: 'LONGITUDE', start: [160, 25], end: [160, 13] },
    ],
    labelPosition: [-175, 19],
    season: {
      label: 'Apr 1 - Oct 31',
      start: '04-01',
      end: '10-31',
    },
    description: 'Seasonal Tropical Area - North Pacific A.',
  },

  {
    id: 'STA_NP_B',
    name: 'Seasonal Tropical - North Pacific B',
    type: 'SEASONAL_TROPICAL',
    color: '#E65100',
    segments: [
      { type: 'COASTLINE', start: [-123, 40], end: [-123, 33], name: 'West coast of America, meridian 123°W' },
      { type: 'RHUMB_LINE', start: [-123, 33], end: [-105, 13] },
      { type: 'LATITUDE', start: [-105, 13], end: [-123, 13], name: 'Parallel 13°N' },
    ],
    labelPosition: [-115, 22],
    season: {
      label: 'Mar 1-Jun 30, Nov 1-Nov 30',
      start: '03-01',
      end: '06-30',
    },
    description: 'Seasonal Tropical Area - North Pacific B. Also tropical 1 Nov – 30 Nov (summer the rest of the year).',
  },

  {
    id: 'STA_SP_A',
    name: 'Seasonal Tropical - Gulf of Carpentaria',
    type: 'SEASONAL_TROPICAL',
    color: '#FFA000',
    closed: true,
    segments: [
      { type: 'LATITUDE', start: [130, -11], end: [135, -11], name: 'North 11°S' },
      { type: 'LONGITUDE', start: [135, -11], end: [135, -20], name: 'East 135°E' },
      { type: 'LATITUDE', start: [135, -20], end: [130, -20], name: 'South 20°S' },
      { type: 'LONGITUDE', start: [130, -20], end: [130, -11], name: 'West 130°E' },
    ],
    labelPosition: [132, -15],
    season: {
      label: 'Apr 1 - Nov 30',
      start: '04-01',
      end: '11-30',
    },
    description: 'Seasonal Tropical Area - Gulf of Carpentaria, south of 11°S.',
  },

  {
    id: 'STA_SP_B',
    name: 'Seasonal Tropical - South Pacific B',
    type: 'SEASONAL_TROPICAL',
    color: '#FF8F00',
    segments: [
      { type: 'LATITUDE', start: [153.3, -24], end: [154, -24], name: 'East Australia to 154°E' },
      { type: 'LONGITUDE', start: [154, -24], end: [154, -23.43], name: 'Meridian 154°E to Tropic of Capricorn' },
      // Tropic of Capricorn across the Pacific to 150°W (antimeridian crossing is intentional)
      { type: 'LATITUDE', start: [154, -23.43], end: [-150, -23.43] },
      { type: 'LONGITUDE', start: [-150, -23.43], end: [-150, -20] },
      { type: 'LATITUDE', start: [-150, -20], end: [153, -20], name: 'Parallel 20°S to Tropical Zone boundary' },
      { type: 'COASTLINE', start: [153, -20], end: [153.3, -24], name: 'Great Barrier Reef / east Australia coast' },
    ],
    labelPosition: [170, -27],
    description: 'Seasonal Tropical Area - South Pacific B.',
    season: {
      label: 'Apr 1 - Nov 30',
      start: '04-01',
      end: '11-30',
    },
  },

  {
    id: 'BALTIC_SEA_WINTER',
    name: 'Baltic Sea Winter',
    type: 'SMALL_SHIP_WINTER',
    color: '#AB47BC',
    closed: true,
    vesselSize: '<=100m',
    segments: [
      { type: 'LATITUDE', start: [9, 54], end: [30, 54], name: 'South 54°N' },
      { type: 'LONGITUDE', start: [30, 54], end: [30, 66], name: 'East 30°E' },
      { type: 'LATITUDE', start: [30, 66], end: [9, 66], name: 'North 66°N' },
      { type: 'LONGITUDE', start: [9, 66], end: [9, 54], name: 'West 9°E' },
    ],
    labelPosition: [20, 60],
    season: {
      label: 'Nov 1 - Mar 31',
      start: '11-01',
      end: '03-31',
    },
    description: 'Baltic Sea Winter Seasonal Area (≤100m vessels) — otherwise Summer Zone.',
  },

  {
    id: 'BLACK_SEA_WINTER',
    name: 'Black Sea Winter',
    type: 'SMALL_SHIP_WINTER',
    color: '#9C27B0',
    closed: true,
    segments: [
      { type: 'LATITUDE', start: [27, 44], end: [42, 44], name: 'South 44°N' },
      { type: 'LONGITUDE', start: [42, 44], end: [42, 50], name: 'East 42°E' },
      { type: 'LATITUDE', start: [42, 50], end: [27, 50], name: 'North 50°N' },
      { type: 'LONGITUDE', start: [27, 50], end: [27, 44], name: 'West 27°E' },
    ],
    labelPosition: [34, 47],
    vesselSize: '<=100m',
    season: {
      label: 'Dec 1 - Feb 28/29',
      start: '12-01',
      end: '02-28',
    },
    description: 'Black Sea Winter Seasonal Area, north of 44°N (≤100m vessels) — otherwise Summer Zone.',
  },

  {
    id: 'MEDITERRANEAN_WINTER',
    name: 'Mediterranean Winter',
    type: 'SMALL_SHIP_WINTER',
    color: '#7B1FA2',
    segments: [
      { type: 'LONGITUDE', start: [3, 42.3], end: [3, 40], name: 'Meridian 3°E from Spanish coast' },
      { type: 'LATITUDE', start: [3, 40], end: [8.5, 40], name: 'Parallel 40°N to west Sardinia' },
      { type: 'COASTLINE', start: [8.5, 40], end: [9, 41.3], name: 'West/north Sardinia coast' },
      { type: 'LONGITUDE', start: [9, 41.3], end: [9, 41.4], name: 'Meridian 9°E to south Corsica' },
      { type: 'COASTLINE', start: [9, 41.4], end: [9, 43], name: 'West/north Corsica coast' },
      { type: 'RHUMB_LINE', start: [9, 43], end: [5.83, 43.08], name: 'To Cape Sicié' },
      { type: 'COASTLINE', start: [5.83, 43.08], end: [3, 42.3], name: 'French/Spanish coast, closing the loop' },
    ],
    labelPosition: [6, 41.5],
    vesselSize: '<=100m',
    season: {
      label: 'Dec 16 - Mar 15',
      start: '12-16',
      end: '03-15',
    },
    description: 'Western Mediterranean Winter Seasonal Area (≤100m vessels) — otherwise Summer Zone.',
  },

  {
    id: 'JAPAN_WINTER',
    name: 'Sea of Japan Winter',
    type: 'SMALL_SHIP_WINTER',
    color: '#6A1B9A',
    segments: [
      { type: 'LATITUDE', start: [128, 50], end: [142, 50], name: 'Parallel 50°N' },
      { type: 'COASTLINE', start: [142, 50], end: [140.3, 43.2], name: 'Sakhalin/Hokkaido coast to west Hokkaido' },
      { type: 'RHUMB_LINE', start: [140.3, 43.2], end: [128.6, 38], name: 'To Korea at 38°N' },
      { type: 'COASTLINE', start: [128.6, 38], end: [128, 50], name: 'Korea coast, closing the loop' },
    ],
    labelPosition: [136, 44],
    vesselSize: '<=100m',
    season: {
      label: 'Dec 1 - Feb 28/29',
      start: '12-01',
      end: '02-28',
    },
    description: 'Sea of Japan Winter Seasonal Area, south of 50°N (≤100m vessels) — otherwise Summer Zone.',
  },
];


export function getLoadLineZoneStyle(type: LoadLineZone['type']) {
  const styles: Record<LoadLineZone['type'], { label: string; color: string }> = {
    PERMANENT: { label: 'Permanent', color: '#FF9800' },
    WINTER: { label: 'Winter', color: '#2196F3' },
    WINTER_SEASONAL: { label: 'Winter Seasonal', color: '#64B5F6' },
    SEASONAL_TROPICAL: { label: 'Seasonal Tropical', color: '#FFB74D' },
    SMALL_SHIP_WINTER: { label: 'Small Ship Winter', color: '#9C27B0' },
  };
  return styles[type] ?? { label: 'Unknown', color: '#999999' };
}

/* ------------------------------------------------- zone lookup (lat/lon + date) */

export interface ZoneClassification {
  /** Zone label — e.g. "Tropical Zone", "Summer Zone", or a named regional zone
   *  (always contains "Tropical"/"Winter"/"Summer" so draft-cap lookups that match on those
   *  substrings keep working). */
  name: string;
  /** True when a date-bound seasonal zone was in effect (vs. the permanent/open-ocean default). */
  seasonal: boolean;
}

function mmddOf(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** MM-DD window check — handles windows that wrap the year end (e.g. "10-16"–"04-15"). */
function inSeasonWindow(mmdd: string, start: string, end: string): boolean {
  return start <= end ? (mmdd >= start && mmdd <= end) : (mmdd >= start || mmdd <= end);
}

/** Longitude range containment, tolerant of ranges that cross the antimeridian. */
function lonInRange(lon: number, lonMin: number, lonMax: number): boolean {
  return lonMin <= lonMax ? (lon >= lonMin && lon <= lonMax) : (lon >= lonMin || lon <= lonMax);
}

/**
 * Best-effort IMO Load Line Zone (ILLC 1966 / Annex II) lookup for a position and date.
 *
 * Closed regional areas defined in `LOAD_LINE_ZONES` (exactly 4 boundary segments — e.g. the
 * Mediterranean/Black Sea/Bay of Bengal/etc. seasonal boxes) are matched first; everything else
 * falls back to a generalised latitude-band approximation (Tropical / Summer / Winter) for the
 * open ocean. This is a planning aid only — always confirm the applicable zone against the
 * current IMO Load Line Zone chart and the vessel's load line certificate.
 */
export function classifyLoadLineZone(lat: number, lon: number, date: Date = new Date()): ZoneClassification {
  const mmdd = Number.isNaN(date.getTime()) ? '' : mmddOf(date);

  for (const zone of LOAD_LINE_ZONES) {
    if (zone.segments.length !== 4) continue;
    const lats = zone.segments.flatMap((s) => [s.start[1], s.end[1]]);
    const lons = zone.segments.flatMap((s) => [s.start[0], s.end[0]]);
    const latMin = Math.min(...lats);
    const latMax = Math.max(...lats);
    const lonMin = Math.min(...lons);
    const lonMax = Math.max(...lons);
    if (lat < latMin || lat > latMax || !lonInRange(lon, lonMin, lonMax)) continue;
    if (zone.season && mmdd && !inSeasonWindow(mmdd, zone.season.start, zone.season.end)) continue;
    return { name: zone.name, seasonal: !!zone.season };
  }

  const absLat = Math.abs(lat);
  if (absLat <= 11.5) return { name: 'Tropical Zone', seasonal: false };
  if (absLat <= 33) return { name: 'Summer Zone', seasonal: false };
  const northernWinter = mmdd ? inSeasonWindow(mmdd, '11-01', '03-31') : false;
  const southernWinter = mmdd ? inSeasonWindow(mmdd, '04-16', '10-15') : false;
  const winterNow = lat >= 0 ? northernWinter : southernWinter;
  return { name: winterNow ? 'Winter Seasonal Zone' : 'Summer Zone', seasonal: winterNow };
}

