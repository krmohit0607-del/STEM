import { InterimTabs } from './InterimTabs';
import { WeatherMargins } from './WeatherMargins';

/**
 * Weather Margins page — `/weather-margins`.
 *
 * Reached from the "Weather Margins" tab under the Interim Dashboard.
 * Shows per-area (route) seasonal sea-margin tables with a map.
 */
export function WeatherMarginsPage() {
  return (
    <div className="fv-voyage">
      <header className="fv-voyage__header">
        <div className="fv-voyage__heading">
          <span className="fv-voyage__heading-icon" aria-hidden="true">
            <i className="fas fa-cloud-sun-rain" />
          </span>
          <h1>Weather Margins</h1>
        </div>
      </header>

      <InterimTabs active="weather" />

      <WeatherMargins />
    </div>
  );
}
