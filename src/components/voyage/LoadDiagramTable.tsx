import { Cell } from './primitives';

/** Vessel-profile fields of the Telegraph Table; used to pre-fill speeds when a row's RPM matches a telegraph order. */
export type TelegraphKey =
  | 'deadSlowRpm' | 'slowAheadRpm' | 'halfAheadRpm' | 'fullAheadRpm'
  | 'deadSlowSpeedBallast' | 'slowAheadSpeedBallast' | 'halfAheadSpeedBallast' | 'fullAheadSpeedBallast'
  | 'deadSlowSpeedLaden' | 'slowAheadSpeedLaden' | 'halfAheadSpeedLaden' | 'fullAheadSpeedLaden';

export type TelegraphValues = Partial<Record<TelegraphKey, string>>;

const NUMERIC_FIELDS = [
  'loadPct', 'rpm', 'powerKw',
  'ballastSpeedKn', 'ballastConsMt', 'ladenSpeedKn', 'ladenConsMt', 'aeConsMt',
  'minPowerKw', 'maxPowerKw', 'maxTorqueKnm',
] as const;
type NumericField = (typeof NUMERIC_FIELDS)[number];

export interface LoadDiagramRow extends Record<NumericField, string> {
  key: string;
  /** Marks the row as a limit: EPL, Min MCR, Nominal MCR, Max MCR, Min RPM or Max RPM. */
  limit: string;
}

export const LIMIT_OPTIONS = ['EPL', 'Min MCR', 'Nominal MCR', 'Max MCR', 'Min RPM', 'Max RPM'];

const TELEGRAPH_ORDERS: { rpm: TelegraphKey; ballast: TelegraphKey; laden: TelegraphKey }[] = [
  { rpm: 'deadSlowRpm', ballast: 'deadSlowSpeedBallast', laden: 'deadSlowSpeedLaden' },
  { rpm: 'slowAheadRpm', ballast: 'slowAheadSpeedBallast', laden: 'slowAheadSpeedLaden' },
  { rpm: 'halfAheadRpm', ballast: 'halfAheadSpeedBallast', laden: 'halfAheadSpeedLaden' },
  { rpm: 'fullAheadRpm', ballast: 'fullAheadSpeedBallast', laden: 'fullAheadSpeedLaden' },
];

const LOAD_PERCENTS = [40, 45, 50, 55, 60, 65, 70, 75, 80, 82, 85, 90, 92, 95, 100];

const asText = (value: unknown): string =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : '';

function blankRow(key: string, loadPct = ''): LoadDiagramRow {
  return {
    key, limit: '',
    loadPct, rpm: '', powerKw: '',
    ballastSpeedKn: '', ballastConsMt: '', ladenSpeedKn: '', ladenConsMt: '', aeConsMt: '',
    minPowerKw: '', maxPowerKw: '', maxTorqueKnm: '',
  };
}

/** The standard load steps, shown until the table is changed. */
function defaultRows(): LoadDiagramRow[] {
  return LOAD_PERCENTS.map((pct) => blankRow(`load-${pct}`, String(pct)));
}

/** Rows from the stored JSON (any order, any load %); the standard load steps when nothing is stored. */
export function parseLoadDiagram(json: string): LoadDiagramRow[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((raw: Record<string, unknown>, index) => {
        const row = blankRow(typeof raw?.key === 'string' && raw.key ? raw.key : `row-${index}`);
        row.limit = typeof raw?.limit === 'string' ? (raw.limit === 'Least MCR' ? 'Min MCR' : raw.limit) : '';
        NUMERIC_FIELDS.forEach((field) => { row[field] = asText(raw?.[field]); });
        return row;
      });
    }
  } catch {
    // fall through to the standard rows
  }
  return defaultRows();
}

const toNumber = (text: string): number | null => {
  const parsed = Number(text);
  return text.trim() !== '' && Number.isFinite(parsed) ? parsed : null;
};

/** Stored JSON, or an empty string while the table is still the untouched standard rows. */
export function serializeLoadDiagram(rows: LoadDiagramRow[]): string {
  const defaults = defaultRows();
  const hasData = (row: LoadDiagramRow) =>
    NUMERIC_FIELDS.some((field) => field !== 'loadPct' && toNumber(row[field]) != null) || row.limit !== '';
  const untouched = rows.length === defaults.length
    && rows.every((row, i) => row.key === defaults[i].key && row.loadPct === defaults[i].loadPct && !hasData(row));
  if (untouched) return '';
  return JSON.stringify(
    rows.map((row) => ({
      key: row.key,
      limit: row.limit,
      ...Object.fromEntries(NUMERIC_FIELDS.map((field) => [field, toNumber(row[field])])),
    })),
  );
}

/** Main-engine torque (kNm) from power (kW) and RPM. */
export function torqueKnm(powerKw: number, rpm: number): number {
  return (9.5493 * powerKw) / rpm;
}

/**
 * Engine load diagram and operating table: one row per load step (add any load % you need, in any order),
 * with its RPM, engine power, ballast/laden speed and consumption, AE consumption and an optional limit
 * marker (EPL, Min MCR, Nominal MCR, Max MCR, Min RPM, Max RPM).
 *
 * The last columns keep the original purpose: allowed power and torque per RPM. The route optimizer keeps
 * the recommended RPM/power inside these limits between the first and last RPM that have a limit
 * (torque kNm = 9.5493 x power kW / RPM), and uses the Max MCR / EPL / Min MCR / Min RPM / Max RPM markers as engine limits
 * when the profile has no MCR limits of its own.
 *
 * When a row's RPM equals an RPM of the Telegraph Table, its blank ballast/laden speeds are filled from there.
 */
export function LoadDiagramTable({
  value,
  editing,
  onChange,
  telegraph,
}: {
  value: string;
  editing: boolean;
  onChange: (json: string) => void;
  telegraph?: TelegraphValues;
}) {
  const rows = parseLoadDiagram(value);
  const update = (next: LoadDiagramRow[]) => onChange(serializeLoadDiagram(next));

  const setCell = (index: number, field: NumericField, text: string) => {
    update(rows.map((row, i) => {
      if (i !== index) return row;
      const next = { ...row, [field]: text };
      if (field === 'rpm' && telegraph) {
        const order = TELEGRAPH_ORDERS.find((candidate) => {
          const telegraphRpm = toNumber(telegraph[candidate.rpm] ?? '');
          return telegraphRpm != null && telegraphRpm === toNumber(text);
        });
        if (order) {
          if (next.ballastSpeedKn.trim() === '') next.ballastSpeedKn = telegraph[order.ballast] ?? '';
          if (next.ladenSpeedKn.trim() === '') next.ladenSpeedKn = telegraph[order.laden] ?? '';
        }
      }
      return next;
    }));
  };
  const setLimit = (index: number, text: string) =>
    update(rows.map((row, i) => (i === index ? { ...row, limit: text } : row)));

  const numberCell = (index: number, field: NumericField) => (
    <td><Cell editing={editing} value={rows[index][field]} onChange={(x) => setCell(index, field, x)} type="number" /></td>
  );

  return (
    <div className="fv-voyage__col fv-voyage__col--full">
      <span className="fv-voyage__info-label">Engine Load Diagram</span>
      <div className="fv-voyage__table-scroll">
        <table className="fv-voyage__dtable fv-loaddiagram">
          <thead>
            <tr>
              <th colSpan={2}>Ballast Details</th>
              <th colSpan={2}>Laden Details</th>
              <th rowSpan={2}>AE Consumption (mts/day)</th>
              <th rowSpan={2}>RPM</th>
              <th rowSpan={2}>ME Engine Power (kW)</th>
              <th rowSpan={2}>% Load</th>
              <th rowSpan={2} title="Mark a row as a limit: EPL, Min/Nominal/Max MCR (uses the % Load) or Min/Max RPM (uses the RPM)">Indicate limits</th>
              <th colSpan={4}>Allowed at this RPM</th>
              {editing && <th rowSpan={2} />}
            </tr>
            <tr>
              <th>Ballast Speed (kts)</th>
              <th>ME Consumption (mts/day)</th>
              <th>Laden Speed (kts)</th>
              <th>ME Consumption (mts/day)</th>
              <th>Min Power (kW)</th>
              <th>Max Power (kW)</th>
              <th>Max Torque (kNm)</th>
              <th title="9.5493 x Max Power / RPM">Torque at Max Power (kNm)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const rpm = Number(row.rpm);
              const maxPower = Number(row.maxPowerKw);
              const maxTorque = Number(row.maxTorqueKnm);
              const calculated = rpm > 0 && maxPower > 0 ? torqueKnm(maxPower, rpm) : null;
              const exceeds = calculated != null && maxTorque > 0 && calculated > maxTorque;
              return (
                <tr key={row.key}>
                  {numberCell(index, 'ballastSpeedKn')}
                  {numberCell(index, 'ballastConsMt')}
                  {numberCell(index, 'ladenSpeedKn')}
                  {numberCell(index, 'ladenConsMt')}
                  {numberCell(index, 'aeConsMt')}
                  {numberCell(index, 'rpm')}
                  {numberCell(index, 'powerKw')}
                  {numberCell(index, 'loadPct')}
                  <td><Cell editing={editing} value={row.limit} onChange={(x) => setLimit(index, x)} options={LIMIT_OPTIONS} /></td>
                  {numberCell(index, 'minPowerKw')}
                  {numberCell(index, 'maxPowerKw')}
                  {numberCell(index, 'maxTorqueKnm')}
                  <td title={exceeds ? 'Max power at this RPM gives more torque than the torque limit; the torque limit governs.' : undefined}>
                    {calculated != null ? `${calculated.toFixed(0)}${exceeds ? ' \u26a0' : ''}` : '\u2014'}
                  </td>
                  {editing && (
                    <td>
                      <button
                        type="button"
                        className="fv-voyage__edit-btn"
                        aria-label="Remove row"
                        onClick={() => update(rows.filter((_, i) => i !== index))}
                      >
                        <i className="fas fa-xmark" aria-hidden="true" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editing && (
        <button
          type="button"
          className="fv-voyage__edit-btn"
          onClick={() => update([...rows, blankRow(`row-${Date.now()}`)])}
        >
          <i className="fas fa-plus" aria-hidden="true" /> Add row
        </button>
      )}
    </div>
  );
}
