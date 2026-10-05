export type UserRole = 'SuperAdmin' | 'Admin' | 'Employee' | 'VesselMaster';

export type SubscriptionStatus = 'Active' | 'Trial' | 'Suspended' | 'Cancelled';

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  errors?: string[];
}

// Auth DTOs
export interface LoginRequestDto {
  email: string;
  password: string;
}

export interface RefreshTokenRequestDto {
  refreshToken: string;
}

export interface AuthResponseDto {
  userId: string;
  fullName: string;
  email: string;
  role: UserRole;
  tenantId?: string | null;
  companyName?: string | null;
  assignedVesselImo?: string | null;
  assignedVesselName?: string | null;
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface UserProfileDto {
  id: string;
  fullName: string;
  email: string;
  phoneNumber?: string | null;
  role: UserRole;
  tenantId?: string | null;
  companyName?: string | null;
  assignedVesselImo?: string | null;
  assignedVesselName?: string | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
}

// SuperAdmin DTOs
export interface TenantDto {
  id: string;
  companyName: string;
  adminUserId: string;
  adminFullName: string;
  adminEmail: string;
  isActive: boolean;
  subscriptionStatus: SubscriptionStatus;
  createdAt: string;
  activeUsersCount: number;
  enabledModulesCount: number;
}

export interface CreateAdminRequestDto {
  companyName: string;
  adminFullName: string;
  adminEmail: string;
  adminPassword: string;
  adminPhoneNumber?: string;
  initialModuleIds?: string[];
}

export interface UpdateTenantStatusRequestDto {
  isActive: boolean;
  subscriptionStatus?: SubscriptionStatus;
}

export interface ModuleDto {
  id: string;
  name: string;
  description?: string | null;
  isGlobalActive: boolean;
  createdAt: string;
}

export interface CreateModuleRequestDto {
  name: string;
  description?: string;
  isGlobalActive?: boolean;
}

export interface TenantModuleAccessDto {
  id: string;
  tenantId: string;
  moduleId: string;
  moduleName: string;
  moduleDescription?: string | null;
  isEnabled: boolean;
  isGlobalActive: boolean;
  grantedAt: string;
  grantedByUserName: string;
}

export interface SetTenantModuleAccessRequestDto {
  tenantId: string;
  moduleId: string;
  isEnabled: boolean;
}

export type TenantUserRole = 'Admin' | 'Employee' | 'VesselMaster';
export type TenantUserRoleLabel = 'Manager' | 'Executive' | 'Vessel';

export interface CreateTenantUserRequestDto {
  tenantId: string;
  fullName: string;
  email: string;
  password: string;
  role: TenantUserRole;
  initialModuleIds?: string[];
  phoneNumber?: string;
  assignedVesselImo?: string;
  assignedVesselName?: string;
}

export interface TenantUserPermissionDto {
  moduleId: string;
  moduleName: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface TenantUserDto {
  id: string;
  tenantId: string;
  fullName: string;
  email: string;
  role: TenantUserRole;
  phoneNumber?: string | null;
  assignedVesselImo?: string | null;
  assignedVesselName?: string | null;
  isActive: boolean;
  createdAt: string;
  permissions: TenantUserPermissionDto[];
}

export interface UpdateTenantUserRequestDto {
  fullName: string;
  phoneNumber?: string;
  assignedVesselImo?: string;
  assignedVesselName?: string;
  isActive: boolean;
}

export interface SetTenantUserPermissionsRequestDto {
  userId: string;
  permissions: Array<Omit<TenantUserPermissionDto, 'moduleName'>>;
}

// Admin DTOs
export interface EmployeePermissionInputDto {
  moduleId: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface EmployeePermissionDto {
  id: string;
  moduleId: string;
  moduleName: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  assignedAt: string;
}

export interface EmployeeDto {
  id: string;
  fullName: string;
  email: string;
  phoneNumber?: string | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
  permissions: EmployeePermissionDto[];
}

export interface CreateEmployeeRequestDto {
  fullName: string;
  email: string;
  password: string;
  phoneNumber?: string;
  permissions?: EmployeePermissionInputDto[];
}

export interface UpdateEmployeeRequestDto {
  fullName: string;
  phoneNumber?: string;
  isActive: boolean;
}

export interface SetEmployeeModulePermissionsRequestDto {
  employeeUserId: string;
  permissions: EmployeePermissionInputDto[];
}

export interface AdminTenantModuleDto {
  moduleId: string;
  moduleName: string;
  description?: string | null;
  isEnabledForTenant: boolean;
  isGlobalActive: boolean;
}

// Employee DTOs
export interface EmployeeModuleAccessDto {
  moduleId: string;
  moduleName: string;
  description?: string | null;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}
