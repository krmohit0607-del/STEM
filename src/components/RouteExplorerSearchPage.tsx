import { Fragment, useEffect, useMemo, useState } from 'react';
import { Circle, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

import { resolveWorldPort, useWorldPorts, type WorldPort } from '../data/ports';
import { useSavedPorts } from '../data/savedPorts';
import { bumpSavedRoutes } from '../data/optimizationStore';
import { setActiveSimRoute } from '../data/routeSimulatorStore';
import { AreaConstraintsControl } from './AreaConstraintsControl';
import { WeatherFieldControl } from './WeatherFieldControl';
import { WeatherPointControl } from './WeatherPointControl';
import { MapLayersControl, readMapLayerId, type MapLayerId } from './MapLayersControl';
import { PortsControl, RulerControl } from './MapToolsControl';
import { loadSavedPassages, saveSavedPassages, type SavedPassage } from '../data/savedPassages';

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

function decimalToDms(value: number, latitude: boolean): string {
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutes = ((absolute - degrees) * 60).toFixed(1).padStart(4, '0');
  const direction = latitude
    ? value >= 0 ? 'N' : 'S'
    : value >= 0 ? 'E' : 'W';
  return `${degrees.toString().padStart(latitude ? 2 : 3, '0')}° ${minutes}' ${direction}`;
}

function routeWaypoints(path: [number, number][], fromName: string, toName: string) {
  return path.map(([lat, lon], index) => ({
    id: `wp-${Date.now()}-${index}`,
    name: index === 0 ? fromName : index === path.length - 1 ? toName : `WP ${index}`,
    lat: decimalToDms(lat, true),
    lon: decimalToDms(lon, false),
    course: 0,
    speed: 12,
    distanceFromPrev: index === 0 ? 0 : pointDistanceNm(path[index - 1], [lat, lon]),
    eta: '',
    drift: false,
    isPort: index === 0 || index === path.length - 1,
    legType: 'rhumb' as const,
  }));
}

function CreateRouteClickHandler({ onAdd }: { onAdd: (point: [number, number]) => void }) {
  useMapEvents({ click: (event) => onAdd([event.latlng.lat, event.latlng.lng]) });
  return null;
}

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
  const [mode, setMode] = useState<'search' | 'create'>('search');
  const [createdPoints, setCreatedPoints] = useState<[number, number][]>([]);
  const [createdName, setCreatedName] = useState('');

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
    if (!passageResults.length) {
      const queryParts = [departure, arrival].map((value) => value.trim().toLowerCase()).filter(Boolean);
      const textMatches = savedPassages.filter((passage) => {
        const label = `${passage.name} ${passage.source ?? ''}`.toLowerCase();
        return queryParts.length > 0 && queryParts.some((part) => label.includes(part)) && passage.points.length >= 2;
      });
      for (const passage of textMatches) {
        const first = passage.points[0];
        const last = passage.points[passage.points.length - 1];
        const from = depExact ?? { code: '', name: 'Departure', country: '', lat: first[0], lon: first[1], label: 'Departure' };
        const to = arrExact ?? { code: '', name: 'Arrival', country: '', lat: last[0], lon: last[1], label: 'Arrival' };
        passageResults.push({ id: passage.id, from, to, distanceNm: pathDistanceNm(passage.points), source: 'Exact match', path: passage.points, passage });
      }
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
    const passageId = `explorer-${route.passage?.id ?? Date.now()}`;
    const savedRoute = {
      id: passageId,
      name: route.passage?.name || `${route.from.name} → ${route.to.name}`,
      savedAt: new Date().toISOString(),
      waypoints: routeWaypoints(path, route.from.name, route.to.name),
    };
    let existing: Array<{ id: string; name: string; savedAt: string; waypoints: ReturnType<typeof routeWaypoints> }> = [];
    try {
      const raw = localStorage.getItem('fv.savedRoutes');
      const parsed = raw ? JSON.parse(raw) : [];
      existing = Array.isArray(parsed) ? parsed : [];
    } catch {
      existing = [];
    }
    const next = [savedRoute, ...existing.filter((item) => item.id !== passageId)];
    try {
      localStorage.setItem('fv.savedRoutes', JSON.stringify(next));
      localStorage.setItem('fv.routeEditorRouteId', passageId);
    } catch {
      setMessage('Unable to add route to the voyage simulator storage.');
      return;
    }
    bumpSavedRoutes();
    setMessage('Route added to the voyage simulator. It is now available for playback, editing, comparison, optimization, saving, and download.');
  };
  const download = (route: RouteOption) => {
    const path = route.path || [[route.from.lat, route.from.lon], [route.to.lat, route.to.lon]];
    const csv = `name,lat,lon,speed,drift,isPort\n${path.map((point, index) => `"${index === 0 ? route.from.name : index === path.length - 1 ? route.to.name : `WP ${index}`}",${point[0]},${point[1]},12,false,${index === 0 || index === path.length - 1}`).join('\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a'); link.href = url; link.download = `${route.from.code || 'departure'}-${route.to.code || 'arrival'}-route.csv`; link.click(); URL.revokeObjectURL(url);
  };
  const createRoute = () => {
    setMode('create');
    setResults([]);
    setMessage('Click the map to add route points. Add at least two points, then choose an action.');
    setCreatedPoints([]);
  };
  const addCreatedToVoyage = () => {
    if (createdPoints.length < 2) return;
    setActiveSimRoute({ id: `created-${Date.now()}`, label: createdName.trim() || 'Manual route', color: '#f28c28', path: createdPoints, distanceNm: pathDistanceNm(createdPoints), timeHours: [0, pathDistanceNm(createdPoints) / 12] });
    setMessage('Manual route added to the voyage simulation.');
  };
  const saveCreatedPassage = () => {
    if (createdPoints.length < 2) return;
    const passage: SavedPassage = { id: `passage-${Date.now()}`, name: createdName.trim() || `Manual passage ${savedPassages.length + 1}`, source: 'Route Explorer', points: createdPoints };
    const next = [passage, ...savedPassages];
    saveSavedPassages(next);
    setSavedPassages(next);
    setMessage('Manual route saved as a passage.');
  };
  const downloadCreated = () => {
    if (createdPoints.length < 2) return;
    download({ id: 'manual-route', from: { code: '', name: 'Departure', country: '', lat: createdPoints[0][0], lon: createdPoints[0][1], label: 'Departure' }, to: { code: '', name: 'Arrival', country: '', lat: createdPoints[createdPoints.length - 1][0], lon: createdPoints[createdPoints.length - 1][1], label: 'Arrival' }, distanceNm: pathDistanceNm(createdPoints), source: 'Exact match', path: createdPoints });
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
      <div className="fv-route-explorer__mode"><button type="button" className={mode === 'search' ? 'is-active' : ''} onClick={() => setMode('search')}><i className="fas fa-search" /> Search</button><button type="button" className={mode === 'create' ? 'is-active' : ''} onClick={createRoute}><i className="fas fa-pen-ruler" /> Create</button></div>
      {mode === 'create' && <div className="fv-route-explorer__create-tools"><input value={createdName} onChange={(event) => setCreatedName(event.target.value)} placeholder="Route / passage name" /><span className="fv-route-explorer__create-count">{createdPoints.length} point{createdPoints.length === 1 ? '' : 's'}</span><button type="button" disabled={createdPoints.length < 2} onClick={addCreatedToVoyage} title="Add manual route to voyage"><i className="fas fa-route" /><span>Add to voyage</span></button><button type="button" disabled={createdPoints.length < 2} onClick={saveCreatedPassage} title="Save as passage"><i className="fas fa-save" /><span>Save passage</span></button><button type="button" disabled={createdPoints.length < 2} onClick={downloadCreated} title="Download route"><i className="fas fa-download" /><span>Download</span></button><button type="button" onClick={() => { setCreatedPoints([]); setMessage('Manual route cleared.'); }} title="Clear manual route"><i className="fas fa-eraser" /><span>Clear</span></button></div>}
      <label className="fv-route-explorer__nearby"><input type="checkbox" checked={nearby} onChange={(e) => setNearby(e.target.checked)} /> Include routes to nearby ports</label>
      <input className="fv-route-explorer__range" type="range" min="0" max="5" value={RADIUS_STEPS.indexOf(radius)} onChange={(e) => setRadius(RADIUS_STEPS[Number(e.target.value)] ?? 250)} aria-label="Nearby port distance" />
      <div className="fv-route-explorer__range-label"><span>0 NM</span><span>{radius || 1000} NM</span></div>
      {mode === 'search' && <button type="button" className="fv-route-explorer__search" onClick={searchRoutes}><i className="fas fa-search" /> Search Saved Passages</button>}
      {message && <p className="fv-route-explorer__message">{message}</p>}
      <div className="fv-route-explorer__results">{results.map((route) => <article key={route.id} className="fv-route-explorer__result"><div><strong>{route.from.code || route.from.name} to {route.to.code || route.to.name}</strong><small>{route.source} · {route.distanceNm.toLocaleString()} NM</small><small>{route.from.name} → {route.to.name}</small></div><div><button type="button" title="Add route to voyage" onClick={() => addToVoyage(route)}><i className="fas fa-plus" /></button><button type="button" title="Download route" onClick={() => download(route)}><i className="fas fa-download" /></button></div></article>)}</div>
      </>}
    </aside>
    <main className="fv-route-explorer__map"><MapContainer center={[18, 105]} zoom={3} minZoom={2} style={{ height: '100%', width: '100%' }} worldCopyJump>
      {mode === 'create' && <CreateRouteClickHandler onAdd={(point) => setCreatedPoints((current) => [...current, point])} />}
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
      {mode === 'create' && createdPoints.length > 1 && <Polyline positions={createdPoints} pathOptions={{ color: '#f28c28', weight: 4 }} />}
      {mode === 'create' && createdPoints.map((point, index) => <Marker key={`manual-${index}`} position={point} icon={systemPortIcon()}><Tooltip>Point {index + 1}</Tooltip></Marker>)}
    </MapContainer></main>
  </div>;
}
