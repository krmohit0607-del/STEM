import { Card } from './primitives';
import { type VoyageView } from './types';

interface Props {
  view: VoyageView;
  title: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

/**
 * Configuration History — an audit log of every change made to the voyage,
 * starting from when it was created. Each row shows who made the change, when
 * it was made and what information changed.
 */
export function ConfigHistorySection({ view, title, collapsed, onToggleCollapse }: Props) {
  // Most recent change first.
  const records = [...view.changeHistory].reverse();

  return (
    <Card id="configHistory" title={title} collapsed={collapsed} onToggleCollapse={onToggleCollapse}>
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
    </Card>
  );
}
