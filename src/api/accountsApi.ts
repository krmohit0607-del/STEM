import { api } from './client';

export interface FinancialTransactionDto {
  id: string;
  transactionNo: string;
  kind: 'Payable' | 'Receivable';
  category: string;
  module: string;
  company: string;
  vesselName: string;
  voyage: string;
  reference: string;
  fixture?: string | null;
  counterparty: string;
  invoiceNo: string;
  currency: string;
  amount: number;
  exchangeRate: number;
  invoiceDate: string;
  dueDate: string;
  dueIso: string;
  status: string;
  approval: string;
  priority: string;
  pic: string;
  bank?: string | null;
  method?: string | null;
  paymentDate?: string | null;
  paymentRef?: string | null;
  swiftDocUrl?: string | null;
  remarks?: string | null;
  auditJson?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface CreateFinancialTransactionDto {
  transactionNo?: string;
  kind: 'Payable' | 'Receivable';
  category: string;
  module: string;
  company?: string;
  vesselName: string;
  voyage: string;
  reference: string;
  fixture?: string;
  counterparty: string;
  invoiceNo: string;
  currency?: string;
  amount: number;
  exchangeRate?: number;
  invoiceDate?: string;
  dueDate?: string;
  dueIso?: string;
  status?: string;
  approval?: string;
  priority?: string;
  pic?: string;
  bank?: string;
  method?: string;
  paymentDate?: string;
  paymentRef?: string;
  swiftDocUrl?: string;
  remarks?: string;
  auditJson?: string;
}

export const accountsApi = {
  getTransactions: () => api.get<FinancialTransactionDto[]>('/api/accounts/transactions'),
  getTransaction: (idOrNo: string) => api.get<FinancialTransactionDto>(`/api/accounts/transactions/${encodeURIComponent(idOrNo)}`),
  createTransaction: (dto: CreateFinancialTransactionDto) => api.post<FinancialTransactionDto>('/api/accounts/transactions', dto),
  updateTransaction: (id: string, dto: CreateFinancialTransactionDto) => api.put<FinancialTransactionDto>(`/api/accounts/transactions/${id}`, dto),
};
