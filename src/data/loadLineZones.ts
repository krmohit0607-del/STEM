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

// Load Line Zones with proper GeoJSON [lon, lat] coordinates
export const LOAD_LINE_ZONES: LoadLineZone[] = [
  {
    id: 'TROPICAL',
    name: 'Tropical Zone',
    type: 'PERMANENT',
    color: '#FF9800',
    segments: [
      // Atlantic northern boundary
      { type: 'RHUMB_LINE', start: [-60, 13], end: [-58, 10] },
      { type: 'LATITUDE', start: [-58, 10], end: [-20, 10] },
      { type: 'LONGITUDE', start: [-20, 10], end: [-20, 30] },
      { type: 'LATITUDE', start: [-20, 30], end: [-5, 30] },
      // Indian Ocean northern boundary
      { type: 'LATITUDE', start: [45, 8], end: [70, 8] },
      { type: 'LONGITUDE', start: [70, 8], end: [70, 13] },
      { type: 'LATITUDE', start: [70, 13], end: [77, 13] },
      // SE Asia / Pacific northern boundary
      { type: 'LATITUDE', start: [100, 10], end: [145, 10] },
      { type: 'LONGITUDE', start: [145, 10], end: [145, 13] },
      // Pacific 13°N — antimeridian correction handled in generateRhumbLinePoints
      { type: 'LATITUDE', start: [145, 13], end: [-80, 13] },
    ],
    labelPosition: [20, 5],
    description: 'Tropical Zone - Permanent throughout the year',
  },

  {
    id: 'NA_WINTER_I',
    name: 'North Atlantic Winter I',
    type: 'WINTER',
    color: '#2196F3',
    segments: [
      { type: 'LONGITUDE', start: [-50, 45], end: [-50, 60], name: 'West boundary' },
      { type: 'LATITUDE', start: [-50, 45], end: [-15, 45], name: 'South 45°N' },
      { type: 'LONGITUDE', start: [-15, 45], end: [-15, 60], name: 'East boundary' },
      { type: 'LATITUDE', start: [-15, 60], end: [0, 60], name: 'North 60°N' },
    ],
    labelPosition: [-32, 52],
    season: {
      label: 'Oct 16 - Apr 15',
      start: '10-16',
      end: '04-15',
    },
    description: 'North Atlantic Winter Zone I',
  },

  {
    id: 'NA_WINTER_II',
    name: 'North Atlantic Winter II',
    type: 'WINTER',
    color: '#1976D2',
    segments: [
      // 40°N from 68.5°W west US coast eastward, rhumb SW to 36°N/73°W
      { type: 'RHUMB_LINE', start: [-68.5, 40], end: [-73, 36] },
      { type: 'LATITUDE', start: [-73, 36], end: [-25, 36] },
      { type: 'RHUMB_LINE', start: [-25, 36], end: [-9, 43] },
    ],
    labelPosition: [-45, 38],
    season: {
      label: 'Nov 1 - Mar 31',
      start: '11-01',
      end: '03-31',
    },
    description: 'North Atlantic Winter Zone II',
  },

  {
    id: 'NA_WINTER_SEASONAL',
    name: 'North Atlantic Winter Seasonal',
    type: 'WINTER_SEASONAL',
    color: '#64B5F6',
    segments: [
      { type: 'LONGITUDE', start: [-68.5, 40], end: [-68.5, 45], name: 'West US coast' },
      { type: 'LATITUDE', start: [-68.5, 40], end: [-61, 40], name: 'South 40°N' },
      { type: 'LONGITUDE', start: [-61, 40], end: [-61, 45], name: 'Canadian coast' },
    ],
    labelPosition: [-65, 42],
    vesselSize: '<=100m',
    season: {
      label: '≤100m: Nov 1 - Mar 31 | >100m: Dec 16 - Feb 15',
      start: '11-01',
      end: '03-31',
    },
    description: 'North Atlantic Winter Seasonal Area',
  },

  {
    id: 'NP_WINTER',
    name: 'North Pacific Winter',
    type: 'WINTER',
    color: '#1565C0',
    segments: [
      // East/West vertical boundaries
      { type: 'LONGITUDE', start: [145, 35], end: [145, 50] },
      { type: 'LONGITUDE', start: [-150, 35], end: [-150, 50] },
      // South 35°N — crosses antimeridian eastward (145°E → 150°W)
      { type: 'LATITUDE', start: [145, 35], end: [-150, 35] },
      // North 50°N — crosses antimeridian eastward
      { type: 'LATITUDE', start: [145, 50], end: [-150, 50] },
    ],
    labelPosition: [170, 42],
    season: {
      label: 'Oct 16 - Apr 15',
      start: '10-16',
      end: '04-15',
    },
    description: 'North Pacific Winter Zone',
  },

  {
    id: 'S_WINTER',
    name: 'Southern Winter',
    type: 'WINTER',
    color: '#0D47A1',
    segments: [
      { type: 'RHUMB_LINE', start: [-72, -32.78], end: [-50, -34] },
      { type: 'LATITUDE', start: [-50, -34], end: [16, -34] },
      { type: 'LONGITUDE', start: [16, -34], end: [16, -36] },
      { type: 'RHUMB_LINE', start: [16, -36], end: [30, -34] },
      { type: 'RHUMB_LINE', start: [30, -34], end: [118, -35.5] },
      { type: 'RHUMB_LINE', start: [118, -35.5], end: [170, -47] },
      // Crosses antimeridian eastward: 170°E → 190°E (=170°W)
      { type: 'RHUMB_LINE', start: [170, -47], end: [-170, -33] },
      { type: 'RHUMB_LINE', start: [-170, -33], end: [-75, -41] },
    ],
    labelPosition: [20, -40],
    season: {
      label: 'Apr 16 - Oct 15',
      start: '04-16',
      end: '10-15',
    },
    description: 'Southern Winter Zone',
  },

  {
    id: 'STA_NATL',
    name: 'Seasonal Tropical - Atlantic',
    type: 'SEASONAL_TROPICAL',
    color: '#FFB74D',
    segments: [
      { type: 'LATITUDE', start: [-87, 20], end: [-60, 20], name: 'Gulf of Mexico 20°N' },
      { type: 'LONGITUDE', start: [-60, 20], end: [-60, 13], name: 'To tropical zone' },
    ],
    labelPosition: [-75, 18],
    season: {
      label: 'Nov 1 - Jul 15',
      start: '11-01',
      end: '07-15',
    },
    description: 'Seasonal Tropical Area - North Atlantic',
  },

  {
    id: 'STA_ARABIAN',
    name: 'Seasonal Tropical - Arabian Sea',
    type: 'SEASONAL_TROPICAL',
    color: '#FFD54F',
    segments: [
      { type: 'LATITUDE', start: [45, 10], end: [59, 10], name: 'Gulf of Aden 10°N' },
      { type: 'LONGITUDE', start: [59, 10], end: [59, 20], name: 'Gulf of Oman 59°E' },
      { type: 'LATITUDE', start: [59, 20], end: [62, 20], name: 'Pakistan coast' },
      { type: 'LONGITUDE', start: [62, 20], end: [62, 24], name: 'India coast 62°E' },
    ],
    labelPosition: [55, 15],
    season: {
      label: 'Sep 1 - May 31',
      start: '09-01',
      end: '05-31',
    },
    description: 'Seasonal Tropical Area - Arabian Sea',
  },

  {
    id: 'STA_BAY_BENGAL',
    name: 'Seasonal Tropical - Bay of Bengal',
    type: 'SEASONAL_TROPICAL',
    color: '#FFCA28',
    segments: [
      { type: 'LATITUDE', start: [82, 8], end: [98, 8], name: 'South 8°N' },
      { type: 'LONGITUDE', start: [98, 8], end: [98, 20], name: 'East 98°E' },
      { type: 'LATITUDE', start: [98, 20], end: [82, 20], name: 'North 20°N' },
      { type: 'LONGITUDE', start: [82, 20], end: [82, 8], name: 'West 82°E' },
    ],
    labelPosition: [90, 14],
    season: {
      label: 'Dec 1 - Apr 30',
      start: '12-01',
      end: '04-30',
    },
    description: 'Seasonal Tropical Area - Bay of Bengal',
  },

  {
    id: 'STA_SIO_A',
    name: 'Seasonal Tropical - Indian Ocean A',
    type: 'SEASONAL_TROPICAL',
    color: '#FFA726',
    segments: [
      { type: 'LATITUDE', start: [50, -10], end: [51.5, -10], name: 'North 10°S' },
      { type: 'LONGITUDE', start: [51.5, -10], end: [51.5, -15], name: 'East 51.5°E' },
      { type: 'LATITUDE', start: [51.5, -15], end: [50, -15], name: 'South 15°S' },
    ],
    labelPosition: [51, -12],
    season: {
      label: 'Apr 1 - Nov 30',
      start: '04-01',
      end: '11-30',
    },
    description: 'Seasonal Tropical Area - South Indian Ocean A',
  },

  {
    id: 'STA_SIO_B',
    name: 'Seasonal Tropical - Indian Ocean B',
    type: 'SEASONAL_TROPICAL',
    color: '#FF7043',
    segments: [
      { type: 'LATITUDE', start: [51.5, -15], end: [120, -15], name: 'South 15°S' },
      { type: 'LONGITUDE', start: [120, -15], end: [120, -10], name: 'East 120°E' },
      { type: 'LATITUDE', start: [120, -10], end: [51.5, -10], name: 'North 10°S' },
    ],
    labelPosition: [85, -13],
    season: {
      label: 'May 1 - Nov 30',
      start: '05-01',
      end: '11-30',
    },
    description: 'Seasonal Tropical Area - South Indian Ocean B',
  },

  {
    id: 'STA_CHINA',
    name: 'Seasonal Tropical - China Sea',
    type: 'SEASONAL_TROPICAL',
    color: '#FF6E40',
    segments: [
      { type: 'LATITUDE', start: [110, 10], end: [130, 10], name: 'South 10°N' },
      { type: 'LONGITUDE', start: [130, 10], end: [130, 20], name: 'East 130°E' },
      { type: 'RHUMB_LINE', start: [130, 20], end: [125, 10], name: 'Luzon diagonal' },
    ],
    labelPosition: [120, 13],
    season: {
      label: 'Jan 21 - Apr 30',
      start: '01-21',
      end: '04-30',
    },
    description: 'Seasonal Tropical Area - China Sea',
  },

  {
    id: 'STA_NP_A',
    name: 'Seasonal Tropical - North Pacific A',
    type: 'SEASONAL_TROPICAL',
    color: '#F57C00',
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
    description: 'Seasonal Tropical Area - North Pacific A',
  },

  {
    id: 'STA_NP_B',
    name: 'Seasonal Tropical - North Pacific B',
    type: 'SEASONAL_TROPICAL',
    color: '#E65100',
    segments: [
      { type: 'LATITUDE', start: [-123, 33], end: [-105, 33], name: 'California 33°N' },
      { type: 'RHUMB_LINE', start: [-105, 33], end: [-105, 13], name: 'To tropical' },
      { type: 'LATITUDE', start: [-105, 13], end: [-123, 13], name: 'Tropical 13°N' },
    ],
    labelPosition: [-115, 22],
    season: {
      label: 'Mar 1-Jun 30, Nov 1-Nov 30',
      start: '03-01',
      end: '06-30',
    },
    description: 'Seasonal Tropical Area - North Pacific B',
  },

  {
    id: 'STA_SP_A',
    name: 'Seasonal Tropical - Gulf of Carpentaria',
    type: 'SEASONAL_TROPICAL',
    color: '#FFA000',
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
    description: 'Seasonal Tropical Area - Gulf of Carpentaria',
  },

  {
    id: 'STA_SP_B',
    name: 'Seasonal Tropical - South Pacific B',
    type: 'SEASONAL_TROPICAL',
    color: '#FF8F00',
    segments: [
      // Tropic of Capricorn (~23.43°S) from Australia east coast across Pacific to 150°W
      { type: 'LATITUDE', start: [154, -23.43], end: [-150, -23.43] },
      { type: 'LONGITUDE', start: [-150, -23.43], end: [-150, -20] },
      // 20°S from 150°W back westward to Australia
      { type: 'LATITUDE', start: [-150, -20], end: [154, -20] },
    ],
    labelPosition: [170, -27],
    season: {
      label: 'Apr 1 - Nov 30',
      start: '04-01',
      end: '11-30',
    },
    description: 'Seasonal Tropical Area - South Pacific B',
  },

  {
    id: 'BLACK_SEA_WINTER',
    name: 'Black Sea Winter',
    type: 'SMALL_SHIP_WINTER',
    color: '#9C27B0',
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
    description: 'Black Sea Winter Area (≤100m vessels)',
  },

  {
    id: 'MEDITERRANEAN_WINTER',
    name: 'Mediterranean Winter',
    type: 'SMALL_SHIP_WINTER',
    color: '#7B1FA2',
    segments: [
      { type: 'LATITUDE', start: [3, 40], end: [15, 40], name: 'South 40°N' },
      { type: 'LONGITUDE', start: [15, 40], end: [15, 44], name: 'East 15°E' },
      { type: 'LATITUDE', start: [15, 44], end: [3, 44], name: 'North 44°N' },
      { type: 'LONGITUDE', start: [3, 44], end: [3, 40], name: 'West 3°E' },
    ],
    labelPosition: [9, 42],
    vesselSize: '<=100m',
    season: {
      label: 'Dec 16 - Mar 15',
      start: '12-16',
      end: '03-15',
    },
    description: 'Mediterranean Winter Area (≤100m vessels)',
  },

  {
    id: 'JAPAN_WINTER',
    name: 'Sea of Japan Winter',
    type: 'SMALL_SHIP_WINTER',
    color: '#6A1B9A',
    segments: [
      { type: 'LATITUDE', start: [127, 38], end: [145, 38], name: 'South 38°N' },
      { type: 'LONGITUDE', start: [145, 38], end: [145, 50], name: 'East 145°E' },
      { type: 'LATITUDE', start: [145, 50], end: [127, 50], name: 'North 50°N' },
      { type: 'LONGITUDE', start: [127, 50], end: [127, 38], name: 'West 127°E' },
    ],
    labelPosition: [136, 44],
    vesselSize: '<=100m',
    season: {
      label: 'Dec 1 - Feb 28/29',
      start: '12-01',
      end: '02-28',
    },
    description: 'Sea of Japan Winter Area (≤100m vessels)',
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
