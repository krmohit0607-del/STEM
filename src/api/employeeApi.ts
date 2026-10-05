import { api } from './client';
import type { EmployeeModuleAccessDto } from '../types/auth';

export const employeeApi = {
  getMyModules: () => api.get<EmployeeModuleAccessDto[]>('/api/employee/my-modules'),
};
