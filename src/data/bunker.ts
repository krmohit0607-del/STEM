import { useSyncExternalStore } from 'react';

/**
 * Bunker Management data model + mock dataset, shared between the Bunker page
 * (`BunkerManagementPage`) and the left fleet menu (`FleetMenu`) so selecting a
 * vessel/requirement on the left drives the detail panel on the right.
 *
 * Clean TypeScript interfaces keep the data layer ready for a backend API.
 */

export type BunkerStatus =
  | 'Pending RFQ'
  | 'RFQ Sent'
  | 'Quotes Received'
  | 'Supplier Selected'
  | 'Booked'
  | 'Supplied'
  | 'Invoice Received'
  | 'Manager Approval Pending'
  | 'Approved'
  | 'Sent to Accounts'
  | 'Payment Due'
  | 'Paid'
  | 'Closed';

export type PaymentStatus = 'Upcoming' | 'Due Today' | 'Due in 3 Days' | 'Due in 7 Days' | 'Overdue' | 'Paid' | 'Cancelled' | 'None';

export type ApprovalStatus = 'Not Submitted' | 'Awaiting Approval' | 'Approved' | 'Rejected' | 'Revision Requested';

export type Priority = 'High' | 'Medium' | 'Low';

/** A named charge on top of the fuel price (barging, port dues, agency fee, etc.). */
export interface AdditionalCharge {
  id: string;
  label: string;
  amount: number;
}

/** Common additional-charge presets shown in the "Add Charge" picker. */
export const ADDITIONAL_CHARGE_PRESETS = [
  'Barging Charge',
  'Port Dues',
  'Agency Fee',
  'Launch / Boat Charge',
  'Hose Connection Charge',
  'Sludge Removal',
  'Other',
] as const;

/** Sum of a requirement's/quote's additional charges (0 when none). */
export function sumAdditionalCharges(charges: AdditionalCharge[] | undefined): number {
  return (charges ?? []).reduce((sum, c) => sum + (c.amount || 0), 0);
}

/** A claim/deduction raised against the supplier (short supply, quality off-spec, delay, damage, etc.). */
export interface BunkerClaim {
  id: string;
  type: string;
  description: string;
  amount: number;
  status: 'Open' | 'Accepted' | 'Rejected' | 'Settled';
  raisedOn: string;
}

/** Common claim types shown in the "Add Claim" picker. */
export const BUNKER_CLAIM_TYPES = [
  'Short Supply (Quantity)',
  'Off-Spec / Quality',
  'Delivery Delay',
  'Barge / Equipment Damage',
  'Documentation Discrepancy',
  'Other',
] as const;

export const BUNKER_CLAIM_STATUSES = ['Open', 'Accepted', 'Rejected', 'Settled'] as const;

/** Sum of claims not rejected (i.e. still deductible from the supplier invoice). */
export function sumBunkerClaims(claims: BunkerClaim[] | undefined): number {
  return (claims ?? []).filter((c) => c.status !== 'Rejected').reduce((sum, c) => sum + (c.amount || 0), 0);
}

export interface Quote {
  supplier: string;
  pricePerMt: number;
  /** Barging/port/agency charges etc. on top of the fuel price. */
  additionalCharges?: AdditionalCharge[];
  totalCost: number;
  terms: string;
  deliveryDate: string;
  deliveryMethod: string;
  creditDays: number;
  rating: number;
  performance: number;
  score: number;
  recommended?: boolean;
}

export interface BunkerDoc {
  id: string;
  name: string;
  type: string;
  date: string;
}

export interface AuditEntry {
  user: string;
  role: string;
  at: string;
  action: string;
}

/** One fuel type line within a bunker requirement (multiple per port call). */
export interface FuelLine {
  fuel: string;
  quantity: number;
  grade: string;
  suppliedQty?: number;
  deliveredQty?: number;
}

export interface BunkerRequirement {
  id: string;
  priority: Priority;
  status: BunkerStatus;
  vessel: string;
  imo: string;
  /** Shared cross-module reference (Chartering / Operations / Bunker / Performance use the same one). */
  reference: string;
  leg: string;
  route: string;
  loadPort: string;
  dischargePort: string;
  bunkerPort: string;
  eta: string;
  requiredOn: string;
  requiredIso: string;
  /** Primary fuel type (first line) — kept for backward compat; use fuelLines for full list. */
  fuelType: string;
  grade: string;
  quantity: number;
  /** All fuel types requested at this port. Replaces the single fuelType/quantity for new requirements. */
  fuelLines?: FuelLine[];
  robArrival: number;
  expectedCons: number;
  chartererInstructions: string;
  ownerInstructions: string;
  suppliersInvited: number;
  quotes: Quote[];
  supplier?: string;
  pricePerMt?: number;
  /** Additional charges carried over from the booked quote (barging, port dues, agency fee, etc.). */
  additionalCharges?: AdditionalCharge[];
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
  approvalStatus: ApprovalStatus;
  paymentStatus: PaymentStatus;
  /** Claims/deductions raised against the supplier (short supply, off-spec, delay, damage, etc.). */
  claims?: BunkerClaim[];
  lastUpdated: string;
  documents: BunkerDoc[];
  audit: AuditEntry[];
}

/* --------- status ordering + tone maps --------- */

export const STATUS_ORDER: BunkerStatus[] = [
  'Pending RFQ',
  'RFQ Sent',
  'Quotes Received',
  'Supplier Selected',
  'Booked',
  'Supplied',
  'Invoice Received',
  'Manager Approval Pending',
  'Approved',
  'Sent to Accounts',
  'Payment Due',
  'Paid',
  'Closed',
];
export function reached(status: BunkerStatus, stage: BunkerStatus): boolean {
  return STATUS_ORDER.indexOf(status) >= STATUS_ORDER.indexOf(stage);
}

export const STATUS_TONE: Record<BunkerStatus, string> = {
  'Pending RFQ': 'pending',
  'RFQ Sent': 'rfq',
  'Quotes Received': 'quotes',
  'Supplier Selected': 'selected',
  Booked: 'booked',
  Supplied: 'supplied',
  'Invoice Received': 'invoice',
  'Manager Approval Pending': 'approval',
  Approved: 'approved',
  'Sent to Accounts': 'accounts',
  'Payment Due': 'due',
  Paid: 'paid',
  Closed: 'closed',
};

export const PAYMENT_TONE: Record<PaymentStatus, string> = {
  Upcoming: 'blue',
  'Due Today': 'amber',
  'Due in 3 Days': 'amber',
  'Due in 7 Days': 'amber',
  Overdue: 'red',
  Paid: 'green',
  Cancelled: 'grey',
  None: 'grey',
};

export const APPROVAL_TONE: Record<ApprovalStatus, string> = {
  'Not Submitted': 'grey',
  'Awaiting Approval': 'amber',
  Approved: 'green',
  Rejected: 'red',
  'Revision Requested': 'purple',
};

/* --------- left-sidebar buckets + type filters --------- */

export type BunkerBucket = 'rfq' | 'booked' | 'supplied' | 'paid';

export const BUNKER_TABS: { key: BunkerBucket; label: string }[] = [
  { key: 'rfq', label: 'RFQ' },
  { key: 'booked', label: 'Booked' },
  { key: 'supplied', label: 'Supplied' },
  { key: 'paid', label: 'Paid' },
];

/** Coarse lifecycle bucket used by the left-sidebar status tabs. */
export function bucketOf(r: BunkerRequirement): BunkerBucket {
  if (r.status === 'Paid' || r.status === 'Closed' || r.paymentStatus === 'Paid') return 'paid';
  if (reached(r.status, 'Supplied')) return 'supplied';
  if (reached(r.status, 'Booked')) return 'booked';
  return 'rfq';
}

/** Fine-grained "Type" dropdown options for the Bunker module. `All`/`Requirement` = all. */
export const BUNKER_TYPE_FILTERS = [
  'All',
  'Requirement',
  'Pending RFQ',
  'RFQ Sent',
  'Quotes',
  'Booked',
  'Supplied',
  'Awaiting Approval',
  'Payment Due',
  'Overdue',
  'Paid',
] as const;
export type BunkerTypeFilter = (typeof BUNKER_TYPE_FILTERS)[number];

export function matchesTypeFilter(r: BunkerRequirement, filter: string): boolean {
  switch (filter) {
    case 'All':
    case 'Requirement':
      return true;
    case 'Pending RFQ':
      return r.status === 'Pending RFQ';
    case 'RFQ Sent':
      return r.status === 'RFQ Sent';
    case 'Quotes':
      return r.status === 'Quotes Received' || r.status === 'Supplier Selected';
    case 'Booked':
      return r.status === 'Booked';
    case 'Supplied':
      return r.status === 'Supplied';
    case 'Awaiting Approval':
      return r.approvalStatus === 'Awaiting Approval';
    case 'Payment Due':
      return r.status === 'Payment Due' && r.paymentStatus !== 'Overdue';
    case 'Overdue':
      return r.paymentStatus === 'Overdue';
    case 'Paid':
      return r.paymentStatus === 'Paid';
    default:
      return true;
  }
}

/* ------------------------------------------------------------ mock data */

function seed(): BunkerRequirement[] {
  const q = (supplier: string, pricePerMt: number, qty: number, creditDays: number, rating: number, performance: number, method: string, deliveryDate: string): Quote => ({
    supplier,
    pricePerMt,
    totalCost: Math.round(pricePerMt * qty),
    terms: `${creditDays} days credit`,
    deliveryDate,
    deliveryMethod: method,
    creditDays,
    rating,
    performance,
    score: 0,
  });

  const rows: BunkerRequirement[] = [
    {
      id: 'BR-2606-024', priority: 'High', status: 'Pending RFQ',
      vessel: 'MV ABC', imo: '9456123', leg: 'LEG-1', route: 'Singapore → Cape Town',
      loadPort: 'Singapore', dischargePort: 'Cape Town', bunkerPort: 'Singapore', eta: '14 Jun 2026, 06:00 LT',
      requiredOn: '12 Jun 2026, 10:00 LT', requiredIso: '2026-06-12T10:00', fuelType: 'VLSFO', grade: 'ISO 8217:2017 RMG 380',
      quantity: 1800, robArrival: 210, expectedCons: 62, chartererInstructions: 'Bunker as per charterers nomination.', ownerInstructions: 'Confirm sulphur ≤ 0.50%.',
      reference: 'VOY-2606-024', suppliersInvited: 0, quotes: [],
      approvalStatus: 'Not Submitted', paymentStatus: 'None', lastUpdated: '16 Jun 2026, 09:10',
      documents: [], audit: [{ user: 'A. Nair', role: 'Operations', at: '16 Jun 2026, 09:10', action: 'Requirement created from voyage plan' }],
    },
    {
      id: 'BR-2606-023', priority: 'Medium', status: 'RFQ Sent',
      vessel: 'MV Oceanic Star', imo: '9556781', leg: 'LEG-2', route: 'China → Brazil',
      loadPort: 'Qingdao', dischargePort: 'Santos', bunkerPort: 'Fujairah', eta: '16 Jun 2026, 12:00 LT',
      requiredOn: '15 Jun 2026, 08:00 LT', requiredIso: '2026-06-15T08:00', fuelType: 'VLSFO', grade: 'ISO 8217:2017 RMG 380',
      quantity: 1500, robArrival: 180, expectedCons: 58, chartererInstructions: 'Two grades not required.', ownerInstructions: 'Prefer Fujairah anchorage delivery.',
      reference: 'VOY-2606-023', suppliersInvited: 6,
      quotes: [q('Peninsula', 612, 1500, 30, 4.4, 96, 'Barge', '15 Jun 2026'), q('Monjasa', 618, 1500, 30, 4.1, 92, 'Barge', '15 Jun 2026'), q('GAC Bunkers', 621, 1500, 21, 4.3, 94, 'Barge', '16 Jun 2026')],
      approvalStatus: 'Not Submitted', paymentStatus: 'None', lastUpdated: '16 Jun 2026, 08:40',
      documents: [{ id: 'd1', name: 'RFQ-2606-023.pdf', type: 'RFQ', date: '15 Jun 2026' }],
      audit: [{ user: 'R. Khan', role: 'Bunker Team', at: '15 Jun 2026, 14:05', action: 'RFQ emailed to 6 suppliers' }],
    },
    {
      id: 'BR-2606-022', priority: 'Medium', status: 'Quotes Received',
      vessel: 'MV Global Ace', imo: '9601234', leg: 'LEG-1', route: 'Richards Bay → Japan',
      loadPort: 'Richards Bay', dischargePort: 'Chiba', bunkerPort: 'Singapore', eta: '17 Jun 2026, 09:00 LT',
      requiredOn: '16 Jun 2026, 12:00 LT', requiredIso: '2026-06-16T12:00', fuelType: 'MGO', grade: 'ISO 8217:2017 DMA',
      quantity: 200, robArrival: 45, expectedCons: 9, chartererInstructions: 'Low-sulphur MGO for ECA transit.', ownerInstructions: 'Lab sample mandatory.',
      reference: 'VOY-2606-022', suppliersInvited: 6,
      quotes: [
        q('Ocean Bunkers', 662, 200, 30, 4.8, 98, 'Ex-pipe', '17 Jun 2026'),
        q('World Fuel', 671, 200, 21, 4.5, 95, 'Barge', '17 Jun 2026'),
        q('Vitol', 668, 200, 30, 4.6, 96, 'Barge', '18 Jun 2026'),
        q('Peninsula', 675, 200, 15, 4.2, 90, 'Barge', '18 Jun 2026'),
      ],
      supplier: undefined, pricePerMt: 662, totalCost: 132_500,
      approvalStatus: 'Not Submitted', paymentStatus: 'None', lastUpdated: '16 Jun 2026, 07:55',
      documents: [{ id: 'd1', name: 'Quotes-Comparison-022.xlsx', type: 'Supplier Quote', date: '16 Jun 2026' }],
      audit: [{ user: 'R. Khan', role: 'Bunker Team', at: '16 Jun 2026, 07:55', action: '4 quotations received' }],
    },
    {
      id: 'BR-2606-021', priority: 'High', status: 'Booked',
      vessel: 'MV Pacific Wind', imo: '9633441', leg: 'LEG-2', route: 'Australia → India',
      loadPort: 'Port Hedland', dischargePort: 'Visakhapatnam', bunkerPort: 'Durban, South Africa', eta: '18 Jun 2026, 08:30 LT',
      requiredOn: '17 Jun 2026, 09:00 LT', requiredIso: '2026-06-17T09:00', fuelType: 'VLSFO', grade: 'ISO 8217:2017 RMG 380',
      quantity: 1200, robArrival: 380, expectedCons: 55, chartererInstructions: 'As per charterers instruction.', ownerInstructions: 'Max sulphur 0.50%. Density max at 15°C: 991.',
      reference: 'VOY-2606-021', suppliersInvited: 5,
      quotes: [
        q('Ocean Bunkers', 690, 1200, 15, 4.8, 98, 'Truck to Vessel', '17 Jun 2026'),
        q('Monjasa', 702, 1200, 30, 4.1, 92, 'Barge', '17 Jun 2026'),
        q('GAC Bunkers', 698, 1200, 21, 4.3, 94, 'Barge', '18 Jun 2026'),
      ],
      supplier: 'Ocean Bunkers', pricePerMt: 690, totalCost: 828_000,
      poNo: 'PO-2606-122', contractRef: 'CON-OB-06-08', bookedOn: '14 Jun 2026, 16:20', confirmNo: 'OB-SIN-67890', deliveryMethod: 'Truck to Vessel',
      approvalStatus: 'Not Submitted', paymentStatus: 'None', lastUpdated: '14 Jun 2026, 16:20',
      documents: [
        { id: 'd1', name: 'PO-2606-122.pdf', type: 'Purchase Order', date: '14 Jun 2026' },
        { id: 'd2', name: 'Contract CON-OB-06-08.pdf', type: 'Contract', date: '14 Jun 2026' },
        { id: 'd3', name: 'Booking-Confirmation.pdf', type: 'Booking Confirmation', date: '14 Jun 2026' },
      ],
      audit: [
        { user: 'R. Khan', role: 'Bunker Team', at: '14 Jun 2026, 16:20', action: 'Booked Ocean Bunkers @ USD 690/MT' },
        { user: 'R. Khan', role: 'Bunker Team', at: '14 Jun 2026, 15:40', action: 'Supplier selected: Ocean Bunkers' },
      ],
    },
    {
      id: 'BR-2606-020', priority: 'Low', status: 'Supplied',
      vessel: 'MV Horizon', imo: '9588120', leg: 'LEG-1', route: 'W. Africa → Europe',
      loadPort: 'Lagos', dischargePort: 'Rotterdam', bunkerPort: 'Las Palmas', eta: '19 Jun 2026, 07:30 LT',
      requiredOn: '18 Jun 2026, 11:00 LT', requiredIso: '2026-06-18T11:00', fuelType: 'VLSFO', grade: 'ISO 8217:2017 RMG 380',
      quantity: 800, robArrival: 150, expectedCons: 40, chartererInstructions: 'Standard delivery.', ownerInstructions: 'BDN + sample required.',
      reference: 'VOY-2606-020', suppliersInvited: 4,
      quotes: [q('GAC Bunkers', 685, 800, 21, 4.3, 94, 'Barge', '18 Jun 2026')],
      supplier: 'GAC Bunkers', pricePerMt: 685, totalCost: 548_000,
      poNo: 'PO-2606-118', contractRef: 'CON-GAC-06-04', bookedOn: '12 Jun 2026, 10:00', confirmNo: 'GAC-LPA-4412', deliveryMethod: 'Barge',
      suppliedQty: 800, deliveredQty: 798, supplyDateTime: '18 Jun 2026, 09:40 LT',
      approvalStatus: 'Not Submitted', paymentStatus: 'None', lastUpdated: '18 Jun 2026, 15:20',
      documents: [
        { id: 'd1', name: 'BDN-LPA-4412.pdf', type: 'BDN', date: '18 Jun 2026' },
        { id: 'd2', name: 'Delivery-Receipt.pdf', type: 'Delivery Receipt', date: '18 Jun 2026' },
        { id: 'd3', name: 'Lab-Analysis.pdf', type: 'Lab Analysis', date: '18 Jun 2026' },
      ],
      audit: [{ user: 'M. Osei', role: 'Bunker Team', at: '18 Jun 2026, 15:20', action: 'Bunkering completed — 798 MT delivered' }],
    },
    {
      id: 'BR-2606-019', priority: 'Medium', status: 'Payment Due',
      vessel: 'MV Blue Whale', imo: '9522004', leg: 'LEG-2', route: 'SE Asia → Korea',
      loadPort: 'Jakarta', dischargePort: 'Busan', bunkerPort: 'Singapore', eta: '20 Jun 2026, 05:00 LT',
      requiredOn: '19 Jun 2026, 14:00 LT', requiredIso: '2026-06-19T14:00', fuelType: 'MGO', grade: 'ISO 8217:2017 DMA',
      quantity: 150, robArrival: 30, expectedCons: 7, chartererInstructions: 'ECA compliant MGO.', ownerInstructions: 'Sample retained 12 months.',
      reference: 'VOY-2606-019', suppliersInvited: 5,
      quotes: [q('Ocean Bunkers', 630, 150, 30, 4.8, 98, 'Barge', '11 Jun 2026')],
      supplier: 'Ocean Bunkers', pricePerMt: 630, totalCost: 94_500,
      poNo: 'PO-2606-110', contractRef: 'CON-OB-06-01', bookedOn: '08 Jun 2026, 09:15', confirmNo: 'OB-SIN-66120', deliveryMethod: 'Barge',
      suppliedQty: 150, deliveredQty: 150, supplyDateTime: '11 Jun 2026, 14:20 LT',
      invoiceNo: 'INV-OB-66120', invoiceDate: '13 Jun 2026', invoiceAmount: 94_500, paymentTerms: '15 days from BDN', dueDate: '28 Jun 2026', dueIso: '2026-06-28',
      amountPaid: 0, approvalStatus: 'Approved', paymentStatus: 'Due in 7 Days', lastUpdated: '16 Jun 2026, 06:30',
      documents: [
        { id: 'd1', name: 'INV-OB-66120.pdf', type: 'Invoice', date: '13 Jun 2026' },
        { id: 'd2', name: 'BDN-SIN-66120.pdf', type: 'BDN', date: '11 Jun 2026' },
      ],
      audit: [
        { user: 'S. Rao', role: 'Manager', at: '14 Jun 2026, 10:00', action: 'Invoice approved' },
        { user: 'R. Khan', role: 'Bunker Team', at: '13 Jun 2026, 16:00', action: 'Invoice uploaded' },
      ],
    },
    {
      id: 'BR-2606-018', priority: 'High', status: 'Payment Due',
      vessel: 'MV Seafarer', imo: '9499871', leg: 'LEG-2', route: 'India → UAE',
      loadPort: 'Mundra', dischargePort: 'Jebel Ali', bunkerPort: 'Fujairah', eta: '21 Jun 2026, 03:00 LT',
      requiredOn: '20 Jun 2026, 10:00 LT', requiredIso: '2026-06-20T10:00', fuelType: 'VLSFO', grade: 'ISO 8217:2017 RMG 380',
      quantity: 1000, robArrival: 120, expectedCons: 48, chartererInstructions: 'Prompt delivery required.', ownerInstructions: 'Density + water content check.',
      reference: 'VOY-2606-018', suppliersInvited: 5,
      quotes: [q('Monjasa', 650, 1000, 30, 4.1, 92, 'Barge', '05 Jun 2026')],
      supplier: 'Monjasa', pricePerMt: 650, totalCost: 325_000,
      poNo: 'PO-2606-104', contractRef: 'CON-MJ-06-02', bookedOn: '02 Jun 2026, 11:30', confirmNo: 'MJ-FUJ-3390', deliveryMethod: 'Barge',
      suppliedQty: 1000, deliveredQty: 1000, supplyDateTime: '05 Jun 2026, 07:15 LT',
      invoiceNo: 'INV-MJ-3390', invoiceDate: '05 Jun 2026', invoiceAmount: 325_000, paymentTerms: '10 days from BDN', dueDate: '14 Jun 2026', dueIso: '2026-06-14',
      amountPaid: 0, approvalStatus: 'Approved', paymentStatus: 'Overdue', lastUpdated: '16 Jun 2026, 05:00',
      documents: [{ id: 'd1', name: 'INV-MJ-3390.pdf', type: 'Invoice', date: '05 Jun 2026' }],
      audit: [
        { user: 'Accounts', role: 'Accounts', at: '15 Jun 2026, 09:00', action: 'Payment overdue reminder raised' },
        { user: 'S. Rao', role: 'Manager', at: '06 Jun 2026, 10:00', action: 'Invoice approved' },
      ],
    },
    {
      id: 'BR-2606-017', priority: 'Low', status: 'Paid',
      vessel: 'MV Unity', imo: '9471120', leg: 'LEG-1', route: 'US Gulf → UK',
      loadPort: 'Houston', dischargePort: 'Immingham', bunkerPort: 'Houston', eta: '22 Jun 2026, 02:00 LT',
      requiredOn: '21 Jun 2026, 09:00 LT', requiredIso: '2026-06-21T09:00', fuelType: 'VLSFO', grade: 'ISO 8217:2017 RMG 380',
      quantity: 700, robArrival: 160, expectedCons: 44, chartererInstructions: 'Standard.', ownerInstructions: 'None.',
      reference: 'VOY-2606-017', suppliersInvited: 4,
      quotes: [q('World Fuel', 680, 700, 21, 4.5, 95, 'Barge', '01 Jun 2026')],
      supplier: 'World Fuel', pricePerMt: 680, totalCost: 476_000,
      poNo: 'PO-2606-098', contractRef: 'CON-WF-05-09', bookedOn: '29 May 2026, 09:00', confirmNo: 'WF-HOU-2210', deliveryMethod: 'Barge',
      suppliedQty: 700, deliveredQty: 700, supplyDateTime: '01 Jun 2026, 11:00 LT',
      invoiceNo: 'INV-WF-2210', invoiceDate: '01 Jun 2026', invoiceAmount: 476_000, paymentTerms: '21 days from BDN', dueDate: '10 Jun 2026', dueIso: '2026-06-10',
      amountPaid: 476_000, paymentRef: 'TT-2026-4471', paymentDate: '09 Jun 2026', approvalStatus: 'Approved', paymentStatus: 'Paid', lastUpdated: '09 Jun 2026, 14:10',
      documents: [
        { id: 'd1', name: 'INV-WF-2210.pdf', type: 'Invoice', date: '01 Jun 2026' },
        { id: 'd2', name: 'Payment-Advice.pdf', type: 'Payment Advice', date: '09 Jun 2026' },
      ],
      audit: [{ user: 'Accounts', role: 'Accounts', at: '09 Jun 2026, 14:10', action: 'Payment settled — TT-2026-4471' }],
    },
    {
      id: 'BR-2606-016', priority: 'Medium', status: 'Manager Approval Pending',
      vessel: 'MV Northern Light', imo: '9610087', leg: 'LEG-1', route: 'Brazil → China',
      loadPort: 'Tubarao', dischargePort: 'Qingdao', bunkerPort: 'Singapore', eta: '23 Jun 2026, 06:00 LT',
      requiredOn: '22 Jun 2026, 08:00 LT', requiredIso: '2026-06-22T08:00', fuelType: 'VLSFO', grade: 'ISO 8217:2017 RMG 380',
      quantity: 1600, robArrival: 200, expectedCons: 60, chartererInstructions: 'Bunker at Singapore OPL.', ownerInstructions: 'Confirm quantity by MFM.',
      reference: 'VOY-2606-016', suppliersInvited: 5,
      quotes: [q('Vitol', 640, 1600, 30, 4.6, 96, 'Barge', '10 Jun 2026')],
      supplier: 'Vitol', pricePerMt: 640, totalCost: 1_024_000,
      poNo: 'PO-2606-101', contractRef: 'CON-VT-06-03', bookedOn: '05 Jun 2026, 10:00', confirmNo: 'VT-SIN-5580', deliveryMethod: 'Barge',
      suppliedQty: 1600, deliveredQty: 1598, supplyDateTime: '10 Jun 2026, 16:30 LT',
      invoiceNo: 'INV-VT-5580', invoiceDate: '11 Jun 2026', invoiceAmount: 1_022_720, paymentTerms: '30 days from BDN', dueDate: '11 Jul 2026', dueIso: '2026-07-11',
      amountPaid: 0, approvalStatus: 'Awaiting Approval', paymentStatus: 'Upcoming', lastUpdated: '16 Jun 2026, 08:00',
      documents: [{ id: 'd1', name: 'INV-VT-5580.pdf', type: 'Invoice', date: '11 Jun 2026' }],
      audit: [{ user: 'R. Khan', role: 'Bunker Team', at: '16 Jun 2026, 08:00', action: 'Invoice uploaded — awaiting manager approval' }],
    },
    {
      id: 'BR-2606-015', priority: 'Low', status: 'Sent to Accounts',
      vessel: 'MV Aurora', imo: '9577345', leg: 'LEG-2', route: 'Med → US East',
      loadPort: 'Gibraltar', dischargePort: 'New York', bunkerPort: 'Gibraltar', eta: '24 Jun 2026, 09:00 LT',
      requiredOn: '23 Jun 2026, 10:00 LT', requiredIso: '2026-06-23T10:00', fuelType: 'VLSFO', grade: 'ISO 8217:2017 RMG 380',
      quantity: 900, robArrival: 170, expectedCons: 46, chartererInstructions: 'Standard.', ownerInstructions: 'None.',
      reference: 'VOY-2606-015', suppliersInvited: 4,
      quotes: [q('Peninsula', 672, 900, 30, 4.4, 96, 'Barge', '07 Jun 2026')],
      supplier: 'Peninsula', pricePerMt: 672, totalCost: 604_800,
      poNo: 'PO-2606-096', contractRef: 'CON-PN-06-01', bookedOn: '31 May 2026, 12:00', confirmNo: 'PN-GIB-1180', deliveryMethod: 'Barge',
      suppliedQty: 900, deliveredQty: 900, supplyDateTime: '07 Jun 2026, 08:10 LT',
      invoiceNo: 'INV-PN-1180', invoiceDate: '07 Jun 2026', invoiceAmount: 604_800, paymentTerms: '30 days from BDN', dueDate: '07 Jul 2026', dueIso: '2026-07-07',
      amountPaid: 0, approvalStatus: 'Approved', paymentStatus: 'Upcoming', lastUpdated: '15 Jun 2026, 11:30',
      documents: [{ id: 'd1', name: 'INV-PN-1180.pdf', type: 'Invoice', date: '07 Jun 2026' }],
      audit: [{ user: 'S. Rao', role: 'Manager', at: '15 Jun 2026, 11:30', action: 'Approved and sent to Accounts' }],
    },
    {
      id: 'BR-2606-014', priority: 'Medium', status: 'Supplier Selected',
      vessel: 'MV Meridian', imo: '9645512', leg: 'LEG-1', route: 'Chile → China',
      loadPort: 'Mejillones', dischargePort: 'Ningbo', bunkerPort: 'Balboa', eta: '25 Jun 2026, 04:00 LT',
      requiredOn: '24 Jun 2026, 08:00 LT', requiredIso: '2026-06-24T08:00', fuelType: 'VLSFO', grade: 'ISO 8217:2017 RMG 380',
      quantity: 1400, robArrival: 190, expectedCons: 57, chartererInstructions: 'As per nomination.', ownerInstructions: 'Confirm grade compatibility.',
      reference: 'VOY-2606-014', suppliersInvited: 6,
      quotes: [
        q('Ocean Bunkers', 700, 1400, 30, 4.8, 98, 'Barge', '24 Jun 2026'),
        q('World Fuel', 708, 1400, 21, 4.5, 95, 'Barge', '24 Jun 2026'),
        q('GAC Bunkers', 705, 1400, 21, 4.3, 94, 'Barge', '25 Jun 2026'),
      ],
      supplier: 'Ocean Bunkers', pricePerMt: 700, totalCost: 980_000,
      approvalStatus: 'Not Submitted', paymentStatus: 'None', lastUpdated: '16 Jun 2026, 07:20',
      documents: [{ id: 'd1', name: 'Quote-Comparison-014.xlsx', type: 'Supplier Quote', date: '16 Jun 2026' }],
      audit: [{ user: 'R. Khan', role: 'Bunker Team', at: '16 Jun 2026, 07:20', action: 'Supplier selected: Ocean Bunkers' }],
    },
  ];

  for (const r of rows) {
    r.quotes = scoreQuotes(r.quotes);
    // Back-fill fuelLines for seed data that predates the multi-fuel model.
    if (!r.fuelLines || r.fuelLines.length === 0) {
      r.fuelLines = [{ fuel: r.fuelType, quantity: r.quantity, grade: r.grade }];
    }
  }
  return rows;
}

/** Score quotes (lower landed cost, better rating/terms/performance) and flag the single best as recommended. */
export function scoreQuotes(quotes: Quote[]): Quote[] {
  if (quotes.length === 0) return quotes;
  const minCost = Math.min(...quotes.map((x) => x.totalCost));
  const maxCost = Math.max(...quotes.map((x) => x.totalCost));
  const scored = quotes.map((qt) => {
    const costScore = maxCost === minCost ? 1 : (maxCost - qt.totalCost) / (maxCost - minCost);
    const termScore = Math.min(1, qt.creditDays / 30);
    const score = Math.round((costScore * 0.5 + (qt.rating / 5) * 0.25 + (qt.performance / 100) * 0.15 + termScore * 0.1) * 100);
    return { ...qt, score, recommended: false };
  });
  const bestIdx = scored.reduce((bi, s, i, a) => (s.score > a[bi].score ? i : bi), 0);
  scored[bestIdx].recommended = true;
  return scored;
}

/** Timestamp in the app's display format, e.g. "16 Jun 2026, 10:30". */
export function nowStamp(): string {
  const d = new Date();
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())} ${mon} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ------------------------------------------------- mutable requirement store */

let requirements: BunkerRequirement[] = seed();
const reqListeners = new Set<() => void>();
function emitRequirements(): void {
  reqListeners.forEach((l) => l());
}

export function getBunkerRequirements(): BunkerRequirement[] {
  return requirements;
}
function subscribeRequirements(listener: () => void): () => void {
  reqListeners.add(listener);
  return () => reqListeners.delete(listener);
}
export function useBunkerRequirements(): BunkerRequirement[] {
  return useSyncExternalStore(subscribeRequirements, getBunkerRequirements, getBunkerRequirements);
}

export function getBunkerRequirement(id: string | undefined): BunkerRequirement | undefined {
  if (!id) return undefined;
  return requirements.find((r) => r.id === id);
}

export function updateBunkerRequirement(id: string, patch: Partial<BunkerRequirement>, audit?: Omit<AuditEntry, 'at'>): void {
  requirements = requirements.map((r) => {
    if (r.id !== id) return r;
    const at = nowStamp();
    return { ...r, ...patch, lastUpdated: at, audit: audit ? [{ ...audit, at }, ...r.audit] : r.audit };
  });
  emitRequirements();
}

export function addBunkerQuote(id: string, quote: Quote): void {
  requirements = requirements.map((r) => {
    if (r.id !== id) return r;
    const quotes = scoreQuotes([...r.quotes, quote]);
    const at = nowStamp();
    return {
      ...r,
      quotes,
      suppliersInvited: Math.max(r.suppliersInvited, quotes.length),
      status: r.status === 'Pending RFQ' || r.status === 'RFQ Sent' ? 'Quotes Received' : r.status,
      lastUpdated: at,
      audit: [{ user: 'Bunker Team', role: 'Bunker Team', at, action: `Quote added — ${quote.supplier} @ USD ${quote.pricePerMt}/MT` }, ...r.audit],
    };
  });
  emitRequirements();
}

/** Update an existing quote (identified by its original supplier name) in place. */
export function updateBunkerQuote(id: string, originalSupplier: string, patch: Quote): void {
  requirements = requirements.map((r) => {
    if (r.id !== id) return r;
    const quotes = scoreQuotes(r.quotes.map((q) => (q.supplier === originalSupplier ? { ...q, ...patch } : q)));
    const at = nowStamp();
    return {
      ...r,
      quotes,
      lastUpdated: at,
      audit: [{ user: 'Bunker Team', role: 'Bunker Team', at, action: `Quote edited — ${patch.supplier}` }, ...r.audit],
    };
  });
  emitRequirements();
}

/** Remove a quote (identified by supplier name) from a requirement. */
export function deleteBunkerQuote(id: string, supplier: string): void {
  requirements = requirements.map((r) => {
    if (r.id !== id) return r;
    const quotes = scoreQuotes(r.quotes.filter((q) => q.supplier !== supplier));
    const at = nowStamp();
    return {
      ...r,
      quotes,
      lastUpdated: at,
      audit: [{ user: 'Bunker Team', role: 'Bunker Team', at, action: `Quote deleted — ${supplier}` }, ...r.audit],
    };
  });
  emitRequirements();
}

/** Add a claim/deduction against the supplier. */
export function addBunkerClaim(id: string, claim: BunkerClaim): void {
  requirements = requirements.map((r) => {
    if (r.id !== id) return r;
    const at = nowStamp();
    return {
      ...r,
      claims: [claim, ...(r.claims ?? [])],
      lastUpdated: at,
      audit: [{ user: 'Bunker Team', role: 'Bunker Team', at, action: `Claim raised — ${claim.type} (USD ${claim.amount.toLocaleString('en-US')})` }, ...r.audit],
    };
  });
  emitRequirements();
}

export function updateBunkerClaim(id: string, claimId: string, patch: Partial<BunkerClaim>): void {
  requirements = requirements.map((r) => {
    if (r.id !== id) return r;
    const at = nowStamp();
    return {
      ...r,
      claims: (r.claims ?? []).map((c) => (c.id === claimId ? { ...c, ...patch } : c)),
      lastUpdated: at,
      audit: [{ user: 'Bunker Team', role: 'Bunker Team', at, action: 'Claim updated' }, ...r.audit],
    };
  });
  emitRequirements();
}

export function deleteBunkerClaim(id: string, claimId: string): void {
  requirements = requirements.map((r) => {
    if (r.id !== id) return r;
    const at = nowStamp();
    return {
      ...r,
      claims: (r.claims ?? []).filter((c) => c.id !== claimId),
      lastUpdated: at,
      audit: [{ user: 'Bunker Team', role: 'Bunker Team', at, action: 'Claim removed' }, ...r.audit],
    };
  });
  emitRequirements();
}

/** Delete the supplier invoice, reverting the requirement to "Supplied" so a new invoice can be registered. */
export function deleteBunkerInvoice(id: string): void {
  requirements = requirements.map((r) => {
    if (r.id !== id) return r;
    const at = nowStamp();
    return {
      ...r,
      status: 'Supplied',
      invoiceNo: undefined,
      invoiceDate: undefined,
      invoiceAmount: undefined,
      paymentTerms: undefined,
      dueDate: undefined,
      dueIso: undefined,
      amountPaid: undefined,
      paymentRef: undefined,
      paymentDate: undefined,
      approvalStatus: 'Not Submitted',
      paymentStatus: 'None',
      documents: r.documents.filter((d) => d.type !== 'Invoice'),
      lastUpdated: at,
      audit: [{ user: 'Bunker Team', role: 'Bunker Team', at, action: 'Invoice deleted' }, ...r.audit],
    };
  });
  emitRequirements();
}

/** Duplicate a requirement's invoice as a brand-new requirement (e.g. a reissued/corrected invoice), keeping the RFQ/booking/supply data but starting a fresh invoice & payment cycle. */
export function duplicateBunkerInvoice(id: string): string | undefined {
  const source = requirements.find((r) => r.id === id);
  if (!source) return undefined;
  const n = reqSeq++;
  const suffix = String(n).padStart(3, '0');
  const newId = `BR-2607-${suffix}`;
  const at = nowStamp();
  const copy: BunkerRequirement = {
    ...source,
    id: newId,
    status: 'Supplied',
    invoiceNo: undefined,
    invoiceDate: undefined,
    invoiceAmount: undefined,
    paymentTerms: undefined,
    dueDate: undefined,
    dueIso: undefined,
    amountPaid: undefined,
    paymentRef: undefined,
    paymentDate: undefined,
    approvalStatus: 'Not Submitted',
    paymentStatus: 'None',
    claims: [],
    documents: source.documents.filter((d) => d.type !== 'Invoice' && d.type !== 'Payment Advice'),
    lastUpdated: at,
    audit: [{ user: 'Bunker Team', role: 'Bunker Team', at, action: `Duplicated from ${source.id} for a new invoice` }],
  };
  requirements = [copy, ...requirements];
  emitRequirements();
  return newId;
}

/** Create a new bunker requirement (raised by Operations). Lands as Pending RFQ. */
export interface NewRequirementInput {
  vessel: string;
  imo?: string;
  reference?: string;
  leg?: string;
  route?: string;
  loadPort?: string;
  dischargePort?: string;
  bunkerPort: string;
  eta?: string;
  requiredOn?: string;
  fuelType: string;
  grade?: string;
  quantity: number;
  /** Multiple fuel types for this port — when provided, creates fuelLines on the requirement. */
  fuelLines?: { fuel: string; quantity: number; grade?: string }[];
  priority?: Priority;
  chartererInstructions?: string;
  ownerInstructions?: string;
}
let reqSeq = 25;
export function addBunkerRequirement(input: NewRequirementInput): string {
  const n = reqSeq++;
  const suffix = String(n).padStart(3, '0');
  const id = `BR-2607-${suffix}`;
  const at = nowStamp();
  const lines: FuelLine[] = input.fuelLines
    ? input.fuelLines.map((l) => ({ fuel: l.fuel, quantity: l.quantity, grade: l.grade ?? 'ISO 8217:2017 RMG 380' }))
    : [{ fuel: input.fuelType, quantity: input.quantity, grade: input.grade ?? 'ISO 8217:2017 RMG 380' }];
  const primaryLine = lines[0];
  const r: BunkerRequirement = {
    id,
    priority: input.priority ?? 'Medium',
    status: 'Pending RFQ',
    vessel: input.vessel,
    imo: input.imo?.trim() || '—',
    reference: input.reference?.trim() || `VOY-2607-${suffix}`,
    leg: input.leg?.trim() || 'LEG-1',
    route: input.route?.trim() || `${input.loadPort ?? ''}${input.loadPort && input.dischargePort ? ' → ' : ''}${input.dischargePort ?? ''}`,
    loadPort: input.loadPort ?? '',
    dischargePort: input.dischargePort ?? '',
    bunkerPort: input.bunkerPort,
    eta: input.eta?.trim() || '—',
    requiredOn: input.requiredOn?.trim() || '—',
    requiredIso: '',
    fuelType: primaryLine.fuel,
    grade: primaryLine.grade,
    quantity: primaryLine.quantity,
    fuelLines: lines,
    robArrival: 0,
    expectedCons: 0,
    chartererInstructions: input.chartererInstructions?.trim() || 'As per charterers instruction.',
    ownerInstructions: input.ownerInstructions?.trim() || '—',
    suppliersInvited: 0,
    quotes: [],
    approvalStatus: 'Not Submitted',
    paymentStatus: 'None',
    lastUpdated: at,
    documents: [],
    audit: [{ user: 'Operations', role: 'Operations', at, action: 'Requirement created from voyage plan' }],
  };
  requirements = [r, ...requirements];
  emitRequirements();
  return id;
}

/* --------------------------------------------------- selected-requirement store */

let currentId: string | undefined;
const listeners = new Set<() => void>();

export function getSelectedBunkerId(): string | undefined {
  return currentId;
}
export function writeSelectedBunkerId(id: string): void {
  if (currentId === id) return;
  currentId = id;
  listeners.forEach((l) => l());
}
export function clearSelectedBunkerId(): void {
  if (currentId === undefined) return;
  currentId = undefined;
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function useSelectedBunkerId(): string | undefined {
  return useSyncExternalStore(subscribe, getSelectedBunkerId, getSelectedBunkerId);
}
