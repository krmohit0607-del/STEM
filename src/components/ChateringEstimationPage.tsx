import { useMemo, useState } from 'react';

import { useSelectedVoyage } from '../data/selectedVoyage';

/**
 * Chartering — Voyage Estimation.
 *
 * Spreadsheet-style estimate sheet modelled on the desktop estimator: Vessel
 * Particular, Cargo grid, Port Rotation grid, and the Operation Expense /
 * Bunker Expense / Result footer. The sheet tabs allow comparing the same
 * cargo across vessels or the same vessel across cargoes.
 */

interface CargoRow {
  account: string;
  name: string;
  loadPort: string;
  dischPort: string;
  qty: string;
  unit: string;
  frt: string;
  term: string;
  totalFreight: string;
  aComm: string;
  brkg: string;
  frtTax: string;
}

interface PortRow {
  type: string;
  name: string;
  distEca: string;
  wf: string;
  spd: string;
  sea: string;
  ldRate: string;
  portIW: string;
  dem: string;
  des: string;
  portCharge: string;
  arrival: string;
  departure: string;
}

const CARGO_ROWS: CargoRow[] = [
  { account: '5011ACCT1', name: 'general', loadPort: 'Tianjin <China> [+08:00]', dischPort: 'Ravenna <Italy> [+01:00]', qty: '15,000.0', unit: 'MT', frt: '28.0', term: 'FIO', totalFreight: '420,000.0', aComm: '3.8 %', brkg: '1.3 %', frtTax: '' },
  { account: '5011ACCT1', name: 'general', loadPort: 'Rizhao <China> [+08:00]', dischPort: 'Ravenna <Italy> [+01:00]', qty: '10,000.0', unit: 'MT', frt: '28.0', term: 'FIO', totalFreight: '280,000.0', aComm: '3.8 %', brkg: '1.3 %', frtTax: '' },
  { account: '5011ACCT1', name: 'general', loadPort: 'Tianjin <China> [+08:00]', dischPort: 'Rotterdam <Netherlands> [+01:00]', qty: '10,000.0', unit: 'MT', frt: '30.0', term: 'FIO', totalFreight: '300,000.0', aComm: '3.8 %', brkg: '1.3 %', frtTax: '' },
  { account: '5011ACCT2', name: 'steel', loadPort: 'Qingdao <China> [+08:00]', dischPort: 'Rotterdam <Netherlands> [+01:00]', qty: '15,000.0', unit: 'MT', frt: '35.0', term: 'FIO', totalFreight: '525,000.0', aComm: '3.8 %', brkg: '1.3 %', frtTax: '' },
];

const PORT_ROWS: PortRow[] = [
  { type: 'Ballast', name: 'CJK (Changjiangkou) <China> [+08:00]', distEca: '', wf: '', spd: '', sea: '', ldRate: '', portIW: '', dem: '', des: '', portCharge: '', arrival: '', departure: '2020-08-06 16:10' },
  { type: 'Loading', name: 'Tianjin <China> [+08:00]', distEca: '676 / 0', wf: '5.0 %', spd: '14.00', sea: '2.11', ldRate: '10,000.0', portIW: '0.50 / 2.50', dem: '', des: '3,000.0', portCharge: '45,000.0', arrival: '2020-08-08 21:21', departure: '2020-08-11 23:49' },
  { type: 'Loading', name: 'Qingdao <China> [+08:00]', distEca: '463 / 0', wf: '5.0 %', spd: '14.00', sea: '1.45', ldRate: '5,000.0', portIW: '0.50 / 3.00', dem: '', des: '2,500.0', portCharge: '35,000.0', arrival: '2020-08-13 12:13', departure: '2020-08-17 02:41' },
  { type: 'Loading', name: 'Rizhao <China> [+08:00]', distEca: '82 / 0', wf: '5.0 %', spd: '14.00', sea: '0.26', ldRate: '5,000.0', portIW: '0.50 / 2.00', dem: '', des: '3,000.0', portCharge: '35,000.0', arrival: '2020-08-18 09:07', departure: '2020-08-19 23:35' },
  { type: 'Bunker', name: 'Singapore <Singapore> [+08:00]', distEca: '2,461 / 0', wf: '5.0 %', spd: '14.00', sea: '7.69', ldRate: '', portIW: '0.50', dem: '', des: '', portCharge: '3,000.0', arrival: '2020-08-28 01:09', departure: '2020-08-28 15:37' },
  { type: 'Canal', name: 'Suez Canal (RP) <Routing Points> [+0…]', distEca: '5,047 / 0', wf: '5.0 %', spd: '14.00', sea: '15.77', ldRate: '', portIW: '0.21', dem: '', des: '', portCharge: '185,000.0', arrival: '2020-09-13 22:34', departure: '2020-09-14 04:36' },
  { type: 'Dischg', name: 'Ravenna <Italy> [+01:00]', distEca: '1,356 / 0', wf: '5.0 %', spd: '14.00', sea: '4.24', ldRate: '8,000.0', portIW: '0.50 / 3.13', dem: '', des: '3,000.0', portCharge: '40,000.0', arrival: '2020-09-18 14:15', departure: '2020-09-22 07:43' },
  { type: 'Dischg', name: 'Rotterdam <Netherlands> [+01…]', distEca: '3,057 / 417', wf: '5.0 %', spd: '14.00', sea: '9.55', ldRate: '10,000.0', portIW: '0.50 / 1.00', dem: '', des: '3,000.0', portCharge: '20,000.0', arrival: '2020-10-02 08:10', departure: '2020-10-03 22:38' },
  { type: 'Dischg', name: 'Rotterdam <Netherlands> [+01:00]', distEca: '0 / 0', wf: '5.0 %', spd: '14.00', sea: '0.00', ldRate: '5,000.0', portIW: '1.66 / 3.00', dem: '', des: '2,500.0', portCharge: '20,000.0', arrival: '2020-10-03 22:38', departure: '2020-10-08 22:34' },
  { type: 'Margin', name: '', distEca: '', wf: '', spd: '', sea: '2.00', ldRate: '', portIW: '1.00', dem: '', des: '', portCharge: '', arrival: '', departure: '' },
];

const OP_EXPENSE_L: [string, string][] = [
  ['Dem/Des', '17,000.0'],
  ['Add Comm.', '57,187.5'],
  ['Brokerage', '19,062.5'],
  ['Freight Tax', '0.0'],
  ['Liner Terms', '0.0'],
  ['Port Charge', '383,000.0'],
];
const OP_EXPENSE_R: [string, string][] = [
  ['Bunker Expense', '484,272.0'],
  ['C.E.V.', '3,177.9'],
  ['ILOHC', '5,000.0'],
  ['Ballast Bonus', '0.0'],
  ['Routing Service', '0.0'],
  ['Others', '0.0'],
];

const BUNKERS: { grade: string; price: string; cons: string; expense: string }[] = [
  { grade: 'VLSFO', price: '320.0', cons: '1,411.4', expense: '451,659.3' },
  { grade: 'MGO', price: '360.0', cons: '4.3', expense: '1,550.5' },
  { grade: 'ULSFO', price: '350.0', cons: '88.7', expense: '31,062.2' },
];

const RESULT_L: [string, string][] = [
  ['Hire / Day', '8,500.0'],
  ['H/Add Comm.', '3.8 %'],
  ['Net Hire', '8,181.3'],
  ['C/Base', '8,752.5'],
];
const RESULT_R: [string, string, boolean?][] = [
  ['Revenue', '1,525,000.0'],
  ['Op. Expense', '968,699.9'],
  ['Op. Profit', '556,300.1'],
  ['Total Hire', '519,991.7'],
  ['Total Expense', '1,488,691.6'],
  ['PROFIT (USD)', '36,308.4', true],
];

const SHEET_TABS = ['voyage1', 'cargo relet1', 'time charter1'];

export function ChateringEstimationPage() {
  const voyage = useSelectedVoyage();
  const vesselName = voyage?.vessel ?? 'oriental phoenix';
  const [activeTab, setActiveTab] = useState(0);

  const cargoTotals = useMemo(() => {
    const n = (s: string) => parseFloat(s.replace(/,/g, '')) || 0;
    const qty = CARGO_ROWS.reduce((s, r) => s + n(r.qty), 0);
    const total = CARGO_ROWS.reduce((s, r) => s + n(r.totalFreight), 0);
    return {
      qty: qty.toLocaleString('en-US', { minimumFractionDigits: 1 }),
      total: total.toLocaleString('en-US', { minimumFractionDigits: 1 }),
    };
  }, []);

  return (
    <div className="fv-est2">
      <div className="fv-est2__tabs">
        {SHEET_TABS.map((tab, i) => (
          <button
            key={tab}
            type="button"
            className={`fv-est2__tab${i === activeTab ? ' fv-est2__tab--active' : ''}`}
            onClick={() => setActiveTab(i)}
          >
            <i className="fas fa-file-lines" aria-hidden="true" /> {tab}
          </button>
        ))}
        <button type="button" className="fv-est2__tab fv-est2__tab--add" title="Add sheet">
          <i className="fas fa-plus" aria-hidden="true" />
        </button>
      </div>

      <div className="fv-est2__scroll">
        {/* Vessel Particular */}
        <section className="fv-est2__panel">
          <div className="fv-est2__panel-head">
            <span className="fv-est2__panel-title">Vessel Particular</span>
            <span className="fv-est2__update">Last Update : 2020-08-06 17:11, erin</span>
          </div>
          <div className="fv-est2__vessel">
            <table className="fv-est2__vp-main">
              <thead>
                <tr><th>MV</th><th>DWT</th><th>Draft (M)</th><th>TPC</th><th>Built</th><th>Kind</th><th>Type</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td className="fv-est2__vp-name">{vesselName} <i className="fas fa-pen fv-est2__muted" /> <i className="fas fa-xmark fv-est2__muted" /></td>
                  <td>56,811</td><td>12.80</td><td>58.00</td><td>2012</td><td>—</td><td>TCT</td>
                </tr>
              </tbody>
            </table>

            <div className="fv-est2__vp-speed">
              <label className="fv-est2__radio"><input type="radio" name="load" defaultChecked /> Full</label>
              <label className="fv-est2__radio"><input type="radio" name="load" /> Eco</label>
              <table className="fv-est2__vp-spd">
                <thead><tr><th>Ballast</th><th>Laden</th></tr></thead>
                <tbody><tr><td>14.00</td><td>14.00</td></tr></tbody>
              </table>
            </div>

            <table className="fv-est2__vp-cons">
              <thead><tr><th>Main</th><th>Type</th><th>Ballast</th><th>Laden</th><th>Idle</th><th>Work</th></tr></thead>
              <tbody>
                <tr><td>Normal</td><td>VLSFO</td><td>29.00</td><td>33.00</td><td>2.50</td><td>5.00</td></tr>
                <tr><td>ECA</td><td>ULSFO</td><td>29.00</td><td>33.00</td><td>2.50</td><td>5.00</td></tr>
              </tbody>
            </table>

            <table className="fv-est2__vp-cons">
              <thead><tr><th>Sub</th><th>Type</th><th>Sea</th><th>Idle</th><th>Work</th></tr></thead>
              <tbody>
                <tr><td>Normal</td><td>MGO</td><td>0.10</td><td>0.00</td><td>0.00</td></tr>
                <tr><td>ECA</td><td>MGO</td><td>0.10</td><td>0.00</td><td>0.00</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Cargo */}
        <section className="fv-est2__panel">
          <div className="fv-est2__panel-head">
            <span className="fv-est2__panel-title">Cargo</span>
            <span className="fv-est2__panel-actions">
              <button type="button" className="fv-est2__chip"><i className="fas fa-calculator" /> Loadable Quantity Calculator</button>
              <button type="button" className="fv-est2__chip"><i className="fas fa-chart-simple" /> Frt. Simulator</button>
            </span>
          </div>
          <div className="fv-est2__gridwrap">
            <table className="fv-est2__grid">
              <thead>
                <tr>
                  <th className="fv-est2__num">#</th>
                  <th>Account</th><th>Cargo Name</th><th>Loading Port</th><th>Discharging Port</th>
                  <th className="fv-est2__r">Quantity</th><th className="fv-est2__r">Frt</th><th>Term</th>
                  <th className="fv-est2__r">Total Freight</th><th className="fv-est2__r">A. Comm</th>
                  <th className="fv-est2__r">Brkg</th><th className="fv-est2__r">Frt Tax</th><th>Liner Term</th>
                </tr>
              </thead>
              <tbody>
                {CARGO_ROWS.map((r, i) => (
                  <tr key={i}>
                    <td className="fv-est2__num">{i + 1}</td>
                    <td>{r.account}</td>
                    <td>{r.name}</td>
                    <td>{r.loadPort}</td>
                    <td>{r.dischPort}</td>
                    <td className="fv-est2__r fv-est2__edit">{r.qty} <span className="fv-est2__unit">{r.unit}</span></td>
                    <td className="fv-est2__r fv-est2__edit">{r.frt}</td>
                    <td>{r.term}</td>
                    <td className="fv-est2__r fv-est2__edit">{r.totalFreight}</td>
                    <td className="fv-est2__r">{r.aComm}</td>
                    <td className="fv-est2__r">{r.brkg}</td>
                    <td className="fv-est2__r">{r.frtTax}</td>
                    <td><i className="fas fa-magnifying-glass fv-est2__muted" /></td>
                  </tr>
                ))}
                <tr className="fv-est2__empty-row"><td className="fv-est2__num">5</td><td colSpan={12} /></tr>
              </tbody>
              <tfoot>
                <tr className="fv-est2__total">
                  <td colSpan={5} />
                  <td className="fv-est2__r">{cargoTotals.qty}</td>
                  <td className="fv-est2__r">30.5</td>
                  <td />
                  <td className="fv-est2__r">{cargoTotals.total}</td>
                  <td className="fv-est2__r">3.8 %</td>
                  <td className="fv-est2__r">1.3 %</td>
                  <td className="fv-est2__r">0.0 %</td>
                  <td className="fv-est2__r">0.0</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* Port Rotation */}
        <section className="fv-est2__panel">
          <div className="fv-est2__panel-head">
            <span className="fv-est2__panel-title">Port Rotation</span>
            <label className="fv-est2__check"><input type="checkbox" defaultChecked /> SUEZ</label>
            <label className="fv-est2__check"><input type="checkbox" defaultChecked /> PANAMA</label>
            <label className="fv-est2__check"><input type="checkbox" /> KIEL</label>
            <span className="fv-est2__portsum">
              Total Duration: 63.56 Days (Ballast: 2.22, Laden: 40.85, ECA: 11.70, Port: 20.49) · (Port local time) 2020-08-06 16:10 ~ 2020-10-08 22:34
            </span>
          </div>
          <div className="fv-est2__gridwrap">
            <table className="fv-est2__grid">
              <thead>
                <tr>
                  <th className="fv-est2__num">#</th>
                  <th>Type</th><th>Port Name or Coordinates</th>
                  <th className="fv-est2__r">Distance / ECA</th><th className="fv-est2__r">W.F</th>
                  <th className="fv-est2__r">Spd</th><th className="fv-est2__r">Sea</th>
                  <th className="fv-est2__r">L / D Rate</th><th className="fv-est2__r">Port (I / W)</th>
                  <th className="fv-est2__r">Dem</th><th className="fv-est2__r">Des</th>
                  <th className="fv-est2__r">Port Charge</th><th>Arrival</th><th>Departure</th>
                </tr>
              </thead>
              <tbody>
                {PORT_ROWS.map((r, i) => (
                  <tr key={i}>
                    <td className="fv-est2__num">{i + 1}</td>
                    <td>{r.type}</td>
                    <td>{r.name}</td>
                    <td className="fv-est2__r">{r.distEca}</td>
                    <td className="fv-est2__r">{r.wf}</td>
                    <td className="fv-est2__r fv-est2__edit">{r.spd}</td>
                    <td className="fv-est2__r">{r.sea}</td>
                    <td className="fv-est2__r fv-est2__edit">{r.ldRate}</td>
                    <td className="fv-est2__r">{r.portIW}</td>
                    <td className="fv-est2__r">{r.dem}</td>
                    <td className="fv-est2__r">{r.des}</td>
                    <td className="fv-est2__r fv-est2__edit">{r.portCharge}</td>
                    <td>{r.arrival}</td>
                    <td>{r.departure}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="fv-est2__total">
                  <td colSpan={3} />
                  <td className="fv-est2__r">13,142 / 417</td>
                  <td /><td />
                  <td className="fv-est2__r">43.07</td>
                  <td />
                  <td className="fv-est2__r">5.87 / 14.63</td>
                  <td className="fv-est2__r">0.0</td>
                  <td className="fv-est2__r">17,000.0</td>
                  <td className="fv-est2__r">383,000.0</td>
                  <td>2020-08-06 16:10</td>
                  <td>2020-10-08 22:34</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="fv-est2__portfoot">
            <button type="button" className="fv-est2__chip">Get Distance (F9)</button>
            <button type="button" className="fv-est2__chip">To Distance (F10)</button>
            <button type="button" className="fv-est2__chip">To Operation</button>
            <span className="fv-est2__portfoot-right">
              <select className="fv-est2__mini"><option>Days</option></select>
              <button type="button" className="fv-est2__chip fv-est2__chip--on">Port Local</button>
              <button type="button" className="fv-est2__chip">PC Time</button>
              <select className="fv-est2__mini"><option>Port local time</option></select>
            </span>
          </div>
        </section>

        {/* Bottom: Operation Expense | Bunker Expense | Result */}
        <div className="fv-est2__bottom">
          <section className="fv-est2__panel fv-est2__panel--flex">
            <div className="fv-est2__panel-head"><span className="fv-est2__panel-title">Operation Expense</span></div>
            <div className="fv-est2__kv2">
              <div>
                {OP_EXPENSE_L.map(([k, v]) => (
                  <div className="fv-est2__kv-row" key={k}>
                    <span className="fv-est2__kv-key">{k}</span>
                    <span className="fv-est2__kv-val fv-est2__edit">{v}</span>
                  </div>
                ))}
              </div>
              <div>
                {OP_EXPENSE_R.map(([k, v]) => (
                  <div className="fv-est2__kv-row" key={k}>
                    <span className="fv-est2__kv-key">{k}</span>
                    <span className="fv-est2__kv-val fv-est2__edit">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="fv-est2__panel fv-est2__panel--flex">
            <div className="fv-est2__panel-head">
              <span className="fv-est2__panel-title">Bunker Expense</span>
              <span className="fv-est2__panel-actions">
                <button type="button" className="fv-est2__chip fv-est2__chip--on"><i className="fas fa-list" /> Bunker Index</button>
                <button type="button" className="fv-est2__chip">Recent</button>
                <button type="button" className="fv-est2__chip"><i className="fas fa-gas-pump" /> Bunker Simulator</button>
              </span>
            </div>
            <table className="fv-est2__grid fv-est2__grid--bunker">
              <thead>
                <tr><th /><th className="fv-est2__r">Price / MT</th><th className="fv-est2__r">Consumption</th><th className="fv-est2__r">Expense</th></tr>
              </thead>
              <tbody>
                {BUNKERS.map((b) => (
                  <tr key={b.grade}>
                    <td>{b.grade}</td>
                    <td className="fv-est2__r fv-est2__edit">{b.price}</td>
                    <td className="fv-est2__r">{b.cons}</td>
                    <td className="fv-est2__r">{b.expense}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="fv-est2__panel fv-est2__panel--flex">
            <div className="fv-est2__panel-head">
              <span className="fv-est2__panel-title">Result</span>
              <span className="fv-est2__panel-actions">
                <button type="button" className="fv-est2__chip"><i className="fas fa-plus" /> Result Plus</button>
                <button type="button" className="fv-est2__chip"><i className="fas fa-chart-line" /> Analyzer</button>
                <button type="button" className="fv-est2__chip"><i className="fas fa-note-sticky" /> Remark</button>
              </span>
            </div>
            <div className="fv-est2__kv2">
              <div>
                {RESULT_L.map(([k, v]) => (
                  <div className="fv-est2__kv-row" key={k}>
                    <span className="fv-est2__kv-key">{k}</span>
                    <span className="fv-est2__kv-val fv-est2__edit">{v}</span>
                  </div>
                ))}
              </div>
              <div>
                {RESULT_R.map(([k, v, strong]) => (
                  <div className={`fv-est2__kv-row${strong ? ' fv-est2__kv-row--profit' : ''}`} key={k}>
                    <span className="fv-est2__kv-key">{k}</span>
                    <span className="fv-est2__kv-val">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
