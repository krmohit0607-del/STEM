import { api } from './client';

export interface BunkerRequirementDto {
  id: string;
  requirementNo: string;
  priority: string;
  status: string;
  vesselName: string;
  imo?: string | null;
  reference?: string | null;
  leg?: string | null;
  route?: string | null;
  loadPort?: string | null;
  dischargePort?: string | null;
  bunkerPort: string;
  eta?: string | null;
  requiredOn?: string | null;
  requiredIso?: string | null;
  laycanStart?: string | null;
  laycanEnd?: string | null;
  fuelType: string;
  grade: string;
  quantity: number;
  robArrival: number;
  expectedCons: number;
  chartererInstructions?: string | null;
  ownerInstructions?: string | null;
  suppliersInvited: number;
  supplier?: string | null;
  pricePerMt?: number | null;
  totalCost?: number | null;
  poNo?: string | null;
  contractRef?: string | null;
  bookedOn?: string | null;
  confirmNo?: string | null;
  deliveryMethod?: string | null;
  suppliedQty?: number | null;
  deliveredQty?: number | null;
  supplyDateTime?: string | null;
  invoiceNo?: string | null;
  invoiceDate?: string | null;
  invoiceAmount?: number | null;
  paymentTerms?: string | null;
  dueDate?: string | null;
  dueIso?: string | null;
  amountPaid?: number | null;
  paymentRef?: string | null;
  paymentDate?: string | null;
  approvalStatus: string;
  paymentStatus: string;
  quotesJson?: string | null;
  fuelLinesJson?: string | null;
  additionalChargesJson?: string | null;
  claimsJson?: string | null;
  auditJson?: string | null;
  documentsJson?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface CreateBunkerRequirementDto {
  requirementNo?: string;
  priority?: string;
  status?: string;
  vesselName: string;
  imo?: string;
  reference?: string;
  leg?: string;
  route?: string;
  loadPort?: string;
  dischargePort?: string;
  bunkerPort: string;
  eta?: string;
  requiredOn?: string;
  requiredIso?: string;
  laycanStart?: string;
  laycanEnd?: string;
  fuelType?: string;
  grade?: string;
  quantity?: number;
  robArrival?: number;
  expectedCons?: number;
  chartererInstructions?: string;
  ownerInstructions?: string;
  suppliersInvited?: number;
  supplier?: string;
  pricePerMt?: number;
  totalCost?: number;
  poNo?: string;
  contractRef?: string;
  bookedOn?: string;
  confirmNo?: string;
  deliveryMethod?: string;
  suppliedQty?: number;
  deliveredQty?: number;
  supplyDateTime?: string;
  invoiceNo?: string;
  invoiceDate?: string;
  invoiceAmount?: number;
  paymentTerms?: string;
  dueDate?: string;
  dueIso?: string;
  amountPaid?: number;
  paymentRef?: string;
  paymentDate?: string;
  approvalStatus?: string;
  paymentStatus?: string;
  quotesJson?: string;
  fuelLinesJson?: string;
  additionalChargesJson?: string;
  claimsJson?: string;
  auditJson?: string;
  documentsJson?: string;
}

export const bunkerApi = {
  getRequirements: () => api.get<BunkerRequirementDto[]>('/api/bunker/requirements'),
  getRequirement: (idOrNo: string) => api.get<BunkerRequirementDto>(`/api/bunker/requirements/${encodeURIComponent(idOrNo)}`),
  createRequirement: (dto: CreateBunkerRequirementDto) => api.post<BunkerRequirementDto>('/api/bunker/requirements', dto),
  updateRequirement: (id: string, dto: CreateBunkerRequirementDto) => api.put<BunkerRequirementDto>(`/api/bunker/requirements/${id}`, dto),
  deleteRequirement: (id: string) => api.delete<void>(`/api/bunker/requirements/${id}`),
};
