import { useEffect, useRef, useState } from 'react';

import { useWeather } from '../context/WeatherContext';

/**
 * Floating weather control for any map. Drop it as a sibling of the
 * `<MapContainer>` inside the map's (positioned) wrapper.
 *
 * Provides the master on/off switch for the live Storm Glass overlay, a
 * checklist to choose which weather factors are drawn, and an input for
 * the user's Storm Glass API key. All settings are shared app-wide via
 * {@link useWeather}, so changing them here updates every map at once.
 */
export function WeatherControls() {
  const {
    enabled,
    toggleEnabled,
    allFactors,
    selectedIds,
    toggleFactor,
    apiKey,
    setApiKey,
  } = useWeather();

  const [open, setOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState(apiKey);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setKeyDraft(apiKey), [apiKey]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const hasKey = apiKey.length > 0;
  const active = enabled && hasKey;

  return (
    <div className="fv-weather-control" ref={rootRef}>
      <button
        type="button"
        className={`fv-weather-control__btn${active ? ' fv-weather-control__btn--on' : ''}`}
        title="Marine weather (Storm Glass)"
        aria-label="Marine weather settings"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <i className="fas fa-cloud-sun-rain" aria-hidden="true" />
        {active && selectedIds.length > 0 && (
          <span className="fv-weather-control__badge">{selectedIds.length}</span>
        )}
      </button>

      {open && (
        <div className="fv-weather-control__panel" role="menu">
          <div className="fv-weather-control__head">
            <span>
              <i className="fas fa-cloud-sun-rain" aria-hidden="true" /> Marine weather
            </span>
            <label className="fv-weather-control__switch" title="Show live weather on all maps">
              <input
                type="checkbox"
                checked={enabled}
                onChange={toggleEnabled}
              />
              <span className="fv-weather-control__slider" />
            </label>
          </div>

          <div className="fv-weather-control__source">
            Live data from Storm Glass Marine Weather API.
          </div>

          <div className="fv-weather-control__key">
            <label htmlFor="fv-weather-key">API key</label>
            <div className="fv-weather-control__key-row">
              <input
                id="fv-weather-key"
                type="password"
                placeholder="Paste Storm Glass API key"
                value={keyDraft}
                autoComplete="off"
                onChange={(e) => setKeyDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setApiKey(keyDraft);
                }}
              />
              <button
                type="button"
                className="fv-weather-control__save"
                onClick={() => setApiKey(keyDraft)}
                disabled={keyDraft.trim() === apiKey}
              >
                Save
              </button>
            </div>
            <div
              className={`fv-weather-control__status${
                hasKey ? ' fv-weather-control__status--ok' : ''
              }`}
            >
              <i
                className={`fas ${hasKey ? 'fa-circle-check' : 'fa-circle-exclamation'}`}
                aria-hidden="true"
              />{' '}
              {hasKey
                ? 'API key saved.'
                : 'Add a free key from stormglass.io to enable live weather.'}
            </div>
          </div>

          <div className="fv-weather-control__factors-head">
            Factors to show on map
          </div>
          <ul className="fv-weather-control__list">
            {allFactors.map((f) => {
              const on = selectedIds.includes(f.id);
              return (
                <li
                  key={f.id}
                  className={`fv-weather-control__item${
                    on ? ' fv-weather-control__item--on' : ''
                  }`}
                  role="menuitemcheckbox"
                  aria-checked={on}
                  onClick={() => toggleFactor(f.id)}
                >
                  <i
                    className={`fas ${on ? 'fa-square-check' : 'fa-square'} fv-weather-control__check`}
                    aria-hidden="true"
                  />
                  <i className={`fas ${f.icon} fv-weather-control__factor-icon`} aria-hidden="true" />
                  <span>{f.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
