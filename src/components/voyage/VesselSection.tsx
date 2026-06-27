import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { BoolField, Card, Cell, Field } from './primitives';
import {
  ME_TYPE_OPTIONS,
  SCRUBBER_TYPE_OPTIONS,
  VESSEL_TYPE_OPTIONS,
  type EngineSpeedConsRow,
  type VoyageView,
} from './types';

interface Props {
  view: VoyageView;
  setView: Dispatch<SetStateAction<VoyageView>>;
  editing: boolean;
  onToggleEdit: () => void;
  title: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

/**
 * 2. Vessel Profile — Vessel & Engine details, engine limits & constraints,
 * telegraph table, weather safety limits and the load-dependent Speed & Cons
 * profile. Arranged to mirror the source spreadsheet layout.
 */
export function VesselSection({ view, setView, editing, onToggleEdit, title, collapsed, onToggleCollapse }: Props) {
  const set = <K extends keyof VoyageView>(key: K, value: VoyageView[K]) =>
    setView((prev) => ({ ...prev, [key]: value }));

  const setEngine = (i: number, key: keyof EngineSpeedConsRow, value: string) =>
    setView((prev) => ({
      ...prev,
      engineSpeedCons: prev.engineSpeedCons.map((row, idx) =>
        idx === i ? { ...row, [key]: value } : row,
      ),
    }));

  // Speed & Cons profile shows one load condition at a time.
  const [profileCondition, setProfileCondition] = useState<'Ballast' | 'Laden'>('Ballast');

  return (
    <Card
      id="vessel"
      title={title}
      editing={editing}
      onToggleEdit={onToggleEdit}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
    >
      <div className="fv-voyage__dense">
        {/* Vessel & engine details */}
        <h5 className="fv-voyage__subhead">Vessel &amp; Engine Details</h5>
        <div className="fv-voyage__cols fv-voyage__cols--3">
          <div className="fv-voyage__col">
            <Field label="Vessel Name" value={view.vesselName} editing={editing} onChange={(x) => set('vesselName', x)} />
            <Field label="Vessel IMO" value={view.imo} editing={editing} onChange={(x) => set('imo', x)} />
            <Field label="Vessel Type" value={view.vesselType} editing={editing} onChange={(x) => set('vesselType', x)} options={VESSEL_TYPE_OPTIONS} />
            <Field label="LOA" value={view.loa} editing={editing} onChange={(x) => set('loa', x)} />
            <Field label="Beam" value={view.beam} editing={editing} onChange={(x) => set('beam', x)} />
            <Field label="Default Draft (Ballast)" value={view.defaultBallastDraft} editing={editing} onChange={(x) => set('defaultBallastDraft', x)} />
            <Field label="Default Draft (Laden)" value={view.defaultLadenDraft} editing={editing} onChange={(x) => set('defaultLadenDraft', x)} />
          </div>
          <div className="fv-voyage__col">
            <Field label="Vessel Email" value={view.vesselEmail} editing={editing} onChange={(x) => set('vesselEmail', x)} />
            <Field label="ECDIS Model" value={view.ecdisModel} editing={editing} onChange={(x) => set('ecdisModel', x)} />
            <Field label="Vessel Flag" value={view.flag} editing={editing} onChange={(x) => set('flag', x)} />
            <Field label="M/E Type" value={view.meType} editing={editing} onChange={(x) => set('meType', x)} options={ME_TYPE_OPTIONS} />
            <Field label="M/E Model" value={view.meModel} editing={editing} onChange={(x) => set('meModel', x)} />
            <Field label="Summer Draft" value={view.summerDraft} editing={editing} onChange={(x) => set('summerDraft', x)} />
            <Field label="Summer Displacement" value={view.summerDisplacement} editing={editing} onChange={(x) => set('summerDisplacement', x)} />
          </div>
          <div className="fv-voyage__col">
            <div className="fv-voyage__toggle-row">
              <BoolField label="Auto Send Forecast" value={view.autoSendForecast} editing={editing} onChange={(b) => set('autoSendForecast', b)} />
              <Field label="Forecast Time" value={view.autoSendForecastTime} editing={editing} onChange={(x) => set('autoSendForecastTime', x)} />
            </div>
            <div className="fv-voyage__toggle-row">
              <BoolField label="4X Weather" value={view.weather4x} editing={editing} onChange={(b) => set('weather4x', b)} />
              <Field label="Duration" value={view.weather4xDuration} editing={editing} onChange={(x) => set('weather4xDuration', x)} />
            </div>
            <BoolField label="Auto Reports" value={view.autoSendReports} editing={editing} onChange={(b) => set('autoSendReports', b)} />
            <div className="fv-voyage__toggle-row">
              <BoolField label="Scrubber" value={view.scrubber} editing={editing} onChange={(b) => set('scrubber', b)} />
              <Field label="Scrubber Type" value={view.scrubberType} editing={editing} onChange={(x) => set('scrubberType', x)} options={SCRUBBER_TYPE_OPTIONS} />
            </div>
          </div>
        </div>

        {/* Engine limits & (speed & cons profile) */}
        <h5 className="fv-voyage__subhead">Engine Limits &amp; (Speed &amp; Cons Profile)</h5>
        <div className="fv-voyage__cols fv-voyage__cols--3">
          {/* Engine limits & constraints */}
          <div className="fv-voyage__col">
            <span className="fv-voyage__info-label">Engine Limits &amp; Constraints</span>
            <div className="fv-voyage__table-scroll">
              <table className="fv-voyage__dtable">
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>Min</th>
                    <th>Max</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>RPM</td>
                    <td><Cell editing={editing} value={view.minRpm} onChange={(x) => set('minRpm', x)} /></td>
                    <td><Cell editing={editing} value={view.maxRpm} onChange={(x) => set('maxRpm', x)} /></td>
                  </tr>
                  <tr>
                    <td>MCR</td>
                    <td><Cell editing={editing} value={view.minMcr} onChange={(x) => set('minMcr', x)} /></td>
                    <td><Cell editing={editing} value={view.maxMcr} onChange={(x) => set('maxMcr', x)} /></td>
                  </tr>
                  <tr>
                    <td>Speed</td>
                    <td><Cell editing={editing} value={view.minSpeed} onChange={(x) => set('minSpeed', x)} /></td>
                    <td><Cell editing={editing} value={view.maxSpeed} onChange={(x) => set('maxSpeed', x)} /></td>
                  </tr>
                  <tr>
                    <td>Power Fraction</td>
                    <td><Cell editing={editing} value={view.minPowerFraction} onChange={(x) => set('minPowerFraction', x)} /></td>
                    <td><Cell editing={editing} value={view.maxPowerFraction} onChange={(x) => set('maxPowerFraction', x)} /></td>
                  </tr>
                  <tr>
                    <td>Nominal Power Fraction</td>
                    <td><Cell editing={editing} value={view.nominalPowerFraction} onChange={(x) => set('nominalPowerFraction', x)} /></td>
                    <td>—</td>
                  </tr>
                  <tr>
                    <td>Blower On/Off Range (Ballast)</td>
                    <td><Cell editing={editing} value={view.blowerBallastMin} onChange={(x) => set('blowerBallastMin', x)} /></td>
                    <td><Cell editing={editing} value={view.blowerBallastMax} onChange={(x) => set('blowerBallastMax', x)} /></td>
                  </tr>
                  <tr>
                    <td>Blower On/Off Range (Laden)</td>
                    <td><Cell editing={editing} value={view.blowerLadenMin} onChange={(x) => set('blowerLadenMin', x)} /></td>
                    <td><Cell editing={editing} value={view.blowerLadenMax} onChange={(x) => set('blowerLadenMax', x)} /></td>
                  </tr>
                  <tr>
                    <td>Critical RPM Range</td>
                    <td><Cell editing={editing} value={view.criticalRpmMin} onChange={(x) => set('criticalRpmMin', x)} /></td>
                    <td><Cell editing={editing} value={view.criticalRpmMax} onChange={(x) => set('criticalRpmMax', x)} /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Telegraph table */}
          <div className="fv-voyage__col">
            <span className="fv-voyage__info-label">Telegraph Table</span>
            <div className="fv-voyage__table-scroll">
              <table className="fv-voyage__dtable">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>RPM</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Dead Slow Ahead</td>
                    <td><Cell editing={editing} value={view.deadSlowRpm} onChange={(x) => set('deadSlowRpm', x)} /></td>
                  </tr>
                  <tr>
                    <td>Slow Ahead</td>
                    <td><Cell editing={editing} value={view.slowAheadRpm} onChange={(x) => set('slowAheadRpm', x)} /></td>
                  </tr>
                  <tr>
                    <td>Half Ahead</td>
                    <td><Cell editing={editing} value={view.halfAheadRpm} onChange={(x) => set('halfAheadRpm', x)} /></td>
                  </tr>
                  <tr>
                    <td>Full Ahead</td>
                    <td><Cell editing={editing} value={view.fullAheadRpm} onChange={(x) => set('fullAheadRpm', x)} /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Weather safety limits */}
          <div className="fv-voyage__col">
            <span className="fv-voyage__info-label">Weather Safety Limits</span>
            <div className="fv-voyage__table-scroll">
              <table className="fv-voyage__dtable">
                <thead>
                  <tr>
                    <th>Condition</th>
                    <th>Ballast</th>
                    <th>Laden</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Max SWH</td>
                    <td><Cell editing={editing} value={view.wslMaxSwhBallast} onChange={(x) => set('wslMaxSwhBallast', x)} /></td>
                    <td><Cell editing={editing} value={view.wslMaxSwhLaden} onChange={(x) => set('wslMaxSwhLaden', x)} /></td>
                  </tr>
                  <tr>
                    <td>Max Winds (BF)</td>
                    <td><Cell editing={editing} value={view.wslMaxWindsBallast} onChange={(x) => set('wslMaxWindsBallast', x)} /></td>
                    <td><Cell editing={editing} value={view.wslMaxWindsLaden} onChange={(x) => set('wslMaxWindsLaden', x)} /></td>
                  </tr>
                  <tr>
                    <td>Max Sea State (DSS)</td>
                    <td><Cell editing={editing} value={view.wslMaxSeaStateBallast} onChange={(x) => set('wslMaxSeaStateBallast', x)} /></td>
                    <td><Cell editing={editing} value={view.wslMaxSeaStateLaden} onChange={(x) => set('wslMaxSeaStateLaden', x)} /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Speed & cons profile (per load condition) */}
        <div className="fv-voyage__profile-head">
          <h5 className="fv-voyage__subhead">Speed and Cons Profile</h5>
          <div className="fv-voyage__seg">
            {(['Ballast', 'Laden'] as const).map((cond) => (
              <button
                key={cond}
                type="button"
                className={`fv-voyage__seg-btn${profileCondition === cond ? ' fv-voyage__seg-btn--active' : ''}`}
                onClick={() => setProfileCondition(cond)}
              >
                {cond}
              </button>
            ))}
          </div>
        </div>
        <div className="fv-voyage__table-scroll">
          <table className="fv-voyage__dtable">
            <thead>
              <tr>
                <th>Speed</th>
                <th>Cons M/E</th>
                <th>Cons A/E</th>
                <th>RPM</th>
                <th>MCR %</th>
                <th>Power (KW)</th>
                <th>EPL Limit</th>
              </tr>
            </thead>
            <tbody>
              {view.engineSpeedCons.map((row, i) =>
                row.condition === profileCondition ? (
                  <tr key={i}>
                    <td><Cell editing={editing} value={row.speed} onChange={(x) => setEngine(i, 'speed', x)} /></td>
                    <td><Cell editing={editing} value={row.consME} onChange={(x) => setEngine(i, 'consME', x)} /></td>
                    <td><Cell editing={editing} value={row.consAE} onChange={(x) => setEngine(i, 'consAE', x)} /></td>
                    <td><Cell editing={editing} value={row.rpm} onChange={(x) => setEngine(i, 'rpm', x)} /></td>
                    <td><Cell editing={editing} value={row.mcrPercent} onChange={(x) => setEngine(i, 'mcrPercent', x)} /></td>
                    <td><Cell editing={editing} value={row.powerKw} onChange={(x) => setEngine(i, 'powerKw', x)} /></td>
                    <td><Cell editing={editing} value={row.eplLimit} onChange={(x) => setEngine(i, 'eplLimit', x)} /></td>
                  </tr>
                ) : null,
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}
