/**
 * Tracksheet grid — read-only stub.
 *
 * Mirrors a representative subset of the legacy `TrackSheetProcessor`
 * column layout:
 *   - Fundamentals   : Date, Time, HRS, Lat, Lon, Course, Heading
 *   - Fuel Type 1    : ROB / Bunkered Qty / Corrected ROB
 *   - Fuel Type 2    : ROB / Bunkered Qty / Corrected ROB
 *   - Distances      : DistR, DistO, DTG-O, DTG-R
 *   - Speed          : Inst., AVG, Performance
 *   - Wind / Sea     : Wind dir/speed (Bft), Wave height (m)
 *
 * The full Tabulator-based tracksheet has ~50+ columns; this is a
 * deliberately compact preview suitable for the bottom-panel slot.
 * Wire it to the real `/api/voyage/{id}/tracksheet` endpoint when it
 * is exposed for the React app.
 */

interface TrackRow {
  date: string;
  time: string;
  hrs: number;
  lat: string;
  lon: string;
  course: number;
  heading: number;
  ft1Rob: number;
  ft1Bunkered: number;
  ft1Corrected: number;
  ft2Rob: number;
  ft2Bunkered: number;
  ft2Corrected: number;
  distR: number;
  distO: number;
  dtgO: number;
  dtgR: number;
  speedInst: number;
  speedAvg: number;
  performance: number;
  windDir: string;
  windBft: number;
  waveM: number;
}

const STUB_ROWS: TrackRow[] = [
  {
    date: '14-Jun-2026',
    time: '12:00',
    hrs: 24.0,
    lat: '23°15.4 S',
    lon: '044°22.1 W',
    course: 88,
    heading: 90,
    ft1Rob: 1850.4,
    ft1Bunkered: 0,
    ft1Corrected: 1820.1,
    ft2Rob: 122.6,
    ft2Bunkered: 0,
    ft2Corrected: 121.0,
    distR: 290,
    distO: 295,
    dtgO: 9520,
    dtgR: 9510,
    speedInst: 12.1,
    speedAvg: 11.9,
    performance: 0.2,
    windDir: 'NE',
    windBft: 4,
    waveM: 1.8,
  },
  {
    date: '15-Jun-2026',
    time: '12:00',
    hrs: 24.0,
    lat: '22°02.8 S',
    lon: '040°10.9 W',
    course: 86,
    heading: 88,
    ft1Rob: 1790.0,
    ft1Bunkered: 0,
    ft1Corrected: 1760.5,
    ft2Rob: 121.0,
    ft2Bunkered: 0,
    ft2Corrected: 119.5,
    distR: 287,
    distO: 290,
    dtgO: 9230,
    dtgR: 9223,
    speedInst: 11.95,
    speedAvg: 11.92,
    performance: 0.05,
    windDir: 'ENE',
    windBft: 5,
    waveM: 2.1,
  },
  {
    date: '16-Jun-2026',
    time: '12:00',
    hrs: 24.0,
    lat: '20°48.1 S',
    lon: '035°57.4 W',
    course: 85,
    heading: 86,
    ft1Rob: 1731.2,
    ft1Bunkered: 0,
    ft1Corrected: 1700.8,
    ft2Rob: 119.5,
    ft2Bunkered: 0,
    ft2Corrected: 118.0,
    distR: 295,
    distO: 298,
    dtgO: 8932,
    dtgR: 8928,
    speedInst: 12.3,
    speedAvg: 12.1,
    performance: 0.2,
    windDir: 'E',
    windBft: 5,
    waveM: 2.4,
  },
  {
    date: '17-Jun-2026',
    time: '12:00',
    hrs: 24.0,
    lat: '19°34.6 S',
    lon: '031°45.2 W',
    course: 84,
    heading: 85,
    ft1Rob: 1672.6,
    ft1Bunkered: 200.0,
    ft1Corrected: 1842.1,
    ft2Rob: 118.0,
    ft2Bunkered: 0,
    ft2Corrected: 116.4,
    distR: 282,
    distO: 287,
    dtgO: 8645,
    dtgR: 8646,
    speedInst: 11.75,
    speedAvg: 11.96,
    performance: -0.21,
    windDir: 'ESE',
    windBft: 6,
    waveM: 3.0,
  },
  {
    date: '18-Jun-2026',
    time: '12:00',
    hrs: 24.0,
    lat: '18°20.9 S',
    lon: '027°33.7 W',
    course: 84,
    heading: 84,
    ft1Rob: 1782.5,
    ft1Bunkered: 0,
    ft1Corrected: 1752.6,
    ft2Rob: 116.4,
    ft2Bunkered: 0,
    ft2Corrected: 114.9,
    distR: 290,
    distO: 292,
    dtgO: 8353,
    dtgR: 8356,
    speedInst: 12.17,
    speedAvg: 12.0,
    performance: 0.17,
    windDir: 'SE',
    windBft: 4,
    waveM: 1.7,
  },
  {
    date: '19-Jun-2026',
    time: '12:00',
    hrs: 24.0,
    lat: '17°08.2 S',
    lon: '023°22.3 W',
    course: 84,
    heading: 85,
    ft1Rob: 1722.0,
    ft1Bunkered: 0,
    ft1Corrected: 1692.4,
    ft2Rob: 114.9,
    ft2Bunkered: 0,
    ft2Corrected: 113.5,
    distR: 289,
    distO: 291,
    dtgO: 8062,
    dtgR: 8067,
    speedInst: 12.13,
    speedAvg: 12.04,
    performance: 0.09,
    windDir: 'SE',
    windBft: 3,
    waveM: 1.4,
  },
  {
    date: '20-Jun-2026',
    time: '12:00',
    hrs: 24.0,
    lat: '15°55.5 S',
    lon: '019°10.9 W',
    course: 84,
    heading: 84,
    ft1Rob: 1661.7,
    ft1Bunkered: 0,
    ft1Corrected: 1632.2,
    ft2Rob: 113.5,
    ft2Bunkered: 0,
    ft2Corrected: 112.0,
    distR: 286,
    distO: 288,
    dtgO: 7774,
    dtgR: 7781,
    speedInst: 12.0,
    speedAvg: 12.03,
    performance: -0.03,
    windDir: 'S',
    windBft: 4,
    waveM: 1.9,
  },
];

function n(value: number, digits = 2): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function TracksheetGrid() {
  return (
    <div className="fv-tracksheet">
      <table className="fv-tracksheet__table">
        <thead>
          <tr className="fv-tracksheet__group-row">
            <th colSpan={7}>Fundamentals</th>
            <th colSpan={3}>Fuel Type 1</th>
            <th colSpan={3}>Fuel Type 2</th>
            <th colSpan={4}>Distances</th>
            <th colSpan={3}>Speed</th>
            <th colSpan={3}>Wind / Sea</th>
          </tr>
          <tr className="fv-tracksheet__head-row">
            <th>Date</th>
            <th>Time</th>
            <th>HRS</th>
            <th>Lat</th>
            <th>Lon</th>
            <th>Course</th>
            <th>Heading</th>

            <th>ROB</th>
            <th>Bunkered</th>
            <th>Corr. ROB</th>

            <th>ROB</th>
            <th>Bunkered</th>
            <th>Corr. ROB</th>

            <th>DistR</th>
            <th>DistO</th>
            <th>DTG-O</th>
            <th>DTG-R</th>

            <th>Inst.</th>
            <th>AVG</th>
            <th>Perf.</th>

            <th>Wind dir</th>
            <th>Wind (Bft)</th>
            <th>Wave (m)</th>
          </tr>
        </thead>
        <tbody>
          {STUB_ROWS.map((r) => (
            <tr key={`${r.date}-${r.time}`}>
              <td>{r.date}</td>
              <td>{r.time}</td>
              <td className="fv-tracksheet__num">{n(r.hrs, 1)}</td>
              <td>{r.lat}</td>
              <td>{r.lon}</td>
              <td className="fv-tracksheet__num">{r.course}°</td>
              <td className="fv-tracksheet__num">{r.heading}°</td>

              <td className="fv-tracksheet__num">{n(r.ft1Rob, 1)}</td>
              <td className="fv-tracksheet__num">{n(r.ft1Bunkered, 1)}</td>
              <td className="fv-tracksheet__num">{n(r.ft1Corrected, 1)}</td>

              <td className="fv-tracksheet__num">{n(r.ft2Rob, 1)}</td>
              <td className="fv-tracksheet__num">{n(r.ft2Bunkered, 1)}</td>
              <td className="fv-tracksheet__num">{n(r.ft2Corrected, 1)}</td>

              <td className="fv-tracksheet__num">{r.distR}</td>
              <td className="fv-tracksheet__num">{r.distO}</td>
              <td className="fv-tracksheet__num">{r.dtgO.toLocaleString()}</td>
              <td className="fv-tracksheet__num">{r.dtgR.toLocaleString()}</td>

              <td className="fv-tracksheet__num">{n(r.speedInst, 2)}</td>
              <td className="fv-tracksheet__num">{n(r.speedAvg, 2)}</td>
              <td
                className={`fv-tracksheet__num ${
                  r.performance >= 0
                    ? 'fv-tracksheet__perf-gain'
                    : 'fv-tracksheet__perf-loss'
                }`}
              >
                {r.performance >= 0 ? '+' : ''}
                {n(r.performance, 2)}
              </td>

              <td>{r.windDir}</td>
              <td className="fv-tracksheet__num">{r.windBft}</td>
              <td className="fv-tracksheet__num">{n(r.waveM, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
