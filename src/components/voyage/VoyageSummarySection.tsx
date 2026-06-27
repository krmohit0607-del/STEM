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

  return (
    <Card title={title} collapsed={collapsed} onToggleCollapse={onToggleCollapse}>
      <div className="fv-voyage__summary">
        <Field label="Vessel Name" value={view.vesselName} editing={isCreate} onChange={(x) => set('vesselName', x)} />
        <Field label="IMO" value={view.imo} editing={isCreate} onChange={(x) => set('imo', x)} />
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
        <Info label="Voyage Duration" value={view.duration} />
        <Info label="No. of Legs" value={String(view.legs.length)} />
        <Info label="Created On" value={view.createdOn} />
        <Info label="Last Updated" value={view.lastUpdated} />
      </div>
    </Card>
  );
}
