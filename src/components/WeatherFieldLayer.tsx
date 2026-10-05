import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { contours } from 'd3-contour';
import * as polygonClippingNs from 'polygon-clipping';

import { bandColor, getFieldFactor, sampleWeatherField } from '../data/weatherField';
import { ensureLiveData, hasLiveSource, sampleLiveField } from '../data/openMeteo';
import { landPolygonsInBounds } from '../data/landMaskGeo';
import { isLand } from '../data/landMask';

/** [lon, lat] polygon coordinates, as used by `polygon-clipping` and our
 *  own land ring data. */
type LonLatPoint = [number, number];
type LonLatMultiPolygon = LonLatPoint[][][];

// `polygon-clipping`'s shipped .d.ts declares named exports (`difference`,
// etc.) that don't actually exist on its ESM build — the bundle only has a
// default export object with those as methods. Import as a namespace and
// cast to the real runtime shape rather than the (incorrect) declared one.
const polygonClipping = (polygonClippingNs as unknown as {
  default: { difference(subject: LonLatMultiPolygon, ...clips: LonLatMultiPolygon[]): LonLatMultiPolygon };
}).default;

/**
 * MarineTraffic-style weather field on the map: a contour-chart colour field
 * (magnitude quantised into discrete bands, exact smooth boundaries via
 * marching squares — see `d3-contour`) plus, for vector factors, a grid of
 * direction glyphs — proper wind barbs for wind/gusts, small tinted arrows
 * for waves/swell/currents, so each factor reads as its own distinct colour
 * + pattern when several are layered together. Drop it as a child of any
 * `<MapContainer>`:
 *
 *   <MapContainer ...>
 *     <WeatherFieldLayer factorId="wind" />
 *   </MapContainer>
 *
 * Performance: the contour polygons are a real Leaflet vector layer, so
 * Leaflet pans/zooms it the same (cheap, GPU-composited) way it does tile
 * layers — content is only recomputed on `moveend`/`zoomend`, not on every
 * intermediate drag frame, which is what makes this feel smooth. The
 * direction-glyph canvas follows the same schedule. `hour` is read from a
 * ref (not a redraw-everything effect dependency) so forecast
 * playback/scrubbing can update many times a second without re-creating the
 * map pane/layers.
 */
export function WeatherFieldLayer({
  factorId,
  showField = true,
  showArrows = true,
  hour = 0,
}: {
  factorId: string;
  /** Paint the filled colour field (set false to draw only arrows). */
  showField?: boolean;
  /** Draw direction/magnitude arrows for vector factors. */
  showArrows?: boolean;
  /** Hours ahead of now to forecast (0 = current conditions); may be
   *  fractional while scrubbing/playing a simulation. */
  hour?: number;
}) {
  const map = useMap();
  // `hour` can change many times a second during simulation playback. Kept in
  // a ref + cheap redraw (below) instead of the main effect's deps so the
  // panes/layers aren't torn down and recreated on every tick.
  const hourRef = useRef(hour);
  const scheduleRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    hourRef.current = hour;
    scheduleRef.current?.();
  }, [hour]);

  useEffect(() => {
    const factor = getFieldFactor(factorId);
    if (!factor) return;

    // Glyphs (wind barbs / vector arrows) render into a dedicated canvas
    // pane above the tiles but below route/marker overlays (zIndex 400).
    const GLYPH_PANE = 'fvWeatherFieldPane';
    if (!map.getPane(GLYPH_PANE)) map.createPane(GLYPH_PANE);
    const glyphPane = map.getPane(GLYPH_PANE);
    if (!glyphPane) return;
    glyphPane.style.zIndex = '350';
    glyphPane.style.pointerEvents = 'none';

    // The colour-band contours render as real Leaflet vector paths, in their
    // own pane just below the glyphs.
    const CONTOUR_PANE = 'fvWeatherContourPane';
    if (!map.getPane(CONTOUR_PANE)) map.createPane(CONTOUR_PANE);
    const contourPane = map.getPane(CONTOUR_PANE);
    if (!contourPane) return;
    contourPane.style.zIndex = '345';
    contourPane.style.pointerEvents = 'none';
    const contourRenderer = L.canvas({ pane: CONTOUR_PANE, padding: 0.2 });
    let contourLayer: L.LayerGroup | null = null;

    const glyphCanvas = document.createElement('canvas');
    glyphCanvas.className = 'fv-wf-canvas';
    glyphPane.appendChild(glyphCanvas);
    const glyphCtx = glyphCanvas.getContext('2d');

    let raf = 0;
    // Cache land polygons per viewport — they don't change between redraws
    // triggered purely by `hour` ticking (sim playback), only when the map
    // actually pans/zooms, so recomputing them every tick would be wasted work.
    let landCacheKey = '';
    let landCache: LonLatMultiPolygon = [];

    // Pull live values from Open-Meteo when available, otherwise fall back
    // to the deterministic synthetic field (e.g. while a grid is loading).
    const sample = (lat: number, lon: number) => {
      const b = map.getBounds();
      const bounds = {
        south: b.getSouth(),
        west: b.getWest(),
        north: b.getNorth(),
        east: b.getEast(),
      };
      const live = sampleLiveField(lat, lon, factorId, bounds, hourRef.current);
      return live ?? sampleWeatherField(lat, lon, factorId, hourRef.current);
    };

    const draw = () => {
      const size = map.getSize();
      const w = size.x;
      const h = size.y;
      if (w === 0 || h === 0) return;
      const hour = hourRef.current;

      // Ensure live data for the current view; redraw once it arrives.
      if (hasLiveSource(factorId)) {
        const b = map.getBounds();
        ensureLiveData(
          factorId,
          { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() },
          hour,
          schedule,
        );
      }

      // --- colour field: a real smooth isoband contour (marching squares
      // via d3-contour) at each band threshold, each drawn over the last so
      // the visible remainder of the lower band is its own flat colour,
      // exactly like a significant-wave-height chart — with genuinely
      // smooth, curved boundaries instead of a pixel staircase, clipped to
      // water only against the real (vector, not grid-sampled) coastline so
      // land stays clearly visible and uncoloured. ---
      if (showField) {
        const bounds = map.getBounds();
        const north = bounds.getNorth();
        const south = bounds.getSouth();
        const west = bounds.getWest();
        const east = bounds.getEast();
        const cols = Math.max(50, Math.min(170, Math.round(w / 7)));
        const rows = Math.max(34, Math.min(110, Math.round(h / 7)));

        const gridToLonLat = (gx: number, gy: number): [number, number] => {
          const fx = gx / (cols - 1);
          const fy = gy / (rows - 1);
          return [west + (east - west) * fx, north + (south - north) * fy];
        };

        const values: number[] = new Array(cols * rows);
        for (let gy = 0; gy < rows; gy += 1) {
          for (let gx = 0; gx < cols; gx += 1) {
            const [lon, lat] = gridToLonLat(gx, gy);
            values[gy * cols + gx] = sample(lat, lon).magnitude;
          }
        }

        const thresholds = factor.stops.map(([frac]) => frac * factor.max);
        const bands = contours().size([cols, rows]).thresholds(thresholds)(values);

        // Pre-clipped (to the viewport) land rings — exact Natural Earth
        // coastline geometry, not an approximation of the weather grid.
        // Cached per viewport since it's identical across hour-only redraws.
        const landKey = `${west.toFixed(2)},${south.toFixed(2)},${east.toFixed(2)},${north.toFixed(2)}`;
        if (landKey !== landCacheKey) {
          landCache = landPolygonsInBounds({ west, south, east, north }) as unknown as LonLatMultiPolygon;
          landCacheKey = landKey;
        }
        const land = landCache;

        const polygons = bands
          .map((band, i) => {
            if (band.coordinates.length === 0) return null;
            const lonLat: LonLatMultiPolygon = band.coordinates.map((polygon) =>
              polygon.map((ring) => ring.map(([gx, gy]): LonLatPoint => gridToLonLat(gx, gy))),
            );
            // The land data's rings are plain number[][], structurally the
            // same shape as LonLatMultiPolygon at runtime, just not typed as
            // strict 2-tuples — cast at this narrow boundary. Always clip
            // (even mid-animation) so weather never flashes over land while
            // the forecast hour is scrubbing/playing. Guarded: a pathological
            // input (e.g. near-world bounds) can make the boolean op throw —
            // skip that band rather than letting one bad band blank the rest.
            let water: LonLatMultiPolygon;
            try {
              water = land.length
                ? polygonClipping.difference(lonLat, land as unknown as LonLatMultiPolygon)
                : lonLat;
            } catch {
              return null;
            }
            if (water.length === 0) return null;
            const latlngs = water.map((polygon) =>
              polygon.map((ring) => ring.map(([lon, lat]) => L.latLng(lat, lon))),
            );
            return L.polygon(latlngs, {
              renderer: contourRenderer,
              pane: CONTOUR_PANE,
              stroke: true,
              color: 'rgba(255, 255, 255, 0.6)',
              weight: 1,
              fill: true,
              fillColor: bandColor(factor.stops, i),
              fillOpacity: 0.78,
              interactive: false,
            });
          })
          .filter((p): p is L.Polygon => p != null);

        contourLayer?.remove();
        contourLayer = polygons.length ? L.layerGroup(polygons).addTo(map) : null;
      } else {
        contourLayer?.remove();
        contourLayer = null;
      }

      // --- direction glyphs on a fixed grid: real wind barbs for wind/gusts,
      // tinted arrows for the other vector factors (waves, swell, currents)
      // so each factor keeps its own recognisable colour + pattern. ---
      if (glyphCtx) {
        const dpr = window.devicePixelRatio || 1;
        glyphCanvas.width = Math.round(w * dpr);
        glyphCanvas.height = Math.round(h * dpr);
        glyphCanvas.style.width = `${w}px`;
        glyphCanvas.style.height = `${h}px`;
        glyphCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        glyphCtx.clearRect(0, 0, w, h);

        if (showArrows && factor.directional) {
          const color = factor.glyphColor ?? '#1a2233';
          const spacing = 46;
          const offsetX = (w % spacing) / 2;
          const offsetY = (h % spacing) / 2;
          for (let y = offsetY; y < h; y += spacing) {
            for (let x = offsetX; x < w; x += spacing) {
              const ll = map.containerPointToLatLng([x, y]);
              if (isLand(ll.lat, ll.lng)) continue;
              const s = sample(ll.lat, ll.lng);
              const frac = Math.max(0, Math.min(1, s.magnitude / factor.max));
              glyphCtx.save();
              glyphCtx.globalAlpha = 0.55 + frac * 0.45;
              if (factor.id === 'wind' || factor.id === 'gusts') {
                drawWindBarb(glyphCtx, x, y, s.magnitude, s.directionDeg, color);
              } else {
                drawVectorArrow(glyphCtx, x, y, s.directionDeg, color, frac);
              }
              glyphCtx.restore();
            }
          }
        }
      }
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };
    scheduleRef.current = schedule;

    // Pin the glyph canvas to the current viewport (the pane is translated
    // as the map pans, so position the canvas at the viewport's top-left in
    // layer coordinates) and redraw. Bound only to the *end* of pan/zoom
    // gestures (not the continuous 'move'/'zoom' events) — Leaflet already
    // translates the whole pane via CSS transform during the gesture itself
    // (the same trick tile layers use), so dragging stays native-smooth and
    // we only pay the recompute cost once, when the gesture settles.
    const reset = () => {
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(glyphCanvas, topLeft);
      schedule();
    };

    reset();
    // Redraw once the map is ready and after layout settles, so the field
    // appears immediately instead of only after the first pan/zoom.
    map.whenReady(reset);
    const t1 = window.setTimeout(reset, 120);
    const t2 = window.setTimeout(reset, 400);
    map.on('moveend zoomend resize viewreset load', reset);

    return () => {
      map.off('moveend zoomend resize viewreset load', reset);
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      scheduleRef.current = null;
      contourLayer?.remove();
      glyphCanvas.remove();
    };
  }, [map, factorId, showField, showArrows]);

  return null;
}


/** Standard meteorological wind barb: shaft + pennants (50kt) / full ticks
 *  (10kt) / half ticks (5kt), rounded to the nearest 5 knots. */
function drawWindBarb(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  speedKt: number,
  dirDeg: number,
  color: string,
): void {
  const rad = (dirDeg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const perpX = dy;
  const perpY = -dx;
  const shaftLen = 15;
  const tipX = cx + dx * shaftLen;
  const tipY = cy + dy * shaftLen;

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.25;
  ctx.lineCap = 'round';

  if (speedKt < 2.5) {
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  let remaining = Math.round(speedKt / 5) * 5;
  const tickGap = 3.2;
  const tickLen = 6.5;
  let step = 0;
  const tickBase = (n: number) => ({ x: tipX - dx * n * tickGap, y: tipY - dy * n * tickGap });

  while (remaining >= 50) {
    const base = tickBase(step);
    const base2 = tickBase(step + 1.1);
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(base.x + perpX * tickLen, base.y + perpY * tickLen);
    ctx.lineTo(base2.x, base2.y);
    ctx.closePath();
    ctx.fill();
    remaining -= 50;
    step += 1.1;
  }
  while (remaining >= 10) {
    const base = tickBase(step);
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(base.x + perpX * tickLen, base.y + perpY * tickLen);
    ctx.stroke();
    remaining -= 10;
    step += 1;
  }
  if (remaining >= 5) {
    const base = tickBase(step);
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(base.x + perpX * tickLen * 0.55, base.y + perpY * tickLen * 0.55);
    ctx.stroke();
  }
}

/** Small filled-head arrow used for non-wind vector factors (waves, swell,
 *  currents), length/opacity following the sampled magnitude. */
function drawVectorArrow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  dirDeg: number,
  color: string,
  frac: number,
): void {
  const rad = (dirDeg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const len = 7 + frac * 10;
  const tipX = cx + dx * len;
  const tipY = cy + dy * len;
  const tailX = cx - dx * len * 0.4;
  const tailY = cy - dy * len * 0.4;

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  const headLen = 4 + frac * 2.5;
  const headAngle = Math.PI / 7;
  const leftX = tipX - Math.sin(rad - headAngle) * headLen;
  const leftY = tipY + Math.cos(rad - headAngle) * headLen;
  const rightX = tipX - Math.sin(rad + headAngle) * headLen;
  const rightY = tipY + Math.cos(rad + headAngle) * headLen;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(leftX, leftY);
  ctx.lineTo(rightX, rightY);
  ctx.closePath();
  ctx.fill();
}

