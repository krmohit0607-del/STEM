import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import L, { type LatLngBoundsExpression, type LatLngExpression } from 'leaflet';

import {
  type FleetRow,
  PORT_COORDS,
  STUB_ROWS,
  getRoutePath,
} from '../data/fleet';
import { WeatherOverlay } from './WeatherOverlay';
import { WeatherControls } from './WeatherControls';

/**
 * Voyage Overview Map — rendered on `/?voyage=ID`.
 *
 * Shows the selected voyage's route (departure → interim → arrival)
 * as a polyline on a Leaflet map with an animated ship icon for
 * "live" tracking, plus a side panel listing every field from the
 * fleet row (vessel / client / dates / speeds / costs / file status).
 *
 * The position is synthetic — we interpolate the ship marker along
 * the polyline at a slow constant rate so the user sees motion until
 * the real `/api/vessel/{imo}/position` stream is wired up.
 */

interface VoyageOverviewMapProps {
  voyageId: string;
}

/** ms for one full pass of the route polyline. */
const PLAY_DURATION_MS = 60_000;

function samplePath(
  path: Array<[number, number]>,
  progress: number,
): [number, number] {
  const last = path.length - 1;
  if (last < 0) return [0, 0];
  const p = Math.max(0, Math.min(last, progress));
  const i0 = Math.floor(p);
  const i1 = Math.min(last, i0 + 1);
  const t = p - i0;
  const [lat0, lon0] = path[i0];
  const [lat1, lon1] = path[i1];
  return [lat0 * (1 - t) + lat1 * t, lon0 * (1 - t) + lon1 * t];
}

function shipIcon(): L.DivIcon {
  return L.divIcon({
    className: 'fv-voyage-overview__ship-wrap',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `
      <span class="fv-voyage-overview__ship">
        <i class="fas fa-ship" aria-hidden="true"></i>
      </span>
    `,
  });
}

function formatNumber(n: number, fractionDigits = 2): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function formatCurrency(n: number): string {
  return `US$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatList(arr: string[]): string {
  return arr.length === 0 ? '—' : arr.join(', ');
}

function formatText(s: string): string {
  return !s || s === '###' ? '—' : s;
}

export function VoyageOverviewMap({ voyageId }: VoyageOverviewMapProps) {
  const row: FleetRow | undefined = useMemo(
    () => STUB_ROWS.find((r) => r.voyageId === voyageId),
    [voyageId],
  );

  if (!row) {
    return (
      <div className="fv-voyage-overview fv-voyage-overview--missing">
        <h2>Voyage not found</h2>
        <p>
          No voyage with ID <code>{voyageId}</code> is loaded in the current
          stub. Use the Fleet List View to open an existing voyage.
        </p>
      </div>
    );
  }

  return <VoyageOverviewInner row={row} />;
}

interface InnerProps {
  row: FleetRow;
}

function VoyageOverviewInner({ row }: InnerProps) {
  const path = useMemo(() => getRoutePath(row), [row]);
  const positions: LatLngExpression[] = useMemo(
    () => path.map(([lat, lon]) => [lat, lon] as LatLngExpression),
    [path],
  );

  // Fit map bounds around the polyline (plus a little padding).
  const bounds: LatLngBoundsExpression | null = useMemo(() => {
    if (path.length === 0) return null;
    const lats = path.map(([lat]) => lat);
    const lons = path.map(([, lon]) => lon);
    const pad = 4;
    return [
      [Math.min(...lats) - pad, Math.min(...lons) - pad],
      [Math.max(...lats) + pad, Math.max(...lons) + pad],
    ];
  }, [path]);

  // Animate the ship marker along the polyline.
  const [progress, setProgress] = useState<number>(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const lastIdx = Math.max(0, path.length - 1);

  useEffect(() => {
    if (lastIdx === 0) return;
    const speed = lastIdx / PLAY_DURATION_MS;
    const tick = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = ts - lastTsRef.current;
      lastTsRef.current = ts;
      setProgress((prev) => {
        const next = prev + dt * speed;
        return next >= lastIdx ? 0 : next;
      });
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTsRef.current = null;
    };
  }, [lastIdx]);

  const shipPos = useMemo(() => samplePath(path, progress), [path, progress]);
  const icon = useMemo(() => shipIcon(), []);

  const portMarkers = useMemo(() => {
    const ports = [
      { name: row.departurePort, label: 'Departure' },
      { name: row.interimPort, label: 'Interim' },
      { name: row.arrivalPort, label: 'Arrival' },
    ].filter((p) => p.name && PORT_COORDS[p.name]);
    return ports.map((p) => ({
      ...p,
      coords: PORT_COORDS[p.name],
    }));
  }, [row]);

  return (
    <div className="fv-voyage-overview">
      <aside className="fv-voyage-overview__panel">
        <header className="fv-voyage-overview__panel-header">
          <h2>{row.vesselName}</h2>
          <p>
            <strong>{row.voyageId}</strong> · {formatText(row.clientName)}
          </p>
          {row.statuses.length > 0 && (
            <ul className="fv-voyage-overview__status">
              {row.statuses.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
        </header>

        <Section title="Route">
          <Field label="From" value={formatText(row.departurePort)} />
          <Field label="Interim" value={formatText(row.interimPort)} />
          <Field label="To" value={formatText(row.arrivalPort)} />
          <Field label="Leg L/B" value={formatList(row.legLB)} />
        </Section>

        <Section title="Schedule">
          <Field label="ETD" value={formatText(row.etd)} />
          <Field label="ATD" value={formatText(row.atd)} />
          <Field label="ATA (Interim)" value={formatText(row.ataInterim)} />
          <Field label="ATD (Interim)" value={formatText(row.atdInterim)} />
          <Field label="ETA" value={formatText(row.eta)} />
          <Field label="ATA (Arrival)" value={formatText(row.ataArrival)} />
          <Field label="Last NN" value={formatText(row.lastNN)} />
        </Section>

        <Section title="Service">
          <Field label="PIC / Analyst" value={formatText(row.pic)} />
          <Field label="Service types" value={formatList(row.serviceTypes)} />
          <Field
            label="Optimization"
            value={formatList(row.optimizationTypes)}
          />
        </Section>

        <Section title="Performance">
          <Field label="CP speed" value={`${formatNumber(row.cpSpeed, 1)} kt`} />
          <Field label="CP cons" value={`${formatNumber(row.cpCons, 1)} MT/day`} />
          <Field label="Inst speed" value={`${formatNumber(row.instSpeed, 1)} kt`} />
          <Field
            label="Inst cons"
            value={`${formatNumber(row.instCons, 1)} MT/day`}
          />
          <Field
            label="Avg spd since COSP"
            value={`${formatNumber(row.avgSpdSinceCOSP, 2)} kt`}
          />
          <Field
            label="Perf spd since COSP"
            value={`${formatNumber(row.perfSpeedSinceCOSP, 2)} kt`}
          />
          <Field label="Performance" value={formatList(row.performance)} />
        </Section>

        <Section title="Cost">
          <Field label="Cost / day" value={formatCurrency(row.costPerDay)} />
          <Field label="FO cost" value={formatCurrency(row.foCost)} />
          <Field label="GO cost" value={formatCurrency(row.goCost)} />
          <Field
            label="EUA cost / MT"
            value={`US$${formatNumber(row.euaCostPerMt, 2)}`}
          />
        </Section>

        <Section title="Reports">
          <Field label="RR / RI sent" value={formatText(row.rrRiSent)} />
          <Field label="Weather sent" value={formatText(row.weatherSent)} />
          <Field label="Interim sent" value={formatText(row.interimSent)} />
          <Field label="EOV report sent" value={formatText(row.eovReportSent)} />
          <Field label="File status" value={formatList(row.fileStatus)} />
          <Field label="Voyage tags" value={formatText(row.voyageTags)} />
        </Section>
      </aside>

      <div className="fv-voyage-overview__map">
        <MapContainer
          {...(bounds ? { bounds } : { center: [20, 0] as LatLngExpression, zoom: 3 })}
          minZoom={2}
          maxZoom={10}
          worldCopyJump
          scrollWheelZoom
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution="Tiles &copy; Esri"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}"
            maxNativeZoom={10}
          />

          {positions.length >= 2 && (
            <Polyline
              positions={positions}
              pathOptions={{ color: '#58a6ff', weight: 4, opacity: 0.9 }}
            />
          )}

          {portMarkers.map((p) => (
            <Marker
              key={`port-${p.label}`}
              position={p.coords}
              icon={L.divIcon({
                className: 'fv-voyage-overview__port-wrap',
                iconSize: [12, 12],
                iconAnchor: [6, 6],
                html: '<span class="fv-voyage-overview__port"></span>',
              })}
            >
              <Tooltip
                direction="top"
                offset={[0, -6]}
                opacity={1}
                className="fv-voyage-overview__port-tooltip"
              >
                {p.label}: {p.name}
              </Tooltip>
            </Marker>
          ))}

          {path.length > 0 && (
            <Marker position={shipPos} icon={icon} zIndexOffset={1000}>
              <Tooltip
                direction="top"
                offset={[0, -14]}
                opacity={1}
                permanent
                className="fv-voyage-overview__ship-tooltip"
              >
                {row.vesselName} · {formatNumber(row.instSpeed, 1)} kt
              </Tooltip>
            </Marker>
          )}

          <WeatherOverlay points={path as Array<[number, number]>} maxPoints={6} />
        </MapContainer>

        <WeatherControls />
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <section className="fv-voyage-overview__section">
      <h3>{title}</h3>
      <dl>{children}</dl>
    </section>
  );
}

interface FieldProps {
  label: string;
  value: string;
}

function Field({ label, value }: FieldProps) {
  return (
    <div className="fv-voyage-overview__field">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
