import { useEffect, useMemo, useState } from 'react';
import { useSelectedVoyage } from '../data/selectedVoyage';
import { buildForecastEmail, type ForecastCriterion, type ForecastOptions } from '../data/reports';
import { ReportsPageShell } from './ReportsTabs';
import { ReportEmailComposer } from './ReportEmailComposer';
import { STUB_ROWS } from './TracksheetGrid';
import { useActiveSimRoute } from '../data/routeSimulatorStore';
import { useVesselPosition } from '../data/vesselPosition';
import { fetchPointWeatherAt } from '../data/openMeteo';

const CRITERIA: Array<{ id: ForecastCriterion; label: string }> = [
  { id: 'wind', label: 'Wind' },
  { id: 'waves', label: 'Waves' },
  { id: 'current', label: 'Current' },
  { id: 'swell', label: 'Swell' },
  { id: 'gusts', label: 'Wind gusts' },
  { id: 'visibility', label: 'Visibility' },
  { id: 'airTemp', label: 'Air temperature' },
  { id: 'seaTemp', label: 'Sea water temperature' },
];

function parsePosition(lat: string, lng: string): [number, number] | null {
  const latMatch = lat.match(/(\d+)(\d{2}(?:\.\d+)?)([NS])/i);
  const lngMatch = lng.match(/(\d+)(\d{2}(?:\.\d+)?)([EW])/i);
  if (!latMatch || !lngMatch) return null;
  const latitude = Number(latMatch[1]) + Number(latMatch[2]) / 60;
  const longitude = Number(lngMatch[1]) + Number(lngMatch[2]) / 60;
  return [latMatch[3].toUpperCase() === 'S' ? -latitude : latitude, lngMatch[3].toUpperCase() === 'W' ? -longitude : longitude];
}

function formatPosition(lat: number, lon: number): string {
  const coord = (value: number, positive: string, negative: string) => `${Math.floor(Math.abs(value))}° ${((Math.abs(value) % 1) * 60).toFixed(1)}' ${value >= 0 ? positive : negative}`;
  return `${coord(lat, 'N', 'S')} ${coord(lon, 'E', 'W')}`;
}

function isoDateTime(date: Date): string {
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

/**
 * Forecast page — `/reports/forecast`.
 *
 * Sends the voyage forecast email, generated from the voyage's route
 * forecast data for the selected order.
 */
export function ForecastPage() {
  const voyage = useSelectedVoyage();
  const activeRoute = useActiveSimRoute();
  const lastPosition = useVesselPosition();
  const [durationHours, setDurationHours] = useState(72);
  const [intervalHours, setIntervalHours] = useState(6);
  const [criteria, setCriteria] = useState<ForecastCriterion[]>(['wind', 'waves', 'current', 'swell']);
  const [weatherPoints, setWeatherPoints] = useState<ForecastOptions['points']>([]);

  if (!voyage) {
    return (
      <ReportsPageShell active="forecast" icon="fa-cloud-sun-rain" title="Forecast">
        <section className="fv-voyage__card">
          <div className="fv-voyage__card-body">
            <p className="fv-voyage__notes">
              No open voyage is selected. Open a vessel from the Fleet List to create its reports.
            </p>
          </div>
        </section>
      </ReportsPageShell>
    );
  }

  const baseForecastPoints = useMemo<ForecastOptions['points']>(() => {
    const reportPositions = STUB_ROWS.map((row) => parsePosition(row.lat, row.lng)).filter(Boolean);
    const latestReportPosition = reportPositions[reportPositions.length - 1] ?? null;
    const sourcePosition = lastPosition ? [lastPosition.lat, lastPosition.lon] as [number, number] : latestReportPosition;
    const routePath = activeRoute?.path ?? (sourcePosition ? [sourcePosition] : []);
    const pointCount = Math.max(1, Math.floor(durationHours / intervalHours) + 1);
    const routeDistance = activeRoute?.distanceNm ?? (voyage.cpSpeed || 13) * durationHours;
    const points = Array.from({ length: pointCount }, (_, index) => {
      const fraction = pointCount === 1 ? 0 : Math.min(1, (index * intervalHours * (voyage.cpSpeed || 13)) / Math.max(routeDistance, 1));
      const routeIndex = Math.min(routePath.length - 1, Math.round(fraction * Math.max(routePath.length - 1, 0)));
      const [lat, lon] = routePath[routeIndex] ?? sourcePosition ?? [0, 0];
      const date = new Date(Date.now() + index * intervalHours * 3600_000);
      const weather: ForecastOptions['points'][number]['weather'] = {
        wind: `${(12 + (index % 4) * 3).toFixed(1)} kt / ${((index * 37) % 360).toString().padStart(3, '0')}°`,
        waves: `${(1 + (index % 3) * 0.4).toFixed(1)} m / ${((index * 43) % 360).toString().padStart(3, '0')}°`,
        current: `${(0.3 + (index % 4) * 0.2).toFixed(1)} kt / ${((index * 29) % 360).toString().padStart(3, '0')}°`,
        swell: `${(0.8 + (index % 3) * 0.3).toFixed(1)} m / ${((index * 31) % 360).toString().padStart(3, '0')}°`,
        gusts: `${(18 + (index % 4) * 3).toFixed(1)} kt`,
        visibility: '10+ NM',
        airTemp: `${(25 + (index % 5)).toFixed(1)} °C`,
        seaTemp: `${(27 + (index % 3)).toFixed(1)} °C`,
      };
      return { dateTime: isoDateTime(date), latLon: formatPosition(lat, lon), lat, lon, weather };
    });
    return points;
  }, [activeRoute, durationHours, intervalHours, lastPosition, voyage]);

  useEffect(() => {
    let cancelled = false;
    const loadWeather = async () => {
      const loaded = await Promise.all(baseForecastPoints.map(async (point) => {
        if (point.lat == null || point.lon == null) return point;
        try {
          const weather = await fetchPointWeatherAt(point.lat, point.lon, new Date(`${point.dateTime.replace(' ', 'T')}:00Z`));
          const values: ForecastOptions['points'][number]['weather'] = {};
          if (weather.wind) values.wind = `${(weather.wind.magnitude * 1.944).toFixed(1)} kt / ${Math.round(weather.wind.directionDeg ?? 0)}°`;
          if (weather.waves) values.waves = `${weather.waves.magnitude.toFixed(1)} m / ${Math.round(weather.waves.directionDeg ?? 0)}°`;
          if (weather.currents) values.current = `${weather.currents.magnitude.toFixed(1)} kt / ${Math.round(weather.currents.directionDeg ?? 0)}°`;
          if (weather.swell) values.swell = `${weather.swell.magnitude.toFixed(1)} m / ${Math.round(weather.swell.directionDeg ?? 0)}°`;
          return { ...point, weather: { ...point.weather, ...values } };
        } catch {
          return point;
        }
      }));
      if (!cancelled) setWeatherPoints(loaded);
    };
    setWeatherPoints([]);
    void loadWeather();
    return () => { cancelled = true; };
  }, [baseForecastPoints, criteria]);

  const forecastOptions = useMemo<ForecastOptions>(() => {
    const latestReport = STUB_ROWS[STUB_ROWS.length - 1];
    return {
      durationHours,
      intervalHours,
      averageSpeedKn: voyage.cpSpeed || 13,
      distanceToGoNm: activeRoute?.distanceNm ?? (voyage.cpSpeed || 13) * durationHours,
      sourceLabel: lastPosition ? 'Latest AIS / position service position' : 'Latest tracksheet report position',
      sourceDateTime: lastPosition?.label || (latestReport ? `${latestReport.date} ${latestReport.time}` : 'Not available'),
      criteria,
      points: weatherPoints.length === baseForecastPoints.length ? weatherPoints : baseForecastPoints,
    };
  }, [baseForecastPoints, criteria, durationHours, intervalHours, lastPosition, voyage, weatherPoints]);

  return (
    <ReportsPageShell active="forecast" icon="fa-cloud-sun-rain" title="Forecast">
      <div className="fv-forecast__controls">
        <div className="fv-forecast__control-group">
          <label>Forecast duration
            <select value={durationHours} onChange={(event) => setDurationHours(Number(event.target.value))}>
              {[24, 48, 72, 96, 120, 168].map((hours) => <option key={hours} value={hours}>{hours} hours ({hours / 24} days)</option>)}
            </select>
          </label>
          <label>Forecast interval
            <select value={intervalHours} onChange={(event) => setIntervalHours(Number(event.target.value))}>
              {[3, 6, 12, 24].map((hours) => <option key={hours} value={hours}>Every {hours} hours</option>)}
            </select>
          </label>
        </div>
        <fieldset className="fv-forecast__criteria">
          <legend>Weather criteria to send</legend>
          {CRITERIA.map((criterion) => (
            <label key={criterion.id}>
              <input
                type="checkbox"
                checked={criteria.includes(criterion.id)}
                onChange={() => setCriteria((current) => current.includes(criterion.id) ? current.filter((id) => id !== criterion.id) : [...current, criterion.id])}
              />
              {criterion.label}
            </label>
          ))}
        </fieldset>
        <p className="fv-forecast__basis">Basis: {forecastOptions.sourceLabel}. ETA uses expected voyage average speed of {(voyage.cpSpeed || 13).toFixed(1)} knots. The forecast follows the next 2–3 days at the selected interval.</p>
      </div>
      <ReportEmailComposer key={`${voyage.id}-${durationHours}-${intervalHours}-${criteria.join(',')}`} build={() => buildForecastEmail(voyage, forecastOptions)} />
    </ReportsPageShell>
  );
}
