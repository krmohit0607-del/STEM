import { api } from './client';
import type {
  AdminTenantModuleDto,
  CreateEmployeeRequestDto,
  EmployeeDto,
  EmployeePermissionDto,
  SetEmployeeModulePermissionsRequestDto,
  UpdateEmployeeRequestDto,
} from '../types/auth';

export const adminApi = {
  getEmployees: () => api.get<EmployeeDto[]>('/api/admin/employees'),

  createEmployee: (dto: CreateEmployeeRequestDto) =>
    api.post<EmployeeDto>('/api/admin/employees', dto),

  updateEmployee: (id: string, dto: UpdateEmployeeRequestDto) =>
    api.put<EmployeeDto>(`/api/admin/employees/${id}`, dto),

  deactivateEmployee: (id: string) =>
    api.delete<void>(`/api/admin/employees/${id}`),

  getTenantModules: () =>
    api.get<AdminTenantModuleDto[]>('/api/admin/modules'),

  setEmployeePermissions: (dto: SetEmployeeModulePermissionsRequestDto) =>
    api.post<EmployeePermissionDto[]>('/api/admin/employee-permissions', dto),
};
