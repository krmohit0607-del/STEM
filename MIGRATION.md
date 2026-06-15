# FleetView React Migration Plan

## Phase status

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Standalone Vite + React + TS shell, dev-proxy auth, sidenav, FleetViewContext, localization, base Leaflet map | **Done (this PR)** |
| 2 | Notifications + SignalR client (`/interimhub`) | TODO |
| 3 | Map: static layers, ship markers, time dimension, panel-layers control | TODO |
| 4 | Portal: Voyages grid + filters | TODO |
| 5 | Voyage dialog (deep-link `?openVoyageId=`) | TODO |
| 6 | Remaining portals: Vessels, Clients, Employees, Reports, Admin | TODO |
| 7 | Dialog framework (FleetViewDialog/Email/Yes-No/Loader/etc.) | TODO |
| 8 | Map plugins: storm, weather velocity, ruler, screenshoter, Beaufort | TODO |
| 9 | Daily Operations / TrackSheet | TODO |
| 10 | Production hosting decision (separate site vs. served from `wwwroot/`) | TODO |

## What Phase 1 actually ships

### React side (`FleetViewCore.WebApp/`)

- Vite dev server on `http://localhost:5173` with proxies for `/api`,
  `/Account`, `/Home`, `/Search`, `/Admin`, `/Report`, `/swagger`,
  `/MicrosoftIdentity`, `/signin-microsoft`, and `/interimhub` (WS)
  pointing at `https://localhost:5001` (override with
  `FLEETVIEW_BACKEND_URL`).
- `api` client (`src/api/client.ts`) — fetch wrapper with
  `credentials: 'include'`, JSON content negotiation, and an `ApiError`
  type. Retry / progressive paging / cancel-password from the legacy
  `Communication.js` are **not** ported.
- `FleetViewProvider` (`src/context/FleetViewContext.tsx`) — calls
  `GET /api/security/users/current`, exposes `user`, `roles`,
  `currentPortal`, `isInRole(csv)`, `refresh()`, `isLoading`, `error`.
- `LocalizationProvider` (`src/i18n/LocalizationProvider.tsx`) — calls
  `GET /api/cultureinfo/currentlanguage` and
  `GET /api/cultureinfo/locale/{lang}`. Exposes `useL()` for `_l(key)`
  semantics.
- `Layout`, `SideNav`, `PortalSelector`, `MapView` components.
- Base Leaflet map via `react-leaflet` with OSM + Esri Ocean base
  layers and a `LayersControl`.

### .NET side

No backend changes were required. Existing endpoints reused:

- `GET /api/security/users/current` — current authenticated user DTO.
- `GET /api/cultureinfo/currentlanguage` — current locale.
- `GET /api/cultureinfo/locale/{lang}` — translation dictionary.

CORS is **not** changed because the Vite proxy keeps everything
same-origin in dev. A production hosting decision will require either:

1. Building the React app into `FleetViewCore/wwwroot/react/` and
   replacing `Index.cshtml` with a thin Razor view that mounts the
   bundle (recommended — same-origin, same cookie), **or**
2. Hosting the React app on a separate origin and adding a real CORS
   policy with credentials + token-based auth (much more work).

## What is explicitly **not** ported in Phase 1

The following live in the legacy app and are **not** available in the
React shell. They are wired as `console.warn` no-ops or omitted entirely.

### Globals / engine

- `FleetViewContext` fields beyond user/roles/portal: `map`,
  `tempPin`/`permPin`, `compare`, `progressiveAjaxBuffer`,
  `popupManager`, `interimGrid`, `dailyFleetPage`,
  `clientCurrentView`, `userConfig`, `printMode`, `insideChina`.
- `Communication.progressiveRead`, retry/back-off, cancel-password
  prompt, `ContextId` correlation, `TimeoutList`.
- `MimeTypes`, `Coordinate`, `DataTable`, `DateTime` helpers.

### UI

- All sidenav handlers except Search and API doc are stubs:
  Notifications (`#notification-main-menu`), Support, Status,
  To-do list (`#Listnotification-main-menu`), Account Info dialog,
  impersonation submenu.
- Portal selector content. Once a portal is selected nothing renders
  beneath it. The legacy app delegates to `ManageVoyage`,
  `ManageVessel`, `ManageClient`, `ManageSecurity`,
  `ManageDailyOperations`, `ManageAdmin`, etc. — none ported.
- The "auto-open VoyageDialog" deep-link logic
  (`?openVoyageId=&openOrderId=`) at the bottom of `Index.cshtml`.

### Map

`MapManager.js`, `MapPopup.js`, `StormMap.js`, `WMSLayer.js`, plus the
following Leaflet plugins/scripts loaded by `Index.cshtml`:

- `Leaflet.Graticule`, `Leaflet.Coordinates`, `Leaflet.Dialog`
- `esri-leaflet`, `streamLayer`, cached tile layer, ship marker,
  `leaflet-velocity`, `leaflet.timedimension`, `leaflet.TextBox`,
  `leaflet-panel-layers`, `Map.SelectArea`,
  `Leaflet.WMS.Legend`, `MapRuler`, `BeaufortConverter`,
  `BeaufortMarker`, `leaflet-control-topcenter`,
  `leaflet-simple-map-screenshoter`, ChineseTmsProviders, shp.js.
- `TimeZoneLayer`, `StaticLayers`, `LoadLinesStaticLayer`,
  `GeoJSON.js` from `js/TrueNorth/Map`.

### Real-time

- SignalR hub client for `/interimhub` (`@microsoft/signalr` is in
  `dependencies` but **not** wired up). All notification bubbles are
  cosmetic placeholders.

### Dialogs / dialog framework

`FleetViewDialog`, `EmailDialog`, `ErrorHandler`, `InfoDialog`,
`Popupizer`, `LoaderDialog`, `ResetPasswordDialog`,
`StaticElementListDialog`, `UrlDialog`, `YesNoDialog`,
`HistoryDialog`, `ArchiveHistoryDialog`, `AdminCodeDialog`,
`BRTDialog`, plus all per-feature dialogs under `Client/Dialog/`,
`Vessel/Dialog/`, `Administration/Dialog/`,
`DailyOperations/Dialog/`, `Security/Dialog/`, and the noon-report
dialog set (`Notification/NoonReport*` + `NoonReports/*`).

### Reports / automation / noon reports

Everything under `wwwroot/js/TrueNorth/Notification/Automation/`,
`Notification/NoonReport/`, `Notification/NoonReports/`, `Reports/`,
plus `ReportSchedule`, `PortConsumption`, `WeatherForecast`.

### Other modules

`ManageClient`, `ManageVessel`, `ManagePassageRepo`, `ManageSecurity`,
`ManageDailyOperations`, `ManageAdmin`, `TrackSheetProcessor`,
`ValidationEngine`, plus all `Administration/Dialog/Admin*`.

### CSS

Phase 1 ships a small custom stylesheet (`src/styles/index.css`). The
~30 legacy stylesheets in `FleetViewCore/wwwroot/css/` are **not**
imported because they target jQuery UI / Tabulator / Select2 widgets
that don't exist here yet. They will be reintroduced or replaced as
each feature is ported.

## How to extend

When porting a feature in a follow-up phase:

1. Add a typed wrapper in `src/api/<feature>.ts` if the endpoint isn't
   trivial.
2. Build the React component(s) under `src/components/<feature>/` or
   `src/portals/<portal>/`.
3. If the component needs the global FleetView state, use
   `useFleetView()`. For translations, `useL()`.
4. For map plugins, render children inside `<MapContainer>` and use
   `useMap()` from `react-leaflet` to grab the Leaflet instance.
5. Update this file: move the relevant bullet from the "not ported"
   section to a "Done in Phase N" entry, and add the new files to the
   structure list above.

## Known limitations / risks

- **Authentication**: in dev the React app relies on the .NET cookie
  flowing through the Vite proxy. A 401 from the API surfaces as the
  unauthenticated screen; the user must sign in via the legacy
  `/Account/Login` page.
- **Legacy global `context`**: nothing in Phase 1 sets `window.context`.
  Any leftover legacy script that expects it will fail; this is fine
  because the React shell doesn't load any legacy scripts.
- **Member casing**: the .NET API uses `UseMemberCasing()`, so
  responses preserve C# `PascalCase`. The TS `CurrentUser` /
  `AuthenticatedUserDto` types reflect that.
