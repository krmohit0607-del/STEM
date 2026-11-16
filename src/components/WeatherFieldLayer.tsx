import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { contours } from 'd3-contour';
import * as polygonClippingNs from 'polygon-clipping';

import { getFieldFactor, sampleWeatherField, smoothColorRgb } from '../data/weatherField';
import { ensureLiveData, hasLiveSource, sampleLiveField } from '../data/openMeteo';
import { landPolygonsInBounds } from '../data/landMaskGeo';
import { isLand } from '../data/landMask';
import { chaikinSmoothRing } from '../data/ringSmoothing';

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

/** Number of colour bands the contour is split into — far more than the
 *  factor's own legend stops (5-7) so adjacent bands are close in colour and
 *  read as a smooth, merging gradient instead of a handful of visibly
 *  distinct stripes, while still being real vector polygons (crisp at any
 *  zoom/DPR, no raster upscaling blur or blockiness). Kept modest (not 20+)
 *  since each extra band is another marching-squares pass plus a land-clip
 *  boolean op — this is the dominant cost of a redraw. */
const GRADIENT_BANDS = 12;

/** Fixed screen-space spacing (px) between direction arrows. */
const ARROW_SPACING = 30;

/** Minimum time (ms) between colour-field/isobar recomputes — the expensive
 *  part of a redraw (marching squares + land-clip boolean ops). Direction
 *  arrows are NOT gated by this (they're cheap and sampled independently),
 *  so they keep tracking the forecast hour responsively even while this is
 *  throttled, e.g. during fast simulation playback or timeline scrubbing. */
const HEAVY_REDRAW_MIN_INTERVAL_MS = 200;

/**
 * Weather field on the map: a smooth colour gradient built from many
 * closely-spaced vector isoband contours (marching squares via `d3-contour`,
 * clipped to the exact coastline via `polygon-clipping`) plus, for
 * directional factors (wind, gusts, currents, waves, swell), a fixed grid of
 * simple direction arrows. Drop it as a child of any `<MapContainer>`:
 *
 *   <MapContainer ...>
 *     <WeatherFieldLayer factorId="wind" />
 *   </MapContainer>
 *
 * Performance: both the colour field and the arrow grid only recompute on
 * `moveend`/`zoomend`/an `hour` change, same as a tile layer — no continuous
 * animation loop, so panning/zooming stays smooth regardless of how many
 * factors are active at once.
 */
export function WeatherFieldLayer({
  factorId,
  showField = true,
  showArrows = true,
  hour = 0,
  sampleOverride,
}: {
  factorId: string;
  /** Paint the filled colour field / isobar lines. */
  showField?: boolean;
  /** Draw the direction-arrow grid for directional factors. */
  showArrows?: boolean;
  /** Hours ahead of now to forecast (0 = current conditions); may be
   *  fractional while scrubbing/playing a simulation. */
  hour?: number;
  /** When provided, used instead of the live/synthetic fallback chain —
   *  e.g. a frozen weather-grid snapshot, so a locked "route comparison"
   *  link can replay the exact conditions it was created under instead of
   *  today's live weather. Returns `null` for "no data at this point". */
  sampleOverride?: (lat: number, lon: number) => { magnitude: number; directionDeg: number } | null;
}) {
  const map = useMap();
  // `hour` can change many times a second during simulation playback. Kept in
  // a ref + cheap redraw (below) instead of the main effect's deps so the
  // panes/layers aren't torn down and recreated on every tick.
  const hourRef = useRef(hour);
  const scheduleRef = useRef<(() => void) | null>(null);
  // Same treatment for `sampleOverride` — callers (e.g. a locked snapshot
  // page) shouldn't need to memoize it perfectly just to avoid tearing down
  // the whole layer on every render.
  const sampleOverrideRef = useRef(sampleOverride);

  useEffect(() => {
    hourRef.current = hour;
    scheduleRef.current?.();
  }, [hour]);

  useEffect(() => {
    sampleOverrideRef.current = sampleOverride;
    scheduleRef.current?.();
  }, [sampleOverride]);

  useEffect(() => {
    const factor = getFieldFactor(factorId);
    if (!factor) return;
    const f = factor; // non-undefined alias, so nested closures below keep the narrowed type
    // `ensureLiveData`'s fetch callback (`schedule`, passed in as `onReady`)
    // is stored by the data layer and can fire long after this effect has
    // unmounted (e.g. a slow network request that resolves after the user
    // toggled the factor off) — without this guard that stale callback would
    // re-run `draw()` and re-add map layers that nothing will ever clean up
    // again, since the real cleanup below has already run.
    let alive = true;

    // Direction arrows render into their own canvas, above the colour contours.
    const GLYPH_PANE = 'fvWeatherFieldPane';
    if (!map.getPane(GLYPH_PANE)) map.createPane(GLYPH_PANE);
    const glyphPane = map.getPane(GLYPH_PANE);
    if (!glyphPane) return;
    glyphPane.style.zIndex = '350';
    glyphPane.style.pointerEvents = 'none';

    // The colour-band contours render as real Leaflet vector paths, in their
    // own pane just below the arrows.
    const CONTOUR_PANE = 'fvWeatherContourPane';
    if (!map.getPane(CONTOUR_PANE)) map.createPane(CONTOUR_PANE);
    const contourPane = map.getPane(CONTOUR_PANE);
    if (!contourPane) return;
    contourPane.style.zIndex = '345';
    contourPane.style.pointerEvents = 'none';
    const contourRenderer = L.canvas({ pane: CONTOUR_PANE, padding: 0.2 });
    let contourLayer: L.LayerGroup | null = null;
    // Pressure value labels along each isobar line — only used in isobar mode.
    let labelLayer: L.LayerGroup | null = null;

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
    // When the heavy colour-field/isobar recompute last actually ran —
    // drives the `HEAVY_REDRAW_MIN_INTERVAL_MS` throttle below.
    let lastHeavyAt = 0;
    // When a redraw arrives while the throttle window is still open, its
    // heavy recompute is skipped outright (see below) with nothing else
    // queued to pick it up — if that was the redraw carrying a live grid
    // that had *just* finished loading (a common case: panning/zooming
    // fires `moveend`, and the resulting fetch often resolves within the
    // same ~200ms window), the field is left showing whatever the last
    // *successful* heavy recompute drew — stale, or even blank if that was
    // before any data existed — until some unrelated later event happens to
    // land outside the window. This timer guarantees one is always scheduled
    // to actually run once the window reopens, instead of silently dropping
    // the update. Tracked outside React state since it's pure scheduling
    // bookkeeping for the render loop below, not anything the component
    // needs to re-render for.
    let catchUpTimer = 0;

    // Pull live values from Open-Meteo when available, otherwise fall back
    // to the deterministic synthetic field (e.g. while a grid is loading) —
    // unless a frozen snapshot override is supplied, in which case that's
    // used exclusively (no live network calls at all).
    const sample = (lat: number, lon: number) => {
      if (sampleOverrideRef.current) {
        return (
          sampleOverrideRef.current(lat, lon) ?? { magnitude: 0, directionDeg: 0 }
        );
      }
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

    // At low zoom, a single arrow's spacing covers a large geographic
    // distance — sampling direction at just that one point can land on
    // genuinely different small-scale turbulence between neighbours, which
    // reads as noisy/incoherent ("arrows pointing every which way") instead
    // of the broad, smoothly-turning pattern a real wind chart shows at that
    // scale. Average several nearby samples (circular mean for direction) to
    // recover that coherence; the averaging radius grows as zoom decreases
    // and disappears entirely at high zoom, where single-point sampling
    // already looks fine and stays fully responsive to local detail.
    const sampleForArrow = (lat: number, lon: number, zoom: number) => {
      const spreadDeg = Math.max(0, (9 - zoom) * 0.7);
      if (spreadDeg <= 0) return sample(lat, lon);
      const offsets: Array<[number, number]> = [
        [0, 0],
        [spreadDeg, 0],
        [-spreadDeg, 0],
        [0, spreadDeg],
        [0, -spreadDeg],
      ];
      let sx = 0;
      let sy = 0;
      let magSum = 0;
      for (const [dlat, dlon] of offsets) {
        const s = sample(lat + dlat, lon + dlon);
        const rad = (s.directionDeg * Math.PI) / 180;
        sx += Math.sin(rad);
        sy += Math.cos(rad);
        magSum += s.magnitude;
      }
      const directionDeg = ((Math.atan2(sx, sy) * 180) / Math.PI + 360) % 360;
      return { magnitude: magSum / offsets.length, directionDeg };
    };

    const draw = () => {
      if (!alive) return;
      const size = map.getSize();
      const w = size.x;
      const h = size.y;
      if (w === 0 || h === 0) return;
      const hour = hourRef.current;

      // Ensure live data for the current view; redraw once it arrives. Not
      // needed when a frozen override supplies the data — skip the network
      // entirely in that case.
      if (!sampleOverrideRef.current && hasLiveSource(factorId)) {
        const b = map.getBounds();
        ensureLiveData(
          factorId,
          { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() },
          hour,
          schedule,
        );
      }

      // The colour field/isobar recompute (marching squares + land-clip
      // boolean ops) is the expensive part of a redraw — throttle it to a
      // fixed rate so fast simulation playback or timeline scrubbing can't
      // hammer the main thread, instead of recomputing on every single tick.
      // The direction arrows below are NOT gated by this — they're cheap and
      // sampled independently, so they stay responsive to `hour` regardless.
      const now = performance.now();
      if (now - lastHeavyAt >= HEAVY_REDRAW_MIN_INTERVAL_MS || lastHeavyAt === 0) {
        lastHeavyAt = now;

      const bounds = map.getBounds();
      const north = bounds.getNorth();
      const south = bounds.getSouth();
      const west = bounds.getWest();
      const east = bounds.getEast();
      // Finer marching-squares grid than a raster approach would need —
      // real vector polygons, so resolution controls curve smoothness, not
      // final on-screen sharpness (that stays crisp at any zoom/DPR).
      const cols = Math.max(70, Math.min(220, Math.round(w / 5)));
      const rows = Math.max(48, Math.min(150, Math.round(h / 5)));

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

      // Pre-clipped (to the viewport) land rings — exact Natural Earth
      // coastline geometry, not an approximation of the weather grid.
      // Cached per viewport since it's identical across hour-only redraws.
      // `bounds` can read past +-180 deg (e.g. west=180, east=220) once the
      // user pans into an adjacent world copy via `worldCopyJump` — land
      // polygons are stored in canonical +-180 coordinates, so querying
      // with the raw, shifted bounds would always come back empty (no
      // land-clip in that pan position). Query in the canonical copy
      // nearest this viewport, then shift the result back.
      const landKey = `${west.toFixed(2)},${south.toFixed(2)},${east.toFixed(2)},${north.toFixed(2)}`;
      if (landKey !== landCacheKey) {
        // A viewport that simply straddles the real antimeridian (e.g.
        // west=170, east=190) needs land from BOTH canonical copies — the
        // part already inside +-180 (west corner's copy) and the part
        // that only exists as negative longitudes on the other side of
        // 180 (east corner's copy). A single centroid-rounded shift only
        // ever queries one of the two, silently dropping land (and so the
        // colour field bleeding over/under it) on whichever side lost.
        const shifts = Array.from(
          new Set([Math.round(west / 360) * 360, Math.round(east / 360) * 360]),
        );
        landCache = shifts.flatMap((shift) => {
          const canonical = landPolygonsInBounds({
            west: west - shift,
            east: east - shift,
            south,
            north,
          }) as unknown as LonLatMultiPolygon;
          return shift === 0
            ? canonical
            : canonical.map((polygon) => polygon.map((ring) => ring.map(([lon, lat]) => [lon + shift, lat] as LonLatPoint)));
        });
        landCacheKey = landKey;
      }

      if (showField && f.isobar) {
        // Traditional synoptic isobar lines: thin stroked curves at a fixed
        // physical pressure interval (not a filled gradient), each labelled
        // with its hPa value — drawn over land as well as sea, same as a
        // real weather chart (pressure isn't a marine-only quantity).
        const ISOBAR_INTERVAL_HPA = 4;
        let minV = Infinity;
        let maxV = -Infinity;
        for (const val of values) {
          if (val < minV) minV = val;
          if (val > maxV) maxV = val;
        }
        const lines: L.Polygon[] = [];
        const labels: L.Marker[] = [];
        if (Number.isFinite(minV) && Number.isFinite(maxV)) {
          const start = Math.ceil(minV / ISOBAR_INTERVAL_HPA) * ISOBAR_INTERVAL_HPA;
          const thresholds: number[] = [];
          for (let t = start; t <= maxV; t += ISOBAR_INTERVAL_HPA) thresholds.push(t);
          const bands = thresholds.length
            ? contours().size([cols, rows]).thresholds(thresholds)(values)
            : [];
          for (const band of bands) {
            if (band.coordinates.length === 0) continue;
            const lonLat: LonLatMultiPolygon = band.coordinates.map((polygon) =>
              polygon.map(
                (ring) =>
                  chaikinSmoothRing(ring.map(([gx, gy]): LonLatPoint => gridToLonLat(gx, gy))) as LonLatPoint[],
              ),
            );
            const latlngs = lonLat.map((polygon) =>
              polygon.map((ring) => ring.map(([lon, lat]) => L.latLng(lat, lon))),
            );
            // Dark halo first, bright white line on top — stays clearly
            // visible whether it's crossing light land tiles, dark ocean,
            // or (if a colour field is layered underneath for another
            // factor) any background hue, unlike a single mid-tone stroke.
            lines.push(
              L.polygon(latlngs, {
                renderer: contourRenderer,
                pane: CONTOUR_PANE,
                stroke: true,
                color: 'rgba(6,10,20,0.55)',
                weight: 2.75,
                fill: false,
                interactive: false,
              }),
            );
            lines.push(
              L.polygon(latlngs, {
                renderer: contourRenderer,
                pane: CONTOUR_PANE,
                stroke: true,
                color: '#ffffff',
                weight: 1.25,
                opacity: 0.95,
                fill: false,
                interactive: false,
              }),
            );
            // One value label per separate ring (a band can have several
            // disjoint closed loops — e.g. a high and a low in view at once).
            for (const ring of lonLat) {
              const pt = ring[0]?.[Math.floor(ring[0].length / 2)];
              if (!pt) continue;
              const [lon, lat] = pt;
              labels.push(
                L.marker(L.latLng(lat, lon), {
                  pane: CONTOUR_PANE,
                  interactive: false,
                  icon: L.divIcon({
                    className: 'fv-wf-isobar-label',
                    html: String(Math.round(band.value)),
                    iconSize: [28, 14],
                  }),
                }),
              );
            }
          }
        }
        contourLayer?.remove();
        contourLayer = lines.length ? L.layerGroup(lines).addTo(map) : null;
        labelLayer?.remove();
        labelLayer = labels.length ? L.layerGroup(labels).addTo(map) : null;
      } else if (showField) {
        labelLayer?.remove();
        labelLayer = null;
        const land = landCache;
        // Many closely-spaced thresholds (not just the factor's 5-7 legend
        // stops) so each band's colour is barely different from its
        // neighbour — reads as a smooth continuous gradient, while every
        // boundary is still an exact, crisp vector curve.
        const thresholds = Array.from({ length: GRADIENT_BANDS }, (_, i) => (i / (GRADIENT_BANDS - 1)) * f.max);
        const bands = contours().size([cols, rows]).thresholds(thresholds)(values);

        const polygons = bands
          .map((band, i) => {
            if (band.coordinates.length === 0) return null;
            // Chaikin-smooth each isoline ring *before* clipping to land —
            // rounds the raw marching-squares "staircase" into a smooth,
            // organic curve in open water, and keeps the boundary easing
            // gradually between forecast hours instead of visibly
            // stair-stepping, while the subsequent land clip still cuts an
            // exact, un-softened edge against the real coastline — so
            // smoothing can never push colour onto land.
            const lonLat: LonLatMultiPolygon = band.coordinates.map((polygon) =>
              polygon.map(
                (ring) =>
                  chaikinSmoothRing(ring.map(([gx, gy]): LonLatPoint => gridToLonLat(gx, gy))) as LonLatPoint[],
              ),
            );
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
            const { r, g, b } = smoothColorRgb(f.stops, i / (GRADIENT_BANDS - 1));
            return L.polygon(latlngs, {
              renderer: contourRenderer,
              pane: CONTOUR_PANE,
              // No stroke — with this many closely-spaced bands, a visible
              // border between each one would read as banding/stripes
              // instead of the smooth merged gradient we're going for.
              stroke: false,
              fill: true,
              fillColor: `rgb(${r},${g},${b})`,
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
        labelLayer?.remove();
        labelLayer = null;
      }
      } // end throttled heavy recompute
      else if (!catchUpTimer) {
        // Skipped this tick because the throttle window is still open —
        // make sure whatever triggered this redraw (a just-arrived live
        // grid, a pan/zoom, etc.) still gets painted once that window
        // closes, instead of being silently lost.
        const wait = Math.max(0, HEAVY_REDRAW_MIN_INTERVAL_MS - (now - lastHeavyAt)) + 10;
        catchUpTimer = window.setTimeout(() => {
          catchUpTimer = 0;
          schedule();
        }, wait);
      }

      // --- direction arrows on a fixed screen-space grid ---
      if (glyphCtx) {
        const dpr = window.devicePixelRatio || 1;
        glyphCanvas.width = Math.round(w * dpr);
        glyphCanvas.height = Math.round(h * dpr);
        glyphCanvas.style.width = `${w}px`;
        glyphCanvas.style.height = `${h}px`;
        glyphCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        glyphCtx.clearRect(0, 0, w, h);

        if (showArrows && f.directional) {
          const zoom = map.getZoom();
          const offsetX = (w % ARROW_SPACING) / 2;
          const offsetY = (h % ARROW_SPACING) / 2;
          for (let y = offsetY; y < h; y += ARROW_SPACING) {
            for (let x = offsetX; x < w; x += ARROW_SPACING) {
              const ll = map.containerPointToLatLng([x, y]);
              if (isLand(ll.lat, ll.lng)) continue;
              const s = sampleForArrow(ll.lat, ll.lng, zoom);
              const frac = Math.max(0, Math.min(1, s.magnitude / f.max));
              drawArrow(glyphCtx, x, y, s.directionDeg, frac);
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
      alive = false;
      map.off('moveend zoomend resize viewreset load', reset);
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(catchUpTimer);
      scheduleRef.current = null;
      contourLayer?.remove();
      labelLayer?.remove();
      glyphCanvas.remove();
    };
  }, [map, factorId, showField, showArrows]);

  return null;
}

/** Simple direction arrow — dark halo under a bright white fill/stroke so it
 *  stays visible over any background colour, land tile, or ocean tint.
 *  `frac` (0..1 of the factor's max) controls arrow length only. */
function drawArrow(ctx: CanvasRenderingContext2D, cx: number, cy: number, dirDeg: number, frac: number): void {
  const rad = (dirDeg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const len = 5 + frac * 7;
  const tipX = cx + dx * len;
  const tipY = cy + dy * len;
  const tailX = cx - dx * len * 0.35;
  const tailY = cy - dy * len * 0.35;
  const headLen = 2.75 + frac * 1.75;
  const headAngle = Math.PI / 7;
  const leftX = tipX - Math.sin(rad - headAngle) * headLen;
  const leftY = tipY + Math.cos(rad - headAngle) * headLen;
  const rightX = tipX - Math.sin(rad + headAngle) * headLen;
  const rightY = tipY + Math.cos(rad + headAngle) * headLen;

  const paint = (color: string, lineWidth: number) => {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fill();
  };

  paint('rgba(6,10,20,0.55)', 2);
  paint('#ffffff', 1);
}


