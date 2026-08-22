import { useMemo, useRef, useState, type ChangeEvent } from 'react';

import { useL } from '../i18n/LocalizationProvider';
import {
  CARGO_CATEGORIES,
  CARGO_LOADING_METHODS,
  CARGO_STATUSES,
  CARGO_TEMPERATURE_TYPES,
  CARGO_VESSEL_TYPES,
  downloadCargoTemplateCsv,
  deleteCargo,
  duplicateCargo,
  emptyCargoRecord,
  exportCargoCsv,
  importValidCargoRows,
  isDuplicateCargoCode,
  parseCargoImport,
  setCargoStatus,
  upsertCargo,
  useCargoMaster,
  type CargoCategory,
  type CargoImportRow,
  type CargoRecord,
} from '../data/cargoMaster';

/** Trigger a client-side download of a text file (CSV). */
function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Which extra field groups are relevant for a given category. */
function categoryFlags(category: CargoCategory | '') {
  return {
    bulk: category === 'Dry Bulk',
    liquid: category === 'Liquid Bulk',
    gas: category === 'Gas',
    breakbulk: category === 'Breakbulk',
    roro: category === 'Ro-Ro',
    reefer: category === 'Reefer',
    project: category === 'Project Cargo',
    container: category === 'Container',
    livestock: category === 'Livestock',
    piece: category === 'Breakbulk' || category === 'Ro-Ro' || category === 'Project Cargo',
  };
}

export function CargoMasterPanel() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const cargoes = useCargoMaster();
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [vesselTypeFilter, setVesselTypeFilter] = useState('');
  const [editing, setEditing] = useState<CargoRecord | null>(null);
  const [viewOnly, setViewOnly] = useState(false);
  const [message, setMessage] = useState('');
  const [importRows, setImportRows] = useState<CargoImportRow[] | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      cargoes.filter((c) => {
        if (categoryFilter && c.category !== categoryFilter) return false;
        if (statusFilter && c.status !== statusFilter) return false;
        if (vesselTypeFilter && !c.vesselTypes.includes(vesselTypeFilter)) return false;
        if (!q) return true;
        return (
          c.cargoName.toLowerCase().includes(q) ||
          c.cargoCode.toLowerCase().includes(q) ||
          c.unNumber.toLowerCase().includes(q)
        );
      }),
    [cargoes, q, categoryFilter, statusFilter, vesselTypeFilter],
  );

  const startNew = () => {
    setViewOnly(false);
    setEditing(emptyCargoRecord());
  };
  const startEdit = (c: CargoRecord) => {
    setViewOnly(false);
    setEditing({ ...c, vesselTypes: [...c.vesselTypes] });
  };
  const startView = (c: CargoRecord) => {
    setViewOnly(true);
    setEditing({ ...c, vesselTypes: [...c.vesselTypes] });
  };

  const onDuplicate = (c: CargoRecord) => {
    duplicateCargo(c.cargoId);
    setMessage(`Duplicated "${c.cargoName}".`);
  };
  const onDeactivate = (c: CargoRecord) => {
    setCargoStatus(c.cargoId, c.status === 'Active' ? 'Inactive' : 'Active');
  };
  const onDelete = (c: CargoRecord) => {
    if (!window.confirm(t('confirmDeleteCargo', `Delete the cargo "${c.cargoName}"?`))) return;
    deleteCargo(c.cargoId);
  };

  const onExport = () => downloadTextFile('cargo-master-export.csv', exportCargoCsv(filtered));
  const onTemplate = () => downloadTextFile('cargo-master-template.csv', downloadCargoTemplateCsv());

  const onImportFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const rows = parseCargoImport(text);
      setImportRows(rows);
    };
    reader.readAsText(file);
  };

  const commitImport = () => {
    if (!importRows) return;
    const n = importValidCargoRows(importRows);
    setMessage(`${n} cargo record(s) imported.`);
    setImportRows(null);
  };

  if (editing) {
    return (
      <CargoForm
        t={t}
        value={editing}
        viewOnly={viewOnly}
        onChange={setEditing}
        onCancel={() => setEditing(null)}
        onSave={() => {
          upsertCargo(editing);
          setEditing(null);
          setMessage(`Saved "${editing.cargoName}".`);
        }}
      />
    );
  }

  return (
    <div className="fv-email-templates">
      <div className="fv-email-templates__bar">
        <div className="fv-email-templates__search">
          <i className="fas fa-magnifying-glass" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchCargo', 'Search cargo name, code or UN number…')}
            aria-label={t('searchCargo', 'Search cargo')}
          />
        </div>
        <div className="fv-email-templates__bar-actions">
          <button type="button" className="fv-email-templates__new" onClick={startNew}>
            <i className="fas fa-plus" aria-hidden="true" /> {t('addCargo', 'Add Cargo')}
          </button>
          <button type="button" className="fv-email-template__btn" onClick={() => importRef.current?.click()}>
            <i className="fas fa-file-import" aria-hidden="true" /> {t('import', 'Import')}
          </button>
          <input ref={importRef} type="file" accept=".csv" hidden onChange={onImportFile} />
          <button type="button" className="fv-email-template__btn" onClick={onExport}>
            <i className="fas fa-file-export" aria-hidden="true" /> {t('export', 'Export')}
          </button>
          <button type="button" className="fv-email-template__btn" onClick={onTemplate}>
            <i className="fas fa-download" aria-hidden="true" /> {t('downloadTemplate', 'Download Template')}
          </button>
        </div>
      </div>

      <div className="fv-cargo__filters">
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">{t('allCategories', 'All Categories')}</option>
          {CARGO_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">{t('allStatuses', 'All Statuses')}</option>
          {CARGO_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={vesselTypeFilter} onChange={(e) => setVesselTypeFilter(e.target.value)}>
          <option value="">{t('allVesselTypes', 'All Vessel Types')}</option>
          {CARGO_VESSEL_TYPES.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <span className="fv-cargo__count">{filtered.length} cargo(es)</span>
      </div>

      {message && (
        <p className="fv-email-templates__empty" role="status">
          <i className="fas fa-circle-check" aria-hidden="true" /> {message}
        </p>
      )}

      {importRows && (
        <ImportPreview
          t={t}
          rows={importRows}
          onCancel={() => setImportRows(null)}
          onCommit={commitImport}
        />
      )}

      {filtered.length === 0 ? (
        <p className="fv-email-templates__empty">{t('noCargoRecords', 'No cargo records match your filters.')}</p>
      ) : (
        <div className="fv-cargo__table-scroll">
          <table className="fv-ports-table">
            <thead>
              <tr>
                <th>{t('cargoCode', 'Cargo Code')}</th>
                <th>{t('cargoName', 'Cargo Name')}</th>
                <th>{t('category', 'Category')}</th>
                <th>{t('subCategory', 'Sub Category')}</th>
                <th>{t('classification', 'IMO / IMSBC / IBC / IGC')}</th>
                <th>{t('unNumber', 'UN Number')}</th>
                <th>{t('density', 'Density')}</th>
                <th>{t('stowageFactor', 'Stowage Factor')}</th>
                <th>{t('temperature', 'Temperature')}</th>
                <th>{t('typicalParcelSize', 'Typical Parcel Size')}</th>
                <th>{t('suitableVesselType', 'Suitable Vessel Type')}</th>
                <th>{t('status', 'Status')}</th>
                <th aria-label={t('actions', 'Actions')} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.cargoId}>
                  <td>{c.cargoCode}</td>
                  <td>{c.cargoName}</td>
                  <td>{c.category}</td>
                  <td>{c.subCategory || '—'}</td>
                  <td>{[c.imoClassification, c.imsbcGroup, c.ibcClassification, c.igcClassification].filter(Boolean).join(' / ') || '—'}</td>
                  <td>{c.unNumber || '—'}</td>
                  <td>{c.densityMin || c.densityMax ? `${c.densityMin || '—'}–${c.densityMax || '—'} ${c.densityUnit}` : '—'}</td>
                  <td>{c.stowageFactorMin || c.stowageFactorMax ? `${c.stowageFactorMin || '—'}–${c.stowageFactorMax || '—'} ${c.stowageFactorUnit}` : '—'}</td>
                  <td>{c.temperatureType || '—'}</td>
                  <td>{c.typicalParcelSize || '—'}</td>
                  <td>{c.vesselTypes.join(', ') || '—'}</td>
                  <td>
                    <span className={`fv-client-card__status ${c.status === 'Active' ? 'fv-client-card__status--on' : 'fv-client-card__status--off'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td>
                    <div className="fv-ports-table__actions">
                      <button type="button" className="fv-email-template__btn" onClick={() => startView(c)} title={t('view', 'View')}>
                        <i className="fas fa-eye" aria-hidden="true" />
                      </button>
                      <button type="button" className="fv-email-template__btn" onClick={() => startEdit(c)} title={t('edit', 'Edit')}>
                        <i className="fas fa-pen" aria-hidden="true" />
                      </button>
                      <button type="button" className="fv-email-template__btn" onClick={() => onDuplicate(c)} title={t('duplicate', 'Duplicate')}>
                        <i className="fas fa-copy" aria-hidden="true" />
                      </button>
                      <button type="button" className="fv-email-template__btn" onClick={() => onDeactivate(c)} title={c.status === 'Active' ? t('deactivate', 'Deactivate') : t('activate', 'Activate')}>
                        <i className={`fas ${c.status === 'Active' ? 'fa-ban' : 'fa-check'}`} aria-hidden="true" />
                      </button>
                      <button type="button" className="fv-email-template__btn fv-email-template__btn--danger" onClick={() => onDelete(c)} title={t('delete', 'Delete')}>
                        <i className="fas fa-trash" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ImportPreview({
  t,
  rows,
  onCancel,
  onCommit,
}: {
  t: (key: string, fallback: string) => string;
  rows: CargoImportRow[];
  onCancel: () => void;
  onCommit: () => void;
}) {
  const valid = rows.filter((r) => r.status === 'valid').length;
  const duplicate = rows.filter((r) => r.status === 'duplicate').length;
  const invalid = rows.filter((r) => r.status === 'invalid').length;

  return (
    <div className="fv-cargo__import">
      <p className="fv-cargo__import-summary">
        {rows.length} records detected — <strong>{valid} valid</strong>, {duplicate} duplicate, {invalid} invalid
      </p>
      <div className="fv-cargo__table-scroll">
        <table className="fv-ports-table">
          <thead>
            <tr>
              <th>{t('row', 'Row')}</th>
              <th>{t('cargoCode', 'Cargo Code')}</th>
              <th>{t('cargoName', 'Cargo Name')}</th>
              <th>{t('status', 'Status')}</th>
              <th>{t('reason', 'Reason')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.row}>
                <td>{r.row}</td>
                <td>{r.data.cargoCode || '—'}</td>
                <td>{r.data.cargoName || '—'}</td>
                <td>
                  <span className={`fv-cargo__badge fv-cargo__badge--${r.status}`}>{r.status}</span>
                </td>
                <td>{r.reason || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="fv-email-template__edit-actions">
        <button type="button" className="fv-email-template__btn" onClick={onCancel}>
          {t('cancel', 'Cancel')}
        </button>
        <button type="button" className="fv-email-template__btn fv-email-template__btn--primary" disabled={valid === 0} onClick={onCommit}>
          <i className="fas fa-check" aria-hidden="true" /> {t('importValidRecords', `Import Valid Records (${valid})`)}
        </button>
      </div>
    </div>
  );
}

function CargoForm({
  t,
  value,
  viewOnly,
  onChange,
  onSave,
  onCancel,
}: {
  t: (key: string, fallback: string) => string;
  value: CargoRecord;
  viewOnly: boolean;
  onChange: (rec: CargoRecord) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = <K extends keyof CargoRecord>(key: K, v: CargoRecord[K]) => onChange({ ...value, [key]: v });
  const flags = categoryFlags(value.category);
  const codeTaken = value.cargoCode.trim().length > 0 && isDuplicateCargoCode(value.cargoCode, value.cargoId || undefined);
  const canSave =
    !viewOnly &&
    value.cargoName.trim().length > 0 &&
    value.cargoCode.trim().length > 0 &&
    value.category.trim().length > 0 &&
    !codeTaken;

  const toggleVesselType = (vt: string) => {
    const has = value.vesselTypes.includes(vt);
    set('vesselTypes', has ? value.vesselTypes.filter((x) => x !== vt) : [...value.vesselTypes, vt]);
  };

  return (
    <form
      className="fv-email-template fv-email-template--edit"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSave();
      }}
    >
      <fieldset className="fv-vessel-group" disabled={viewOnly}>
        <legend>{t('basicInformation', 'Basic Information')}</legend>
        <div className="fv-vessel-group__grid">
          <label className="fv-email-template__field">
            <span>{t('cargoName', 'Cargo Name')} <em className="fv-vessel-req">*</em></span>
            <input value={value.cargoName} onChange={(e) => set('cargoName', e.target.value)} />
          </label>
          <label className="fv-email-template__field">
            <span>{t('cargoCode', 'Cargo Code')} <em className="fv-vessel-req">*</em></span>
            <input value={value.cargoCode} onChange={(e) => set('cargoCode', e.target.value.toUpperCase())} />
            {codeTaken && <span className="fv-port-coord-hint">{t('cargoCodeTaken', 'This code is already used by another cargo.')}</span>}
          </label>
          <label className="fv-email-template__field">
            <span>{t('category', 'Category')} <em className="fv-vessel-req">*</em></span>
            <select value={value.category} onChange={(e) => set('category', e.target.value as CargoCategory)}>
              <option value="">{t('select', 'Select…')}</option>
              {CARGO_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="fv-email-template__field">
            <span>{t('subCategory', 'Sub Category')}</span>
            <input value={value.subCategory} onChange={(e) => set('subCategory', e.target.value)} />
          </label>
          <label className="fv-email-template__field">
            <span>{t('unNumber', 'UN Number')}</span>
            <input value={value.unNumber} onChange={(e) => set('unNumber', e.target.value)} placeholder={t('verifyPlaceholder', 'Verify')} />
          </label>
          <label className="fv-email-template__field">
            <span>{t('classification', 'IMO / IMSBC / IBC / IGC Classification')}</span>
            <input value={value.imoClassification} onChange={(e) => set('imoClassification', e.target.value)} placeholder={t('verifyPlaceholder', 'Verify')} />
          </label>
          <label className="fv-email-template__field">
            <span>{t('status', 'Status')}</span>
            <select value={value.status} onChange={(e) => set('status', e.target.value as CargoRecord['status'])}>
              {CARGO_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="fv-email-template__field fv-cargo__field--full">
          <span>{t('description', 'Description')}</span>
          <textarea rows={2} value={value.description} onChange={(e) => set('description', e.target.value)} />
        </label>
      </fieldset>

      <fieldset className="fv-vessel-group" disabled={viewOnly}>
        <legend>{t('physicalProperties', 'Physical Properties')}</legend>
        <div className="fv-vessel-group__grid">
          <label className="fv-email-template__field">
            <span>{t('densityMin', 'Density Min (MT/m³)')}</span>
            <input type="number" value={value.densityMin} onChange={(e) => set('densityMin', e.target.value)} />
          </label>
          <label className="fv-email-template__field">
            <span>{t('densityMax', 'Density Max (MT/m³)')}</span>
            <input type="number" value={value.densityMax} onChange={(e) => set('densityMax', e.target.value)} />
          </label>
          <label className="fv-email-template__field">
            <span>{t('stowageFactorMin', 'Stowage Factor Min (m³/MT)')}</span>
            <input type="number" value={value.stowageFactorMin} onChange={(e) => set('stowageFactorMin', e.target.value)} />
          </label>
          <label className="fv-email-template__field">
            <span>{t('stowageFactorMax', 'Stowage Factor Max (m³/MT)')}</span>
            <input type="number" value={value.stowageFactorMax} onChange={(e) => set('stowageFactorMax', e.target.value)} />
          </label>
          {flags.bulk && (
            <>
              <label className="fv-email-template__field">
                <span>{t('particleSize', 'Typical Particle Size (mm)')}</span>
                <input value={value.particleSize} onChange={(e) => set('particleSize', e.target.value)} placeholder="10–50" />
              </label>
              <label className="fv-email-template__field">
                <span>{t('angleOfRepose', 'Angle of Repose (°)')}</span>
                <input type="number" value={value.angleOfRepose} onChange={(e) => set('angleOfRepose', e.target.value)} />
              </label>
            </>
          )}
          {flags.gas && (
            <label className="fv-email-template__field">
              <span>{t('boilingPoint', 'Boiling Point (°C)')}</span>
              <input type="number" value={value.boilingPoint} onChange={(e) => set('boilingPoint', e.target.value)} />
            </label>
          )}
          {flags.piece && (
            <>
              <label className="fv-email-template__field">
                <span>{t('pieceWeight', 'Typical Piece Weight (MT/piece)')}</span>
                <input type="number" value={value.pieceWeight} onChange={(e) => set('pieceWeight', e.target.value)} />
              </label>
              <label className="fv-email-template__field">
                <span>{t('length', 'Length (m)')}</span>
                <input type="number" value={value.length} onChange={(e) => set('length', e.target.value)} />
              </label>
              <label className="fv-email-template__field">
                <span>{t('width', 'Width (m)')}</span>
                <input type="number" value={value.width} onChange={(e) => set('width', e.target.value)} />
              </label>
              <label className="fv-email-template__field">
                <span>{t('height', 'Height (m)')}</span>
                <input type="number" value={value.height} onChange={(e) => set('height', e.target.value)} />
              </label>
              <label className="fv-email-template__field fv-cargo__checkbox">
                <input type="checkbox" checked={value.lashingRequired} onChange={(e) => set('lashingRequired', e.target.checked)} />
                <span>{t('lashingRequired', 'Lashing Required')}</span>
              </label>
              {flags.roro && (
                <label className="fv-email-template__field">
                  <span>{t('deckRequirement', 'Deck Requirement')}</span>
                  <input value={value.deckRequirement} onChange={(e) => set('deckRequirement', e.target.value)} />
                </label>
              )}
              {flags.project && (
                <label className="fv-email-template__field">
                  <span>{t('liftingRequirement', 'Lifting Requirement')}</span>
                  <input value={value.liftingRequirement} onChange={(e) => set('liftingRequirement', e.target.value)} />
                </label>
              )}
            </>
          )}
          {flags.gas && (
            <label className="fv-email-template__field">
              <span>{t('tankType', 'Tank Type')}</span>
              <input value={value.tankType} onChange={(e) => set('tankType', e.target.value)} />
            </label>
          )}
          {flags.container && (
            <>
              <label className="fv-email-template__field">
                <span>{t('typicalWeight', 'Typical Weight (MT)')}</span>
                <input type="number" value={value.typicalWeight} onChange={(e) => set('typicalWeight', e.target.value)} />
              </label>
              <label className="fv-email-template__field">
                <span>{t('containerType', 'Container Type')}</span>
                <input value={value.containerType} onChange={(e) => set('containerType', e.target.value)} />
              </label>
              <label className="fv-email-template__field fv-cargo__checkbox">
                <input type="checkbox" checked={value.reeferRequired} onChange={(e) => set('reeferRequired', e.target.checked)} />
                <span>{t('reeferRequired', 'Reefer Required')}</span>
              </label>
            </>
          )}
          {flags.livestock && (
            <>
              <label className="fv-email-template__field">
                <span>{t('typicalWeight', 'Typical Weight (MT)')}</span>
                <input type="number" value={value.typicalWeight} onChange={(e) => set('typicalWeight', e.target.value)} />
              </label>
              <label className="fv-email-template__field">
                <span>{t('animalType', 'Animal Type')}</span>
                <input value={value.animalType} onChange={(e) => set('animalType', e.target.value)} />
              </label>
              <label className="fv-email-template__field">
                <span>{t('ventilationRequirement', 'Ventilation Requirement')}</span>
                <input value={value.ventilationRequirement} onChange={(e) => set('ventilationRequirement', e.target.value)} />
              </label>
            </>
          )}
        </div>
      </fieldset>

      <fieldset className="fv-vessel-group" disabled={viewOnly}>
        <legend>{t('temperature', 'Temperature')}</legend>
        <div className="fv-vessel-group__grid">
          <label className="fv-email-template__field">
            <span>{t('temperatureRequirement', 'Temperature Requirement')}</span>
            <select value={value.temperatureType} onChange={(e) => set('temperatureType', e.target.value as CargoRecord['temperatureType'])}>
              <option value="">{t('select', 'Select…')}</option>
              {CARGO_TEMPERATURE_TYPES.map((tt) => (
                <option key={tt} value={tt}>
                  {tt}
                </option>
              ))}
            </select>
          </label>
          <label className="fv-email-template__field">
            <span>{t('minTemperature', 'Minimum Temperature (°C)')}</span>
            <input type="number" value={value.minTemperature} onChange={(e) => set('minTemperature', e.target.value)} />
          </label>
          <label className="fv-email-template__field">
            <span>{t('maxTemperature', 'Maximum Temperature (°C)')}</span>
            <input type="number" value={value.maxTemperature} onChange={(e) => set('maxTemperature', e.target.value)} />
          </label>
          <label className="fv-email-template__field">
            <span>{t('loadingTemperature', 'Loading Temperature (°C)')}</span>
            <input type="number" value={value.loadingTemperature} onChange={(e) => set('loadingTemperature', e.target.value)} />
          </label>
          <label className="fv-email-template__field">
            <span>{t('carriageTemperature', 'Carriage Temperature (°C)')}</span>
            <input type="number" value={value.carriageTemperature} onChange={(e) => set('carriageTemperature', e.target.value)} />
          </label>
          <label className="fv-email-template__field">
            <span>{t('dischargeTemperature', 'Discharge Temperature (°C)')}</span>
            <input type="number" value={value.dischargeTemperature} onChange={(e) => set('dischargeTemperature', e.target.value)} />
          </label>
          <label className="fv-email-template__field fv-cargo__checkbox">
            <input type="checkbox" checked={value.heatingRequired} onChange={(e) => set('heatingRequired', e.target.checked)} />
            <span>{t('heatingRequired', 'Heating Required')}</span>
          </label>
          <label className="fv-email-template__field fv-cargo__checkbox">
            <input type="checkbox" checked={value.coolingRequired} onChange={(e) => set('coolingRequired', e.target.checked)} />
            <span>{t('coolingRequired', 'Cooling Required')}</span>
          </label>
          {flags.liquid && (
            <label className="fv-email-template__field">
              <span>{t('flashPoint', 'Flash Point (°C)')}</span>
              <input type="number" value={value.flashPoint} onChange={(e) => set('flashPoint', e.target.value)} />
            </label>
          )}
        </div>
      </fieldset>

      <fieldset className="fv-vessel-group" disabled={viewOnly}>
        <legend>{t('safetyImoInfo', 'Safety / Basic IMO Information')}</legend>
        <div className="fv-vessel-group__grid">
          <label className="fv-email-template__field fv-cargo__checkbox">
            <input type="checkbox" checked={value.dangerousCargo} onChange={(e) => set('dangerousCargo', e.target.checked)} />
            <span>{t('dangerousCargo', 'Dangerous Cargo')}</span>
          </label>
          <label className="fv-email-template__field fv-cargo__checkbox">
            <input type="checkbox" checked={value.marinePollutant} onChange={(e) => set('marinePollutant', e.target.checked)} />
            <span>{t('marinePollutant', 'Marine Pollutant')}</span>
          </label>
          {flags.bulk && (
            <>
              <label className="fv-email-template__field fv-cargo__checkbox">
                <input type="checkbox" checked={value.liquefactionRisk} onChange={(e) => set('liquefactionRisk', e.target.checked)} />
                <span>{t('liquefactionRisk', 'Liquefaction Risk')}</span>
              </label>
              <label className="fv-email-template__field fv-cargo__checkbox">
                <input type="checkbox" checked={value.moistureSensitive} onChange={(e) => set('moistureSensitive', e.target.checked)} />
                <span>{t('moistureSensitive', 'Moisture Sensitive')}</span>
              </label>
            </>
          )}
        </div>
      </fieldset>

      <fieldset className="fv-vessel-group" disabled={viewOnly}>
        <legend>{t('vesselCompatibility', 'Vessel Compatibility')}</legend>
        <div className="fv-cargo__chip-row">
          {CARGO_VESSEL_TYPES.map((vt) => (
            <label key={vt} className={`fv-cargo__chip${value.vesselTypes.includes(vt) ? ' fv-cargo__chip--on' : ''}`}>
              <input type="checkbox" checked={value.vesselTypes.includes(vt)} onChange={() => toggleVesselType(vt)} />
              <span>{vt}</span>
            </label>
          ))}
        </div>
        <div className="fv-vessel-group__grid">
          <label className="fv-email-template__field">
            <span>{t('minimumParcelSize', 'Minimum Parcel Size (MT)')}</span>
            <input type="number" value={value.minimumParcelSize} onChange={(e) => set('minimumParcelSize', e.target.value)} />
          </label>
          <label className="fv-email-template__field">
            <span>{t('maximumParcelSize', 'Maximum Parcel Size (MT)')}</span>
            <input type="number" value={value.maximumParcelSize} onChange={(e) => set('maximumParcelSize', e.target.value)} />
          </label>
          <label className="fv-email-template__field">
            <span>{t('typicalParcelSize', 'Typical Parcel Size (MT)')}</span>
            <input type="number" value={value.typicalParcelSize} onChange={(e) => set('typicalParcelSize', e.target.value)} />
          </label>
        </div>
      </fieldset>

      <fieldset className="fv-vessel-group" disabled={viewOnly}>
        <legend>{t('basicOperationalInfo', 'Basic Operational Information')}</legend>
        <div className="fv-vessel-group__grid">
          <label className="fv-email-template__field">
            <span>{t('loadingMethod', 'Loading Method')}</span>
            <select value={value.loadingMethod} onChange={(e) => set('loadingMethod', e.target.value)}>
              <option value="">{t('select', 'Select…')}</option>
              {CARGO_LOADING_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="fv-email-template__field">
            <span>{t('dischargeMethod', 'Discharge Method')}</span>
            <select value={value.dischargeMethod} onChange={(e) => set('dischargeMethod', e.target.value)}>
              <option value="">{t('select', 'Select…')}</option>
              {CARGO_LOADING_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="fv-email-template__field">
            <span>{t('typicalLoadingRate', 'Typical Loading Rate (MT/day)')}</span>
            <input type="number" value={value.typicalLoadingRate} onChange={(e) => set('typicalLoadingRate', e.target.value)} />
          </label>
          <label className="fv-email-template__field">
            <span>{t('typicalDischargeRate', 'Typical Discharge Rate (MT/day)')}</span>
            <input type="number" value={value.typicalDischargeRate} onChange={(e) => set('typicalDischargeRate', e.target.value)} />
          </label>
        </div>
      </fieldset>

      <fieldset className="fv-vessel-group" disabled={viewOnly}>
        <legend>{t('notes', 'Notes')}</legend>
        <label className="fv-email-template__field fv-cargo__field--full">
          <span>{t('cargoNotes', 'Cargo Notes')}</span>
          <textarea rows={3} value={value.cargoNotes} onChange={(e) => set('cargoNotes', e.target.value)} />
        </label>
      </fieldset>

      <div className="fv-email-template__edit-actions">
        <button type="button" className="fv-email-template__btn" onClick={onCancel}>
          {viewOnly ? t('back', 'Back') : t('cancel', 'Cancel')}
        </button>
        {!viewOnly && (
          <button type="submit" className="fv-email-template__btn fv-email-template__btn--primary" disabled={!canSave}>
            <i className="fas fa-check" aria-hidden="true" /> {t('save', 'Save')}
          </button>
        )}
      </div>
    </form>
  );
}
