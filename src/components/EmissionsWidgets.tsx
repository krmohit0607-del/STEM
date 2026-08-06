import { useState } from 'react';
import type { ReactNode } from 'react';

/* Reusable presentational widgets for the Emissions workspace — dark-theme,
 * dependency-free (inline SVG charts) to match the existing ODAS design. */

export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'neutral';

export function EmBadge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  return <span className={`fv-em__badge fv-em__badge--${tone}`}>{label}</span>;
}

export function EmStat({ icon, label, value, sub, tone = 'neutral', onClick }: {
  icon: string; label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; onClick?: () => void;
}) {
  return (
    <div className={`fv-em__stat fv-em__stat--${tone}${onClick ? ' fv-em__stat--click' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined}>
      <span className="fv-em__stat-icon"><i className={`fas ${icon}`} aria-hidden="true" /></span>
      <div className="fv-em__stat-body">
        <span className="fv-em__stat-label">{label}</span>
        <span className="fv-em__stat-value">{value}</span>
        {sub != null && <span className="fv-em__stat-sub">{sub}</span>}
      </div>
    </div>
  );
}

export function EmSection({ title, icon, right, defaultOpen = true, children }: {
  title: string; icon: string; right?: ReactNode; defaultOpen?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="fv-em__section">
      <header className="fv-em__section-head">
        <button type="button" className="fv-em__section-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <i className={`fas fa-chevron-${open ? 'down' : 'right'}`} aria-hidden="true" />
          <i className={`fas ${icon}`} aria-hidden="true" />
          <span>{title}</span>
        </button>
        {right && <div className="fv-em__section-right">{right}</div>}
      </header>
      {open && <div className="fv-em__section-body">{children}</div>}
    </section>
  );
}

export function EmCard({ title, icon, right, children, span }: {
  title: string; icon?: string; right?: ReactNode; children: ReactNode; span?: 2 | 3;
}) {
  return (
    <div className={`fv-em__card${span ? ` fv-em__card--span${span}` : ''}`}>
      <header className="fv-em__card-head">
        <span className="fv-em__card-title">{icon && <i className={`fas ${icon}`} aria-hidden="true" />} {title}</span>
        {right && <span className="fv-em__card-right">{right}</span>}
      </header>
      <div className="fv-em__card-body">{children}</div>
    </div>
  );
}

/** Expandable calculation-details panel (formula + intermediate values). */
export function EmCalc({ formula, rows }: { formula?: string; rows: { label: string; value: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fv-em__calc">
      <button type="button" className="fv-em__calc-btn" onClick={() => setOpen((v) => !v)}>
        <i className={`fas fa-chevron-${open ? 'down' : 'right'}`} aria-hidden="true" /> Calculation Details
      </button>
      {open && (
        <div className="fv-em__calc-body">
          {formula && <div className="fv-em__calc-formula">{formula}</div>}
          <table className="fv-em__calc-tbl">
            <tbody>{rows.map((r) => <tr key={r.label}><td>{r.label}</td><td className="fv-em__r">{r.value}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- SVG charts */

const fmtTip = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 });

export function EmLine({ data, color = '#3fb950', height = 120, labels }: { data: number[]; color?: string; height?: number; labels?: string[] }) {
  const w = 460;
  const h = height;
  const pad = 8;
  const max = Math.max(1, ...data);
  const min = Math.min(0, ...data);
  const rng = max - min || 1;
  const step = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;
  const pts = data.map((v, i) => [pad + i * step, h - pad - ((v - min) / rng) * (h - pad * 2)] as const);
  const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${pad},${h - pad} ${line} ${(pad + (data.length - 1) * step).toFixed(1)},${h - pad}`;
  return (
    <svg className="fv-em__chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img">
      <polygon points={area} fill={color} opacity="0.12" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="2" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r="2.5" fill={color} />
          <title>{`${labels?.[i] ?? i + 1}: ${fmtTip(data[i])}`}</title>
        </g>
      ))}
    </svg>
  );
}

export function EmBars({ data, height = 120 }: { data: { label: string; value: number; color?: string }[]; height?: number }) {
  const w = 460;
  const h = height;
  const pad = 8;
  const max = Math.max(1, ...data.map((d) => d.value));
  const bw = data.length ? (w - pad * 2) / data.length : 0;
  return (
    <svg className="fv-em__chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img">
      {data.map((d, i) => {
        const bh = (d.value / max) * (h - pad * 2);
        return (
          <g key={i}>
            <rect x={pad + i * bw + bw * 0.15} y={h - pad - bh} width={bw * 0.7} height={bh} rx="2" fill={d.color ?? '#58a6ff'} />
            <title>{`${d.label}: ${fmtTip(d.value)}`}</title>
          </g>
        );
      })}
    </svg>
  );
}

export function EmDonut({ data, size = 150 }: { data: { label: string; value: number; color: string }[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="fv-em__donut">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {data.map((d, i) => {
            const frac = d.value / total;
            const dash = frac * c;
            const seg = (
              <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color} strokeWidth="16"
                strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-offset}>
                <title>{`${d.label}: ${fmtTip(d.value)} (${(frac * 100).toFixed(1)}%)`}</title>
              </circle>
            );
            offset += dash;
            return seg;
          })}
        </g>
        <text x="50%" y="47%" textAnchor="middle" className="fv-em__donut-total">{fmtTip(total)}</text>
        <text x="50%" y="60%" textAnchor="middle" className="fv-em__donut-cap">total</text>
      </svg>
      <ul className="fv-em__donut-legend">
        {data.map((d) => (
          <li key={d.label}><span className="fv-em__dot" style={{ background: d.color }} /> {d.label} <b>{fmtTip(d.value)}</b></li>
        ))}
      </ul>
    </div>
  );
}

/** CII A–E rating band indicator. */
export function EmRatingBand({ rating }: { rating: string }) {
  const bands: { g: string; c: string }[] = [
    { g: 'A', c: '#2ea043' }, { g: 'B', c: '#3fb950' }, { g: 'C', c: '#d29922' }, { g: 'D', c: '#f0883e' }, { g: 'E', c: '#f85149' },
  ];
  return (
    <div className="fv-em__band">
      {bands.map((b) => (
        <div key={b.g} className={`fv-em__band-cell${b.g === rating ? ' fv-em__band-cell--on' : ''}`} style={{ background: b.g === rating ? b.c : undefined, borderColor: b.c }}>
          <span>{b.g}</span>
          {b.g === rating && <i className="fas fa-caret-up fv-em__band-mark" aria-hidden="true" />}
        </div>
      ))}
    </div>
  );
}
