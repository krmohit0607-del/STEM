import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useVoyages } from '../data/voyages';

const DAY = 86_400_000;
const today = () => new Date();
const daysUntil = (date: string) => { const d = new Date(date); return Number.isNaN(d.getTime()) ? null : Math.ceil((d.getTime() - today().getTime()) / DAY); };
const tone = (days: number | null) => days == null ? '' : days <= 0 ? ' fv-cb__deadline--red' : days <= 5 ? ' fv-cb__deadline--amber' : ' fv-cb__deadline--green';
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

type Book = 'cargo' | 'tonnage';
type Cargo = { id: string; commodity: string; cargoType: string; quantity: string; tolerance: string; loadPort: string; dischargePort: string; loadRate: string; dischargeRate: string; terms: string; laycanStart: string; laycanEnd: string; voyageType: string; openDate: string; nominationDeadline: string; cargoStatus: string; commercialStatus: string; pic: string; estimationStatus: string; account: string; remarks: string };
type Tonnage = { id: string; vessel: string; imo: string; vesselType: string; dwt: string; flag: string; openArea: string; openPort: string; openDate: string; earliestOpen: string; latestOpen: string; voyageType: string; source: string; commercialStatus: string; pic: string; estimationStatus: string; owner: string; remarks: string };
type SortDirection = 'asc' | 'desc';

const CARGO_STATUS = ['All', 'Open', 'Offered', 'Booked', 'Fixed', 'Cancelled'];
const CARGO_COMMERCIAL = ['New', 'Reviewing', 'Quoting', 'Offered', 'Negotiating', 'Agreed', 'Booked', 'Fixed', 'Cancelled', 'Expired'];
const TONNAGE_STATUS = ['All', 'Open', 'Offered', 'On Subs', 'Fixed', 'Unavailable'];
const TONNAGE_COMMERCIAL = ['Open', 'Offered', 'Negotiating', 'On Subs', 'Fixed', 'Unavailable', 'Cancelled'];
const VOYAGE_TYPES = ['Time Charter', 'Voyage Charter', 'TCTIN-VOUT', 'TCIN-TCOUT'];

const seedCargo: Cargo[] = [
  { id: 'CG-2608-001', commodity: 'Iron Ore', cargoType: 'Bulk', quantity: '170,000', tolerance: '±10%', loadPort: 'Port Hedland', dischargePort: 'Qingdao', loadRate: '90,000 MT/day', dischargeRate: '70,000 MT/day', terms: 'FIOST', laycanStart: '2026-08-28', laycanEnd: '2026-09-03', voyageType: 'Voyage Charter', openDate: '2026-08-18', nominationDeadline: '2026-08-24', cargoStatus: 'Open', commercialStatus: 'Reviewing', pic: 'Amit', estimationStatus: 'Not Created', account: 'Cargill', remarks: '' },
  { id: 'CG-2608-002', commodity: 'Steam Coal', cargoType: 'Bulk', quantity: '75,000', tolerance: '±5%', loadPort: 'Richards Bay', dischargePort: 'Paradip', loadRate: '45,000 MT/day', dischargeRate: '35,000 MT/day', terms: 'FIO', laycanStart: '2026-09-04', laycanEnd: '2026-09-10', voyageType: 'Voyage Charter', openDate: '2026-08-15', nominationDeadline: '2026-08-27', cargoStatus: 'Offered', commercialStatus: 'Offered', pic: 'Rahul', estimationStatus: 'Draft', account: 'Bunge', remarks: '' },
];
const seedTonnage: Tonnage[] = [
  { id: 'TN-2608-001', vessel: 'MV ABC', imo: '9811000', vesselType: 'Bulk Carrier', dwt: '180,000', flag: 'Singapore', openArea: 'SE Asia', openPort: 'Singapore', openDate: '2026-08-25', earliestOpen: '2026-08-24', latestOpen: '2026-08-29', voyageType: 'Time Charter', source: 'Own', commercialStatus: 'Open', pic: 'Amit', estimationStatus: 'Estimated', owner: 'ODAS Shipping', remarks: '' },
  { id: 'TN-2608-002', vessel: 'MV Pacific Wind', imo: '9633441', vesselType: 'Kamsarmax', dwt: '82,000', flag: 'Marshall Islands', openArea: 'Australia', openPort: 'Newcastle', openDate: '2026-09-02', earliestOpen: '2026-09-01', latestOpen: '2026-09-06', voyageType: 'Voyage Charter', source: 'Broker', commercialStatus: 'On Subs', pic: 'Rahul', estimationStatus: 'Draft', owner: 'Ocean Brokers', remarks: '' },
];

function load<T>(key: string, fallback: T): T { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; } }
function save<T>(key: string, value: T) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ } }
function Status({ children }: { children: string }) { return <span className="fv-cb__status">{children}</span>; }
function SortableHeader({ label, field, sortField, direction, onSort }: { label: string; field: string; sortField: string; direction: SortDirection; onSort: (field: string) => void }) {
  const active = field === sortField;
  return <th aria-sort={active ? direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button type="button" className="fv-cb__sort" onClick={() => onSort(field)}>{label}<i className={`fas fa-sort${active ? direction === 'asc' ? '-up' : '-down' : ''}`} aria-hidden="true" /></button></th>;
}

export function CharteringBooksPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const book: Book = params.get('book') === 'tonnage' ? 'tonnage' : 'cargo';
  const [cargo, setCargo] = useState<Cargo[]>(() => load('fv.chartering.cargoBook', seedCargo));
  const [tonnage, setTonnage] = useState<Tonnage[]>(() => load('fv.chartering.tonnageBook', seedTonnage));
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const [commercial, setCommercial] = useState('All');
  const [editing, setEditing] = useState<Cargo | Tonnage | null>(null);
  const [sortField, setSortField] = useState('id');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const voyages = useVoyages();
  const q = query.toLowerCase().trim();
  const compareRows = <T,>(rows: T[], valueOf: (row: T) => unknown) => [...rows].sort((a, b) => {
    const left = valueOf(a);
    const right = valueOf(b);
    const leftNumber = Number(String(left ?? '').replace(/[^0-9.-]/g, ''));
    const rightNumber = Number(String(right ?? '').replace(/[^0-9.-]/g, ''));
    const result = Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
      ? leftNumber - rightNumber
      : String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true, sensitivity: 'base' });
    return sortDirection === 'asc' ? result : -result;
  });
  const toggleSort = (field: string) => {
    if (field === sortField) setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDirection('asc'); }
  };
  const filteredCargo = useMemo(() => {
    const rows = cargo.filter((x) => (!q || `${x.id} ${x.commodity} ${x.loadPort} ${x.dischargePort} ${x.account}`.toLowerCase().includes(q)) && (status === 'All' || x.cargoStatus === status) && (commercial === 'All' || x.commercialStatus === commercial));
    return compareRows(rows, (x) => x[sortField as keyof Cargo]);
  }, [cargo, q, status, commercial, sortField, sortDirection]);
  const filteredTonnage = useMemo(() => {
    const rows = tonnage.filter((x) => (!q || `${x.id} ${x.vessel} ${x.imo} ${x.openPort} ${x.openArea}`.toLowerCase().includes(q)) && (status === 'All' || x.commercialStatus === status) && (commercial === 'All' || x.commercialStatus === commercial));
    return compareRows(rows, (x) => x[sortField as keyof Tonnage]);
  }, [tonnage, q, status, commercial, sortField, sortDirection]);
  const createEstimation = (row: Cargo | Tonnage) => {
    const vesselName = 'vessel' in row ? row.vessel : (voyages[0]?.vessel ?? '');
    navigate(`/chartering?new=1&bookRef=${encodeURIComponent(row.id)}&vessel=${encodeURIComponent(vesselName)}`);
  };
  const saveRow = () => {
    if (!editing) return;
    if ('commodity' in editing) { const next = cargo.some((x) => x.id === editing.id) ? cargo.map((x) => x.id === editing.id ? editing : x) : [editing, ...cargo]; setCargo(next); save('fv.chartering.cargoBook', next); }
    else { const next = tonnage.some((x) => x.id === editing.id) ? tonnage.map((x) => x.id === editing.id ? editing : x) : [editing, ...tonnage]; setTonnage(next); save('fv.chartering.tonnageBook', next); }
    setEditing(null);
  };
  const newCargo = () => setEditing({ id: uid('CG'), commodity: '', cargoType: 'Bulk', quantity: '', tolerance: '', loadPort: '', dischargePort: '', loadRate: '', dischargeRate: '', terms: '', laycanStart: '', laycanEnd: '', voyageType: VOYAGE_TYPES[0], openDate: '', nominationDeadline: '', cargoStatus: 'Open', commercialStatus: 'New', pic: '', estimationStatus: 'Not Created', account: '', remarks: '' });
  const newTonnage = () => setEditing({ id: uid('TN'), vessel: '', imo: '', vesselType: '', dwt: '', flag: '', openArea: '', openPort: '', openDate: '', earliestOpen: '', latestOpen: '', voyageType: VOYAGE_TYPES[0], source: 'Own', commercialStatus: 'Open', pic: '', estimationStatus: 'Not Created', owner: '', remarks: '' });
  const remove = (id: string) => { if (book === 'cargo') { const next = cargo.filter((x) => x.id !== id); setCargo(next); save('fv.chartering.cargoBook', next); } else { const next = tonnage.filter((x) => x.id !== id); setTonnage(next); save('fv.chartering.tonnageBook', next); } };

  return <div className="fv-cb">
    <header className="fv-cb__head"><div><h1><i className={`fas ${book === 'cargo' ? 'fa-boxes-stacked' : 'fa-ship'}`} /> {book === 'cargo' ? 'Cargo Book' : 'Tonnage Book'}</h1><p>Chartering commercial worklist</p></div><button className="fv-ce__btn" type="button" onClick={() => navigate('/chartering')}><i className="fas fa-arrow-left" /> Estimation</button></header>
    <div className="fv-cb__toolbar"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={book === 'cargo' ? 'Search Cargo / ID…' : 'Search Vessel / IMO…'} /><select value={status} onChange={(e) => setStatus(e.target.value)}>{(book === 'cargo' ? CARGO_STATUS : TONNAGE_STATUS).map((x) => <option key={x}>{x}</option>)}</select><select value={commercial} onChange={(e) => setCommercial(e.target.value)}><option>All</option>{(book === 'cargo' ? CARGO_COMMERCIAL : TONNAGE_COMMERCIAL).map((x) => <option key={x}>{x}</option>)}</select><button className="fv-ce__btn fv-ce__btn--primary" onClick={book === 'cargo' ? newCargo : newTonnage}><i className="fas fa-plus" /> New {book === 'cargo' ? 'Cargo' : 'Tonnage'}</button></div>
    {book === 'cargo' ? <CargoTable rows={filteredCargo} sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} onEdit={setEditing} onDelete={remove} onCreate={createEstimation} /> : <TonnageTable rows={filteredTonnage} sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} onEdit={setEditing} onDelete={remove} onCreate={createEstimation} />}
    {editing && <BookEditor value={editing} onChange={setEditing} onCancel={() => setEditing(null)} onSave={saveRow} />}
  </div>;
}

function CargoTable({ rows, sortField, sortDirection, onSort, onEdit, onDelete, onCreate }: { rows: Cargo[]; sortField: string; sortDirection: SortDirection; onSort: (field: string) => void; onEdit: (x: Cargo) => void; onDelete: (id: string) => void; onCreate: (x: Cargo) => void }) {
  const headers: [string, string][] = [['Cargo ID', 'id'], ['Cargo / Commodity', 'commodity'], ['Cargo Type', 'cargoType'], ['Quantity', 'quantity'], ['Tolerance', 'tolerance'], ['Load Port', 'loadPort'], ['Discharge Port', 'dischargePort'], ['Load Rate', 'loadRate'], ['Discharge Rate', 'dischargeRate'], ['Terms', 'terms'], ['Laycan', 'laycanStart'], ['Voyage Type', 'voyageType'], ['Nomination', 'nominationDeadline'], ['Days to Nom.', 'nominationDeadline'], ['Days to Laycan', 'laycanStart'], ['Cargo Status', 'cargoStatus'], ['Commercial', 'commercialStatus'], ['PIC', 'pic'], ['Estimation', 'estimationStatus']];
  return <div className="fv-cb__table-wrap"><table className="fv-cb__table"><thead><tr>{headers.map(([label, field]) => <SortableHeader key={label} label={label} field={field} sortField={sortField} direction={sortDirection} onSort={onSort} />)}<th>Actions</th></tr></thead><tbody>{rows.map((x) => { const nomination = daysUntil(x.nominationDeadline); const laycan = daysUntil(x.laycanStart); return <tr key={x.id}><td>{x.id}</td><td><b>{x.commodity || '—'}</b><small>{x.account}</small></td><td>{x.cargoType}</td><td>{x.quantity}</td><td>{x.tolerance}</td><td>{x.loadPort}</td><td>{x.dischargePort}</td><td>{x.loadRate || '—'}</td><td>{x.dischargeRate || '—'}</td><td>{x.terms || '—'}</td><td>{x.laycanStart} → {x.laycanEnd}</td><td>{x.voyageType}</td><td>{x.nominationDeadline}</td><td className={tone(nomination)}>{nomination == null ? '—' : `${nomination}d`}</td><td className={tone(laycan)}>{laycan == null ? '—' : `${laycan}d`}</td><td><Status>{x.cargoStatus}</Status></td><td><Status>{x.commercialStatus}</Status></td><td>{x.pic || '—'}</td><td>{x.estimationStatus}</td><td className="fv-cb__actions"><button onClick={() => onCreate(x)}>Create Estimation</button><button onClick={() => onEdit(x)}>Edit</button><button onClick={() => onDelete(x.id)}>Cancel</button></td></tr>; })}</tbody></table></div>;
}
function TonnageTable({ rows, sortField, sortDirection, onSort, onEdit, onDelete, onCreate }: { rows: Tonnage[]; sortField: string; sortDirection: SortDirection; onSort: (field: string) => void; onEdit: (x: Tonnage) => void; onDelete: (id: string) => void; onCreate: (x: Tonnage) => void }) {
  const headers: [string, string][] = [['Vessel', 'vessel'], ['IMO', 'imo'], ['Type', 'vesselType'], ['DWT', 'dwt'], ['Flag', 'flag'], ['Open Area / Position', 'openArea'], ['Open Port', 'openPort'], ['Open Date', 'openDate'], ['Earliest', 'earliestOpen'], ['Latest', 'latestOpen'], ['Days to Open', 'openDate'], ['Voyage Type', 'voyageType'], ['Source', 'source'], ['Commercial', 'commercialStatus'], ['PIC', 'pic'], ['Estimation', 'estimationStatus']];
  return <div className="fv-cb__table-wrap"><table className="fv-cb__table"><thead><tr>{headers.map(([label, field]) => <SortableHeader key={label} label={label} field={field} sortField={sortField} direction={sortDirection} onSort={onSort} />)}<th>Actions</th></tr></thead><tbody>{rows.map((x) => { const days = daysUntil(x.openDate); return <tr key={x.id}><td><b>{x.vessel || '—'}</b><small>{x.id}</small></td><td>{x.imo}</td><td>{x.vesselType}</td><td>{x.dwt}</td><td>{x.flag}</td><td>{x.openArea}</td><td>{x.openPort}</td><td>{x.openDate}</td><td>{x.earliestOpen}</td><td>{x.latestOpen}</td><td className={tone(days)}>{days == null ? '—' : `${days}d`}</td><td>{x.voyageType}</td><td>{x.source}</td><td><Status>{x.commercialStatus}</Status></td><td>{x.pic || '—'}</td><td>{x.estimationStatus}</td><td className="fv-cb__actions"><button onClick={() => onCreate(x)}>Create Estimation</button><button onClick={() => onEdit(x)}>Edit</button><button onClick={() => onDelete(x.id)}>Cancel</button></td></tr>; })}</tbody></table></div>;
}

function BookEditor({ value, onChange, onCancel, onSave }: { value: Cargo | Tonnage; onChange: (x: Cargo | Tonnage) => void; onCancel: () => void; onSave: () => void }) {
  const isCargo = 'commodity' in value;
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const field = (key: string, label: string, type = 'text') => <label><span>{label}</span><input type={type} value={String((value as Record<string, unknown>)[key] ?? '')} onChange={(e) => onChange({ ...value, [key]: e.target.value } as Cargo | Tonnage)} /></label>;
  const applyPaste = () => {
    const parsed: Record<string, string> = {};
    pasteText.split(/\r?\n/).forEach((line) => { const match = line.match(/^\s*([^:|]+)\s*[:|]\s*(.+?)\s*$/); if (match) parsed[match[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '')] = match[2].trim(); });
    const aliases: Record<string, string> = { cargo: 'commodity', commodity: 'commodity', cargoid: 'id', account: 'account', customer: 'account', quantity: 'quantity', tolerance: 'tolerance', loadport: 'loadPort', dischargeport: 'dischargePort', dischport: 'dischargePort', loadrate: 'loadRate', dischargerate: 'dischargeRate', terms: 'terms', laycanstart: 'laycanStart', laycanend: 'laycanEnd', nominationdeadline: 'nominationDeadline', vessel: 'vessel', vesselname: 'vessel', imo: 'imo', vesseltype: 'vesselType', dwt: 'dwt', flag: 'flag', openarea: 'openArea', openport: 'openPort', opendate: 'openDate', earliestopendate: 'earliestOpen', latestopendate: 'latestOpen', tonnagesource: 'source', source: 'source', voyage: 'voyageType', voyagetype: 'voyageType', pic: 'pic', owner: 'owner', remarks: 'remarks' };
    const next = { ...value } as Record<string, unknown>;
    Object.entries(parsed).forEach(([key, parsedValue]) => { const target = aliases[key] ?? key; if (target in next) next[target] = parsedValue; });
    onChange(next as Cargo | Tonnage);
    setPasteOpen(false);
  };
  return <div className="fv-cb__overlay"><div className="fv-cb__modal">
    <div className="fv-cb__modal-head"><div><h2>{isCargo ? 'Cargo Details' : 'Tonnage Details'}</h2><p>Enter fields manually or paste recap/email details.</p></div><button type="button" className="fv-cb__icon-btn" onClick={onCancel} aria-label="Close"><i className="fas fa-xmark" /></button></div>
    <div className="fv-cb__modal-actions fv-cb__modal-actions--top"><button type="button" className="fv-ce__btn" onClick={() => setPasteOpen((open) => !open)}><i className="fas fa-paste" /> {pasteOpen ? 'Hide Paste Details' : 'Paste Details'}</button></div>
    {pasteOpen && <div className="fv-cb__paste"><textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={'Paste one field per line, for example:\nCargo: Iron Ore\nLoad Port: Port Hedland\nLoad Rate: 90000 MT/day\nTerms: FIOST'} /><button type="button" className="fv-ce__btn fv-ce__btn--primary" onClick={applyPaste} disabled={!pasteText.trim()}><i className="fas fa-wand-magic-sparkles" /> Fetch Details</button></div>}
    <div className="fv-cb__form">{isCargo ? <>{field('commodity', 'Cargo / Commodity')}{field('account', 'Account / Customer')}{field('cargoType', 'Cargo Type')}{field('quantity', 'Quantity')}{field('tolerance', 'Quantity Tolerance')}{field('loadPort', 'Load Port')}{field('dischargePort', 'Discharge Port')}{field('loadRate', 'Load Rate')}{field('dischargeRate', 'Discharge Rate')}{field('terms', 'Cargo Terms')}{field('laycanStart', 'Laycan Start', 'date')}{field('laycanEnd', 'Laycan End', 'date')}{field('nominationDeadline', 'Nomination Deadline', 'date')}{field('voyageType', 'Voyage Type')}{field('pic', 'PIC')}{field('remarks', 'Remarks')}</> : <>{field('vessel', 'Vessel Name')}{field('imo', 'IMO')}{field('vesselType', 'Vessel Type')}{field('dwt', 'DWT')}{field('flag', 'Flag')}{field('openArea', 'Open Area')}{field('openPort', 'Open Port')}{field('openDate', 'Open Date', 'date')}{field('earliestOpen', 'Earliest Open Date', 'date')}{field('latestOpen', 'Latest Open Date', 'date')}{field('voyageType', 'Voyage Type')}{field('source', 'Tonnage Source')}{field('pic', 'PIC')}{field('owner', 'Owner')}{field('remarks', 'Remarks')}</>}</div>
    <div className="fv-cb__modal-actions"><button type="button" className="fv-ce__btn" onClick={onCancel}>Cancel</button><button type="button" className="fv-ce__btn fv-ce__btn--primary" onClick={onSave}>Save</button></div>
  </div></div>;
}
