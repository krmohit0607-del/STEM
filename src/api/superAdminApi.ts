import { api } from './client';
import type {
  CreateAdminRequestDto,
  CreateModuleRequestDto,
  ModuleDto,
  SetTenantModuleAccessRequestDto,
  TenantDto,
  TenantModuleAccessDto,
  CreateTenantUserRequestDto,
  TenantUserDto,
  SetTenantUserPermissionsRequestDto,
  UpdateTenantUserRequestDto,
  UpdateTenantStatusRequestDto,
} from '../types/auth';

export const superAdminApi = {
  getAdmins: () => api.get<TenantDto[]>('/api/superadmin/admins'),

  createAdmin: (dto: CreateAdminRequestDto) =>
    api.post<TenantDto>('/api/superadmin/admins', dto),

  updateTenantStatus: (tenantId: string, dto: UpdateTenantStatusRequestDto) =>
    api.put<TenantDto>(`/api/superadmin/admins/${tenantId}/status`, dto),

  deleteTenant: (tenantId: string) =>
    api.delete<void>(`/api/superadmin/admins/${tenantId}`),

  getModules: () => api.get<ModuleDto[]>('/api/superadmin/modules'),

  createModule: (dto: CreateModuleRequestDto) =>
    api.post<ModuleDto>('/api/superadmin/modules', dto),

  setTenantModuleAccess: (dto: SetTenantModuleAccessRequestDto) =>
    api.post<TenantModuleAccessDto>('/api/superadmin/tenant-module-access', dto),

  getTenantModuleAccess: (tenantId: string) =>
    api.get<TenantModuleAccessDto[]>(`/api/superadmin/tenant-module-access/${tenantId}`),

  getTenantUsers: (tenantId: string) =>
    api.get<TenantUserDto[]>(`/api/superadmin/tenants/${tenantId}/users`),

  createTenantUser: (dto: CreateTenantUserRequestDto) =>
    api.post<TenantUserDto>('/api/superadmin/tenants/users', dto),

  setTenantUserPermissions: (userId: string, dto: SetTenantUserPermissionsRequestDto) =>
    api.put<TenantUserDto>(`/api/superadmin/tenants/users/${userId}/permissions`, dto),

  updateTenantUser: (userId: string, dto: UpdateTenantUserRequestDto) =>
    api.put<TenantUserDto>(`/api/superadmin/tenants/users/${userId}`, dto),

  deleteTenantUser: (userId: string) =>
    api.delete<void>(`/api/superadmin/tenants/users/${userId}`),
};
