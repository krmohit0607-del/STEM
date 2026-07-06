import { useMemo, useState } from 'react';

import {
  WEATHER_MARGIN_ROUTES,
} from '../data/weatherMargins';
import { StaticRouteMap } from './StaticRouteMap';

/**
 * Weather Margins — pick an area (route) from the dropdown to see its
 * assumptions / route discussion, a schematic map of the route, and the
 * month-by-month Estimated Sea Margins table.
 */

function nm(v: number | undefined): string {
  if (v === undefined) return '—';
  return `${v.toLocaleString()}nm`;
}

/** Signed nm for current effect (+ / -). */
function signedNm(v: number | undefined): string {
  if (v === undefined) return '—';
  const s = v > 0 ? `+${v}` : `${v}`;
  return `${s}nm`;
}

function pct(v: number): string {
  return `${v.toFixed(2)}%`;
}

/** Colour ramp for the sea-margin cell (green low → red high). */
function marginClass(v: number): string {
  if (v >= 15) return 'fv-wm__margin--vhigh';
  if (v >= 10) return 'fv-wm__margin--high';
  if (v >= 7) return 'fv-wm__margin--mid';
  return 'fv-wm__margin--low';
}

export function WeatherMargins() {
  const [routeId, setRouteId] = useState(WEATHER_MARGIN_ROUTES[0].id);
  const route =
    WEATHER_MARGIN_ROUTES.find((r) => r.id === routeId) ?? WEATHER_MARGIN_ROUTES[0];

  const avgMargin = useMemo(
    () => route.rows.reduce((s, r) => s + r.seaMargin, 0) / route.rows.length,
    [route],
  );

  return (
    <div className="fv-wm">
      <div className="fv-wm__toolbar">
        <label className="fv-wm__select">
          <span className="fv-wm__select-label">Area</span>
          <select value={routeId} onChange={(e) => setRouteId(e.target.value)}>
            {WEATHER_MARGIN_ROUTES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <div className="fv-wm__avg">
          <span className="fv-wm__avg-label">Avg Sea Margin</span>
          <span className="fv-wm__avg-value">{pct(avgMargin)}</span>
        </div>
      </div>

      <div className="fv-wm__body">
        <div className="fv-wm__info">
          <h3 className="fv-wm__route-name">
            {route.name}
            {route.asOf && <span className="fv-wm__asof">as of {route.asOf}</span>}
          </h3>

          {route.assumptions && route.assumptions.length > 0 && (
            <section className="fv-wm__section">
              <h4>Assumptions</h4>
              <ul>
                {route.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </section>
          )}

          {route.discussion && route.discussion.length > 0 && (
            <section className="fv-wm__section">
              <h4>Route Discussion</h4>
              {route.discussion.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </section>
          )}

          {route.distances && route.distances.length > 0 && (
            <section className="fv-wm__section">
              <h4>Distances</h4>
              <ul>
                {route.distances.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="fv-wm__map">
          <StaticRouteMap via={route.via} />
        </div>
      </div>

      <div className="fv-wm__table-card">
        <h4 className="fv-wm__table-title">Estimated Sea Margins — {route.name}</h4>
        <div className="fv-wm__table-scroll">
          <table className="fv-wm__table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Distance</th>
                {route.hasCurrentEffect && <th>Current Effect</th>}
                <th>Weather Effect</th>
                <th>Distance Through Water</th>
                <th>Sea Margin</th>
              </tr>
            </thead>
            <tbody>
              {route.rows.map((r) => (
                <tr key={r.month}>
                  <td className="fv-wm__month">{r.month}</td>
                  <td className="fv-wm__num">{nm(r.distance)}</td>
                  {route.hasCurrentEffect && (
                    <td
                      className={`fv-wm__num ${
                        (r.currentEffect ?? 0) < 0 ? 'fv-wm__neg' : 'fv-wm__pos'
                      }`}
                    >
                      {signedNm(r.currentEffect)}
                    </td>
                  )}
                  <td className="fv-wm__num fv-wm__neg">{nm(r.weatherEffect)}</td>
                  <td className="fv-wm__num">{nm(r.distanceThroughWater)}</td>
                  <td className={`fv-wm__num fv-wm__margin ${marginClass(r.seaMargin)}`}>
                    {pct(r.seaMargin)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fv-wm__note">
          Note: Distance Through Water = geographical distance + weather factor + current factor.
        </p>
      </div>
    </div>
  );
}
