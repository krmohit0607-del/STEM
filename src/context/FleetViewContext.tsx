import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { api, ApiError } from '../api/client';
import type { AuthenticatedUserDto, CurrentUser } from '../types';

/**
 * Equivalent of the legacy global `context` (FleetViewContext.js) for the
 * pieces the shell actually uses: current user, roles, currentPortal, and
 * the role-check helper. `map` and the dozens of dialog/feature flags from
 * the legacy class are intentionally not ported here.
 */
export interface FleetViewContextValue {
  user: CurrentUser | undefined;
  roles: string[];
  /** True when `/api/security/users/current` is in flight on first load. */
  isLoading: boolean;
  /** Truthy when the API call failed (e.g. unauthenticated). */
  error: ApiError | undefined;
  /** True when running on a DEV stub user because the API was unreachable. */
  isStubbed: boolean;
  /** Currently selected portal index (matches legacy `context.user.currentPortal`). */
  currentPortal: number;
  setCurrentPortal: (index: number) => void;
  /** Reproduces the legacy `context.isInRole('A, B, C')` semantics (any-of). */
  isInRole: (rolesCsv: string) => boolean;
  /** Force a refresh of the current user. */
  refresh: () => Promise<void>;
}

const FleetViewReactContext = createContext<FleetViewContextValue | undefined>(undefined);

/**
 * Dev-mode stub user. The auth flow is cross-origin (cookie set on
 * `localhost:5001`, app served from `localhost:5173`), so during local
 * development the `/api/security/users/current` call will usually fail.
 * In `vite dev` (`import.meta.env.DEV`) we fall back to this stub so the
 * layout actually renders. Production builds (`vite build`) never use it.
 */
const DEV_STUB_USER: CurrentUser = {
  id: 0,
  name: 'dev.user',
  fullName: 'Dev User',
  email: 'dev.user@example.com',
  Roles: [
    { id: 1, text: 'Administrator' },
    { id: 2, text: 'Manager' },
    { id: 3, text: 'Operations Manager' },
  ],
  currentPortal: 0,
};

function extractRoles(dto: AuthenticatedUserDto | undefined): string[] {
  const list = dto?.Roles ?? dto?.User?.Roles ?? dto?.CurrentUser?.Roles ?? [];
  return list.map((r) => r.text).filter((t): t is string => typeof t === 'string');
}

function pickUser(dto: AuthenticatedUserDto | undefined): CurrentUser | undefined {
  return dto?.CurrentUser ?? dto?.User;
}

export function FleetViewProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | undefined>(undefined);
  const [roles, setRoles] = useState<string[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>(undefined);
  const [currentPortal, setCurrentPortal] = useState(0);
  const [isStubbed, setIsStubbed] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    setIsStubbed(false);
    try {
      const dto = await api.get<AuthenticatedUserDto>('/api/security/users/current');
      const u = pickUser(dto);
      setUser(u);
      setRoles(extractRoles(dto));
      if (u && typeof u.currentPortal === 'number') setCurrentPortal(u.currentPortal);
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : new ApiError(0, String(err), err);
      // Allow the stub user when there is no real backend reachable. This is
      // gated by `import.meta.env.DEV` for local dev and by the
      // `VITE_ALLOW_STUB_USER` flag for hosted demo builds (e.g. Vercel)
      // where the .NET backend is not (yet) deployed.
      const allowStub =
        import.meta.env.DEV || import.meta.env.VITE_ALLOW_STUB_USER === 'true';
      if (allowStub) {
        // eslint-disable-next-line no-console
        console.warn(
          '[FleetView WebApp] /api/security/users/current failed — using stub user.',
          apiErr,
        );
        setUser(DEV_STUB_USER);
        setRoles(extractRoles({ Roles: DEV_STUB_USER.Roles }));
        setCurrentPortal(DEV_STUB_USER.currentPortal ?? 0);
        setIsStubbed(true);
        setError(undefined);
      } else {
        setError(apiErr);
        setUser(undefined);
        setRoles([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isInRole = useCallback(
    (rolesCsv: string) => {
      const wanted = rolesCsv.split(',').map((r) => r.trim()).filter(Boolean);
      return wanted.some((r) => roles.includes(r));
    },
    [roles],
  );

  const value = useMemo<FleetViewContextValue>(
    () => ({
      user,
      roles,
      isLoading,
      error,
      isStubbed,
      currentPortal,
      setCurrentPortal,
      isInRole,
      refresh,
    }),
    [user, roles, isLoading, error, isStubbed, currentPortal, isInRole, refresh],
  );

  return (
    <FleetViewReactContext.Provider value={value}>{children}</FleetViewReactContext.Provider>
  );
}

export function useFleetView(): FleetViewContextValue {
  const ctx = useContext(FleetViewReactContext);
  if (!ctx) throw new Error('useFleetView must be used inside <FleetViewProvider>');
  return ctx;
}
