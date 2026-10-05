import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authApi } from '../api/authApi';
import { adminApi } from '../api/adminApi';
import { employeeApi } from '../api/employeeApi';
import { superAdminApi } from '../api/superAdminApi';
import { tokenStorage } from '../api/client';
import { migrateLocalSettingsToDatabase } from '../api/settingsApi';
import type {
  AdminTenantModuleDto,
  AuthResponseDto,
  EmployeeModuleAccessDto,
  ModuleDto,
  UserProfileDto,
  UserRole,
} from '../types/auth';

export interface AuthContextValue {
  user: UserProfileDto | null;
  role: UserRole | null;
  tenantId: string | null;
  companyName: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string, remember?: boolean) => Promise<AuthResponseDto>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  hasRole: (roles: UserRole | UserRole[]) => boolean;
  hasModule: (moduleName: string) => boolean;
  hasPermission: (
    moduleName: string,
    permission?: 'canView' | 'canCreate' | 'canEdit' | 'canDelete',
  ) => boolean;
  assignedModules: EmployeeModuleAccessDto[];
  tenantModules: AdminTenantModuleDto[];
  systemModules: ModuleDto[];
}

const AuthReactContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfileDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [assignedModules, setAssignedModules] = useState<EmployeeModuleAccessDto[]>([]);
  const [tenantModules, setTenantModules] = useState<AdminTenantModuleDto[]>([]);
  const [systemModules, setSystemModules] = useState<ModuleDto[]>([]);

  const loadModulePermissions = useCallback(async (role: UserRole) => {
    try {
      if (role === 'Employee') {
        const myMods = await employeeApi.getMyModules();
        setAssignedModules(myMods ?? []);
      } else if (role === 'Admin') {
        const tMods = await adminApi.getTenantModules();
        setTenantModules(tMods ?? []);
      } else if (role === 'SuperAdmin') {
        const sMods = await superAdminApi.getModules();
        setSystemModules(sMods ?? []);
      }
    } catch {
      // Non-blocking permission fetch failure
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const token = tokenStorage.getAccessToken();
    if (!token) {
      setUser(null);
      setAssignedModules([]);
      setTenantModules([]);
      setSystemModules([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const profile = await authApi.getMe();
      setUser(profile);
      await loadModulePermissions(profile.role);
      void migrateLocalSettingsToDatabase();
    } catch (err: unknown) {
      setUser(null);
      tokenStorage.clearAuth();
      const msg = err instanceof Error ? err.message : 'Authentication session expired.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [loadModulePermissions]);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = useCallback(
    async (email: string, password: string, remember: boolean = true) => {
      setIsLoading(true);
      setError(null);
      try {
        const authData = await authApi.login({ email, password }, remember);
        const profile: UserProfileDto = {
          id: authData.userId,
          fullName: authData.fullName,
          email: authData.email,
          role: authData.role,
          tenantId: authData.tenantId,
          companyName: authData.companyName,
          isActive: true,
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
        };
        setUser(profile);
        await loadModulePermissions(authData.role);
        void migrateLocalSettingsToDatabase();
        return authData;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Login failed.';
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [loadModulePermissions],
  );

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await authApi.logout();
    } catch {
      tokenStorage.clearAuth();
    } finally {
      setUser(null);
      setAssignedModules([]);
      setTenantModules([]);
      setSystemModules([]);
      setIsLoading(false);
    }
  }, []);

  const hasRole = useCallback(
    (roles: UserRole | UserRole[]) => {
      if (!user) return false;
      const targetRoles = Array.isArray(roles) ? roles : [roles];
      return targetRoles.includes(user.role);
    },
    [user],
  );

  const hasModule = useCallback(
    (moduleName: string) => {
      if (!user) return false;
      if (user.role === 'SuperAdmin') return true;

      const norm = moduleName.trim().toUpperCase();

      if (user.role === 'Admin') {
        return tenantModules.some(
          (m) => m.moduleName.trim().toUpperCase() === norm && m.isEnabledForTenant,
        );
      }

      if (user.role === 'Employee') {
        return assignedModules.some(
          (m) => m.moduleName.trim().toUpperCase() === norm && m.canView,
        );
      }

      return false;
    },
    [user, tenantModules, assignedModules],
  );

  const hasPermission = useCallback(
    (
      moduleName: string,
      permission: 'canView' | 'canCreate' | 'canEdit' | 'canDelete' = 'canView',
    ) => {
      if (!user) return false;
      if (user.role === 'SuperAdmin') return true;

      const norm = moduleName.trim().toUpperCase();

      if (user.role === 'Admin') {
        return tenantModules.some(
          (m) => m.moduleName.trim().toUpperCase() === norm && m.isEnabledForTenant,
        );
      }

      if (user.role === 'Employee') {
        const perm = assignedModules.find(
          (m) => m.moduleName.trim().toUpperCase() === norm,
        );
        if (!perm) return false;
        return Boolean(perm[permission]);
      }

      return false;
    },
    [user, tenantModules, assignedModules],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      role: user?.role ?? null,
      tenantId: user?.tenantId ?? null,
      companyName: user?.companyName ?? null,
      isAuthenticated: Boolean(user),
      isLoading,
      error,
      login,
      logout,
      refreshUser,
      hasRole,
      hasModule,
      hasPermission,
      assignedModules,
      tenantModules,
      systemModules,
    }),
    [
      user,
      isLoading,
      error,
      login,
      logout,
      refreshUser,
      hasRole,
      hasModule,
      hasPermission,
      assignedModules,
      tenantModules,
      systemModules,
    ],
  );

  return <AuthReactContext.Provider value={value}>{children}</AuthReactContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthReactContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
