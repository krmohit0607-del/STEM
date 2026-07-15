import { useEffect, useMemo, useRef, useState } from 'react';

import { useL } from '../i18n/LocalizationProvider';
import { useSelectedVoyage, writeSelectedVoyageId } from '../data/selectedVoyage';
import { setSelectedLegNo, useSelectedLegNo } from '../data/selectedLeg';
import { VOYAGES } from '../data/voyages';
import { buildView } from './voyage/buildView';

/**
 * Module bar — the vessel search + leg selector for the current module.
 *
 * These used to live in the universal top header, but the vessel/voyage
 * context is module-specific (it belongs to the current app, mapped under the
 * Performance module) rather than shared across Chartering/Operations/etc. So
 * it renders at the top of the module's content area instead of the app header.
 */

/** Single-letter leg-type code: Ballast=B, Laden=L, Delivery=D, Redelivery=R. */
function legTypeCode(type: string): string {
  const map: Record<string, string> = {
    Ballast: 'B',
    Laden: 'L',
    Delivery: 'D',
    Redelivery: 'R',
  };
  return map[type] ?? (type ? type[0].toUpperCase() : '');
}

export function ModuleBar() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const voyage = useSelectedVoyage();
  const legs = useMemo(() => (voyage ? buildView(voyage).legs : []), [voyage]);

  const legNo = useSelectedLegNo();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Vessel search — type to filter vessels and switch the open voyage.
  const [vesselQuery, setVesselQuery] = useState('');
  const [vesselOpen, setVesselOpen] = useState(false);
  const vesselRef = useRef<HTMLDivElement | null>(null);

  const selectedLeg = useMemo(
    () => legs.find((leg) => leg.no === legNo) ?? legs[0],
    [legs, legNo],
  );

  const vesselName = voyage?.vessel ?? t('noVessel', 'No vessel selected');

  const vesselMatches = useMemo(() => {
    const q = vesselQuery.trim().toLowerCase();
    const list = q
      ? VOYAGES.filter((v) => v.vessel.toLowerCase().includes(q))
      : VOYAGES;
    return list.slice(0, 30);
  }, [vesselQuery]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [dropdownOpen]);

  useEffect(() => {
    if (!vesselOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (vesselRef.current && !vesselRef.current.contains(e.target as Node)) {
        setVesselOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [vesselOpen]);

  return (
    <div className="fv-modulebar" role="navigation" aria-label="Voyage">
      <div className="fv-topnav__vessel-search" ref={vesselRef}>
        <i
          className="fas fa-magnifying-glass fv-topnav__vessel-search-icon"
          aria-hidden="true"
        />
        <input
          className="fv-topnav__vessel-input"
          type="text"
          value={vesselOpen ? vesselQuery : vesselName}
          placeholder={t('searchVessel', 'Search vessel…')}
          aria-label={t('searchVessel', 'Search vessel')}
          onFocus={() => {
            setVesselQuery('');
            setVesselOpen(true);
          }}
          onChange={(e) => setVesselQuery(e.target.value)}
        />
        {vesselOpen && vesselMatches.length > 0 && (
          <ul className="fv-topnav__vessel-list" role="listbox">
            {vesselMatches.map((v) => (
              <li
                key={v.id}
                role="option"
                aria-selected={v.id === voyage?.id}
                className={`fv-topnav__vessel-item${
                  v.id === voyage?.id ? ' fv-topnav__vessel-item--active' : ''
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  writeSelectedVoyageId(v.id);
                  setVesselOpen(false);
                  setVesselQuery('');
                }}
              >
                {v.vessel}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="fv-topnav__voyage" ref={wrapperRef}>
        <button
          type="button"
          className="fv-topnav__voyage-button"
          onClick={() => setDropdownOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={dropdownOpen}
          disabled={legs.length === 0}
        >
          {selectedLeg ? (
            <span className="fv-topnav__voyage-route">
              Leg {selectedLeg.no}: {selectedLeg.from} - {selectedLeg.to} -{' '}
              {legTypeCode(selectedLeg.type)} - {selectedLeg.etd}
            </span>
          ) : (
            <span>{t('noLegs', 'No legs')}</span>
          )}
          <span className="fv-topnav__caret" aria-hidden="true">
            ▾
          </span>
        </button>

        {dropdownOpen && legs.length > 0 && (
          <ul className="fv-topnav__voyage-list" role="listbox">
            {legs.map((leg) => (
              <li
                key={leg.no}
                role="option"
                aria-selected={leg.no === selectedLeg?.no}
                className={`fv-topnav__voyage-item${
                  leg.no === selectedLeg?.no ? ' fv-topnav__voyage-item--active' : ''
                }`}
                onClick={() => {
                  setSelectedLegNo(leg.no);
                  setDropdownOpen(false);
                }}
              >
                <div className="fv-topnav__voyage-item-route">
                  Leg {leg.no}: {leg.from} - {leg.to} - {legTypeCode(leg.type)} - {leg.etd}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
