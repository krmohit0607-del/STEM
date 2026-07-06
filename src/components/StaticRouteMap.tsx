import { useMemo } from 'react';

import landData from '../data/landPolygons.json';
import { PORTS } from '../data/weatherMargins';

/**
 * Static (image-like) route map. Renders an equirectangular SVG with the
 * world's land masses drawn once from the bundled Natural-Earth polygons,
 * plus the schematic route line and markers. No tiles, no interaction.
 */

// Project degrees to SVG "map units": x in [0,360], y in [0,180].
// (built once at module load)
const LAND_PATH = (() => {
  const parts: string[] = [];
  const feats = (landData as { features: Array<{ geometry: { type: string; coordinates: unknown } }> }).features;
  for (const f of feats) {
    const g = f.geometry;
    const polys =
      g.type === 'MultiPolygon'
        ? (g.coordinates as number[][][][])
        : [g.coordinates as number[][][]];
    for (const rings of polys) {
      for (const ring of rings) {
        if (ring.length < 8) continue;
        const step = Math.max(1, Math.floor(ring.length / 80));
        let d = '';
        for (let i = 0; i < ring.length; i += step) {
          const lon = ring[i][0];
          const lat = ring[i][1];
          d += `${d ? 'L' : 'M'}${(lon + 180).toFixed(2)} ${(90 - lat).toFixed(2)} `;
        }
        d += 'Z';
        parts.push(d);
      }
    }
  }
  return parts.join(' ');
})();

export function StaticRouteMap({ via }: { via: string[] }) {
  const model = useMemo(() => {
    const pts = via.map((k) => PORTS[k]).filter(Boolean) as [number, number][];

    // Unwrap longitudes so trans-dateline routes stay continuous.
    const unwrapped: { x: number; y: number }[] = [];
    let prevX: number | null = null;
    for (const [lat, lon] of pts) {
      let x = lon + 180;
      if (prevX !== null) {
        while (x - prevX > 180) x -= 360;
        while (x - prevX < -180) x += 360;
      }
      unwrapped.push({ x, y: 90 - lat });
      prevX = x;
    }

    const xs = unwrapped.map((p) => p.x);
    const ys = unwrapped.map((p) => p.y);
    let minX = Math.min(...xs);
    let maxX = Math.max(...xs);
    let minY = Math.min(...ys);
    let maxY = Math.max(...ys);

    const padX = Math.max((maxX - minX) * 0.22, 14);
    const padY = Math.max((maxY - minY) * 0.22, 14);
    minX -= padX;
    maxX += padX;
    minY -= padY;
    maxY += padY;

    // Enforce a minimum span so short routes aren't over-zoomed.
    const minSpanX = 50;
    if (maxX - minX < minSpanX) {
      const c = (minX + maxX) / 2;
      minX = c - minSpanX / 2;
      maxX = c + minSpanX / 2;
    }
    const minSpanY = 34;
    if (maxY - minY < minSpanY) {
      const c = (minY + maxY) / 2;
      minY = c - minSpanY / 2;
      maxY = c + minSpanY / 2;
    }
    minY = Math.max(0, minY);
    maxY = Math.min(180, maxY);

    const w = maxX - minX;
    const h = maxY - minY;
    const line = unwrapped
      .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');

    // Graticule at 30° spacing across the visible range (± one world).
    const grat: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let gx = Math.floor((minX - 360) / 30) * 30; gx <= maxX + 360; gx += 30) {
      if (gx >= minX && gx <= maxX) grat.push({ x1: gx, y1: minY, x2: gx, y2: maxY });
    }
    for (let gy = Math.floor(minY / 30) * 30; gy <= maxY; gy += 30) {
      if (gy >= minY && gy <= maxY) grat.push({ x1: minX, y1: gy, x2: maxX, y2: gy });
    }

    const r = Math.max(1.1, Math.min(w, h) * 0.02);
    const stroke = Math.max(0.5, Math.min(w, h) * 0.006);
    const font = Math.max(2.4, Math.min(w, h) * 0.032);

    return { unwrapped, minX, minY, w, h, line, grat, r, stroke, font };
  }, [via]);

  const label = (k: string) => k.replace(/([A-Z])/g, ' $1');

  return (
    <svg
      className="fv-wm__svg"
      viewBox={`${model.minX} ${model.minY} ${model.w} ${model.h}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Route map"
    >
      <rect
        className="fv-wm__ocean"
        x={model.minX}
        y={model.minY}
        width={model.w}
        height={model.h}
      />
      <g className="fv-wm__grat" strokeWidth={model.stroke}>
        {model.grat.map((l, i) => (
          <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
        ))}
      </g>
      {[-360, 0, 360].map((off) => (
        <path key={off} className="fv-wm__land" d={LAND_PATH} transform={`translate(${off} 0)`} />
      ))}
      <path
        className="fv-wm__route-line"
        d={model.line}
        fill="none"
        strokeWidth={model.stroke * 2.4}
      />
      {model.unwrapped.map((p, i) => {
        const isStart = i === 0;
        const isEnd = i === model.unwrapped.length - 1;
        const cls = isStart
          ? 'fv-wm__pt--start'
          : isEnd
            ? 'fv-wm__pt--end'
            : 'fv-wm__pt--via';
        return (
          <circle
            key={i}
            className={`fv-wm__pt ${cls}`}
            cx={p.x}
            cy={p.y}
            r={isStart || isEnd ? model.r * 1.3 : model.r}
            strokeWidth={model.stroke}
          />
        );
      })}
      {model.unwrapped.map((p, i) => {
        const isStart = i === 0;
        const isEnd = i === model.unwrapped.length - 1;
        if (!isStart && !isEnd) return null;
        return (
          <text
            key={`t-${i}`}
            className="fv-wm__pt-label"
            x={p.x}
            y={p.y - model.r * 1.8}
            fontSize={model.font}
            textAnchor="middle"
          >
            {label(via[i])}
          </text>
        );
      })}
    </svg>
  );
}
