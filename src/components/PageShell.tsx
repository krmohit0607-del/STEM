import type { ReactNode } from 'react';

import { LeftSidebar } from './LeftSidebar';

/**
 * Shared shell used by routes that should display the collapsible
 * left-side navigation alongside their main content (e.g. `/main`,
 * `/interim`). The dashboard route (`/`) uses `<Layout />` directly
 * because it has a different inner structure (map + bottom panel).
 */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="fv-page-shell">
      <LeftSidebar />
      <main className="fv-page-shell__content">{children}</main>
    </div>
  );
}
