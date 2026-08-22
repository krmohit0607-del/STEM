import { useEffect, useMemo, useRef, useState } from 'react';
import { useL } from '../i18n/LocalizationProvider';
import { clearSelectedVoyageId, useSelectedVoyage, writeSelectedVoyageId } from '../data/selectedVoyage';
import { VOYAGES } from '../data/voyages';
import { clearSelectedBunkerId, useBunkerRequirements, useSelectedBunkerId, writeSelectedBunkerId } from '../data/bunker';
import { clearSelectedAccountVessel, useSelectedAccountVessel, writeSelectedAccountVessel } from '../data/accounts';

export function ModuleVesselSearch() {
  const l = useL();
  const voyage = useSelectedVoyage({ emptyWhenCleared: true });
  const bunkerRequirements = useBunkerRequirements();
  const selectedBunkerId = useSelectedBunkerId();
  const selectedAccountVessel = useSelectedAccountVessel();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const t = (key: string, fallback: string) => { const value = l(key); return value === key ? fallback : value; };
  const vesselOptions = useMemo(() => {
    const byVessel = new Map<string, { id: string; vessel: string; voyageId?: string; bunkerId?: string }>();
    VOYAGES.forEach((item) => byVessel.set(item.vessel, { id: item.id, vessel: item.vessel, voyageId: item.id }));
    bunkerRequirements.forEach((item) => {
      const existing = byVessel.get(item.vessel);
      byVessel.set(item.vessel, { id: existing?.id ?? `bunker:${item.id}`, vessel: item.vessel, voyageId: existing?.voyageId, bunkerId: item.id });
    });
    return Array.from(byVessel.values());
  }, [bunkerRequirements]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? vesselOptions.filter((item) => item.vessel.toLowerCase().includes(q)) : vesselOptions).slice(0, 30);
  }, [query, vesselOptions]);
  const selectedBunker = bunkerRequirements.find((item) => item.id === selectedBunkerId);
  const vesselName = voyage?.vessel ?? selectedBunker?.vessel ?? selectedAccountVessel ?? t('noVessel', 'No vessel selected');
  const clear = () => {
    clearSelectedVoyageId();
    clearSelectedBunkerId();
    clearSelectedAccountVessel();
    setQuery('');
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onDocument = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocument);
    return () => document.removeEventListener('mousedown', onDocument);
  }, [open]);

  return (
    <div className="fv-topnav__vessel-search" ref={ref}>
      <i className="fas fa-ship fv-topnav__vessel-search-icon" aria-hidden="true" />
      <input
        className="fv-topnav__vessel-input"
        type="text"
        value={open ? query : vesselName}
        placeholder={t('searchVessel', 'Search vessel…')}
        aria-label={t('searchVessel', 'Search vessel')}
        onFocus={() => { setQuery(''); setOpen(true); }}
        onChange={(event) => setQuery(event.target.value)}
      />
      {(voyage || selectedBunker || selectedAccountVessel) && !open && <button type="button" className="fv-topnav__vessel-clear" title="Clear vessel selection" aria-label="Clear vessel selection" onClick={clear}><i className="fas fa-xmark" aria-hidden="true" /></button>}
      {open && matches.length > 0 && (
        <ul className="fv-topnav__vessel-list" role="listbox">
          {matches.map((item) => (
            <li
              key={item.id}
              role="option"
              aria-selected={item.voyageId === voyage?.id || item.bunkerId === selectedBunkerId || item.vessel === selectedAccountVessel}
              className={`fv-topnav__vessel-item${item.voyageId === voyage?.id || item.bunkerId === selectedBunkerId || item.vessel === selectedAccountVessel ? ' fv-topnav__vessel-item--active' : ''}`}
              onMouseDown={(event) => {
                event.preventDefault();
                if (item.voyageId) writeSelectedVoyageId(item.voyageId);
                else clearSelectedVoyageId();
                if (item.bunkerId) writeSelectedBunkerId(item.bunkerId);
                else clearSelectedBunkerId();
                writeSelectedAccountVessel(item.vessel);
                setOpen(false);
                setQuery('');
              }}
            >
              {item.vessel}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
