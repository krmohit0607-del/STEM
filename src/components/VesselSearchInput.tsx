import { useEffect, useRef, useState } from 'react';

import {
  hitToVessel,
  loadImoDatabase,
  searchImoDatabase,
  type ImoSearchHit,
} from '../data/imoShipDatabase';
import { loadVessels, newVesselId, saveVessels, type Vessel } from '../data/vessels';

interface Props {
  value: string;
  onChange: (name: string) => void;
  /** Called when a vessel is chosen, with the full record (imported if new). */
  onPick?: (vessel: Vessel) => void;
  disabled?: boolean;
  placeholder?: string;
}

interface Row {
  key: string;
  name: string;
  meta: string;
  inFleet: boolean;
  /** Full fleet record when already saved; otherwise the source IMO hit. */
  vessel?: Vessel;
  hit?: ImoSearchHit;
}

/**
 * Vessel autocomplete that searches both the saved fleet (Settings → Vessels
 * Details) and the bundled IMO ship database. Picking an IMO result that is
 * not yet in the fleet imports it into Vessel Details automatically.
 */
export function VesselSearchInput({ value, onChange, onPick, disabled, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [fleet, setFleet] = useState<Vessel[]>(() => loadVessels());
  const [imoHits, setImoHits] = useState<ImoSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Debounced IMO database lookup while the dropdown is open.
  useEffect(() => {
    if (!open) return;
    const q = value.trim();
    if (q.length < 2) {
      setImoHits([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const id = window.setTimeout(() => {
      searchImoDatabase(q)
        .then((hits) => {
          if (!cancelled) setImoHits(hits);
        })
        .catch(() => {
          if (!cancelled) setImoHits([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [value, open]);

  const q = value.trim().toLowerCase();
  const fleetMatches = q
    ? fleet.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.shortName.toLowerCase().includes(q) ||
          v.imo.toLowerCase().includes(q),
      )
    : fleet.slice(0, 20);

  const fleetImos = new Set(fleet.map((v) => v.imo).filter(Boolean));
  const rows: Row[] = [
    ...fleetMatches.map((v) => ({
      key: `fleet-${v.id}`,
      name: v.name,
      meta: [v.imo && `IMO ${v.imo}`, v.vesselType, v.builtYear].filter(Boolean).join(' · '),
      inFleet: true,
      vessel: v,
    })),
    ...imoHits
      .filter((h) => !h.imo || !fleetImos.has(h.imo))
      .map((h) => ({
        key: `imo-${h.imo || h.name}`,
        name: h.name,
        meta: [h.imo && `IMO ${h.imo}`, h.vesselType, h.builtYear].filter(Boolean).join(' · '),
        inFleet: false,
        hit: h,
      })),
  ];

  const choose = (row: Row) => {
    if (row.inFleet && row.vessel) {
      onChange(row.vessel.name);
      onPick?.(row.vessel);
    } else if (row.hit) {
      // Import the ship into Vessel Details so it becomes a fleet record.
      const imported: Vessel = { ...hitToVessel(row.hit), id: newVesselId() };
      const next = [imported, ...loadVessels()];
      saveVessels(next);
      setFleet(next);
      onChange(imported.name);
      onPick?.(imported);
    }
    setOpen(false);
  };

  return (
    <div className="fv-port-combo" ref={wrapRef}>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => {
          setOpen(true);
          loadImoDatabase().catch(() => undefined);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, rows.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && rows[active]) {
            e.preventDefault();
            choose(rows[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && (rows.length > 0 || loading) && (
        <ul className="fv-port-combo__list">
          {rows.map((row, i) => (
            <li
              key={row.key}
              className={`fv-port-combo__item${i === active ? ' fv-port-combo__item--active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(row);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="fv-port-combo__name">
                {row.name}
                {!row.inFleet && (
                  <span className="fv-vessel-combo__badge"> + Add to fleet</span>
                )}
              </span>
              <span className="fv-port-combo__meta">{row.meta}</span>
            </li>
          ))}
          {loading && <li className="fv-port-combo__item fv-port-combo__item--muted">Searching IMO database…</li>}
        </ul>
      )}
    </div>
  );
}
