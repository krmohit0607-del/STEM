import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { useSelectedVoyage } from '../data/selectedVoyage';
import type { Voyage } from '../data/voyages';

/**
 * Lightweight presentational primitives shared by the Vessel / Client /
 * Email / Passage detail pages. They reuse the existing `fv-voyage` CSS
 * so the new pages match the Voyage Details look without new styles.
 *
 * `DetailPage` also renders the shared header (vessel + IMO summary) and a
 * cross-link bar so the four interrelated pages can navigate between each
 * other while keeping the same open voyage selected.
 */

interface DetailPageProps {
  icon: string;
  title: string;
  /** Current route, used to mark the active cross-link. */
  current: '/vessel' | '/client' | '/email' | '/passage' | '/voyage';
  children: ReactNode;
}

const CROSS_LINKS: Array<{ to: DetailPageProps['current']; icon: string; label: string }> = [
  { to: '/voyage', icon: 'fa-route', label: 'Voyage Details' },
  { to: '/vessel', icon: 'fa-ship', label: 'Vessel Details' },
  { to: '/client', icon: 'fa-building', label: 'Client Details' },
  { to: '/email', icon: 'fa-envelope', label: 'Email Details' },
  { to: '/passage', icon: 'fa-map-location-dot', label: 'Passage Details' },
];

export function DetailPage({ icon, title, current, children }: DetailPageProps) {
  const voyage = useSelectedVoyage();
  const suffix = voyage ? `?voyage=${encodeURIComponent(voyage.id)}` : '';

  return (
    <div className="fv-voyage">
      <header className="fv-voyage__header">
        <div className="fv-voyage__heading">
          <span className="fv-voyage__heading-icon" aria-hidden="true">
            <i className={`fas ${icon}`} />
          </span>
          <div>
            <h1>{title}</h1>
            <p className="fv-voyage__sub">
              {voyage
                ? `${voyage.vessel} \u00b7 IMO ${voyage.imo} \u00b7 ${voyage.client} \u00b7 ${voyage.portFrom} \u2192 ${voyage.portTo}`
                : 'No voyage selected \u2014 open one from the Fleet List.'}
            </p>
          </div>
        </div>
      </header>

      <nav className="fv-voyage__tabs" aria-label="Voyage detail sections">
        {CROSS_LINKS.map((link) => (
          <Link
            key={link.to}
            to={`${link.to}${suffix}`}
            className={`fv-voyage__tab${link.to === current ? ' fv-voyage__tab--active' : ''}`}
            aria-current={link.to === current ? 'page' : undefined}
          >
            <i className={`fas ${link.icon}`} aria-hidden="true" /> {link.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}

interface DetailCardProps {
  number?: number;
  title: string;
  defaultCollapsed?: boolean;
  children: ReactNode;
}

export function DetailCard({ number, title, defaultCollapsed = false, children }: DetailCardProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <section className={`fv-voyage__card${collapsed ? ' fv-voyage__card--collapsed' : ''}`}>
      <header className="fv-voyage__card-head">
        <h2 className="fv-voyage__card-title">
          {number != null && <span className="fv-voyage__card-num">{number}.</span>}
          {title}
        </h2>
        <div className="fv-voyage__card-actions">
          <button
            type="button"
            className="fv-voyage__collapse-btn"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand' : 'Minimize'}
          >
            <i
              className={`fas ${collapsed ? 'fa-chevron-down' : 'fa-chevron-up'}`}
              aria-hidden="true"
            />
          </button>
        </div>
      </header>
      {!collapsed && <div className="fv-voyage__card-body">{children}</div>}
    </section>
  );
}

export function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="fv-voyage__info">
      <span className="fv-voyage__info-label">{label}</span>
      <span className="fv-voyage__info-value">{value || '\u2014'}</span>
    </div>
  );
}

export function NoVoyage({ voyage }: { voyage: Voyage | undefined }) {
  if (voyage) return null;
  return (
    <section className="fv-voyage__card">
      <div className="fv-voyage__card-body">
        <p className="fv-voyage__notes">
          No open voyage is selected. Open a vessel from the{' '}
          <Link to="/main">Fleet List</Link> to see its details here.
        </p>
      </div>
    </section>
  );
}
