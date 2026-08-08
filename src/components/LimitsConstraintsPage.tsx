import { useEffect, useState } from 'react';

import { useFleetView } from '../context/FleetViewContext';
import { useSelectedVoyage } from '../data/selectedVoyage';
import { loadVoyageShared, mergeVoyageShared } from '../data/voyageOverrides';
import { buildView } from './voyage/buildView';
import type { Voyage } from '../data/voyages';
import {
  appendLimitsHistory,
  diffLimits,
  diffLimitsDetailed,
  loadLimitsFor,
  loadLimitsHistory,
  newHistoryId,
  saveLimitsFor,
  type LimitsHistoryEntry,
  type VoyageLimits,
} from '../data/limitsConstraints';

/** A labelled input used across the editor sections. */
function Field({
  label,
  value,
  onChange,
  type = 'number',
  suffix,
  step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  suffix?: string;
  step?: string;
}) {
  return (
    <label className="fv-limits__field">
      <span className="fv-limits__field-label">{label}</span>
      <span className="fv-limits__field-input">
        <input type={type} value={value} step={step} onChange={(e) => onChange(e.target.value)} />
        {suffix && <span className="fv-limits__affix">{suffix}</span>}
      </span>
    </label>
  );
}

/**
 * Build the limits for a voyage: Limits-only fields come from the per-voyage
 * store, while the shared Market Factors and Weather Safety Limits are seeded
 * from the voyage and overlaid with any saved shared overrides (so edits made
 * on the Voyage Details page show up here).
 */
function composeLimits(voyage: Voyage | undefined): VoyageLimits {
  const base = loadLimitsFor(voyage?.id);
  if (!voyage) return base;
  const view = buildView(voyage);
  const shared = loadVoyageShared(voyage.id);
  return {
    ...base,
    marketFactors: {
      ...base.marketFactors,
      hirePerDay: shared?.hireRate ?? view.hireRate ?? base.marketFactors.hirePerDay,
      foPrice: shared?.foPrice ?? view.foPrice ?? base.marketFactors.foPrice,
      goPrice: shared?.goPrice ?? view.goPrice ?? base.marketFactors.goPrice,
      euaPrice: shared?.euaPrice ?? view.euaPrice ?? base.marketFactors.euaPrice,
    },
    weatherLimits: {
      ...base.weatherLimits,
      maxSwh: shared?.wslMaxSwhLaden ?? view.wslMaxSwhLaden ?? base.weatherLimits.maxSwh,
      maxWind: shared?.wslMaxWindsLaden ?? view.wslMaxWindsLaden ?? base.weatherLimits.maxWind,
      maxSeaState: shared?.wslMaxSeaStateLaden ?? view.wslMaxSeaStateLaden ?? base.weatherLimits.maxSeaState,
    },
  };
}

/**
 * Persist limits: Limits-only fields per voyage, and mirror the shared Market
 * Factors + Weather Safety Limits into the shared store so the Voyage Details
 * page reflects the change. The single weather value maps to the Laden slot so
 * the voyage's distinct Ballast values are preserved.
 */
function persistLimits(voyage: Voyage | undefined, limits: VoyageLimits): void {
  saveLimitsFor(voyage?.id, limits);
  if (!voyage) return;
  mergeVoyageShared(voyage.id, {
    hireRate: limits.marketFactors.hirePerDay,
    foPrice: limits.marketFactors.foPrice,
    goPrice: limits.marketFactors.goPrice,
    euaPrice: limits.marketFactors.euaPrice,
    wslMaxSwhLaden: limits.weatherLimits.maxSwh,
    wslMaxWindsLaden: limits.weatherLimits.maxWind,
    wslMaxSeaStateLaden: limits.weatherLimits.maxSeaState,
  });
}

/**
 * Keep legacy `rta` and `speedCons` sections in sync with the new
 * `constraints` card so existing optimization readers keep working.
 */
function syncLegacyFromConstraints(limits: VoyageLimits): VoyageLimits {
  const c = limits.constraints;
  return {
    ...limits,
    rta: {
      ...limits.rta,
      enabled: c.rta.trim().length > 0,
      value: c.rta || limits.rta.value,
    },
    speedCons: {
      ...limits.speedCons,
      minSpeed: c.speedMin,
      maxSpeed: c.speedMax,
      minRpm: c.rpmMin,
      maxRpm: c.rpmMax,
      maxFoPerDay: c.consumption,
    },
  };
}

export function LimitsConstraintsPage() {
  const { user } = useFleetView();
  const voyage = useSelectedVoyage();
  const voyageId = voyage?.id;

  const [saved, setSaved] = useState<VoyageLimits>(() => composeLimits(voyage));
  const [draft, setDraft] = useState<VoyageLimits>(() => composeLimits(voyage));
  const [justSaved, setJustSaved] = useState(false);
  const [history, setHistory] = useState<LimitsHistoryEntry[]>(() => loadLimitsHistory());
  const [historyOpen, setHistoryOpen] = useState(false);
  /** Which card is currently being edited (only one at a time), or null. */
  const [editingCard, setEditingCard] = useState<string | null>(null);

  // Re-seed from the voyage (and any shared overrides) whenever it changes, so
  // edits made on the Voyage Details page are reflected here.
  useEffect(() => {
    const next = composeLimits(voyage);
    setSaved(next);
    setDraft(structuredClone(next));
    setEditingCard(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voyageId]);

  const setSection = <K extends keyof VoyageLimits>(key: K, value: VoyageLimits[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const onSave = () => {
    const normalized = syncLegacyFromConstraints(draft);
    const changed = diffLimits(saved, normalized);
    persistLimits(voyage, normalized);
    setSaved(structuredClone(normalized));
    if (changed.length > 0) {
      const entry: LimitsHistoryEntry = {
        id: newHistoryId(),
        at: new Date().toISOString(),
        by: user?.fullName || user?.name || 'Unknown user',
        summary: `Updated ${changed.join(', ')}`,
        changes: diffLimitsDetailed(saved, normalized),
      };
      setHistory(appendLimitsHistory(entry));
    }
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1600);
    setEditingCard(null);
  };

  const startEdit = (key: string) => {
    // Edit always begins from the last saved state.
    setDraft(structuredClone(saved));
    setEditingCard(key);
  };
  const cancelEdit = () => {
    setDraft(structuredClone(saved));
    setEditingCard(null);
  };

  return (
    <div className="fv-voyage fv-limits-page">
      <header className="fv-voyage__header">
        <div className="fv-voyage__heading">
          <span className="fv-voyage__heading-icon" aria-hidden="true">
            <i className="fas fa-sliders" />
          </span>
          <h1>Limits &amp; Constraints</h1>
        </div>
      </header>

      <div className="fv-limits">
        <div className="fv-limits__main">
          <p className="fv-limits__intro">
            Set the market factors, weather safety limits and optimization constraints
            (Speed, Consumption, RTA, RPM and MCR) for{' '}
            {voyage ? <strong>{voyage.vessel}</strong> : 'the selected voyage'}.
            Click <strong>Edit</strong> on any card to change its values, then Save.
          </p>

          <div className="fv-limits__overview">
            <CardShell
              title="Market Factors"
              icon="fa-coins"
              editing={editingCard === 'market'}
              justSaved={justSaved}
              onEdit={() => startEdit('market')}
              onSave={onSave}
              onCancel={cancelEdit}
            >
              {editingCard === 'market' ? (
                <div className="fv-limits__grid">
                  <Field label="FO Price /MT" value={draft.marketFactors.foPrice} onChange={(v) => setSection('marketFactors', { ...draft.marketFactors, foPrice: v })} suffix="$" step="1" />
                  <Field label="GO Price /MT" value={draft.marketFactors.goPrice} onChange={(v) => setSection('marketFactors', { ...draft.marketFactors, goPrice: v })} suffix="$" step="1" />
                  <Field label="EUA Price /tCO₂" value={draft.marketFactors.euaPrice} onChange={(v) => setSection('marketFactors', { ...draft.marketFactors, euaPrice: v })} suffix="$" step="1" />
                  <Field label="Hire Per Day" value={draft.marketFactors.hirePerDay} onChange={(v) => setSection('marketFactors', { ...draft.marketFactors, hirePerDay: v })} suffix="$" step="100" />
                </div>
              ) : (
                <dl className="fv-limits__card-list">
                  <OverviewRow label="FO Price" value={`$${saved.marketFactors.foPrice || '—'}`} />
                  <OverviewRow label="GO Price" value={`$${saved.marketFactors.goPrice || '—'}`} />
                  <OverviewRow label="EUA Price" value={`$${saved.marketFactors.euaPrice || '—'}`} />
                  <OverviewRow label="Hire / Day" value={`$${saved.marketFactors.hirePerDay || '—'}`} />
                </dl>
              )}
            </CardShell>

            <CardShell
              title="Safety Limits & Hydrostatics"
              icon="fa-cloud-bolt"
              editing={editingCard === 'weather'}
              justSaved={justSaved}
              onEdit={() => startEdit('weather')}
              onSave={onSave}
              onCancel={cancelEdit}
            >
              {editingCard === 'weather' ? (
                <div className="fv-limits__grid">
                  <Field label="Max Sig Wave Height" value={draft.weatherLimits.maxSwh} onChange={(v) => setSection('weatherLimits', { ...draft.weatherLimits, maxSwh: v })} suffix="m" step="0.1" />
                  <Field label="Max Wind Speed" value={draft.weatherLimits.maxWind} onChange={(v) => setSection('weatherLimits', { ...draft.weatherLimits, maxWind: v })} suffix="BF" step="1" />
                  <Field label="Max Sea State" value={draft.weatherLimits.maxSeaState} onChange={(v) => setSection('weatherLimits', { ...draft.weatherLimits, maxSeaState: v })} suffix="DSS" step="1" />
                  <Field label="Max Swell" value={draft.weatherLimits.maxSwell} onChange={(v) => setSection('weatherLimits', { ...draft.weatherLimits, maxSwell: v })} suffix="m" step="0.1" />
                  <Field label="Max Roll Period" value={draft.weatherLimits.maxRollPeriod} onChange={(v) => setSection('weatherLimits', { ...draft.weatherLimits, maxRollPeriod: v })} suffix="s" step="1" />
                  <Field label="Draft" value={draft.weatherLimits.draft} onChange={(v) => setSection('weatherLimits', { ...draft.weatherLimits, draft: v })} suffix="m" step="0.1" />
                  <Field label="Displacement" value={draft.weatherLimits.displacement} onChange={(v) => setSection('weatherLimits', { ...draft.weatherLimits, displacement: v })} suffix="mt" step="1" />
                  <Field label="GM" value={draft.weatherLimits.gm} onChange={(v) => setSection('weatherLimits', { ...draft.weatherLimits, gm: v })} suffix="m" step="0.01" />
                </div>
              ) : (
                <dl className="fv-limits__card-list">
                  <OverviewRow label="Max Sig Wave" value={`${saved.weatherLimits.maxSwh || '—'} m`} />
                  <OverviewRow label="Max Wind" value={`BF ${saved.weatherLimits.maxWind || '—'}`} />
                  <OverviewRow label="Max Sea State" value={`DSS ${saved.weatherLimits.maxSeaState || '—'}`} />
                  <OverviewRow label="Max Swell" value={`${saved.weatherLimits.maxSwell || '—'} m`} />
                  <OverviewRow label="Max Roll Period" value={`${saved.weatherLimits.maxRollPeriod || '—'} s`} />
                  <OverviewRow label="Draft" value={saved.weatherLimits.draft ? `${saved.weatherLimits.draft} m` : '—'} />
                  <OverviewRow label="Displacement" value={saved.weatherLimits.displacement ? `${saved.weatherLimits.displacement} mt` : '—'} />
                  <OverviewRow label="GM" value={saved.weatherLimits.gm ? `${saved.weatherLimits.gm} m` : '—'} />
                </dl>
              )}
            </CardShell>

            <CardShell
              title="Constraints"
              icon="fa-sliders"
              editing={editingCard === 'constraints'}
              justSaved={justSaved}
              onEdit={() => startEdit('constraints')}
              onSave={onSave}
              onCancel={cancelEdit}
            >
              {editingCard === 'constraints' ? (
                <div className="fv-limits__grid">
                  <Field
                    label="Speed Min"
                    value={draft.constraints.speedMin}
                    onChange={(v) =>
                      setSection('constraints', { ...draft.constraints, speedMin: v })
                    }
                    suffix="kt"
                    step="0.1"
                  />
                  <Field
                    label="Speed Max"
                    value={draft.constraints.speedMax}
                    onChange={(v) =>
                      setSection('constraints', { ...draft.constraints, speedMax: v })
                    }
                    suffix="kt"
                    step="0.1"
                  />
                  <Field
                    label="Consumption"
                    value={draft.constraints.consumption}
                    onChange={(v) =>
                      setSection('constraints', { ...draft.constraints, consumption: v })
                    }
                    suffix="mt/day"
                    step="0.1"
                  />
                  <Field
                    label="RTA"
                    value={draft.constraints.rta}
                    onChange={(v) => setSection('constraints', { ...draft.constraints, rta: v })}
                    type="datetime-local"
                  />
                  <Field
                    label="RPM Min"
                    value={draft.constraints.rpmMin}
                    onChange={(v) =>
                      setSection('constraints', { ...draft.constraints, rpmMin: v })
                    }
                    step="1"
                  />
                  <Field
                    label="RPM Max"
                    value={draft.constraints.rpmMax}
                    onChange={(v) =>
                      setSection('constraints', { ...draft.constraints, rpmMax: v })
                    }
                    step="1"
                  />
                  <Field
                    label="MCR Min"
                    value={draft.constraints.mcrMin}
                    onChange={(v) =>
                      setSection('constraints', { ...draft.constraints, mcrMin: v })
                    }
                    suffix="%"
                    step="0.1"
                  />
                  <Field
                    label="MCR Max"
                    value={draft.constraints.mcrMax}
                    onChange={(v) =>
                      setSection('constraints', { ...draft.constraints, mcrMax: v })
                    }
                    suffix="%"
                    step="0.1"
                  />
                </div>
              ) : (
                <dl className="fv-limits__card-list">
                  <OverviewRow
                    label="Speed"
                    value={`${saved.constraints.speedMin || '—'} – ${saved.constraints.speedMax || '—'} kt`}
                  />
                  <OverviewRow
                    label="Consumption"
                    value={saved.constraints.consumption ? `${saved.constraints.consumption} mt/day` : '—'}
                  />
                  <OverviewRow
                    label="RTA"
                    value={saved.constraints.rta ? saved.constraints.rta.replace('T', ' ') : '—'}
                  />
                  <OverviewRow
                    label="RPM"
                    value={`${saved.constraints.rpmMin || '—'} – ${saved.constraints.rpmMax || '—'}`}
                  />
                  <OverviewRow
                    label="MCR"
                    value={`${saved.constraints.mcrMin || '—'} – ${saved.constraints.mcrMax || '—'} %`}
                  />
                </dl>
              )}
            </CardShell>

            <CardShell
              title="Requirements / Notes"
              icon="fa-clipboard-list"
              editing={editingCard === 'requirements'}
              justSaved={justSaved}
              onEdit={() => startEdit('requirements')}
              onSave={onSave}
              onCancel={cancelEdit}
            >
              {editingCard === 'requirements' ? (
                <textarea
                  className="fv-limits__textarea"
                  rows={4}
                  placeholder="Add any additional voyage requirements or constraints…"
                  value={draft.requirements}
                  onChange={(e) => setSection('requirements', e.target.value)}
                />
              ) : (
                <p className="fv-limits__notes">{saved.requirements || '—'}</p>
              )}
            </CardShell>
          </div>

          <button
            type="button"
            className="fv-limits__history-btn"
            onClick={() => setHistoryOpen(true)}
          >
            <i className="fas fa-clock-rotate-left" aria-hidden="true" /> Configuration History
            {history.length > 0 && <span className="fv-limits__history-n">{history.length}</span>}
          </button>
        </div>
      </div>

      {historyOpen && (
        <div className="fv-limits__modal-overlay" role="presentation" onClick={() => setHistoryOpen(false)}>
          <div
            className="fv-limits__modal"
            role="dialog"
            aria-modal="true"
            aria-label="Configuration history"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="fv-limits__modal-head">
              <h3>
                <i className="fas fa-clock-rotate-left" aria-hidden="true" /> Configuration History
              </h3>
              <button
                type="button"
                className="fv-limits__modal-close"
                onClick={() => setHistoryOpen(false)}
                aria-label="Close"
              >
                <i className="fas fa-xmark" aria-hidden="true" />
              </button>
            </header>
            <div className="fv-limits__modal-body">
              {history.length === 0 ? (
                <p className="fv-limits__modal-empty">No changes recorded yet.</p>
              ) : (
                <ul className="fv-limits__log">
                  {history.map((h) => (
                    <li key={h.id} className="fv-limits__log-item">
                      <div className="fv-limits__log-meta">
                        <span className="fv-limits__log-when">
                          <i className="fas fa-clock" aria-hidden="true" />{' '}
                          {new Date(h.at).toLocaleString()}
                        </span>
                        <span className="fv-limits__log-by">
                          <i className="fas fa-user" aria-hidden="true" /> {h.by}
                        </span>
                      </div>
                      <span className="fv-limits__log-what">{h.summary}</span>
                      {h.changes && h.changes.length > 0 && (
                        <table className="fv-limits__log-changes">
                          <thead>
                            <tr>
                              <th>Field</th>
                              <th>Before</th>
                              <th>After</th>
                            </tr>
                          </thead>
                          <tbody>
                            {h.changes.map((c, i) => (
                              <tr key={i}>
                                <td className="fv-limits__log-field">{c.field}</td>
                                <td className="fv-limits__log-before">{c.before}</td>
                                <td className="fv-limits__log-after">{c.after}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CardShell({
  title,
  icon,
  editing,
  justSaved,
  onEdit,
  onSave,
  onCancel,
  children,
}: {
  title: string;
  icon: string;
  editing: boolean;
  justSaved: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`fv-limits__card${editing ? ' fv-limits__card--editing' : ''}`}>
      <div className="fv-limits__card-head">
        <h3 className="fv-limits__card-title">
          <i className={`fas ${icon}`} aria-hidden="true" /> {title}
        </h3>
        {editing ? (
          <div className="fv-limits__card-actions">
            <button type="button" className="fv-limits__btn fv-limits__btn--ghost" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="fv-limits__btn fv-limits__btn--primary" onClick={onSave}>
              <i className={`fas ${justSaved ? 'fa-check' : 'fa-floppy-disk'}`} aria-hidden="true" />{' '}
              {justSaved ? 'Saved' : 'Save'}
            </button>
          </div>
        ) : (
          <button type="button" className="fv-limits__card-edit" onClick={onEdit}>
            <i className="fas fa-pen" aria-hidden="true" /> Edit
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function OverviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="fv-limits__card-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
