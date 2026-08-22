import { Fragment, useEffect, useMemo, useState } from 'react';
import { Circle, MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import L from 'leaflet';

import { resolveWorldPort, useWorldPorts, type WorldPort } from '../data/ports';
import { useSavedPorts } from '../data/savedPorts';
import { setActiveSimRoute } from '../data/routeSimulatorStore';
import { AreaConstraintsControl } from './AreaConstraintsControl';
import { WeatherFieldControl } from './WeatherFieldControl';
import { WeatherPointControl } from './WeatherPointControl';
import { MapLayersControl, readMapLayerId, type MapLayerId } from './MapLayersControl';
import { PortsControl, RulerControl } from './MapToolsControl';
import { loadSavedPassages, type SavedPassage } from '../data/savedPassages';

interface RouteOption {
  id: string;
  from: WorldPort;
  to: WorldPort;
  distanceNm: number;
  source: 'Exact match' | 'Nearby port option';
  path?: [number, number][];
  passage?: SavedPassage;
}

const RADIUS_STEPS = [0, 100, 250, 500, 750, 1000];

function distanceNm(from: WorldPort, to: WorldPort): number {
  const rad = Math.PI / 180;
  const dLat = (to.lat - from.lat) * rad;
  const dLon = (to.lon - from.lon) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(from.lat * rad) * Math.cos(to.lat * rad) * Math.sin(dLon / 2) ** 2;
  return Math.round(3440.065 * 2 * Math.asin(Math.min(1, Math.sqrt(a))));
}

function pointDistanceNm(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLon = (b[1] - a[1]) * rad;
  const ca = Math.cos(a[0] * rad);
  const cb = Math.cos(b[0] * rad);
  const h = Math.sin(dLat / 2) ** 2 + ca * cb * Math.sin(dLon / 2) ** 2;
  return 3440.065 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function pathDistanceNm(path: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) total += pointDistanceNm(path[i - 1], path[i]);
  return Math.round(total);
}

let systemPortIconCache: L.DivIcon | null = null;
function systemPortIcon(): L.DivIcon {
  if (systemPortIconCache) return systemPortIconCache;
  systemPortIconCache = L.divIcon({
    className: 'fv-port-icon-wrap',
    iconSize: [20, 22],
    iconAnchor: [10, 20],
    html: '<span class="fv-port-icon"><i class="fas fa-location-dot" aria-hidden="true"></i></span>',
  });
  return systemPortIconCache;
}

function matches(value: string, ports: WorldPort[]): WorldPort[] {
  const exact = resolveWorldPort(value, ports);
  if (exact) return [exact];
  const query = value.trim().toLowerCase();
  return query ? ports.filter((port) => `${port.name} ${port.country} ${port.code}`.toLowerCase().includes(query)) : [];
}

export function RouteExplorerSearchPage() {
  const ports = useWorldPorts();
  const savedPorts = useSavedPorts();
  const [departure, setDeparture] = useState('');
  const [arrival, setArrival] = useState('');
  const [activeInput, setActiveInput] = useState<'departure' | 'arrival'>('departure');
  const [radius, setRadius] = useState(250);
  const [nearby, setNearby] = useState(true);
  const [results, setResults] = useState<RouteOption[]>([]);
  const [message, setMessage] = useState('');
  const [savedPassageMatched, setSavedPassageMatched] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [baseLayer, setBaseLayer] = useState<MapLayerId>(() => readMapLayerId());
  const [savedPassages, setSavedPassages] = useState<SavedPassage[]>(() => loadSavedPassages());

  useEffect(() => {
    const refresh = () => setSavedPassages(loadSavedPassages());
    window.addEventListener('fv-saved-passages-changed', refresh);
    return () => window.removeEventListener('fv-saved-passages-changed', refresh);
  }, []);

  const allPorts = useMemo(() => {
    const saved = savedPorts.map((port) => ({
      code: port.unlocode,
      name: port.name,
      country: port.country,
      lat: port.lat,
      lon: port.lon,
      label: port.unlocode ? `${port.name}, ${port.country} (${port.unlocode})` : `${port.name}, ${port.country}`,
    }));
    // Keep every world-port record as-is; only prevent exact duplicate saved-port inserts.
    const worldKeys = new Set(
      ports.map((port) => `${port.code}|${port.name}|${port.country}|${port.lat}|${port.lon}`),
    );
    const extraSaved = saved.filter(
      (port) => !worldKeys.has(`${port.code}|${port.name}|${port.country}|${port.lat}|${port.lon}`),
    );
    return [...ports, ...extraSaved];
  }, [ports, savedPorts]);
  const portOptions = useMemo(() => {
    const q = (activeInput === 'departure' ? departure : arrival).trim().toLowerCase();
    if (!q) return allPorts;
    return allPorts.filter((port) => `${port.name} ${port.country} ${port.code}`.toLowerCase().includes(q));
  }, [activeInput, departure, arrival, allPorts]);
  const searchRoutes = () => {
    const from = matches(departure, allPorts);
    const to = matches(arrival, allPorts);
    const depExact = resolveWorldPort(departure, allPorts);
    const arrExact = resolveWorldPort(arrival, allPorts);
    const endpointThreshold = nearby ? Math.max(20, radius) : 20;
    const passageResults: RouteOption[] = [];
    if (depExact && arrExact) {
      const scored: Array<{ route: RouteOption; score: number }> = [];
      for (const passage of savedPassages) {
        if (!passage.points || passage.points.length < 2) continue;
        const first = passage.points[0];
        const last = passage.points[passage.points.length - 1];
        const depPt: [number, number] = [depExact.lat, depExact.lon];
        const arrPt: [number, number] = [arrExact.lat, arrExact.lon];
        const forward = pointDistanceNm(first, depPt) + pointDistanceNm(last, arrPt);
        const reverse = pointDistanceNm(first, arrPt) + pointDistanceNm(last, depPt);
        const reversed = reverse < forward;
        const score = Math.min(forward, reverse);
        if (score > endpointThreshold * 2) continue;
        const path = reversed ? [...passage.points].reverse() : passage.points;
        const firstPath = path[0];
        const lastPath = path[path.length - 1];
        const routeFrom = {
          code: depExact.code,
          name: depExact.name,
          country: depExact.country,
          lat: firstPath[0],
          lon: firstPath[1],
          label: depExact.label,
        };
        const routeTo = {
          code: arrExact.code,
          name: arrExact.name,
          country: arrExact.country,
          lat: lastPath[0],
          lon: lastPath[1],
          label: arrExact.label,
        };
        scored.push({
          route: {
            id: passage.id,
            from: routeFrom,
            to: routeTo,
            distanceNm: pathDistanceNm(path),
            source: 'Exact match',
            path,
            passage,
          },
          score,
        });
      }
      scored.sort((a, b) => a.score - b.score);
      passageResults.push(...scored.map((entry) => entry.route));
    }
    if (passageResults.length) {
      setSavedPassageMatched(true);
      setResults(passageResults);
      setMessage(`${passageResults.length} saved passage${passageResults.length === 1 ? '' : 's'} found.`);
      return;
    }
    setSavedPassageMatched(false);
    if (!from.length || !to.length) {
      setResults([]);
      setMessage('No exact port match. Adjust the nearby distance or enter a partial port name, country, or UN/LOCODE.');
      return;
    }
    const exact = from.length === 1 && to.length === 1;
    const next = from.flatMap((left) => to.map((right) => ({ id: `${left.code}-${right.code}`, from: left, to: right, distanceNm: distanceNm(left, right), source: exact ? 'Exact match' as const : 'Nearby port option' as const })))
      .filter((route) => exact || (nearby && route.distanceNm <= radius))
      .sort((a, b) => a.distanceNm - b.distanceNm)
      .slice(0, nearby ? 12 : 1);
    setResults(next);
    setMessage(next.length ? `${next.length} route option${next.length === 1 ? '' : 's'} found.` : 'No route found within the selected distance.');
  };
  const exactDeparture = resolveWorldPort(departure, allPorts);
  const exactArrival = resolveWorldPort(arrival, allPorts);
  const departureCandidates = useMemo(() => matches(departure, allPorts), [departure, allPorts]);
  const arrivalCandidates = useMemo(() => matches(arrival, allPorts), [arrival, allPorts]);
  const nearbyCenter = exactDeparture ?? exactArrival ?? departureCandidates[0] ?? arrivalCandidates[0] ?? null;
  const primaryResult = results[0] ?? null;
  const mapFrom = exactDeparture ?? primaryResult?.from ?? null;
  const mapTo = exactArrival ?? primaryResult?.to ?? null;
  const showNearbyCircle = nearby && radius > 0 && !!nearbyCenter && !savedPassageMatched;
  const addToVoyage = (route: RouteOption) => {
    const path = route.path || [[route.from.lat, route.from.lon], [route.to.lat, route.to.lon]];
    setActiveSimRoute({ id: `explorer-${Date.now()}`, label: `${route.from.name} → ${route.to.name}`, color: '#f28c28', path, distanceNm: route.distanceNm, timeHours: [0, route.distanceNm / 12] });
    setMessage('Route added to voyage simulation.');
  };
  const download = (route: RouteOption) => {
    const path = route.path || [[route.from.lat, route.from.lon], [route.to.lat, route.to.lon]];
    const csv = `name,lat,lon,speed,drift,isPort\n${path.map((point, index) => `"${index === 0 ? route.from.name : index === path.length - 1 ? route.to.name : `WP ${index}`}",${point[0]},${point[1]},12,false,${index === 0 || index === path.length - 1}`).join('\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a'); link.href = url; link.download = `${route.from.code || 'departure'}-${route.to.code || 'arrival'}-route.csv`; link.click(); URL.revokeObjectURL(url);
  };

  return <div className="fv-route-explorer">
    <aside className={`fv-route-explorer__panel${panelCollapsed ? ' fv-route-explorer__panel--collapsed' : ''}`}>
      <button type="button" className="fv-route-explorer__collapse" onClick={() => setPanelCollapsed((collapsed) => !collapsed)} aria-label={panelCollapsed ? 'Expand Route Explorer' : 'Minimize Route Explorer'} title={panelCollapsed ? 'Expand' : 'Minimize'}><i className={`fas fa-chevron-${panelCollapsed ? 'right' : 'left'}`} /></button>
      {!panelCollapsed && <>
      <header className="fv-route-explorer__head"><h1><i className="fas fa-compass-drafting" /> Route Explorer</h1><h2>Departure and Arrival Ports</h2></header>
      <div className="fv-route-explorer__inputs">
        <label><i className="fas fa-location-dot" /><input value={departure} onFocus={() => setActiveInput('departure')} onChange={(e) => setDeparture(e.target.value)} placeholder="Enter departure port or select port on map" list="route-explorer-ports" /></label>
        <label><i className="fas fa-location-dot" /><input value={arrival} onFocus={() => setActiveInput('arrival')} onChange={(e) => setArrival(e.target.value)} placeholder="Enter arrival port or select port on map" list="route-explorer-ports" /></label>
        <datalist id="route-explorer-ports">{portOptions.map((port, idx) => <option key={`${port.code || 'nocode'}-${port.name}-${port.lat}-${port.lon}-${idx}`} value={port.label} />)}</datalist>
      </div>
      <div className="fv-route-explorer__mode"><button type="button" className="is-active">Search</button><button type="button">Create</button></div>
      <label className="fv-route-explorer__nearby"><input type="checkbox" checked={nearby} onChange={(e) => setNearby(e.target.checked)} /> Include routes to nearby ports</label>
      <input className="fv-route-explorer__range" type="range" min="0" max="5" value={RADIUS_STEPS.indexOf(radius)} onChange={(e) => setRadius(RADIUS_STEPS[Number(e.target.value)] ?? 250)} aria-label="Nearby port distance" />
      <div className="fv-route-explorer__range-label"><span>0 NM</span><span>{radius || 1000} NM</span></div>
      <button type="button" className="fv-route-explorer__search" onClick={searchRoutes}><i className="fas fa-search" /> Search</button>
      {message && <p className="fv-route-explorer__message">{message}</p>}
      <div className="fv-route-explorer__results">{results.map((route) => <article key={route.id} className="fv-route-explorer__result"><div><strong>{route.from.code || route.from.name} to {route.to.code || route.to.name}</strong><small>{route.source} · {route.distanceNm.toLocaleString()} NM</small><small>{route.from.name} → {route.to.name}</small></div><div><button type="button" title="Add route to voyage" onClick={() => addToVoyage(route)}><i className="fas fa-plus" /></button><button type="button" title="Download route" onClick={() => download(route)}><i className="fas fa-download" /></button></div></article>)}</div>
      </>}
    </aside>
    <main className="fv-route-explorer__map"><MapContainer center={[18, 105]} zoom={3} minZoom={2} style={{ height: '100%', width: '100%' }} worldCopyJump>
      {baseLayer === 'satellite' ? (
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="Tiles &copy; Esri" />
      ) : baseLayer === 'dark' ? (
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution="&copy; OpenStreetMap contributors &copy; CARTO" />
      ) : (
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
      )}
      <MapLayersControl position="topright" value={baseLayer} onChange={setBaseLayer} /><WeatherFieldControl position="topright" /><AreaConstraintsControl position="topright" /><WeatherPointControl position="topright" /><PortsControl position="topright" /><RulerControl position="topright" />
      {showNearbyCircle && <Circle center={[nearbyCenter.lat, nearbyCenter.lon]} radius={radius * 1852} pathOptions={{ color: '#aeb7c5', weight: 1, fillColor: '#d8dee8', fillOpacity: 0.13, dashArray: '4 4' }} />}
      {mapFrom && <Marker position={[mapFrom.lat, mapFrom.lon]} icon={systemPortIcon()}><Tooltip>{mapFrom.name}</Tooltip></Marker>}
      {mapTo && (!mapFrom || mapFrom.lat !== mapTo.lat || mapFrom.lon !== mapTo.lon) && <Marker position={[mapTo.lat, mapTo.lon]} icon={systemPortIcon()}><Tooltip>{mapTo.name}</Tooltip></Marker>}
      {results.slice(0, 1).map((route) => <Fragment key={`route-line-${route.id}`}><Polyline positions={route.path || [[route.from.lat, route.from.lon], [route.to.lat, route.to.lon]]} pathOptions={{ color: '#f28c28', weight: 3 }} /></Fragment>)}
    </MapContainer></main>
  </div>;
}
