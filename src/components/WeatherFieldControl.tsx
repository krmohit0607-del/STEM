import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMap } from 'react-leaflet';
import L, { type ControlPosition } from 'leaflet';

import { FIELD_FACTORS, getFieldFactor } from '../data/weatherField';
import { MAX_FORECAST_HOURS, MIN_FORECAST_HOURS } from '../data/openMeteo';
import { useSimWeatherHour } from '../data/routeSimulatorStore';
import { WeatherFieldLayer } from './WeatherFieldLayer';
import { MAP_CONTROL_OPEN_EVENT, notifyMapControlOpen } from './mapControlEvents';

/**
 * Drop-in map control for the MarineTraffic-style weather field. Place it
 * as a child of any `<MapContainer>`:
 *
 *   <MapContainer ...>
 *     <WeatherFieldControl position="topright" />
 *   </MapContainer>
 *
 * The on/off state and the chosen weather factor are shared across every
 * map via `localStorage` (and a lightweight event bus so multiple maps on
 * one screen stay in sync), exactly like the area-constraints control.
 */

const ON_KEY = 'fv.map.weatherField.on';
const FACTORS_KEY = 'fv.map.weatherField.factors';
const HOUR_KEY = 'fv.map.weatherField.hour';
const EVENT = 'fv-weatherfield-change';

/** Playback speed multipliers for the bottom timeline's play button. */
const SPEED_OPTIONS = [1, 2, 4, 8];

/** "View old weather data" window widths (days) the range selector offers. */
const RANGE_DAY_OPTIONS = [1, 3, 7, 10];

function readOn(): boolean {
  try {
    return localStorage.getItem(ON_KEY) === '1';
  } catch {
    return false;
  }
}

function readFactors(): string[] {
  try {
    const raw = localStorage.getItem(FACTORS_KEY);
    if (raw) {
      const ids = (JSON.parse(raw) as string[]).filter((id) => getFieldFactor(id));
      if (ids.length) return ids;
    }
    // Migrate the old single-factor key if present.
    const legacy = localStorage.getItem('fv.map.weatherField.factor');
    if (legacy && getFieldFactor(legacy)) return [legacy];
  } catch {
    /* ignore */
  }
  return [FIELD_FACTORS[0].id];
}

function broadcast() {
  window.dispatchEvent(new Event(EVENT));
}

function readHour(): number {
  try {
    const n = Number(localStorage.getItem(HOUR_KEY));
    return Number.isFinite(n) ? Math.max(MIN_FORECAST_HOURS, Math.min(MAX_FORECAST_HOURS, n)) : 0;
  } catch {
    return 0;
  }
}

/** Label like "Now" or "Tue 14:00" for an hour offset from now. */
function hourLabel(offset: number): string {
  if (offset <= 0) return 'Now';
  const d = new Date(Date.now() + offset * 3600_000);
  return d.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

/** UTC time-of-day for the bottom timeline's floating bubble, e.g. "15:00 UTC". */
function utcTimeLabel(offset: number): string {
  const d = new Date(Date.now() + offset * 3600_000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm} UTC`;
}

/** UTC day tick label for the bottom timeline, e.g. "Sun 4". */
function utcDayLabel(offset: number): string {
  const d = new Date(Date.now() + offset * 3600_000);
  return d.toLocaleString('en-US', { timeZone: 'UTC', weekday: 'short', day: 'numeric' });
}

/** UTC calendar date (YYYY-MM-DD) for an hour offset — used as the "jump to
 *  date" picker's value/min/max, so typing/picking a date and this slider
 *  always agree on what day is showing. */
function isoDateFor(offset: number): string {
  return new Date(Date.now() + offset * 3600_000).toISOString().slice(0, 10);
}

/** Renders React children into a real Leaflet control container. */
function ControlPortal({
  position,
  children,
}: {
  position: ControlPosition;
  children: React.ReactNode;
}) {
  const map = useMap();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const ctrl = new L.Control({ position });
    ctrl.onAdd = () => {
      const div = L.DomUtil.create('div', 'fv-wf-control');
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      setContainer(div);
      return div;
    };
    ctrl.addTo(map);
    return () => {
      ctrl.remove();
    };
  }, [map, position]);

  return container ? createPortal(children, container) : null;
}

/** Renders React children into a plain full-width div pinned to the bottom
 *  of the map's own container (not a corner-anchored Leaflet control, since
 *  the timeline bar spans the whole width). */
function BottomBarPortal({ children }: { children: React.ReactNode }) {
  const map = useMap();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const div = L.DomUtil.create('div', 'fv-wf-timeline-wrap');
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
    map.getContainer().appendChild(div);
    setContainer(div);
    return () => {
      div.remove();
    };
  }, [map]);

  return container ? createPortal(children, container) : null;
}

/** Renders React children into a plain div pinned to the top-right corner of
 *  the map's own container — deliberately NOT one of the stacked Leaflet
 *  corner controls (so it can't get reordered/pushed around by whichever
 *  other icon controls a given page happens to mount; it always sits above
 *  the icon stack, flush with the map's top edge). */
function TopRightPortal({ children }: { children: React.ReactNode }) {
  const map = useMap();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const div = L.DomUtil.create('div', 'fv-wf-live-status');
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
    map.getContainer().appendChild(div);
    setContainer(div);
    return () => {
      div.remove();
    };
  }, [map]);

  return container ? createPortal(children, container) : null;
}

export function WeatherFieldControl({
  position = 'topright',
}: {
  position?: ControlPosition;
} = {}) {
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState<boolean>(() => readOn());
  const [factorIds, setFactorIds] = useState<string[]>(() => readFactors());
  const [hour, setHour] = useState<number>(() => readHour());

  useEffect(() => {
    const closeWhenAnotherOpens = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== 'weather') setOpen(false);
    };
    window.addEventListener(MAP_CONTROL_OPEN_EVENT, closeWhenAnotherOpens);
    return () => window.removeEventListener(MAP_CONTROL_OPEN_EVENT, closeWhenAnotherOpens);
  }, []);

  // While a route simulation is playing it drives the forecast time so the
  // on-map weather advances in step with the vessel; when idle (null) the
  // manual time slider below takes over again.
  const simHour = useSimWeatherHour();
  const effectiveHour = simHour ?? hour;

  // Keep every mounted control in sync via the shared event + storage.
  useEffect(() => {
    const sync = () => {
      setOn(readOn());
      setFactorIds(readFactors());
      setHour(readHour());
    };
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const updateOn = (next: boolean) => {
    setOn(next);
    try {
      localStorage.setItem(ON_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
    broadcast();
  };

  const persistFactors = (ids: string[]) => {
    setFactorIds(ids);
    try {
      localStorage.setItem(FACTORS_KEY, JSON.stringify(ids));
    } catch {
      /* ignore */
    }
    broadcast();
  };

  const toggleFactor = (id: string) => {
    const next = factorIds.includes(id)
      ? factorIds.filter((x) => x !== id)
      : [...factorIds, id];
    persistFactors(next);
    if (next.length && !on) updateOn(true);
  };

  const persistHour = (h: number) => {
    setHour(h);
    try {
      localStorage.setItem(HOUR_KEY, String(h));
    } catch {
      /* ignore */
    }
    broadcast();
  };

  // Bottom timeline "range" window — how many days of ticks are visible at
  // once, and where that window currently starts (hours, can be negative =
  // past). The "<"/">" arrows page through time by exactly one window width,
  // e.g. a 1-day range shifts to the next/previous day on each click.
  const [rangeDays, setRangeDays] = useState(7);
  const [windowStart, setWindowStart] = useState(0);
  const windowEnd = windowStart + rangeDays * 24;

  const changeRange = (days: number) => {
    setRangeDays(days);
    const span = days * 24;
    const start = Math.max(MIN_FORECAST_HOURS, Math.min(MAX_FORECAST_HOURS - span, hour - Math.floor(span / 3)));
    setWindowStart(start);
  };

  const shiftWindow = (dir: -1 | 1) => {
    const span = rangeDays * 24;
    const next = Math.max(MIN_FORECAST_HOURS, Math.min(MAX_FORECAST_HOURS - span, windowStart + dir * span));
    setWindowStart(next);
    if (hour < next || hour > next + span) {
      setPlaying(false);
      persistHour(next);
    }
  };

  /** Jump straight to an arbitrary calendar date (UTC) — e.g. a month or a
   *  year ago — keeping the current time-of-day and re-centring the window
   *  (at the current range width) on that date. Old dates are served from
   *  the backend's persistent weather tile cache via `MIN_FORECAST_HOURS`. */
  const jumpToDate = (isoDate: string) => {
    if (!isoDate) return;
    const [y, m, d] = isoDate.split('-').map(Number);
    if (!y || !m || !d) return;
    const current = new Date(Date.now() + hour * 3600_000);
    const target = Date.UTC(y, m - 1, d, current.getUTCHours(), current.getUTCMinutes());
    const targetHour = Math.max(MIN_FORECAST_HOURS, Math.min(MAX_FORECAST_HOURS, (target - Date.now()) / 3600_000));
    setPlaying(false);
    persistHour(targetHour);
    const span = rangeDays * 24;
    const start = Math.max(MIN_FORECAST_HOURS, Math.min(MAX_FORECAST_HOURS - span, targetHour - span / 2));
    setWindowStart(start);
  };

  // Bottom timeline "play" — auto-advances the forecast hour (at the chosen
  // speed multiplier) so the weather visibly moves; loops back to the start
  // of the current window once it reaches the end. Ticks run far more often
  // than the hour step changes so playback — and manual scrubbing, via the
  // matching fractional slider `step` — feels continuous rather than
  // jumping once per whole hour.
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(0);
  const speed = SPEED_OPTIONS[speedIdx];
  const TICK_MS = 50;
  const HOURS_PER_SEC = 1000 / 450; // matches the previous 1h/450ms base rate
  const hourRef = useRef(hour);
  hourRef.current = hour;
  const windowRef = useRef({ start: windowStart, end: windowEnd });
  windowRef.current = { start: windowStart, end: windowEnd };

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const { start, end } = windowRef.current;
      const step = HOURS_PER_SEC * speed * (TICK_MS / 1000);
      const next = hourRef.current >= end ? start : hourRef.current + step;
      persistHour(next);
    }, TICK_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed]);

  // A route simulation playing takes over the forecast time (effectiveHour);
  // stop the timeline's own auto-play so the two don't fight over the hour.
  useEffect(() => {
    if (simHour != null) setPlaying(false);
  }, [simHour]);

  // "Live" means the selected forecast time is a genuine future forecast
  // (within `MAX_FORECAST_HOURS`); anything before now is "Historical" (the
  // date-range viewer), regardless of whether that lookup actually
  // succeeded — a plain date-cutoff check, not tied to any one viewport's
  // fetch-in-progress state.
  const primaryLive = effectiveHour >= 0 && effectiveHour <= MAX_FORECAST_HOURS;

  // The first selected factor paints the colour field; the legend follows it.
  const primary = getFieldFactor(factorIds[0]) ?? FIELD_FACTORS[0];

  return (
    <>
      {on &&
        factorIds.map((id, i) => (
          <WeatherFieldLayer key={id} factorId={id} showField={i === 0} hour={effectiveHour} />
        ))}
      <ControlPortal position={position}>
        <button
          type="button"
          className={`fv-wf-control__btn${on ? ' fv-wf-control__btn--on' : ''}`}
          title="Weather layers"
          aria-label="Weather layers"
          aria-expanded={open}
          onClick={() => {
            setOpen((current) => {
              const next = !current;
              if (next) notifyMapControlOpen('weather');
              return next;
            });
          }}
        >
          <i className="fas fa-cloud-sun" aria-hidden="true" />
        </button>

        {open && (
          <div className="fv-wf-control__panel" role="menu">
            <label className="fv-wf-control__head">
              <span>Weather Base Layer</span>
              <input
                type="checkbox"
                checked={on}
                onChange={(e) => updateOn(e.target.checked)}
              />
            </label>

            <div className="fv-wf-control__list">
              {FIELD_FACTORS.map((f) => (
                <label key={f.id} className="fv-wf-control__row">
                  <input
                    type="checkbox"
                    checked={factorIds.includes(f.id)}
                    onChange={() => toggleFactor(f.id)}
                  />
                  <i className={`fas ${f.icon}`} aria-hidden="true" />
                  <span className="fv-wf-control__label">{f.label}</span>
                  {f.directional && (
                    <i
                      className="fas fa-location-arrow fv-wf-control__dir"
                      aria-hidden="true"
                      title="Shows direction & magnitude"
                    />
                  )}
                </label>
              ))}
            </div>

            <div className="fv-wf-control__time">
              <div className="fv-wf-control__time-head">
                <span>Forecast</span>
                <span className="fv-wf-control__time-val">{hourLabel(hour)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={MAX_FORECAST_HOURS}
                step={1}
                value={hour}
                onChange={(e) => persistHour(Number(e.target.value))}
                className="fv-wf-control__time-slider"
              />
            </div>

            <div className="fv-wf-control__legend">
              <div className="fv-wf-control__legend-title">{primary.label}</div>
              <div
                className="fv-wf-control__bar"
                style={{
                  background: `linear-gradient(to right, ${primary.stops
                    .map(([p, c]) => `${c} ${Math.round(p * 100)}%`)
                    .join(', ')})`,
                }}
              />
              <div className="fv-wf-control__ticks">
                {primary.legend.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </ControlPortal>

      {on && (
        <TopRightPortal>
          <div
            className={`fv-wf-live-status__pill${primaryLive ? '' : ' fv-wf-live-status__pill--hist'}`}
            title={
              primaryLive
                ? 'Within the live forecast window'
                : 'Beyond the live forecast window — showing historical/modelled data'
            }
          >
            <span className="fv-wf-live-status__dot" />
            <span>{primaryLive ? 'Live' : 'Historical'}</span>
          </div>
        </TopRightPortal>
      )}

      {on && (
        <BottomBarPortal>
          <div className="fv-wf-timeline">
            <button
              type="button"
              className="fv-wf-timeline__play"
              title={playing ? 'Pause' : 'Play'}
              aria-label={playing ? 'Pause forecast playback' : 'Play forecast playback'}
              onClick={() => setPlaying((p) => !p)}
            >
              <i className={`fas ${playing ? 'fa-pause' : 'fa-play'}`} aria-hidden="true" />
            </button>

            <button
              type="button"
              className="fv-wf-timeline__speed"
              title="Playback speed"
              aria-label="Playback speed"
              onClick={() => setSpeedIdx((i) => (i + 1) % SPEED_OPTIONS.length)}
            >
              {speed}x
            </button>

            <button
              type="button"
              className="fv-wf-timeline__shift"
              title={`Back ${rangeDays} day${rangeDays > 1 ? 's' : ''}`}
              aria-label="Shift range back"
              onClick={() => shiftWindow(-1)}
            >
              <i className="fas fa-chevron-left" aria-hidden="true" />
            </button>

            <div className="fv-wf-timeline__track">
              <div
                className="fv-wf-timeline__bubble"
                style={{ left: `${((Math.max(windowStart, Math.min(windowEnd, hour)) - windowStart) / (rangeDays * 24)) * 100}%` }}
              >
                {utcTimeLabel(hour)}
              </div>
              <input
                type="range"
                min={windowStart}
                max={windowEnd}
                step={0.1}
                value={Math.max(windowStart, Math.min(windowEnd, hour))}
                onChange={(e) => {
                  setPlaying(false);
                  persistHour(Number(e.target.value));
                }}
                className="fv-wf-timeline__range"
                aria-label="Forecast time (UTC)"
              />
              <div className="fv-wf-timeline__days">
                {Array.from({ length: rangeDays + 1 }, (_, i) => windowStart + i * 24).map((offset) => (
                  <span
                    key={offset}
                    className="fv-wf-timeline__day"
                    style={{ left: `${((offset - windowStart) / (rangeDays * 24)) * 100}%` }}
                  >
                    {offset === 0 ? 'Now' : utcDayLabel(offset)}
                  </span>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="fv-wf-timeline__shift"
              title={`Forward ${rangeDays} day${rangeDays > 1 ? 's' : ''}`}
              aria-label="Shift range forward"
              onClick={() => shiftWindow(1)}
            >
              <i className="fas fa-chevron-right" aria-hidden="true" />
            </button>

            <select
              className="fv-wf-timeline__rangesel"
              value={rangeDays}
              aria-label="Date range to view"
              onChange={(e) => changeRange(Number(e.target.value))}
            >
              {RANGE_DAY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}d
                </option>
              ))}
            </select>

            <input
              type="date"
              className="fv-wf-timeline__datepick"
              title="View weather for a specific date (up to a year old, from the stored cache)"
              aria-label="Jump to date"
              value={isoDateFor(hour)}
              min={isoDateFor(MIN_FORECAST_HOURS)}
              max={isoDateFor(MAX_FORECAST_HOURS)}
              onChange={(e) => jumpToDate(e.target.value)}
            />
          </div>
        </BottomBarPortal>
      )}
    </>
  );
}
