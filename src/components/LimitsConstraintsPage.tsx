import { useMemo, useState } from 'react';

import { useFleetView } from '../context/FleetViewContext';
import { useSelectedVoyage } from '../data/selectedVoyage';
import {
  appendLimitsHistory,
  diffLimits,
  loadLimits,
  loadLimitsHistory,
  newHistoryId,
  saveLimits,
  type LimitsHistoryEntry,
  type VoyageLimits,
} from '../data/limitsConstraints';

const HOUR = 3_600_000;
const pad = (n: number) => String(n).padStart(2, '0');

function parseDT(s: string): number | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}
function toInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}`;
}
function fmtDT(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}`;
}

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

export function LimitsConstraintsPage() {
  const { user } = useFleetView();
  const voyage = useSelectedVoyage();

  const [saved, setSaved] = useState<VoyageLimits>(() => loadLimits());
  const [draft, setDraft] = useState<VoyageLimits>(() => loadLimits());
  const [collapsed, setCollapsed] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [history, setHistory] = useState<LimitsHistoryEntry[]>(() => loadLimitsHistory());
  const [historyOpen, setHistoryOpen] = useState(false);

  const dirty = useMemo(
    () => JSON.stringify(saved) !== JSON.stringify(draft),
    [saved, draft],
  );

  // RTA both-times computation.
  const rtaTimes = useMemo(() => {
    const tz = Number(draft.rta.tz) || 0;
    const enteredMs = parseDT(draft.rta.value);
    if (enteredMs == null) return { utc: null as number | null, lt: null as number | null };
    if (draft.rta.mode === 'UTC') {
      return { utc: enteredMs, lt: enteredMs + tz * HOUR };
    }
    return { utc: enteredMs - tz * HOUR, lt: enteredMs };
  }, [draft.rta]);

  const setSection = <K extends keyof VoyageLimits>(key: K, value: VoyageLimits[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const toggleRtaMode = () => {
    setDraft((d) => {
      const tz = Number(d.rta.tz) || 0;
      const enteredMs = parseDT(d.rta.value);
      const nextMode = d.rta.mode === 'UTC' ? 'LT' : 'UTC';
      let value = d.rta.value;
      if (enteredMs != null) {
        // Keep the same instant; re-express the input in the new zone.
        value = toInput(nextMode === 'LT' ? enteredMs + tz * HOUR : enteredMs - tz * HOUR);
      }
      return { ...d, rta: { ...d.rta, mode: nextMode, value } };
    });
  };

  const onSave = () => {
    const changed = diffLimits(saved, draft);
    saveLimits(draft);
    setSaved(structuredClone(draft));
    if (changed.length > 0) {
      const entry: LimitsHistoryEntry = {
        id: newHistoryId(),
        at: new Date().toISOString(),
        by: user?.fullName || user?.name || 'Unknown user',
        summary: `Updated ${changed.join(', ')}`,
      };
      setHistory(appendLimitsHistory(entry));
    }
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1600);
  };

  const onRevert = () => setDraft(structuredClone(saved));

  return (
    <div className="fv-voyage">
      <header className="fv-voyage__header">
        <div className="fv-voyage__heading">
          <span className="fv-voyage__heading-icon" aria-hidden="true">
            <i className="fas fa-sliders" />
          </span>
          <h1>Limits &amp; Constraints</h1>
        </div>
      </header>

      <div className="fv-limits">
        {/* Overview (left) */}
        <div className="fv-limits__main">
          <p className="fv-limits__intro">
            Set the market factors, weather safety limits, RTA and speed / consumption
            constraints for {voyage ? <strong>{voyage.vessel}</strong> : 'the selected voyage'}.
            Open the editor on the right to add or edit, then Save.
          </p>

          <div className="fv-limits__overview">
            <OverviewCard title="Market Factors" icon="fa-coins">
              <OverviewRow label="FO Price" value={`$${saved.marketFactors.foPrice || '—'}`} />
              <OverviewRow label="GO Price" value={`$${saved.marketFactors.goPrice || '—'}`} />
              <OverviewRow label="EUA Price" value={`$${saved.marketFactors.euaPrice || '—'}`} />
              <OverviewRow label="Hire / Day" value={`$${saved.marketFactors.hirePerDay || '—'}`} />
            </OverviewCard>

            <OverviewCard title="Weather Safety Limits" icon="fa-cloud-bolt">
              <OverviewRow label="Max Sig Wave" value={`${saved.weatherLimits.maxSwh || '—'} m`} />
              <OverviewRow label="Max Wind" value={`BF ${saved.weatherLimits.maxWind || '—'}`} />
              <OverviewRow label="Max Sea State" value={`DSS ${saved.weatherLimits.maxSeaState || '—'}`} />
              <OverviewRow label="Max Swell" value={`${saved.weatherLimits.maxSwell || '—'} m`} />
            </OverviewCard>

            <OverviewCard title="RTA Constraint" icon="fa-clock">
              <OverviewRow
                label="Status"
                value={saved.rta.enabled ? 'Enabled' : 'Disabled'}
              />
              <OverviewRow label="Entered in" value={saved.rta.mode} />
              <OverviewRow label="Value" value={saved.rta.value.replace('T', ' ')} />
              <OverviewRow label="Time Zone" value={`UTC${Number(saved.rta.tz) >= 0 ? '+' : ''}${saved.rta.tz}`} />
            </OverviewCard>

            <OverviewCard title="Speed / Cons Constraint" icon="fa-gauge-high">
              <OverviewRow label="Speed" value={`${saved.speedCons.minSpeed || '—'} – ${saved.speedCons.maxSpeed || '—'} kt`} />
              <OverviewRow label="RPM" value={`${saved.speedCons.minRpm || '—'} – ${saved.speedCons.maxRpm || '—'}`} />
              <OverviewRow label="Max FO/day" value={`${saved.speedCons.maxFoPerDay || '—'} mt`} />
              <OverviewRow label="Max GO/day" value={`${saved.speedCons.maxGoPerDay || '—'} mt`} />
            </OverviewCard>
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

        {/* Editor (collapsible, right) */}
        <div className={`fv-limits__side-col${collapsed ? ' fv-limits__side-col--collapsed' : ''}`}>
          <aside className="fv-limits__panel" aria-label="Limits & constraints editor">
            <header className="fv-limits__panel-head">
              <button
                type="button"
                className="fv-limits__collapse"
                onClick={() => setCollapsed((c) => !c)}
                aria-expanded={!collapsed}
                title={collapsed ? 'Show editor' : 'Hide editor'}
                aria-label={collapsed ? 'Show editor' : 'Hide editor'}
              >
                <i className={`fas ${collapsed ? 'fa-chevron-left' : 'fa-chevron-right'}`} aria-hidden="true" />
              </button>
              {!collapsed && (
                <>
                  <h3 className="fv-limits__panel-title">
                    <i className="fas fa-pen-ruler" aria-hidden="true" /> Edit Constraints
                  </h3>
                  <div className="fv-limits__panel-actions">
                    {dirty && (
                      <button type="button" className="fv-limits__btn fv-limits__btn--ghost" onClick={onRevert}>
                        Revert
                      </button>
                    )}
                    <button
                      type="button"
                      className="fv-limits__btn fv-limits__btn--primary"
                      onClick={onSave}
                      disabled={!dirty}
                    >
                      <i className={`fas ${justSaved ? 'fa-check' : 'fa-floppy-disk'}`} aria-hidden="true" />{' '}
                      {justSaved ? 'Saved' : 'Save'}
                    </button>
                  </div>
                </>
              )}
            </header>

            {!collapsed && (
              <div className="fv-limits__panel-body">
                {dirty && <div className="fv-limits__dirty">Unsaved changes</div>}

                <section className="fv-limits__section">
                  <h4>Market Factors</h4>
                  <div className="fv-limits__grid">
                    <Field label="FO Price /MT" value={draft.marketFactors.foPrice} onChange={(v) => setSection('marketFactors', { ...draft.marketFactors, foPrice: v })} suffix="$" step="1" />
                    <Field label="GO Price /MT" value={draft.marketFactors.goPrice} onChange={(v) => setSection('marketFactors', { ...draft.marketFactors, goPrice: v })} suffix="$" step="1" />
                    <Field label="EUA Price /tCO₂" value={draft.marketFactors.euaPrice} onChange={(v) => setSection('marketFactors', { ...draft.marketFactors, euaPrice: v })} suffix="$" step="1" />
                    <Field label="Hire Per Day" value={draft.marketFactors.hirePerDay} onChange={(v) => setSection('marketFactors', { ...draft.marketFactors, hirePerDay: v })} suffix="$" step="100" />
                    <Field label="Freight Rate" value={draft.marketFactors.freightRate} onChange={(v) => setSection('marketFactors', { ...draft.marketFactors, freightRate: v })} suffix="$/mt" step="0.1" />
                  </div>
                </section>

                <section className="fv-limits__section">
                  <h4>Weather Safety Limits</h4>
                  <div className="fv-limits__grid">
                    <Field label="Max Sig Wave Height" value={draft.weatherLimits.maxSwh} onChange={(v) => setSection('weatherLimits', { ...draft.weatherLimits, maxSwh: v })} suffix="m" step="0.1" />
                    <Field label="Max Wind Speed" value={draft.weatherLimits.maxWind} onChange={(v) => setSection('weatherLimits', { ...draft.weatherLimits, maxWind: v })} suffix="BF" step="1" />
                    <Field label="Max Sea State" value={draft.weatherLimits.maxSeaState} onChange={(v) => setSection('weatherLimits', { ...draft.weatherLimits, maxSeaState: v })} suffix="DSS" step="1" />
                    <Field label="Max Swell" value={draft.weatherLimits.maxSwell} onChange={(v) => setSection('weatherLimits', { ...draft.weatherLimits, maxSwell: v })} suffix="m" step="0.1" />
                    <Field label="Max Roll Period" value={draft.weatherLimits.maxRollPeriod} onChange={(v) => setSection('weatherLimits', { ...draft.weatherLimits, maxRollPeriod: v })} suffix="s" step="1" />
                  </div>
                </section>

                <section className="fv-limits__section">
                  <div className="fv-limits__section-head">
                    <h4>RTA Constraint</h4>
                    <label className="fv-limits__toggle-enable">
                      <input
                        type="checkbox"
                        checked={draft.rta.enabled}
                        onChange={(e) => setSection('rta', { ...draft.rta, enabled: e.target.checked })}
                      />
                      <span>Enabled</span>
                    </label>
                  </div>
                  <div className="fv-limits__rta">
                    <div className="fv-limits__rta-row">
                      <label className="fv-limits__field fv-limits__field--grow">
                        <span className="fv-limits__field-label">
                          Required Time of Arrival ({draft.rta.mode})
                        </span>
                        <span className="fv-limits__field-input">
                          <input
                            type="datetime-local"
                            value={draft.rta.value}
                            disabled={!draft.rta.enabled}
                            onChange={(e) => setSection('rta', { ...draft.rta, value: e.target.value })}
                          />
                        </span>
                      </label>
                      <div className="fv-limits__mode-toggle" role="group" aria-label="RTA time zone mode">
                        <button
                          type="button"
                          className={`fv-limits__mode-btn${draft.rta.mode === 'UTC' ? ' fv-limits__mode-btn--on' : ''}`}
                          onClick={() => draft.rta.mode !== 'UTC' && toggleRtaMode()}
                          disabled={!draft.rta.enabled}
                        >
                          UTC
                        </button>
                        <button
                          type="button"
                          className={`fv-limits__mode-btn${draft.rta.mode === 'LT' ? ' fv-limits__mode-btn--on' : ''}`}
                          onClick={() => draft.rta.mode !== 'LT' && toggleRtaMode()}
                          disabled={!draft.rta.enabled}
                        >
                          LT
                        </button>
                      </div>
                      <Field
                        label="Time Zone (h)"
                        value={draft.rta.tz}
                        onChange={(v) => setSection('rta', { ...draft.rta, tz: v })}
                        step="0.5"
                      />
                    </div>
                    <div className="fv-limits__rta-both">
                      <div className="fv-limits__rta-both-item">
                        <span className="fv-limits__rta-both-label">UTC</span>
                        <span className="fv-limits__rta-both-value">{fmtDT(rtaTimes.utc)}</span>
                      </div>
                      <div className="fv-limits__rta-both-item">
                        <span className="fv-limits__rta-both-label">Local (LT)</span>
                        <span className="fv-limits__rta-both-value">{fmtDT(rtaTimes.lt)}</span>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="fv-limits__section">
                  <h4>Speed / Cons Constraint</h4>
                  <div className="fv-limits__grid">
                    <Field label="Min Speed" value={draft.speedCons.minSpeed} onChange={(v) => setSection('speedCons', { ...draft.speedCons, minSpeed: v })} suffix="kt" step="0.1" />
                    <Field label="Max Speed" value={draft.speedCons.maxSpeed} onChange={(v) => setSection('speedCons', { ...draft.speedCons, maxSpeed: v })} suffix="kt" step="0.1" />
                    <Field label="Min RPM" value={draft.speedCons.minRpm} onChange={(v) => setSection('speedCons', { ...draft.speedCons, minRpm: v })} step="1" />
                    <Field label="Max RPM" value={draft.speedCons.maxRpm} onChange={(v) => setSection('speedCons', { ...draft.speedCons, maxRpm: v })} step="1" />
                    <Field label="Max FO / Day" value={draft.speedCons.maxFoPerDay} onChange={(v) => setSection('speedCons', { ...draft.speedCons, maxFoPerDay: v })} suffix="mt" step="0.1" />
                    <Field label="Max GO / Day" value={draft.speedCons.maxGoPerDay} onChange={(v) => setSection('speedCons', { ...draft.speedCons, maxGoPerDay: v })} suffix="mt" step="0.1" />
                  </div>
                </section>

                <section className="fv-limits__section">
                  <h4>Requirements / Notes</h4>
                  <textarea
                    className="fv-limits__textarea"
                    rows={4}
                    placeholder="Add any additional voyage requirements or constraints…"
                    value={draft.requirements}
                    onChange={(e) => setSection('requirements', e.target.value)}
                  />
                </section>
              </div>
            )}
          </aside>
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
                      <span className="fv-limits__log-when">
                        {new Date(h.at).toLocaleString()}
                      </span>
                      <span className="fv-limits__log-by">
                        <i className="fas fa-user" aria-hidden="true" /> {h.by}
                      </span>
                      <span className="fv-limits__log-what">{h.summary}</span>
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

function OverviewCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fv-limits__card">
      <h3 className="fv-limits__card-title">
        <i className={`fas ${icon}`} aria-hidden="true" /> {title}
      </h3>
      <dl className="fv-limits__card-list">{children}</dl>
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
