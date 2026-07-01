import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useL } from '../i18n/LocalizationProvider';

/**
 * Top navigation bar for the home page.
 *
 * LEFT side
 *   - Vessel name / Client (Owner / Charter)
 *   - Voyage selector dropdown — each option shows
 *     `Departure → Arrival · B/L · ETD`
 *
 * RIGHT side
 *   - Mail icon (send system email)            — TODO wire to EmailDialog API
 *   - "Edit current voyage" button              — TODO wire to VoyageDialog
 *   - "Create new voyage" button + Position     — TODO wire to VoyageDialog (new)
 *
 * The vessel + voyage data here is **stubbed** because the corresponding
 * endpoints (`/api/voyage/...`, `/api/vessel/...`) have not been factored
 * out for the React app yet. Replace `STUB_VESSEL` / `STUB_VOYAGES` with
 * real API data when the dependent endpoints are exposed.
 */

interface VoyageOption {
  id: number;
  number: string;
  departurePort: string;
  arrivalPort: string;
  blNumber: string;
  /** ISO-8601 string. */
  etd: string;
}

interface VesselSummary {
  name: string;
  clientName: string;
  /** Owner | Charterer | Manager — matches legacy `ClientType`. */
  clientType: 'Owner' | 'Charterer' | 'Manager';
}

const STUB_VESSEL: VesselSummary = {
  name: 'MV Atlantic Voyager',
  clientName: 'Acme Shipping',
  clientType: 'Owner',
};

const STUB_VOYAGES: VoyageOption[] = [
  {
    id: 1001,
    number: 'V-2026-014',
    departurePort: 'Singapore',
    arrivalPort: 'Rotterdam',
    blNumber: 'BL-88421',
    etd: '2026-06-12T08:00:00Z',
  },
  {
    id: 1000,
    number: 'V-2026-013',
    departurePort: 'Houston',
    arrivalPort: 'Singapore',
    blNumber: 'BL-88410',
    etd: '2026-05-22T14:00:00Z',
  },
  {
    id: 999,
    number: 'V-2026-012',
    departurePort: 'Rotterdam',
    arrivalPort: 'Houston',
    blNumber: 'BL-88401',
    etd: '2026-04-30T09:30:00Z',
  },
];

function formatEtd(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

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

  const [voyageId, setVoyageId] = useState<number>(STUB_VOYAGES[0]?.id ?? 0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const selectedVoyage = useMemo(
    () => STUB_VOYAGES.find((v) => v.id === voyageId) ?? STUB_VOYAGES[0],
    [voyageId],
  );

  // Close dropdown on outside-click.
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
        <div className="fv-topnav__vessel">
          <span className="fv-topnav__vessel-name">{STUB_VESSEL.name}</span>
          <span className="fv-topnav__vessel-sep">/</span>
          <span className="fv-topnav__client">
            {STUB_VESSEL.clientName}
            <span className="fv-topnav__client-type">
              ({t(STUB_VESSEL.clientType.toLowerCase(), STUB_VESSEL.clientType)})
            </span>
          </span>
        </div>

        <div className="fv-topnav__voyage" ref={wrapperRef}>
          <button
            type="button"
            className="fv-topnav__voyage-button"
            onClick={() => setDropdownOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={dropdownOpen}
          >
            {selectedVoyage ? (
              <>
                <span className="fv-topnav__voyage-route">
                  {selectedVoyage.departurePort} → {selectedVoyage.arrivalPort}
                </span>
                <span className="fv-topnav__voyage-meta">
                  · {selectedVoyage.blNumber} · {t('etd', 'ETD')} {formatEtd(selectedVoyage.etd)}
                </span>
              </>
            ) : (
              <span>{t('noVoyage', 'No voyage selected')}</span>
            )}
            <span className="fv-topnav__caret" aria-hidden="true">
              ▾
            </span>
          </button>

          {dropdownOpen && (
            <ul className="fv-topnav__voyage-list" role="listbox">
              {STUB_VOYAGES.map((v) => (
                <li
                  key={v.id}
                  role="option"
                  aria-selected={v.id === voyageId}
                  className={`fv-topnav__voyage-item${
                    v.id === voyageId ? ' fv-topnav__voyage-item--active' : ''
                  }`}
                  onClick={() => {
                    setVoyageId(v.id);
                    setDropdownOpen(false);
                  }}
                >
                  <div className="fv-topnav__voyage-item-route">
                    {v.departurePort} → {v.arrivalPort}
                  </div>
                  <div className="fv-topnav__voyage-item-meta">
                    {v.number} · {v.blNumber} · {t('etd', 'ETD')} {formatEtd(v.etd)}
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
          disabled={!selectedVoyage}
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
