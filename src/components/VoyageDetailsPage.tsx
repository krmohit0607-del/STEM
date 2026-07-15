import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useL } from '../i18n/LocalizationProvider';
import { useSelectedVoyage } from '../data/selectedVoyage';
import { loadVoyageShared, mergeVoyageShared } from '../data/voyageOverrides';
import { buildEmptyView, buildView, nowStamp } from './voyage/buildView';
import { LegsSection } from './voyage/LegsSection';
import { NotesSection } from './voyage/NotesSection';
import { OrderSection } from './voyage/OrderSection';
import { VesselSection } from './voyage/VesselSection';
import { VoyageSummarySection } from './voyage/VoyageSummarySection';
import { CARD_IDS, type ChangeRecord, type VoyageView } from './voyage/types';

/**
 * Voyage Details page — `/voyage`.
 *
 * A voyage summary header plus the per-section cards (Order & Client,
 * Vessel Profile and Voyage / Leg Details). Each section lives in its own
 * component under `./voyage/` and receives the shared `view` state plus an
 * edit toggle. Field data is seeded from the selected voyage (test data
 * that can be swapped for an API response later); in "create" mode every
 * field starts blank and editable.
 */

interface VoyageDetailsPageProps {
  /** "edit" shows the selected voyage; "create" starts with a blank form. */
  mode?: 'edit' | 'create';
}

/** View fields that are arrays/objects and excluded from the scalar audit diff. */
const NON_SCALAR_KEYS = new Set(['legs', 'engineSpeedCons', 'changeHistory']);

/** Convert a camelCase field key into a readable label, e.g. "vesselName" -> "Vessel Name". */
function prettifyKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

/** Render a field value as a readable string for the audit log. */
function formatValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value == null || value === '') return '—';
  return String(value);
}

/**
 * Overlay the shared per-voyage overrides (Market Factors + Weather Safety
 * Limits) onto a freshly-built view, so edits made on the Limits & Constraints
 * page are reflected here.
 */
function applyShared(view: VoyageView, voyageId: string | undefined): VoyageView {
  const shared = loadVoyageShared(voyageId);
  if (!shared) return view;
  return {
    ...view,
    serviceType: shared.serviceType ?? view.serviceType,
    hireRate: shared.hireRate ?? view.hireRate,
    foPrice: shared.foPrice ?? view.foPrice,
    goPrice: shared.goPrice ?? view.goPrice,
    euaPrice: shared.euaPrice ?? view.euaPrice,
    thirdFuelType: shared.thirdFuelType ?? view.thirdFuelType,
    wslMaxSwhBallast: shared.wslMaxSwhBallast ?? view.wslMaxSwhBallast,
    wslMaxSwhLaden: shared.wslMaxSwhLaden ?? view.wslMaxSwhLaden,
    wslMaxWindsBallast: shared.wslMaxWindsBallast ?? view.wslMaxWindsBallast,
    wslMaxWindsLaden: shared.wslMaxWindsLaden ?? view.wslMaxWindsLaden,
    wslMaxSeaStateBallast: shared.wslMaxSeaStateBallast ?? view.wslMaxSeaStateBallast,
    wslMaxSeaStateLaden: shared.wslMaxSeaStateLaden ?? view.wslMaxSeaStateLaden,
  };
}

export function VoyageDetailsPage({ mode = 'edit' }: VoyageDetailsPageProps = {}) {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const isCreate = mode === 'create';
  const [searchParams] = useSearchParams();
  const startEdit = searchParams.get('edit') === '1';
  const selectedVoyage = useSelectedVoyage();
  const selectedId = selectedVoyage?.id;

  const initialView = useMemo(
    () =>
      isCreate || !selectedVoyage
        ? buildEmptyView()
        : applyShared(buildView(selectedVoyage), selectedVoyage.id),
    [isCreate, selectedVoyage],
  );

  const [view, setView] = useState<VoyageView>(initialView);
  const [editing, setEditing] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CARD_IDS.map((id) => [id, isCreate || startEdit])),
  );

  // When creating or editing a voyage the read-only Voyage Summary is skipped
  // (hidden from the nav) and we land on Order Details instead. After the voyage
  // is saved the summary is shown again.
  const [skipSummary, setSkipSummary] = useState<boolean>(isCreate || startEdit);

  // Snapshot of the view captured when edit mode is first entered, so the audit
  // log can record the before/after value of every field that changed on save.
  const editSnapshotRef = useRef<VoyageView | null>(null);

  // Re-seed the form whenever the selected voyage (or mode) changes.
  useEffect(() => {
    const seeded =
      isCreate || !selectedVoyage
        ? buildEmptyView()
        : applyShared(buildView(selectedVoyage), selectedVoyage.id);
    setView(seeded);
    setEditing(Object.fromEntries(CARD_IDS.map((id) => [id, isCreate || startEdit])));
    setSkipSummary(isCreate || startEdit);
    editSnapshotRef.current = isCreate || startEdit ? seeded : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, isCreate, startEdit]);

  const ed = (id: string) => !!editing[id];
  const captureSnapshot = () => {
    if (!editSnapshotRef.current) editSnapshotRef.current = view;
  };
  const toggleEdit = (id: string) => {
    captureSnapshot();
    setEditing((prev) => ({ ...prev, [id]: !prev[id] }));
  };
  const setAllEditing = (val: boolean) => {
    if (val) captureSnapshot();
    setEditing(Object.fromEntries(CARD_IDS.map((id) => [id, val])));
  };

  const handleSave = () => {
    // Diff the pre-edit snapshot against the current view and record one audit
    // entry per changed field, capturing the value before and after the change.
    const before = editSnapshotRef.current;
    if (before) {
      const stamp = nowStamp();
      const user = view.pic || 'You';
      const records: ChangeRecord[] = [];
      (Object.keys(view) as (keyof VoyageView)[]).forEach((key) => {
        if (NON_SCALAR_KEYS.has(key)) return;
        const beforeVal = before[key];
        if (Array.isArray(beforeVal) || (beforeVal && typeof beforeVal === 'object')) return;
        const b = formatValue(beforeVal);
        const a = formatValue(view[key]);
        if (b !== a) {
          records.push({ user, timestamp: stamp, change: prettifyKey(key), before: b, after: a });
        }
      });
      if (records.length) {
        setView((prev) => ({ ...prev, changeHistory: [...prev.changeHistory, ...records] }));
      }
    }
    // Mirror the shared Market Factors + Weather Safety Limits so the Limits &
    // Constraints page reflects these edits.
    if (selectedId) {
      mergeVoyageShared(selectedId, {
        serviceType: view.serviceType,
        hireRate: view.hireRate,
        foPrice: view.foPrice,
        goPrice: view.goPrice,
        euaPrice: view.euaPrice,
        thirdFuelType: view.thirdFuelType,
        wslMaxSwhBallast: view.wslMaxSwhBallast,
        wslMaxSwhLaden: view.wslMaxSwhLaden,
        wslMaxWindsBallast: view.wslMaxWindsBallast,
        wslMaxWindsLaden: view.wslMaxWindsLaden,
        wslMaxSeaStateBallast: view.wslMaxSeaStateBallast,
        wslMaxSeaStateLaden: view.wslMaxSeaStateLaden,
      });
    }
    editSnapshotRef.current = null;
    setAllEditing(false);
    // Saving is complete — reveal the read-only Voyage Summary and open it.
    setSkipSummary(false);
    setOpenSection('summary');
  };

  // Accordion: only one section is expanded at a time. Clicking a nav item (or
  // a card's collapse button) opens that section just below the nav row. When
  // creating or editing a voyage the read-only Voyage Summary is skipped and we
  // land on Order Details instead.
  const [openSection, setOpenSection] = useState<string>(skipSummary ? 'order' : 'summary');
  const toggleSection = (id: string) =>
    setOpenSection((prev) => (prev === id ? '' : id));
  const openSectionById = (id: string) => setOpenSection(id);

  const sectionNav = [
    ...(skipSummary
      ? []
      : [{ id: 'summary', label: t('voyageSummary', 'Voyage Summary'), icon: 'fa-clipboard-list' }]),
    { id: 'order', label: t('orderDetails', 'Order Details'), icon: 'fa-file-contract' },
    { id: 'vessel', label: t('vesselProfile', 'Vessel Profile'), icon: 'fa-ship' },
    { id: 'legs', label: t('legDetails', 'Leg Details'), icon: 'fa-route' },
    { id: 'voyageNotes', label: t('notes', 'Notes'), icon: 'fa-note-sticky' },
  ];

  return (
    <div className="fv-voyage">
      <header className="fv-voyage__header">
        <div className="fv-voyage__heading">
          <span className="fv-voyage__heading-icon" aria-hidden="true">
            <i className="fas fa-ship" />
          </span>
          <div>
            <h1>
              {isCreate
                ? t('createNewVoyage', 'New Voyage')
                : t('voyageDetails', 'Voyage Details')}
            </h1>
            <p className="fv-voyage__sub">
              {view.vesselName || '—'} · IMO {view.imo || '—'} · {view.legs.length} legs ·{' '}
              {view.duration || '—'}
            </p>
          </div>
        </div>
        <div className="fv-voyage__header-actions">
          <button type="button" className="fv-voyage__btn" onClick={() => setAllEditing(true)}>
            <i className="fas fa-pen" aria-hidden="true" /> {t('editVoyage', 'Edit Voyage')}
          </button>
          <button type="button" className="fv-voyage__btn">
            <i className="fas fa-clone" aria-hidden="true" /> {t('cloneVoyage', 'Clone Voyage')}
          </button>
          <button type="button" className="fv-voyage__btn fv-voyage__btn--danger">
            <i className="fas fa-box-archive" aria-hidden="true" /> {t('archive', 'Archive')}
          </button>
        </div>
      </header>

      <nav className="fv-voyage__tabs" aria-label="Voyage sections">
        {sectionNav.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`fv-voyage__tab${
              openSection === s.id ? ' fv-voyage__tab--active' : ''
            }`}
            onClick={() => openSectionById(s.id)}
            aria-current={openSection === s.id ? 'page' : undefined}
          >
            <i className={`fas ${s.icon}`} aria-hidden="true" /> {s.label}
          </button>
        ))}
      </nav>

      {openSection === 'summary' && (
        <VoyageSummarySection
          view={view}
          title={t('voyageSummary', 'VOYAGE SUMMARY')}
          collapsed={false}
          onToggleCollapse={() => toggleSection('summary')}
        />
      )}

      {openSection === 'order' && (
        <OrderSection
          view={view}
          setView={setView}
          editing={ed('order')}
          onToggleEdit={() => toggleEdit('order')}
          title={t('orderClientInformation', 'ORDER & CLIENT INFORMATION')}
          collapsed={false}
          onToggleCollapse={() => toggleSection('order')}
        />
      )}

      {openSection === 'vessel' && (
        <VesselSection
          view={view}
          setView={setView}
          editing={ed('vessel')}
          onToggleEdit={() => toggleEdit('vessel')}
          title={t('vesselProfile', 'VESSEL PROFILE')}
          collapsed={false}
          onToggleCollapse={() => toggleSection('vessel')}
        />
      )}

      {openSection === 'legs' && (
        <LegsSection
          view={view}
          setView={setView}
          editing={ed('legs')}
          onToggleEdit={() => toggleEdit('legs')}
          title={t('cpLegDetails', 'CP & LEG DETAILS')}
          collapsed={false}
          onToggleCollapse={() => toggleSection('legs')}
        />
      )}

      {openSection === 'voyageNotes' && (
        <NotesSection
          view={view}
          setView={setView}
          editing={ed('voyageNotes')}
          onToggleEdit={() => toggleEdit('voyageNotes')}
          title={t('notes', 'NOTES')}
          collapsed={false}
          onToggleCollapse={() => toggleSection('voyageNotes')}
        />
      )}

      <footer className="fv-voyage__footer">
        <button
          type="button"
          className="fv-voyage__btn fv-voyage__btn--primary"
          onClick={handleSave}
        >
          <i className="fas fa-save" aria-hidden="true" /> {t('saveVoyage', 'Save Voyage')}
        </button>
      </footer>
    </div>
  );
}
