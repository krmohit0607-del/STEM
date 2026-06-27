import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { BoolField, Card, Field } from './primitives';
import {
  CLIENT_TYPE_OPTIONS,
  PRICING_BASIS_OPTIONS,
  SERVICE_TYPE_OPTIONS,
  type VoyageView,
} from './types';

interface Props {
  view: VoyageView;
  setView: Dispatch<SetStateAction<VoyageView>>;
  editing: boolean;
  onToggleEdit: () => void;
  title: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

/** 1. Order & Client Information. */
export function OrderSection({ view, setView, editing, onToggleEdit, title, collapsed, onToggleCollapse }: Props) {
  const set = <K extends keyof VoyageView>(key: K, value: VoyageView[K]) =>
    setView((prev) => ({ ...prev, [key]: value }));

  // "For daily fleet summary" can mirror the client email list (Excel toggle).
  const [summaryEmailSameAsClient, setSummaryEmailSameAsClient] = useState(false);

  useEffect(() => {
    if (!summaryEmailSameAsClient) return;
    setView((prev) =>
      prev.dailyFleetSummaryEmail === prev.clientEmailList
        ? prev
        : { ...prev, dailyFleetSummaryEmail: prev.clientEmailList },
    );
  }, [summaryEmailSameAsClient, view.clientEmailList, setView]);

  return (
    <Card
      id="order"
      extraIds={['notes']}
      title={title}
      editing={editing}
      onToggleEdit={onToggleEdit}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
    >
      <div className="fv-voyage__cols fv-voyage__cols--3">
        <div className="fv-voyage__col">
          <Field label="Service Type" value={view.serviceType} editing={editing} onChange={(x) => set('serviceType', x)} options={SERVICE_TYPE_OPTIONS} />
          <BoolField label="Emission Report Required?" value={view.emissionReportRequired} editing={editing} onChange={(b) => set('emissionReportRequired', b)} />
        </div>
        <div className="fv-voyage__col">
          <Field label="Client Name" value={view.client} editing={editing} onChange={(x) => set('client', x)} />
          <Field label="Client Type" value={view.clientType} editing={editing} onChange={(x) => set('clientType', x)} options={CLIENT_TYPE_OPTIONS} />
        </div>
        <div className="fv-voyage__col">
          <Field label="Price" value={view.price} editing={editing} onChange={(x) => set('price', x)} />
          <Field label="Pricing Basis" value={view.pricingBasis} editing={editing} onChange={(x) => set('pricingBasis', x)} options={PRICING_BASIS_OPTIONS} />
        </div>
      </div>

      <div className="fv-voyage__cols fv-voyage__cols--2">
        <div className="fv-voyage__col">
          <Field label="Client Email List" value={view.clientEmailList} editing={editing} onChange={(x) => set('clientEmailList', x)} />
        </div>
        <div className="fv-voyage__col">
          <Field
            label="For Daily Fleet Summary"
            value={view.dailyFleetSummaryEmail}
            editing={editing && !summaryEmailSameAsClient}
            onChange={(x) => set('dailyFleetSummaryEmail', x)}
          />
          {editing && (
            <label className="fv-voyage__toggle">
              <input
                type="checkbox"
                checked={summaryEmailSameAsClient}
                onChange={(e) => setSummaryEmailSameAsClient(e.target.checked)}
              />
              <span>Same as client email list</span>
            </label>
          )}
        </div>
      </div>

      <div className="fv-voyage__cols fv-voyage__cols--1">
        <div className="fv-voyage__col" id="notes">
          <span className="fv-voyage__info-label">Client Notes / Instructions</span>
          {editing ? (
            <textarea
              className="fv-voyage__textarea"
              rows={5}
              value={view.clientNotes}
              onChange={(e) => set('clientNotes', e.target.value)}
            />
          ) : (
            <p className="fv-voyage__notes">{view.clientNotes || '—'}</p>
          )}
        </div>
      </div>
    </Card>
  );
}
