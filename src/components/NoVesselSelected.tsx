import { useL } from '../i18n/LocalizationProvider';

/**
 * Placeholder shown on a details page when no vessel is selected — e.g. right
 * after switching modules. The details reappear once the user picks a vessel
 * from the fleet list on the left.
 */
export function NoVesselSelected() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  return (
    <div className="fv-no-vessel">
      <i className="fas fa-ship" aria-hidden="true" />
      <p>
        {t(
          'selectVesselPrompt',
          'Select a vessel from the list on the left to view its details.',
        )}
      </p>
    </div>
  );
}
