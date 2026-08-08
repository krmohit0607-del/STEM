import { Fragment, useState, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { emptyLeg, normalizeLegs } from './buildView';
import { Card, Cell, Field } from './primitives';
import { searchPortIndex } from '../../data/portIndex';
import {
  FUEL_TYPE_OPTIONS,
  LEG_STATUS_OPTIONS,
  LEG_VOYAGE_TYPE_OPTIONS,
  CP_CURRENTS_OPTIONS,
  CP_GOOD_WEATHER_OPTIONS,
  CP_ALLOWABLE_FUEL_METHOD_OPTIONS,
  CP_ABOUT_SPEED_UNIT_OPTIONS,
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
  cpAllowableFuelMethod: string;
  cpGoodWeatherSelection: string;
  cpAboutSpeedUnit: string;
  cpAboutSpeed: string;
  cpTimeGain: string;
  cpTimeLoss: string;
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
        status: 'Planning',
        useDefaultCp: true,
        from: it.from,
        to: it.to,
        etd: it.etd,
        autoRoute: it.autoRoute,
        cpWinds: it.cpWinds,
        cpDss: it.cpDss,
        cpSwh: it.cpSwh,
        cpMinHours: it.cpMinHours,
        cpCurrents: it.cpCurrents,
        cpAllowableFuelMethod: it.cpAllowableFuelMethod,
        cpGoodWeatherSelection: it.cpGoodWeatherSelection,
        cpAboutSpeedUnit: it.cpAboutSpeedUnit,
        cpAboutSpeed: it.cpAboutSpeed,
        cpTimeGain: it.cpTimeGain,
        cpTimeLoss: it.cpTimeLoss,
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
              status: 'Planning',
              useDefaultCp: true,
              from: t.from,
              to: t.to,
              etd: t.etd,
              autoRoute: t.autoRoute,
              cpWinds: t.cpWinds,
              cpDss: t.cpDss,
              cpSwh: t.cpSwh,
              cpMinHours: t.cpMinHours,
              cpCurrents: t.cpCurrents,
              cpAllowableFuelMethod: t.cpAllowableFuelMethod,
              cpGoodWeatherSelection: t.cpGoodWeatherSelection,
              cpAboutSpeedUnit: t.cpAboutSpeedUnit,
              cpAboutSpeed: t.cpAboutSpeed,
              cpTimeGain: t.cpTimeGain,
              cpTimeLoss: t.cpTimeLoss,
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
/** Compute ETD in local time from a UTC ETD string and a "UTC±n" timezone. */
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function applyTzOffset(etdUtc: string, tz: string): string {
  if (!etdUtc || !tz) return '—';
  const tzMatch = tz.match(/UTC([+-]?\d+)/);
  if (!tzMatch) return '—';
  const offset = parseInt(tzMatch[1], 10);
  if (isNaN(offset)) return '—';
  // Try to build a parseable date string from common ETD formats
  const normalised = etdUtc
    .replace(/(\d{2})-([A-Za-z]{3})-(\d{4})\s+(\d{2}:\d{2}).*/, '$2 $1 $3 $4 UTC')
    .replace(/(\d{2})\s+([A-Za-z]{3})\s+(\d{4}),\s+(\d{2}:\d{2}).*/, '$2 $1 $3 $4 UTC');
  const d = new Date(normalised);
  if (isNaN(d.getTime())) return '—';
  d.setUTCHours(d.getUTCHours() + offset);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const mon = MONTHS[d.getUTCMonth()];
  const yr = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day}-${mon}-${yr} ${hh}:${mm} LT`;
}

export function LegsSection({ view, setView, editing, onToggleEdit, title, collapsed, onToggleCollapse }: Props) {
  const [selected, setSelected] = useState<number | null>(0);
  // Sub-legs whose CP / good-weather criteria editor is expanded (key: `${legIdx}-${subIdx}`).
  const [openCriteria, setOpenCriteria] = useState<Set<string>>(new Set());
  const [checkedSubRows, setCheckedSubRows] = useState<Set<string>>(new Set());
  const toggleSubRow = (key: string) =>
    setCheckedSubRows((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
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
                { isDefault: false, description: 'CUSTOM', speed: '', fuelType1: 'VLSFO', dailyCons1: '', fuelType2: 'LSMGO', dailyCons2: '', fuelType3: '', dailyCons3: '' },
              ],
            }
          : leg,
      ),
    );

  const setLegDefaultSpeed = (legIdx: number, rowIdx: number) =>
    updateLegs((legs) =>
      legs.map((leg, li) =>
        li === legIdx
          ? {
              ...leg,
              speedCons: leg.speedCons.map((row, ri) => ({ ...row, isDefault: ri === rowIdx })),
            }
          : leg,
      ),
    );

  // Auto-detect timezone from Port From whenever the from value changes and timezone is unset
  useEffect(() => {
    const toFetch = view.legs.filter((l) => l.from && !l.etdTimezone);
    if (!toFetch.length) return;
    toFetch.forEach((leg) => {
      searchPortIndex(leg.from, 1).then((hits) => {
        if (hits.length && hits[0].lon) {
          const lon = parseFloat(hits[0].lon);
          if (!isNaN(lon)) {
            const off = Math.round(lon / 15);
            const tz = off >= 0 ? `UTC+${off}` : `UTC${off}`;
            updateLegs((legs) => legs.map((l) => l.no === leg.no ? { ...l, etdTimezone: tz } : l));
          }
        }
      }).catch(() => {});
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.legs.map((l) => l.from + '|' + l.etdTimezone).join(',')]);

  const addLeg = () =>
    updateLegs((legs) => (legs.length >= MAX_LEGS ? legs : [...legs, emptyLeg(`LEG-${legs.length + 1}`)]));

  const closeModal = () => {
    setModal(null);
    setSegChecked([]);
    setSegTarget([]);
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

  const confirmDialog = () => {
    if (!modal) return;
    const next = computeMergeSplit(view.legs, modal.items, segChecked, segTarget);
    if (next.length > MAX_LEGS) return;
    updateLegs(() => next);
    setSelected(null);
    setCheckedSubRows(new Set());
    closeModal();
  };

  const cpLegIdx = selected != null && selected < view.legs.length ? selected : 0;
  const cpLeg = view.legs.length > 0 ? view.legs[cpLegIdx] : null;
  const atMax = view.legs.length >= MAX_LEGS;

  const getCheckedSegItems = (): SegItem[] =>
    view.legs.flatMap((leg, i) =>
      checkedSubRows.has(`${i}-main`) ? [{ legIdx: i, subIdx: null as null, type: leg.type, from: leg.from, to: leg.to, etd: leg.etd, autoRoute: leg.autoRoute, cpWinds: leg.cpWinds, cpDss: leg.cpDss, cpSwh: leg.cpSwh, cpMinHours: leg.cpMinHours, cpCurrents: leg.cpCurrents, cpAllowableFuelMethod: leg.cpAllowableFuelMethod, cpGoodWeatherSelection: leg.cpGoodWeatherSelection, cpAboutSpeedUnit: leg.cpAboutSpeedUnit, cpAboutSpeed: leg.cpAboutSpeed, cpTimeGain: leg.cpTimeGain, cpTimeLoss: leg.cpTimeLoss }] : []
    );

  const canMergeRows = checkedSubRows.size >= 2;
  // Can split if ≥2 checked items share the same parent LegRow, or ≥2 main rows are checked
  const canSplitRows = checkedSubRows.size >= 2;
  const canDeleteRows = checkedSubRows.size >= 1;

  const openMergeRows = () => {
    const items = getCheckedSegItems();
    if (items.length < 2) return;
    openDialog('merge', items);
  };

  const openSplitRows = () => {
    const items = getCheckedSegItems();
    if (items.length < 2) return;
    openDialog('split', items);
  };

  const deleteCheckedRows = () => {
    if (!checkedSubRows.size) return;
    updateLegs((legs) => {
      const next = legs.filter((_, i) => !checkedSubRows.has(`${i}-main`));
      return next.length > 0 ? next : legs;
    });
    setCheckedSubRows(new Set());
  };

  const addNewLeg = () => addLeg();

  return (
    <Card id="legs" title={title} editing={editing} onToggleEdit={onToggleEdit} collapsed={collapsed} onToggleCollapse={onToggleCollapse}>
      <div className="fv-voyage__dense">
        {/* Default CP Details for all legs — per-leg overrides via "Use Default CP Criteria" toggle */}
        <section className="fv-voyage__leg">
          {cpLeg ? (
            <>
              <h5 className="fv-voyage__subhead">CP Details — Good Weather Details</h5>
              <div className="fv-voyage__cols fv-voyage__cols--5">
                <Field label="Winds (BF)" value={cpLeg.cpWinds} editing={editing} onChange={(x) => setLeg(cpLegIdx, 'cpWinds', x)} type="number" />
                <Field label="DSS" value={cpLeg.cpDss} editing={editing} onChange={(x) => setLeg(cpLegIdx, 'cpDss', x)} type="number" />
                <Field label="SWH" value={cpLeg.cpSwh} editing={editing} onChange={(x) => setLeg(cpLegIdx, 'cpSwh', x)} type="number" />
                <Field label="Min Hours (h)" value={cpLeg.cpMinHours} editing={editing} onChange={(x) => setLeg(cpLegIdx, 'cpMinHours', x)} type="number" />
                <Field label="Currents" value={cpLeg.cpCurrents} editing={editing} onChange={(x) => setLeg(cpLegIdx, 'cpCurrents', x)} options={CP_CURRENTS_OPTIONS} />
              </div>
              <div className="fv-voyage__cols fv-voyage__cols--5">
                <Field label="Good Weather Selection" value={cpLeg.cpGoodWeatherSelection} editing={editing} onChange={(x) => setLeg(cpLegIdx, 'cpGoodWeatherSelection', x)} options={CP_GOOD_WEATHER_OPTIONS} />
                <Field label="Allowable Fuel Method" value={cpLeg.cpAllowableFuelMethod} editing={editing} onChange={(x) => setLeg(cpLegIdx, 'cpAllowableFuelMethod', x)} options={CP_ALLOWABLE_FUEL_METHOD_OPTIONS} />
                <div className="fv-voyage__info">
                  <span className="fv-voyage__info-label">About Speed</span>
                  {editing ? (
                    <div className="fv-voyage__speed-field">
                      <input className="fv-voyage__input" type="number" inputMode="decimal" value={cpLeg.cpAboutSpeed} onChange={(e) => setLeg(cpLegIdx, 'cpAboutSpeed', e.target.value)} />
                      <select className="fv-voyage__input fv-voyage__unit-select" value={cpLeg.cpAboutSpeedUnit} onChange={(e) => setLeg(cpLegIdx, 'cpAboutSpeedUnit', e.target.value)}>
                        {CP_ABOUT_SPEED_UNIT_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                  ) : (
                    <span className="fv-voyage__info-value">{cpLeg.cpAboutSpeed}{cpLeg.cpAboutSpeed && cpLeg.cpAboutSpeedUnit ? ` ${cpLeg.cpAboutSpeedUnit}` : ''}</span>
                  )}
                </div>
                <Field label="Time Gain (%)" value={cpLeg.cpTimeGain} editing={editing} onChange={(x) => setLeg(cpLegIdx, 'cpTimeGain', x)} type="number" />
                <Field label="Time Loss (%)" value={cpLeg.cpTimeLoss} editing={editing} onChange={(x) => setLeg(cpLegIdx, 'cpTimeLoss', x)} type="number" />
              </div>

              <h5 className="fv-voyage__subhead">Speed &amp; Cons</h5>
              <div className="fv-voyage__table-scroll">
                <table className="fv-voyage__dtable fv-voyage__dtable--wide">
                  <thead>
                    <tr>
                      <th>Default</th>
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
                    {cpLeg.speedCons.map((row, ri) => (
                      <tr key={ri}>
                        <td>
                          <input
                            type="checkbox"
                            checked={!!row.isDefault}
                            onChange={() => setLegDefaultSpeed(cpLegIdx, ri)}
                            disabled={!editing}
                            aria-label={`Use ${row.description || `row ${ri + 1}`} as default speed/cons for this leg`}
                          />
                        </td>
                        <td><Cell editing={editing} value={row.description} onChange={(x) => setLegSpeed(cpLegIdx, ri, 'description', x)} /></td>
                        <td><Cell editing={editing} value={row.speed} onChange={(x) => setLegSpeed(cpLegIdx, ri, 'speed', x)} type="number" /></td>
                        <td><Cell editing={editing} value={row.fuelType1} onChange={(x) => setLegSpeed(cpLegIdx, ri, 'fuelType1', x)} options={FUEL_TYPE_OPTIONS} /></td>
                        <td><Cell editing={editing} value={row.dailyCons1} onChange={(x) => setLegSpeed(cpLegIdx, ri, 'dailyCons1', x)} type="number" /></td>
                        <td><Cell editing={editing} value={row.fuelType2} onChange={(x) => setLegSpeed(cpLegIdx, ri, 'fuelType2', x)} options={FUEL_TYPE_OPTIONS} /></td>
                        <td><Cell editing={editing} value={row.dailyCons2} onChange={(x) => setLegSpeed(cpLegIdx, ri, 'dailyCons2', x)} type="number" /></td>
                        <td><Cell editing={editing} value={row.fuelType3} onChange={(x) => setLegSpeed(cpLegIdx, ri, 'fuelType3', x)} options={FUEL_TYPE_OPTIONS} /></td>
                        <td><Cell editing={editing} value={row.dailyCons3} onChange={(x) => setLegSpeed(cpLegIdx, ri, 'dailyCons3', x)} type="number" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {editing && (
                <div className="fv-voyage__leg-actions">
                  <button type="button" className="fv-voyage__btn" onClick={() => addLegSpeed(cpLegIdx)}>
                    <i className="fas fa-plus" aria-hidden="true" /> Add More
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="fv-voyage__muted">Add a leg to view CP criteria and Speed &amp; Cons.</p>
          )}
        </section>

        {/* Flat legs table — all legs across all leg groups */}
        <section className="fv-voyage__leg">
          <h5 className="fv-voyage__subhead">Legs</h5>
          <div className="fv-voyage__leg-actions">
            <button type="button" className="fv-voyage__btn" onClick={addNewLeg} disabled={!editing || atMax}>
              <i className="fas fa-plus" aria-hidden="true" /> Add Leg
            </button>
            <button type="button" className="fv-voyage__btn" onClick={openMergeRows} disabled={!editing || !canMergeRows}>
              <i className="fas fa-compress-arrows-alt" aria-hidden="true" /> Merge Legs
            </button>
            <button type="button" className="fv-voyage__btn" onClick={openSplitRows} disabled={!editing || !canSplitRows}>
              <i className="fas fa-code-branch" aria-hidden="true" /> Split Legs
            </button>
            <button type="button" className="fv-voyage__btn fv-voyage__btn--danger" onClick={deleteCheckedRows} disabled={!editing || !canDeleteRows}>
              <i className="fas fa-trash" aria-hidden="true" /> Delete Selected
            </button>
          </div>
          <div className="fv-voyage__table-scroll">
            <table className="fv-voyage__dtable fv-voyage__dtable--fixed">
              <thead>
                <tr>
                  <th style={{ width: '3%' }} aria-label="Select" />
                  <th style={{ width: '9%' }}>Status</th>
                  <th style={{ width: '8%' }}>Type</th>
                  <th style={{ width: '9%' }}>Port From</th>
                  <th style={{ width: '9%' }}>Port To</th>
                  <th style={{ width: '10%' }}>ETD in UTC</th>
                  <th style={{ width: '7%' }}>Time Zone</th>
                  <th style={{ width: '10%' }}>ETD in LT</th>
                  <th style={{ width: '6%' }}>Auto Route</th>
                  <th style={{ width: '9%' }}>Use Different CP Criteria</th>
                  <th style={{ width: '7%' }}>C/P &amp; Good Weather</th>
                  {editing && <th aria-label="Actions" style={{ width: '3%' }} />}
                </tr>
              </thead>
              <tbody>
                {view.legs.map((leg, i) => {
                  const rowKey = `${i}-main`;
                  const criteriaOpen = openCriteria.has(rowKey);
                  return (
                    <Fragment key={leg.no}>
                      <tr>
                        <td className="fv-voyage__leg-num">
                          {editing
                            ? <input type="checkbox" className="fv-voyage__leg-check" checked={checkedSubRows.has(rowKey)} onChange={() => toggleSubRow(rowKey)} aria-label="Select row" />
                            : i + 1}
                        </td>
                        <td>
                          {editing ? (
                            <select className="fv-voyage__status-select" value={leg.status || 'Planning'} onChange={(e) => setLeg(i, 'status', e.target.value)} aria-label="Status">
                              {LEG_STATUS_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                          ) : (
                            <span className="fv-voyage__status-cell">
                              <span className={`fv-voyage__leg-status fv-voyage__leg-status--${(leg.status || 'planning').toLowerCase()}`} />
                              {leg.status || 'Planning'}
                            </span>
                          )}
                        </td>
                        <td><Cell editing={editing} value={leg.type} onChange={(x) => setLeg(i, 'type', x)} options={LEG_VOYAGE_TYPE_OPTIONS} /></td>
                        <td><Cell editing={editing} value={leg.from} onChange={(x) => setLeg(i, 'from', x)} /></td>
                        <td><Cell editing={editing} value={leg.to} onChange={(x) => setLeg(i, 'to', x)} /></td>
                        <td><Cell editing={editing} value={leg.etd} onChange={(x) => setLeg(i, 'etd', x)} type="datetime" /></td>
                        <td><Cell editing={editing} value={leg.etdTimezone} onChange={(x) => setLeg(i, 'etdTimezone', x)} /></td>
                        <td className="fv-voyage__muted">{applyTzOffset(leg.etd, leg.etdTimezone)}</td>
                        <td>
                          <button type="button"
                            className={`fv-voyage__toggle${leg.autoRoute ? ' fv-voyage__toggle--on' : ''}`}
                            onClick={() => editing && setLeg(i, 'autoRoute', !leg.autoRoute)}
                            disabled={!editing} role="switch" aria-checked={leg.autoRoute} aria-label="Auto Route">
                            <span className="fv-voyage__toggle-knob" />
                            <span className="fv-voyage__toggle-text">{leg.autoRoute ? 'On' : 'Off'}</span>
                          </button>
                        </td>
                        <td>
                          <button type="button"
                            className={`fv-voyage__toggle${leg.useDifferentCp ? ' fv-voyage__toggle--on' : ''}`}
                            onClick={() => editing && setLeg(i, 'useDifferentCp', !leg.useDifferentCp)}
                            disabled={!editing} role="switch" aria-checked={!!leg.useDifferentCp} aria-label="Use Different CP Criteria">
                            <span className="fv-voyage__toggle-knob" />
                            <span className="fv-voyage__toggle-text">{leg.useDifferentCp ? 'On' : 'Off'}</span>
                          </button>
                        </td>
                        <td>
                          <button type="button" className="fv-voyage__btn fv-voyage__btn--sm"
                            onClick={() => toggleCriteria(i, 'main')} aria-expanded={criteriaOpen}
                            title="View this leg's C/P & good-weather criteria">
                            <i className={`fas ${criteriaOpen ? 'fa-chevron-up' : 'fa-sliders'}`} aria-hidden="true" />{' '}
                            {criteriaOpen ? 'Hide' : 'Criteria'}
                          </button>
                        </td>
                        {editing && (
                          <td>
                            <button type="button" className="fv-voyage__icon-btn"
                              onClick={() => updateLegs((legs) => legs.length > 1 ? legs.filter((_, idx) => idx !== i) : legs)}
                              aria-label="Remove leg">
                              <i className="fas fa-times" aria-hidden="true" />
                            </button>
                          </td>
                        )}
                      </tr>
                      {criteriaOpen && (
                        <tr className="fv-voyage__subleg-detail-row">
                          <td colSpan={editing ? 13 : 12}>
                            <div className="fv-voyage__subleg-detail">
                              <h6 className="fv-voyage__subhead">C/P &amp; Good Weather Criteria — {leg.from || '—'} → {leg.to || '—'}</h6>
                              <div className="fv-voyage__cols fv-voyage__cols--5">
                                <Field label="Winds (BF)" value={leg.cpWinds} editing={editing && !!leg.useDifferentCp} onChange={(x) => setLeg(i, 'cpWinds', x)} type="number" />
                                <Field label="DSS" value={leg.cpDss} editing={editing && !!leg.useDifferentCp} onChange={(x) => setLeg(i, 'cpDss', x)} type="number" />
                                <Field label="SWH" value={leg.cpSwh} editing={editing && !!leg.useDifferentCp} onChange={(x) => setLeg(i, 'cpSwh', x)} type="number" />
                                <Field label="Min Hours (h)" value={leg.cpMinHours} editing={editing && !!leg.useDifferentCp} onChange={(x) => setLeg(i, 'cpMinHours', x)} type="number" />
                                <Field label="Currents" value={leg.cpCurrents} editing={editing && !!leg.useDifferentCp} onChange={(x) => setLeg(i, 'cpCurrents', x)} options={CP_CURRENTS_OPTIONS} />
                              </div>
                              <div className="fv-voyage__cols fv-voyage__cols--5">
                                <Field label="Good Weather Selection" value={leg.cpGoodWeatherSelection} editing={editing && !!leg.useDifferentCp} onChange={(x) => setLeg(i, 'cpGoodWeatherSelection', x)} options={CP_GOOD_WEATHER_OPTIONS} />
                                <Field label="Allowable Fuel Method" value={leg.cpAllowableFuelMethod} editing={editing && !!leg.useDifferentCp} onChange={(x) => setLeg(i, 'cpAllowableFuelMethod', x)} options={CP_ALLOWABLE_FUEL_METHOD_OPTIONS} />
                                  <div className="fv-voyage__info">
                                    <span className="fv-voyage__info-label">About Speed</span>
                                    {(editing && !!leg.useDifferentCp) ? (
                                      <div className="fv-voyage__speed-field">
                                        <input className="fv-voyage__input" type="number" inputMode="decimal" value={leg.cpAboutSpeed} onChange={(e) => setLeg(i, 'cpAboutSpeed', e.target.value)} />
                                        <select className="fv-voyage__input fv-voyage__unit-select" value={leg.cpAboutSpeedUnit} onChange={(e) => setLeg(i, 'cpAboutSpeedUnit', e.target.value)}>
                                          {CP_ABOUT_SPEED_UNIT_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                      </div>
                                    ) : (
                                      <span className="fv-voyage__info-value">{leg.cpAboutSpeed}{leg.cpAboutSpeed && leg.cpAboutSpeedUnit ? ` ${leg.cpAboutSpeedUnit}` : ''}</span>
                                    )}
                                  </div>
                                <Field label="Time Gain (%)" value={leg.cpTimeGain} editing={editing && !!leg.useDifferentCp} onChange={(x) => setLeg(i, 'cpTimeGain', x)} type="number" />
                                <Field label="Time Loss (%)" value={leg.cpTimeLoss} editing={editing && !!leg.useDifferentCp} onChange={(x) => setLeg(i, 'cpTimeLoss', x)} type="number" />
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Merge / Split modal */}
        {modal && (() => {
          const result = computeMergeSplit(view.legs, modal.items, segChecked, segTarget);
          const over = result.length > MAX_LEGS;
          const noneChecked = !segChecked.some(Boolean);
          return (
            <div className="fv-voyage__modal-overlay" role="dialog" aria-modal="true" aria-label={modal.mode === 'merge' ? 'Merge legs' : 'Split leg'}>
              <div className="fv-voyage__modal">
                <header className="fv-voyage__modal-head">
                  <h4 className="fv-voyage__modal-title">
                    {modal.mode === 'merge' ? 'Merge — Choose Legs & Target' : 'Split — Choose Legs & Target'}
                  </h4>
                  <button type="button" className="fv-voyage__icon-btn" onClick={closeModal} aria-label="Close">
                    <i className="fas fa-times" aria-hidden="true" />
                  </button>
                </header>
                <p className="fv-voyage__modal-text">
                  Select each leg and the leg type to {modal.mode} it into. If no leg of that type exists, a new leg is created.
                </p>
                <div className="fv-voyage__modal-legs">
                  {modal.items.map((it, si) => (
                    <div key={si} className="fv-voyage__modal-leg fv-voyage__modal-leg--row">
                      <input type="checkbox" checked={!!segChecked[si]} onChange={() => toggleSeg(si)} aria-label={`Select leg ${si + 1}`} />
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
                  <button type="button" className="fv-voyage__btn" onClick={closeModal}>Cancel</button>
                  <button type="button" className="fv-voyage__btn fv-voyage__btn--primary" onClick={confirmDialog} disabled={noneChecked || over}>
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
