import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { useL } from '../i18n/LocalizationProvider';
import { TracksheetGrid } from './TracksheetGrid';
import { RouteSimulatorPanel } from './RouteSimulatorPanel';
import { clearPanelViewRequest, useRequestedPanelView } from '../data/optimizationStore';

/**
 * Bottom panel — collapsible drawer at the bottom of the page that hosts
 * the Tracksheet grid and the Route Simulator. Tab buttons sit **above**
 * the panel so they remain visible even when the panel is collapsed:
 *   - Tracksheet: shows the tracksheet grid.
 *   - Route Simulator: shows the saved-routes list + route simulator.
 *
 * Matches the legacy `#tracksheetDiv` show/hide behavior from
 * `ManageDailyOperations.js` (toggle-tracksheet button).
 */

type PanelView = 'tracksheet' | 'simulator';

const HEIGHT_KEY = 'fv.bottomPanel.height';

/** The route editor page — the tracksheet opens by default only here. */
const ROUTE_EDITOR_PATH = '/route-explorer';
/** The interim dashboard page. */
const INTERIM_PATH = '/interim';

const MIN_HEIGHT = 160;
const MAX_HEIGHT = 600;
const DEFAULT_HEIGHT = 280;

function readNumber(key: string, fallback: number): number {
  try {
    const v = window.localStorage.getItem(key);
    if (v === null) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

export function BottomPanel() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const [view, setView] = useState<PanelView>('tracksheet');
  const location = useLocation();
  const isRouteEditor = location.pathname.startsWith(ROUTE_EDITOR_PATH);
  // Minimized by default on every page; re-applied on each navigation while
  // the user can still expand/collapse within a page.
  const [collapsed, setCollapsed] = useState(true);
  const [height, setHeight] = useState(() =>
    Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, readNumber(HEIGHT_KEY, DEFAULT_HEIGHT))),
  );

  useEffect(() => {
    setCollapsed(true);
  }, [location.pathname]);

  useEffect(() => {
    try {
      window.localStorage.setItem(HEIGHT_KEY, String(height));
    } catch {
      /* ignore */
    }
  }, [height]);

  // Drag-to-resize: pointer events on the resizer.
  const onResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (collapsed) return;
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = height;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const delta = startY - ev.clientY;
      setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startHeight + delta)));
    };
    const onUp = (ev: PointerEvent) => {
      target.releasePointerCapture(ev.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleTracksheetClick = () => {
    if (view !== 'tracksheet') {
      setView('tracksheet');
      setCollapsed(false);
      return;
    }
    setCollapsed((prev) => !prev);
  };

  const handleSimulatorClick = () => {
    if (view !== 'simulator') {
      setView('simulator');
      setCollapsed(false);
      return;
    }
    setCollapsed((prev) => !prev);
  };

  // The route editor's Optimize run (or "Follow route") can ask the drawer to
  // open a specific tab. The optimized routes now live in the Route Simulator,
  // so any 'optimization' request opens the simulator.
  const requestedView = useRequestedPanelView();
  useEffect(() => {
    if (!requestedView) return;
    setView(requestedView === 'optimization' ? 'simulator' : requestedView);
    setCollapsed(false);
    clearPanelViewRequest();
  }, [requestedView]);

  // The bottom (tracksheet) panel only appears on the route editor and the
  // interim dashboard; it is hidden on every other page.
  const visible =
    isRouteEditor || location.pathname.startsWith(INTERIM_PATH);
  if (!visible) return null;

  return (
    <div className="fv-bottom-panel" style={{ height: collapsed ? 36 : 36 + height }}>
      <div className="fv-bottom-panel__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={!collapsed && view === 'tracksheet'}
          className={`fv-bottom-panel__tab${
            !collapsed && view === 'tracksheet' ? ' fv-bottom-panel__tab--active' : ''
          }`}
          onClick={handleTracksheetClick}
        >
          <i className="fas fa-table" aria-hidden="true" />
          <span>{t('tracksheet', 'Tracksheet')}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={!collapsed && view === 'simulator'}
          className={`fv-bottom-panel__tab${
            !collapsed && view === 'simulator' ? ' fv-bottom-panel__tab--active' : ''
          }`}
          onClick={handleSimulatorClick}
          title={t('routeSimulator', 'Route Simulator')}
        >
          <i className="fas fa-route" aria-hidden="true" />
          <span>{t('routeSimulator', 'Route Simulator')}</span>
        </button>

        <button
          type="button"
          className="fv-bottom-panel__toggle"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? t('expand', 'Expand') : t('collapse', 'Collapse')}
          title={collapsed ? t('expand', 'Expand') : t('collapse', 'Collapse')}
        >
          <i className={`fas fa-chevron-${collapsed ? 'up' : 'down'}`} aria-hidden="true" />
        </button>
      </div>

      {!collapsed && (
        <>
          <div
            className="fv-bottom-panel__resizer"
            onPointerDown={onResizePointerDown}
            role="separator"
            aria-orientation="horizontal"
          />
          <div className="fv-bottom-panel__body" style={{ height }}>
            {view === 'simulator' ? <RouteSimulatorPanel /> : <TracksheetGrid />}
          </div>
        </>
      )}
    </div>
  );
}
