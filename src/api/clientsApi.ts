import { api } from './client';

export interface ClientContactDto {
  id: string;
  clientId: string;
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  isPrimary: boolean;
  isActive: boolean;
}

/** Backend `Kind` is a single token: 'Account' or 'ServiceProvider' (no space). */
export interface BackendClientDto {
  id: string;
  name: string;
  kind: string;
  category: string;
  location?: string | null;
  email?: string | null;
  contactName?: string | null;
  phone?: string | null;
  websiteUrl?: string | null;
  role?: string | null;
  isActive: boolean;
  picAssignment?: string | null;
  bankName?: string | null;
  accountHolder?: string | null;
  accountNumber?: string | null;
  swift?: string | null;
  iban?: string | null;
  bankAccountVerified: boolean;
  complianceStatus?: string | null;
  complianceCheckDate?: string | null;
  notes?: string | null;
  contacts: ClientContactDto[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CreateClientDto {
  name: string;
  kind: string;
  category: string;
  location?: string;
  email?: string;
  contactName?: string;
  phone?: string;
  websiteUrl?: string;
  role?: string;
  picAssignment?: string;
  bankName?: string;
  accountHolder?: string;
  accountNumber?: string;
  swift?: string;
  iban?: string;
  notes?: string;
}

export type UpdateClientDto = CreateClientDto & { isActive?: boolean; bankAccountVerified?: boolean };

export const clientsApi = {
  list: () => api.get<BackendClientDto[]>('/api/clients'),
  get: (id: string) => api.get<BackendClientDto>(`/api/clients/${encodeURIComponent(id)}`),
  create: (dto: CreateClientDto) => api.post<BackendClientDto>('/api/clients', dto),
  update: (id: string, dto: UpdateClientDto) => api.put<BackendClientDto>(`/api/clients/${id}`, dto),
  delete: (id: string) => api.delete<void>(`/api/clients/${id}`),
};
