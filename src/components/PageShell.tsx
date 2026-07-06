import type { ReactNode } from 'react';

/**
 * Shared shell used by routes that should display the main content
 * full-width (e.g. `/main`). The dashboard route (`/`) uses
 * `<Layout />` directly because it has a different inner structure
 * (map + bottom panel + LeftSidebar).
 */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="fv-page-shell">
      <main className="fv-page-shell__content">{children}</main>
    </div>
  );
}
