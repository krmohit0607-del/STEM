import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { charteringApi } from '../api/charteringApi';
import { adminApi } from '../api/adminApi';
import { loadWorldPorts, type WorldPort } from '../data/ports';
import { accountNames } from '../data/clients';
import { VESSEL_TYPE_OPTIONS, FREIGHT_UNIT_OPTIONS, FREIGHT_TERMS_OPTIONS } from '../data/estimationOptions';
import type { EmployeeDto } from '../types/auth';

const DAY = 86_400_000;
const today = () => new Date();
const daysUntil = (date: string) => { const d = new Date(date); return Number.isNaN(d.getTime()) ? null : Math.ceil((d.getTime() - today().getTime()) / DAY); };
const tone = (days: number | null) => days == null ? '' : days <= 0 ? ' fv-cb__deadline--red' : days <= 5 ? ' fv-cb__deadline--amber' : ' fv-cb__deadline--green';
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

type Book = 'cargo' | 'tonnage';
type CargoBook = { id: string; commodity: string; cargoType: string; quantity: string; tolerance: string; loadPort: string; dischargePort: string; loadRate: string; dischargeRate: string; frtRate: string; frtUnit: string; terms: string; laycanStart: string; laycanEnd: string; voyageType: string; openDate: string; nominationDeadline: string; cargoStatus: string; commercialStatus: string; pic: string; estimationStatus: string; account: string; remarks: string; estimateId?: string };
type TonnageBook = { id: string; vessel: string; imo: string; vesselType: string; dwt: string; draft: string; tpc: string; flag: string; built: string; openArea: string; openPort: string; openDate: string; earliestOpen: string; latestOpen: string; voyageType: string; source: string; status: string; commercialStatus: string; pic: string; estimationStatus: string; owner: string; remarks: string; estimateId?: string };
type SortDirection = 'asc' | 'desc';

const CARGO_STATUS = ['All', 'Open', 'Offered', 'Booked', 'Fixed', 'Cancelled'];
const CARGO_COMMERCIAL = ['New', 'Reviewing', 'Quoting', 'Offered', 'Negotiating', 'Agreed', 'Booked', 'Fixed', 'Cancelled', 'Expired'];
const TONNAGE_STATUS = ['All', 'Open', 'Offered', 'On Subs', 'Fixed', 'Unavailable'];
const TONNAGE_COMMERCIAL = ['Open', 'Offered', 'Negotiating', 'On Subs', 'Fixed', 'Unavailable', 'Cancelled'];
const VOYAGE_TYPES = ['Time Charter', 'Voyage Charter', 'TCTIN-VOUT', 'TCIN-TCOUT'];

const CARGO_OPTIONS = [
  'Iron Ore', 'Coal', 'Steam Coal', 'Coking Coal', 'Bauxite', 'Alumina', 'Gypsum', 'Limestone',
  'Clinker', 'Cement', 'Grain', 'Wheat', 'Corn', 'Soybeans', 'Soybean Meal', 'Rice', 'Sugar',
  'Salt', 'Fertilizer', 'Urea', 'DAP', 'MOP', 'Sulphur', 'Petcoke', 'Scrap', 'Steel Products',
  'HR Coils', 'Rebar', 'Logs', 'Woodchips', 'Manganese Ore', 'Chrome Ore', 'Nickel Ore', 'Concentrates',
];

const FIX_TYPES = ['TCIN-TCOUT', 'TCIN-VOUT', 'TCIN-TCTOUT', 'TCTIN-TCTOUT', 'TCTIN-TCOUT', 'TCTIN-VOUT', 'VIN-VOUT', 'VIN-TCTOUT', 'OWN-TCOUT', 'OWN-VOUT', 'OWN-TCTOUT'];

const seedCargo: CargoBook[] = [
  { id: 'CG-2608-001', commodity: 'Iron Ore', cargoType: 'Bulk', quantity: '170,000', tolerance: '±10%', loadPort: 'Port Hedland', dischargePort: 'Qingdao', loadRate: '90,000', dischargeRate: '70,000', frtRate: '', frtUnit: 'USD/MT', terms: 'FIOST', laycanStart: '2026-08-28', laycanEnd: '2026-09-03', voyageType: 'Voyage Charter', openDate: '2026-08-18', nominationDeadline: '2026-08-24', cargoStatus: 'Open', commercialStatus: 'Reviewing', pic: 'Amit', estimationStatus: 'Not Created', account: 'Cargill', remarks: '' },
  { id: 'CG-2608-002', commodity: 'Steam Coal', cargoType: 'Bulk', quantity: '75,000', tolerance: '±5%', loadPort: 'Richards Bay', dischargePort: 'Paradip', loadRate: '45,000', dischargeRate: '35,000', frtRate: '', frtUnit: 'USD/MT', terms: 'FIO', laycanStart: '2026-09-04', laycanEnd: '2026-09-10', voyageType: 'Voyage Charter', openDate: '2026-08-15', nominationDeadline: '2026-08-27', cargoStatus: 'Offered', commercialStatus: 'Offered', pic: 'Rahul', estimationStatus: 'Draft', account: 'Bunge', remarks: '' },
];
const seedTonnage: TonnageBook[] = [
  { id: 'TN-2608-001', vessel: 'MV ABC', imo: '9811000', vesselType: 'Bulk Carrier', dwt: '180,000', draft: '9.5', tpc: '42', flag: 'Singapore', built: '2015', openArea: 'SE Asia', openPort: 'Singapore', openDate: '2026-08-25', earliestOpen: '2026-08-24', latestOpen: '2026-08-29', voyageType: 'Time Charter', source: 'Own', status: 'Open', commercialStatus: 'Open', pic: 'Amit', estimationStatus: 'Estimated', owner: 'ODAS Shipping', remarks: '' },
  { id: 'TN-2608-002', vessel: 'MV Pacific Wind', imo: '9633441', vesselType: 'Kamsarmax', dwt: '82,000', draft: '8.2', tpc: '35', flag: 'Marshall Islands', built: '2018', openArea: 'Australia', openPort: 'Newcastle', openDate: '2026-09-02', earliestOpen: '2026-09-01', latestOpen: '2026-09-06', voyageType: 'Voyage Charter', source: 'Broker', status: 'On Subs', commercialStatus: 'On Subs', pic: 'Rahul', estimationStatus: 'Draft', owner: 'Ocean Brokers', remarks: '' },
];

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
  const [cargo, setCargo] = useState<CargoBook[]>(seedCargo);
  const [tonnage, setTonnage] = useState<TonnageBook[]>(seedTonnage);
  const [employees, setEmployees] = useState<EmployeeDto[]>([]);

  const fetchBookData = useCallback(async () => {
    try {
      const [cList, tList, empList] = await Promise.all([
        charteringApi.getCargoBook(),
        charteringApi.getTonnageBook(),
        adminApi.getEmployees(),
      ]);
      if (cList && cList.length > 0) {
        const mappedC: CargoBook[] = cList.map((c) => ({
          id: c.cargoCode,
          commodity: c.commodity,
          cargoType: c.cargoType,
          quantity: c.quantity,
          tolerance: c.tolerance,
          loadPort: c.loadPort,
          dischargePort: c.dischargePort,
          loadRate: c.loadRate ?? '',
          dischargeRate: c.dischargeRate ?? '',
          frtRate: '',
          frtUnit: 'USD/MT',
          terms: c.terms ?? '',
          laycanStart: c.laycanStart ?? '',
          laycanEnd: c.laycanEnd ?? '',
          voyageType: c.voyageType,
          openDate: c.openDate ?? '',
          nominationDeadline: c.nominationDeadline ?? '',
          cargoStatus: c.cargoStatus,
          commercialStatus: c.commercialStatus,
          pic: c.pic ?? '',
          estimationStatus: c.estimationStatus,
          account: c.account ?? '',
          remarks: c.remarks ?? '',
          estimateId: c.estimateId ?? '',
        }));
        setCargo(mappedC);
        save('fv.chartering.cargoBook', mappedC);
      }
      if (tList && tList.length > 0) {
        const mappedT: TonnageBook[] = tList.map((t) => ({
          id: t.tonnageCode,
          vessel: t.vesselName,
          imo: t.imo ?? '',
          vesselType: t.vesselType ?? '',
          dwt: t.dwt ?? '',
          draft: '',
          tpc: '',
          flag: t.flag ?? '',
          built: '',
          openArea: t.openArea ?? '',
          openPort: t.openPort ?? '',
          openDate: t.openDate ?? '',
          earliestOpen: t.earliestOpen ?? '',
          latestOpen: t.latestOpen ?? '',
          voyageType: t.voyageType,
          source: t.source,
          status: t.commercialStatus,
          commercialStatus: t.commercialStatus,
          pic: t.pic ?? '',
          estimationStatus: t.estimationStatus,
          owner: t.owner ?? '',
          remarks: t.remarks ?? '',
          estimateId: t.estimateId ?? '',
        }));
        setTonnage(mappedT);
        save('fv.chartering.tonnageBook', mappedT);
      }
      if (empList && empList.length > 0) {
        setEmployees(empList);
      }
    } catch {
      /* fallback */
    }
  }, []);

  // Fetch fresh data on mount and when book changes
  useEffect(() => {
    void fetchBookData();
  }, [book, fetchBookData]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const [commercial, setCommercial] = useState('All');
  const [editing, setEditing] = useState<CargoBook | TonnageBook | null>(null);
  const [sortField, setSortField] = useState('id');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
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
    return compareRows(rows, (x) => x[sortField as keyof CargoBook]);
  }, [cargo, q, status, commercial, sortField, sortDirection]);
  const filteredTonnage = useMemo(() => {
    const rows = tonnage.filter((x) => (!q || `${x.id} ${x.vessel} ${x.imo} ${x.openPort} ${x.openArea}`.toLowerCase().includes(q)) && (status === 'All' || x.status === status) && (commercial === 'All' || x.commercialStatus === commercial));
    return compareRows(rows, (x) => x[sortField as keyof TonnageBook]);
  }, [tonnage, q, status, commercial, sortField, sortDirection]);
  const handleEstimateClick = (row: CargoBook | TonnageBook) => {
    // If estimate already exists, navigate to it
    if (row.estimateId && row.estimationStatus !== 'Not Created') {
      navigate(`/chartering?est=${encodeURIComponent(row.estimateId)}`);
      return;
    }
    // Otherwise create new estimate from book
    // Determine if it's a cargo or tonnage row based on unique properties
    const isCargo = 'commodity' in row && !('vessel' in row);
    const bookData = {
      type: isCargo ? 'cargo' : 'tonnage',
      data: row,
    };
    // Encode book data in URL parameter
    const bookDataEncoded = btoa(JSON.stringify(bookData));
    // Navigate to new estimation with reference and data
    navigate(`/chartering?new=1&from=book&bookRef=${encodeURIComponent(row.id)}&bookData=${encodeURIComponent(bookDataEncoded)}`);
  };
  const saveRow = () => {
    if (!editing) return;
    if ('commodity' in editing) { const next = cargo.some((x) => x.id === editing.id) ? cargo.map((x) => x.id === editing.id ? editing : x) : [editing, ...cargo]; setCargo(next); save('fv.chartering.cargoBook', next); }
    else { const next = tonnage.some((x) => x.id === editing.id) ? tonnage.map((x) => x.id === editing.id ? editing : x) : [editing, ...tonnage]; setTonnage(next); save('fv.chartering.tonnageBook', next); }
    setEditing(null);
  };
  const newCargo = () => setEditing({ id: uid('CG'), commodity: '', cargoType: 'Bulk', quantity: '', tolerance: '', loadPort: '', dischargePort: '', loadRate: '', dischargeRate: '', frtRate: '', frtUnit: 'USD/MT', terms: '', laycanStart: '', laycanEnd: '', voyageType: VOYAGE_TYPES[0], openDate: '', nominationDeadline: '', cargoStatus: 'Open', commercialStatus: 'New', pic: '', estimationStatus: 'Not Created', account: '', remarks: '', estimateId: '' });
  const newTonnage = () => setEditing({ id: uid('TN'), vessel: '', imo: '', vesselType: '', dwt: '', draft: '', tpc: '', flag: '', built: '', openArea: '', openPort: '', openDate: '', earliestOpen: '', latestOpen: '', voyageType: VOYAGE_TYPES[0], source: 'Own', status: 'Open', commercialStatus: 'Open', pic: '', estimationStatus: 'Not Created', owner: '', remarks: '', estimateId: '' });
  const remove = (id: string) => { if (book === 'cargo') { const next = cargo.filter((x) => x.id !== id); setCargo(next); save('fv.chartering.cargoBook', next); } else { const next = tonnage.filter((x) => x.id !== id); setTonnage(next); save('fv.chartering.tonnageBook', next); } };

  return <div className="fv-cb">
    <header className="fv-cb__head"><div><h1><i className={`fas ${book === 'cargo' ? 'fa-boxes-stacked' : 'fa-ship'}`} /> {book === 'cargo' ? 'Cargo Book' : 'Tonnage Book'}</h1><p>Chartering commercial worklist</p></div><button className="fv-ce__btn" type="button" onClick={() => navigate('/chartering')}><i className="fas fa-arrow-left" /> Estimation</button></header>
    <div className="fv-cb__toolbar"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={book === 'cargo' ? 'Search Cargo / ID…' : 'Search Vessel / IMO…'} /><select value={status} onChange={(e) => setStatus(e.target.value)}>{(book === 'cargo' ? CARGO_STATUS : TONNAGE_STATUS).map((x) => <option key={x}>{x}</option>)}</select><select value={commercial} onChange={(e) => setCommercial(e.target.value)}><option>All</option>{(book === 'cargo' ? CARGO_COMMERCIAL : TONNAGE_COMMERCIAL).map((x) => <option key={x}>{x}</option>)}</select><button className="fv-ce__btn fv-ce__btn--primary" onClick={book === 'cargo' ? newCargo : newTonnage}><i className="fas fa-plus" /> New {book === 'cargo' ? 'Cargo' : 'Tonnage'}</button></div>
    {book === 'cargo' ? <CargoTable rows={filteredCargo} sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} onEdit={setEditing} onDelete={remove} onEstimate={handleEstimateClick} /> : <TonnageTable rows={filteredTonnage} sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} onEdit={setEditing} onDelete={remove} onEstimate={handleEstimateClick} />}
    {editing && <BookEditor value={editing} onChange={setEditing} onCancel={() => setEditing(null)} onSave={saveRow} employees={employees} />}
  </div>;
}

function CargoTable({ rows, sortField, sortDirection, onSort, onEdit, onDelete, onEstimate }: { rows: CargoBook[]; sortField: string; sortDirection: SortDirection; onSort: (field: string) => void; onEdit: (x: CargoBook) => void; onDelete: (id: string) => void; onEstimate: (x: CargoBook) => void }) {
  const headers: [string, string][] = [['Cargo ID', 'id'], ['Cargo / Commodity', 'commodity'], ['Cargo Type', 'cargoType'], ['Quantity', 'quantity'], ['Tolerance', 'tolerance'], ['Load Port', 'loadPort'], ['Discharge Port', 'dischargePort'], ['Load Rate', 'loadRate'], ['Discharge Rate', 'dischargeRate'], ['Freight', 'frtRate'], ['Terms', 'terms'], ['Laycan', 'laycanStart'], ['Voyage Type', 'voyageType'], ['Nomination', 'nominationDeadline'], ['Days to Nom.', 'nominationDeadline'], ['Days to Laycan', 'laycanStart'], ['Cargo Status', 'cargoStatus'], ['Commercial', 'commercialStatus'], ['PIC', 'pic'], ['Estimation', 'estimationStatus']];
  return <div className="fv-cb__table-wrap"><table className="fv-cb__table"><thead><tr>{headers.map(([label, field]) => <SortableHeader key={label} label={label} field={field} sortField={sortField} direction={sortDirection} onSort={onSort} />)}<th>Actions</th></tr></thead><tbody>{rows.map((x) => { const nomination = daysUntil(x.nominationDeadline); const laycan = daysUntil(x.laycanStart); const hasEstimate = x.estimateId && x.estimationStatus !== 'Not Created'; return <tr key={x.id}><td>{x.id}</td><td><b>{x.commodity || '—'}</b><small>{x.account}</small></td><td>{x.cargoType}</td><td>{x.quantity}</td><td>{x.tolerance}</td><td>{x.loadPort}</td><td>{x.dischargePort}</td><td>{x.loadRate || '—'}</td><td>{x.dischargeRate || '—'}</td><td>{x.frtRate || '—'}</td><td>{x.terms || '—'}</td><td>{x.laycanStart} → {x.laycanEnd}</td><td>{x.voyageType}</td><td>{x.nominationDeadline}</td><td className={tone(nomination)}>{nomination == null ? '—' : `${nomination}d`}</td><td className={tone(laycan)}>{laycan == null ? '—' : `${laycan}d`}</td><td><Status>{x.cargoStatus}</Status></td><td><Status>{x.commercialStatus}</Status></td><td>{x.pic || '—'}</td><td>{x.estimationStatus}</td><td className="fv-cb__actions"><button onClick={() => onEstimate(x)}>{hasEstimate ? 'Go to Estimate' : 'Estimate'}</button><button onClick={() => onEdit(x)}>Edit</button><button onClick={() => onDelete(x.id)}>Cancel</button></td></tr>; })}</tbody></table></div>;
}
function TonnageTable({ rows, sortField, sortDirection, onSort, onEdit, onDelete, onEstimate }: { rows: TonnageBook[]; sortField: string; sortDirection: SortDirection; onSort: (field: string) => void; onEdit: (x: TonnageBook) => void; onDelete: (id: string) => void; onEstimate: (x: TonnageBook) => void }) {
  const headers: [string, string][] = [['Vessel', 'vessel'], ['IMO', 'imo'], ['Type', 'vesselType'], ['DWT', 'dwt'], ['Draft', 'draft'], ['TPC', 'tpc'], ['Flag', 'flag'], ['Built', 'built'], ['Open Area / Position', 'openArea'], ['Open Port', 'openPort'], ['Open Date', 'openDate'], ['Earliest', 'earliestOpen'], ['Latest', 'latestOpen'], ['Days to Open', 'openDate'], ['Voyage Type', 'voyageType'], ['Source', 'source'], ['Status', 'status'], ['Commercial', 'commercialStatus'], ['PIC', 'pic'], ['Estimation', 'estimationStatus']];
  return <div className="fv-cb__table-wrap"><table className="fv-cb__table"><thead><tr>{headers.map(([label, field]) => <SortableHeader key={label} label={label} field={field} sortField={sortField} direction={sortDirection} onSort={onSort} />)}<th>Actions</th></tr></thead><tbody>{rows.map((x) => { const days = daysUntil(x.openDate); const hasEstimate = x.estimateId && x.estimationStatus !== 'Not Created'; return <tr key={x.id}><td><b>{x.vessel || '—'}</b><small>{x.id}</small></td><td>{x.imo}</td><td>{x.vesselType}</td><td>{x.dwt}</td><td>{x.draft}</td><td>{x.tpc}</td><td>{x.flag}</td><td>{x.built}</td><td>{x.openArea}</td><td>{x.openPort}</td><td>{x.openDate}</td><td>{x.earliestOpen}</td><td>{x.latestOpen}</td><td className={tone(days)}>{days == null ? '—' : `${days}d`}</td><td>{x.voyageType}</td><td>{x.source}</td><td><Status>{x.status}</Status></td><td><Status>{x.commercialStatus}</Status></td><td>{x.pic || '—'}</td><td>{x.estimationStatus}</td><td className="fv-cb__actions"><button onClick={() => onEstimate(x)}>{hasEstimate ? 'Go to Estimate' : 'Estimate'}</button><button onClick={() => onEdit(x)}>Edit</button><button onClick={() => onDelete(x.id)}>Cancel</button></td></tr>; })}</tbody></table></div>;
}

function BookEditor({ value, onChange, onCancel, onSave, employees }: { value: CargoBook | TonnageBook; onChange: (x: CargoBook | TonnageBook) => void; onCancel: () => void; onSave: () => void; employees: EmployeeDto[] }) {
  const isCargo = 'commodity' in value;
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [worldPorts, setWorldPorts] = useState<WorldPort[]>([]);
  const [accounts, setAccounts] = useState<string[]>([]);

  useEffect(() => {
    void loadWorldPorts().then((ports) => {
      setWorldPorts(ports.slice(0, 3000));
    });
    setAccounts(accountNames());
  }, []);

  const fieldText = (key: string, label: string) => <label><span>{label}</span><input type="text" value={String((value as Record<string, unknown>)[key] ?? '')} onChange={(e) => onChange({ ...value, [key]: e.target.value } as CargoBook | TonnageBook)} /></label>;
  const fieldDate = (key: string, label: string) => <label><span>{label}</span><input type="date" value={String((value as Record<string, unknown>)[key] ?? '')} onChange={(e) => onChange({ ...value, [key]: e.target.value } as CargoBook | TonnageBook)} /></label>;
  const fieldSelect = (key: string, label: string, options: Array<{ value: string; label: string }>) => <label><span>{label}</span><select value={String((value as Record<string, unknown>)[key] ?? '')} onChange={(e) => onChange({ ...value, [key]: e.target.value } as CargoBook | TonnageBook)}><option value="">-- Select {label} --</option>{options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></label>;
  
  const cargoOptions = CARGO_OPTIONS.map((c) => ({ value: c, label: c }));
  const accountOptions = accounts.map((a) => ({ value: a, label: a }));
  const voyageTypeOptions = FIX_TYPES.map((v) => ({ value: v, label: v }));
  const freightTermsOptions = FREIGHT_TERMS_OPTIONS.map((t) => ({ value: t, label: t }));
  const freightUnitOptions = FREIGHT_UNIT_OPTIONS.map((u) => ({ value: u, label: u }));
  const vesselTypeOptions = VESSEL_TYPE_OPTIONS.map((v) => ({ value: v, label: v }));
  const portOptions = worldPorts.map((p) => ({ value: p.label, label: p.label }));
  const employeeOptions = employees.map((emp) => ({ value: emp.fullName, label: `${emp.fullName} (${emp.email})` }));
  
  const applyPaste = () => {
    const parsed: Record<string, string> = {};
    pasteText.split(/\r?\n/).forEach((line) => { const match = line.match(/^\s*([^:|]+)\s*[:|]\s*(.+?)\s*$/); if (match) parsed[match[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '')] = match[2].trim(); });
    const aliases: Record<string, string> = { cargo: 'commodity', commodity: 'commodity', cargoid: 'id', account: 'account', customer: 'account', quantity: 'quantity', tolerance: 'tolerance', loadport: 'loadPort', dischargeport: 'dischargePort', dischport: 'dischargePort', loadrate: 'loadRate', dischargerate: 'dischargeRate', frtrate: 'frtRate', frtunit: 'frtUnit', terms: 'terms', laycanstart: 'laycanStart', laycanend: 'laycanEnd', nominationdeadline: 'nominationDeadline', vessel: 'vessel', vesselname: 'vessel', imo: 'imo', vesseltype: 'vesselType', dwt: 'dwt', draft: 'draft', tpc: 'tpc', flag: 'flag', built: 'built', openarea: 'openArea', openport: 'openPort', opendate: 'openDate', earliestopendate: 'earliestOpen', latestopendate: 'latestOpen', tonnagesource: 'source', source: 'source', voyage: 'voyageType', voyagetype: 'voyageType', pic: 'pic', owner: 'owner', remarks: 'remarks' };
    const next = { ...value } as Record<string, unknown>;
    Object.entries(parsed).forEach(([key, parsedValue]) => { const target = aliases[key] ?? key; if (target in next) next[target] = parsedValue; });
    onChange(next as CargoBook | TonnageBook);
    setPasteOpen(false);
  };
  
  return <div className="fv-cb__overlay"><div className="fv-cb__modal">
    <div className="fv-cb__modal-head"><div><h2>{isCargo ? 'Cargo Details' : 'Tonnage Details'}</h2><p>Enter fields manually or paste recap/email details.</p></div><button type="button" className="fv-cb__icon-btn" onClick={onCancel} aria-label="Close"><i className="fas fa-xmark" /></button></div>
    <div className="fv-cb__modal-actions fv-cb__modal-actions--top"><button type="button" className="fv-ce__btn" onClick={() => setPasteOpen((open) => !open)}><i className="fas fa-paste" /> {pasteOpen ? 'Hide Paste Details' : 'Paste Details'}</button></div>
    {pasteOpen && <div className="fv-cb__paste"><textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={'Paste one field per line, for example:\nCargo: Iron Ore\nLoad Port: Port Hedland\nLoad Rate: 90000 MT/day\nTerms: FIOST'} /><button type="button" className="fv-ce__btn fv-ce__btn--primary" onClick={applyPaste} disabled={!pasteText.trim()}><i className="fas fa-wand-magic-sparkles" /> Fetch Details</button></div>}
    <div className="fv-cb__form">{isCargo ? <>{fieldSelect('commodity', 'Cargo / Commodity', cargoOptions)}{fieldSelect('account', 'Account / Customer', accountOptions)}{fieldText('cargoType', 'Cargo Type')}{fieldText('quantity', 'Quantity (MT)')}{fieldText('tolerance', 'Quantity Tolerance')}{fieldSelect('loadPort', 'Load Port', portOptions)}{fieldSelect('dischargePort', 'Discharge Port', portOptions)}{fieldText('loadRate', 'Load Rate (MT/day)')}{fieldText('dischargeRate', 'Discharge Rate (MT/day)')}{fieldText('frtRate', 'Freight Rate')}{fieldSelect('frtUnit', 'Freight Unit', freightUnitOptions)}{fieldSelect('terms', 'Cargo Terms', freightTermsOptions)}{fieldDate('laycanStart', 'Laycan Start')}{fieldDate('laycanEnd', 'Laycan End')}{fieldDate('nominationDeadline', 'Nomination Deadline')}{fieldSelect('voyageType', 'Voyage Type', voyageTypeOptions)}{fieldSelect('pic', 'PIC', employeeOptions)}{fieldText('remarks', 'Remarks')}</> : <>{fieldText('vessel', 'Vessel Name')}{fieldText('imo', 'IMO')}{fieldSelect('vesselType', 'Vessel Type', vesselTypeOptions)}{fieldText('dwt', 'DWT (MT)')}{fieldText('draft', 'Draft (M)')}{fieldText('tpc', 'TPC')}{fieldText('flag', 'Flag')}{fieldText('built', 'Built (Year)')}{fieldText('openArea', 'Open Area')}{fieldSelect('openPort', 'Open Port', portOptions)}{fieldDate('openDate', 'Open Date')}{fieldDate('earliestOpen', 'Earliest Open Date')}{fieldDate('latestOpen', 'Latest Open Date')}{fieldSelect('voyageType', 'Voyage Type', voyageTypeOptions)}{fieldText('source', 'Tonnage Source')}{fieldSelect('pic', 'PIC', employeeOptions)}{fieldText('owner', 'Owner')}{fieldText('remarks', 'Remarks')}</>}</div>
    <div className="fv-cb__modal-actions"><button type="button" className="fv-ce__btn" onClick={onCancel}>Cancel</button><button type="button" className="fv-ce__btn fv-ce__btn--primary" onClick={onSave}>Save</button></div>
  </div></div>;
}
