import type { Dispatch, SetStateAction } from 'react';

import { Card } from './primitives';
import { type VoyageView } from './types';

interface Props {
  view: VoyageView;
  setView: Dispatch<SetStateAction<VoyageView>>;
  editing: boolean;
  onToggleEdit: () => void;
  title: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

interface NoteFieldProps {
  label: string;
  value: string;
  editing: boolean;
  onChange: (value: string) => void;
}

function NoteField({ label, value, editing, onChange }: NoteFieldProps) {
  return (
    <div className="fv-voyage__col">
      <span className="fv-voyage__info-label">{label}</span>
      {editing ? (
        <textarea
          className="fv-voyage__textarea"
          rows={4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <p className="fv-voyage__notes">{value || '—'}</p>
      )}
    </div>
  );
}

/** 5. Notes — operational, master and internal notes for the voyage. */
export function NotesSection({ view, setView, editing, onToggleEdit, title, collapsed, onToggleCollapse }: Props) {
  const set = <K extends keyof VoyageView>(key: K, value: VoyageView[K]) =>
    setView((prev) => ({ ...prev, [key]: value }));

  return (
    <Card id="voyageNotes" title={title} editing={editing} onToggleEdit={onToggleEdit} collapsed={collapsed} onToggleCollapse={onToggleCollapse}>
      <div className="fv-voyage__dense">
        <div className="fv-voyage__cols fv-voyage__cols--1">
          <NoteField label="Operational Notes" value={view.operationalNotes} editing={editing} onChange={(x) => set('operationalNotes', x)} />
          <NoteField label="Master Remarks" value={view.masterRemarks} editing={editing} onChange={(x) => set('masterRemarks', x)} />
          <NoteField label="Internal Notes" value={view.internalNotes} editing={editing} onChange={(x) => set('internalNotes', x)} />
        </div>
      </div>
    </Card>
  );
}
