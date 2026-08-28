import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

import {
  getFieldFactor,
  rampColor,
  sampleWeatherField,
} from '../data/weatherField';
import { ensureLiveData, hasLiveSource, sampleLiveField } from '../data/openMeteo';

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
  hour = 0,
}: {
  factorId: string;
  /** Paint the filled colour field (set false to draw only arrows). */
  showField?: boolean;
  /** Draw direction/magnitude arrows for vector factors. */
  showArrows?: boolean;
  /** Hours ahead of now to forecast (0 = current conditions). */
  hour?: number;
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
    let particleWidth = 0;
    let particleHeight = 0;
    let particles: Array<{ x: number; y: number; age: number }> = [];
    let fieldCanvas: HTMLCanvasElement | null = null;
    let fieldKey = '';

    const resetParticle = (particle: { x: number; y: number; age: number }, w: number, h: number) => {
      particle.x = Math.random() * w;
      particle.y = Math.random() * h;
      particle.age = Math.random() * 90;
    };

    const ensureParticles = (w: number, h: number) => {
      if (particleWidth === w && particleHeight === h && particles.length > 0) return;
      particleWidth = w;
      particleHeight = h;
      particles = Array.from({ length: Math.min(1800, Math.max(700, Math.round((w * h) / 550))) }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        age: Math.random() * 90,
      }));
    };

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
      const live = sampleLiveField(lat, lon, factorId, bounds, hour);
      return live ?? sampleWeatherField(lat, lon, factorId);
    };

    const draw = () => {
      const size = map.getSize();
      const w = size.x;
      const h = size.y;
      if (w === 0 || h === 0) return;

      // Ensure live data for the current view; redraw once it arrives.
      if (hasLiveSource(factorId)) {
        const b = map.getBounds();
        ensureLiveData(
          factorId,
          { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() },
          hour,
          () => {
            fieldKey = '';
            schedule();
          },
        );
      }
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, w, h);
      ensureParticles(w, h);

      // Sample the underlying basemap so the field is painted on water only.
      // Returns a predicate; if the basemap can't be read (tainted canvas,
      // tiles not ready) it returns null and we fall back to drawing
      // everywhere rather than hiding the field entirely.
      const isWater = buildWaterTest(map, w, h);

      // --- colour field ---
      if (showField) {
        const bounds = map.getBounds();
        const nextFieldKey = `${w}:${h}:${bounds.getSouth().toFixed(3)}:${bounds.getWest().toFixed(3)}:${bounds.getNorth().toFixed(3)}:${bounds.getEast().toFixed(3)}:${factorId}:${hour}`;
        if (!fieldCanvas || fieldKey !== nextFieldKey) {
          fieldCanvas = document.createElement('canvas');
          fieldCanvas.width = Math.round(w * dpr);
          fieldCanvas.height = Math.round(h * dpr);
          const fieldCtx = fieldCanvas.getContext('2d');
          if (fieldCtx) {
            fieldCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
            fieldCtx.imageSmoothingEnabled = false;
            const cell = 4;
            for (let y = 0; y < h; y += cell) {
              for (let x = 0; x < w; x += cell) {
                if (isWater && !isWater(x + cell / 2, y + cell / 2)) continue;
                const ll = map.containerPointToLatLng([x + cell / 2, y + cell / 2]);
                const s = sample(ll.lat, ll.lng);
                const frac = s.magnitude / factor.max;
                fieldCtx.fillStyle = rampColor(factor.stops, frac, 0.72);
                fieldCtx.fillRect(x, y, cell + 1, cell + 1);
              }
            }
            fieldKey = nextFieldKey;
          }
        if (fieldCanvas) ctx.drawImage(fieldCanvas, 0, 0, w, h);
        }
      }

      // --- animated direction / magnitude particles (Windy-style) ---
      if (showArrows && factor.directional) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineCap = 'round';
        particles.forEach((particle) => {
          if (particle.x < 0 || particle.x >= w || particle.y < 0 || particle.y >= h || (isWater && !isWater(particle.x, particle.y))) {
            resetParticle(particle, w, h);
          }
          const ll = map.containerPointToLatLng([particle.x, particle.y]);
          const s = sample(ll.lat, ll.lng);
          const frac = Math.max(0, Math.min(1, s.magnitude / factor.max));
          const direction = (s.directionDeg * Math.PI) / 180;
          const speed = 0.55 + frac * 2.4;
          const nextX = particle.x + Math.sin(direction) * speed;
          const nextY = particle.y - Math.cos(direction) * speed;
          const length = 3 + frac * 9;
          const tailX = particle.x - Math.sin(direction) * length;
          const tailY = particle.y + Math.cos(direction) * length;
          ctx.strokeStyle = `rgba(245, 248, 255, ${0.42 + frac * 0.45})`;
          ctx.lineWidth = 0.8 + frac * 0.9;
          ctx.beginPath();
          ctx.moveTo(tailX, tailY);
          ctx.lineTo(nextX, nextY);
          ctx.stroke();
          particle.x = nextX;
          particle.y = nextY;
          particle.age += 1;
          if (particle.age > 120) resetParticle(particle, w, h);
        });
        ctx.globalCompositeOperation = 'source-over';
      }

      raf = window.requestAnimationFrame(draw);
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
      fieldKey = '';
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
  }, [map, factorId, showField, showArrows, hour]);

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

