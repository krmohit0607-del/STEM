import { useEffect, useState } from 'react';

import { optimizationApi, type EtsPolicyApiDto } from '../api/optimizationApi';

/**
 * Settings -> EU ETS emissions. The share of CO2 that route optimization charges at the EUA price: coverage by voyage type
 * (the ports at both ends are matched to their country) times the phase-in share for the year the CO2 is emitted.
 */
export function EtsPolicyPanel() {
  const [policy, setPolicy] = useState<EtsPolicyApiDto | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    optimizationApi
      .getEtsPolicy()
      .then(setPolicy)
      .catch((e) => setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Could not load the policy.' }));
  }, []);

  if (!policy) return <p>{message ? message.text : 'Loading\u2026'}</p>;

  const setPct = (key: 'intraEuCoveragePct' | 'extraEuCoveragePct' | 'unknownCoveragePct', value: string) =>
    setPolicy({ ...policy, [key]: Number(value) });
  const setPhase = (index: number, key: 'year' | 'pct', value: string) =>
    setPolicy({ ...policy, phaseIn: policy.phaseIn.map((row, i) => (i === index ? { ...row, [key]: Number(value) } : row)) });

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      setPolicy(await optimizationApi.saveEtsPolicy(policy));
      setMessage({ kind: 'ok', text: 'EU ETS policy saved. New optimization runs use it.' });
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Could not save the policy.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="fv-email-template fv-email-template--edit"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p>
        Controls how much of a route&rsquo;s CO&#8322; is charged at the EUA price when optimizing. Coverage depends on whether the ports at both ends are in
        the EU/EEA; the phase-in share applies to the year the CO&#8322; is emitted. {policy.isConfigured
          ? 'This company policy is active.'
          : 'No policy is saved yet, so all CO\u2082 is charged at the EUA price. The values below are the regulation defaults; edit and save to activate them.'}
      </p>
      <fieldset className="fv-vessel-group">
        <legend>Coverage by voyage type (%)</legend>
        <div className="fv-vessel-group__grid">
          <label className="fv-email-template__field">
            <span>Between two EU/EEA ports</span>
            <input type="number" min="0" max="100" value={policy.intraEuCoveragePct} onChange={(e) => setPct('intraEuCoveragePct', e.target.value)} />
          </label>
          <label className="fv-email-template__field">
            <span>One end in the EU/EEA</span>
            <input type="number" min="0" max="100" value={policy.extraEuCoveragePct} onChange={(e) => setPct('extraEuCoveragePct', e.target.value)} />
          </label>
          <label className="fv-email-template__field">
            <span>Ports not recognised</span>
            <input type="number" min="0" max="100" value={policy.unknownCoveragePct} onChange={(e) => setPct('unknownCoveragePct', e.target.value)} />
          </label>
        </div>
      </fieldset>

      <fieldset className="fv-vessel-group">
        <legend>Phase-in by emission year (% of covered CO&#8322; surrendered)</legend>
        <div className="fv-voyage__table-scroll">
          <table className="fv-voyage__dtable">
            <thead>
              <tr><th>Year</th><th>Share (%)</th><th /></tr>
            </thead>
            <tbody>
              {policy.phaseIn.map((row, index) => (
                <tr key={index}>
                  <td><input className="fv-voyage__cell-input" type="number" value={row.year} onChange={(e) => setPhase(index, 'year', e.target.value)} /></td>
                  <td><input className="fv-voyage__cell-input" type="number" min="0" max="100" value={row.pct} onChange={(e) => setPhase(index, 'pct', e.target.value)} /></td>
                  <td>
                    <button
                      type="button"
                      className="fv-email-template__btn"
                      aria-label="Remove year"
                      onClick={() => setPolicy({ ...policy, phaseIn: policy.phaseIn.filter((_, i) => i !== index) })}
                    >
                      <i className="fas fa-xmark" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className="fv-email-template__btn"
          onClick={() => {
            const last = policy.phaseIn[policy.phaseIn.length - 1];
            setPolicy({ ...policy, phaseIn: [...policy.phaseIn, { year: (last?.year ?? 2025) + 1, pct: last?.pct ?? 100 }] });
          }}
        >
          <i className="fas fa-plus" aria-hidden="true" /> Add year
        </button>
        <p className="fv-vessel-req">Years after the last row keep the last share; years before the first row are not charged.</p>
      </fieldset>

      {message && <p role="alert" className={message.kind === 'error' ? 'fv-opt-pop__note--error' : undefined}>{message.text}</p>}
      <div className="fv-email-template__edit-actions">
        <button type="submit" className="fv-email-template__btn fv-email-template__btn--primary" disabled={saving}>
          <i className="fas fa-check" aria-hidden="true" /> {saving ? 'Saving\u2026' : 'Save'}
        </button>
      </div>
    </form>
  );
}
