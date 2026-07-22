import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useL } from '../i18n/LocalizationProvider';
import { VOYAGES, type Voyage } from '../data/voyages';
import {
  writeSelectedVoyageId,
  useSelectedVoyageId,
  clearSelectedVoyageId,
} from '../data/selectedVoyage';
import { AppFooterControls } from './AppFooterControls';

/**
 * Fleet menu — the app-wide vessel list that sits at the far left of the main
 * layout (before the icon column). It lists the vessels/fixtures with a little
 * voyage context and can be filtered by PIC, voyage type and lifecycle status.
 * The top dropdown picks the product module (role/access); for now every
 * module shows the same voyage list until the per-module data is wired up.
 *
 * The panel can be minimised to a slim bar via the collapse button.
 */

/** Product modules (future roles/access). Selecting one lists its vessels. */
const MODULES = [
  'Chartering',
  'Operations',
  'Bunker',
  'Postfix',
  'Performance',
  'Accounts',
];

/**
 * The modules the app is wired to. The current app (routing, performance &
 * optimization) is the Performance module; Chartering hosts the voyage
 * estimation. The rest are placeholders for future roles/access.
 */
const ACTIVE_MODULES = new Set(['Performance', 'Chartering', 'Operations']);

type Lifecycle = 'active' | 'complete' | 'closed';

/**
 * Voyage lifecycle: Active once fixed, Complete once discharged + redelivered,
 * Closed once final settlements are done. The sample data only carries an
 * operational status, so a deterministic split keeps the Complete/Closed
 * buckets populated for the filter until the real field is available.
 */
function lifecycleOf(v: Voyage): Lifecycle {
  const s = v.status.toLowerCase();
  if (s.includes('closed') || s.includes('settl')) return 'closed';
  if (s.includes('redeliver') || s.includes('complete') || s.includes('discharg'))
    return 'complete';
  const mod = Math.abs(Math.round(v.seed ?? 0)) % 6;
  if (mod === 5) return 'closed';
  if (mod === 4) return 'complete';
  return 'active';
}

const LIFECYCLE_LABEL: Record<Lifecycle, string> = {
  active: 'Active',
  complete: 'Complete',
  closed: 'Closed',
};

/** Status tabs per module: the same three buckets are labelled differently. */
const MODULE_STATUSES: Record<string, { key: Lifecycle; label: string }[]> = {
  Performance: [
    { key: 'active', label: 'Active' },
    { key: 'complete', label: 'Complete' },
    { key: 'closed', label: 'Closed' },
  ],
  Chartering: [
    { key: 'active', label: 'Estimation' },
    { key: 'complete', label: 'Fixed' },
    { key: 'closed', label: 'Cancelled' },
  ],
  Operations: [
    { key: 'active', label: 'On Voyage' },
    { key: 'complete', label: 'Completed' },
    { key: 'closed', label: 'Closed' },
  ],
};

function statusLabel(module: string, key: Lifecycle): string {
  const list = MODULE_STATUSES[module] ?? MODULE_STATUSES.Performance;
  return list.find((s) => s.key === key)?.label ?? LIFECYCLE_LABEL[key];
}

/**
 * Charter type (TCIN = Time Charter In, TCO = Time Charter Out, VOY = Voyage,
 * COA = Contract of Affreightment, SPOT). The sample data has no charter-type
 * field yet, so it is derived deterministically for display; swap for the real
 * field when available.
 */
const CHARTER_TYPES = ['TCIN', 'TCO', 'VOY', 'COA', 'SPOT'];
function charterTypeOf(v: Voyage): string {
  return CHARTER_TYPES[Math.abs(Math.round(v.seed ?? 0)) % CHARTER_TYPES.length];
}

const COLLAPSE_KEY = 'fv.fleetMenu.collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

export function FleetMenu() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };
  const navigate = useNavigate();
  const selectedId = useSelectedVoyageId();

  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
  const [module, setModule] = useState<string>('Performance');
  const [pic, setPic] = useState('All');
  const [voyageType, setVoyageType] = useState('All');
  const [status, setStatus] = useState<Lifecycle>('active');
  const [query, setQuery] = useState('');

  const pics = useMemo(
    () => ['All', ...Array.from(new Set(VOYAGES.map((v) => v.pic))).sort()],
    [],
  );
  const types = useMemo(
    () => ['All', ...Array.from(new Set(VOYAGES.map((v) => v.service))).sort()],
    [],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return VOYAGES.filter((v) => {
      if (pic !== 'All' && v.pic !== pic) return false;
      if (voyageType !== 'All' && v.service !== voyageType) return false;
      if (lifecycleOf(v) !== status) return false;
      if (
        q &&
        !`${v.vessel} ${v.id} ${v.portFrom} ${v.portTo}`.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [pic, voyageType, status, query]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const moduleRoute = (m: string) =>
    m === 'Chartering' ? '/chartering' : m === 'Operations' ? '/operations' : '/voyage';

  const openVoyage = (v: Voyage) => {
    writeSelectedVoyageId(v.id);
    navigate(moduleRoute(module));
  };

  // Switching module clears the active vessel so the details area starts blank;
  // data only reappears once the user picks a vessel from the list.
  const changeModule = (next: string) => {
    setModule(next);
    clearSelectedVoyageId();
    navigate(moduleRoute(next));
  };

  if (collapsed) {
    return (
      <div className="fv-fleetmenu fv-fleetmenu--collapsed">
        <button
          type="button"
          className="fv-fleetmenu__expand"
          onClick={toggleCollapsed}
          title={t('showFleetMenu', 'Show fleet menu')}
          aria-label={t('showFleetMenu', 'Show fleet menu')}
        >
          <i className="fas fa-bars" aria-hidden="true" />
        </button>
        <div className="fv-fleetmenu__footer fv-fleetmenu__footer--collapsed">
          <AppFooterControls />
        </div>
      </div>
    );
  }

  return (
    <aside className="fv-fleetmenu" aria-label={t('fleetMenu', 'Fleet menu')}>
      <div className="fv-fleetmenu__head">
        <select
          className="fv-fleetmenu__module"
          value={module}
          onChange={(e) => changeModule(e.target.value)}
          aria-label={t('module', 'Module')}
        >
          {MODULES.map((m) => (
            <option key={m} value={m} disabled={!ACTIVE_MODULES.has(m)}>
              {ACTIVE_MODULES.has(m) ? m : `${m} (soon)`}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="fv-fleetmenu__collapse"
          onClick={toggleCollapsed}
          title={t('minimize', 'Minimize')}
          aria-label={t('minimize', 'Minimize')}
        >
          <i className="fas fa-angles-left" aria-hidden="true" />
        </button>
      </div>

      <div className="fv-fleetmenu__filters">
        <select
          value={pic}
          onChange={(e) => setPic(e.target.value)}
          aria-label={t('pic', 'PIC')}
        >
          {pics.map((p) => (
            <option key={p} value={p}>
              {p === 'All' ? t('picAll', 'PIC: All') : p}
            </option>
          ))}
        </select>
        <select
          value={voyageType}
          onChange={(e) => setVoyageType(e.target.value)}
          aria-label={t('voyageType', 'Voyage type')}
        >
          {types.map((tp) => (
            <option key={tp} value={tp}>
              {tp === 'All' ? t('typeAll', 'Type: All') : tp}
            </option>
          ))}
        </select>
      </div>

      <div className="fv-fleetmenu__tabs" role="tablist">
        {(MODULE_STATUSES[module] ?? MODULE_STATUSES.Performance).map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={status === s.key}
            className={`fv-fleetmenu__tab${status === s.key ? ' fv-fleetmenu__tab--active' : ''}`}
            onClick={() => setStatus(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="fv-fleetmenu__search">
        <i className="fas fa-magnifying-glass" aria-hidden="true" />
        <input
          type="text"
          value={query}
          placeholder={t('searchVesselOrder', 'Search vessel / order…')}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('searchVesselOrder', 'Search vessel / order')}
        />
      </div>

      <ul className="fv-fleetmenu__list">
        {rows.length === 0 && (
          <li className="fv-fleetmenu__empty">{t('noVessels', 'No vessels')}</li>
        )}
        {rows.map((v) => (
          <li key={v.id}>
            <button
              type="button"
              className={`fv-fleetmenu__item${v.id === selectedId ? ' fv-fleetmenu__item--active' : ''}`}
              onClick={() => openVoyage(v)}
            >
              <div className="fv-fleetmenu__item-top">
                <span className="fv-fleetmenu__vessel">{v.vessel}</span>
                <span className="fv-fleetmenu__order">{v.id}</span>
              </div>
              <div className="fv-fleetmenu__item-route">
                {v.portFrom} → {v.portTo}
              </div>
              <div className="fv-fleetmenu__item-meta">
                <span className="fv-fleetmenu__charter">{charterTypeOf(v)}</span>
                {pic === 'All' && <span>· {v.pic}</span>}
                <span
                  className={`fv-fleetmenu__badge fv-fleetmenu__badge--${lifecycleOf(v)}`}
                >
                  {statusLabel(module, lifecycleOf(v))}
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>

      <div className="fv-fleetmenu__footer">
        <AppFooterControls />
      </div>
    </aside>
  );
}
