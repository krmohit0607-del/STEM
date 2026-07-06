import { InterimTabs } from './InterimTabs';
import { VoyageEstimation } from './VoyageEstimation';

/**
 * Voyage Estimation page — `/voyage-estimation`.
 *
 * Reached from the "Voyage Estimation" tab under the Interim Dashboard.
 * Hosts the side-by-side voyage cost estimate / comparison.
 */
export function VoyageEstimationPage() {
  return (
    <div className="fv-voyage">
      <header className="fv-voyage__header">
        <div className="fv-voyage__heading">
          <span className="fv-voyage__heading-icon" aria-hidden="true">
            <i className="fas fa-chart-line" />
          </span>
          <h1>Voyage Estimation</h1>
        </div>
      </header>

      <InterimTabs active="estimation" />

      <VoyageEstimation />
    </div>
  );
}
