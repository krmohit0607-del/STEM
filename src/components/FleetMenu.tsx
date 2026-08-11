import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useL } from '../i18n/LocalizationProvider';
import { useVoyages, type Voyage } from '../data/voyages';
import {
  writeSelectedVoyageId,
  useSelectedVoyageId,
  clearSelectedVoyageId,
} from '../data/selectedVoyage';
import {
  BUNKER_TABS,
  BUNKER_TYPE_FILTERS,
  STATUS_TONE,
  bucketOf,
  matchesTypeFilter,
  useBunkerRequirements,
  useSelectedBunkerId,
  writeSelectedBunkerId,
  clearSelectedBunkerId,
} from '../data/bunker';
import {
  ACCOUNT_TABS,
  ACCOUNT_TYPE_FILTERS,
  bucketOfTxn,
  matchesAccountType,
  isOverdue,
  useAccountTxns,
  useSelectedAccountVessel,
  writeSelectedAccountVessel,
} from '../data/accounts';
import { useEstimationStatuses, useEstimationFixTypes, charteringBucket, estStatusColor, estStatusLabel, useHandedOver, useModuleLifecycles, moduleLifecycleOf, usePostfixHanded, useFixtureNumbers } from '../data/workflow';
import { useSavedEstimates } from '../data/savedEstimates';
import { FIX_TYPE_FILTER_OPTIONS } from './ChateringEstimationPage';
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
  'Emissions',
  'Performance',
  'Accounts',
];

/**
 * The modules the app is wired to. The current app (routing, performance &
 * optimization) is the Performance module; Chartering hosts the voyage
 * estimation. The rest are placeholders for future roles/access.
 */
const ACTIVE_MODULES = new Set(['Performance', 'Chartering', 'Operations', 'Bunker', 'Postfix', 'Emissions', 'Accounts']);

type ModuleName =
  | 'Chartering'
  | 'Operations'
  | 'Bunker'
  | 'Postfix'
  | 'Emissions'
  | 'Performance'
  | 'Accounts';

interface FleetMenuNavState {
  fleetMenuModule?: ModuleName;
}

function isModuleName(value: string | undefined): value is ModuleName {
  return typeof value === 'string' && ACTIVE_MODULES.has(value);
}

function moduleFromPath(pathname: string): ModuleName | null {
  if (pathname.startsWith('/chartering')) return 'Chartering';
  if (pathname.startsWith('/operations')) return 'Operations';
  if (pathname.startsWith('/bunker')) return 'Bunker';
  if (pathname.startsWith('/postfix')) return 'Postfix';
  if (pathname.startsWith('/emissions')) return 'Emissions';
  if (pathname.startsWith('/accounts')) return 'Accounts';
  // Performance workspaces all sit on the "voyage" family of routes.
  if (pathname.startsWith('/voyage')) return 'Performance';
  return null;
}

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
const MODULE_STATUSES: Record<string, { key: string; label: string }[]> = {
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
    { key: 'active', label: 'Active' },
    { key: 'complete', label: 'Completed' },
    { key: 'closed', label: 'Closed' },
  ],
  Postfix: [
    { key: 'active', label: 'Active' },
    { key: 'complete', label: 'Completed' },
    { key: 'closed', label: 'Closed' },
  ],
  Emissions: [
    { key: 'active', label: 'Active' },
    { key: 'complete', label: 'Completed' },
    { key: 'closed', label: 'Closed' },
  ],
  Bunker: BUNKER_TABS.map((b) => ({ key: b.key, label: b.label })),
  Accounts: ACCOUNT_TABS.map((b) => ({ key: b.key, label: b.label })),
};

function statusLabel(module: string, key: string): string {
  const list = MODULE_STATUSES[module] ?? MODULE_STATUSES.Performance;
  return list.find((s) => s.key === key)?.label ?? LIFECYCLE_LABEL[key as Lifecycle] ?? key;
}

/**
 * Charter type (TCIN = Time Charter In, TCO = Time Charter Out, VOY = Voyage,
 * COA = Contract of Affreightment, SPOT). The sample data has no charter-type
 * field yet, so it is derived deterministically for display; swap for the real
 * field when available.
 */
function charterTypeOf(v: Voyage): string {
  return FIX_TYPE_FILTER_OPTIONS[Math.abs(Math.round(v.seed ?? 0)) % FIX_TYPE_FILTER_OPTIONS.length];
}

const COLLAPSE_KEY = 'fv.fleetMenu.collapsed';

/** Compact USD formatter for the Accounts vessel list. */
function usdAbbr(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(0)}K`;
  return `${sign}$${a.toFixed(0)}`;
}

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
  const location = useLocation();
  const voyages = useVoyages();
  const selectedId = useSelectedVoyageId();
  const selectedBunkerId = useSelectedBunkerId();
  const bunkerAll = useBunkerRequirements();
  const accountAll = useAccountTxns();
  const selectedAccountVessel = useSelectedAccountVessel();
  const estStatuses = useEstimationStatuses();
  const estFixTypes = useEstimationFixTypes();
  const handedOver = useHandedOver();
  const moduleLifecycles = useModuleLifecycles();
  const postfixHanded = usePostfixHanded();
  const fixtureNos = useFixtureNumbers();
  const savedEstimates = useSavedEstimates();
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
  const [module, setModule] = useState<ModuleName>('Performance');
  const [pic, setPic] = useState('All');
  const [voyageType, setVoyageType] = useState('All');
  const [status, setStatus] = useState<string>('active');
  const [query, setQuery] = useState('');

  const isBunker = module === 'Bunker';
  const isAccounts = module === 'Accounts';
  const isChartering = module === 'Chartering';
  const isOperations = module === 'Operations';

  const applyModule = (next: ModuleName, forceReset = false) => {
    if (next !== module) {
      setModule(next);
    } else if (!forceReset) {
      return;
    }
    // Create-mode should always start from a visible, unfiltered fleet list.
    setPic('All');
    setStatus((MODULE_STATUSES[next] ?? MODULE_STATUSES.Performance)[0].key);
    setVoyageType('All');
    setQuery('');
  };

  // Keep the sidebar module in sync with create-intent and active route.
  useEffect(() => {
    const inCreateMode = new URLSearchParams(location.search).get('new') === '1';
    const routed = moduleFromPath(location.pathname);
    if (routed) {
      applyModule(routed, inCreateMode);
      return;
    }
    const state = location.state as FleetMenuNavState | null;
    const hinted = state?.fleetMenuModule;
    if (isModuleName(hinted)) {
      applyModule(hinted, inCreateMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, location.state]);

  const pics = useMemo(
    () => ['All', ...Array.from(new Set(voyages.map((v) => v.pic).filter(Boolean))).sort()],
    [voyages],
  );
  const types = useMemo(
    () =>
      isBunker
        ? [...BUNKER_TYPE_FILTERS]
        : isAccounts
          ? [...ACCOUNT_TYPE_FILTERS]
          : isChartering
            ? ['All', ...FIX_TYPE_FILTER_OPTIONS]
            : isOperations
              ? ['All', ...FIX_TYPE_FILTER_OPTIONS, 'At Sea', 'At Port']
              : ['All', ...Array.from(new Set(voyages.map((v) => v.service).filter(Boolean))).sort()],
    [isBunker, isAccounts, isChartering, isOperations, voyages],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Chartering buckets by estimate status; Operations/Postfix honour a manual
    // override, else derive; handed-over voyages default to Active.
    const bucketFor = (v: Voyage): Lifecycle => {
      if (module === 'Chartering') return charteringBucket(v.id, estStatuses, lifecycleOf(v));
      if (module === 'Operations') {
        return moduleLifecycleOf(moduleLifecycles, 'Operations', v.id)
          ?? (handedOver.includes(v.id) ? 'active' : lifecycleOf(v));
      }
      if (module === 'Postfix') {
        return moduleLifecycleOf(moduleLifecycles, 'Postfix', v.id)
          ?? (postfixHanded.includes(v.id) ? 'active' : lifecycleOf(v));
      }
      if (module === 'Performance' && handedOver.includes(v.id)) return 'active';
      return lifecycleOf(v);
    };
    return voyages.filter((v) => {
      if (pic !== 'All' && v.pic !== pic) return false;
      if (voyageType !== 'All') {
        if (voyageType === 'At Sea' || voyageType === 'At Port') {
          if (v.status !== voyageType) return false;
        } else if (isChartering || isOperations) {
          // Chartering / Operations filter by the estimate's Fix Type.
          const rowType = estFixTypes[v.id] ?? charterTypeOf(v);
          if (rowType !== voyageType) return false;
        } else if (v.service !== voyageType) {
          return false;
        }
      }
      if (bucketFor(v) !== status) return false;
      if (
        q &&
        !`${v.vessel} ${v.id} ${v.portFrom} ${v.portTo}`.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [module, voyages, isChartering, isOperations, pic, voyageType, status, query, estStatuses, estFixTypes, handedOver, moduleLifecycles, postfixHanded]);

  // Saved estimates (from the estimation page's Save button) surface at the top
  // of the Chartering list. Their status maps onto the same three buckets.
  const savedRows = useMemo(() => {
    if (!isChartering) return [];
    const q = query.trim().toLowerCase();
    const bucket = (s: string): Lifecycle => {
      const l = s.toLowerCase();
      if (l.includes('fixed')) return 'complete';
      if (l.includes('cancel')) return 'closed';
      return 'active';
    };
    return savedEstimates.filter((s) => {
      if (bucket(s.status) !== status) return false;
      if (voyageType !== 'All' && s.fixType !== voyageType) return false;
      if (q && !`${s.vessel} ${s.estNo} ${s.fixType}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [isChartering, savedEstimates, status, voyageType, query]);

  const activeEstId = new URLSearchParams(location.search).get('est');

  // Bucket shown on each voyage row's badge (mirrors the filter above).
  const rowBucket = (v: Voyage): Lifecycle => {
    if (module === 'Chartering') return charteringBucket(v.id, estStatuses, lifecycleOf(v));
    if (module === 'Operations') {
      return moduleLifecycleOf(moduleLifecycles, 'Operations', v.id)
        ?? (handedOver.includes(v.id) ? 'active' : lifecycleOf(v));
    }
    if (module === 'Postfix') {
      return moduleLifecycleOf(moduleLifecycles, 'Postfix', v.id)
        ?? (postfixHanded.includes(v.id) ? 'active' : lifecycleOf(v));
    }
    if (module === 'Performance' && handedOver.includes(v.id)) return 'active';
    return lifecycleOf(v);
  };

  // Bunker requirements filtered by the coarse status tab + the "Type" fine filter.
  const bunkerRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bunkerAll.filter((r) => {
      if (bucketOf(r) !== status) return false;
      if (!matchesTypeFilter(r, voyageType)) return false;
      if (q && !`${r.vessel} ${r.id} ${r.route} ${r.bunkerPort} ${r.supplier ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [bunkerAll, status, voyageType, query]);

  // Accounts: aggregate the ledger per vessel for the current bucket + type filter.
  const accountRows = useMemo(() => {
    const map = new Map<string, { vessel: string; reference: string; payable: number; receivable: number; overdue: number; approvals: number; count: number }>();
    for (const tx of accountAll) {
      if (bucketOfTxn(tx) !== status) continue;
      if (!matchesAccountType(tx, voyageType)) continue;
      const e = map.get(tx.vessel) ?? { vessel: tx.vessel, reference: tx.reference, payable: 0, receivable: 0, overdue: 0, approvals: 0, count: 0 };
      if (tx.kind === 'Payable') e.payable += tx.amount; else e.receivable += tx.amount;
      if (isOverdue(tx)) e.overdue += 1;
      if (tx.approval === 'Pending') e.approvals += 1;
      e.count += 1;
      e.reference = tx.reference;
      map.set(tx.vessel, e);
    }
    const q = query.trim().toLowerCase();
    let out = Array.from(map.values()).map((e) => ({ ...e, net: e.receivable - e.payable }));
    if (q) out = out.filter((r) => `${r.vessel} ${r.reference}`.toLowerCase().includes(q));
    out.sort((a, b) => b.payable + b.receivable - (a.payable + a.receivable));
    return out;
  }, [accountAll, status, voyageType, query]);

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
    m === 'Chartering' ? '/chartering' : m === 'Operations' ? '/operations' : m === 'Bunker' ? '/bunker' : m === 'Postfix' ? '/postfix' : m === 'Emissions' ? '/emissions' : m === 'Accounts' ? '/accounts' : '/voyage';

  const openVoyage = (v: Voyage) => {
    writeSelectedVoyageId(v.id);
    navigate(moduleRoute(module));
  };

  const openSavedEstimate = (id: string) => {
    clearSelectedVoyageId();
    navigate(`/chartering?est=${encodeURIComponent(id)}`);
  };

  // Switching module clears the active vessel so the details area starts blank;
  // data only reappears once the user picks a vessel from the list.
  const changeModule = (next: ModuleName) => {
    setModule(next);
    setStatus((MODULE_STATUSES[next] ?? MODULE_STATUSES.Performance)[0].key);
    setVoyageType('All');
    clearSelectedVoyageId();
    clearSelectedBunkerId();
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
          onChange={(e) => {
            if (isModuleName(e.target.value)) changeModule(e.target.value);
          }}
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
        {!isBunker && !isAccounts && (
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
        )}
        <select
          value={voyageType}
          onChange={(e) => setVoyageType(e.target.value)}
          aria-label={t('voyageType', 'Type')}
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
          placeholder={isBunker ? t('searchBunker', 'Search vessel / requirement…') : isAccounts ? t('searchAccounts', 'Search vessel / reference…') : t('searchVesselOrder', 'Search vessel / order…')}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('searchVesselOrder', 'Search vessel / order')}
        />
      </div>

      {isBunker ? (
        <ul className="fv-fleetmenu__list">
          {bunkerRows.length === 0 && (
            <li className="fv-fleetmenu__empty">{t('noRequirements', 'No requirements')}</li>
          )}
          {bunkerRows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className={`fv-fleetmenu__item${r.id === selectedBunkerId ? ' fv-fleetmenu__item--active' : ''}`}
                onClick={() => { writeSelectedBunkerId(r.id); navigate('/bunker'); }}
              >
                <div className="fv-fleetmenu__item-top">
                  <span className="fv-fleetmenu__vessel">{r.vessel}</span>
                  <span className="fv-fleetmenu__order">{r.id}</span>
                </div>
                <div className="fv-fleetmenu__item-route">
                  {r.route}
                </div>
                <div className="fv-fleetmenu__item-meta">
                  <span className="fv-fleetmenu__charter">{r.leg} · {(r.fuelLines?.length ?? 0) > 1 ? r.fuelLines!.map(f => f.fuel).join(' + ') : r.fuelType}</span>
                  <span className={`fv-fleetmenu__bkbadge fv-fleetmenu__bkbadge--${STATUS_TONE[r.status]}`}>
                    {r.status}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : isAccounts ? (
        <ul className="fv-fleetmenu__list">
          {accountRows.length === 0 && (
            <li className="fv-fleetmenu__empty">{t('noAccounts', 'No transactions')}</li>
          )}
          {accountRows.map((r) => (
            <li key={r.vessel}>
              <button
                type="button"
                className={`fv-fleetmenu__item${r.vessel === selectedAccountVessel ? ' fv-fleetmenu__item--active' : ''}`}
                onClick={() => { writeSelectedAccountVessel(r.vessel); navigate('/accounts'); }}
              >
                <div className="fv-fleetmenu__item-top">
                  <span className="fv-fleetmenu__vessel">{r.vessel}</span>
                  <span className="fv-fleetmenu__order">{r.reference}</span>
                </div>
                <div className="fv-fleetmenu__item-route">
                  Net <b className={r.net >= 0 ? 'fv-fleetmenu__pos' : 'fv-fleetmenu__neg'}>{usdAbbr(r.net)}</b>
                  <span className="fv-fleetmenu__acct-split"> · Pay {usdAbbr(r.payable)} · Rec {usdAbbr(r.receivable)}</span>
                </div>
                <div className="fv-fleetmenu__item-meta">
                  {r.overdue > 0 && <span className="fv-fleetmenu__bkbadge fv-fleetmenu__bkbadge--due" style={{ background: 'rgba(255,107,107,.16)', color: '#ff6b6b' }}>{r.overdue} overdue</span>}
                  {r.approvals > 0 && <span className="fv-fleetmenu__bkbadge fv-fleetmenu__bkbadge--approval">{r.approvals} to approve</span>}
                  <span className="fv-fleetmenu__acct-count">{r.count} txn</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="fv-fleetmenu__list">
          {rows.length === 0 && savedRows.length === 0 && (
            <li className="fv-fleetmenu__empty">{t('noVessels', 'No vessels')}</li>
          )}
          {savedRows.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={`fv-fleetmenu__item${s.id === activeEstId ? ' fv-fleetmenu__item--active' : ''}`}
                onClick={() => openSavedEstimate(s.id)}
              >
                <div className="fv-fleetmenu__item-top">
                  <span className="fv-fleetmenu__vessel">{s.vessel}</span>
                  <span className="fv-fleetmenu__order">{s.estNo}</span>
                </div>
                <div className="fv-fleetmenu__item-route">
                  Profit <b className={s.profit >= 0 ? 'fv-fleetmenu__pos' : 'fv-fleetmenu__neg'}>{usdAbbr(s.profit)}</b>
                  <span className="fv-fleetmenu__acct-split"> · TCE {usdAbbr(s.tce)}/d</span>
                </div>
                <div className="fv-fleetmenu__item-meta">
                  <span className="fv-fleetmenu__charter">{s.fixType}</span>
                  <span className={`fv-fleetmenu__badge fv-fleetmenu__badge--${estStatusColor(s.status)}`}>
                    {estStatusLabel(s.status)}
                  </span>
                </div>
              </button>
            </li>
          ))}
          {rows.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                className={`fv-fleetmenu__item${v.id === selectedId ? ' fv-fleetmenu__item--active' : ''}`}
                onClick={() => openVoyage(v)}
              >
                <div className="fv-fleetmenu__item-top">
                  <span className="fv-fleetmenu__vessel">{v.vessel}</span>
                  <span className="fv-fleetmenu__order">{fixtureNos[v.id] ?? v.id}</span>
                </div>
                <div className="fv-fleetmenu__item-route">
                  {v.portFrom} → {v.portTo}
                </div>
                <div className="fv-fleetmenu__item-meta">
                  <span className="fv-fleetmenu__charter">{estFixTypes[v.id] ?? charterTypeOf(v)}</span>
                  {pic === 'All' && <span>· {v.pic}</span>}
                  <span
                    className={`fv-fleetmenu__badge fv-fleetmenu__badge--${rowBucket(v)}`}
                  >
                    {isOperations ? v.status : statusLabel(module, rowBucket(v))}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="fv-fleetmenu__footer">
        <AppFooterControls />
      </div>
    </aside>
  );
}
