import { RobCalculation } from './EtaRobCalculation';
import { InterimTabs } from './InterimTabs';

/**
 * ROB Calculation page — `/rob-calculation`.
 *
 * Reached from the "ROB Calculation" tab under the Interim Dashboard.
 * Hosts the multiple-speed ETA & ROB itinerary.
 */
export function RobCalculationPage() {
  return (
    <div className="fv-voyage">
      <header className="fv-voyage__header">
        <div className="fv-voyage__heading">
          <span className="fv-voyage__heading-icon" aria-hidden="true">
            <i className="fas fa-gas-pump" />
          </span>
          <h1>ROB Calculation</h1>
        </div>
      </header>

      <InterimTabs active="rob" />

      <RobCalculation />
    </div>
  );
}
