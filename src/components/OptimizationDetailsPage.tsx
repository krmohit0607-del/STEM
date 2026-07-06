import { EtaCalculation } from './EtaRobCalculation';
import { InterimTabs } from './InterimTabs';

/**
 * ETA Calculation page — `/optimization`.
 *
 * Reached from the "ETA Calculation" tab under the Interim Dashboard.
 * Hosts the ETA Calculation section; the ROB Calculation lives on its own tab.
 */

export function OptimizationDetailsPage() {
  return (
    <div className="fv-voyage">
      <header className="fv-voyage__header">
        <div className="fv-voyage__heading">
          <span className="fv-voyage__heading-icon" aria-hidden="true">
            <i className="fas fa-calculator" />
          </span>
          <h1>ETA Calculation</h1>
        </div>
      </header>

      <InterimTabs active="eta" />

      <EtaCalculation />
    </div>
  );
}
