import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useL } from '../i18n/LocalizationProvider';
import { useSelectedVoyage, writeSelectedVoyageId } from '../data/selectedVoyage';
import { NoVesselSelected } from './NoVesselSelected';
import { loadVoyageShared, mergeVoyageShared } from '../data/voyageOverrides';
import { buildEmptyView, buildView, nowStamp } from './voyage/buildView';
import { upsertCreatedVoyage } from '../data/voyages';
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

function parseNumberToken(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number.parseFloat(raw.replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : undefined;
}

function parseAmount(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number.parseFloat(raw.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function cleanEmailPort(raw: string): string {
  const cleaned = raw
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(?:CHOPS|ECI|MPT|SB|SP|SINGLE\s+PORT\s+DISCHARGE\s+BASIS)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const parts = cleaned.split(',').map((x) => x.trim()).filter(Boolean);
  const chosen = parts.find((p) => /[A-Za-z]/.test(p) && !/^(?:INDIA|SOUTH AFRICA)$/i.test(p)) ?? parts[0] ?? cleaned;
  return chosen
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

interface ClientEmailDraft {
  fields: Partial<VoyageView>;
  legFrom?: string;
  legTo?: string;
  ecoSpeed?: number;
  ecoFo?: number;
  ecoMgo?: number;
  fullSpeed?: number;
  fullFo?: number;
  fullMgo?: number;
  // Ballast-condition speed/cons, used to fill the vessel-level Speed & Cons
  // profile (engineSpeedCons) alongside the laden figures above.
  ecoSpeedBallast?: number;
  ecoFoBallast?: number;
  fullSpeedBallast?: number;
  fullFoBallast?: number;
}

function parseClientEmailDraft(text: string): ClientEmailDraft {
  const src = text.replace(/\r/g, '').replace(/\*/g, '');
  const up = src.toUpperCase();
  const fields: Partial<VoyageView> = {};

  const vesselName = src.match(/\n\s*([A-Z][A-Z0-9 .'-]{2,})\s*\n\s*BUILT\b/i)?.[1]?.trim();
  if (vesselName) fields.vesselName = vesselName;

  const imo = src.match(/\bIMO\s*:\s*(\d{7})/i)?.[1];
  if (imo) fields.imo = imo;

  const vesselType = src.match(/\bTYPE\s*:\s*([^\n]+)/i)?.[1]?.trim();
  if (vesselType) fields.vesselType = vesselType;

  const flag = src.match(/\bFLAG\s*:\s*([^\n]+)/i)?.[1]?.trim();
  if (flag) fields.flag = flag;

  const loa = src.match(/\bLOA\s*:\s*([\d.]+)/i)?.[1];
  if (loa) fields.loa = loa;

  const beam = src.match(/\bBEAM\s*:\s*([\d.]+)/i)?.[1];
  if (beam) fields.beam = beam;

  const emailList = [...new Set((src.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []).map((x) => x.trim().toLowerCase()))];
  if (emailList.length > 0) fields.clientEmailList = emailList.join(', ');

  const cargoLine = src.match(/CARGO\s*&\s*QTY\s*:\s*([^\n]+)/i)?.[1]?.trim();
  if (cargoLine) fields.clientNotes = cargoLine;

  const loadPort = cleanEmailPort(src.match(/LOAD\s+PORT\s*:\s*([^\n]+)/i)?.[1] ?? '');
  const dischPort = cleanEmailPort((src.match(/DISCHARGE\s+PORT\s+OPTIONS?[\s\S]{0,280}?A\)\s*[^\n\-]*-\s*([^\n]+)/i)?.[1]) ?? '');

  const eco = up.match(/ECO\s+SPEED[\s\S]*?LADEN\s*:\s*ABOUT\s*([\d.]+)\s*KNOTS[\s\S]*?ON\s*ABOUT\s*([\d.]+)\s*MT[^\n]*\+\s*ABOUT\s*([\d.]+)\s*MT/i);
  const full = up.match(/SERVICE\s+SPEED[\s\S]*?LADEN\s*:\s*ABOUT\s*([\d.]+)\s*KNOTS[\s\S]*?ON\s*ABOUT\s*([\d.]+)\s*MT[^\n]*\+\s*ABOUT\s*([\d.]+)\s*MT/i);
  // Ballast-condition counterparts of the above (same email layout, "BALLAST" row).
  const ecoBallast = up.match(/ECO\s+SPEED[\s\S]*?BALLAST\s*:\s*ABOUT\s*([\d.]+)\s*KNOTS[\s\S]*?ON\s*ABOUT\s*([\d.]+)\s*MT/i);
  const fullBallast = up.match(/SERVICE\s+SPEED[\s\S]*?BALLAST\s*:\s*ABOUT\s*([\d.]+)\s*KNOTS[\s\S]*?ON\s*ABOUT\s*([\d.]+)\s*MT/i);

  const ecoSpeed = parseNumberToken(eco?.[1]);
  const ecoFo = parseNumberToken(eco?.[2]);
  const ecoMgo = parseNumberToken(eco?.[3]);
  const fullSpeed = parseNumberToken(full?.[1]);
  const fullFo = parseNumberToken(full?.[2]);
  const fullMgo = parseNumberToken(full?.[3]);
  const ecoSpeedBallast = parseNumberToken(ecoBallast?.[1]);
  const ecoFoBallast = parseNumberToken(ecoBallast?.[2]);
  const fullSpeedBallast = parseNumberToken(fullBallast?.[1]);
  const fullFoBallast = parseNumberToken(fullBallast?.[2]);

  // Engine limits & constraints — "LABEL: MIN - MAX" style rows.
  const range = (label: string): [string?, string?] => {
    const m = up.match(new RegExp(`${label}\\s*(?:RANGE)?\\s*:\\s*([\\d.,]+)\\s*(?:-|TO|~)\\s*([\\d.,]+)`, 'i'));
    return m ? [m[1].replace(/,/g, ''), m[2].replace(/,/g, '')] : [undefined, undefined];
  };
  const [minRpm, maxRpm] = range('RPM');
  if (minRpm) fields.minRpm = minRpm;
  if (maxRpm) fields.maxRpm = maxRpm;
  const [minMcr, maxMcr] = range('MCR');
  if (minMcr) fields.minMcr = minMcr;
  if (maxMcr) fields.maxMcr = maxMcr;
  const [minSpeedLim, maxSpeedLim] = range('SPEED\\s*RANGE');
  if (minSpeedLim) fields.minSpeed = minSpeedLim;
  if (maxSpeedLim) fields.maxSpeed = maxSpeedLim;
  const [criticalRpmMin, criticalRpmMax] = range('CRITICAL\\s*RPM');
  if (criticalRpmMin) fields.criticalRpmMin = criticalRpmMin;
  if (criticalRpmMax) fields.criticalRpmMax = criticalRpmMax;
  const [blowerBallastMin, blowerBallastMax] = range('BLOWER[^\\n:]*BALLAST');
  if (blowerBallastMin) fields.blowerBallastMin = blowerBallastMin;
  if (blowerBallastMax) fields.blowerBallastMax = blowerBallastMax;
  const [blowerLadenMin, blowerLadenMax] = range('BLOWER[^\\n:]*LADEN');
  if (blowerLadenMin) fields.blowerLadenMin = blowerLadenMin;
  if (blowerLadenMax) fields.blowerLadenMax = blowerLadenMax;

  return {
    fields,
    legFrom: loadPort || undefined,
    legTo: dischPort || undefined,
    ecoSpeed,
    ecoFo,
    ecoMgo,
    fullSpeed,
    fullFo,
    fullMgo,
    ecoSpeedBallast,
    ecoFoBallast,
    fullSpeedBallast,
    fullFoBallast,
  };
}

/**
 * Overlay the shared per-voyage overrides (Market Factors + Weather Safety
 * Limits) onto a freshly-built view, so edits made on the Limits & Constraints
 * page are reflected here.
 */
function applyShared(view: VoyageView, voyageId: string | undefined): VoyageView {
  const shared = loadVoyageShared(voyageId);
  if (!shared) return view;
  const legs = shared.legSpeedProfiles?.length
    ? view.legs.map((leg, idx) => {
        const sharedLeg = shared.legSpeedProfiles?.[idx];
        if (!sharedLeg?.speedCons?.length) return leg;
        const rows = sharedLeg.speedCons.map((row) => ({ ...row }));
        const hasDefault = rows.some((row) => !!row.isDefault);
        return {
          ...leg,
          speedCons: rows.map((row, rowIdx) => ({
            ...row,
            isDefault: hasDefault ? !!row.isDefault : rowIdx === 0,
          })),
        };
      })
    : view.legs;
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
    legs,
  };
}

export function VoyageDetailsPage({ mode = 'edit' }: VoyageDetailsPageProps = {}) {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const isCreate = mode === 'create';
  const navigate = useNavigate();
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
  const [emailPasteOpen, setEmailPasteOpen] = useState(isCreate);
  const [emailPasteText, setEmailPasteText] = useState('');
  const [emailPasteMsg, setEmailPasteMsg] = useState('');
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
    setEmailPasteOpen(isCreate);
    setEmailPasteText('');
    setEmailPasteMsg('');
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

  const applyEmailPaste = () => {
    const body = emailPasteText.trim();
    if (!body) {
      setEmailPasteMsg('Paste client email text first, then click Apply.');
      return;
    }

    const draft = parseClientEmailDraft(body);
    const nextFields = Object.entries(draft.fields).filter(([, v]) => typeof v === 'string' && v.trim().length > 0);

    setView((prev) => {
      const next: VoyageView = { ...prev, ...draft.fields };
      const legs = prev.legs.map((leg) => ({
        ...leg,
        speedCons: leg.speedCons.map((row) => ({ ...row })),
      }));

      if (legs.length > 0) {
        const firstLeg = { ...legs[0] };
        if (draft.legFrom) firstLeg.from = draft.legFrom;
        if (draft.legTo) firstLeg.to = draft.legTo;
        if (firstLeg.from && firstLeg.to) firstLeg.name = `${firstLeg.from} -> ${firstLeg.to}`;

        const ecoRow = firstLeg.speedCons.find((r) => r.description.toUpperCase() === 'ECO');
        const fullRow = firstLeg.speedCons.find((r) => r.description.toUpperCase() === 'FULL');

        if (draft.ecoSpeed && ecoRow) {
          ecoRow.speed = draft.ecoSpeed.toFixed(2);
          firstLeg.cpAboutSpeed = draft.ecoSpeed.toFixed(2);
        }
        if (draft.ecoFo && ecoRow) ecoRow.dailyCons1 = draft.ecoFo.toFixed(2);
        if (draft.ecoMgo && ecoRow) ecoRow.dailyCons2 = draft.ecoMgo.toFixed(2);
        if (draft.fullSpeed && fullRow) fullRow.speed = draft.fullSpeed.toFixed(2);
        if (draft.fullFo && fullRow) fullRow.dailyCons1 = draft.fullFo.toFixed(2);
        if (draft.fullMgo && fullRow) fullRow.dailyCons2 = draft.fullMgo.toFixed(2);

        legs[0] = firstLeg;
      }

      next.legs = legs;

      // Additionally fill the vessel-level Engine Limits / Speed & Cons profile
      // (Vessel Profile tab) from the same pasted email, updating only the first
      // ECO-slot and second FULL-slot row of each load condition so any extra
      // custom rows already on the profile are left untouched.
      const upsertEngineRow = (
        rows: import('./voyage/types').EngineSpeedConsRow[],
        condition: 'Ballast' | 'Laden',
        slot: 0 | 1,
        speed?: number,
        consME?: number,
      ) => {
        if (speed == null && consME == null) return rows;
        const conditionIdx = rows.reduce<number[]>((acc, row, idx) => {
          if (row.condition === condition) acc.push(idx);
          return acc;
        }, []);
        const targetIdx = conditionIdx[slot];
        if (targetIdx != null) {
          return rows.map((row, idx) =>
            idx === targetIdx
              ? {
                  ...row,
                  speed: speed != null ? speed.toFixed(1) : row.speed,
                  consME: consME != null ? consME.toFixed(1) : row.consME,
                }
              : row,
          );
        }
        return [
          ...rows,
          {
            condition,
            speed: speed != null ? speed.toFixed(1) : '',
            consME: consME != null ? consME.toFixed(1) : '',
            consAE: '',
            rpm: '',
            mcrPercent: '',
            powerKw: '',
            eplLimit: '',
          },
        ];
      };
      let engineSpeedCons = prev.engineSpeedCons.map((row) => ({ ...row }));
      engineSpeedCons = upsertEngineRow(engineSpeedCons, 'Laden', 0, draft.ecoSpeed, draft.ecoFo);
      engineSpeedCons = upsertEngineRow(engineSpeedCons, 'Laden', 1, draft.fullSpeed, draft.fullFo);
      engineSpeedCons = upsertEngineRow(engineSpeedCons, 'Ballast', 0, draft.ecoSpeedBallast, draft.ecoFoBallast);
      engineSpeedCons = upsertEngineRow(engineSpeedCons, 'Ballast', 1, draft.fullSpeedBallast, draft.fullFoBallast);
      next.engineSpeedCons = engineSpeedCons;

      return next;
    });

    const speedApplied = draft.ecoSpeed || draft.fullSpeed || draft.ecoFo || draft.fullFo ? 1 : 0;
    const enginePerfApplied =
      draft.ecoSpeedBallast || draft.fullSpeedBallast || draft.ecoFoBallast || draft.fullFoBallast ? 1 : 0;
    const routeApplied = draft.legFrom || draft.legTo ? 1 : 0;
    const totalApplied = nextFields.length + speedApplied + enginePerfApplied + routeApplied;
    setEmailPasteMsg(
      totalApplied > 0
        ? `Applied ${totalApplied} matching field(s) from pasted client email.`
        : 'No matching fields found in pasted email text.',
    );
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
    let targetVoyageId = selectedId;
    if (isCreate) {
      const firstLeg = view.legs[0];
      const saved = upsertCreatedVoyage({
        vessel: view.vesselName.trim() || 'New Vessel',
        imo: view.imo.trim(),
        vesselType: view.vesselType,
        flag: view.flag,
        dwt: view.summerDeadweight,
        built: 0,
        loa: view.loa,
        beam: view.beam,
        enginePower: view.meModel,
        client: view.client,
        clientEmail: view.clientEmailList.split(',')[0]?.trim() ?? '',
        price: parseAmount(view.price),
        pricingBasis: view.pricingBasis || 'Per Day',
        service: view.serviceType || 'PMO',
        status: view.status || 'At Sea',
        portFrom: firstLeg?.from ?? '',
        portTo: firstLeg?.to ?? '',
        eta: firstLeg?.etd ?? '',
        etdDisplay: firstLeg?.etd ?? '',
        routeRef: '',
        cpSpeed: parseAmount(firstLeg?.cpAboutSpeed),
        cpCons: parseAmount(firstLeg?.speedCons?.[0]?.dailyCons1),
        instSpeed: parseAmount(firstLeg?.cpAboutSpeed),
        instCons: parseAmount(firstLeg?.speedCons?.[0]?.dailyCons1),
        costPerDay: parseAmount(view.hireRate),
        foCost: parseAmount(view.foPrice),
        goCost: parseAmount(view.goPrice),
        euaCost: parseAmount(view.euaPrice),
        pic: view.pic || 'You',
        open: 'OPEN',
        health: 78,
        seed: Date.now() % 10_000,
      });
      targetVoyageId = saved.id;
      writeSelectedVoyageId(saved.id);
    }

    // Mirror the shared Market Factors + Weather Safety Limits so the Limits &
    // Constraints page reflects these edits.
    if (targetVoyageId) {
      mergeVoyageShared(targetVoyageId, {
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
        legSpeedProfiles: view.legs.map((leg) => ({
          legNo: leg.no,
          legName: leg.name,
          status: leg.status,
          speedCons: leg.speedCons.map((row, idx) => ({
            ...row,
            isDefault: leg.speedCons.some((speedRow) => !!speedRow.isDefault) ? !!row.isDefault : idx === 0,
          })),
        })),
      });
    }
    editSnapshotRef.current = null;
    setAllEditing(false);
    setSkipSummary(false);
    if (targetVoyageId && isCreate) {
      navigate(`/voyage?voyage=${encodeURIComponent(targetVoyageId)}`);
    }
  };

  const handleDiscard = () => {
    const seeded = buildEmptyView();
    setView(seeded);
    setEmailPasteOpen(true);
    setEmailPasteText('');
    setEmailPasteMsg('');
    setEditing(Object.fromEntries(CARD_IDS.map((id) => [id, true])));
    setSkipSummary(true);
    setOpenSection('order');
    editSnapshotRef.current = seeded;
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
    { id: 'legs', label: t('legDetails', 'CP & Leg Details'), icon: 'fa-route' },
    { id: 'voyageNotes', label: t('notes', 'Notes'), icon: 'fa-note-sticky' },
  ];

  if (!selectedVoyage && !isCreate) {
    return <NoVesselSelected />;
  }

  const anyEditing = Object.values(editing).some(Boolean);

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
          <button type="button" className={`fv-voyage__btn${emailPasteOpen ? ' fv-voyage__btn--primary' : ''}`} onClick={() => setEmailPasteOpen((v) => !v)}>
            <i className="fas fa-paste" aria-hidden="true" /> {emailPasteOpen ? 'Hide Email Paste' : 'Paste Client Email'}
          </button>
          <button type="button" className={`fv-voyage__btn${anyEditing ? ' fv-voyage__btn--active' : ''}`} onClick={() => setAllEditing(true)}>
            <i className="fas fa-pen" aria-hidden="true" /> {t('editVoyage', 'Edit Voyage')}
          </button>
          <button
            type="button"
            className="fv-voyage__btn fv-voyage__btn--primary"
            onClick={handleSave}
          >
            <i className="fas fa-save" aria-hidden="true" /> {t('saveVoyage', 'Save Voyage')}
          </button>
          {isCreate && (
            <button
              type="button"
              className="fv-voyage__btn"
              onClick={handleDiscard}
            >
              <i className="fas fa-rotate-left" aria-hidden="true" /> {t('discard', 'Discard')}
            </button>
          )}
          <button type="button" className="fv-voyage__btn">
            <i className="fas fa-clone" aria-hidden="true" /> {t('cloneVoyage', 'Clone Voyage')}
          </button>
          <button type="button" className="fv-voyage__btn fv-voyage__btn--danger">
            <i className="fas fa-box-archive" aria-hidden="true" /> {t('archive', 'Archive')}
          </button>
        </div>
      </header>

      {emailPasteOpen && (
        <section className="fv-pastebox fv-voyage__pastebox">
          <div className="fv-pastebox__head">
            <h3>Paste Client Email</h3>
            <p>Paste client email/fixture text. Matching Performance fields are auto-filled.</p>
          </div>
          <textarea
            className="fv-pastebox__input"
            value={emailPasteText}
            onChange={(e) => setEmailPasteText(e.target.value)}
            placeholder="Paste client email details here..."
          />
          <div className="fv-pastebox__actions">
            <button type="button" className="fv-voyage__btn fv-voyage__btn--primary" onClick={applyEmailPaste}>
              <i className="fas fa-wand-magic-sparkles" aria-hidden="true" /> Apply to Performance
            </button>
            <button
              type="button"
              className="fv-voyage__btn"
              onClick={() => {
                setEmailPasteText('');
                setEmailPasteMsg('');
              }}
            >
              <i className="fas fa-eraser" aria-hidden="true" /> Clear
            </button>
            {emailPasteMsg && <span className="fv-pastebox__msg">{emailPasteMsg}</span>}
          </div>
        </section>
      )}

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
          title={t('orderClientInformation', 'ORDER & ACCOUNT INFORMATION')}
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
    </div>
  );
}
