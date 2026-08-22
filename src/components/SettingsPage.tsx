import { SettingsModal } from './SettingsModal';

/**
 * Settings — `/settings`.
 *
 * Full-page admin settings panel (section list on the left, details on the
 * right). Reuses `SettingsModal`'s internals via its `asPage` mode so every
 * settings section stays in one place.
 */
export function SettingsPage() {
  return <SettingsModal open onClose={() => {}} asPage />;
}
