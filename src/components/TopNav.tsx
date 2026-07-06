import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useL } from '../i18n/LocalizationProvider';
import { useSelectedVoyage } from '../data/selectedVoyage';
import { buildView } from './voyage/buildView';
import { ModuleSelector } from './ModuleSelector';

/**
 * Top navigation bar for the home page.
 *
 * LEFT side
 *   - Vessel name / Client (from the selected voyage)
 *   - Leg selector dropdown — each option shows
 *     `Leg No · From → To · Type · Status · ETD`
 *
 * RIGHT side
 *   - Mail icon (send system email)            — TODO wire to EmailDialog API
 *   - "Edit current voyage" button              — TODO wire to VoyageDialog
 *   - "Create new voyage" button + Position     — TODO wire to VoyageDialog (new)
 *
 * The vessel + voyage data here is resolved from the shared voyage dataset
 * via `useSelectedVoyage`. Replace that data source with real API data when
 * the dependent endpoints are exposed.
 */

function todoHandler(label: string) {
  return () => {
    // eslint-disable-next-line no-console
    console.warn(`[FleetView WebApp] '${label}' not ported yet — see MIGRATION.md.`);
  };
}

export function TopNav() {
  const l = useL();
  const navigate = useNavigate();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const voyage = useSelectedVoyage();
  const legs = useMemo(() => (voyage ? buildView(voyage).legs : []), [voyage]);

  const [legNo, setLegNo] = useState<string>('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const selectedLeg = useMemo(
    () => legs.find((leg) => leg.no === legNo) ?? legs[0],
    [legs, legNo],
  );

  const vesselName = voyage?.vessel ?? t('noVessel', 'No vessel selected');
  const clientName = voyage?.client ?? '';
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

  return (
    <div className="fv-topnav" role="navigation" aria-label="Voyage">
      <div className="fv-topnav__left">
        <span className="fv-topnav__logo">
          <i className="fas fa-ship" aria-hidden="true" />
          STEM
        </span>
        <ModuleSelector />
        <div className="fv-topnav__vessel">
          <span className="fv-topnav__vessel-name">{vesselName}</span>
          {clientName && (
            <>
              <span className="fv-topnav__vessel-sep">/</span>
              <span className="fv-topnav__client">{clientName}</span>
            </>
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
              <>
                <span className="fv-topnav__voyage-route">
                  {selectedLeg.no} · {selectedLeg.from} → {selectedLeg.to}
                </span>
                <span className="fv-topnav__voyage-meta">
                  · {selectedLeg.type} · {selectedLeg.distanceNm} · {selectedLeg.status} · {t('etd', 'ETD')} {selectedLeg.etd}
                </span>
              </>
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
                    setLegNo(leg.no);
                    setDropdownOpen(false);
                  }}
                >
                  <div className="fv-topnav__voyage-item-route">
                    {leg.no} · {leg.from} → {leg.to}
                  </div>
                  <div className="fv-topnav__voyage-item-meta">
                    {leg.type} · {leg.distanceNm} · {leg.status} · {t('etd', 'ETD')} {leg.etd}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="fv-topnav__right">
        <button
          type="button"
          className="fv-topnav__icon-button"
          title={t('sendSystemEmail', 'Send system email')}
          aria-label={t('sendSystemEmail', 'Send system email')}
          onClick={todoHandler('System email dialog')}
        >
          <i className="fas fa-envelope" aria-hidden="true" />
        </button>

        <button
          type="button"
          className="fv-topnav__action-button"
          onClick={() => navigate('/voyage?edit=1')}
          disabled={!voyage}
        >
          <i className="fas fa-pen" aria-hidden="true" />
          <span>{t('editCurrentVoyage', 'Edit voyage')}</span>
        </button>

        <button
          type="button"
          className="fv-topnav__action-button fv-topnav__action-button--primary"
          onClick={() => navigate('/voyage/new')}
        >
          <i className="fas fa-plus" aria-hidden="true" />
          <span>{t('createNewVoyage', 'New voyage')}</span>
        </button>
      </div>
    </div>
  );
}
