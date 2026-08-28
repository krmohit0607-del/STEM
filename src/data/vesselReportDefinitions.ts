/**
 * Vessel Reporting Portal — Definitions & Formats
 * Matches standard maritime noon, event, port, shifting, and exception reports.
 */

export interface FormFieldPart {
  key: string;
  label: string;
  unit?: string;
  placeholder?: string;
  type?: 'text' | 'datetime-local' | 'number' | 'select' | 'textarea';
  options?: string[];
}

export interface FormField {
  key: string;
  label: string;
  type?: 'text' | 'datetime-local' | 'number' | 'select' | 'textarea';
  placeholder?: string;
  unit?: string;
  options?: string[];
  parts?: FormFieldPart[];
}

export interface ReportSection {
  title: string;
  fields: FormField[];
}

export interface ReportDefinition {
  id: string;
  name: string;
  number: string;
  description?: string;
  hasSubtypes?: boolean;
  subtypes?: readonly string[];
  getSections: (subtype?: string) => ReportSection[];
  formatReportText: (values: Record<string, string>, subtype?: string) => string;
}

export const SHIFTING_SUBTYPES = [
  'Anchorage to Anchorage',
  'Anchorage to Berth',
  'Berth to Berth',
  'Berth to Anchorage',
] as const;

export type ShiftingSubtype = typeof SHIFTING_SUBTYPES[number];

// Helper helpers to format fields
function v(values: Record<string, string>, key: string, fallback = 'XXXXX'): string {
  const val = values[key]?.trim();
  return val ? val : fallback;
}

function numVal(values: Record<string, string>, key: string, fallback = 'XXX'): string {
  const val = values[key]?.trim();
  return val ? val : fallback;
}

function dtVal(values: Record<string, string>, key: string, fallback = 'XXXXX'): string {
  const val = values[key]?.trim();
  if (!val) return fallback;
  // If ISO string like 2026-07-08T12:00, format nicely or keep as is
  return val.replace('T', ' ');
}

function fmtPos(values: Record<string, string>, prefix: string): string {
  const latDeg = values[`${prefix}LatDeg`]?.trim();
  const latMin = values[`${prefix}LatMin`]?.trim();
  const latDir = values[`${prefix}LatDir`]?.trim() || 'N';
  const longDeg = values[`${prefix}LongDeg`]?.trim();
  const longMin = values[`${prefix}LongMin`]?.trim();
  const longDir = values[`${prefix}LongDir`]?.trim() || 'E';

  if (!latDeg && !latMin && !longDeg && !longMin) {
    const raw = values[prefix]?.trim();
    if (raw) return raw;
    return 'Lat: --° --\' N/S, Long: ---° --\' E/W';
  }
  return `${latDeg || '00'}° ${latMin || '00.0'}' ${latDir}, ${longDeg || '000'}° ${longMin || '00.0'}' ${longDir}`;
}

function positionParts(prefix: string): FormFieldPart[] {
  return [
    { key: `${prefix}LatDeg`, label: 'Lat deg', type: 'number', placeholder: '00' },
    { key: `${prefix}LatMin`, label: 'Lat min', type: 'number', placeholder: '00.0' },
    { key: `${prefix}LatDir`, label: 'N / S', type: 'select', options: ['N', 'S'] },
    { key: `${prefix}LongDeg`, label: 'Long deg', type: 'number', placeholder: '000' },
    { key: `${prefix}LongMin`, label: 'Long min', type: 'number', placeholder: '00.0' },
    { key: `${prefix}LongDir`, label: 'E / W', type: 'select', options: ['E', 'W'] },
  ];
}

function fmtDateTimePair(values: Record<string, string>, prefix: string): string {
  const utc = dtVal(values, `${prefix}Utc`, '');
  const lt = dtVal(values, `${prefix}Lt`, '');
  if (!utc && !lt) {
    const single = dtVal(values, prefix, '');
    if (single) return single;
    return 'UTC: XXXXX | LT: XXXXX';
  }
  return `UTC: ${utc || 'XXXXX'} | LT: ${lt || 'XXXXX'}`;
}

function weatherSectionFields(): FormField[] {
  return [
    {
      key: 'wind',
      label: 'Wind',
      parts: [
        { key: 'windDir', label: 'Direction', placeholder: 'e.g. NE' },
        { key: 'windForce', label: 'Force (BF)', placeholder: 'e.g. 4' },
        { key: 'windHeight', label: 'Height (m)', placeholder: 'e.g. 1.5' },
      ],
    },
    {
      key: 'sea',
      label: 'Sea',
      parts: [
        { key: 'seaDir', label: 'Direction', placeholder: 'e.g. NE' },
        { key: 'seaForce', label: 'Force / State', placeholder: 'e.g. Moderate' },
        { key: 'seaHeight', label: 'Height (m)', placeholder: 'e.g. 1.2' },
      ],
    },
    {
      key: 'swell',
      label: 'Swell',
      parts: [
        { key: 'swellDir', label: 'Direction', placeholder: 'e.g. ENE' },
        { key: 'swellForce', label: 'Force / Period', placeholder: 'e.g. Low / 6s' },
        { key: 'swellHeight', label: 'Height (m)', placeholder: 'e.g. 1.0' },
      ],
    },
    {
      key: 'current',
      label: 'Current',
      parts: [
        { key: 'currDir', label: 'Direction', placeholder: 'e.g. WSW' },
        { key: 'currSpeed', label: 'Speed (kts)', placeholder: 'e.g. 0.8' },
      ],
    },
    {
      key: 'temperature',
      label: 'Temperatures',
      parts: [
        { key: 'airTemp', label: 'Air Temp (°C)', placeholder: 'XX.X' },
        { key: 'seaTemp', label: 'Sea Water Temp (°C)', placeholder: 'XX.X' },
      ],
    },
  ];
}

function fmtWeatherText(values: Record<string, string>): string {
  const wind = `Wind: ${v(values, 'windDir', 'Direction')} / ${v(values, 'windForce', 'Force')} / ${v(values, 'windHeight', 'Height')}`;
  const sea = `Sea: ${v(values, 'seaDir', 'Direction')} / ${v(values, 'seaForce', 'Force')} / ${v(values, 'seaHeight', 'Height')}`;
  const swell = `Swell: ${v(values, 'swellDir', 'Direction')} / ${v(values, 'swellForce', 'Force')} / ${v(values, 'swellHeight', 'Height')}`;
  const curr = `Current: ${v(values, 'currDir', 'Direction')} / ${v(values, 'currSpeed', 'Speed')}`;
  const temp = `Air Temp.: ${numVal(values, 'airTemp', 'XX.X')} °C | Sea Water Temp.: ${numVal(values, 'seaTemp', 'XX.X')} °C`;
  return `${wind}\n\n${sea}\n\n${swell}\n\n${curr}\n\n${temp}`;
}

// 1. NOON REPORT
export const NOON_REPORT: ReportDefinition = {
  id: 'noon-report',
  number: '1',
  name: 'NOON REPORT',
  getSections: () => [
    {
      title: 'A) REPORT DETAILS',
      fields: [
        {
          key: 'reportTime',
          label: 'Date & Time of Report',
          parts: [
            { key: 'reportUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'reportLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        {
          key: 'noonPosition',
          label: 'Noon Position',
          parts: [
            { key: 'posLatDeg', label: 'Lat deg', type: 'number', placeholder: '00' },
            { key: 'posLatMin', label: 'Lat min', type: 'number', placeholder: '00.0' },
            { key: 'posLatDir', label: 'N / S', type: 'select', options: ['N', 'S'] },
            { key: 'posLongDeg', label: 'Long deg', type: 'number', placeholder: '000' },
            { key: 'posLongMin', label: 'Long min', type: 'number', placeholder: '00.0' },
            { key: 'posLongDir', label: 'E / W', type: 'select', options: ['E', 'W'] },
          ],
        },
      ],
    },
    {
      title: 'B) STEAMING SINCE LAST REPORT',
      fields: [
        {
          key: 'steaming',
          label: 'Steaming Details',
          parts: [
            { key: 'steamDist', label: 'Distance (NM)', placeholder: 'XXXX' },
            { key: 'steamTime', label: 'Time (Hours)', type: 'number', placeholder: 'XXX' },
            { key: 'steamCourse', label: 'Course (°)', placeholder: 'XXX' },
            { key: 'steamStw', label: 'STW (Knots)', placeholder: 'XX.X' },
            { key: 'steamSog', label: 'SOG (Knots)', placeholder: 'XX.X' },
          ],
        },
      ],
    },
    {
      title: 'C) ROB',
      fields: [
        {
          key: 'rob',
          label: 'Remaining On Board',
          parts: [
            { key: 'robFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'robDo', label: 'DO (MT)', placeholder: 'XXX' },
            { key: 'robFw', label: 'FW (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'D) DAILY CONSUMPTION',
      fields: [
        {
          key: 'dailyCons',
          label: 'Daily Fuel Consumption',
          parts: [
            { key: 'consFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'consDo', label: 'DO (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'E) CONSUMPTION BY EQUIPMENT',
      fields: [
        {
          key: 'consEquipmentFo',
          label: 'FO Consumption by Equipment',
          parts: [
            { key: 'foMe', label: 'FO M/E (MT)', placeholder: 'XXX' },
            { key: 'foAe', label: 'FO A/E (MT)', placeholder: 'XXX' },
            { key: 'foBoiler', label: 'FO Boiler (MT)', placeholder: 'XXX' },
          ],
        },
        {
          key: 'consEquipmentDo',
          label: 'DO Consumption by Equipment',
          parts: [
            { key: 'doMe', label: 'DO M/E (MT)', placeholder: 'XXX' },
            { key: 'doAe', label: 'DO A/E (MT)', placeholder: 'XXX' },
            { key: 'doBoiler', label: 'DO Boiler (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'F) CALORIFIC VALUE',
      fields: [
        {
          key: 'calorific',
          label: 'Fuel Calorific Value',
          parts: [
            { key: 'calFo', label: 'FO (MJ/kg)', placeholder: 'XX.X' },
            { key: 'calDo', label: 'DO (MJ/kg)', placeholder: 'XX.X' },
          ],
        },
      ],
    },
    {
      title: 'G) MAIN ENGINE PERFORMANCE',
      fields: [
        {
          key: 'mePerformance',
          label: 'Engine Performance',
          parts: [
            { key: 'mcr', label: 'MCR (kW / %)', placeholder: 'XXX' },
            { key: 'meRpm', label: 'Average M/E RPM', placeholder: 'XXX' },
            { key: 'slip', label: 'Slip (%)', placeholder: 'XX.X' },
          ],
        },
      ],
    },
    {
      title: 'H) WEATHER CONDITIONS (DIRECTION/FORCE/HEIGHT)',
      fields: weatherSectionFields(),
    },
    {
      title: 'I) TOTAL SINCE COSP',
      fields: [
        {
          key: 'totalSinceCosp',
          label: 'Voyage Totals',
          parts: [
            { key: 'cospDist', label: 'Distance (NM)', placeholder: 'XXXX' },
            { key: 'cospTime', label: 'Time (Hours)', type: 'number', placeholder: 'XXX' },
            { key: 'cospAvgSpeed', label: 'Average Speed (Knots)', placeholder: 'XX.X' },
          ],
        },
        {
          key: 'totalCospCons',
          label: 'Total Consumption Since COSP',
          parts: [
            { key: 'cospFoCons', label: 'FO Cons (MT)', placeholder: 'XXX' },
            { key: 'cospDoCons', label: 'DO Cons (MT)', placeholder: 'XXX' },
            { key: 'cospFwCons', label: 'FW Cons (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'J) NEXT PORT',
      fields: [
        {
          key: 'nextPortDetails',
          label: 'Port & Purpose',
          parts: [
            { key: 'nextPortName', label: 'Name', placeholder: 'Port name' },
            { key: 'nextPortPurpose', label: 'Purpose of Call', placeholder: 'Loading / Discharging / Bunkering' },
          ],
        },
        {
          key: 'nextPortDrafts',
          label: 'Drafts',
          parts: [
            { key: 'arrDraftFwd', label: 'Arr Draft FWD (m)', placeholder: 'XXX' },
            { key: 'airDraftAft', label: 'Air Draft AFT (m)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'K) ESTIMATED ROB ON ARRIVAL',
      fields: [
        {
          key: 'estArrivalRob',
          label: 'Estimated Arrival ROB',
          parts: [
            { key: 'arrRobFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'arrRobDo', label: 'DO (MT)', placeholder: 'XXX' },
            { key: 'arrRobFw', label: 'FW (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'L) VOYAGE INFORMATION',
      fields: [
        {
          key: 'voyageInfo',
          label: 'Distance to Go & ETA',
          parts: [
            { key: 'distToGo', label: 'Distance to Go (NM)', placeholder: 'XXXX' },
            { key: 'etaNextPortUtc', label: 'ETA Next Port (UTC)', type: 'datetime-local' },
            { key: 'etaNextPortLt', label: 'ETA Next Port (LT)', type: 'datetime-local' },
          ],
        },
      ],
    },
    {
      title: 'M) CARGO ONBOARD',
      fields: [
        {
          key: 'cargoOnboard',
          label: 'Cargo Details',
          parts: [
            { key: 'cargoName', label: 'Name', placeholder: 'e.g. Iron Ore / Clean Ballast' },
            { key: 'cargoQty', label: 'Quantity (MT)', placeholder: 'XXX' },
            { key: 'ballastQty', label: 'BALLAST Qty if in Ballast (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'N) ADDITIONAL REMARKS',
      fields: [
        {
          key: 'remarks',
          label: 'Additional Remarks and Stoppages',
          type: 'textarea',
          placeholder: 'Enter any remarks, delays, stoppages, deviations or notes...',
        },
      ],
    },
  ],
  formatReportText: (values) => `**1. NOON REPORT**

A) REPORT DETAILS:

Date & Time of Report (UTC, LT):
${fmtDateTimePair(values, 'report')}

Noon Position (Lat deg, min, N/S, Long deg, min, E/W):
${fmtPos(values, 'pos')}

B) STEAMING SINCE LAST REPORT:

Distance: ${numVal(values, 'steamDist', 'XXXX')} NM | Time: ${numVal(values, 'steamTime', 'XXX')} Hours | Course: ${numVal(values, 'steamCourse', 'XXX')}° | STW: ${numVal(values, 'steamStw', 'XX.X')} Knots | SOG: ${numVal(values, 'steamSog', 'XX.X')} Knots

C) ROB:

FO: ${numVal(values, 'robFo', 'XXX')} MT | DO: ${numVal(values, 'robDo', 'XXX')} MT | FW: ${numVal(values, 'robFw', 'XXX')} MT

D) DAILY CONSUMPTION:

FO: ${numVal(values, 'consFo', 'XXX')} MT | DO: ${numVal(values, 'consDo', 'XXX')} MT

E) CONSUMPTION BY EQUIPMENT:

FO M/E: ${numVal(values, 'foMe', 'XXX')} MT | FO A/E: ${numVal(values, 'foAe', 'XXX')} MT | FO Boiler: ${numVal(values, 'foBoiler', 'XXX')} MT

DO M/E: ${numVal(values, 'doMe', 'XXX')} MT | DO A/E: ${numVal(values, 'doAe', 'XXX')} MT | DO Boiler: ${numVal(values, 'doBoiler', 'XXX')} MT

F) CALORIFIC VALUE:

FO: ${numVal(values, 'calFo', 'XX.X')} MJ/kg | DO: ${numVal(values, 'calDo', 'XX.X')} MJ/kg

G) MAIN ENGINE PERFORMANCE:

MCR: ${v(values, 'mcr', 'XXX')} | Average M/E RPM: ${numVal(values, 'meRpm', 'XXX')} | Slip: ${numVal(values, 'slip', 'XX.X')} %

H) WEATHER CONDITIONS (DIRECTION/FORCE/HEIGHT):

${fmtWeatherText(values)}

I) TOTAL SINCE COSP:

Distance: ${numVal(values, 'cospDist', 'XXXX')} NM | Time: ${numVal(values, 'cospTime', 'XXX')} Hours | Average Speed: ${numVal(values, 'cospAvgSpeed', 'XX.X')} Knots

FO Cons: ${numVal(values, 'cospFoCons', 'XXX')} MT | DO Cons: ${numVal(values, 'cospDoCons', 'XXX')} MT | FW Cons: ${numVal(values, 'cospFwCons', 'XXX')} MT

J) NEXT PORT:

Name: ${v(values, 'nextPortName', 'XXXXX')} | Purpose of Call: ${v(values, 'nextPortPurpose', 'XXXXX')}

Arr Draft FWD: ${numVal(values, 'arrDraftFwd', 'XXX')} m | Air Draft AFT: ${numVal(values, 'airDraftAft', 'XXX')} m

K) ESTIMATED ROB ON ARRIVAL:

FO: ${numVal(values, 'arrRobFo', 'XXX')} MT | DO: ${numVal(values, 'arrRobDo', 'XXX')} MT | FW: ${numVal(values, 'arrRobFw', 'XXX')} MT

L) VOYAGE INFORMATION:

Distance to Go: ${numVal(values, 'distToGo', 'XXXX')} NM | ETA Next Port (UTC, LT): ${fmtDateTimePair(values, 'etaNextPort')}

M) CARGO ONBOARD:

Name: ${v(values, 'cargoName', 'XXXXX')} | Quantity: ${numVal(values, 'cargoQty', 'XXX')} MT | BALLAST Qty if in Ballast: ${numVal(values, 'ballastQty', 'XXX')} MT

N) ADDITIONAL REMARKS:

Additional Remarks and Stoppages:
${v(values, 'remarks', 'None')}`,
};

// 2. ARRIVAL REPORT (EOSP)
export const ARRIVAL_REPORT: ReportDefinition = {
  id: 'arrival-report',
  number: '2',
  name: 'ARRIVAL REPORT (EOSP)',
  getSections: () => [
    {
      title: 'A) REPORT DETAILS',
      fields: [
        {
          key: 'reportTime',
          label: 'Report Date & Time',
          parts: [
            { key: 'reportUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'reportLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        {
          key: 'arrivedPort',
          label: 'Arrived Port & Purpose',
          parts: [
            { key: 'portName', label: 'Port Name', placeholder: 'Port name' },
            { key: 'purposeOfCall', label: 'Purpose of Call', placeholder: 'Loading / Discharging' },
          ],
        },
      ],
    },
    {
      title: 'B) EOSP',
      fields: [
        { key: 'eospPos', label: 'Position (Lat deg, min, N/S, Long deg, min, E/W)', parts: positionParts('eosp') },
        {
          key: 'eospTime',
          label: 'Date & Time',
          parts: [
            { key: 'eospUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'eospLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        {
          key: 'eospRob',
          label: 'ROB at EOSP',
          parts: [
            { key: 'eospFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'eospDo', label: 'DO (MT)', placeholder: 'XXX' },
            { key: 'eospFw', label: 'FW (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'C) POB (IF APPLICABLE)',
      fields: [
        {
          key: 'pobTime',
          label: 'Date & Time',
          parts: [
            { key: 'pobUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'pobLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        {
          key: 'pobRob',
          label: 'ROB at POB',
          parts: [
            { key: 'pobFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'pobDo', label: 'DO (MT)', placeholder: 'XXX' },
            { key: 'pobFw', label: 'FW (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'D) ANCHORED / BERTHED',
      fields: [
        { key: 'anchoredPos', label: 'Position (Lat deg, min, N/S, Long deg, min, E/W)', parts: positionParts('anchored') },
        {
          key: 'anchoredTime',
          label: 'Date & Time',
          parts: [
            { key: 'anchoredUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'anchoredLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        {
          key: 'anchoredRob',
          label: 'ROB when Anchored / Berthed',
          parts: [
            { key: 'anchoredFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'anchoredDo', label: 'DO (MT)', placeholder: 'XXX' },
            { key: 'anchoredFw', label: 'FW (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'E) FWE',
      fields: [
        {
          key: 'fweTime',
          label: 'Date & Time',
          parts: [
            { key: 'fweUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'fweLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        {
          key: 'fweRob',
          label: 'ROB at FWE',
          parts: [
            { key: 'fweFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'fweDo', label: 'DO (MT)', placeholder: 'XXX' },
            { key: 'fweFw', label: 'FW (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'F) NOR TENDERED',
      fields: [
        { key: 'norPos', label: 'Position (Lat deg, min, N/S, Long deg, min, E/W)', parts: positionParts('nor') },
        {
          key: 'norTime',
          label: 'Date & Time',
          parts: [
            { key: 'norUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'norLt', label: 'LT', type: 'datetime-local' },
          ],
        },
      ],
    },
    {
      title: 'G) SINCE LAST REPORT TO EOSP',
      fields: [
        {
          key: 'sinceLastReport',
          label: 'Steaming Details',
          parts: [
            { key: 'eospSteamDist', label: 'Distance (NM)', placeholder: 'XXXX' },
            { key: 'eospSteamTime', label: 'Time (Hours)', type: 'number', placeholder: 'XXX' },
            { key: 'eospSteamStw', label: 'STW (Knots)', placeholder: 'XX.X' },
            { key: 'eospSteamSog', label: 'SOG (Knots)', placeholder: 'XX.X' },
          ],
        },
        {
          key: 'sinceLastReportCons',
          label: 'Consumption',
          parts: [
            { key: 'eospConsFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'eospConsDo', label: 'DO (MT)', placeholder: 'XXX' },
            { key: 'eospConsFw', label: 'FW (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'H) EOSP TO ANCHOR / BERTH / FWE',
      fields: [
        {
          key: 'eospToFwe',
          label: 'Manoeuvring Details',
          parts: [
            { key: 'manDist', label: 'Distance (NM)', placeholder: 'XXXX' },
            { key: 'manTime', label: 'Time (Hours)', type: 'number', placeholder: 'XXX' },
            { key: 'manStw', label: 'STW (Knots)', placeholder: 'XX.X' },
            { key: 'manSog', label: 'SOG (Knots)', placeholder: 'XX.X' },
          ],
        },
        {
          key: 'eospToFweCons',
          label: 'Consumption',
          parts: [
            { key: 'manConsFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'manConsDo', label: 'DO (MT)', placeholder: 'XXX' },
            { key: 'manConsFw', label: 'FW (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'I) TOTAL COSP TO EOSP',
      fields: [
        {
          key: 'cospToEosp',
          label: 'Passage Totals',
          parts: [
            { key: 'totalDist', label: 'Distance (NM)', placeholder: 'XXXX' },
            { key: 'totalTime', label: 'Time (Hours)', type: 'number', placeholder: 'XXX' },
            { key: 'totalSpeed', label: 'Average Speed (Knots)', placeholder: 'XX.X' },
          ],
        },
        {
          key: 'cospToEospCons',
          label: 'Total Consumption & Avg RPM',
          parts: [
            { key: 'totalFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'totalDo', label: 'DO (MT)', placeholder: 'XXX' },
            { key: 'totalFw', label: 'FW (MT)', placeholder: 'XXX' },
            { key: 'avgRpm', label: 'Avg RPM', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'J) CARGO',
      fields: [
        {
          key: 'cargoArrival',
          label: 'Cargo Onboard / To be Loaded / Discharged',
          parts: [
            { key: 'cargoName', label: 'Name', placeholder: 'e.g. Wheat' },
            { key: 'cargoQty', label: 'Quantity (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'K) DRAFT',
      fields: [
        {
          key: 'arrDraft',
          label: 'Arrival Draft',
          parts: [
            { key: 'arrDraftFore', label: 'Arrival Draft Fore (m)', placeholder: 'XXX' },
            { key: 'arrDraftAft', label: 'Arrival Draft Aft (m)', placeholder: 'XXX' },
          ],
        },
        {
          key: 'depDraft',
          label: 'Estimated Departure Draft',
          parts: [
            { key: 'depDraftFore', label: 'Departure Draft Fore (m)', placeholder: 'XXX' },
            { key: 'depDraftAft', label: 'Departure Draft Aft (m)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'L) PORT SCHEDULE',
      fields: [
        {
          key: 'portSchedule',
          label: 'ETB & ETD',
          parts: [
            { key: 'etbUtc', label: 'ETB (UTC)', type: 'datetime-local' },
            { key: 'etbLt', label: 'ETB (LT)', type: 'datetime-local' },
            { key: 'etdUtc', label: 'ETD (UTC)', type: 'datetime-local' },
            { key: 'etdLt', label: 'ETD (LT)', type: 'datetime-local' },
          ],
        },
      ],
    },
    {
      title: 'M) DELAY',
      fields: [
        {
          key: 'delayReason',
          label: 'Reason for Delay in Berthing (if applicable)',
          type: 'textarea',
          placeholder: 'e.g. Waiting for daylight / berth occupied / pilot delay...',
        },
      ],
    },
    {
      title: 'N) ADDITIONAL REMARKS',
      fields: [
        {
          key: 'remarks',
          label: 'Additional Remarks',
          type: 'textarea',
          placeholder: 'Enter any additional remarks...',
        },
      ],
    },
  ],
  formatReportText: (values) => `**2. ARRIVAL REPORT (EOSP)**

A) REPORT DETAILS:

Report Date & Time (UTC, LT):
${fmtDateTimePair(values, 'report')}

Arrived - Port Name: ${v(values, 'portName', 'XXXXX')} | Purpose of Call: ${v(values, 'purposeOfCall', 'XXXXX')}

B) EOSP:

Position (Lat deg, min, N/S, Long deg, min, E/W): ${fmtPos(values, 'eosp')}

Date & Time (UTC, LT): ${fmtDateTimePair(values, 'eosp')}

ROB - FO: ${numVal(values, 'eospFo', 'XXX')} MT | DO: ${numVal(values, 'eospDo', 'XXX')} MT | FW: ${numVal(values, 'eospFw', 'XXX')} MT

C) POB (IF APPLICABLE):

Date & Time (UTC, LT): ${fmtDateTimePair(values, 'pob')}

ROB - FO: ${numVal(values, 'pobFo', 'XXX')} MT | DO: ${numVal(values, 'pobDo', 'XXX')} MT | FW: ${numVal(values, 'pobFw', 'XXX')} MT

D) ANCHORED / BERTHED:

Position (Lat deg, min, N/S, Long deg, min, E/W): ${fmtPos(values, 'anchored')}

Date & Time (UTC, LT): ${fmtDateTimePair(values, 'anchored')}

ROB - FO: ${numVal(values, 'anchoredFo', 'XXX')} MT | DO: ${numVal(values, 'anchoredDo', 'XXX')} MT | FW: ${numVal(values, 'anchoredFw', 'XXX')} MT

E) FWE:

Date & Time (UTC, LT): ${fmtDateTimePair(values, 'fwe')}

ROB - FO: ${numVal(values, 'fweFo', 'XXX')} MT | DO: ${numVal(values, 'fweDo', 'XXX')} MT | FW: ${numVal(values, 'fweFw', 'XXX')} MT

F) NOR TENDERED:

Position (Lat deg, min, N/S, Long deg, min, E/W): ${fmtPos(values, 'nor')}

Date & Time (UTC, LT): ${fmtDateTimePair(values, 'nor')}

G) SINCE LAST REPORT TO EOSP:

Distance: ${numVal(values, 'eospSteamDist', 'XXXX')} NM | Time: ${numVal(values, 'eospSteamTime', 'XXX')} Hours | STW: ${numVal(values, 'eospSteamStw', 'XX.X')} Knots | SOG: ${numVal(values, 'eospSteamSog', 'XX.X')} Knots

Cons - FO: ${numVal(values, 'eospConsFo', 'XXX')} MT | DO: ${numVal(values, 'eospConsDo', 'XXX')} MT | FW: ${numVal(values, 'eospConsFw', 'XXX')} MT

H) EOSP TO ANCHOR / BERTH / FWE:

Distance: ${numVal(values, 'manDist', 'XXXX')} NM | Time: ${numVal(values, 'manTime', 'XXX')} Hours | STW: ${numVal(values, 'manStw', 'XX.X')} Knots | SOG: ${numVal(values, 'manSog', 'XX.X')} Knots

Cons - FO: ${numVal(values, 'manConsFo', 'XXX')} MT | DO: ${numVal(values, 'manConsDo', 'XXX')} MT | FW: ${numVal(values, 'manConsFw', 'XXX')} MT

I) TOTAL COSP TO EOSP:

Distance: ${numVal(values, 'totalDist', 'XXXX')} NM | Time: ${numVal(values, 'totalTime', 'XXX')} Hours | Average Speed: ${numVal(values, 'totalSpeed', 'XX.X')} Knots

Consumption: FO ${numVal(values, 'totalFo', 'XXX')} MT | DO ${numVal(values, 'totalDo', 'XXX')} MT | FW ${numVal(values, 'totalFw', 'XXX')} MT | Avg RPM: ${numVal(values, 'avgRpm', 'XXX')}

J) CARGO:

Cargo Onboard / To be Loaded / Discharged - Name / Quantity: ${v(values, 'cargoName', 'XXXXX')} / ${numVal(values, 'cargoQty', 'XXX')} MT

K) DRAFT:

Arrival Draft Fore: ${numVal(values, 'arrDraftFore', 'XXX')} m | Arrival Draft Aft: ${numVal(values, 'arrDraftAft', 'XXX')} m

Departure Draft Fore: ${numVal(values, 'depDraftFore', 'XXX')} m | Departure Draft Aft: ${numVal(values, 'depDraftAft', 'XXX')} m

L) PORT SCHEDULE:

ETB (UTC, LT): ${fmtDateTimePair(values, 'etb')} | ETD (UTC, LT): ${fmtDateTimePair(values, 'etd')}

M) DELAY:

Reason for Delay in Berthing (if applicable):
${v(values, 'delayReason', 'None')}

N) ADDITIONAL REMARKS:

Additional Remarks:
${v(values, 'remarks', 'None')}`,
};

// 3. DEPARTURE REPORT (COSP)
export const DEPARTURE_REPORT: ReportDefinition = {
  id: 'departure-report',
  number: '3',
  name: 'DEPARTURE REPORT (COSP)',
  getSections: () => [
    {
      title: 'A) REPORT DETAILS',
      fields: [
        {
          key: 'reportTime',
          label: 'COSP Report Date & Time',
          parts: [
            { key: 'reportUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'reportLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        {
          key: 'departedPort',
          label: 'Departed Port Name / Berth or Anchorage',
          placeholder: 'e.g. Rotterdam / Berth 4',
        },
      ],
    },
    {
      title: 'B) SBE',
      fields: [
        {
          key: 'sbeTime',
          label: 'Date & Time',
          parts: [
            { key: 'sbeUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'sbeLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        {
          key: 'sbeRob',
          label: 'ROB at SBE',
          parts: [
            { key: 'sbeFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'sbeDo', label: 'DO (MT)', placeholder: 'XXX' },
            { key: 'sbeFw', label: 'FW (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'C) POB',
      fields: [
        {
          key: 'pobTime',
          label: 'Date & Time',
          parts: [
            { key: 'pobUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'pobLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        {
          key: 'pobRob',
          label: 'ROB at POB',
          parts: [
            { key: 'pobFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'pobDo', label: 'DO (MT)', placeholder: 'XXX' },
            { key: 'pobFw', label: 'FW (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'D) ALL CAST OFF',
      fields: [
        {
          key: 'allCastOffTime',
          label: 'Date & Time',
          parts: [
            { key: 'castOffUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'castOffLt', label: 'LT', type: 'datetime-local' },
          ],
        },
      ],
    },
    {
      title: 'E) PILOT OFF',
      fields: [
        { key: 'pilotOffPos', label: 'Position (Lat deg, min, N/S, Long deg, min, E/W)', parts: positionParts('pilotOff') },
        {
          key: 'pilotOffTime',
          label: 'Date & Time',
          parts: [
            { key: 'pilotOffUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'pilotOffLt', label: 'LT', type: 'datetime-local' },
          ],
        },
      ],
    },
    {
      title: 'F) ROB AT COSP',
      fields: [
        {
          key: 'cospRob',
          label: 'ROB at COSP',
          parts: [
            { key: 'cospFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'cospDo', label: 'DO (MT)', placeholder: 'XXX' },
            { key: 'cospFw', label: 'FW (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'G) CARGO ONBOARD',
      fields: [
        {
          key: 'cargoDeparture',
          label: 'Cargo Name / Quantity or BALLAST',
          placeholder: 'e.g. Soya Beans / 64,500 MT or BALLAST 18,200 MT',
        },
      ],
    },
    {
      title: 'H) DEPARTURE DRAFT',
      fields: [
        {
          key: 'depDraft',
          label: 'Departure Draft',
          parts: [
            { key: 'depDraftFore', label: 'Fore (m)', placeholder: 'XXX' },
            { key: 'depDraftAft', label: 'Aft (m)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'I) NEXT PORT',
      fields: [
        {
          key: 'nextPort',
          label: 'Next Port Details',
          parts: [
            { key: 'nextPortName', label: 'Name', placeholder: 'Port name' },
            { key: 'nextPortPurpose', label: 'Purpose of Call', placeholder: 'Discharging / Bunkering' },
            { key: 'distToNextPort', label: 'Distance to Next Port (NM)', placeholder: 'XXXX' },
          ],
        },
      ],
    },
    {
      title: 'J) ETA NEXT PORT',
      fields: [
        {
          key: 'etaNextPort',
          label: 'ETA Next Port',
          parts: [
            { key: 'etaUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'etaLt', label: 'LT', type: 'datetime-local' },
          ],
        },
      ],
    },
    {
      title: 'K) ESTIMATED ROB ON ARRIVAL',
      fields: [
        {
          key: 'arrivalRob',
          label: 'Estimated Arrival ROB',
          parts: [
            { key: 'arrFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'arrDo', label: 'DO (MT)', placeholder: 'XXX' },
            { key: 'arrFw', label: 'FW (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'L) ADDITIONAL REMARKS',
      fields: [
        {
          key: 'remarks',
          label: 'Additional Remarks',
          type: 'textarea',
          placeholder: 'Enter any additional remarks...',
        },
      ],
    },
  ],
  formatReportText: (values) => `**3. DEPARTURE REPORT (COSP)**

A) REPORT DETAILS:

COSP Report Date & Time (UTC, LT):
${fmtDateTimePair(values, 'report')}

Departed - Port Name / Berth or Anchorage: ${v(values, 'departedPort', 'XXXXX')}

B) SBE:

Date & Time (UTC, LT): ${fmtDateTimePair(values, 'sbe')}

ROB - FO: ${numVal(values, 'sbeFo', 'XXX')} MT | DO: ${numVal(values, 'sbeDo', 'XXX')} MT | FW: ${numVal(values, 'sbeFw', 'XXX')} MT

C) POB:

Date & Time (UTC, LT): ${fmtDateTimePair(values, 'pob')}

ROB - FO: ${numVal(values, 'pobFo', 'XXX')} MT | DO: ${numVal(values, 'pobDo', 'XXX')} MT | FW: ${numVal(values, 'pobFw', 'XXX')} MT

D) ALL CAST OFF:

Date & Time (UTC, LT): ${fmtDateTimePair(values, 'castOff')}

E) PILOT OFF:

Position (Lat deg, min, N/S, Long deg, min, E/W): ${fmtPos(values, 'pilotOff')} | Date & Time (UTC, LT): ${fmtDateTimePair(values, 'pilotOff')}

F) ROB AT COSP:

FO: ${numVal(values, 'cospFo', 'XXX')} MT | DO: ${numVal(values, 'cospDo', 'XXX')} MT | FW: ${numVal(values, 'cospFw', 'XXX')} MT

G) CARGO ONBOARD:

Name / Quantity or BALLAST: ${v(values, 'cargoDeparture', 'XXXXX')}

H) DEPARTURE DRAFT:

Fore: ${numVal(values, 'depDraftFore', 'XXX')} m | Aft: ${numVal(values, 'depDraftAft', 'XXX')} m

I) NEXT PORT:

Name: ${v(values, 'nextPortName', 'XXXXX')} | Purpose of Call: ${v(values, 'nextPortPurpose', 'XXXXX')} | Distance to Next Port: ${numVal(values, 'distToNextPort', 'XXXX')} NM

J) ETA NEXT PORT:

ETA Next Port (UTC, LT): ${fmtDateTimePair(values, 'eta')}

K) ESTIMATED ROB ON ARRIVAL:

FO: ${numVal(values, 'arrFo', 'XXX')} MT | DO: ${numVal(values, 'arrDo', 'XXX')} MT | FW: ${numVal(values, 'arrFw', 'XXX')} MT

L) ADDITIONAL REMARKS:

Additional Remarks:
${v(values, 'remarks', 'None')}`,
};

// 5. ANCHORAGE / DRIFTING - DAILY REPORT
export const ANCHORAGE_DRIFTING_DAILY_REPORT: ReportDefinition = {
  id: 'anchorage-drifting-daily-report',
  number: '5',
  name: 'ANCHORAGE / DRIFTING - DAILY REPORT',
  getSections: () => [
    {
      title: 'A) REPORT DETAILS',
      fields: [
        {
          key: 'reportTime',
          label: 'Report Date & Time',
          parts: [
            { key: 'reportUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'reportLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        {
          key: 'portAndAnchorage',
          label: 'Port Name & Anchorage Name',
          placeholder: 'e.g. Singapore / Eastern Working Anchorage',
        },
        {
          key: 'position',
          label: 'Anchorage / Drifting Position',
          parts: [
            { key: 'posLatDeg', label: 'Lat deg', type: 'number', placeholder: '00' },
            { key: 'posLatMin', label: 'Lat min', type: 'number', placeholder: '00.0' },
            { key: 'posLatDir', label: 'N / S', type: 'select', options: ['N', 'S'] },
            { key: 'posLongDeg', label: 'Long deg', type: 'number', placeholder: '000' },
            { key: 'posLongMin', label: 'Long min', type: 'number', placeholder: '00.0' },
            { key: 'posLongDir', label: 'E / W', type: 'select', options: ['E', 'W'] },
          ],
        },
      ],
    },
    {
      title: 'B) ROB',
      fields: [
        {
          key: 'rob',
          label: 'Remaining On Board',
          parts: [
            { key: 'robFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'robDo', label: 'DO (MT)', placeholder: 'XXX' },
            { key: 'robFw', label: 'FW (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'C) DAILY CONSUMPTION',
      fields: [
        {
          key: 'dailyCons',
          label: 'Daily Fuel Consumption',
          parts: [
            { key: 'consFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'consDo', label: 'DO (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'D) EQUIPMENT CONSUMPTION',
      fields: [
        {
          key: 'foEquipment',
          label: 'FO Consumption by Equipment',
          parts: [
            { key: 'foMe', label: 'FO M/E (MT)', placeholder: 'XXX' },
            { key: 'foAe', label: 'FO A/E (MT)', placeholder: 'XXX' },
            { key: 'foBoiler', label: 'FO Boiler (MT)', placeholder: 'XXX' },
          ],
        },
        {
          key: 'doEquipment',
          label: 'DO Consumption by Equipment',
          parts: [
            { key: 'doMe', label: 'DO M/E (MT)', placeholder: 'XXX' },
            { key: 'doAe', label: 'DO A/E (MT)', placeholder: 'XXX' },
            { key: 'doBoiler', label: 'DO Boiler (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'E) CALORIFIC VALUE',
      fields: [
        {
          key: 'calorific',
          label: 'Fuel Calorific Value',
          parts: [
            { key: 'calFo', label: 'FO (MJ/kg)', placeholder: 'XX.X' },
            { key: 'calDo', label: 'DO (MJ/kg)', placeholder: 'XX.X' },
          ],
        },
      ],
    },
    {
      title: 'F) DRIFTING DETAILS (IF APPLICABLE)',
      fields: [
        {
          key: 'driftingDetails',
          label: 'Drifting Performance',
          parts: [
            { key: 'driftHeading', label: 'Heading (°)', placeholder: 'XXX' },
            { key: 'driftStw', label: 'STW (Knots)', placeholder: 'XX.X' },
            { key: 'driftSog', label: 'SOG (Knots)', placeholder: 'XX.X' },
          ],
        },
      ],
    },
    {
      title: 'G) WEATHER CONDITIONS (DIRECTION/FORCE/HEIGHT)',
      fields: weatherSectionFields(),
    },
    {
      title: 'H) BUNKERS / FRESH WATER',
      fields: [
        {
          key: 'bunkersFwReceived',
          label: 'Bunkers / Fresh Water Received',
          placeholder: 'e.g. VLSFO: Nil | LSMGO: Nil | FW: 50 MT received',
        },
      ],
    },
    {
      title: 'I) EXPECTED BERTHING / DEPARTURE',
      fields: [
        {
          key: 'expectedBerthing',
          label: 'Expected Berthing',
          parts: [
            { key: 'berthUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'berthLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        {
          key: 'expectedDeparture',
          label: 'Expected Departure',
          parts: [
            { key: 'depUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'depLt', label: 'LT', type: 'datetime-local' },
          ],
        },
      ],
    },
    {
      title: 'J) ESTIMATED ROB ON DEPARTURE',
      fields: [
        {
          key: 'estDepRob',
          label: 'Estimated Departure ROB',
          parts: [
            { key: 'depRobFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'depRobDo', label: 'DO (MT)', placeholder: 'XXX' },
            { key: 'depRobFw', label: 'FW (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'K) ADDITIONAL REMARKS',
      fields: [
        {
          key: 'remarks',
          label: 'Additional Remarks',
          type: 'textarea',
          placeholder: 'Enter any remarks...',
        },
      ],
    },
  ],
  formatReportText: (values) => `**5. ANCHORAGE / DRIFTING - DAILY REPORT**

A) REPORT DETAILS:

Report Date & Time (UTC, LT):
${fmtDateTimePair(values, 'report')}

Port Name & Anchorage Name:
${v(values, 'portAndAnchorage', 'XXXXX')}

Anchorage / Drifting Position (Lat deg, min, N/S, Long deg, min, E/W): ${fmtPos(values, 'pos')}

B) ROB:

FO: ${numVal(values, 'robFo', 'XXX')} MT | DO: ${numVal(values, 'robDo', 'XXX')} MT | FW: ${numVal(values, 'robFw', 'XXX')} MT

C) DAILY CONSUMPTION:

FO: ${numVal(values, 'consFo', 'XXX')} MT | DO: ${numVal(values, 'consDo', 'XXX')} MT

D) EQUIPMENT CONSUMPTION:

FO M/E: ${numVal(values, 'foMe', 'XXX')} MT | FO A/E: ${numVal(values, 'foAe', 'XXX')} MT | FO Boiler: ${numVal(values, 'foBoiler', 'XXX')} MT

DO M/E: ${numVal(values, 'doMe', 'XXX')} MT | DO A/E: ${numVal(values, 'doAe', 'XXX')} MT | DO Boiler: ${numVal(values, 'doBoiler', 'XXX')} MT

E) CALORIFIC VALUE:

FO: ${numVal(values, 'calFo', 'XX.X')} MJ/kg | DO: ${numVal(values, 'calDo', 'XX.X')} MJ/kg

F) DRIFTING DETAILS (IF APPLICABLE):

Heading: ${numVal(values, 'driftHeading', 'XXX')}° | STW: ${numVal(values, 'driftStw', 'XX.X')} Knots | SOG: ${numVal(values, 'driftSog', 'XX.X')} Knots

G) WEATHER CONDITIONS (DIRECTION/FORCE/HEIGHT):

${fmtWeatherText(values)}

H) BUNKERS / FRESH WATER:

Bunkers / Fresh Water Received:
${v(values, 'bunkersFwReceived', 'XXXXX')}

I) EXPECTED BERTHING / DEPARTURE:

Expected Berthing (UTC, LT): ${fmtDateTimePair(values, 'berth')}
| Expected Departure (UTC, LT): ${fmtDateTimePair(values, 'dep')}

J) ESTIMATED ROB ON DEPARTURE:

FO: ${numVal(values, 'depRobFo', 'XXX')} MT | DO: ${numVal(values, 'depRobDo', 'XXX')} MT | FW: ${numVal(values, 'depRobFw', 'XXX')} MT

K) ADDITIONAL REMARKS:

Additional Remarks:
${v(values, 'remarks', 'None')}`,
};

// 6. IN PORT DAILY REPORT
export const IN_PORT_DAILY_REPORT: ReportDefinition = {
  id: 'in-port-daily-report',
  number: '6',
  name: 'IN PORT DAILY REPORT',
  getSections: () => [
    {
      title: 'A) REPORT DETAILS',
      fields: [
        {
          key: 'reportTime',
          label: 'Report Date & Time',
          parts: [
            { key: 'reportUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'reportLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        {
          key: 'portOperation',
          label: 'Port Name & Operation',
          parts: [
            { key: 'portName', label: 'Port Name', placeholder: 'Port name' },
            { key: 'operation', label: 'Operation', type: 'select', options: ['Loading', 'Discharging', 'Bunkering', 'Repair / Idle'] },
          ],
        },
      ],
    },
    {
      title: 'B) ROB',
      fields: [
        {
          key: 'rob',
          label: 'Remaining On Board',
          parts: [
            { key: 'robFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'robDo', label: 'DO (MT)', placeholder: 'XXX' },
            { key: 'robFw', label: 'FW (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'C) DAILY CONSUMPTION',
      fields: [
        {
          key: 'dailyCons',
          label: 'Daily Consumption',
          parts: [
            { key: 'consFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'consDo', label: 'DO (MT)', placeholder: 'XXX' },
            { key: 'consFw', label: 'FW (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'D) BUNKERS / FRESH WATER',
      fields: [
        {
          key: 'bunkersReceived',
          label: 'Bunkers / Fresh Water Received',
          placeholder: 'e.g. Received VLSFO: 400 MT / FW: 25 MT',
        },
      ],
    },
    {
      title: 'E) CARGO LAST 24 HOURS',
      fields: [
        { key: 'cargoLast24Total', label: 'Total Cargo Last 24 Hours (MT)', placeholder: 'XXX' },
        {
          key: 'holdsLast24',
          label: 'HoldWise Quantities 1H-7H (MT)',
          parts: [
            { key: 'h1Last24', label: '1H', placeholder: 'XXX' },
            { key: 'h2Last24', label: '2H', placeholder: 'XXX' },
            { key: 'h3Last24', label: '3H', placeholder: 'XXX' },
            { key: 'h4Last24', label: '4H', placeholder: 'XXX' },
            { key: 'h5Last24', label: '5H', placeholder: 'XXX' },
            { key: 'h6Last24', label: '6H', placeholder: 'XXX' },
            { key: 'h7Last24', label: '7H', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'F) TOTAL CARGO TO DATE',
      fields: [
        { key: 'cargoToDateTotal', label: 'Total Cargo To Date (MT)', placeholder: 'XXX' },
        {
          key: 'holdsToDate',
          label: 'HoldWise Totals 1H-7H (MT)',
          parts: [
            { key: 'h1ToDate', label: '1H', placeholder: 'XXX' },
            { key: 'h2ToDate', label: '2H', placeholder: 'XXX' },
            { key: 'h3ToDate', label: '3H', placeholder: 'XXX' },
            { key: 'h4ToDate', label: '4H', placeholder: 'XXX' },
            { key: 'h5ToDate', label: '5H', placeholder: 'XXX' },
            { key: 'h6ToDate', label: '6H', placeholder: 'XXX' },
            { key: 'h7ToDate', label: '7H', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'G) CARGO REMAINING',
      fields: [
        { key: 'cargoRemainingTotal', label: 'Total Cargo Remaining (MT)', placeholder: 'XXX' },
        {
          key: 'holdsRemaining',
          label: 'HoldWise Remaining Quantities 1H-7H (MT)',
          parts: [
            { key: 'h1Remaining', label: '1H', placeholder: 'XXX' },
            { key: 'h2Remaining', label: '2H', placeholder: 'XXX' },
            { key: 'h3Remaining', label: '3H', placeholder: 'XXX' },
            { key: 'h4Remaining', label: '4H', placeholder: 'XXX' },
            { key: 'h5Remaining', label: '5H', placeholder: 'XXX' },
            { key: 'h6Remaining', label: '6H', placeholder: 'XXX' },
            { key: 'h7Remaining', label: '7H', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'H) WEATHER CONDITIONS (DIRECTION/FORCE/HEIGHT)',
      fields: weatherSectionFields(),
    },
    {
      title: 'I) PORT SCHEDULE',
      fields: [
        {
          key: 'etcTime',
          label: 'ETC (Estimated Time of Completion)',
          parts: [
            { key: 'etcUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'etcLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        {
          key: 'etdTime',
          label: 'ETD (Estimated Time of Departure)',
          parts: [
            { key: 'etdUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'etdLt', label: 'LT', type: 'datetime-local' },
          ],
        },
      ],
    },
    {
      title: 'J) ESTIMATED ROB ON DEPARTURE',
      fields: [
        {
          key: 'estDepRob',
          label: 'Estimated Departure ROB',
          parts: [
            { key: 'depFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'depDo', label: 'DO (MT)', placeholder: 'XXX' },
            { key: 'depFw', label: 'FW (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'K) PORT DELAYS / IMPORTANT TIMINGS',
      fields: [
        {
          key: 'delays',
          label: 'Port Delays / Important Timings',
          type: 'textarea',
          placeholder: 'e.g. Rain stoppage 04:00-07:00, Shore crane breakdown 11:30-13:00...',
        },
      ],
    },
    {
      title: 'L) REMARKS',
      fields: [
        {
          key: 'remarks',
          label: 'Remarks / Observations',
          type: 'textarea',
          placeholder: 'Enter remarks or observations...',
        },
      ],
    },
  ],
  formatReportText: (values) => {
    const holds24 = [1, 2, 3, 4, 5, 6, 7].map((i) => numVal(values, `h${i}Last24`, 'XXX')).join(' / ');
    const holdsToDate = [1, 2, 3, 4, 5, 6, 7].map((i) => numVal(values, `h${i}ToDate`, 'XXX')).join(' / ');
    const holdsRem = [1, 2, 3, 4, 5, 6, 7].map((i) => numVal(values, `h${i}Remaining`, 'XXX')).join(' / ');

    return `**6. IN PORT DAILY REPORT**

A) REPORT DETAILS:

Report Date & Time (UTC, LT):
${fmtDateTimePair(values, 'report')}

Port Name: ${v(values, 'portName', 'XXXXX')} | Operation: ${v(values, 'operation', 'Loading / Discharging')}

B) ROB:

FO: ${numVal(values, 'robFo', 'XXX')} MT | DO: ${numVal(values, 'robDo', 'XXX')} MT | FW: ${numVal(values, 'robFw', 'XXX')} MT

C) DAILY CONSUMPTION:

FO: ${numVal(values, 'consFo', 'XXX')} MT | DO: ${numVal(values, 'consDo', 'XXX')} MT | FW: ${numVal(values, 'consFw', 'XXX')} MT

D) BUNKERS / FRESH WATER:

Bunkers / Fresh Water Received:
${v(values, 'bunkersReceived', 'XXXXX')}

E) CARGO LAST 24 HOURS:

Total: ${numVal(values, 'cargoLast24Total', 'XXX')} MT

HoldWise Quantities 1H-7H: ${holds24} MT

F) TOTAL CARGO TO DATE:

Total: ${numVal(values, 'cargoToDateTotal', 'XXX')} MT

HoldWise Totals 1H-7H: ${holdsToDate} MT

G) CARGO REMAINING:

Total: ${numVal(values, 'cargoRemainingTotal', 'XXX')} MT

HoldWise Remaining Quantities 1H-7H: ${holdsRem} MT

H) WEATHER CONDITIONS (DIRECTION/FORCE/HEIGHT):

${fmtWeatherText(values)}

I) PORT SCHEDULE:

ETC (UTC, LT): ${fmtDateTimePair(values, 'etc')} | ETD (UTC, LT): ${fmtDateTimePair(values, 'etd')}

J) ESTIMATED ROB ON DEPARTURE:

FO: ${numVal(values, 'depFo', 'XXX')} MT | DO: ${numVal(values, 'depDo', 'XXX')} MT | FW: ${numVal(values, 'depFw', 'XXX')} MT

K) PORT DELAYS / IMPORTANT TIMINGS:

Port Delays / Important Timings:
${v(values, 'delays', 'XXXXX')}

L) REMARKS:

Remarks / Observations:
${v(values, 'remarks', 'None')}`;
  },
};

// 7. BUNKERING REPORT
export const BUNKERING_REPORT: ReportDefinition = {
  id: 'bunkering-report',
  number: '7',
  name: 'BUNKERING REPORT',
  getSections: () => [
    {
      title: 'A) REPORT DETAILS',
      fields: [
        {
          key: 'reportTime',
          label: 'Report Date & Time',
          parts: [
            { key: 'reportUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'reportLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        { key: 'bunkerPort', label: 'Bunkering Port', placeholder: 'e.g. Fujairah / Gibraltar' },
        {
          key: 'bunkerPosDate',
          label: 'Bunkering Position / Date',
          parts: [
            { key: 'bunkerPos', label: 'Position (Lat deg, min, N/S, Long deg, min, E/W)', parts: positionParts('bunker') },
            { key: 'bunkerUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'bunkerLt', label: 'LT', type: 'datetime-local' },
          ],
        },
      ],
    },
    {
      title: 'B) ROB BEFORE BUNKERING',
      fields: [
        {
          key: 'robBefore',
          label: 'ROB Before Bunkering',
          parts: [
            { key: 'beforeFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'beforeDo', label: 'DO (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'C) ROB AFTER BUNKERING',
      fields: [
        {
          key: 'robAfter',
          label: 'ROB After Bunkering',
          parts: [
            { key: 'afterFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'afterDo', label: 'DO (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'D) BUNKER RECEIVED',
      fields: [
        {
          key: 'bunkerReceived',
          label: 'Bunker Received',
          parts: [
            { key: 'recFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'recDo', label: 'DO (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'E) BUNKER QTY ADJUSTED FOR SURVEY',
      fields: [
        {
          key: 'bunkerSurveyAdjusted',
          label: 'Bunker Qty Adjusted for Survey',
          parts: [
            { key: 'adjFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'adjDo', label: 'DO (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'F) BUNKER BARGE',
      fields: [
        { key: 'bargeName', label: 'Bunker Barge Name', placeholder: 'Barge name' },
      ],
    },
    {
      title: 'G) BARGE TIMINGS',
      fields: [
        {
          key: 'bargeAlongside',
          label: 'Barge Alongside',
          parts: [
            { key: 'alongsideUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'alongsideLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        {
          key: 'bargeAllFast',
          label: 'Barge All-Fast',
          parts: [
            { key: 'allFastUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'allFastLt', label: 'LT', type: 'datetime-local' },
          ],
        },
      ],
    },
    {
      title: 'H) BUNKERING TIMINGS',
      fields: [
        {
          key: 'hoseConnected',
          label: 'Hose Connected',
          parts: [
            { key: 'hoseConnUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'hoseConnLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        {
          key: 'pumpingCommenced',
          label: 'Pumping Commenced',
          parts: [
            { key: 'pumpStartUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'pumpStartLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        {
          key: 'pumpingCompleted',
          label: 'Pumping Completed',
          parts: [
            { key: 'pumpCompUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'pumpCompLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        {
          key: 'hoseDisconnected',
          label: 'Hose Disconnected',
          parts: [
            { key: 'hoseDiscUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'hoseDiscLt', label: 'LT', type: 'datetime-local' },
          ],
        },
      ],
    },
    {
      title: 'I) DOCUMENTATION',
      fields: [
        {
          key: 'docCompleted',
          label: 'Documentation Completed',
          parts: [
            { key: 'docUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'docLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        {
          key: 'bargeCastOff',
          label: 'Barge Cast-Off Date / Time',
          parts: [
            { key: 'bargeCastUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'bargeCastLt', label: 'LT', type: 'datetime-local' },
          ],
        },
      ],
    },
    {
      title: 'J) DEPARTURE',
      fields: [
        {
          key: 'etdPilotTime',
          label: 'ETD / POB Date Time',
          parts: [
            { key: 'etdPobUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'etdPobLt', label: 'LT', type: 'datetime-local' },
          ],
        },
      ],
    },
    {
      title: 'K) LOP',
      fields: [
        {
          key: 'lopIssued',
          label: 'LOP Issued',
          type: 'select',
          options: ['No', 'Yes'],
        },
      ],
    },
    {
      title: 'L) REMARKS',
      fields: [
        {
          key: 'remarks',
          label: 'Disputes, Shortage or Other Observations',
          type: 'textarea',
          placeholder: 'Enter dispute details, sampling notes, or remarks...',
        },
      ],
    },
  ],
  formatReportText: (values) => `**7. BUNKERING REPORT**

A) REPORT DETAILS:

Report Date & Time (UTC, LT):
${fmtDateTimePair(values, 'report')}

Bunkering Port: ${v(values, 'bunkerPort', 'XXXXX')}

Bunkering Position / Date (Lat deg, min, N/S, Long deg, min, E/W, UTC, LT): ${fmtPos(values, 'bunker')}, ${fmtDateTimePair(values, 'bunker')}

B) ROB BEFORE BUNKERING:

FO: ${numVal(values, 'beforeFo', 'XXX')} MT | DO: ${numVal(values, 'beforeDo', 'XXX')} MT

C) ROB AFTER BUNKERING:

FO: ${numVal(values, 'afterFo', 'XXX')} MT | DO: ${numVal(values, 'afterDo', 'XXX')} MT

D) BUNKER RECEIVED:

FO: ${numVal(values, 'recFo', 'XXX')} MT | DO: ${numVal(values, 'recDo', 'XXX')} MT

E) BUNKER QTY ADJUSTED FOR SURVEY:

FO: ${numVal(values, 'adjFo', 'XXX')} MT | DO: ${numVal(values, 'adjDo', 'XXX')} MT

F) BUNKER BARGE:

Bunker Barge Name: ${v(values, 'bargeName', 'XXXXX')}

G) BARGE TIMINGS:

Barge Alongside (UTC, LT): ${fmtDateTimePair(values, 'alongside')} | Barge All-Fast (UTC, LT): ${fmtDateTimePair(values, 'allFast')}

H) BUNKERING TIMINGS:

Hose Connected (UTC, LT): ${fmtDateTimePair(values, 'hoseConn')}

Pumping Commenced (UTC, LT): ${fmtDateTimePair(values, 'pumpStart')} | Completed (UTC, LT): ${fmtDateTimePair(values, 'pumpComp')}

Hose Disconnected (UTC, LT): ${fmtDateTimePair(values, 'hoseDisc')}

I) DOCUMENTATION:

Documentation Completed (UTC, LT): ${fmtDateTimePair(values, 'doc')}

Barge Cast-Off Date / Time (UTC, LT): ${fmtDateTimePair(values, 'bargeCast')}

J) DEPARTURE:

ETD / POB Date Time (UTC, LT): ${fmtDateTimePair(values, 'etdPob')}

K) LOP:

LOP Issued: ${v(values, 'lopIssued', 'No')}

L) REMARKS:

Disputes, Shortage or Other Observations: ${v(values, 'remarks', 'None')}`,
};

// 8. SHIFTING REPORT
export const SHIFTING_REPORT: ReportDefinition = {
  id: 'shifting-report',
  number: '8',
  name: 'SHIFTING REPORT',
  hasSubtypes: true,
  subtypes: SHIFTING_SUBTYPES,
  getSections: (subtype = SHIFTING_SUBTYPES[0]) => {
    const isAnchorageStart = subtype.startsWith('Anchorage');
    const isAnchorageEnd = subtype.endsWith('Anchorage');

    const fromLabel = isAnchorageStart ? 'Name of Anchorage / Position' : 'Name of Berth / Terminal';
    const toLabel = isAnchorageEnd ? 'Name of Anchorage / Position' : 'Name of Berth / Terminal';

    return [
      {
        title: `A) SHIFTING REPORT TYPE: ${subtype.toUpperCase()}`,
        fields: [],
      },
      {
        title: 'B) PORT DETAILS',
        fields: [
          { key: 'portName', label: 'Port Name', placeholder: 'Port name' },
          {
            key: 'reportTime',
            label: 'Report Date and Time (LT/GMT)',
            parts: [
              { key: 'reportGmt', label: 'GMT', type: 'datetime-local' },
              { key: 'reportLt', label: 'LT', type: 'datetime-local' },
            ],
          },
          { key: 'fromLoc', label: `From: ${fromLabel}`, placeholder: 'Departure point / berth / anchorage' },
          { key: 'toLoc', label: `To: ${toLabel}`, placeholder: 'Destination berth / anchorage' },
        ],
      },
      {
        title: 'C) COMMENCE SHIFTING TIMINGS',
        fields: [
          {
            key: 'sbeTime',
            label: 'SBE (Date & Time)',
            type: 'datetime-local',
          },
          ...(isAnchorageStart
            ? [
                {
                  key: 'pobTime',
                  label: 'POB (Date & Time): If Applicable',
                  type: 'datetime-local' as const,
                },
                {
                  key: 'heaveAnchorTime',
                  label: 'Commenced Heaving Up Anchor (Date & Time)',
                  type: 'datetime-local' as const,
                },
                {
                  key: 'anchorAweighTime',
                  label: 'Anchor Aweigh (Date & Time)',
                  type: 'datetime-local' as const,
                },
              ]
            : [
                {
                  key: 'pobTime',
                  label: 'POB (Date & Time): If Applicable',
                  type: 'datetime-local' as const,
                },
                {
                  key: 'unmooringTime',
                  label: 'Commenced Unmooring (Date & Time)',
                  type: 'datetime-local' as const,
                },
                {
                  key: 'allLinesTime',
                  label: 'All Lines Onboard (Date & Time)',
                  type: 'datetime-local' as const,
                },
              ]),
        ],
      },
      {
        title: 'D) COMPLETED SHIFTING TIMINGS',
        fields: [
          ...(isAnchorageEnd
            ? [
                {
                  key: 'letGoAnchorTime',
                  label: 'Let Go Anchor (Date & Time)',
                  type: 'datetime-local' as const,
                },
                {
                  key: 'vesselAnchoredTime',
                  label: 'Vessel Anchored (Date & Time)',
                  type: 'datetime-local' as const,
                },
              ]
            : [
                {
                  key: 'firstLineTime',
                  label: 'First Line Ashore (Date & Time)',
                  type: 'datetime-local' as const,
                },
                {
                  key: 'allFastTime',
                  label: 'All Fast (Date & Time)',
                  type: 'datetime-local' as const,
                },
              ]),
          {
            key: 'pilotOffTime',
            label: 'Pilot Off (Date & Time): If Applicable',
            type: 'datetime-local',
          },
          {
            key: 'fweTime',
            label: 'FWE (Date & Time)',
            type: 'datetime-local',
          },
        ],
      },
      {
        title: 'E) TOTAL DISTANCE / TIME / CONSUMPTION / ROB’S FOR SHIFTING',
        fields: [
          {
            key: 'shiftingTotals',
            label: 'Distance & Duration',
            parts: [
              { key: 'shiftDist', label: 'Distance (NM)', placeholder: 'XXXX' },
              { key: 'shiftTime', label: 'Time Duration (Hours)', type: 'number', placeholder: 'XXX' },
            ],
          },
          {
            key: 'shiftingCons',
            label: 'Total Consumption During Shifting',
            parts: [
              { key: 'shiftFoCons', label: 'FO (MT)', placeholder: 'XXX' },
              { key: 'shiftDoCons', label: 'DO (MT)', placeholder: 'XXX' },
            ],
          },
          {
            key: 'robSbe',
            label: 'ROB at SBE',
            parts: [
              { key: 'sbeFo', label: 'FO (MT)', placeholder: 'XXX' },
              { key: 'sbeDo', label: 'DO (MT)', placeholder: 'XXX' },
            ],
          },
          {
            key: 'robFwe',
            label: 'ROB at FWE',
            parts: [
              { key: 'fweFo', label: 'FO (MT)', placeholder: 'XXX' },
              { key: 'fweDo', label: 'DO (MT)', placeholder: 'XXX' },
            ],
          },
        ],
      },
      {
        title: 'F) WEATHER CONDITIONS (DIRECTION/FORCE/HEIGHT)',
        fields: weatherSectionFields(),
      },
      {
        title: 'G) REASON FOR SHIFTING',
        fields: [
          {
            key: 'reason',
            label: 'Reason for Shifting',
            placeholder: 'e.g. As per charterers orders / change of berth / bunkering',
          },
        ],
      },
      {
        title: 'H) TOTAL CARGO ONBOARD DURING SHIFTING',
        fields: [
          {
            key: 'cargoOnboard',
            label: 'Name & Qty',
            placeholder: 'e.g. Iron Ore 45,000 MT / In Ballast',
          },
        ],
      },
      {
        title: 'I) DRAFT',
        fields: [
          {
            key: 'draft',
            label: 'Shifting Draft',
            parts: [
              { key: 'draftFore', label: 'Fore (m)', placeholder: 'XXX' },
              { key: 'draftAft', label: 'Aft (m)', placeholder: 'XXX' },
            ],
          },
        ],
      },
      {
        title: 'J) ADDITIONAL REMARKS',
        fields: [
          {
            key: 'remarks',
            label: 'Additional Remarks if Any',
            type: 'textarea',
            placeholder: 'Enter additional remarks...',
          },
        ],
      },
    ];
  },
  formatReportText: (values, subtype = SHIFTING_SUBTYPES[0]) => {
    const isAnchorageStart = subtype.startsWith('Anchorage');
    const isAnchorageEnd = subtype.endsWith('Anchorage');

    const fromLabel = isAnchorageStart ? 'Name of Anchorage / Position' : 'Name of Berth / Terminal';
    const toLabel = isAnchorageEnd ? 'Name of Anchorage / Position' : 'Name of Berth / Terminal';

    let commenceTimingsStr = '';
    if (isAnchorageStart) {
      commenceTimingsStr = `SBE (Date & Time): ${dtVal(values, 'sbeTime')}

POB (Date & Time): ${dtVal(values, 'pobTime', 'If Applicable / N/A')}

Commenced Heaving Up Anchor (Date & Time): ${dtVal(values, 'heaveAnchorTime')}

Anchor Aweigh (Date & Time): ${dtVal(values, 'anchorAweighTime')}`;
    } else {
      commenceTimingsStr = `SBE (Date & Time): ${dtVal(values, 'sbeTime')}

POB (Date & Time): ${dtVal(values, 'pobTime', 'If Applicable / N/A')}

Commenced Unmooring (Date & Time): ${dtVal(values, 'unmooringTime')}

All Lines Onboard (Date & Time): ${dtVal(values, 'allLinesTime')}`;
    }

    let completedTimingsStr = '';
    if (isAnchorageEnd) {
      completedTimingsStr = `Let Go Anchor (Date & Time): ${dtVal(values, 'letGoAnchorTime')}

Vessel Anchored (Date & Time): ${dtVal(values, 'vesselAnchoredTime')}

Pilot Off (Date & Time): ${dtVal(values, 'pilotOffTime', 'If Applicable / N/A')}

FWE (Date & Time): ${dtVal(values, 'fweTime')}`;
    } else {
      completedTimingsStr = `First Line Ashore (Date & Time): ${dtVal(values, 'firstLineTime')}

All Fast (Date & Time): ${dtVal(values, 'allFastTime')}

FWE (Date & Time): ${dtVal(values, 'fweTime')}

Pilot Off (Date & Time): ${dtVal(values, 'pilotOffTime', 'If Applicable / N/A')}`;
    }

    return `**8. SHIFTING REPORT**

**A) SHIFTING REPORT TYPE: ${subtype.toUpperCase()}**

B) PORT DETAILS:

Port Name: ${v(values, 'portName', 'XXXXX')}

Report Date and Time (LT/GMT): ${fmtDateTimePair(values, 'report')}

From: ${fromLabel}: ${v(values, 'fromLoc', 'XXXXX')}

To: ${toLabel}: ${v(values, 'toLoc', 'XXXXX')}

C) COMMENCE SHIFTING TIMINGS:

${commenceTimingsStr}

D) COMPLETED SHIFTING TIMINGS:

${completedTimingsStr}

E) TOTAL DISTANCE / TIME / CONSUMPTION / ROB’S FOR SHIFTING:

Distance: ${numVal(values, 'shiftDist', 'XXXX')} NM | Time Duration: ${numVal(values, 'shiftTime', 'XXX')} Hours

Total Consumption During Shifting - FO: ${numVal(values, 'shiftFoCons', 'XXX')} MT | DO: ${numVal(values, 'shiftDoCons', 'XXX')} MT

ROB at SBE - FO: ${numVal(values, 'sbeFo', 'XXX')} MT | DO: ${numVal(values, 'sbeDo', 'XXX')} MT

ROB at FWE - FO: ${numVal(values, 'fweFo', 'XXX')} MT | DO: ${numVal(values, 'fweDo', 'XXX')} MT

F) WEATHER CONDITIONS (DIRECTION/FORCE/HEIGHT):

${fmtWeatherText(values)}

G) REASON FOR SHIFTING:

Reason for Shifting: ${v(values, 'reason', 'XXXXX')}

H) TOTAL CARGO ONBOARD DURING SHIFTING:

Name & Qty: ${v(values, 'cargoOnboard', 'XXXXX')}

I) DRAFT:

Fore: ${numVal(values, 'draftFore', 'XXX')} m | Aft: ${numVal(values, 'draftAft', 'XXX')} m

J) ADDITIONAL REMARKS:

Additional Remarks if Any: ${v(values, 'remarks', 'None')}`;
  },
};

// 9. FUEL CHANGE-OVER REPORT
export const FUEL_CHANGEOVER_REPORT: ReportDefinition = {
  id: 'fuel-changeover-report',
  number: '9',
  name: 'FUEL CHANGE-OVER REPORT',
  getSections: () => [
    {
      title: 'A) REPORT DETAILS',
      fields: [
        {
          key: 'reportTime',
          label: 'Report Date & Time',
          parts: [
            { key: 'reportUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'reportLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        {
          key: 'changeoverType',
          label: 'Fuel Change-Over Grades',
          parts: [
            { key: 'fromFuel', label: 'Change-Over From Fuel', placeholder: 'e.g. VLSFO 0.50%' },
            { key: 'toFuel', label: 'Change-Over To Fuel', placeholder: 'e.g. LSMGO 0.10%' },
          ],
        },
      ],
    },
    {
      title: 'B) CHANGE-OVER COMMENCEMENT',
      fields: [
        {
          key: 'commenceTime',
          label: 'Commence Date & Time',
          parts: [
            { key: 'commenceUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'commenceLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        { key: 'commencePos', label: 'Commence Position (Lat/Long)', placeholder: 'Lat/Long' },
        {
          key: 'commenceNav',
          label: 'Navigation at Commencement',
          parts: [
            { key: 'commenceDist', label: 'Distance From Last Report (NM)', placeholder: 'XXXX' },
            { key: 'commenceCourse', label: 'Course (°)', placeholder: 'XXX' },
            { key: 'commenceStw', label: 'STW (Knots)', placeholder: 'XX.X' },
            { key: 'commenceSog', label: 'SOG (Knots)', placeholder: 'XX.X' },
          ],
        },
        {
          key: 'commenceRob',
          label: 'ROB at Commencement',
          parts: [
            { key: 'commenceFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'commenceDo', label: 'DO (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'C) CHANGE-OVER COMPLETION',
      fields: [
        {
          key: 'completeTime',
          label: 'Complete Date & Time',
          parts: [
            { key: 'completeUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'completeLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        { key: 'completePos', label: 'Complete Position (Lat/Long)', placeholder: 'Lat/Long' },
        {
          key: 'completeNav',
          label: 'Navigation at Completion',
          parts: [
            { key: 'completeDist', label: 'Distance From Commence (NM)', placeholder: 'XXXX' },
            { key: 'completeCourse', label: 'Course (°)', placeholder: 'XXX' },
            { key: 'completeStw', label: 'STW (Knots)', placeholder: 'XX.X' },
            { key: 'completeSog', label: 'SOG (Knots)', placeholder: 'XX.X' },
            { key: 'completeDuration', label: 'Time (Hours)', type: 'number', placeholder: 'XXX' },
          ],
        },
        {
          key: 'completeRob',
          label: 'ROB at Completion',
          parts: [
            { key: 'completeFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'completeDo', label: 'DO (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'D) ECA DETAILS',
      fields: [
        {
          key: 'ecaEvent',
          label: 'ECA Entering / Exiting',
          placeholder: 'e.g. Entering North Sea ECA',
        },
        {
          key: 'ecaTime',
          label: 'ECA Date & Time',
          parts: [
            { key: 'ecaUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'ecaLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        { key: 'ecaPos', label: 'ECA Position (Lat/Long)', placeholder: 'Lat/Long' },
      ],
    },
    {
      title: 'E) CONSUMPTION DURING CHANGE-OVER',
      fields: [
        {
          key: 'changeoverCons',
          label: 'Consumption During Change-Over',
          parts: [
            { key: 'consFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'consDo', label: 'DO (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'F) CALORIFIC VALUE',
      fields: [
        {
          key: 'calorific',
          label: 'Calorific Value',
          parts: [
            { key: 'calFo', label: 'FO (MJ/kg)', placeholder: 'XX.X' },
            { key: 'calDo', label: 'DO (MJ/kg)', placeholder: 'XX.X' },
          ],
        },
      ],
    },
    {
      title: 'G) MAIN ENGINE PERFORMANCE',
      fields: [
        {
          key: 'mePerformance',
          label: 'Main Engine Performance',
          parts: [
            { key: 'mcr', label: 'MCR', placeholder: 'XXX' },
            { key: 'meRpm', label: 'Average M/E RPM', placeholder: 'XXX' },
            { key: 'slip', label: 'Slip (%)', placeholder: 'XX.X' },
          ],
        },
      ],
    },
    {
      title: 'H) ADDITIONAL REMARKS',
      fields: [
        {
          key: 'remarks',
          label: 'Additional Remarks',
          type: 'textarea',
          placeholder: 'Enter additional remarks...',
        },
      ],
    },
  ],
  formatReportText: (values) => `**9. FUEL CHANGE-OVER REPORT**

A) REPORT DETAILS:

Report Date & Time (UTC, LT):
${fmtDateTimePair(values, 'report')}

Change-Over From Fuel: ${v(values, 'fromFuel', 'XXXXX')} | Change-Over To Fuel: ${v(values, 'toFuel', 'XXXXX')}

B) CHANGE-OVER COMMENCEMENT:

Commence Date & Time (UTC, LT): ${fmtDateTimePair(values, 'commence')}

Commence Position (Lat/Long): ${v(values, 'commencePos', 'XXXXX')}

Distance From Last Report: ${numVal(values, 'commenceDist', 'XXXX')} NM | Course: ${numVal(values, 'commenceCourse', 'XXX')}° | STW: ${numVal(values, 'commenceStw', 'XX.X')} Knots | SOG: ${numVal(values, 'commenceSog', 'XX.X')} Knots

ROB - FO: ${numVal(values, 'commenceFo', 'XXX')} MT | DO: ${numVal(values, 'commenceDo', 'XXX')} MT

C) CHANGE-OVER COMPLETION:

Complete Date & Time (UTC, LT): ${fmtDateTimePair(values, 'complete')}

Complete Position (Lat/Long): ${v(values, 'completePos', 'XXXXX')}

Distance From Commence Changeover: ${numVal(values, 'completeDist', 'XXXX')} NM | Course: ${numVal(values, 'completeCourse', 'XXX')}° | STW: ${numVal(values, 'completeStw', 'XX.X')} Knots | SOG: ${numVal(values, 'completeSog', 'XX.X')} Knots | Time: ${numVal(values, 'completeDuration', 'XXX')} Hours

ROB - FO: ${numVal(values, 'completeFo', 'XXX')} MT | DO: ${numVal(values, 'completeDo', 'XXX')} MT

D) ECA DETAILS:

ECA Entering / Exiting: ${v(values, 'ecaEvent', 'XXXXX')}

ECA Date & Time (UTC, LT): ${fmtDateTimePair(values, 'eca')}

ECA Position (Lat/Long): ${v(values, 'ecaPos', 'XXXXX')}

E) CONSUMPTION DURING CHANGE-OVER:

FO: ${numVal(values, 'consFo', 'XXX')} MT | DO: ${numVal(values, 'consDo', 'XXX')} MT

F) CALORIFIC VALUE:

FO: ${numVal(values, 'calFo', 'XX.X')} MJ/kg | DO: ${numVal(values, 'calDo', 'XX.X')} MJ/kg

G) MAIN ENGINE PERFORMANCE:

MCR: ${v(values, 'mcr', 'XXX')} | Average M/E RPM: ${numVal(values, 'meRpm', 'XXX')} | Slip: ${numVal(values, 'slip', 'XX.X')} %

H) ADDITIONAL REMARKS:

Additional Remarks:
${v(values, 'remarks', 'None')}`,
};

// 10. STOP / RESUME REPORT
export const STOP_RESUME_REPORT: ReportDefinition = {
  id: 'stop-resume-report',
  number: '10',
  name: 'STOP / RESUME REPORT',
  getSections: () => [
    {
      title: 'A) STOP / RESUME DETAILS',
      fields: [
        {
          key: 'stopResumeTime',
          label: 'Stop / Resume Date & Time',
          parts: [
            { key: 'stopResumeUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'stopResumeLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        { key: 'reason', label: 'Reason for Stoppage', placeholder: 'e.g. Main Engine repair / waiting orders / medical emergency' },
      ],
    },
    {
      title: 'B) STOP / RESUME POSITION & ROB',
      fields: [
        {
          key: 'stoppedPosRob',
          label: 'Stopped Position, Speed & ROB',
          parts: [
            { key: 'stopPos', label: 'Stopped Position (Lat/Long)', placeholder: 'Lat/Long' },
            { key: 'stopStw', label: 'STW (Knots)', placeholder: '0.0' },
            { key: 'stopSog', label: 'SOG (Knots)', placeholder: 'XX.X' },
            { key: 'stopFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'stopDo', label: 'DO (MT)', placeholder: 'XXX' },
          ],
        },
        {
          key: 'resumePosRob',
          label: 'Resume Position, Speed & ROB',
          parts: [
            { key: 'resumePos', label: 'Resume Position (Lat/Long)', placeholder: 'Lat/Long' },
            { key: 'resumeStw', label: 'STW (Knots)', placeholder: 'XX.X' },
            { key: 'resumeSog', label: 'SOG (Knots)', placeholder: 'XX.X' },
            { key: 'resumeFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'resumeDo', label: 'DO (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'C) STOPPAGE DETAILS',
      fields: [
        {
          key: 'stoppageDetails',
          label: 'Distance, Consumption & Duration',
          parts: [
            { key: 'driftDist', label: 'Distance Covered During Stoppage (NM)', placeholder: 'XXXX' },
            { key: 'consFo', label: 'FO Cons (MT)', placeholder: 'XXX' },
            { key: 'consDo', label: 'DO Cons (MT)', placeholder: 'XXX' },
            { key: 'duration', label: 'Duration of Stoppage (Hours)', type: 'number', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'D) VOYAGE DETAILS',
      fields: [
        {
          key: 'etdNextPort',
          label: 'ETD Next Port',
          parts: [
            { key: 'etdUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'etdLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        {
          key: 'etaNextPort',
          label: 'ETA Next Port',
          parts: [
            { key: 'etaUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'etaLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        { key: 'distToGo', label: 'Distance to Go to Next Port (NM)', placeholder: 'XXXX' },
      ],
    },
    {
      title: 'E) ADDITIONAL REMARKS',
      fields: [
        {
          key: 'remarks',
          label: 'Additional Remarks',
          type: 'textarea',
          placeholder: 'Enter additional details...',
        },
      ],
    },
  ],
  formatReportText: (values) => `**10. STOP / RESUME REPORT**

A) STOP / RESUME DETAILS:

Stop / Resume Date & Time (UTC, LT): ${fmtDateTimePair(values, 'stopResume')}

Reason for Stoppage: ${v(values, 'reason', 'XXXXX')}

B) STOP / RESUME POSITION & ROB:

Stopped Position (Lat/Long): ${v(values, 'stopPos', 'XXXXX')} | STW: ${numVal(values, 'stopStw', '0.0')} Knots | SOG: ${numVal(values, 'stopSog', 'XX.X')} Knots | ROB on Stoppage - FO: ${numVal(values, 'stopFo', 'XXX')} MT | DO: ${numVal(values, 'stopDo', 'XXX')} MT

Resume Position (Lat/Long): ${v(values, 'resumePos', 'XXXXX')} | STW: ${numVal(values, 'resumeStw', 'XX.X')} Knots | SOG: ${numVal(values, 'resumeSog', 'XX.X')} Knots | ROB on Resume - FO: ${numVal(values, 'resumeFo', 'XXX')} MT | DO: ${numVal(values, 'resumeDo', 'XXX')} MT

C) STOPPAGE DETAILS:

Distance Covered During Stoppage: ${numVal(values, 'driftDist', 'XXXX')} NM

Consumption During Stoppage - FO: ${numVal(values, 'consFo', 'XXX')} MT | DO: ${numVal(values, 'consDo', 'XXX')} MT

Duration of Stoppage: ${numVal(values, 'duration', 'XXX')} Hours

D) VOYAGE DETAILS:

ETD Next Port (UTC, LT): ${fmtDateTimePair(values, 'etd')} | ETA Next Port (UTC, LT): ${fmtDateTimePair(values, 'eta')}

Distance to Go to Next Port: ${numVal(values, 'distToGo', 'XXXX')} NM

E) ADDITIONAL REMARKS:

Additional Remarks: ${v(values, 'remarks', 'XXXXX')}`,
};

// 11. NOR REPORT
export const NOR_REPORT: ReportDefinition = {
  id: 'nor-report',
  number: '11',
  name: 'NOR REPORT',
  getSections: () => [
    {
      title: 'A) REPORT DETAILS',
      fields: [
        {
          key: 'reportTime',
          label: 'Report Date & Time',
          parts: [
            { key: 'reportUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'reportLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        { key: 'portBerth', label: 'Port / Berth / Anchorage', placeholder: 'e.g. Newcastle Berth 2' },
      ],
    },
    {
      title: 'B) NOR TENDERED',
      fields: [
        {
          key: 'norPos',
          label: 'Position (Lat deg, min, N/S, Long deg, min, E/W)',
          parts: [
            { key: 'posLatDeg', label: 'Lat deg', type: 'number', placeholder: '00' },
            { key: 'posLatMin', label: 'Lat min', type: 'number', placeholder: '00.0' },
            { key: 'posLatDir', label: 'N / S', type: 'select', options: ['N', 'S'] },
            { key: 'posLongDeg', label: 'Long deg', type: 'number', placeholder: '000' },
            { key: 'posLongMin', label: 'Long min', type: 'number', placeholder: '00.0' },
            { key: 'posLongDir', label: 'E / W', type: 'select', options: ['E', 'W'] },
          ],
        },
        {
          key: 'norTenderedTime',
          label: 'NOR Tendered Date & Time',
          parts: [
            { key: 'norUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'norLt', label: 'LT', type: 'datetime-local' },
          ],
        },
      ],
    },
    {
      title: 'C) NOR ACCEPTANCE',
      fields: [
        {
          key: 'norAcceptedTime',
          label: 'NOR Accepted Date & Time',
          parts: [
            { key: 'acceptUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'acceptLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        { key: 'acceptedBy', label: 'NOR Accepted By', placeholder: 'e.g. Port Agent / Terminal Master' },
      ],
    },
    {
      title: 'D) READINESS',
      fields: [
        {
          key: 'readiness',
          label: 'Vessel & Cargo Readiness',
          parts: [
            { key: 'vesselReady', label: 'Vessel Readiness', placeholder: 'e.g. Ready in all respects' },
            { key: 'cargoReady', label: 'Cargo Readiness', placeholder: 'e.g. Holds passed inspection' },
          ],
        },
      ],
    },
    {
      title: 'E) ADDITIONAL REMARKS',
      fields: [
        {
          key: 'exceptions',
          label: 'Exceptions or Remarks',
          type: 'textarea',
          placeholder: 'Enter any exceptions taken or remarks...',
        },
      ],
    },
  ],
  formatReportText: (values) => `**11. NOR REPORT**

A) REPORT DETAILS:

Report Date & Time (UTC, LT):
${fmtDateTimePair(values, 'report')}

Port / Berth / Anchorage: ${v(values, 'portBerth', 'XXXXX')}

B) NOR TENDERED:

Position (Lat deg, min, N/S, Long deg, min, E/W): ${fmtPos(values, 'pos')}

NOR Tendered Date & Time (UTC, LT): ${fmtDateTimePair(values, 'nor')}

C) NOR ACCEPTANCE:

NOR Accepted Date & Time (UTC, LT): ${fmtDateTimePair(values, 'accept')}

NOR Accepted By: ${v(values, 'acceptedBy', 'XXXXX')}

D) READINESS:

Vessel Readiness: ${v(values, 'vesselReady', 'XXXXX')} | Cargo Readiness: ${v(values, 'cargoReady', 'XXXXX')}

E) ADDITIONAL REMARKS:

Exceptions or Remarks: ${v(values, 'exceptions', 'XXXXX')}`,
};

// 12. CARGO OPERATION REPORT
export const CARGO_OPERATION_REPORT: ReportDefinition = {
  id: 'cargo-operation-report',
  number: '12',
  name: 'CARGO OPERATION REPORT',
  getSections: () => [
    {
      title: 'A) REPORT DETAILS',
      fields: [
        {
          key: 'reportTime',
          label: 'Report Date & Time',
          parts: [
            { key: 'reportUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'reportLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        { key: 'portBerth', label: 'Port / Berth / Terminal', placeholder: 'Port / Berth' },
        {
          key: 'cargoOp',
          label: 'Cargo Operation',
          type: 'select',
          options: ['Loading', 'Discharging', 'Other'],
        },
      ],
    },
    {
      title: 'B) OPERATION TIMINGS',
      fields: [
        {
          key: 'opTimings',
          label: 'Operation Start & Stop',
          parts: [
            { key: 'opStart', label: 'Operation Start', placeholder: 'Date / Time' },
            { key: 'opStop', label: 'Operation Stop', placeholder: 'Date / Time' },
          ],
        },
        { key: 'importantTimings', label: 'Important Timings', placeholder: 'e.g. Gang 1 started 08:00, shifted crane 14:00' },
      ],
    },
    {
      title: 'C) CARGO DETAILS',
      fields: [
        { key: 'cargoName', label: 'Cargo Name', placeholder: 'Cargo name' },
        { key: 'qtyPeriod', label: 'Quantity Loaded / Discharged During Period (MT)', placeholder: 'XXX' },
        { key: 'qtyTotal', label: 'Total Quantity Loaded / Discharged to Date (MT)', placeholder: 'XXX' },
        { key: 'qtyRemaining', label: 'Quantity Remaining / To Be Loaded (MT)', placeholder: 'XXX' },
      ],
    },
    {
      title: 'D) CARGO DISTRIBUTION',
      fields: [
        { key: 'holdsDistribution', label: 'Holds / Tanks and Cargo Distribution', placeholder: 'e.g. 1H: 8,000 MT, 2H: 12,000 MT, 3H: 10,000 MT' },
      ],
    },
    {
      title: 'E) DRAFT',
      fields: [
        {
          key: 'draft',
          label: 'Draft',
          parts: [
            { key: 'draftFore', label: 'Fore (m)', placeholder: 'XXX' },
            { key: 'draftAft', label: 'Aft (m)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'F) STOPPAGES / DELAYS',
      fields: [
        { key: 'delays', label: 'Stoppages, Delays and Reasons', type: 'textarea', placeholder: 'e.g. Rain stoppage, shore equipment breakdown...' },
      ],
    },
    {
      title: 'G) REMARKS',
      fields: [
        { key: 'remarks', label: 'Remarks / Observations', type: 'textarea', placeholder: 'Enter remarks...' },
      ],
    },
  ],
  formatReportText: (values) => `**12. CARGO OPERATION REPORT**

A) REPORT DETAILS:

Report Date & Time (UTC, LT):
${fmtDateTimePair(values, 'report')}

Port / Berth / Terminal: ${v(values, 'portBerth', 'XXXXX')}

Cargo Operation: ${v(values, 'cargoOp', 'Loading / Discharging / Other')}

B) OPERATION TIMINGS:

Operation Start: ${v(values, 'opStart', 'XXXXX')} | Operation Stop: ${v(values, 'opStop', 'XXXXX')}

Important Timings: ${v(values, 'importantTimings', 'XXXXX')}

C) CARGO DETAILS:

Cargo Name: ${v(values, 'cargoName', 'XXXXX')}

Quantity Loaded / Discharged During Period: ${numVal(values, 'qtyPeriod', 'XXX')} MT

Total Quantity Loaded / Discharged to Date: ${numVal(values, 'qtyTotal', 'XXX')} MT

Quantity Remaining / To Be Loaded: ${numVal(values, 'qtyRemaining', 'XXX')} MT

D) CARGO DISTRIBUTION:

Holds / Tanks and Cargo Distribution: ${v(values, 'holdsDistribution', 'XXXXX')}

E) DRAFT:

Fore: ${numVal(values, 'draftFore', 'XXX')} m | Aft: ${numVal(values, 'draftAft', 'XXX')} m

F) STOPPAGES / DELAYS:

Stoppages, Delays and Reasons:
${v(values, 'delays', 'XXXXX')}

G) REMARKS:

Remarks / Observations: ${v(values, 'remarks', 'XXXXX')}`,
};

// 13. COMPLETION OF CARGO REPORT
export const COMPLETION_OF_CARGO_REPORT: ReportDefinition = {
  id: 'completion-of-cargo-report',
  number: '13',
  name: 'COMPLETION OF CARGO REPORT',
  getSections: () => CARGO_OPERATION_REPORT.getSections(),
  formatReportText: (values) => `**13. COMPLETION OF CARGO REPORT**

A) REPORT DETAILS:

Report Date & Time (UTC, LT):
${fmtDateTimePair(values, 'report')}

Port / Berth / Terminal: ${v(values, 'portBerth', 'XXXXX')}

Cargo Operation: ${v(values, 'cargoOp', 'Loading / Discharging / Other')}

B) OPERATION TIMINGS:

Operation Start: ${v(values, 'opStart', 'XXXXX')} | Operation Stop: ${v(values, 'opStop', 'XXXXX')}

Important Timings: ${v(values, 'importantTimings', 'XXXXX')}

C) CARGO DETAILS:

Cargo Name: ${v(values, 'cargoName', 'XXXXX')}

Quantity Loaded / Discharged During Period: ${numVal(values, 'qtyPeriod', 'XXX')} MT

Total Quantity Loaded / Discharged to Date: ${numVal(values, 'qtyTotal', 'XXX')} MT

Quantity Remaining / To Be Loaded: ${numVal(values, 'qtyRemaining', 'XXX')} MT

D) CARGO DISTRIBUTION:

Holds / Tanks and Cargo Distribution: ${v(values, 'holdsDistribution', 'XXXXX')}

E) DRAFT:

Fore: ${numVal(values, 'draftFore', 'XXX')} m | Aft: ${numVal(values, 'draftAft', 'XXX')} m

F) STOPPAGES / DELAYS:

Stoppages, Delays and Reasons:
${v(values, 'delays', 'XXXXX')}

G) REMARKS:

Remarks / Observations: ${v(values, 'remarks', 'XXXXX')}`,
};

// 14. ANCHOR REPORT
export const ANCHOR_REPORT: ReportDefinition = {
  id: 'anchor-report',
  number: '14',
  name: 'ANCHOR REPORT',
  getSections: () => [
    {
      title: 'A) REPORT DETAILS',
      fields: [
        {
          key: 'reportTime',
          label: 'Report Date & Time',
          parts: [
            { key: 'reportUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'reportLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        { key: 'portAnchorage', label: 'Port / Anchorage Name', placeholder: 'Port / Anchorage Name' },
      ],
    },
    {
      title: 'B) ANCHOR MOVEMENT',
      fields: [
        {
          key: 'anchorAction',
          label: 'Anchor Drop / Aweigh',
          type: 'select',
          options: ['Anchor Dropped', 'Anchor Aweigh'],
        },
        { key: 'anchorPos', label: 'Position (Lat deg, min, N/S, Long deg, min, E/W)', parts: positionParts('anchor') },
        {
          key: 'anchorTime',
          label: 'Date & Time',
          parts: [
            { key: 'anchorUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'anchorLt', label: 'LT', type: 'datetime-local' },
          ],
        },
      ],
    },
    {
      title: 'C) ANCHORING DETAILS',
      fields: [
        { key: 'waterDepth', label: 'Water Depth (m)', placeholder: 'XXX' },
        { key: 'anchorReason', label: 'Reason for Anchoring / Weighing Anchor', placeholder: 'e.g. Awaiting berth / Bunkering / Voyage resumption' },
      ],
    },
    {
      title: 'D) ROB',
      fields: [
        {
          key: 'rob',
          label: 'Remaining On Board',
          parts: [
            { key: 'robFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'robDo', label: 'DO (MT)', placeholder: 'XXX' },
            { key: 'robFw', label: 'FW (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'E) WEATHER CONDITIONS (DIRECTION/FORCE/HEIGHT)',
      fields: weatherSectionFields(),
    },
    {
      title: 'F) ADDITIONAL REMARKS',
      fields: [
        { key: 'remarks', label: 'Additional Remarks', type: 'textarea', placeholder: 'Enter remarks...' },
      ],
    },
  ],
  formatReportText: (values) => `**14. ANCHOR REPORT**

A) REPORT DETAILS:

Report Date & Time (UTC, LT):
${fmtDateTimePair(values, 'report')}

Port / Anchorage Name: ${v(values, 'portAnchorage', 'XXXXX')}

B) ANCHOR MOVEMENT:

Anchor Drop / Aweigh: ${v(values, 'anchorAction', 'XXXXX')}

Position (Lat deg, min, N/S, Long deg, min, E/W): ${fmtPos(values, 'anchor')}

Date & Time (UTC, LT): ${fmtDateTimePair(values, 'anchor')}

C) ANCHORING DETAILS:

Water Depth: ${numVal(values, 'waterDepth', 'XXX')} m

Reason for Anchoring / Weighing Anchor: ${v(values, 'anchorReason', 'XXXXX')}

D) ROB:

FO: ${numVal(values, 'robFo', 'XXX')} MT | DO: ${numVal(values, 'robDo', 'XXX')} MT | FW: ${numVal(values, 'robFw', 'XXX')} MT

E) WEATHER CONDITIONS (DIRECTION/FORCE/HEIGHT):

${fmtWeatherText(values)}

F) ADDITIONAL REMARKS:

Additional Remarks:
${v(values, 'remarks', 'None')}`,
};

// 15. DRIFTING REPORT
export const DRIFTING_REPORT: ReportDefinition = {
  id: 'drifting-report',
  number: '15',
  name: 'DRIFTING REPORT',
  getSections: () => [
    {
      title: 'A) REPORT DETAILS',
      fields: [
        {
          key: 'reportTime',
          label: 'Report Date & Time',
          parts: [
            { key: 'reportUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'reportLt', label: 'LT', type: 'datetime-local' },
          ],
        },
      ],
    },
    {
      title: 'B) DRIFTING DETAILS',
      fields: [
        {
          key: 'driftingStart',
          label: 'Drifting Start',
          parts: [
            { key: 'startPos', label: 'Start Position (Lat/Long)', placeholder: 'Lat/Long' },
            { key: 'startUtc', label: 'Start UTC', type: 'datetime-local' },
            { key: 'startLt', label: 'Start LT', type: 'datetime-local' },
          ],
        },
        {
          key: 'driftingStop',
          label: 'Drifting Stop',
          parts: [
            { key: 'stopPos', label: 'Stop Position (Lat/Long)', placeholder: 'Lat/Long' },
            { key: 'stopUtc', label: 'Stop UTC', type: 'datetime-local' },
            { key: 'stopLt', label: 'Stop LT', type: 'datetime-local' },
          ],
        },
      ],
    },
    {
      title: 'C) DRIFTING PERFORMANCE',
      fields: [
        {
          key: 'performance',
          label: 'Performance Details',
          parts: [
            { key: 'heading', label: 'Heading (°)', placeholder: 'XXX' },
            { key: 'stw', label: 'STW (Knots)', placeholder: 'XX.X' },
            { key: 'sog', label: 'SOG (Knots)', placeholder: 'XX.X' },
          ],
        },
      ],
    },
    {
      title: 'D) REASON FOR DRIFTING',
      fields: [
        { key: 'reason', label: 'Reason for Drifting', placeholder: 'e.g. Awaiting orders / engine maintenance / rough weather' },
      ],
    },
    {
      title: 'E) ROB',
      fields: [
        {
          key: 'rob',
          label: 'Remaining On Board',
          parts: [
            { key: 'robFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'robDo', label: 'DO (MT)', placeholder: 'XXX' },
            { key: 'robFw', label: 'FW (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'F) WEATHER CONDITIONS (DIRECTION/FORCE/HEIGHT)',
      fields: weatherSectionFields(),
    },
    {
      title: 'G) ADDITIONAL REMARKS',
      fields: [
        { key: 'remarks', label: 'Additional Remarks', type: 'textarea', placeholder: 'Enter remarks...' },
      ],
    },
  ],
  formatReportText: (values) => `**15. DRIFTING REPORT**

A) REPORT DETAILS:

Report Date & Time (UTC, LT):
${fmtDateTimePair(values, 'report')}

B) DRIFTING DETAILS:

Drifting Start Position (Lat/Long): ${v(values, 'startPos', 'XXXXX')} | Date & Time (UTC, LT): ${fmtDateTimePair(values, 'start')}

Drifting Stop Position (Lat/Long): ${v(values, 'stopPos', 'XXXXX')} | Date & Time (UTC, LT): ${fmtDateTimePair(values, 'stop')}

C) DRIFTING PERFORMANCE:

Heading: ${numVal(values, 'heading', 'XXX')}° | STW: ${numVal(values, 'stw', 'XX.X')} Knots | SOG: ${numVal(values, 'sog', 'XX.X')} Knots

D) REASON FOR DRIFTING:

Reason for Drifting: ${v(values, 'reason', 'XXXXX')}

E) ROB:

FO: ${numVal(values, 'robFo', 'XXX')} MT | DO: ${numVal(values, 'robDo', 'XXX')} MT | FW: ${numVal(values, 'robFw', 'XXX')} MT

F) WEATHER CONDITIONS (DIRECTION/FORCE/HEIGHT):

${fmtWeatherText(values)}

G) ADDITIONAL REMARKS:

Additional Remarks:
${v(values, 'remarks', 'None')}`,
};

// 16. INCIDENT / ACCIDENT REPORT
export const INCIDENT_ACCIDENT_REPORT: ReportDefinition = {
  id: 'incident-accident-report',
  number: '16',
  name: 'INCIDENT / ACCIDENT REPORT',
  getSections: () => [
    {
      title: 'A) REPORT DETAILS',
      fields: [
        {
          key: 'reportTime',
          label: 'Report Date & Time',
          parts: [
            { key: 'reportUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'reportLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        {
          key: 'incidentPosition',
          label: 'Incident Position',
          parts: [
            { key: 'posLatDeg', label: 'Lat deg', type: 'number', placeholder: '00' },
            { key: 'posLatMin', label: 'Lat min', type: 'number', placeholder: '00.0' },
            { key: 'posLatDir', label: 'N / S', type: 'select', options: ['N', 'S'] },
            { key: 'posLongDeg', label: 'Long deg', type: 'number', placeholder: '000' },
            { key: 'posLongMin', label: 'Long min', type: 'number', placeholder: '00.0' },
            { key: 'posLongDir', label: 'E / W', type: 'select', options: ['E', 'W'] },
          ],
        },
        {
          key: 'incidentTime',
          label: 'Incident Date & Time',
          parts: [
            { key: 'incUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'incLt', label: 'LT', type: 'datetime-local' },
          ],
        },
      ],
    },
    {
      title: 'B) INCIDENT DETAILS',
      fields: [
        { key: 'incidentType', label: 'Incident / Accident Type', placeholder: 'e.g. Collision / Grounding / Equipment Failure / Personal Injury' },
        { key: 'involved', label: 'Persons, Vessel, Equipment or Cargo Involved', placeholder: 'Names / details of equipment / cargo' },
      ],
    },
    {
      title: 'C) DESCRIPTION',
      fields: [
        { key: 'description', label: 'Description of Facts and Sequence of Events', type: 'textarea', placeholder: 'Chronological summary of events...' },
      ],
    },
    {
      title: 'D) IMPACT / DAMAGE',
      fields: [
        { key: 'damage', label: 'Damage, Injury, Pollution or Operational Impact', type: 'textarea', placeholder: 'Describe extent of damage, pollution or injuries...' },
      ],
    },
    {
      title: 'E) IMMEDIATE ACTIONS',
      fields: [
        { key: 'actions', label: 'Immediate Actions Taken', type: 'textarea', placeholder: 'Action taken to safeguard vessel, crew, environment...' },
      ],
    },
    {
      title: 'F) SUPPORTING DOCUMENTS',
      fields: [
        { key: 'documents', label: 'Supporting Photographs / Documents', placeholder: 'e.g. Photos taken, VDR saved, logbook entries copies' },
      ],
    },
    {
      title: 'G) ADDITIONAL REMARKS',
      fields: [
        { key: 'remarks', label: 'Additional Remarks', type: 'textarea', placeholder: 'Enter remarks...' },
      ],
    },
  ],
  formatReportText: (values) => `**16. INCIDENT / ACCIDENT REPORT**

A) REPORT DETAILS:

Report Date & Time (UTC, LT):
${fmtDateTimePair(values, 'report')}

Incident Position (Lat deg, min, N/S, Long deg, min, E/W): ${fmtPos(values, 'pos')}

Incident Date & Time (UTC, LT): ${fmtDateTimePair(values, 'inc')}

B) INCIDENT DETAILS:

Incident / Accident Type: ${v(values, 'incidentType', 'XXXXX')}

Persons, Vessel, Equipment or Cargo Involved: ${v(values, 'involved', 'XXXXX')}

C) DESCRIPTION:

Description of Facts and Sequence of Events: ${v(values, 'description', 'XXXXX')}

D) IMPACT / DAMAGE:

Damage, Injury, Pollution or Operational Impact: ${v(values, 'damage', 'XXXXX')}

E) IMMEDIATE ACTIONS:

Immediate Actions Taken: ${v(values, 'actions', 'XXXXX')}

F) SUPPORTING DOCUMENTS:

Supporting Photographs / Documents: ${v(values, 'documents', 'XXXXX')}

G) ADDITIONAL REMARKS:

Additional Remarks: ${v(values, 'remarks', 'XXXXX')}`,
};

// 17. BUNKER SURVEY REPORT
export const BUNKER_SURVEY_REPORT: ReportDefinition = {
  id: 'bunker-survey-report',
  number: '17',
  name: 'BUNKER SURVEY REPORT',
  getSections: () => [
    {
      title: 'A) REPORT DETAILS',
      fields: [
        {
          key: 'reportTime',
          label: 'Report Date & Time',
          parts: [
            { key: 'reportUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'reportLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        { key: 'surveyPort', label: 'Survey Port / Location', placeholder: 'Port / Location' },
        {
          key: 'surveyPos',
          label: 'Survey Position (Lat deg, min, N/S, Long deg, min, E/W)',
          parts: [
            { key: 'posLatDeg', label: 'Lat deg', type: 'number', placeholder: '00' },
            { key: 'posLatMin', label: 'Lat min', type: 'number', placeholder: '00.0' },
            { key: 'posLatDir', label: 'N / S', type: 'select', options: ['N', 'S'] },
            { key: 'posLongDeg', label: 'Long deg', type: 'number', placeholder: '000' },
            { key: 'posLongMin', label: 'Long min', type: 'number', placeholder: '00.0' },
            { key: 'posLongDir', label: 'E / W', type: 'select', options: ['E', 'W'] },
          ],
        },
      ],
    },
    {
      title: 'B) SURVEY DETAILS',
      fields: [
        { key: 'surveyorName', label: 'Surveyor Name / Company', placeholder: 'Surveyor / Inspection Co.' },
        {
          key: 'surveyTime',
          label: 'Survey Date & Time',
          parts: [
            { key: 'survUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'survLt', label: 'LT', type: 'datetime-local' },
          ],
        },
      ],
    },
    {
      title: 'C) TANK / FUEL DETAILS',
      fields: [
        { key: 'soundings', label: 'Tank Soundings and Calculated Quantities', type: 'textarea', placeholder: 'e.g. 1P: 120 MT, 1S: 125 MT, 2P: 230 MT...' },
        { key: 'fuelGrades', label: 'Fuel Grades, Density and Temperature', placeholder: 'e.g. VLSFO 0.50% (Density 0.9450, Temp 35°C)' },
      ],
    },
    {
      title: 'D) ROB BEFORE SURVEY',
      fields: [
        {
          key: 'robBefore',
          label: 'ROB Before Survey',
          parts: [
            { key: 'beforeFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'beforeDo', label: 'DO (MT)', placeholder: 'XXX' },
            { key: 'beforeFw', label: 'FW (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'E) ROB AFTER SURVEY',
      fields: [
        {
          key: 'robAfter',
          label: 'ROB After Survey',
          parts: [
            { key: 'afterFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'afterDo', label: 'DO (MT)', placeholder: 'XXX' },
            { key: 'afterFw', label: 'FW (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'F) SUPPORTING DOCUMENTS',
      fields: [
        { key: 'documents', label: 'Survey Report / Supporting Documents', placeholder: 'e.g. BDN, Certificate of Quality, Sounding sheet attached' },
      ],
    },
    {
      title: 'G) DISCREPANCIES / REMARKS',
      fields: [
        { key: 'remarks', label: 'Discrepancies or Remarks', type: 'textarea', placeholder: 'Enter discrepancies between vessel figure and surveyor figure...' },
      ],
    },
  ],
  formatReportText: (values) => `**17. BUNKER SURVEY REPORT**

A) REPORT DETAILS:

Report Date & Time (UTC, LT):
${fmtDateTimePair(values, 'report')}

Survey Port / Location: ${v(values, 'surveyPort', 'XXXXX')}

Survey Position (Lat deg, min, N/S, Long deg, min, E/W): ${fmtPos(values, 'pos')}

B) SURVEY DETAILS:

Surveyor Name / Company: ${v(values, 'surveyorName', 'XXXXX')}

Survey Date & Time (UTC, LT): ${fmtDateTimePair(values, 'surv')}

C) TANK / FUEL DETAILS:

Tank Soundings and Calculated Quantities: ${v(values, 'soundings', 'XXXXX')}

Fuel Grades, Density and Temperature: ${v(values, 'fuelGrades', 'XXXXX')}

D) ROB BEFORE SURVEY:

FO: ${numVal(values, 'beforeFo', 'XXX')} MT | DO: ${numVal(values, 'beforeDo', 'XXX')} MT | FW: ${numVal(values, 'beforeFw', 'XXX')} MT

E) ROB AFTER SURVEY:

FO: ${numVal(values, 'afterFo', 'XXX')} MT | DO: ${numVal(values, 'afterDo', 'XXX')} MT | FW: ${numVal(values, 'afterFw', 'XXX')} MT

F) SUPPORTING DOCUMENTS:

Survey Report / Supporting Documents: ${v(values, 'documents', 'XXXXX')}

G) DISCREPANCIES / REMARKS:

Discrepancies or Remarks: ${v(values, 'remarks', 'XXXXX')}`,
};

// 18. SPEED CHANGE-OVER REPORT
export const SPEED_CHANGEOVER_REPORT: ReportDefinition = {
  id: 'speed-changeover-report',
  number: '18',
  name: 'SPEED CHANGE-OVER REPORT',
  getSections: () => [
    {
      title: 'A) REPORT DETAILS',
      fields: [
        {
          key: 'reportTime',
          label: 'Report Date & Time',
          parts: [
            { key: 'reportUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'reportLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        {
          key: 'speedPos',
          label: 'Speed Change Position (Lat deg, min, N/S, Long deg, min, E/W)',
          parts: [
            { key: 'posLatDeg', label: 'Lat deg', type: 'number', placeholder: '00' },
            { key: 'posLatMin', label: 'Lat min', type: 'number', placeholder: '00.0' },
            { key: 'posLatDir', label: 'N / S', type: 'select', options: ['N', 'S'] },
            { key: 'posLongDeg', label: 'Long deg', type: 'number', placeholder: '000' },
            { key: 'posLongMin', label: 'Long min', type: 'number', placeholder: '00.0' },
            { key: 'posLongDir', label: 'E / W', type: 'select', options: ['E', 'W'] },
          ],
        },
        {
          key: 'speedTime',
          label: 'Speed Change Date & Time',
          parts: [
            { key: 'spdChgUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'spdChgLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        {
          key: 'navFromLast',
          label: 'Steaming From Last Report',
          parts: [
            { key: 'distLast', label: 'Distance Sailed (NM)', placeholder: 'XXXX' },
            { key: 'course', label: 'Course (°)', placeholder: 'XXX' },
            { key: 'stw', label: 'STW (Knots)', placeholder: 'XX.X' },
            { key: 'sog', label: 'SOG (Knots)', placeholder: 'XX.X' },
          ],
        },
      ],
    },
    {
      title: 'B) SPEED CHANGE',
      fields: [
        {
          key: 'stwChange',
          label: 'STW Speed Change',
          parts: [
            { key: 'fromStw', label: 'From STW (Knots)', placeholder: 'XX.X' },
            { key: 'toStw', label: 'To STW (Knots)', placeholder: 'XX.X' },
          ],
        },
        {
          key: 'sogChange',
          label: 'SOG Speed Change',
          parts: [
            { key: 'fromSog', label: 'From SOG (Knots)', placeholder: 'XX.X' },
            { key: 'toSog', label: 'To SOG (Knots)', placeholder: 'XX.X' },
          ],
        },
      ],
    },
    {
      title: 'C) ENGINE PERFORMANCE',
      fields: [
        {
          key: 'engineBefore',
          label: 'Engine Settings Before',
          parts: [
            { key: 'engSetBefore', label: 'Settings', placeholder: 'e.g. Eco Speed' },
            { key: 'rpmBefore', label: 'RPM', placeholder: 'XXX' },
            { key: 'loadBefore', label: 'Load (%)', placeholder: 'XX.X' },
          ],
        },
        {
          key: 'engineAfter',
          label: 'Engine Settings After',
          parts: [
            { key: 'engSetAfter', label: 'Settings', placeholder: 'e.g. Full Speed' },
            { key: 'rpmAfter', label: 'RPM', placeholder: 'XXX' },
            { key: 'loadAfter', label: 'Load (%)', placeholder: 'XX.X' },
          ],
        },
      ],
    },
    {
      title: 'D) REASON',
      fields: [
        { key: 'reason', label: 'Reason for Speed Change', placeholder: 'e.g. Charterers instructions / weather routing / arrive at daylight' },
      ],
    },
    {
      title: 'E) WEATHER CONDITIONS (DIRECTION/FORCE/HEIGHT)',
      fields: weatherSectionFields(),
    },
    {
      title: 'F) VOYAGE DETAILS',
      fields: [
        { key: 'distToGo', label: 'Distance to Next Port (NM)', placeholder: 'XXXX' },
        {
          key: 'etaNextPort',
          label: 'ETA Next Port',
          parts: [
            { key: 'etaUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'etaLt', label: 'LT', type: 'datetime-local' },
          ],
        },
      ],
    },
    {
      title: 'G) ADDITIONAL REMARKS',
      fields: [
        { key: 'remarks', label: 'Additional Remarks', type: 'textarea', placeholder: 'Enter remarks...' },
      ],
    },
  ],
  formatReportText: (values) => `**18. SPEED CHANGE-OVER REPORT**

A) REPORT DETAILS:

Report Date & Time (UTC, LT):
${fmtDateTimePair(values, 'report')}

Speed Change Position (Lat deg, min, N/S, Long deg, min, E/W): ${fmtPos(values, 'pos')}

Speed Change Date & Time (UTC, LT): ${fmtDateTimePair(values, 'spdChg')}

Distance Sailed From Last Report: ${numVal(values, 'distLast', 'XXXX')} NM | Course: ${numVal(values, 'course', 'XXX')}° | STW: ${numVal(values, 'stw', 'XX.X')} Knots | SOG: ${numVal(values, 'sog', 'XX.X')} Knots

B) SPEED CHANGE:

From STW: ${numVal(values, 'fromStw', 'XX.X')} Knots | To STW: ${numVal(values, 'toStw', 'XX.X')} Knots

From SOG: ${numVal(values, 'fromSog', 'XX.X')} Knots | To SOG: ${numVal(values, 'toSog', 'XX.X')} Knots

C) ENGINE PERFORMANCE:

Engine Settings Before: ${v(values, 'engSetBefore', 'XXXXX')} | RPM: ${numVal(values, 'rpmBefore', 'XXX')} | Load: ${numVal(values, 'loadBefore', 'XX.X')} %

Engine Settings After: ${v(values, 'engSetAfter', 'XXXXX')} | RPM: ${numVal(values, 'rpmAfter', 'XXX')} | Load: ${numVal(values, 'loadAfter', 'XX.X')} %

D) REASON:

Reason for Speed Change: ${v(values, 'reason', 'XXXXX')}

E) WEATHER CONDITIONS (DIRECTION/FORCE/HEIGHT):

${fmtWeatherText(values)}

F) VOYAGE DETAILS:

Distance to Next Port: ${numVal(values, 'distToGo', 'XXXX')} NM | ETA Next Port (UTC, LT): ${fmtDateTimePair(values, 'eta')}

G) ADDITIONAL REMARKS:

Additional Remarks: ${v(values, 'remarks', 'XXXXX')}`,
};

// 19. DRYDOCK DAILY REPORT
export const DRYDOCK_DAILY_REPORT: ReportDefinition = {
  id: 'drydock-daily-report',
  number: '19',
  name: 'DRYDOCK DAILY REPORT',
  getSections: () => [
    {
      title: 'A) REPORT DETAILS',
      fields: [
        {
          key: 'reportTime',
          label: 'Report Date & Time',
          parts: [
            { key: 'reportUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'reportLt', label: 'LT', type: 'datetime-local' },
          ],
        },
        {
          key: 'shipyardBerth',
          label: 'Shipyard & Berth Details',
          parts: [
            { key: 'shipyard', label: 'Shipyard Name', placeholder: 'Shipyard name' },
            { key: 'dockNum', label: 'Berth / Dock Number', placeholder: 'Dock / Berth No.' },
          ],
        },
        {
          key: 'drydockPos',
          label: 'Drydock Position (Lat deg, min, N/S, Long deg, min, E/W)',
          parts: [
            { key: 'posLatDeg', label: 'Lat deg', type: 'number', placeholder: '00' },
            { key: 'posLatMin', label: 'Lat min', type: 'number', placeholder: '00.0' },
            { key: 'posLatDir', label: 'N / S', type: 'select', options: ['N', 'S'] },
            { key: 'posLongDeg', label: 'Long deg', type: 'number', placeholder: '000' },
            { key: 'posLongMin', label: 'Long min', type: 'number', placeholder: '00.0' },
            { key: 'posLongDir', label: 'E / W', type: 'select', options: ['E', 'W'] },
          ],
        },
      ],
    },
    {
      title: 'B) ROB',
      fields: [
        {
          key: 'rob',
          label: 'Remaining On Board',
          parts: [
            { key: 'robFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'robDo', label: 'DO (MT)', placeholder: 'XXX' },
            { key: 'robFw', label: 'FW (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'C) DAILY CONSUMPTION',
      fields: [
        {
          key: 'dailyCons',
          label: 'Daily Consumption',
          parts: [
            { key: 'consFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'consDo', label: 'DO (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'D) EQUIPMENT CONSUMPTION',
      fields: [
        {
          key: 'foEquipment',
          label: 'FO Consumption by Equipment',
          parts: [
            { key: 'foMe', label: 'FO M/E (MT)', placeholder: 'XXX' },
            { key: 'foAe', label: 'FO A/E (MT)', placeholder: 'XXX' },
            { key: 'foBoiler', label: 'FO Boiler (MT)', placeholder: 'XXX' },
          ],
        },
        {
          key: 'doEquipment',
          label: 'DO Consumption by Equipment',
          parts: [
            { key: 'doMe', label: 'DO M/E (MT)', placeholder: 'XXX' },
            { key: 'doAe', label: 'DO A/E (MT)', placeholder: 'XXX' },
            { key: 'doBoiler', label: 'DO Boiler (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'E) WEATHER CONDITIONS (DIRECTION/FORCE/HEIGHT)',
      fields: weatherSectionFields(),
    },
    {
      title: 'F) BUNKERS / FRESH WATER',
      fields: [
        { key: 'bunkersReceived', label: 'Bunkers / Fresh Water Received', placeholder: 'e.g. Shore FW supplied: 30 MT' },
      ],
    },
    {
      title: 'G) EXPECTED DEPARTURE',
      fields: [
        {
          key: 'expectedDeparture',
          label: 'Expected Departure',
          parts: [
            { key: 'depUtc', label: 'UTC', type: 'datetime-local' },
            { key: 'depLt', label: 'LT', type: 'datetime-local' },
          ],
        },
      ],
    },
    {
      title: 'H) ESTIMATED ROB ON DEPARTURE',
      fields: [
        {
          key: 'estDepRob',
          label: 'Estimated Departure ROB',
          parts: [
            { key: 'depRobFo', label: 'FO (MT)', placeholder: 'XXX' },
            { key: 'depRobDo', label: 'DO (MT)', placeholder: 'XXX' },
            { key: 'depRobFw', label: 'FW (MT)', placeholder: 'XXX' },
          ],
        },
      ],
    },
    {
      title: 'I) DAILY JOBS / REMARKS',
      fields: [
        { key: 'jobsRemarks', label: 'Daily Jobs Carried Out / Additional Remarks', type: 'textarea', placeholder: 'Hull hydro-blasting, valve overhauls, shaft seal replacement...' },
      ],
    },
  ],
  formatReportText: (values) => `**19. DRYDOCK DAILY REPORT**

A) REPORT DETAILS:

Report Date & Time (UTC, LT):
${fmtDateTimePair(values, 'report')}

Shipyard Name: ${v(values, 'shipyard', 'XXXXX')} | Berth / Dock Number: ${v(values, 'dockNum', 'XXXXX')}

Drydock Position (Lat deg, min, N/S, Long deg, min, E/W): ${fmtPos(values, 'pos')}

B) ROB:

FO: ${numVal(values, 'robFo', 'XXX')} MT | DO: ${numVal(values, 'robDo', 'XXX')} MT | FW: ${numVal(values, 'robFw', 'XXX')} MT

C) DAILY CONSUMPTION:

FO: ${numVal(values, 'consFo', 'XXX')} MT | DO: ${numVal(values, 'consDo', 'XXX')} MT

D) EQUIPMENT CONSUMPTION:

FO M/E: ${numVal(values, 'foMe', 'XXX')} MT | FO A/E: ${numVal(values, 'foAe', 'XXX')} MT | FO Boiler: ${numVal(values, 'foBoiler', 'XXX')} MT

DO M/E: ${numVal(values, 'doMe', 'XXX')} MT | DO A/E: ${numVal(values, 'doAe', 'XXX')} MT | DO Boiler: ${numVal(values, 'doBoiler', 'XXX')} MT

E) WEATHER CONDITIONS (DIRECTION/FORCE/HEIGHT):

${fmtWeatherText(values)}

F) BUNKERS / FRESH WATER:

Bunkers / Fresh Water Received:
${v(values, 'bunkersReceived', 'XXXXX')}

G) EXPECTED DEPARTURE:

Expected Departure (UTC, LT):
${fmtDateTimePair(values, 'dep')}

H) ESTIMATED ROB ON DEPARTURE:

FO: ${numVal(values, 'depRobFo', 'XXX')} MT | DO: ${numVal(values, 'depRobDo', 'XXX')} MT | FW: ${numVal(values, 'depRobFw', 'XXX')} MT

I) DAILY JOBS / REMARKS:

Daily Jobs Carried Out / Additional Remarks: ${v(values, 'jobsRemarks', 'XXXXX')}`,
};

export const ALL_VESSEL_REPORTS: ReportDefinition[] = [
  NOON_REPORT,
  ARRIVAL_REPORT,
  DEPARTURE_REPORT,
  ANCHORAGE_DRIFTING_DAILY_REPORT,
  IN_PORT_DAILY_REPORT,
  BUNKERING_REPORT,
  SHIFTING_REPORT,
  FUEL_CHANGEOVER_REPORT,
  STOP_RESUME_REPORT,
  NOR_REPORT,
  CARGO_OPERATION_REPORT,
  COMPLETION_OF_CARGO_REPORT,
  ANCHOR_REPORT,
  DRIFTING_REPORT,
  INCIDENT_ACCIDENT_REPORT,
  BUNKER_SURVEY_REPORT,
  SPEED_CHANGEOVER_REPORT,
  DRYDOCK_DAILY_REPORT,
];

export const VESSEL_REPORT_TITLES = ALL_VESSEL_REPORTS.map((r) => `${r.number}. ${r.name}`);

export function findReportDefinition(titleOrId: string): ReportDefinition {
  const clean = titleOrId.trim().toLowerCase();
  const found = ALL_VESSEL_REPORTS.find((r) =>
    r.id === clean ||
    r.name.toLowerCase() === clean ||
    `${r.number}. ${r.name}`.toLowerCase() === clean ||
    clean.includes(r.name.toLowerCase())
  );
  return found || NOON_REPORT;
}
