import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

import {
  getFieldFactor,
  rampColor,
  sampleWeatherField,
} from '../data/weatherField';

/**
 * MarineTraffic-style weather field, drawn on a canvas over the map.
 *
 * Paints a smooth colour field for the selected factor (magnitude → colour
 * ramp) and, for vector factors (wind, waves, currents …), a grid of
 * arrows showing direction and magnitude. Drop it as a child of any
 * `<MapContainer>`:
 *
 *   <MapContainer ...>
 *     <WeatherFieldLayer factorId="wind" />
 *   </MapContainer>
 *
 * The canvas tracks the map by recomputing each pixel's coordinate every
 * frame, so it pans and zooms with the base map.
 */
export function WeatherFieldLayer({
  factorId,
  showField = true,
  showArrows = true,
}: {
  factorId: string;
  /** Paint the filled colour field (set false to draw only arrows). */
  showField?: boolean;
  /** Draw direction/magnitude arrows for vector factors. */
  showArrows?: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    const factor = getFieldFactor(factorId);
    if (!factor) return;

    // Render into a dedicated pane that sits above the tiles but below the
    // route/marker overlays — appending to the map container instead would
    // be hidden behind Leaflet's map pane (z-index 400).
    const PANE = 'fvWeatherFieldPane';
    if (!map.getPane(PANE)) {
      map.createPane(PANE);
    }
    const pane = map.getPane(PANE);
    if (!pane) return;
    pane.style.zIndex = '350';
    pane.style.pointerEvents = 'none';

    const canvas = document.createElement('canvas');
    canvas.className = 'fv-wf-canvas';
    pane.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      canvas.remove();
      return;
    }

    let raf = 0;

    const draw = () => {
      const size = map.getSize();
      const w = size.x;
      const h = size.y;
      if (w === 0 || h === 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Sample the underlying basemap so the field is painted on water only.
      // Returns a predicate; if the basemap can't be read (tainted canvas,
      // tiles not ready) it returns null and we fall back to drawing
      // everywhere rather than hiding the field entirely.
      const isWater = buildWaterTest(map, w, h);

      // --- colour field ---
      if (showField) {
        const cell = 16;
        for (let y = 0; y < h; y += cell) {
          for (let x = 0; x < w; x += cell) {
            if (isWater && !isWater(x + cell / 2, y + cell / 2)) continue;
            const ll = map.containerPointToLatLng([x + cell / 2, y + cell / 2]);
            const s = sampleWeatherField(ll.lat, ll.lng, factorId);
            const frac = s.magnitude / factor.max;
            ctx.fillStyle = rampColor(factor.stops, frac, 0.5);
            ctx.fillRect(x, y, cell + 1, cell + 1);
          }
        }
      }

      // --- direction / magnitude arrows ---
      if (showArrows && factor.directional) {
        const step = 66;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let y = step / 2; y < h; y += step) {
          for (let x = step / 2; x < w; x += step) {
            if (isWater && !isWater(x, y)) continue;
            const ll = map.containerPointToLatLng([x, y]);
            const s = sampleWeatherField(ll.lat, ll.lng, factorId);
            const frac = Math.max(0, Math.min(1, s.magnitude / factor.max));
            const len = 10 + frac * 16;
            drawArrow(ctx, x, y, s.directionDeg, len, rampColor(factor.stops, frac, 0.95));
          }
        }
      }
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };

    // Pin the canvas to the current viewport (the pane is translated as the
    // map pans, so position the canvas at the viewport's top-left in layer
    // coordinates) and redraw.
    const reset = () => {
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(canvas, topLeft);
      schedule();
    };

    reset();
    // Redraw once the map is ready and after layout settles, so the field
    // appears immediately instead of only after the first pan/zoom.
    map.whenReady(reset);
    const t1 = window.setTimeout(reset, 120);
    const t2 = window.setTimeout(reset, 400);
    map.on('move zoom moveend zoomend resize viewreset load', reset);

    return () => {
      map.off('move zoom moveend zoomend resize viewreset load', reset);
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      canvas.remove();
    };
  }, [map, factorId, showField, showArrows]);

  return null;
}

/**
 * Build a land/water test for the current viewport by sampling the basemap
 * tiles. Water renders bluish on every basemap we use (Carto, OSM, Esri
 * Ocean), so a pixel counts as water when its blue channel clearly leads.
 *
 * Returns `null` when the basemap can't be read (tiles not ready, or a
 * cross-origin-tainted canvas) so the caller draws everywhere instead of
 * hiding the field.
 */
function buildWaterTest(
  map: L.Map,
  w: number,
  h: number,
): ((x: number, y: number) => boolean) | null {
  const container = map.getContainer();
  // Only the first tile layer is the base map; later layers (seamarks,
  // weather tiles) may be transparent or not CORS-enabled.
  const tilePane = container.querySelector('.leaflet-tile-pane');
  const baseLayer = tilePane?.querySelector('.leaflet-layer');
  if (!baseLayer) return null;
  const tiles = baseLayer.querySelectorAll<HTMLImageElement>('img.leaflet-tile');
  if (tiles.length === 0) return null;

  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d', { willReadFrequently: true });
  if (!octx) return null;

  const cr = container.getBoundingClientRect();
  let drew = 0;
  tiles.forEach((img) => {
    if (!img.complete || img.naturalWidth === 0) return;
    const r = img.getBoundingClientRect();
    try {
      octx.drawImage(img, r.left - cr.left, r.top - cr.top, r.width, r.height);
      drew += 1;
    } catch {
      /* ignore a single bad tile */
    }
  });
  if (drew === 0) return null;

  let data: Uint8ClampedArray;
  try {
    data = octx.getImageData(0, 0, w, h).data;
  } catch {
    // Canvas tainted (tiles served without CORS) — can't read pixels.
    return null;
  }

  return (x: number, y: number) => {
    const ix = Math.max(0, Math.min(w - 1, x | 0));
    const iy = Math.max(0, Math.min(h - 1, y | 0));
    const o = (iy * w + ix) * 4;
    const a = data[o + 3];
    if (a === 0) return true; // no tile drawn here → treat as open sea
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    // Bluish → water; grey/cream/green land has no clear blue dominance.
    return b > r + 4 && b >= g - 2;
  };
}

/** Draw an arrow centred at (x, y) pointing toward `deg` (clockwise N). */
function drawArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  deg: number,
  len: number,
  color: string,
) {
  const rad = (deg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const half = len / 2;
  const tipX = x + dx * half;
  const tipY = y + dy * half;
  const tailX = x - dx * half;
  const tailY = y - dy * half;

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.6;

  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  // arrowhead
  const headLen = Math.min(7, len * 0.45);
  const left = rad + Math.PI - 0.5;
  const right = rad + Math.PI + 0.5;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX + Math.sin(left) * headLen, tipY - Math.cos(left) * headLen);
  ctx.lineTo(tipX + Math.sin(right) * headLen, tipY - Math.cos(right) * headLen);
  ctx.closePath();
  ctx.fill();
}
