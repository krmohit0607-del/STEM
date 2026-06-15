import { useFleetView } from '../context/FleetViewContext';
import { useL } from '../i18n/LocalizationProvider';

/**
 * Stub of the legacy `PortalMenu.open(menuList)` dropdown. The actual
 * portal list is computed server-side from the user's roles inside
 * `MainMenu.js` / `PortalMenu.js`; that endpoint is not factored out
 * yet. Phase 1 hard-codes the canonical labels so the layout slot is
 * visible — the *content* of each portal is not ported and the
 * selector is intentionally a no-op.
 */
const PORTALS = [
  'Voyages',
  'Vessels',
  'Clients',
  'Employees',
  'Reports',
  'Administration',
] as const;

export function PortalSelector() {
  const { currentPortal, setCurrentPortal, isInRole } = useFleetView();
  const l = useL();

  // The legacy app filters Vessels/Employees out for some non-admin roles.
  // Replicate the broadest case here: admins/managers see everything,
  // others see only Voyages + Reports until per-portal logic is ported.
  const visiblePortals = isInRole('Manager, Operations Manager, Administrator')
    ? PORTALS
    : (['Voyages', 'Reports'] as const);

  return (
    <div className="fv-portal-selector">
      <label htmlFor="portalList" className="fv-portal-selector__label">
        {l('portal')}
      </label>
      <select
        id="portalList"
        value={Math.min(currentPortal, visiblePortals.length - 1)}
        onChange={(e) => setCurrentPortal(Number(e.target.value))}
      >
        {visiblePortals.map((label, index) => (
          <option key={label} value={index}>
            {l(label.toLowerCase())}
          </option>
        ))}
      </select>
      <p className="fv-portal-selector__hint">
        Portal contents (grids, tracksheets, dialogs) are not ported yet —
        see <code>MIGRATION.md</code>.
      </p>
    </div>
  );
}
