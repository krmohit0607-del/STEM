import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { accountNames } from '../data/clients';
import { useWorldPorts } from '../data/ports';
import { addNotification } from '../data/workflow';
import { PortInput } from './PortInput';
import { VesselSearchInput } from './VesselSearchInput';
import { VoyageDetailsPage } from './VoyageDetailsPage';

/**
 * Create New — `/voyage/new?type=estimation|operations|performance`.
 *
 * Estimation and Operations use their own module-specific field sets.
 * Performance reuses the original Voyage Details form in "create" mode.
 */

type CreateType = 'estimation' | 'operations' | 'performance';

const TYPES: { id: CreateType; label: string; icon: string; route: string; module: string }[] = [
  { id: 'estimation', label: 'Estimation', icon: 'fa-file-signature', route: '/chartering', module: 'Chartering' },
  { id: 'operations', label: 'Under Operations', icon: 'fa-clipboard-list', route: '/operations', module: 'Operations' },
  { id: 'performance', label: 'Performance', icon: 'fa-gauge-high', route: '/reports/performance', module: 'Performance' },
];

const FIX_TYPES = [
  'TCIN-VOUT',
  'TCIN-TCOUT',
  'VIN-VOUT',
  'VOUT',
  'TCOUT',
  'OWN-VOUT',
];

const CARGO_UNITS = ['MT', 'CBM', 'TEU', 'Units'];

interface FormState {
  vessel: string;
  imo: string;
  fixType: string;
  account: string;
  voyageNo: string;
  loadPort: string;
  dischPort: string;
  cargo: string;
  quantity: string;
  unit: string;
  laycanFrom: string;
  laycanTo: string;
  etd: string;
  eta: string;
  pic: string;
  freightBasis: string;
  rate: string;
  periodFrom: string;
  periodTo: string;
  cpSpeed: string;
  cpCons: string;
  notes: string;
}

const BLANK: FormState = {
  vessel: '',
  imo: '',
  fixType: FIX_TYPES[0],
  account: '',
  voyageNo: '',
  loadPort: '',
  dischPort: '',
  cargo: '',
  quantity: '',
  unit: 'MT',
  laycanFrom: '',
  laycanTo: '',
  etd: '',
  eta: '',
  pic: '',
  freightBasis: 'Per MT',
  rate: '',
  periodFrom: '',
  periodTo: '',
  cpSpeed: '',
  cpCons: '',
  notes: '',
};

export function CreateVoyagePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialType = (params.get('type') as CreateType) || 'estimation';
  const [type, setType] = useState<CreateType>(
    TYPES.some((x) => x.id === initialType) ? initialType : 'estimation',
  );
  const [form, setForm] = useState<FormState>(BLANK);

  const ports = useWorldPorts();
  const accounts = useMemo(() => accountNames(), []);
  const active = TYPES.find((x) => x.id === type)!;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const canCreate = form.vessel.trim().length > 0;

  const create = () => {
    if (!canCreate) return;
    addNotification(
      `New ${active.label} created for ${form.vessel}${form.voyageNo ? ` (Voyage ${form.voyageNo})` : ''}.`,
      active.module,
    );
    navigate(active.route);
  };

  // Performance keeps the original Voyage Details create form unchanged.
  if (type === 'performance') {
    return <VoyageDetailsPage mode="create" />;
  }

  return (
    <div className="fv-voyage fv-create">
      <header className="fv-voyage__header">
        <div className="fv-voyage__heading">
          <span className="fv-voyage__heading-icon" aria-hidden="true">
            <i className={`fas ${active.icon}`} />
          </span>
          <div>
            <h1>Create New</h1>
            <p className="fv-voyage__sub">Choose what to create, then fill in the details.</p>
          </div>
        </div>
      </header>

      {/* Type selector */}
      <div className="fv-create__types" role="tablist" aria-label="Create type">
        {TYPES.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={type === x.id}
            className={`fv-create__type${type === x.id ? ' fv-create__type--active' : ''}`}
            onClick={() => setType(x.id)}
          >
            <i className={`fas ${x.icon}`} aria-hidden="true" />
            <span>{x.label}</span>
          </button>
        ))}
      </div>

      <section className="fv-voyage__card">
        <header className="fv-voyage__card-head">
          <h2 className="fv-voyage__card-title">{active.label} details</h2>
        </header>
        <div className="fv-voyage__card-body">
          {/* Common: vessel */}
          <div className="fv-voyage__cols fv-voyage__cols--2">
            <div className="fv-voyage__col">
              <div className="fv-voyage__info">
                <span className="fv-voyage__info-label">Vessel</span>
                <VesselSearchInput
                  value={form.vessel}
                  placeholder="Search vessel or IMO…"
                  onChange={(name) => set('vessel', name)}
                  onPick={(v) => setForm((p) => ({ ...p, vessel: v.name, imo: v.imo || p.imo }))}
                />
              </div>
            </div>
            <div className="fv-voyage__col">
              <LabeledInput label="IMO" value={form.imo} onChange={(v) => set('imo', v)} />
            </div>
          </div>

          {type === 'estimation' && (
            <>
              <div className="fv-voyage__cols fv-voyage__cols--3">
                <LabeledSelect label="Fix Type" value={form.fixType} onChange={(v) => set('fixType', v)} options={FIX_TYPES} />
                <LabeledDatalist label="Account" value={form.account} onChange={(v) => set('account', v)} options={accounts} />
                <LabeledInput label="PIC" value={form.pic} onChange={(v) => set('pic', v)} />
              </div>
              <div className="fv-voyage__cols fv-voyage__cols--2">
                <LabeledPort label="Load Port" value={form.loadPort} onChange={(v) => set('loadPort', v)} ports={ports} />
                <LabeledPort label="Discharge Port" value={form.dischPort} onChange={(v) => set('dischPort', v)} ports={ports} />
              </div>
              <div className="fv-voyage__cols fv-voyage__cols--3">
                <LabeledInput label="Cargo" value={form.cargo} onChange={(v) => set('cargo', v)} />
                <LabeledInput label="Quantity" value={form.quantity} onChange={(v) => set('quantity', v)} type="number" />
                <LabeledSelect label="Unit" value={form.unit} onChange={(v) => set('unit', v)} options={CARGO_UNITS} />
              </div>
              <div className="fv-voyage__cols fv-voyage__cols--3">
                <LabeledInput label="Laycan From" value={form.laycanFrom} onChange={(v) => set('laycanFrom', v)} type="date" />
                <LabeledInput label="Laycan To" value={form.laycanTo} onChange={(v) => set('laycanTo', v)} type="date" />
                <LabeledInput label="Freight Rate" value={form.rate} onChange={(v) => set('rate', v)} type="number" />
              </div>
            </>
          )}

          {type === 'operations' && (
            <>
              <div className="fv-voyage__cols fv-voyage__cols--3">
                <LabeledInput label="Voyage No" value={form.voyageNo} onChange={(v) => set('voyageNo', v)} />
                <LabeledDatalist label="Account" value={form.account} onChange={(v) => set('account', v)} options={accounts} />
                <LabeledInput label="PIC" value={form.pic} onChange={(v) => set('pic', v)} />
              </div>
              <div className="fv-voyage__cols fv-voyage__cols--2">
                <LabeledPort label="Load Port" value={form.loadPort} onChange={(v) => set('loadPort', v)} ports={ports} />
                <LabeledPort label="Discharge Port" value={form.dischPort} onChange={(v) => set('dischPort', v)} ports={ports} />
              </div>
              <div className="fv-voyage__cols fv-voyage__cols--2">
                <LabeledInput label="ETD" value={form.etd} onChange={(v) => set('etd', v)} type="datetime-local" />
                <LabeledInput label="ETA" value={form.eta} onChange={(v) => set('eta', v)} type="datetime-local" />
              </div>
              <div className="fv-voyage__cols fv-voyage__cols--3">
                <LabeledInput label="Cargo" value={form.cargo} onChange={(v) => set('cargo', v)} />
                <LabeledInput label="Quantity" value={form.quantity} onChange={(v) => set('quantity', v)} type="number" />
                <LabeledSelect label="Unit" value={form.unit} onChange={(v) => set('unit', v)} options={CARGO_UNITS} />
              </div>
            </>
          )}

          <div className="fv-voyage__cols fv-voyage__cols--1">
            <div className="fv-voyage__info">
              <span className="fv-voyage__info-label">Notes</span>
              <textarea
                className="fv-voyage__input"
                rows={3}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="fv-create__actions">
        <button type="button" className="fv-voyage__btn" onClick={() => navigate(-1)}>
          Cancel
        </button>
        <button
          type="button"
          className="fv-voyage__btn fv-voyage__btn--primary"
          onClick={create}
          disabled={!canCreate}
        >
          <i className="fas fa-check" aria-hidden="true" /> Create {active.label}
        </button>
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  type,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="fv-voyage__info">
      <span className="fv-voyage__info-label">{label}</span>
      <input
        className="fv-voyage__input"
        type={type ?? 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function LabeledSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="fv-voyage__info">
      <span className="fv-voyage__info-label">{label}</span>
      <select className="fv-voyage__input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function LabeledDatalist({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const listId = `fv-create-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="fv-voyage__info">
      <span className="fv-voyage__info-label">{label}</span>
      <input
        className="fv-voyage__input"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </div>
  );
}

function LabeledPort({
  label,
  value,
  onChange,
  ports,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  ports: ReturnType<typeof useWorldPorts>;
}) {
  return (
    <div className="fv-voyage__info">
      <span className="fv-voyage__info-label">{label}</span>
      <PortInput value={value} onChange={onChange} ports={ports} placeholder="Search port…" />
    </div>
  );
}
