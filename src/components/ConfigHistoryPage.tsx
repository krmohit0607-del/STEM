import { useMemo } from 'react';

import { useL } from '../i18n/LocalizationProvider';
import { useSelectedVoyage } from '../data/selectedVoyage';
import { buildEmptyView, buildView } from './voyage/buildView';

/**
 * Configuration History page — `/configuration-history`.
 *
 * A standalone audit log of every change made to the selected voyage, starting
 * from when it was created. Each row shows who made the change, when it was
 * made, what changed and the value before and after the change.
 */
export function ConfigHistoryPage() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const selectedVoyage = useSelectedVoyage();
  const view = useMemo(
    () => (selectedVoyage ? buildView(selectedVoyage) : buildEmptyView()),
    [selectedVoyage],
  );

  // Most recent change first.
  const records = [...view.changeHistory].reverse();

  return (
    <div className="fv-voyage">
      <header className="fv-voyage__header">
        <div className="fv-voyage__heading">
          <span className="fv-voyage__heading-icon" aria-hidden="true">
            <i className="fas fa-clock-rotate-left" />
          </span>
          <div>
            <h1>{t('configurationHistory', 'Configuration History')}</h1>
            <p className="fv-voyage__sub">
              {view.vesselName || '—'} · IMO {view.imo || '—'} ·{' '}
              {records.length} {records.length === 1 ? 'change' : 'changes'}
            </p>
          </div>
        </div>
      </header>

      <div className="fv-voyage__card">
        <div className="fv-voyage__card-head">
          <span className="fv-voyage__card-title">
            {t('configurationHistory', 'CONFIGURATION HISTORY')}
          </span>
        </div>
        <div className="fv-voyage__card-body">
          <div className="fv-voyage__dense">
            {records.length === 0 ? (
              <p className="fv-voyage__notes">No changes recorded yet.</p>
            ) : (
              <table className="fv-voyage__history">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Date &amp; Time</th>
                    <th>Change</th>
                    <th>Before</th>
                    <th>After</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i) => (
                    <tr key={`${r.timestamp}-${i}`}>
                      <td>{r.user || '—'}</td>
                      <td className="fv-voyage__history-time">{r.timestamp || '—'}</td>
                      <td>{r.change || '—'}</td>
                      <td className="fv-voyage__history-before">{r.before || '—'}</td>
                      <td className="fv-voyage__history-after">{r.after || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
