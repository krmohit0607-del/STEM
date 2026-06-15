# FleetView WebApp (React) — Phase 1

Standalone React + Vite + TypeScript frontend that talks to the existing
ASP.NET Core 9.0 `FleetViewCore` backend via a dev-server proxy.

## Status

This is **Phase 1 only**. See [MIGRATION.md](./MIGRATION.md) for the full
inventory of what is implemented vs. stubbed vs. not yet ported.

What works in Phase 1:

- Layout shell + top side-nav buttons (user / search / notifications /
  support / API doc / status / to-do list) — IDs and click semantics
  match the legacy `Index.cshtml`.
- `FleetViewContext` ported as a React context (current user + roles +
  `isInRole`), populated from `GET /api/security/users/current`.
- API client with cookie-based auth and central error handling.
- `_l()` localization ported as a `useL()` hook.
- Leaflet map mounted via `react-leaflet` with the OSM base layer and a
  panel-layers placeholder. Ship markers, storm, weather velocity,
  static layers etc. are **not** ported yet — see MIGRATION.md.
- Portal selector stub.

## Running

You need the .NET backend running too — the React dev server proxies
`/api`, `/Account`, `/interimhub`, etc. to it.

```powershell
# 1) Start the backend (in another terminal, from the repo root):
dotnet run --project FleetViewCore/FleetViewCore.csproj

# 2) Start the React dev server:
cd FleetViewCore.WebApp
npm install
npm run dev
```

Then open http://localhost:5173. If you are not signed in, the proxy
will follow the existing redirect to the backend's `/Account/Login`
page; sign in there, return to `localhost:5173`, and the cookie will
flow through the proxy.

The backend URL the proxy targets is `https://localhost:5001` by
default. Override with the `FLEETVIEW_BACKEND_URL` env var.

## Production

Phase 1 only ships the dev configuration. Hosting decisions
(separate site, IIS rewrite, served from `wwwroot/react/`, etc.) are
deferred until more pages are ported.
