import { Fragment, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { emptyLeg, normalizeLegs } from './buildView';
import { Card, Cell, Field, BoolField } from './primitives';
import {
  FUEL_TYPE_OPTIONS,
  LEG_STATUS_OPTIONS,
  LEG_VOYAGE_TYPE_OPTIONS,
  CP_CURRENTS_OPTIONS,
  CP_GOOD_WEATHER_OPTIONS,
  CP_ALLOWABLE_FUEL_METHOD_OPTIONS,
  type LegRow,
  type SpeedConsRow,
  type SubLeg,
  type VoyageView,
} from './types';

interface Props {
  view: VoyageView;
  setView: Dispatch<SetStateAction<VoyageView>>;
  editing: boolean;
  onToggleEdit: () => void;
  title: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

/** Maximum number of (top-level) legs allowed in a single voyage. */
const MAX_LEGS = 4;

/** A selectable sub-leg item in the merge / split dialog. */
interface SegItem {
  legIdx: number;
  /** null = the leg itself is the segment (it has no sub-legs). */
  subIdx: number | null;
  type: string;
  from: string;
  to: string;
  etd: string;
  autoRoute: boolean;
  cpWinds: string;
  cpDss: string;
  cpSwh: string;
  cpMinHours: string;
  cpCurrents: string;
  cpGoodWeatherSelection: string;
}

/**
 * Merge / split engine. Moves each chosen sub-leg into a leg of its target
 * type — appending to an existing same-type leg, or creating a new leg when
 * no leg of that type exists. Source sub-legs (and emptied legs) are removed.
 */
function computeMergeSplit(legs: LegRow[], items: SegItem[], checks: boolean[], targets: string[]): LegRow[] {
  const chosen = items
    .map((it, i) => ({ it, checked: checks[i], target: targets[i] }))
    .filter((c) => c.checked);
  if (!chosen.length) return legs;

  let work: LegRow[] = legs.map((l) => ({
    ...l,
    subLegs: l.subLegs.map((s) => ({ ...s })),
    speedCons: l.speedCons.map((r) => ({ ...r })),
  }));

  const removeSubByLeg = new Map<number, Set<number>>();
  const removeWholeLeg = new Set<number>();
  const moving: { seg: SubLeg; target: string }[] = [];

  chosen.forEach(({ it, target }) => {
    moving.push({
      seg: {
        type: target,
        from: it.from,
        to: it.to,
        etd: it.etd,
        autoRoute: it.autoRoute,
        cpWinds: it.cpWinds,
        cpDss: it.cpDss,
        cpSwh: it.cpSwh,
        cpMinHours: it.cpMinHours,
        cpCurrents: it.cpCurrents,
        cpGoodWeatherSelection: it.cpGoodWeatherSelection,
      },
      target,
    });
    if (it.subIdx == null) {
      removeWholeLeg.add(it.legIdx);
    } else {
      if (!removeSubByLeg.has(it.legIdx)) removeSubByLeg.set(it.legIdx, new Set());
      removeSubByLeg.get(it.legIdx)!.add(it.subIdx);
    }
  });

  // Strip chosen sub-legs from their source legs.
  work = work.map((l, idx) => {
    const rem = removeSubByLeg.get(idx);
    return rem ? { ...l, subLegs: l.subLegs.filter((_, si) => !rem.has(si)) } : l;
  });

  // Drop whole-leg sources and legs that lost all their sub-legs.
  work = work.filter((l, idx) => {
    if (removeWholeLeg.has(idx)) return false;
    if (legs[idx].subLegs.length > 0 && l.subLegs.length === 0) return false;
    return true;
  });

  // Place each moving sub-leg into a leg of its target type (create if missing).
  moving.forEach(({ seg, target }) => {
    const t = work.find((l) => l.type === target);
    if (t) {
      t.subLegs = t.subLegs.length
        ? [...t.subLegs, seg]
        : [
            {
              type: t.type,
              from: t.from,
              to: t.to,
              etd: t.etd,
              autoRoute: t.autoRoute,
              cpWinds: t.cpWinds,
              cpDss: t.cpDss,
              cpSwh: t.cpSwh,
              cpMinHours: t.cpMinHours,
              cpCurrents: t.cpCurrents,
              cpGoodWeatherSelection: t.cpGoodWeatherSelection,
            },
            seg,
          ];
    } else {
      work.push({
        ...emptyLeg('LEG-NEW'),
        type: target,
        status: 'Planning',
        from: seg.from,
        to: seg.to,
        etd: seg.etd,
        autoRoute: seg.autoRoute,
        name: `${seg.from} → ${seg.to}`,
        subLegs: [],
      });
    }
  });

  return work;
}

/**
 * 3. CP & Leg Details — a row of leg boxes (max 4). Each box has a checkbox
 * for multi-select (merge / split / delete). Clicking a box expands that
 * leg's full CP / leg editor below the boxes.
 */
export function LegsSection({ view, setView, editing, onToggleEdit, title, collapsed, onToggleCollapse }: Props) {
  const [selected, setSelected] = useState<number | null>(0);
  const [checked, setChecked] = useState<number[]>([]);
  // Sub-legs whose CP / good-weather criteria editor is expanded (key: `${legIdx}-${subIdx}`).
  const [openCriteria, setOpenCriteria] = useState<Set<string>>(new Set());
  const toggleCriteria = (legIdx: number, subIdx: number | string) =>
    setOpenCriteria((prev) => {
      const key = `${legIdx}-${subIdx}`;
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  // Modal for choosing which sub-legs to merge / split and into which type.
  const [modal, setModal] = useState<{ mode: 'merge' | 'split'; items: SegItem[] } | null>(null);
  const [segChecked, setSegChecked] = useState<boolean[]>([]);
  const [segTarget, setSegTarget] = useState<string[]>([]);

  /** Apply a legs mutation and re-normalize (chaining + numbering). */
  const updateLegs = (fn: (legs: LegRow[]) => LegRow[]) =>
    setView((prev) => ({ ...prev, legs: normalizeLegs(fn(prev.legs)) }));

  const setLeg = <K extends keyof LegRow>(i: number, key: K, value: LegRow[K]) =>
    updateLegs((legs) => legs.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)));

  const setLegSpeed = (legIdx: number, rowIdx: number, key: keyof SpeedConsRow, value: string) =>
    updateLegs((legs) =>
      legs.map((leg, li) =>
        li === legIdx
          ? { ...leg, speedCons: leg.speedCons.map((row, ri) => (ri === rowIdx ? { ...row, [key]: value } : row)) }
          : leg,
      ),
    );

  const addLegSpeed = (legIdx: number) =>
    updateLegs((legs) =>
      legs.map((leg, li) =>
        li === legIdx
          ? {
              ...leg,
              speedCons: [
                ...leg.speedCons,
                { description: 'CUSTOM', speed: '', fuelType1: 'VLSFO', dailyCons1: '', fuelType2: 'LSMGO', dailyCons2: '', fuelType3: '', dailyCons3: '' },
              ],
            }
          : leg,
      ),
    );

  // Sub-legs (intermediate ports within a main leg).
  const addSubLeg = (legIdx: number) =>
    updateLegs((legs) =>
      legs.map((leg, li) => {
        if (li !== legIdx) return leg;
        const lastTo = leg.subLegs.length ? leg.subLegs[leg.subLegs.length - 1].to : leg.from;
        const newSub: SubLeg = {
          type: leg.type || 'Laden',
          from: lastTo,
          to: leg.to,
          etd: leg.etd,
          autoRoute: true,
          // Inherit the parent leg's CP / good-weather criteria as a starting point.
          cpWinds: leg.cpWinds,
          cpDss: leg.cpDss,
          cpSwh: leg.cpSwh,
          cpMinHours: leg.cpMinHours,
          cpCurrents: leg.cpCurrents,
          cpGoodWeatherSelection: leg.cpGoodWeatherSelection,
        };
        return { ...leg, subLegs: [...leg.subLegs, newSub] };
      }),
    );

  const setSubLeg = <K extends keyof SubLeg>(legIdx: number, subIdx: number, key: K, value: SubLeg[K]) =>
    updateLegs((legs) =>
      legs.map((leg, li) =>
        li === legIdx
          ? { ...leg, subLegs: leg.subLegs.map((s, si) => (si === subIdx ? { ...s, [key]: value } : s)) }
          : leg,
      ),
    );

  // Toggle "Use Default CP Criteria" for a sub-leg. When turned on, copy the
  // parent leg's CP / good-weather criteria into the sub-leg.
  const setSubLegUseDefaultCp = (legIdx: number, subIdx: number, on: boolean) =>
    updateLegs((legs) =>
      legs.map((leg, li) =>
        li === legIdx
          ? {
              ...leg,
              subLegs: leg.subLegs.map((s, si) =>
                si === subIdx
                  ? on
                    ? {
                        ...s,
                        useDefaultCp: true,
                        cpWinds: leg.cpWinds,
                        cpDss: leg.cpDss,
                        cpSwh: leg.cpSwh,
                        cpMinHours: leg.cpMinHours,
                        cpCurrents: leg.cpCurrents,
                        cpGoodWeatherSelection: leg.cpGoodWeatherSelection,
                      }
                    : { ...s, useDefaultCp: false }
                  : s,
              ),
            }
          : leg,
      ),
    );

  const removeSubLeg = (legIdx: number, subIdx: number) =>
    updateLegs((legs) =>
      legs.map((leg, li) =>
        li === legIdx ? { ...leg, subLegs: leg.subLegs.filter((_, si) => si !== subIdx) } : leg,
      ),
    );

  const copyLeg = (i: number) =>
    updateLegs((legs) =>
      legs.length >= MAX_LEGS
        ? legs
        : [
            ...legs,
            {
              ...legs[i],
              name: `${legs[i].name} (Copy)`,
              speedCons: legs[i].speedCons.map((row) => ({ ...row })),
              subLegs: legs[i].subLegs.map((s) => ({ ...s })),
            },
          ],
    );

  const deleteLegAt = (i: number) => {
    updateLegs((legs) => (legs.length > 1 ? legs.filter((_, idx) => idx !== i) : legs));
    setSelected(null);
    setChecked([]);
  };

  const addLeg = () =>
    updateLegs((legs) => (legs.length >= MAX_LEGS ? legs : [...legs, emptyLeg(`LEG-${legs.length + 1}`)]));

  // ---- Multi-select operations -------------------------------------------
  const toggleCheck = (i: number) =>
    setChecked((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));

  /** Flatten a leg into selectable sub-leg items (sub-legs or the leg itself). */
  const legItems = (legIdx: number): SegItem[] => {
    const leg = view.legs[legIdx];
    return leg.subLegs.length
      ? leg.subLegs.map((s, si) => ({
          legIdx,
          subIdx: si,
          type: s.type,
          from: s.from,
          to: s.to,
          etd: s.etd,
          autoRoute: s.autoRoute,
          cpWinds: s.cpWinds,
          cpDss: s.cpDss,
          cpSwh: s.cpSwh,
          cpMinHours: s.cpMinHours,
          cpCurrents: s.cpCurrents,
          cpGoodWeatherSelection: s.cpGoodWeatherSelection,
        }))
      : [
          {
            legIdx,
            subIdx: null,
            type: leg.type,
            from: leg.from,
            to: leg.to,
            etd: leg.etd,
            autoRoute: leg.autoRoute,
            cpWinds: leg.cpWinds,
            cpDss: leg.cpDss,
            cpSwh: leg.cpSwh,
            cpMinHours: leg.cpMinHours,
            cpCurrents: leg.cpCurrents,
            cpGoodWeatherSelection: leg.cpGoodWeatherSelection,
          },
        ];
  };

  const closeModal = () => {
    setModal(null);
    setSegChecked([]);
    setSegTarget([]);
    setChecked([]);
  };

  const toggleSeg = (i: number) =>
    setSegChecked((prev) => prev.map((c, idx) => (idx === i ? !c : c)));

  const setSegTargetAt = (i: number, value: string) =>
    setSegTarget((prev) => prev.map((t, idx) => (idx === i ? value : t)));

  const openDialog = (mode: 'merge' | 'split', items: SegItem[]) => {
    setModal({ mode, items });
    setSegChecked(items.map(() => true));
    setSegTarget(items.map((it) => it.type || LEG_VOYAGE_TYPE_OPTIONS[0]));
  };

  const openMerge = () => {
    if (checked.length < 2) return;
    const idxs = [...checked].sort((a, b) => a - b);
    openDialog('merge', idxs.flatMap(legItems));
  };

  const openSplit = () => {
    if (checked.length !== 1) return;
    const idx = checked[0];
    if (view.legs[idx].subLegs.length < 2) return;
    openDialog('split', legItems(idx));
  };

  const confirmDialog = () => {
    if (!modal) return;
    const next = computeMergeSplit(view.legs, modal.items, segChecked, segTarget);
    if (next.length > MAX_LEGS) return;
    updateLegs(() => next);
    setSelected(null);
    closeModal();
  };

  const deleteChecked = () => {
    if (!checked.length) return;
    updateLegs((legs) => {
      const remaining = legs.filter((_, x) => !checked.includes(x));
      return remaining.length ? remaining : legs;
    });
    setChecked([]);
    setSelected(null);
  };

  const sel = selected != null && selected < view.legs.length ? selected : null;
  const atMax = view.legs.length >= MAX_LEGS;
  const canMerge = checked.length >= 2;
  const canSplit =
    checked.length === 1 &&
    view.legs[checked[0]]?.subLegs.length >= 2 &&
    view.legs.length < MAX_LEGS;
  const canDelete = checked.length >= 1 && checked.length < view.legs.length;

  return (
    <Card id="legs" title={title} editing={editing} onToggleEdit={onToggleEdit} collapsed={collapsed} onToggleCollapse={onToggleCollapse}>
      <div className="fv-voyage__dense">
        <div className="fv-voyage__leg-actions">
          <button type="button" className="fv-voyage__btn" onClick={addLeg} disabled={atMax}>
            <i className="fas fa-plus" aria-hidden="true" /> Add New Leg
          </button>
          <button type="button" className="fv-voyage__btn" onClick={openMerge} disabled={!canMerge}>
            <i className="fas fa-compress-arrows-alt" aria-hidden="true" /> Merge Legs
          </button>
          <button type="button" className="fv-voyage__btn" onClick={openSplit} disabled={!canSplit}>
            <i className="fas fa-code-branch" aria-hidden="true" /> Split Legs
          </button>
          <button type="button" className="fv-voyage__btn fv-voyage__btn--danger" onClick={deleteChecked} disabled={!canDelete}>
            <i className="fas fa-trash" aria-hidden="true" /> Delete Selected
          </button>
        </div>

        {/* Leg boxes (max 4). Checkbox = multi-select; click body = expand. */}
        <div className="fv-voyage__leg-boxes">
          {view.legs.map((leg, i) => (
            <div
              key={leg.no}
              role="button"
              tabIndex={0}
              className={`fv-voyage__leg-box${sel === i ? ' fv-voyage__leg-box--active' : ''}`}
              onClick={() => setSelected(sel === i ? null : i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelected(sel === i ? null : i);
                }
              }}
            >
              <div className="fv-voyage__leg-box-head">
                <input
                  type="checkbox"
                  className="fv-voyage__leg-check"
                  checked={checked.includes(i)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleCheck(i)}
                  aria-label={`Select LEG ${i + 1}`}
                />
                <span
                  className={`fv-voyage__leg-status fv-voyage__leg-status--${leg.status.toLowerCase()}`}
                  aria-hidden="true"
                />
                <span className="fv-voyage__leg-box-name">LEG {i + 1}</span>
                <i
                  className={`fas ${sel === i ? 'fa-chevron-up' : 'fa-chevron-down'} fv-voyage__leg-box-caret`}
                  aria-hidden="true"
                />
              </div>
              <div className="fv-voyage__leg-box-route">
                ({leg.from || '—'} - {leg.to || '—'}) {leg.type}
                {leg.subLegs.length > 0 && (
                  <span className="fv-voyage__leg-box-sub"> · {leg.subLegs.length} ports</span>
                )}
              </div>
              <div className="fv-voyage__leg-box-etd">ETD: {leg.etd || '—'}</div>
              <div className="fv-voyage__leg-box-status">Status: {leg.status}</div>
            </div>
          ))}
        </div>

        {/* Expanded leg detail */}
        {sel != null && view.legs[sel] && (() => {
          const leg = view.legs[sel];
          const i = sel;
          const hasSub = leg.subLegs.length > 0;
          const tz = leg.etdLocalTime ? 'Local Time' : 'UTC';
          return (
            <section className="fv-voyage__leg">
              <header className="fv-voyage__leg-head">
                <h4 className="fv-voyage__leg-title">LEG {i + 1}</h4>
                {editing && (
                  <div className="fv-voyage__leg-toolbar">
                    <button type="button" className="fv-voyage__btn" onClick={() => copyLeg(i)} disabled={atMax}>
                      <i className="fas fa-copy" aria-hidden="true" /> Copy Leg
                    </button>
                    <button type="button" className="fv-voyage__btn fv-voyage__btn--danger" onClick={() => deleteLegAt(i)}>
                      <i className="fas fa-trash" aria-hidden="true" /> Delete
                    </button>
                  </div>
                )}
              </header>

              <div className="fv-voyage__cols fv-voyage__cols--6">
                <Field label="Leg Name" value={leg.name} editing={editing} onChange={(x) => setLeg(i, 'name', x)} />
                <Field label="Voyage Type" value={leg.type} editing={editing} onChange={(x) => setLeg(i, 'type', x)} options={LEG_VOYAGE_TYPE_OPTIONS} />
                <Field label="Status" value={leg.status} editing={editing} onChange={(x) => setLeg(i, 'status', x)} options={LEG_STATUS_OPTIONS} />
                <Field
                  label={i === 0 ? 'Port From' : 'Port From (from prev leg)'}
                  value={leg.from}
                  editing={editing && i === 0}
                  onChange={(x) => setLeg(i, 'from', x)}
                />
                <Field
                  label={hasSub ? 'Port To (from sub-legs)' : 'Port To'}
                  value={leg.to}
                  editing={editing && !hasSub}
                  onChange={(x) => setLeg(i, 'to', x)}
                />
                <Field label="ETD" value={leg.etd} editing={editing} onChange={(x) => setLeg(i, 'etd', x)} type="datetime" />
                <BoolField label="Input ETD in Local Time" value={leg.etdLocalTime} editing={editing} onChange={(b) => setLeg(i, 'etdLocalTime', b)} />
                <div className="fv-voyage__info">
                  <span className="fv-voyage__info-label">ETD Time Zone</span>
                  <span className={`fv-voyage__tz-badge fv-voyage__tz-badge--${leg.etdLocalTime ? 'local' : 'utc'}`}>
                    {tz}
                  </span>
                </div>
                <Field label="Draft (m)" value={leg.draft} editing={editing} onChange={(x) => setLeg(i, 'draft', x)} type="number" />
                <Field label="Displacement (MT)" value={leg.displacement} editing={editing} onChange={(x) => setLeg(i, 'displacement', x)} type="number" />
                <Field label="GM (m)" value={leg.gm} editing={editing} onChange={(x) => setLeg(i, 'gm', x)} type="number" />
                <Field label="Roll Period (s)" value={leg.rollPeriod} editing={editing} onChange={(x) => setLeg(i, 'rollPeriod', x)} type="number" />
                <BoolField label="Auto Route" value={leg.autoRoute} editing={editing} onChange={(b) => setLeg(i, 'autoRoute', b)} />
              </div>

              <h5 className="fv-voyage__subhead">Weather Safety Limits</h5>
              <div className="fv-voyage__cols fv-voyage__cols--3">
                <Field label="Max Sign Wave Height (m)" value={leg.maxSwh} editing={editing} onChange={(x) => setLeg(i, 'maxSwh', x)} type="number" />
                <Field label="Max Wind Speeds (BF)" value={leg.maxWind} editing={editing} onChange={(x) => setLeg(i, 'maxWind', x)} type="number" />
                <Field label="Max Sea State (DSS)" value={leg.maxSeaState} editing={editing} onChange={(x) => setLeg(i, 'maxSeaState', x)} type="number" />
              </div>

              <h5 className="fv-voyage__subhead">CP Details — Good Weather Details</h5>
              <div className="fv-voyage__cols fv-voyage__cols--5">
                <Field label="Winds (BF)" value={leg.cpWinds} editing={editing} onChange={(x) => setLeg(i, 'cpWinds', x)} />
                <Field label="DSS" value={leg.cpDss} editing={editing} onChange={(x) => setLeg(i, 'cpDss', x)} type="number" />
                <Field label="SWH (m)" value={leg.cpSwh} editing={editing} onChange={(x) => setLeg(i, 'cpSwh', x)} type="number" />
                <Field label="Min Hours (h)" value={leg.cpMinHours} editing={editing} onChange={(x) => setLeg(i, 'cpMinHours', x)} type="number" />
                <Field label="Currents" value={leg.cpCurrents} editing={editing} onChange={(x) => setLeg(i, 'cpCurrents', x)} options={CP_CURRENTS_OPTIONS} />
                <Field label="Allowable Fuel Method" value={leg.cpAllowableFuelMethod} editing={editing} onChange={(x) => setLeg(i, 'cpAllowableFuelMethod', x)} options={CP_ALLOWABLE_FUEL_METHOD_OPTIONS} />
                <Field label="Good Weather Selection" value={leg.cpGoodWeatherSelection} editing={editing} onChange={(x) => setLeg(i, 'cpGoodWeatherSelection', x)} options={CP_GOOD_WEATHER_OPTIONS} />
                <Field label="About Speed (kt)" value={leg.cpAboutSpeed} editing={editing} onChange={(x) => setLeg(i, 'cpAboutSpeed', x)} type="number" />
                <Field label="Time Gain (h)" value={leg.cpTimeGain} editing={editing} onChange={(x) => setLeg(i, 'cpTimeGain', x)} type="number" />
                <Field label="Time Loss (h)" value={leg.cpTimeLoss} editing={editing} onChange={(x) => setLeg(i, 'cpTimeLoss', x)} type="number" />
              </div>

              <h5 className="fv-voyage__subhead">Speed &amp; Cons</h5>
              <div className="fv-voyage__table-scroll">
                <table className="fv-voyage__dtable fv-voyage__dtable--wide">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Speed (kt)</th>
                      <th>Fuel Type</th>
                      <th>Daily Cons (mt/day)</th>
                      <th>Fuel Type (ECA)</th>
                      <th>Daily Cons (mt/day)</th>
                      <th>Fuel Type (Alt)</th>
                      <th>Daily Cons (mt/day)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leg.speedCons.map((row, ri) => (
                      <tr key={ri}>
                        <td><Cell editing={editing} value={row.description} onChange={(x) => setLegSpeed(i, ri, 'description', x)} /></td>
                        <td><Cell editing={editing} value={row.speed} onChange={(x) => setLegSpeed(i, ri, 'speed', x)} type="number" /></td>
                        <td><Cell editing={editing} value={row.fuelType1} onChange={(x) => setLegSpeed(i, ri, 'fuelType1', x)} options={FUEL_TYPE_OPTIONS} /></td>
                        <td><Cell editing={editing} value={row.dailyCons1} onChange={(x) => setLegSpeed(i, ri, 'dailyCons1', x)} type="number" /></td>
                        <td><Cell editing={editing} value={row.fuelType2} onChange={(x) => setLegSpeed(i, ri, 'fuelType2', x)} options={FUEL_TYPE_OPTIONS} /></td>
                        <td><Cell editing={editing} value={row.dailyCons2} onChange={(x) => setLegSpeed(i, ri, 'dailyCons2', x)} type="number" /></td>
                        <td><Cell editing={editing} value={row.fuelType3} onChange={(x) => setLegSpeed(i, ri, 'fuelType3', x)} options={FUEL_TYPE_OPTIONS} /></td>
                        <td><Cell editing={editing} value={row.dailyCons3} onChange={(x) => setLegSpeed(i, ri, 'dailyCons3', x)} type="number" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {editing && (
                <div className="fv-voyage__leg-actions">
                  <button type="button" className="fv-voyage__btn" onClick={() => addLegSpeed(i)}>
                    <i className="fas fa-plus" aria-hidden="true" /> Add More
                  </button>
                </div>
              )}

              <h5 className="fv-voyage__subhead">Sub-Legs / Intermediate Ports</h5>
              <div className="fv-voyage__table-scroll">
                <table className="fv-voyage__dtable">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Type</th>
                      <th>Port From</th>
                      <th>Port To</th>
                      <th>ETD</th>
                      <th>Auto Route</th>
                      <th>Use Default CP Criteria</th>
                      <th>C/P &amp; Good Weather</th>
                      {editing && <th aria-label="Actions" />}
                    </tr>
                  </thead>
                  <tbody>
                    {leg.subLegs.length === 0 ? (
                      (() => {
                        const criteriaOpen = openCriteria.has(`${i}-main`);
                        return (
                          <Fragment>
                            <tr className="fv-voyage__subleg-main-row">
                              <td>1</td>
                              <td>{leg.type || '—'}</td>
                              <td>{leg.from || '—'}</td>
                              <td>{leg.to || '—'}</td>
                              <td>{leg.etd || '—'}</td>
                              <td>
                                <button
                                  type="button"
                                  className={`fv-voyage__toggle${leg.autoRoute ? ' fv-voyage__toggle--on' : ''}`}
                                  disabled
                                  role="switch"
                                  aria-checked={leg.autoRoute}
                                  aria-label="Auto Route"
                                  title="Main leg — edit Auto Route in the leg details above"
                                >
                                  <span className="fv-voyage__toggle-knob" />
                                  <span className="fv-voyage__toggle-text">{leg.autoRoute ? 'On' : 'Off'}</span>
                                </button>
                              </td>
                              <td className="fv-voyage__muted">—</td>
                              <td>
                                <button
                                  type="button"
                                  className="fv-voyage__btn fv-voyage__btn--sm"
                                  onClick={() => toggleCriteria(i, 'main')}
                                  aria-expanded={criteriaOpen}
                                  title="View this leg's C/P & good-weather criteria"
                                >
                                  <i className={`fas ${criteriaOpen ? 'fa-chevron-up' : 'fa-sliders'}`} aria-hidden="true" />{' '}
                                  {criteriaOpen ? 'Hide' : 'Criteria'}
                                </button>
                              </td>
                              {editing && <td />}
                            </tr>
                            {criteriaOpen && (
                              <tr className="fv-voyage__subleg-detail-row">
                                <td colSpan={editing ? 9 : 8}>
                                  <div className="fv-voyage__subleg-detail">
                                    <h6 className="fv-voyage__subhead">
                                      C/P &amp; Good Weather Criteria — {leg.from || '—'} → {leg.to || '—'}
                                    </h6>
                                    <p className="fv-voyage__muted">
                                      This leg has no sub-legs, so it runs directly. Use
                                      &ldquo;Add Port / Sub-Leg&rdquo; below to split it into sub-legs.
                                    </p>
                                    <div className="fv-voyage__cols fv-voyage__cols--3">
                                      <Field label="Winds (BF)" value={leg.cpWinds} editing={false} onChange={() => {}} />
                                      <Field label="DSS" value={leg.cpDss} editing={false} onChange={() => {}} />
                                      <Field label="SWH (m)" value={leg.cpSwh} editing={false} onChange={() => {}} />
                                      <Field label="Min Hours (h)" value={leg.cpMinHours} editing={false} onChange={() => {}} />
                                      <Field label="Currents" value={leg.cpCurrents} editing={false} onChange={() => {}} />
                                      <Field label="Good Weather Selection" value={leg.cpGoodWeatherSelection} editing={false} onChange={() => {}} />
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })()
                    ) : (
                      leg.subLegs.map((s, si) => {
                        const criteriaOpen = openCriteria.has(`${i}-${si}`);
                        return (
                          <Fragment key={si}>
                            <tr>
                              <td>{si + 1}</td>
                              <td><Cell editing={editing} value={s.type} onChange={(x) => setSubLeg(i, si, 'type', x)} options={LEG_VOYAGE_TYPE_OPTIONS} /></td>
                              <td>{s.from || '—'}</td>
                              <td><Cell editing={editing} value={s.to} onChange={(x) => setSubLeg(i, si, 'to', x)} /></td>
                              <td><Cell editing={editing} value={s.etd} onChange={(x) => setSubLeg(i, si, 'etd', x)} type="datetime" /></td>
                              <td>
                                <button
                                  type="button"
                                  className={`fv-voyage__toggle${s.autoRoute ? ' fv-voyage__toggle--on' : ''}`}
                                  onClick={() => editing && setSubLeg(i, si, 'autoRoute', !s.autoRoute)}
                                  disabled={!editing}
                                  role="switch"
                                  aria-checked={s.autoRoute}
                                  aria-label="Auto Route"
                                  title={s.autoRoute ? 'Auto Route ON — optimized route fetched automatically' : 'Auto Route OFF'}
                                >
                                  <span className="fv-voyage__toggle-knob" />
                                  <span className="fv-voyage__toggle-text">{s.autoRoute ? 'On' : 'Off'}</span>
                                </button>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className={`fv-voyage__toggle${s.useDefaultCp ? ' fv-voyage__toggle--on' : ''}`}
                                  onClick={() => editing && setSubLegUseDefaultCp(i, si, !s.useDefaultCp)}
                                  disabled={!editing}
                                  role="switch"
                                  aria-checked={!!s.useDefaultCp}
                                  aria-label="Use Default CP Criteria"
                                  title={s.useDefaultCp ? "Use Default CP Criteria ON — inherits this leg's CP criteria" : 'Use Default CP Criteria OFF'}
                                >
                                  <span className="fv-voyage__toggle-knob" />
                                  <span className="fv-voyage__toggle-text">{s.useDefaultCp ? 'On' : 'Off'}</span>
                                </button>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="fv-voyage__btn fv-voyage__btn--sm"
                                  onClick={() => toggleCriteria(i, si)}
                                  aria-expanded={criteriaOpen}
                                  title="Select C/P & good-weather criteria for this sub-leg"
                                >
                                  <i className={`fas ${criteriaOpen ? 'fa-chevron-up' : 'fa-sliders'}`} aria-hidden="true" />{' '}
                                  {criteriaOpen ? 'Hide' : 'Criteria'}
                                </button>
                              </td>
                              {editing && (
                                <td>
                                  <button type="button" className="fv-voyage__icon-btn" onClick={() => removeSubLeg(i, si)} aria-label="Remove sub-leg">
                                    <i className="fas fa-times" aria-hidden="true" />
                                  </button>
                                </td>
                              )}
                            </tr>
                            {criteriaOpen && (
                              <tr className="fv-voyage__subleg-detail-row">
                                <td colSpan={editing ? 9 : 8}>
                                  <div className="fv-voyage__subleg-detail">
                                    <h6 className="fv-voyage__subhead">
                                      C/P &amp; Good Weather Criteria — {s.from || '—'} → {s.to || '—'}
                                    </h6>
                                    {s.useDefaultCp && (
                                      <p className="fv-voyage__muted">
                                        Using this leg&apos;s default CP criteria. Turn off
                                        &ldquo;Use Default CP Criteria&rdquo; to edit these values.
                                      </p>
                                    )}
                                    <div className="fv-voyage__cols fv-voyage__cols--3">
                                      <Field label="Winds (BF)" value={s.cpWinds} editing={editing && !s.useDefaultCp} onChange={(x) => setSubLeg(i, si, 'cpWinds', x)} />
                                      <Field label="DSS" value={s.cpDss} editing={editing && !s.useDefaultCp} onChange={(x) => setSubLeg(i, si, 'cpDss', x)} type="number" />
                                      <Field label="SWH (m)" value={s.cpSwh} editing={editing && !s.useDefaultCp} onChange={(x) => setSubLeg(i, si, 'cpSwh', x)} type="number" />
                                      <Field label="Min Hours (h)" value={s.cpMinHours} editing={editing && !s.useDefaultCp} onChange={(x) => setSubLeg(i, si, 'cpMinHours', x)} type="number" />
                                      <Field label="Currents" value={s.cpCurrents} editing={editing && !s.useDefaultCp} onChange={(x) => setSubLeg(i, si, 'cpCurrents', x)} options={CP_CURRENTS_OPTIONS} />
                                      <Field
                                        label="Good Weather Selection"
                                        value={s.cpGoodWeatherSelection}
                                        editing={editing && !s.useDefaultCp}
                                        onChange={(x) => setSubLeg(i, si, 'cpGoodWeatherSelection', x)}
                                        options={CP_GOOD_WEATHER_OPTIONS}
                                      />
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {editing && (
                <div className="fv-voyage__leg-actions">
                  <button type="button" className="fv-voyage__btn" onClick={() => addSubLeg(i)}>
                    <i className="fas fa-plus" aria-hidden="true" /> Add Port / Sub-Leg
                  </button>
                </div>
              )}
            </section>
          );
        })()}

        {/* Merge / Split sub-leg selection modal */}
        {modal && (() => {
          const result = computeMergeSplit(view.legs, modal.items, segChecked, segTarget);
          const over = result.length > MAX_LEGS;
          const noneChecked = !segChecked.some(Boolean);
          return (
            <div className="fv-voyage__modal-overlay" role="dialog" aria-modal="true" aria-label={modal.mode === 'merge' ? 'Merge legs' : 'Split leg'}>
              <div className="fv-voyage__modal">
                <header className="fv-voyage__modal-head">
                  <h4 className="fv-voyage__modal-title">
                    {modal.mode === 'merge' ? 'Merge — Choose Sub-Legs & Target' : 'Split — Choose Sub-Legs & Target'}
                  </h4>
                  <button type="button" className="fv-voyage__icon-btn" onClick={closeModal} aria-label="Close">
                    <i className="fas fa-times" aria-hidden="true" />
                  </button>
                </header>
                <p className="fv-voyage__modal-text">
                  Select each sub-leg and the leg type to {modal.mode} it into. If no leg of that type
                  exists, a new leg is created.
                </p>

                <div className="fv-voyage__modal-legs">
                  {modal.items.map((it, si) => (
                    <div key={si} className="fv-voyage__modal-leg fv-voyage__modal-leg--row">
                      <input
                        type="checkbox"
                        checked={!!segChecked[si]}
                        onChange={() => toggleSeg(si)}
                        aria-label={`Select sub-leg ${si + 1}`}
                      />
                      <span className="fv-voyage__modal-leg-route">({it.from || '—'} - {it.to || '—'})</span>
                      <span className="fv-voyage__modal-leg-from">{it.type || '—'}</span>
                      <i className="fas fa-arrow-right fv-voyage__modal-arrow" aria-hidden="true" />
                      <select
                        className="fv-voyage__input fv-voyage__modal-select"
                        value={segTarget[si] ?? ''}
                        disabled={!segChecked[si]}
                        onChange={(e) => setSegTargetAt(si, e.target.value)}
                      >
                        {LEG_VOYAGE_TYPE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                <p className={`fv-voyage__modal-note${over ? ' fv-voyage__modal-note--err' : ''}`}>
                  Result: {result.length} legs{over ? ` — exceeds max of ${MAX_LEGS}` : ` (max ${MAX_LEGS})`}.
                </p>

                <footer className="fv-voyage__modal-foot">
                  <button type="button" className="fv-voyage__btn" onClick={closeModal}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="fv-voyage__btn fv-voyage__btn--primary"
                    onClick={confirmDialog}
                    disabled={noneChecked || over}
                  >
                    <i className={`fas ${modal.mode === 'merge' ? 'fa-compress-arrows-alt' : 'fa-code-branch'}`} aria-hidden="true" />{' '}
                    {modal.mode === 'merge' ? 'Merge' : 'Split'}
                  </button>
                </footer>
              </div>
            </div>
          );
        })()}
      </div>
    </Card>
  );
}
