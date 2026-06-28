import type { Dispatch, SetStateAction } from 'react';

import { Badge, Card, Field, Info } from './primitives';
import type { VoyageView } from './types';

interface Props {
  view: VoyageView;
  isCreate: boolean;
  setView: Dispatch<SetStateAction<VoyageView>>;
  title: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

/** Read-only voyage roll-up shown at the top of the page. */
export function VoyageSummarySection({ view, isCreate, setView, title, collapsed, onToggleCollapse }: Props) {
  const set = <K extends keyof VoyageView>(key: K, value: VoyageView[K]) =>
    setView((prev) => ({ ...prev, [key]: value }));

  const firstLeg = view.legs[0];
  const lastLeg = view.legs[view.legs.length - 1];
  const route =
    firstLeg && lastLeg ? `${firstLeg.from || '—'} → ${lastLeg.to || '—'}` : '—';
  const departure = firstLeg?.etd || '—';
  const arrival = lastLeg?.etd || '—';

  const join = (a: string, b: string, sep = ' – ', suffix = '') => {
    if (!a && !b) return '—';
    return `${a || '—'}${sep}${b || '—'}${suffix}`;
  };
  const rpmRange = join(view.minRpm, view.maxRpm, ' – ', ' RPM');
  const speedRange = join(view.minSpeed, view.maxSpeed);
  const optSpeedRange = join(view.optMinSpeed, view.optMaxSpeed);

  return (
    <Card title={title} collapsed={collapsed} onToggleCollapse={onToggleCollapse}>
      <div className="fv-voyage__summary">
        <Field label="Vessel Name" value={view.vesselName} editing={isCreate} onChange={(x) => set('vesselName', x)} />
        <Field label="IMO" value={view.imo} editing={isCreate} onChange={(x) => set('imo', x)} />
        <Field label="Vessel Type" value={view.vesselType} editing={isCreate} onChange={(x) => set('vesselType', x)} />
        <Field label="Flag" value={view.flag} editing={isCreate} onChange={(x) => set('flag', x)} />
        <Field label="Client" value={view.client} editing={isCreate} onChange={(x) => set('client', x)} />
        <Field label="Service Type" value={view.serviceType} editing={isCreate} onChange={(x) => set('serviceType', x)} />
        <Field label="PIC" value={view.pic} editing={isCreate} onChange={(x) => set('pic', x)} />
        <Field
          label="Status"
          value={view.status}
          editing={isCreate}
          onChange={(x) => set('status', x)}
          display={view.status ? <Badge tone="active">{view.status}</Badge> : '—'}
        />
        <Info label="Route" value={route} />
        <Info label="Departure (ETD)" value={departure} />
        <Info label="Arrival (ETA)" value={arrival} />
        <Info label="Voyage Duration" value={view.duration} />
        <Info label="No. of Legs" value={String(view.legs.length)} />
        <Info
          label="Emission Reporting"
          value={view.emissionReportRequired ? 'Required' : 'Not required'}
        />
        <Info label="Created On" value={view.createdOn} />
        <Info label="Last Updated" value={view.lastUpdated} />

        <p className="fv-voyage__subhead">Vessel RPM &amp; Speed</p>
        <Info label="Min / Max RPM" value={rpmRange} />
        <Info label="Speed Range" value={speedRange} />

        <p className="fv-voyage__subhead">Optimization Criteria</p>
        <Info label="Optimization Mode" value={view.optMode} />
        <Info label="Objective" value={view.optObjective} />
        <Info label="Target Speed" value={view.optTargetSpeed} />
        <Info label="Opt. Speed Range" value={optSpeedRange} />
        <Info label="Weather Routing" value={view.optWeatherRouting ? 'Enabled' : 'Disabled'} />
        <Info label="Avoid ECA" value={view.optAvoidEca ? 'Yes' : 'No'} />

        <p className="fv-voyage__subhead">CP Good-Weather Criteria</p>
        <Info label="CP Winds (max)" value={firstLeg?.cpWinds || '—'} />
        <Info label="CP SWH (max)" value={firstLeg?.cpSwh || '—'} />
        <Info label="CP DSS (max)" value={firstLeg?.cpDss || '—'} />
        <Info label="CP Currents (max)" value={firstLeg?.cpCurrents || '—'} />
        <Info label="CP Min Hours" value={firstLeg?.cpMinHours || '—'} />
        <Info label="Good-Weather Basis" value={firstLeg?.cpGoodWeatherSelection || '—'} />
      </div>
    </Card>
  );
}


