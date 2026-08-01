import {
  type Lifecycle,
  type WorkflowModule,
  moduleLifecycleOf,
  setModuleLifecycle,
  useModuleLifecycles,
} from '../data/workflow';

const OPTIONS: { key: Lifecycle; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'complete', label: 'Completed' },
  { key: 'closed', label: 'Closed' },
];

/**
 * Manual Active / Completed / Closed status selector for a voyage within a
 * module (Operations / Postfix). Writing here moves the vessel between the
 * sidebar buckets.
 */
export function WorkflowStatusSelect({
  module,
  voyageId,
}: {
  module: WorkflowModule;
  voyageId: string;
}) {
  const snap = useModuleLifecycles();
  const value = moduleLifecycleOf(snap, module, voyageId) ?? 'active';
  return (
    <label className="fv-status-select" title="Change status">
      <span className="fv-status-select__label">Status</span>
      <select
        className={`fv-status-select__input fv-status-select__input--${value}`}
        value={value}
        onChange={(e) => setModuleLifecycle(module, voyageId, e.target.value as Lifecycle)}
      >
        {OPTIONS.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
