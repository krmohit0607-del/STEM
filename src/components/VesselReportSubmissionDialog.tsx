import { useMemo, useState } from 'react';

import type { Voyage } from '../data/voyages';

const REPORT_TYPES = [
  'Noon Report',
  'Arrival Report (EOSP)',
  'Departure Report (COSP)',
  'Port / Berth Report',
  'Anchorage Daily Report',
  'In Port Daily Report',
  'NOR Report',
  'Cargo Operation Report',
  'Completion of Cargo Report',
  'Anchor Report',
  'Drifting Report',
  'Bunkering Report',
  'Stop / Resume Report',
  'Incident / Accident Report',
  'Shifting Report',
  'Bunker Survey Report',
  'Fuel Change-over Report',
  'Speed Change-over Report',
  'Drydock Daily Report',
] as const;

const SHIFTING_TYPES = [
  'Anchorage to Anchorage',
  'Anchorage to Berth',
  'Berth to Berth',
  'Berth to Anchorage',
] as const;

interface ReportField {
  key: string;
  label: string;
  type?: 'text' | 'datetime-local' | 'number';
  placeholder?: string;
  parts?: Array<{ key: string; label: string; type?: 'text' | 'datetime-local' | 'number' | 'select'; options?: string[] }>;
}

function compound(key: string, label: string, parts: Array<{ key: string; label: string; type?: 'text' | 'datetime-local' | 'number' | 'select'; options?: string[] }>): ReportField {
  return { key, label, parts };
}

const dateTimeField = (key: string, label: string) => compound(key, label, [
  { key: `${key}Utc`, label: 'UTC', type: 'datetime-local' },
  { key: `${key}Lt`, label: 'LT', type: 'datetime-local' },
]);
const positionField = (key: string, label: string) => compound(key, label, [
  { key: `${key}LatDeg`, label: 'Lat deg', type: 'number' },
  { key: `${key}LatMin`, label: 'Lat min', type: 'number' },
  { key: `${key}LatDir`, label: 'N / S', type: 'select', options: ['', 'N', 'S'] },
  { key: `${key}LongDeg`, label: 'Long deg', type: 'number' },
  { key: `${key}LongMin`, label: 'Long min', type: 'number' },
  { key: `${key}LongDir`, label: 'E / W', type: 'select', options: ['', 'E', 'W'] },
]);
const eventField = (key: string, label: string) => compound(key, label, [
  { key: `${key}LatDeg`, label: 'Lat deg', type: 'number' },
  { key: `${key}LatMin`, label: 'Lat min', type: 'number' },
  { key: `${key}LatDir`, label: 'N / S', type: 'select', options: ['', 'N', 'S'] },
  { key: `${key}LongDeg`, label: 'Long deg', type: 'number' },
  { key: `${key}LongMin`, label: 'Long min', type: 'number' },
  { key: `${key}LongDir`, label: 'E / W', type: 'select', options: ['', 'E', 'W'] },
  { key: `${key}Utc`, label: 'UTC', type: 'datetime-local' },
  { key: `${key}Lt`, label: 'LT', type: 'datetime-local' },
]);
const fuelPairField = (key: string, label: string) => compound(key, label, [
  { key: `${key}Hfo`, label: 'HFO (MT)' },
  { key: `${key}Mgo`, label: 'MGO (MT)' },
  ...(key.toLowerCase().includes('rob') ? [{ key: `${key}Fw`, label: 'FW (MT)' }] : []),
]);
const fuelWaterField = (key: string, label: string) => compound(key, label, [
  { key: `${key}Hfo`, label: 'HFO (MT)' },
  { key: `${key}Mgo`, label: 'MGO (MT)' },
  { key: `${key}Fw`, label: 'FW (MT)' },
]);
const draftField = (key: string, label: string) => compound(key, label, [
  { key: `${key}Fore`, label: 'Fore' },
  { key: `${key}Aft`, label: 'Aft' },
]);
const distanceTimeSpeedField = (key: string, label: string) => compound(key, label, [
  { key: `${key}Distance`, label: 'Distance (NM)' },
  { key: `${key}Time`, label: 'Time (hrs)', type: 'number' },
  { key: `${key}Speed`, label: 'Speed (knots)' },
]);

const weatherFields: ReportField[] = [
  compound('wind', 'Wind', [{ key: 'windDirection', label: 'Direction' }, { key: 'windForce', label: 'Force' }, { key: 'windHeight', label: 'Height' }]),
  compound('sea', 'Sea', [{ key: 'seaDirection', label: 'Direction' }, { key: 'seaForce', label: 'Force' }, { key: 'seaHeight', label: 'Height' }]),
  compound('swell', 'Swell', [{ key: 'swellDirection', label: 'Direction' }, { key: 'swellForce', label: 'Force' }, { key: 'swellHeight', label: 'Height' }]),
  compound('current', 'Current', [{ key: 'currentDirection', label: 'Direction' }, { key: 'currentSpeed', label: 'Speed' }]),
  compound('temperature', 'Temperature', [{ key: 'airTemperature', label: 'Air' }, { key: 'seaTemperature', label: 'Sea water' }]),
];

const robFields: ReportField[] = [
  fuelWaterField('rob', 'ROB'),
];

const commonReportFields: ReportField[] = [
  dateTimeField('report', 'Date and time of report'),
];

function fieldsForReport(type: string, shiftingSubtype: string = SHIFTING_TYPES[0]): ReportField[] {
  const passage = [
    distanceTimeSpeedField('steaming', 'Steaming since last report'),
    fuelWaterField('rob', 'ROB'),
    fuelPairField('dailyConsumption', 'Daily consumption'),
    compound('meAeConsumption', 'Consumption by equipment', [{ key: 'meHfo', label: 'HFO M/E' }, { key: 'aeHfo', label: 'HFO A/E' }, { key: 'boilerHfo', label: 'HFO boiler' }, { key: 'meMgo', label: 'MGO M/E' }, { key: 'aeMgo', label: 'MGO A/E' }, { key: 'boilerMgo', label: 'MGO boiler' }]),
    compound('calorificValue', 'Calorific value', [{ key: 'hfoCalorific', label: 'HFO (MJ/kg)' }, { key: 'mgoCalorific', label: 'MGO (MJ/kg)' }]),
    compound('mcrRpmSlip', 'MCR / average M/E RPM / slip', [{ key: 'mcr', label: 'MCR' }, { key: 'rpm', label: 'RPM' }, { key: 'slip', label: 'Slip' }]),
    ...weatherFields,
  ];

  if (type === 'Noon Report') {
    return [...commonReportFields, positionField('position', 'Noon position'), ...passage, distanceTimeSpeedField('totalSinceCosp', 'Total since COSP'), { key: 'nextPort', label: 'Next port / purpose of call' }, { key: 'distanceToGo', label: 'Distance to go (NM)' }, dateTimeField('etaNextPort', 'ETA next port'), draftField('arrivalDraft', 'Estimated arrival draft'), fuelPairField('arrivalRob', 'Estimated ROB on arrival'), { key: 'cargoOnboard', label: 'Cargo onboard (name / quantity or BALLAST)' }, { key: 'remarks', label: 'Additional remarks and stoppages' }];
  }
  if (type === 'Arrival Report (EOSP)') {
    return [...commonReportFields, { key: 'arrivedPort', label: 'Arrived port / purpose' }, eventField('eosp', 'EOSP'), eventField('pob', 'POB'), eventField('anchorBerth', 'Anchor / berth'), eventField('fwe', 'FWE'), eventField('nor', 'NOR tendered'), distanceTimeSpeedField('eospToFwe', 'EOSP to FWE'), fuelWaterField('robEosp', 'ROB at EOSP'), fuelWaterField('robFwe', 'ROB at FWE'), compound('passageTotals', 'Passage COSP to EOSP', [{ key: 'passageDistance', label: 'Distance' }, { key: 'passageTime', label: 'Time (hrs)', type: 'number' }, { key: 'passageSpeed', label: 'Speed' }, { key: 'passageConsumption', label: 'Consumption' }]), { key: 'averageRpm', label: 'Average RPM' }, { key: 'cargoOnboard', label: 'Cargo onboard / to be loaded (name / quantity)' }, draftField('arrivalDraft', 'Arrival draft'), dateTimeField('etb', 'ETB'), dateTimeField('etd', 'ETD'), { key: 'delay', label: 'Reason for delay in berthing' }, { key: 'remarks', label: 'Additional remarks' }];
  }
  if (type === 'Departure Report (COSP)') {
    return [...commonReportFields, { key: 'departedPort', label: 'Departed port / berth or anchorage' }, eventField('sbe', 'SBE'), eventField('pob', 'POB'), eventField('pilotOff', 'Pilot off'), eventField('anchor', 'Anchor'), eventField('fweCosp', 'FWE / COSP'), distanceTimeSpeedField('steamingTotals', 'SBE to COSP'), fuelWaterField('robSbe', 'ROB at SBE'), fuelWaterField('robCosp', 'ROB at COSP'), { key: 'cargoOnboard', label: 'Cargo onboard (name / quantity or BALLAST)' }, draftField('departureDraft', 'Departure draft'), { key: 'nextPort', label: 'Next port / purpose of call' }, { key: 'distanceToGo', label: 'Distance to next port (NM)' }, dateTimeField('etaNextPort', 'ETA next port'), fuelWaterField('arrivalRob', 'Estimated ROB on arrival'), { key: 'remarks', label: 'Additional remarks' }];
  }
  if (type === 'Port / Berth Report') {
    return [...commonReportFields, { key: 'portBerth', label: 'Port / berth / anchorage name' }, fuelPairField('rob', 'ROB'), compound('dailyConsumption', 'Daily consumption', [{ key: 'dailyHfo', label: 'HFO (MT)' }, { key: 'dailyMgo', label: 'MGO (MT)' }, { key: 'dailyFw', label: 'FW (MT)' }]), { key: 'bunkersReceived', label: 'Bunkers / fresh water received' }, { key: 'cargoLast24', label: 'Cargo loaded / discharged last 24 hours (MT)' }, { key: 'cargoTotal', label: 'Total cargo loaded / discharged to date (MT)' }, { key: 'cargoRemaining', label: 'Total cargo remaining / to be loaded (MT)' }, ...weatherFields, dateTimeField('etc', 'ETC'), dateTimeField('etd', 'ETD'), { key: 'delays', label: 'Log of port delays / important timings' }, { key: 'remarks', label: 'Remarks / observations' }];
  }
  if (type === 'Anchorage Daily Report') {
    return [...commonReportFields, { key: 'port', label: 'Port name' }, { key: 'anchorage', label: 'Anchorage name' }, positionField('position', 'Anchorage position'), fuelWaterField('rob', 'ROB'), fuelPairField('dailyConsumption', 'Daily consumption'), compound('equipmentConsumption', 'Consumption by equipment', [{ key: 'meHfo', label: 'HFO M/E' }, { key: 'aeHfo', label: 'HFO A/E' }, { key: 'boilerHfo', label: 'HFO boiler' }, { key: 'meMgo', label: 'MGO M/E' }, { key: 'aeMgo', label: 'MGO A/E' }, { key: 'boilerMgo', label: 'MGO boiler' }]), compound('calorificValue', 'Calorific value', [{ key: 'hfoCalorific', label: 'HFO (MJ/kg)' }, { key: 'mgoCalorific', label: 'MGO (MJ/kg)' }]), ...weatherFields, { key: 'bunkersReceived', label: 'Bunkers / fresh water received' }, dateTimeField('expectedBerthing', 'Expected berthing'), dateTimeField('expectedDeparture', 'Expected departure'), fuelPairField('departureRob', 'Estimated ROB on departure'), { key: 'remarks', label: 'Additional remarks' }];
  }
  if (type === 'In Port Daily Report') {
    const hourlyCargo = Array.from({ length: 7 }, (_, index) => ({ key: `cargoHour${index + 1}`, label: `${index + 1}H (MT)`, type: 'number' as const }));
    return [...commonReportFields, { key: 'port', label: 'Port name' }, fuelWaterField('rob', 'ROB'), compound('dailyConsumption', 'Daily consumption', [{ key: 'dailyHfo', label: 'HFO (MT)' }, { key: 'dailyMgo', label: 'MGO (MT)' }, { key: 'dailyFw', label: 'FW (MT)' }]), { key: 'bunkersReceived', label: 'Bunkers / fresh water received' }, compound('cargoLast24', 'Cargo last 24 hours', [{ key: 'cargoLast24Total', label: 'Total (MT)' }, ...hourlyCargo]), compound('cargoTotal', 'Total cargo to date', [{ key: 'cargoTotalValue', label: 'Total (MT)' }, ...hourlyCargo.map((part) => ({ ...part, key: `${part.key}Total` }))]), compound('cargoRemaining', 'Cargo remaining / to be loaded', [{ key: 'cargoRemainingValue', label: 'Total (MT)' }, ...hourlyCargo.map((part) => ({ ...part, key: `${part.key}Remaining` }))]), ...weatherFields, dateTimeField('etc', 'ETC'), dateTimeField('etd', 'ETD'), dateTimeField('departureRobDate', 'Estimated ROB on departure'), { key: 'delays', label: 'Port delays / important timings' }, { key: 'remarks', label: 'Remarks / observations' }];
  }
  if (type === 'Bunkering Report') {
    return [...commonReportFields, { key: 'bunkerPort', label: 'Bunkering port' }, eventField('bunkering', 'Bunkering position / date'), fuelPairField('robBefore', 'ROB before bunkering'), fuelPairField('robAfter', 'ROB after bunkering'), fuelPairField('bunkerReceived', 'Bunker received'), { key: 'barge', label: 'Bunker barge name' }, dateTimeField('bargeAlongside', 'Barge alongside'), dateTimeField('allFast', 'Barge all fast'), compound('hose', 'Hose', [{ key: 'hoseConnected', label: 'Connected date / time' }, { key: 'hoseDisconnected', label: 'Disconnected date / time' }]), compound('pumping', 'Pumping', [{ key: 'pumpingStart', label: 'Commenced date / time' }, { key: 'pumpingComplete', label: 'Completed date / time' }]), compound('documentation', 'Documentation / cast off', [{ key: 'documentationComplete', label: 'Documents completed' }, { key: 'castOff', label: 'Barge cast off date / time' }]), dateTimeField('etdPilot', 'ETD / pilot boarding'), { key: 'lop', label: 'LOP issued (Yes / No)' }, { key: 'remarks', label: 'Disputes, shortage or other observations' }];
  }
  if (type === 'Shifting Report') {
    const isAnchorageStart = shiftingSubtype.startsWith('Anchorage');
    const isAnchorageEnd = shiftingSubtype.endsWith('Anchorage');
    const startAction = isAnchorageStart ? 'Heaving up anchor' : 'Unmooring / all lines onboard';
    const endAction = isAnchorageEnd ? 'Let go anchor / vessel anchored' : 'First line ashore / all fast';
    return [...commonReportFields, { key: 'port', label: 'Port name' }, compound('fromTo', 'From / to', [{ key: 'fromLocation', label: 'From' }, { key: 'fromPosition', label: 'From position' }, { key: 'toLocation', label: 'To' }, { key: 'toPosition', label: 'To position' }]), compound('commenceTimings', 'Commence shifting', [{ key: 'sbe', label: 'SBE date / time' }, { key: 'pob', label: 'POB date / time' }, { key: 'startAction', label: `${startAction} date / time` }]), compound('completeTimings', 'Complete shifting', [{ key: 'endAction', label: `${endAction} date / time` }, { key: 'fwe', label: 'FWE date / time' }, { key: 'pilotOff', label: 'Pilot off date / time' }]), compound('shiftingTotals', 'Shifting totals', [{ key: 'shiftingDistance', label: 'Distance (NM)' }, { key: 'shiftingDuration', label: 'Duration (hrs)' }, { key: 'shiftingConsumptionHfo', label: 'HFO (MT)' }, { key: 'shiftingConsumptionMgo', label: 'MGO (MT)' }, { key: 'shiftingRobStart', label: 'ROB start' }, { key: 'shiftingRobFinish', label: 'ROB finish' }]), ...weatherFields, { key: 'reason', label: 'Reason for shifting' }, { key: 'cargoOnboard', label: 'Cargo onboard (name / quantity)' }, draftField('draft', 'Draft'), { key: 'remarks', label: 'Additional remarks' }];
  }
  if (type === 'Fuel Change-over Report') {
    return [...commonReportFields, compound('changeover', 'Change-over', [{ key: 'fromFuel', label: 'From' }, { key: 'toFuel', label: 'To' }]), compound('commenceComplete', 'Change-over timings', [{ key: 'commenceDate', label: 'Commence date / time' }, { key: 'commencePosition', label: 'Commence position' }, { key: 'completeDate', label: 'Complete date / time' }, { key: 'completePosition', label: 'Complete position' }]), compound('eca', 'ECA limit', [{ key: 'ecaEvent', label: 'Entering / exiting' }, { key: 'ecaDate', label: 'Date / time' }, { key: 'ecaPosition', label: 'Position' }]), distanceTimeSpeedField('changeoverDistance', 'Start to completion'), compound('robChangeover', 'ROB at change-over points', [{ key: 'commenceHfo', label: 'Commence HFO' }, { key: 'commenceMgo', label: 'Commence MGO' }, { key: 'completeHfo', label: 'Complete HFO' }, { key: 'completeMgo', label: 'Complete MGO' }, { key: 'ecaHfo', label: 'ECA HFO' }, { key: 'ecaMgo', label: 'ECA MGO' }]), fuelPairField('consumption', 'Consumption during change-over'), compound('calorificValue', 'Calorific value', [{ key: 'hfoCalorific', label: 'HFO (MJ/kg)' }, { key: 'mgoCalorific', label: 'MGO (MJ/kg)' }]), compound('mcrRpmSlip', 'MCR / average M/E RPM / slip', [{ key: 'mcr', label: 'MCR' }, { key: 'rpm', label: 'RPM' }, { key: 'slip', label: 'Slip' }]), { key: 'remarks', label: 'Additional remarks' }];
  }
  if (type === 'Stop / Resume Report') {
    return [...commonReportFields, { key: 'event', label: 'Event', placeholder: 'Deviation / reduction in speed / stoppage / resumption' }, fuelPairField('rob', 'Bunkers remaining on board'), { key: 'reason', label: 'Reason for stoppage / deviation / speed reduction' }, dateTimeField('resume', 'Expected / actual resumption'), { key: 'distanceToGo', label: 'Distance to go to next port (NM)' }, fuelPairField('stoppageConsumption', 'Consumption during stoppage'), { key: 'duration', label: 'Duration of stoppage / speed reduction / deviation' }, dateTimeField('eta', 'ETA next port')];
  }
  if (type === 'NOR Report') {
    return [...commonReportFields, { key: 'port', label: 'Port / berth / anchorage' }, positionField('norTendered', 'NOR tendered position'), dateTimeField('norTendered', 'NOR tendered date / time'), dateTimeField('norAccepted', 'NOR accepted date / time'), { key: 'acceptedBy', label: 'NOR accepted by' }, { key: 'readiness', label: 'Vessel readiness and cargo readiness' }, { key: 'exceptions', label: 'Exceptions or remarks' }];
  }
  if (type === 'Cargo Operation Report' || type === 'Completion of Cargo Report') {
    return [...commonReportFields, { key: 'portBerth', label: 'Port / berth / terminal' }, { key: 'operation', label: 'Cargo operation: loading / discharging / other' }, { key: 'operationTimings', label: 'Operation start / stop and important timings' }, { key: 'cargoName', label: 'Cargo name' }, { key: 'quantityLast', label: 'Quantity loaded / discharged during period (MT)' }, { key: 'quantityTotal', label: 'Total quantity loaded / discharged to date (MT)' }, { key: 'cargoRemaining', label: 'Quantity remaining / to be loaded (MT)' }, { key: 'holdsTanks', label: 'Holds / tanks and cargo distribution' }, { key: 'delays', label: 'Stoppages, delays and reasons' }, { key: 'draft', label: 'Draft fore / aft' }, { key: 'remarks', label: 'Remarks / observations' }];
  }
  if (type === 'Anchor Report') {
    return [...commonReportFields, { key: 'port', label: 'Port / anchorage name' }, eventField('anchorEvent', 'Anchor drop / aweigh'), { key: 'depth', label: 'Water depth' }, { key: 'reason', label: 'Reason for anchoring / weighing anchor' }, ...robFields, ...weatherFields, { key: 'remarks', label: 'Additional remarks' }];
  }
  if (type === 'Drifting Report') {
    return [...commonReportFields, eventField('driftingEvent', 'Drifting start / stop'), { key: 'reason', label: 'Reason for drifting' }, { key: 'courseSpeed', label: 'Course / speed' }, ...robFields, ...weatherFields, { key: 'remarks', label: 'Additional remarks' }];
  }
  if (type === 'Incident / Accident Report') {
    return [...commonReportFields, positionField('incidentPosition', 'Incident position'), dateTimeField('incidentDate', 'Incident date / time'), { key: 'incidentType', label: 'Incident / accident type' }, { key: 'personsEquipment', label: 'Persons, vessel, equipment or cargo involved' }, { key: 'facts', label: 'Description of facts and sequence of events' }, { key: 'damage', label: 'Damage, injury, pollution or operational impact' }, { key: 'actions', label: 'Immediate actions taken' }, { key: 'evidence', label: 'Supporting photographs / documents' }, { key: 'remarks', label: 'Additional remarks' }];
  }
  if (type === 'Bunker Survey Report') {
    return [...commonReportFields, { key: 'surveyLocation', label: 'Survey port / location' }, positionField('surveyPosition', 'Survey position'), { key: 'surveyor', label: 'Surveyor name / company' }, dateTimeField('survey', 'Survey date / time'), { key: 'tankSoundings', label: 'Tank soundings and calculated quantities' }, { key: 'fuelGrades', label: 'Fuel grades, density and temperature' }, fuelWaterField('robSurvey', 'ROB before / after survey'), { key: 'documents', label: 'Survey report / supporting documents' }, { key: 'remarks', label: 'Discrepancies or remarks' }];
  }
  if (type === 'Speed Change-over Report') {
    return [...commonReportFields, positionField('speedChangePosition', 'Speed change position'), dateTimeField('speedChange', 'Speed change'), { key: 'oldSpeed', label: 'Old speed (knots)' }, { key: 'newSpeed', label: 'New speed (knots)' }, { key: 'engineSettings', label: 'Engine settings / RPM / load' }, { key: 'reason', label: 'Reason for speed change' }, ...weatherFields, dateTimeField('eta', 'ETA next port'), { key: 'distanceToGo', label: 'Distance to next port (NM)' }, { key: 'remarks', label: 'Additional remarks' }];
  }
  if (type === 'Drydock Daily Report') {
    return [...commonReportFields, { key: 'shipyard', label: 'Shipyard name' }, { key: 'dock', label: 'Berth / dock number' }, positionField('position', 'Drydock position'), fuelWaterField('rob', 'ROB'), fuelPairField('dailyConsumption', 'Daily consumption'), compound('equipmentConsumption', 'Consumption by equipment', [{ key: 'meHfo', label: 'HFO M/E' }, { key: 'aeHfo', label: 'HFO A/E' }, { key: 'boilerHfo', label: 'HFO boiler' }, { key: 'meMgo', label: 'MGO M/E' }, { key: 'aeMgo', label: 'MGO A/E' }, { key: 'boilerMgo', label: 'MGO boiler' }]), ...weatherFields, { key: 'bunkersReceived', label: 'Bunkers / fresh water received' }, dateTimeField('expectedDeparture', 'Expected departure'), fuelPairField('departureRob', 'Estimated ROB on departure'), { key: 'jobs', label: 'Daily jobs carried out / additional remarks' }];
  }
  const generic = [compound('eventDate', 'Event date / time', [{ key: 'eventDate', label: 'Date' }, { key: 'eventTime', label: 'Time' }, { key: 'eventZone', label: 'LT / UTC' }]), { key: 'eventPosition', label: 'Event position (latitude / longitude)' }, compound('rob', 'ROB by fuel grade', [{ key: 'robHfo', label: 'HFO (MT)' }, { key: 'robMgo', label: 'MGO (MT)' }]), { key: 'weather', label: 'Weather: wind / sea / swell / current / temperatures' }, compound('draft', 'Draft', [{ key: 'draftFore', label: 'Fore' }, { key: 'draftAft', label: 'Aft' }]), { key: 'cargo', label: 'Cargo name / quantity' }, { key: 'operation', label: 'Operation details and timings' }, { key: 'documents', label: 'Supporting documents / photographs' }, { key: 'remarks', label: 'Additional remarks' }];
  return [...commonReportFields, ...generic];
}

interface VesselReportSubmissionDialogProps {
  voyage: Voyage;
  onClose: () => void;
  mode?: 'dialog' | 'page';
}

export function VesselReportSubmissionDialog({
  voyage,
  onClose,
  mode = 'dialog',
}: VesselReportSubmissionDialogProps) {
  const [reportType, setReportType] = useState<string>(REPORT_TYPES[0]);
  const [shiftingSubtype, setShiftingSubtype] = useState<string>(SHIFTING_TYPES[0]);
  const fields = useMemo(() => fieldsForReport(reportType, shiftingSubtype), [reportType, shiftingSubtype]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const submit = () => {
    const record = {
      id: `vessel-report-${Date.now()}`,
      voyageId: voyage.id,
      vessel: voyage.vessel,
      reportType,
      values,
      submittedAt: new Date().toISOString(),
      status: 'Submitted',
    };
    try {
      const raw = window.localStorage.getItem('fv.vesselReports');
      const existing = raw ? JSON.parse(raw) : [];
      const reports = Array.isArray(existing) ? existing : [];
      window.localStorage.setItem('fv.vesselReports', JSON.stringify([record, ...reports]));
    } catch {
      // Submission remains visible even when browser storage is unavailable.
    }
    setSubmitted(true);
  };

  const emailReport = () => {
    const subject = `${voyage.vessel} - ${reportType} - ${voyage.portFrom} - ${voyage.portTo}`;
    const lines = fields.flatMap((field) => field.parts
      ? [`${field.label}: ${field.parts.map((part) => `${part.label}: ${values[part.key] || ''}`).join(' | ')}`]
      : [`${field.label}: ${values[field.key] || ''}`]);
    const body = `${reportType} - ${voyage.vessel}\nVoyage: ${voyage.id}\nItinerary: ${voyage.portFrom} - ${voyage.portTo}\n\n${lines.join('\n')}`;
    window.location.href = `mailto:ops@odasgroup.net?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className={`fv-report-submit__backdrop${mode === 'page' ? ' fv-report-submit__backdrop--page' : ''}`} role="presentation" onMouseDown={mode === 'dialog' ? onClose : undefined}>
      <section
        className="fv-report-submit"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fv-report-submit-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="fv-report-submit__head">
          <div>
            <span className="fv-report-submit__eyebrow">Vessel reporting</span>
            <h2 id="fv-report-submit-title">Submit Vessel Report</h2>
            <p>{voyage.vessel} · Voyage {voyage.id}</p>
          </div>
          <button type="button" className="fv-report-submit__close" aria-label="Close" onClick={onClose}>
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </header>

        {submitted ? (
          <div className="fv-report-submit__success">
            <i className="fas fa-circle-check" aria-hidden="true" />
            <h3>Report submitted</h3>
            <p>{reportType} has been sent to the ODAS operations team.</p>
            <button type="button" className="fv-report__btn fv-report__btn--primary" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="fv-report-submit__body">
              <label className="fv-report-submit__type">
                Report type
                <select value={reportType} onChange={(event) => { setReportType(event.target.value); setValues({}); }}>
                  {REPORT_TYPES.map((type) => <option key={type}>{type}</option>)}
                </select>
              </label>
              {reportType === 'Shifting Report' && (
                <label className="fv-report-submit__type">
                  Shifting type
                  <select value={shiftingSubtype} onChange={(event) => { setShiftingSubtype(event.target.value); setValues({}); }}>
                    {SHIFTING_TYPES.map((type) => <option key={type}>{type}</option>)}
                  </select>
                </label>
              )}
              {fields.map((field) => (
                <label key={field.key} className={field.key === 'remarks' ? 'fv-report-submit__details' : undefined}>
                  {field.label}
                  {field.parts ? (
                    <span className="fv-report-submit__parts">
                      {field.parts.map((part) => (
                        <span key={part.key} className="fv-report-submit__part">
                          <small>{part.label}</small>
                          {part.type === 'select' ? (
                            <select value={values[part.key] || ''} onChange={(event) => setValues((current) => ({ ...current, [part.key]: event.target.value }))}>
                              {(part.options || []).map((option) => <option key={option} value={option}>{option || 'Select'}</option>)}
                            </select>
                          ) : (
                            <input type={part.type || (/date|time/i.test(part.label) ? 'datetime-local' : 'text')} value={values[part.key] || ''} onChange={(event) => setValues((current) => ({ ...current, [part.key]: event.target.value }))} />
                          )}
                        </span>
                      ))}
                    </span>
                  ) : field.key === 'remarks' || field.label.length > 70 ? (
                    <textarea rows={2} placeholder={field.placeholder} value={values[field.key] || ''} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} />
                  ) : (
                    <input type={field.type || (/date|time/i.test(field.label) ? 'datetime-local' : 'text')} placeholder={field.placeholder} value={values[field.key] || ''} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} />
                  )}
                </label>
              ))}
            </div>
            <footer className="fv-report-submit__foot">
              <button type="button" className="fv-report__btn" onClick={emailReport}>
                <i className="fas fa-envelope" aria-hidden="true" /> No Internet? Email Report
              </button>
              <button type="button" className="fv-report__btn fv-report__btn--primary" disabled={!fields.some((field) => (field.parts ? field.parts.some((part) => values[part.key]?.trim()) : values[field.key]?.trim()))} onClick={submit}>
                <i className="fas fa-paper-plane" aria-hidden="true" /> Submit Report
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}