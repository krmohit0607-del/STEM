# COMPREHENSIVE DATA PERSISTENCE AUDIT REPORT
## STEM Application (React + .NET 8.0 SaaS)
**Date:** 2026-09-15 | **Scope:** Frontend Data Requirements vs Backend Database Entities

---

## 1. MODULES OVERVIEW

The STEM application consists of **9 major modules** plus **cross-functional settings**:

| Module | Purpose | Primary Data Entity | Status |
|--------|---------|-------------------|--------|
| **Chartering** | Cargo & tonnage books, fixture management | CargoBookEntry, TonnageBookEntry, VoyageEstimate | ✅ Core |
| **Operations** | Voyage-ops, P&L, hiring, freight laytime | Voyage, Passage, FinancialTransaction | ✅ Core |
| **Bunker** | Fuel procurement, quotes, suppliers | BunkerRequirement | ✅ Core |
| **Postfix** | Voyage settlement, claims, invoicing | FinancialTransaction (partial) | ⚠️ Incomplete |
| **Emissions** | IMO/EU compliance tracking | EmissionsRecord | ✅ Core |
| **Performance** | KPI reports, vessel analytics | VesselHistory, VesselReport | ✅ Core |
| **Accounts** | Financial transactions, GL | FinancialTransaction | ✅ Core |
| **Settings** | Email templates, master data, config | UserSetting (partial) | ❌ Fragmented |
| **Admin/SuperAdmin** | Tenant, user, module management | Tenant, ApplicationUser, TenantModuleAccess | ✅ Core |

---

## 2. DETAILED MODULE AUDITS

### 2.1 CHARTERING MODULE
**Files:** `CharteringBooksPage.tsx`, `charteringApi.ts`

#### Cargo Book Fields
- **Commodity & Specification:** `commodity`, `cargoType`, `cargoCode`, `quantity`, `tolerance`
- **Logistics:** `loadPort`, `dischargePort`, `loadRate`, `dischargeRate`, `terms`
- **Timeline:** `laycanStart`, `laycanEnd`, `openDate`, `nominationDeadline`
- **Status Tracking:** `cargoStatus`, `commercialStatus`, `estimationStatus`
- **Assignment:** `pic` (PIC), `account`, `remarks`
- **Voyage Context:** `voyageType` (Time Charter, Voyage Charter, TCTIN-VOUT, TCIN-TCOUT)

**Backend Match:**
- ✅ `CargoBookEntry` entity has all core fields
- ⚠️ Missing: `voyageType` values not enforced as enum, enum for voyage types not in backend

#### Tonnage Book Fields
- **Vessel Particulars:** `vessel`, `imo`, `vesselType`, `dwt`, `flag`
- **Availability:** `openArea`, `openPort`, `openDate`, `earliestOpen`, `latestOpen`
- **Commercial:** `voyageType`, `source` (Own/Broker), `commercialStatus`
- **Status & Assignment:** `pic`, `estimationStatus`, `owner`, `remarks`

**Backend Match:**
- ✅ `TonnageBookEntry` entity covers all fields
- ⚠️ `voyageType` and `source` enum values not standardized in backend

#### Voyage Estimation
- **Form:** `VoyageEstimationPage` component
- **Data:** `VoyageEstimateDto`, `estimateNo`, `fixType`, `status`, `profit`, `tce`, `freightRate`
- **Storage:** `dataJson` (complex estimation payload as JSON)

**Backend Match:**
- ✅ `VoyageEstimate` entity exists
- ⚠️ Uses JSON blob for estimation details (no sub-entities for line items)

#### Chartering Data Sources (Dropdowns)
- **Voyage Types:** Time Charter, Voyage Charter, TCTIN-VOUT, TCIN-TCOUT
  - Backend: No master table for voyage types
  - Frontend: Hardcoded in `CharteringBooksPage.tsx` (line 15: `VOYAGE_TYPES`)
  - **Status:** ❌ Missing enum table

---

### 2.2 OPERATIONS MODULE
**Files:** `OperationsPage.tsx`, `voyagesApi.ts`, `voyages.ts`

#### Operations Recap (`Recap` interface)
Core voyage settlement document (charter party derived):

**Vessel Particulars:**
- `vesselName`, `vesselEmail`, `vesselLoa`, `vesselBeam`, `draftBallast`, `draftLaden`
- `engineRpmMin`, `engineRpmMax`, `engineMcrMin`, `engineMcrMax`
- `scrubberFitted`, `scrubberType`
- **Cargo Handling:** `craneCount`, `craneSwl`, `craneSafeLimit`, `grabCount`, `grabWeight`, `grabSafeLimit`

**Commercial Terms:**
- **Owner side:** `owners`, `cpDate` (charter party date), `laycanStart`, `laycanEnd`, `ownersBroker`
- **Charterer side:** `charterers`, `charterersCpDate`, `charterersLaycanStart`, `charterersLaycanEnd`, `charterersBroker`
- **Hire:** `hirePerDay`, `demDespatch`, `despatchTerm`, `deliveryPort`, `deliveryTerm`, `deliveryDateTime`
- **Redelivery:** `redeliveryPort`, `redeliveryTerm`, `redeliveryDateTime`, `deliveryNotices`

**Cargo & Hold:**
- `cargoName`, `cpQuantity`, `holdCleaning`, `finalQtyLoaded`
- `ilohc`, `cve`, `adcom` (clauses)
- `wxClause` (weather clause), `brokerage`, `pniClub`
- `arbitrationPlace`, `governingLaw`, `sanctionsClause`

**Freight Settlement:**
- `freightPerMt`, `demDespatch` (despatch/demurrage terms)
- `ballastBonus`, `redeliveryNotices`, `hullCleaningClause`

**Backend Storage:**
- ❌ **NO BACKEND ENTITY** — `Recap` is stored in localStorage only (`opsRecap.ts`)
- ❌ Editing yields no database record — purely in-memory/local
- ❌ **Critical Gap:** No audit trail or version history

#### Voyage Live P&L (`Pnl` interface)
- `freightEarned`, `brokerageDeduction`, `netFreight`
- `hireExpense`, `demurrageExpense`, `despatchEarning`
- `estimatedLaytime`, `estimatedDemurrage`, `estimatedDespatch`
- **Costs:** `bunkerCost`, `portCost`, `agencyCost`, `canalCost`, `salvageCost`, `miscCost`
- **Gross P&L:** `grossProfit`, `profitPerDay`, `pricePerTon`

**Backend Match:**
- ⚠️ Stored in `Voyage` entity as individual columns (`costPerDay`, `foCost`, `goCost`, `euaCost`) but not complete P&L structure
- ❌ Missing fields: `freightEarned`, `brokerageDeduction`, `hireExpense`, `demurrage`, `despatch`

#### Laytime & Laydays
- `laycanStart`, `laycanEnd`, `norTendered`, `norAccepted`, `dischCommenced`, `dischCompleted`
- **Calculation:** `allowed`, `used`, `weatherDelay`, `shifting`, `excepted`
- **Terms:** `laytimeTerms` (SHINC, SHEX, SHEX EIU, WWD, etc.)

**Backend Match:**
- ❌ No `Laytime` entity
- ⚠️ Dates stored in `Voyage` but calculation fields missing
- ❌ Missing: Laytime terms table

#### ETA & ROB Calculations
- `etaCalculation`, `robCalculation` components
- **Inputs:** `speed`, `consumption`, `distance`, `margin`, `weatherFactor`
- **Outputs:** `eta`, `rob` (remaining on board), `etd` (estimated time of departure)

**Backend Match:**
- ❌ No entity for ETA/ROB calculations
- ⚠️ Values stored in Voyage but calculation rules not persisted

#### Stowage Planning
- Cargo placement, hold utilization, trim & stability
- **Data:** No frontend entity found for detailed stowage records

**Backend Match:**
- ❌ No `Stowage` entity

#### Vessel Reports
- Sounding reports, noon reports, condition updates
- **Component:** `VesselReportsPage.tsx`

**Backend Match:**
- ✅ `VesselReport` entity exists
- ⚠️ Form definition not in database (stored in `vesselReportDefinitions.ts` with hardcoded structure)

#### Operations Module Dropdowns
- **Port Type:** Delivery, Loading, Bunkering, Canal Transit, Waiting, STS, Discharging, Dry Dock, Redelivery, etc.
  - **Source:** `LAYTIME_TERMS_OPTIONS`, `PORT_TYPE_OPTIONS` in `estimationOptions.ts`
  - **Backend:** ❌ No enum table
- **Laytime Terms:** SHINC, SHEX, SHEX EIU, SHEX UU, WWD, Reversible, Non-Reversible, etc.
  - **Backend:** ❌ No enum table
- **Distance/Speed Units:** Nautical Miles, Kilometers, Knots, Km/Hr
  - **Backend:** ❌ Hardcoded in frontend

---

### 2.3 BUNKER MANAGEMENT MODULE
**Files:** `BunkerManagementPage.tsx`, `bunkerApi.ts`, `bunker.ts`

#### Bunker Requirement Fields
- **Requirement ID:** `RequirementNo` (e.g., BR-2606-024)
- **Priority & Status:** `priority` (High/Medium/Low), `status` (Pending RFQ → Paid → Closed)
- **Vessel Context:** `vessel`, `imo`, `reference` (cross-module), `leg`, `route`
- **Port Info:** `loadPort`, `dischargePort`, `bunkerPort`, `eta`, `requiredOn`, `requiredIso`
- **Fuel Spec:** `fuelType`, `grade` (ISO 8217:2017 RMG 380), `quantity`, `robArrival`, `expectedCons`
- **Instructions:** `chartererInstructions`, `ownerInstructions`

**Backend Match:**
- ✅ `BunkerRequirement` entity has all core fields
- ✅ Good match to frontend

#### Bunker Status Workflow
```
Pending RFQ → RFQ Sent → Quotes Received → Supplier Selected 
→ Booked → Supplied → Invoice Received → Manager Approval Pending 
→ Approved → Sent to Accounts → Payment Due → Paid → Closed
```

**Backend Match:**
- ✅ `Status` field in entity allows above values
- ⚠️ Workflow not enforced in backend (should validate transitions)

#### Quote Management
- **Fields:** `supplier`, `pricePerMt`, `additionalCharges`, `totalCost`, `terms`, `deliveryDate`, `deliveryMethod`
- **Credit & Rating:** `creditDays`, `rating`, `performance`, `score`, `recommended`

**Backend Storage:**
- ✅ `QuotesJson` field in `BunkerRequirement`
- ⚠️ No separate `Quote` entity (nested JSON only)

#### Additional Charges
- **Presets:** Barging Charge, Port Dues, Agency Fee, Launch/Boat Charge, Hose Connection, Sludge Removal
- **Fields:** `id`, `label`, `amount`

**Backend Match:**
- ✅ `AdditionalChargesJson` in `BunkerRequirement`
- ❌ Presets not in database (hardcoded in `bunker.ts` line 32)

#### Bunker Claims
- **Types:** Short Supply, Off-Spec/Quality, Delivery Delay, Damage, Documentation Discrepancy
- **Fields:** `id`, `type`, `description`, `amount`, `status` (Open/Accepted/Rejected/Settled), `raisedOn`

**Backend Match:**
- ✅ `ClaimsJson` in `BunkerRequirement`
- ❌ Claim types not standardized in backend

#### Fuel Lines (Multi-Fuel Requirement)
- **Structure:** `fuel`, `quantity`, `grade`, `suppliedQty`, `deliveredQty`
- **Multiple per requirement** (array)

**Backend Match:**
- ✅ `FuelLinesJson` in `BunkerRequirement`
- ⚠️ No relational `FuelLine` entity (purely JSON)

#### Payment Status
- Values: Upcoming, Due Today, Due in 3 Days, Due in 7 Days, Overdue, Paid, Cancelled, None

**Backend Match:**
- ⚠️ Tracked as `PaymentStatus` field but no separate payment table

#### Approval Status
- Values: Not Submitted, Awaiting Approval, Approved, Rejected, Revision Requested

**Backend Match:**
- ✅ `ApprovalStatus` field in entity

---

### 2.4 POSTFIX MODULE (Settlement & Claims)
**Files:** `PostfixPage.tsx`

#### Pro-Forma Disbursement Account (PDA)
- **Structure:** `port`, `agent`, `currency`, `estimated`, `advance`, `fdaFinal`, `status`, `approval`
- **Seed data shows:**
  - Load port (standard port agent fees)
  - Bunker port (fuel agent fees)
  - Discharge port (discharge agent & services)

**Backend Match:**
- ❌ **NO ENTITY** for PDA
- ❌ Stored only as hardcoded seed in `buildPostfix()` function
- ❌ Cannot persist user-edited PDAs

#### Final Disbursement Account (FDA)
- Same structure as PDA
- **Status:** FDA Received, FDA Approved, Pending approval

**Backend Match:**
- ❌ **NO ENTITY** for FDA

#### Agent Invoices
- **Fields:** `invoiceNo`, `agent`, `vendor`, `date`, `due`, `currency`, `amount`, `approved`, `paid`
- **Category:** FDA—Port, FDA—Bunker Port, Towage, Survey, etc.
- **Port Context:** `port`, `dept` (departmental approval), `accounts` (accounting status)

**Backend Match:**
- ❌ **NO ENTITY** for Agent Invoices
- ⚠️ Could map to `FinancialTransaction` with category = "Agency" or "Port" but no dedicated table
- ❌ Missing: vendor management, invoice attachment storage

#### Additional Services
- **Examples:** Launch Boat, Fresh Water, Crew Change, Sludge Disposal, Cash To Master
- **Fields:** `id`, `service`, `vendor`, `invoice`, `currency`, `cost`, `tax`, `reason`, `requestedBy`, `approvedBy`, `status`

**Backend Match:**
- ❌ **NO ENTITY** for Additional Services
- ⚠️ Could use `FinancialTransaction` with category = "Misc" but loses service definition

#### Claims Management
- **Types:** Demurrage Claim, Cargo Claim, Offhire Claim, etc.
- **Fields:** `id`, `type`, `reference`, `amount`, `currency`, `status` (Under Review, Open, Settled), `owner`, `settlement`, `remarks`

**Backend Match:**
- ❌ **NO ENTITY** for Claims
- ⚠️ Could use `FinancialTransaction` but loses claims-specific workflow

#### Settlement Timeline
- Milestone tracking: Fixture Confirmed → Operations Started → Loading Complete → Sailing → Discharge Complete → FDA Received → Laytime Completed → Freight Settled → Claims Closed → Voyage Closed

**Backend Match:**
- ❌ No timeline/milestone entity
- ⚠️ Could track via `AuditLog` but not designed for this

#### Voyage Closure
- **Process:** Finalize settlement, close invoices, archive documents
- **Data:** Voyage status, closure date, final amounts

**Backend Match:**
- ⚠️ `Voyage` entity has `Status` field but no closure-specific fields

---

### 2.5 EMISSIONS MODULE
**Files:** `EmissionsPage.tsx`, `emissions.ts`, `emissionsApi.ts`

#### Compliance Items
- **Types:** IMO DCS, EU MRV, FuelEU, CII, SEEMP, SOx, NOx
- **Fields per item:** `status` (Pending/Ready/Submitted/Verified/Rejected), `submissionDate`, `verifier`, `dueDate`, `comments`

**Backend Match:**
- ✅ `ComplianceJson` field in `EmissionsRecord` entity
- ⚠️ Structure stored as JSON, no validation on fields

#### Emission Adjustments (Manual)
- **Fields:** `id`, `field`, `oldValue`, `newValue`, `reason`, `createdBy`, `createdDate`, `modifiedBy`, `modifiedDate`, `approvedBy`, `approvedDate`
- **Audit Trail:** Full change history with approvals

**Backend Match:**
- ✅ `AdjustmentsJson` field in `EmissionsRecord`
- ⚠️ No separate `EmissionAdjustment` entity (no relational validation)

#### Compliance Metadata
- `complianceYear`, `trade`, `euaPriceEur` (current EUA market price), `co2AdjustmentT` (manual CO2 delta)

**Backend Match:**
- ✅ Fields in `EmissionsRecord` entity
- ✅ Good match

#### Approvals
- `approvedBy`, `approvedDate` (final sign-off on emissions doc)

**Backend Match:**
- ✅ Fields exist but no workflow enforcing who can approve

---

### 2.6 PERFORMANCE & REPORTING MODULE
**Files:** `InterimDashboardPage.tsx`, `PerformanceReportPage.tsx`, `VesselMasterPerformancePage.tsx`

#### KPI Dashboard
- **Track Row Fields:** vessel, imo, dwt, built, loa, beam, enginePower, cpeSpeed, cpeCons, instSpeed, insteCons
- **Performance Metrics:** health, efficiency, port_calls, canal_transits, bunker_events
- **Financial:** totalFreight, totalCost, totalProfit

**Backend Match:**
- ✅ `VesselHistory` entity stores historical snapshots
- ⚠️ Missing: KPI calculation configuration, efficiency thresholds

#### Vessel Reports
- **Form Definition:** `vesselReportDefinitions.ts`
  - Sections (Noon Report, Weather Observation, Engine Parameters, Fuel Consumption, Emissions, etc.)
  - Fields per section with validation rules

**Backend Match:**
- ✅ `VesselReport` entity exists
- ❌ Form definition is hardcoded in frontend (not in database)
- ❌ No way to customize report templates per tenant

#### Performance Metrics
- **Tracking:** Speed performance, consumption performance, weather impact, laytime performance

**Backend Match:**
- ⚠️ No dedicated metrics entity (values in `VesselHistory` and `Voyage`)

---

### 2.7 ACCOUNTS & FINANCIAL MODULE
**Files:** `AccountsPage.tsx`, `accountsApi.ts`, `accounts.ts`

#### Financial Transaction Fields
- **Identification:** `id`, `transactionNo`, `kind` (Payable/Receivable), `category` (Hire, Freight, PDA, FDA, Bunker, Agency, Port, Canal, Demurrage, Despatch, Claims, Commission, etc.)
- **Module Origin:** `module` (Operations, Chartering, Postfix, Bunker, Performance, Weather, etc.)
- **Company & Vessel:** `company`, `vessel`, `voyage`, `reference` (shared cross-module), `fixture`
- **Counterparty:** `counterparty`, `invoiceNo`, `currency`, `amount`, `exchangeRate`
- **Dates:** `invoiceDate`, `dueDate`, `dueIso` (ISO 8601)

**Backend Match:**
- ✅ `FinancialTransaction` entity covers all core fields

#### Transaction Status Workflow
```
Draft → Submitted → Accounts Review → Pending Approval 
→ Approved → Scheduled → Payment Executed → Bank Confirmation 
→ Reconciled → Closed
```

**Legacy statuses:** Due, Overdue, Paid, Received, Approval Pending

**Backend Match:**
- ⚠️ `Status` field stores enum values but no backend validation of state transitions
- ❌ Workflow rules not enforced in backend

#### Payment Details
- `bank`, `method`, `paymentDate`, `paymentRef`, `swiftDocUrl`

**Backend Match:**
- ✅ Fields exist in entity

#### Priority & Approval
- `priority` (High/Medium/Low), `approval` (Auto/Pending/Approved/Rejected)

**Backend Match:**
- ✅ Fields exist

#### Audit Trail
- `audit` array of `AuditEntry`: `at`, `user`, `action`, `from` (status), `to` (status)

**Backend Match:**
- ✅ `AuditJson` field in entity
- ⚠️ No relational `AuditEntry` entity

#### Account Categories
- Hire, Freight, PDA, FDA, Bunker, Agency, Port, Canal, Demurrage, Despatch, Claims, Commission, Performance, Weather, Insurance, Taxes, Misc

**Backend Match:**
- ✅ `Category` field stores these but no enum table in database
- ❌ Hardcoded in frontend `accounts.ts` (line 15)

---

### 2.8 SETTINGS MODULE
**Files:** `SettingsPage.tsx`, `SettingsModal.tsx`, `settingsApi.ts`

#### Email Templates
- **Storage:** `emailTemplates.ts`
- **Fields:** `id`, `category`, `subCategory`, `subSubCategory`, `to`, `cc`, `title`, `subject`, `body`, `attachments`
- **Recipient Types:** Account, Vessel, Service Provider types (Bunker Surveyor, Draft Surveyor, etc.)

**Backend Match:**
- ❌ **NO ENTITY** for Email Templates
- ⚠️ Stored in `UserSetting` with key = "emailTemplates" (unstructured JSON)
- ❌ No validation on template structure, tokens, or attachment storage
- ❌ Missing: Template versioning, approval workflow

#### Email Distribution Lists
- **Fields:** `id`, `name`, `recipients` (company, email array)
- **Source:** localStorage or backend via `settingsApi.get('emailDistributionLists')`

**Backend Match:**
- ❌ **NO ENTITY** for Distribution Lists
- ⚠️ Stored in `UserSetting` (unstructured)

#### Cargo Master
- **Fields:** See section 2.9 below

**Backend Match:**
- ❌ **NO ENTITY** for Cargo Master
- ⚠️ Stored in `UserSetting` (unstructured)

#### Estimation Options
- Dropdown/reference values for chartering & voyage estimation
- **Categories:** Vessel Types, Quantity Units, Freight Units, Currencies, Port Types, Canals, Fuel Grades, etc.

**Backend Match:**
- ❌ **NO ENUM TABLES** in database
- ❌ All hardcoded in `estimationOptions.ts`
- ⚠️ Cannot customize per tenant

#### Area Constraints
- Geospatial boundary definitions
- **Source:** localStorage (key = `fv.areaConstraints`) with deleted entries tracked

**Backend Match:**
- ❌ **NO ENTITY** for Area Constraints
- ⚠️ No geospatial support in backend

#### Saved Passages
- Route templates and leg definitions

**Backend Match:**
- ❌ **NO ENTITY** for Saved Passages
- ⚠️ Stored in `UserSetting` (bundled seed data)

#### Saved Ports
- Custom port reference data beyond the standard IMO port index

**Backend Match:**
- ❌ **NO ENTITY** for Saved Ports
- ✅ `Port` entity exists but only for IMO master data, not user customizations

#### Workflow Configuration
- **File:** `workflowConfig.ts`
- **Content:** Company-level flags controlling business logic (e.g., which statuses are allowed, which fields are required)

**Backend Match:**
- ❌ **NO ENTITY** for Workflow Config
- ⚠️ Stored in localStorage only

#### User Settings
- Per-user preferences (e.g., theme, language, saved filters)

**Backend Match:**
- ✅ `UserSetting` entity exists
- ⚠️ Store key-value pairs but no schema validation

---

### 2.9 CARGO MASTER (Reference Data)
**Files:** `cargoMaster.ts`

#### Cargo Record Structure
- **Identification:** `cargoId`, `cargoCode`, `cargoName`
- **Classification:** `category` (Dry Bulk, Liquid Bulk, Gas, Breakbulk, Container, Ro-Ro, Reefer, Project Cargo, Livestock, General Cargo)
- **Subcategories:** `subCategory`, `description`
- **Hazard Classification:** `unNumber`, `imoClassification`, `imsbcGroup`, `ibcClassification`, `igcClassification`
- **Physical Properties:** `densityMin`, `densityMax`, `densityUnit`
- **Additional fields:** Temperature handling, stowage factors, ventilation requirements, hygroscopy, etc.

**Backend Match:**
- ❌ **NO `CargoMaster` ENTITY** in database
- ⚠️ Stored in `UserSetting` with key = "cargoMaster"
- ❌ No versioning or audit trail
- ❌ Cannot define tenant-specific cargo preferences

#### Cargo Categories
```
Dry Bulk, Liquid Bulk, Gas, Breakbulk, Container, Ro-Ro, 
Reefer, Project Cargo, Livestock, General Cargo
```

**Backend Match:**
- ❌ No enum table in database

#### Vessel Types (for Cargo)
```
Bulk Carrier, Ore Carrier, Tanker, Chemical Tanker, Product Tanker, 
LNG Carrier, LPG Carrier, Container Vessel, Ro-Ro, Reefer, 
Multipurpose, Heavy Lift, Livestock Carrier
```

**Backend Match:**
- ❌ Hardcoded in frontend (no backend enum)

---

### 2.10 CLIENT & ACCOUNT MANAGEMENT
**Files:** `ClientDetailsPage.tsx`, `clients.ts`, `accountsApi.ts`

#### Client Record
- **Profile:** `id`, `kind` (Account/Service Provider), `category` (Owner, Charterer, Broker, Operator, or service provider type)
- **Company:** `name`, `location`, `email`, `contactName`, `phone`
- **Login:** `username`, `password`, `role`, `active` (boolean)
- **Internal:** `pic` (ODAS PIC assignment)
- **Banking:** `bankAccount` (verified, details, bankName, accountHolder, accountNumber, swift, iban)

**Backend Match:**
- ❌ **NO `CLIENT` ENTITY** in database
- ❌ Hardcoded in `CLIENTS` seed array in `clients.ts`
- ❌ Cannot create/edit accounts via UI (read-only)
- ❌ No banking info storage capability

#### Account Types
```
Owner, Charterer, Broker, Operator
```

**Backend Match:**
- ❌ No enum table

#### Service Provider Types
```
Bunker Surveyor, Draft Surveyor, Bunker Sample Testing, Hold Inspector, 
OnHire-OffHire Bunker Surveyor, Bunker Supplier/Trader, 
Weather Routing Service, PNI Club
```

**Backend Match:**
- ❌ No enum table

#### Client Roles
```
Administrator, Manager, Operations Manager, Chartering, Accounts, 
Account User, Viewer
```

**Backend Match:**
- ❌ Hardcoded (not tied to roles entity)
- ⚠️ `ApplicationRole` exists for system roles, not client roles

#### ODAS PICs
```
Amit Sharma, Rahul Verma, Priya Nair, Tom Becker, 
Liang Wei, Sofia Marin, James Okoro
```

**Backend Match:**
- ❌ Hardcoded in frontend (no ODAS staff/PIC entity)

---

## 3. CROSS-FUNCTIONAL DATA

### 3.1 Workflow & Configuration
**File:** `workflowConfig.ts`, `workflow.ts`

- **Status Flows:** Defines valid transitions for BunkerStatus, TxnStatus, etc.
- **Business Rules:** Which fields trigger which workflows, approval chains
- **Flags:** Feature toggles for tenant-specific behavior

**Backend Match:**
- ❌ No backend configuration entity
- ❌ Stored in localStorage only

### 3.2 Master Data Synchronization
**File:** `masterDataSync.ts`

- **IMO Ship Database:** Synced from `public/imo-ship-database.json` → uploaded to backend
  - Endpoint: `POST /api/settings/master-data/imo-ships`
  - Backend entity: `ImoShip` ✅

- **World Port Index:** Synced from `public/world-port-index.json` → uploaded to backend
  - Endpoint: `POST /api/settings/master-data/ports`
  - Backend entity: `Port` ✅

**Backend Match:**
- ✅ Both IMO and Port entities exist
- ⚠️ No incremental sync capability (full reload only)
- ❌ No metadata on sync status or errors

### 3.3 Weather Data
**File:** `weatherField.ts`, `weatherMargins.ts`

- **Weather Factors:** Field adjustments for estimation (weather risk multipliers)
- **Margins:** Safety margins by voyage leg, vessel type, commodity

**Backend Match:**
- ❌ No `WeatherMargin` entity
- ❌ Hardcoded in frontend

### 3.4 Route Optimization
**File:** `routeOptimizer.ts`, `routeSimulatorStore.ts`

- **Route Variants:** Competing route options with metrics
- **Optimization Runs:** Saved optimization scenarios with parameters

**Backend Match:**
- ❌ No `OptimizationRun` or `RouteVariant` entity
- ❌ Stored in localStorage only

### 3.5 Vessel Positions
**File:** `vesselPosition.ts`

- **Real-time:** GPS, AIS, weather observations
- **Telemetry:** Speed, consumption, heading, etc.

**Backend Match:**
- ❌ No `VesselPosition` entity
- ⚠️ Current position stored in `Voyage` but no history

### 3.6 System Mail
**File:** `systemMail.ts`

- **Internal Comms:** System messages, alerts, workflow notifications
- **Fields:** sender, recipient, subject, body, timestamp, read status

**Backend Match:**
- ❌ No `SystemMail` entity

### 3.7 Audit & Compliance
**File:** Core audit tracking via `AuditLog` entity

**Backend Match:**
- ✅ `AuditLog` entity exists for system-level auditing
- ⚠️ Not all business objects have audit trails (e.g., Voyage edits not explicitly tracked)

---

## 4. COMPREHENSIVE FINDINGS TABLE

| **Frontend Feature** | **Backend Entity** | **Status** | **Notes** |
|---|---|---|---|
| **CHARTERING** |
| Cargo Book Entry (base) | CargoBookEntry | ✅ Exists | All core fields mapped |
| Cargo Book - Voyage Types | — | ❌ Missing | Hardcoded enum (Time Charter, Voyage Charter, TCTIN-VOUT, TCIN-TCOUT) |
| Tonnage Book Entry (base) | TonnageBookEntry | ✅ Exists | All core fields mapped |
| Voyage Estimation | VoyageEstimate | ✅ Exists | Complex data in JSON blob |
| Voyage Estimate Status Flow | — | ⚠️ Partial | Status field exists, no workflow validation |
| **OPERATIONS** |
| Voyage (core) | Voyage | ✅ Exists | Good mapping |
| Voyage - Settlement Recap (`Recap`) | — | ❌ Missing | Critical gap—localStorage only, ~30+ charter party fields |
| Voyage - Live P&L (`Pnl`) | Voyage | ⚠️ Partial | Some cost fields exist, missing freight/demurrage detail |
| Voyage - Laytime Terms | — | ❌ Missing | Hardcoded enum (SHINC, SHEX, WWD, etc.) |
| Voyage - Laytime Calculation | — | ❌ Missing | No entity for allowed/used/exceptions |
| Voyage - ETA/ROB Calculations | — | ❌ Missing | Formulas stored nowhere |
| Passage & Leg Routes | Passage, PassageLeg | ✅ Exists | Basic structure present |
| Stowage Planning | — | ❌ Missing | No entity for cargo placement/trim |
| Vessel Reports | VesselReport | ✅ Exists | Form definition hardcoded, not in DB |
| Vessel Report - Form Templates | — | ❌ Missing | Report structure in `vesselReportDefinitions.ts`, not customizable |
| **BUNKER** |
| Bunker Requirement (base) | BunkerRequirement | ✅ Exists | Good mapping |
| Bunker Status Workflow | BunkerRequirement.Status | ⚠️ Partial | Enum values allowed, no transition validation |
| Bunker Quotes | BunkerRequirement.QuotesJson | ⚠️ JSON | No relational `Quote` entity |
| Bunker Additional Charges | BunkerRequirement.AdditionalChargesJson | ⚠️ JSON | Presets not in database |
| Bunker Claims | BunkerRequirement.ClaimsJson | ⚠️ JSON | No separate entity |
| Bunker Fuel Lines | BunkerRequirement.FuelLinesJson | ⚠️ JSON | Multi-fuel support via JSON |
| Bunker Payment Status | BunkerRequirement.PaymentStatus | ⚠️ Field | Tracked but no payment transaction link |
| Bunker Approval Status | BunkerRequirement.ApprovalStatus | ⚠️ Field | No workflow validation |
| **POSTFIX** |
| Pro-Forma Disbursement (PDA) | — | ❌ Missing | Critical gap—seed data only, no persistence |
| Final Disbursement Account (FDA) | — | ❌ Missing | Critical gap—seed data only |
| Agent Invoice | — | ❌ Missing | Could use FinancialTransaction but loses context |
| Additional Service Charges | — | ❌ Missing | No entity; could use FinancialTransaction |
| Claims (Demurrage, Cargo, Offhire) | — | ❌ Missing | No entity; FinancialTransaction doesn't fit |
| Settlement Timeline / Milestones | — | ❌ Missing | No event/milestone entity |
| **EMISSIONS** |
| Emissions Record (base) | EmissionsRecord | ✅ Exists | Core fields present |
| Compliance Items | EmissionsRecord.ComplianceJson | ⚠️ JSON | No validation on structure |
| Emission Adjustments (audit trail) | EmissionsRecord.AdjustmentsJson | ⚠️ JSON | No separate entity for change history |
| **PERFORMANCE** |
| Vessel History Snapshots | VesselHistory | ✅ Exists | Good for KPI tracking |
| KPI Dashboard Metrics | — | ⚠️ Partial | Calculation logic not in database |
| Vessel Report Definition | — | ❌ Missing | Hardcoded in `vesselReportDefinitions.ts` |
| **ACCOUNTS** |
| Financial Transaction (core) | FinancialTransaction | ✅ Exists | Good mapping |
| Transaction Status Workflow | FinancialTransaction.Status | ⚠️ Partial | Enum values stored, no transition validation |
| Transaction Category Enum | — | ❌ Missing | Hardcoded (Hire, Freight, PDA, FDA, etc.) |
| Transaction Audit Trail | FinancialTransaction.AuditJson | ⚠️ JSON | No relational entity |
| **SETTINGS** |
| Email Templates | UserSetting | ❌ Unstructured | Stored as JSON blob, no template entity |
| Email Distribution Lists | UserSetting | ❌ Unstructured | JSON blob, no entity |
| Cargo Master (reference data) | UserSetting | ❌ Unstructured | JSON blob, no `CargoMaster` entity |
| Estimation Options (dropdowns) | — | ❌ Missing | All hardcoded in frontend |
| Area Constraints | — | ❌ Missing | localStorage only, no geospatial entity |
| Saved Passages | UserSetting | ❌ Unstructured | JSON blob, no entity |
| Saved Ports (custom) | UserSetting | ❌ Unstructured | Port entity exists but for IMO only |
| Workflow Configuration | — | ❌ Missing | localStorage only |
| **ADMIN** |
| Tenant | Tenant | ✅ Exists | Multi-tenancy support |
| ApplicationUser | ApplicationUser | ✅ Exists | Identity integration |
| ApplicationRole | ApplicationRole | ✅ Exists | Identity-based roles |
| Module | Module | ✅ Exists | Module registry |
| TenantModuleAccess | TenantModuleAccess | ✅ Exists | Module licensing |
| EmployeeModulePermission | EmployeeModulePermission | ✅ Exists | Fine-grained permissions |
| UserSetting | UserSetting | ✅ Exists | Per-user preferences (unstructured) |
| **CLIENT MANAGEMENT** |
| Client/Account Record | — | ❌ Missing | Hardcoded seed only |
| Service Provider Record | — | ❌ Missing | No entity |
| Client Roles | — | ❌ Missing | Hardcoded enum |
| Account Types | — | ❌ Missing | Hardcoded enum (Owner, Charterer, etc.) |
| Service Provider Types | — | ❌ Missing | Hardcoded enum |
| ODAS PIC Assignment | — | ❌ Missing | No staff/resource entity |
| Bank Account Details | — | ❌ Missing | No banking entity |
| **MASTER DATA** |
| IMO Ship Database | ImoShip | ✅ Exists | Synced from public JSON |
| World Port Index | Port | ✅ Exists | Synced from public JSON |
| **ROUTE OPTIMIZATION** |
| Optimization Run | — | ❌ Missing | localStorage only |
| Route Variants | — | ❌ Missing | localStorage only |
| **MISCELLANEOUS** |
| Audit Log (system) | AuditLog | ✅ Exists | System-level auditing |
| RefreshToken | RefreshToken | ✅ Exists | Auth token management |
| Vessel Position (real-time) | — | ⚠️ Partial | Current position in Voyage, no history |
| System Mail | — | ❌ Missing | No internal comms entity |
| Weather Margins | — | ❌ Missing | Hardcoded in frontend |

---

## 5. CRITICAL GAPS & MISSING INFRASTRUCTURE

### 🔴 **TIER 1: MISSION-CRITICAL** (Blocks core workflows)

1. **Postfix Settlement Entity (PDA/FDA/Claims/Agent Services)**
   - **Impact:** Cannot persist voyage settlements
   - **Current:** Hardcoded seed in PostfixPage, no database support
   - **Missing entities:** ProFormaDisbursement, FinalDisbursement, AgentInvoice, AdditionalService, Claim, SettlementMilestone
   - **Workaround:** None—settlement data is lost on reload

2. **Operations Recap (Charter Party Settlement)**
   - **Impact:** Cannot save voyage settlement details
   - **Current:** localStorage only (`opsRecap.ts`)
   - **Missing:** No `OperationsRecap` or `VoyageSettlement` entity
   - **Workaround:** Data persists locally but not replicated across devices/users

3. **Client/Account Management**
   - **Impact:** Cannot create, edit, delete client records
   - **Current:** Hardcoded CLIENTS array, no backend entity
   - **Missing:** `Client`, `ServiceProvider` entities with CRUD endpoints
   - **Workaround:** Manual seed data updates

4. **Email Template & Distribution System**
   - **Impact:** Template customization lost on reload, no multi-tenant sharing
   - **Current:** localStorage → UserSetting (unstructured JSON)
   - **Missing:** Dedicated `EmailTemplate`, `EmailDistributionList` entities
   - **Workaround:** Limited to seeded templates

### 🟠 **TIER 2: HIGH PRIORITY** (Missing reference data)

5. **Enumeration Tables** (not database-backed)
   - Voyage Types, Laytime Terms, Port Types, Freight Units, Currencies, Fuel Grades, Canals, Estimation Options
   - **Impact:** Cannot customize per-tenant, cannot audit changes
   - **Missing:** No `VoyageType`, `LaytimeTerms`, `PortType`, `FreightUnit`, etc. entities
   - **Workaround:** Hardcoded in `estimationOptions.ts`

6. **Cargo Master (Reference Database)**
   - **Impact:** Cargo specs & properties lost on reload
   - **Current:** localStorage → UserSetting (unstructured)
   - **Missing:** `CargoMaster` entity with full cargo properties
   - **Workaround:** Limited to seeded cargoes

7. **Area Constraints (Geospatial)**
   - **Impact:** Custom boundaries not persisted
   - **Current:** localStorage only
   - **Missing:** No geospatial entity; backend has no GIS support
   - **Workaround:** None

8. **Voyage Laytime Calculations**
   - **Impact:** Laytime data not audited
   - **Current:** In-memory calculations, no persistence
   - **Missing:** `Laytime` entity to store allowed/used/weather/exceptions
   - **Workaround:** None

### 🟡 **TIER 3: MEDIUM PRIORITY** (Data loss scenarios)

9. **Workflow Configuration (Business Rules)**
   - **Impact:** Feature flags and status flows not enforced in backend
   - **Current:** localStorage only
   - **Missing:** `WorkflowConfiguration` entity
   - **Workaround:** Manual backend validation coding

10. **Stowage Planning**
    - **Impact:** Cargo placement data not persisted
    - **Current:** No frontend component observed, no backend support
    - **Missing:** `StowagePlan` entity

11. **Route Optimization / Saved Routes**
    - **Impact:** Optimization scenarios lost on reload
    - **Current:** localStorage only
    - **Missing:** `OptimizationRun`, `SavedRoute` entities
    - **Workaround:** None

12. **Saved Ports & Passages**
    - **Impact:** Custom route templates not synced across devices
    - **Current:** localStorage or UserSetting (unstructured)
    - **Missing:** Dedicated `SavedPassage` entity
    - **Workaround:** Partial—Port entity exists but for IMO data only

13. **System Mail & Notifications**
    - **Impact:** Internal comms not persisted
    - **Current:** No entity
    - **Missing:** `SystemMailMessage` entity
    - **Workaround:** None

### 🟢 **TIER 4: LOW PRIORITY** (Audit/housekeeping)

14. **Form Field Definitions (Vessel Reports)**
    - **Impact:** Report templates not customizable
    - **Current:** Hardcoded in `vesselReportDefinitions.ts`
    - **Missing:** `ReportTemplate`, `FormField` entities
    - **Workaround:** Backend code change required

15. **JSON Blob Relational Entities**
    - **Impact:** No normalization of quotes, charges, claims, adjustments
    - **Current:** Stored as JSON strings in single fields
    - **Missing:** Separate relational entities for:
      - `BunkerQuote`, `BunkerCharge`, `BunkerClaim` (instead of JSON in BunkerRequirement)
      - `EmissionAdjustment` (instead of JSON in EmissionsRecord)
      - `FinancialAudit` (instead of JSON in FinancialTransaction)
    - **Workaround:** Parse JSON in application layer

---

## 6. RECOMMENDATIONS & IMPLEMENTATION ROADMAP

### **PHASE 1: CRITICAL DATA PERSISTENCE** (Weeks 1–3)

**Priority: Block Tier 1 gaps**

#### 6.1.1 Create Postfix Settlement Entities

**New Entities:**
```csharp
public class ProFormaDisbursement : BaseAuditableEntity, IHasTenant
{
    public Guid? TenantId { get; set; }
    public Guid VoyageId { get; set; }
    public string PdaNo { get; set; }
    public string Port { get; set; }
    public string Agent { get; set; }
    public string Currency { get; set; }
    public decimal Estimated { get; set; }
    public decimal Advance { get; set; }
    public decimal FdaFinal { get; set; }
    public string Status { get; set; } // PDA Approved, FDA Received, etc.
    public string Approval { get; set; } // Pending, Approved
    public virtual Voyage Voyage { get; set; }
}

public class FinalDisbursement : BaseAuditableEntity, IHasTenant
{
    // Similar to PDA but marked final
}

public class AgentInvoice : BaseAuditableEntity, IHasTenant
{
    public Guid? TenantId { get; set; }
    public Guid VoyageId { get; set; }
    public string InvoiceNo { get; set; }
    public string Agent { get; set; }
    public string Vendor { get; set; }
    public DateTime InvoiceDate { get; set; }
    public DateTime DueDate { get; set; }
    public string Currency { get; set; }
    public decimal Amount { get; set; }
    public decimal Approved { get; set; }
    public decimal Paid { get; set; }
    public string Category { get; set; } // FDA—Port, Towage, Survey
    public string Port { get; set; }
    public string DeptStatus { get; set; } // Pending, Approved
    public string AccountsStatus { get; set; } // Pending, Paid
    public virtual Voyage Voyage { get; set; }
    public virtual ICollection<ClaimRecord> RelatedClaims { get; set; }
}

public class AdditionalService : BaseAuditableEntity, IHasTenant
{
    public Guid? TenantId { get; set; }
    public Guid VoyageId { get; set; }
    public string Service { get; set; } // Launch Boat, Fresh Water, etc.
    public string Vendor { get; set; }
    public string InvoiceNo { get; set; }
    public string Currency { get; set; }
    public decimal Cost { get; set; }
    public decimal Tax { get; set; }
    public string Reason { get; set; }
    public string RequestedBy { get; set; }
    public string ApprovedBy { get; set; }
    public string Status { get; set; } // Pending, Approved
    public virtual Voyage Voyage { get; set; }
}

public class ClaimRecord : BaseAuditableEntity, IHasTenant
{
    public Guid? TenantId { get; set; }
    public Guid VoyageId { get; set; }
    public string ClaimType { get; set; } // Demurrage, Cargo, Offhire
    public string ClaimReference { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; }
    public string Status { get; set; } // Open, Under Review, Settled
    public string Owner { get; set; } // Charterer, Receiver, Owner
    public decimal Settlement { get; set; }
    public string Remarks { get; set; }
    public virtual Voyage Voyage { get; set; }
}

public class SettlementMilestone : BaseAuditableEntity, IHasTenant
{
    public Guid? TenantId { get; set; }
    public Guid VoyageId { get; set; }
    public string MilestoneLabel { get; set; }
    public DateTime? CompletedDate { get; set; }
    public string CompletedBy { get; set; }
    public string Status { get; set; } // Done, Current, Todo
    public virtual Voyage Voyage { get; set; }
}
```

**DbContext Changes:**
```csharp
public DbSet<ProFormaDisbursement> ProFormaDisbursements => Set<ProFormaDisbursement>();
public DbSet<FinalDisbursement> FinalDisbursements => Set<FinalDisbursement>();
public DbSet<AgentInvoice> AgentInvoices => Set<AgentInvoice>();
public DbSet<AdditionalService> AdditionalServices => Set<AdditionalService>();
public DbSet<ClaimRecord> ClaimRecords => Set<ClaimRecord>();
public DbSet<SettlementMilestone> SettlementMilestones => Set<SettlementMilestone>();
```

**API Endpoints:**
```
POST/GET/PUT/DELETE /api/voyages/{voyageId}/settlement/pda
POST/GET/PUT/DELETE /api/voyages/{voyageId}/settlement/fda
POST/GET/PUT/DELETE /api/voyages/{voyageId}/settlement/agent-invoices
POST/GET/PUT/DELETE /api/voyages/{voyageId}/settlement/services
POST/GET/PUT/DELETE /api/voyages/{voyageId}/settlement/claims
GET /api/voyages/{voyageId}/settlement/timeline
```

#### 6.1.2 Create Operations Recap Entity

```csharp
public class VoyageRecap : BaseAuditableEntity, IHasTenant
{
    public Guid? TenantId { get; set; }
    public Guid VoyageId { get; set; }
    
    // Charter party metadata
    public string VoyageFixType { get; set; } // Time Charter, Voyage Charter
    public DateTime? CpDate { get; set; }
    
    // Vessel details (charter party derived)
    public string VesselLoa { get; set; }
    public string VesselBeam { get; set; }
    public string DraftBallast { get; set; }
    public string DraftLaden { get; set; }
    public string EngineRpmMin { get; set; }
    public string EngineRpmMax { get; set; }
    public string EngineMcrMin { get; set; }
    public string EngineMcrMax { get; set; }
    
    // Owner commercial terms
    public string Owners { get; set; }
    public DateTime? OwnersCpDate { get; set; }
    public DateTime? OwnersLaycanStart { get; set; }
    public DateTime? OwnersLaycanEnd { get; set; }
    public string OwnersBroker { get; set; }
    public decimal? HirePerDay { get; set; }
    
    // Charterer commercial terms
    public string Charterers { get; set; }
    public DateTime? CharterersCpDate { get; set; }
    public DateTime? CharterersLaycanStart { get; set; }
    public DateTime? CharterersLaycanEnd { get; set; }
    public string CharterersBroker { get; set; }
    
    // Freight & laytime
    public decimal? FreightPerMt { get; set; }
    public string DemDespatch { get; set; } // Demurrage/Despatch terms
    public string DespatchTerm { get; set; }
    public string LaytimeTerm { get; set; } // SHINC, SHEX, etc.
    
    // Delivery & redelivery
    public string DeliveryPort { get; set; }
    public string DeliveryTerm { get; set; }
    public DateTime? DeliveryDateTime { get; set; }
    public string RedeliveryPort { get; set; }
    public string RedeliveryTerm { get; set; }
    public DateTime? RedeliveryDateTime { get; set; }
    
    // Cargo details
    public string CargoName { get; set; }
    public string CpQuantity { get; set; }
    public string FinalQtyLoaded { get; set; }
    public string HoldCleaning { get; set; }
    
    // Charter clauses
    public string WxClause { get; set; }
    public string Ilohc { get; set; }
    public string Cve { get; set; }
    public string Adcom { get; set; }
    public string Brokerage { get; set; }
    public string PniClub { get; set; }
    public string ArbitrationPlace { get; set; }
    public string GoverningLaw { get; set; }
    public string SanctionsClause { get; set; }
    public string BallastBonus { get; set; }
    public string HullCleaningClause { get; set; }
    
    // Laytime tracking
    public DateTime? NorTendered { get; set; }
    public DateTime? NorAccepted { get; set; }
    public DateTime? DischCommenced { get; set; }
    public DateTime? DischCompleted { get; set; }
    public decimal? AllowedLaytime { get; set; }
    public decimal? UsedLaytime { get; set; }
    public decimal? WeatherDelay { get; set; }
    public decimal? Shifting { get; set; }
    public decimal? Excepted { get; set; }
    
    // Equipment specifications
    public string CraneCount { get; set; }
    public string CraneSwl { get; set; }
    public string CraneSafeLimit { get; set; }
    public string GrabCount { get; set; }
    public string GrabWeight { get; set; }
    public string GrabSafeLimit { get; set; }
    public string ScrubberFitted { get; set; }
    public string ScrubberType { get; set; }
    
    public virtual Voyage Voyage { get; set; }
}

public class LaytimeCalculation : BaseAuditableEntity, IHasTenant
{
    public Guid? TenantId { get; set; }
    public Guid VoyageRecapId { get; set; }
    public decimal AllowedDays { get; set; }
    public decimal UsedDays { get; set; }
    public decimal WeatherDelayDays { get; set; }
    public decimal ShiftingDays { get; set; }
    public decimal ExceptedDays { get; set; }
    public decimal DemurageDays { get; set; }
    public decimal DespatchDays { get; set; }
    public decimal? DemurrageCost { get; set; }
    public decimal? DespatchEarning { get; set; }
    public string Notes { get; set; }
    
    public virtual VoyageRecap VoyageRecap { get; set; }
}
```

**DbContext Changes:**
```csharp
public DbSet<VoyageRecap> VoyageRecaps => Set<VoyageRecap>();
public DbSet<LaytimeCalculation> LaytimeCalculations => Set<LaytimeCalculation>();
```

#### 6.1.3 Create Client/Account Management Entities

```csharp
public class Client : BaseAuditableEntity, IHasTenant
{
    public Guid? TenantId { get; set; }
    public string ClientCode { get; set; }
    public string Kind { get; set; } // Account, Service Provider
    public string Category { get; set; } // Owner, Charterer, Bunker Surveyor, etc.
    public string CompanyName { get; set; }
    public string Location { get; set; }
    public string Email { get; set; }
    public string ContactName { get; set; }
    public string Phone { get; set; }
    public string Username { get; set; } // For login (hash in security review)
    public string RoleAssignment { get; set; } // Administrator, Chartering, etc.
    public bool Active { get; set; }
    
    // PIC assignment
    public string? AssignedPic { get; set; }
    
    // Banking
    public string? BankName { get; set; }
    public string? AccountHolder { get; set; }
    public string? AccountNumber { get; set; }
    public string? Swift { get; set; }
    public string? Iban { get; set; }
    public bool BankVerified { get; set; }
    
    public virtual Tenant? Tenant { get; set; }
    public virtual ICollection<FinancialTransaction> Transactions { get; set; }
}

public class ClientEnumValue : BaseAuditableEntity, IHasTenant
{
    public Guid? TenantId { get; set; }
    public string EnumType { get; set; } // AccountType, ServiceProviderType, ClientRole, etc.
    public string Value { get; set; } // Owner, Charterer, etc.
    public string DisplayName { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; }
    
    public virtual Tenant? Tenant { get; set; }
}
```

**DbContext Changes:**
```csharp
public DbSet<Client> Clients => Set<Client>();
public DbSet<ClientEnumValue> ClientEnumValues => Set<ClientEnumValue>();
```

---

### **PHASE 2: REFERENCE DATA & ENUMS** (Weeks 4–6)

**Priority: Tier 2 gaps**

#### 6.2.1 Create Enumeration Tables

```csharp
public class EnumerationValue : BaseAuditableEntity, IHasTenant
{
    public Guid? TenantId { get; set; }
    public string EnumerationType { get; set; } // VoyageType, LaytimeTerms, PortType, etc.
    public string Value { get; set; }
    public string DisplayName { get; set; }
    public string? Description { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; }
    
    public virtual Tenant? Tenant { get; set; }
}

public class FreightUnit : BaseAuditableEntity, IHasTenant
{
    public Guid? TenantId { get; set; }
    public string Unit { get; set; } // USD/MT, USD/TEU, Lump Sum, etc.
    public string DisplayName { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; }
    
    public virtual Tenant? Tenant { get; set; }
}

public class QuantityUnit : BaseAuditableEntity, IHasTenant
{
    public Guid? TenantId { get; set; }
    public string CargoFamily { get; set; } // Dry Bulk, Steel Cargo, etc.
    public string Unit { get; set; } // MT, Coils, TEU, etc.
    public int SortOrder { get; set; }
    public bool IsActive { get; set; }
    
    public virtual Tenant? Tenant { get; set; }
}

public class FuelGrade : BaseAuditableEntity, IHasTenant
{
    public Guid? TenantId { get; set; }
    public string GradeCode { get; set; } // VLSFO, IFO380, MGO, etc.
    public string DisplayName { get; set; }
    public string? Description { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; }
    
    public virtual Tenant? Tenant { get; set; }
}

public class Canal : BaseAuditableEntity, IHasTenant
{
    public Guid? TenantId { get; set; }
    public string CanalName { get; set; } // Suez Canal, Panama Canal, etc.
    public string DisplayName { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; }
    
    public virtual Tenant? Tenant { get; set; }
}
```

**DbContext Changes:**
```csharp
public DbSet<EnumerationValue> EnumerationValues => Set<EnumerationValue>();
public DbSet<FreightUnit> FreightUnits => Set<FreightUnit>();
public DbSet<QuantityUnit> QuantityUnits => Set<QuantityUnit>();
public DbSet<FuelGrade> FuelGrades => Set<FuelGrade>();
public DbSet<Canal> Canals => Set<Canal>();
```

#### 6.2.2 Create Cargo Master Entity

```csharp
public class CargoMaster : BaseAuditableEntity, IHasTenant
{
    public Guid? TenantId { get; set; }
    public string CargoCode { get; set; }
    public string CargoName { get; set; }
    public string? Category { get; set; } // Dry Bulk, Liquid Bulk, Gas, etc.
    public string? SubCategory { get; set; }
    public string? Description { get; set; }
    
    // Hazard Classification
    public string? UnNumber { get; set; }
    public string? ImoClassification { get; set; }
    public string? ImsbcGroup { get; set; }
    public string? IbcClassification { get; set; }
    public string? IgcClassification { get; set; }
    
    // Physical Properties
    public string? DensityMin { get; set; }
    public string? DensityMax { get; set; }
    public string? DensityUnit { get; set; }
    public string? TemperatureHandling { get; set; } // Ambient, Heated, Cooled, Controlled
    public string? StowageFactor { get; set; }
    public string? VentilationRequirement { get; set; }
    public bool? IsHygroscopic { get; set; }
    public string? Remarks { get; set; }
    
    public string Status { get; set; } // Active, Inactive
    
    public virtual Tenant? Tenant { get; set; }
    public virtual ICollection<CargoBookEntry> CargoBooks { get; set; }
}
```

**DbContext Changes:**
```csharp
public DbSet<CargoMaster> CargoMasters => Set<CargoMaster>();
```

#### 6.2.3 Create Email Template & Distribution Entity

```csharp
public class EmailTemplate : BaseAuditableEntity, IHasTenant
{
    public Guid? TenantId { get; set; }
    public string TemplateCode { get; set; }
    public string? Category { get; set; }
    public string? SubCategory { get; set; }
    public string? SubSubCategory { get; set; }
    public string Title { get; set; }
    public string? Subject { get; set; }
    public string Body { get; set; } // HTML
    public string? RecipientTypesJson { get; set; } // ["Account", "Vessel", ...]
    public string? CcRecipientTypesJson { get; set; }
    public string? AttachmentsJson { get; set; } // [{name, type, dataUrl}, ...]
    public bool IsActive { get; set; }
    
    public virtual Tenant? Tenant { get; set; }
    public virtual ICollection<EmailDistributionList> DistributionLists { get; set; }
}

public class EmailDistributionList : BaseAuditableEntity, IHasTenant
{
    public Guid? TenantId { get; set; }
    public string ListName { get; set; }
    public string? Description { get; set; }
    public virtual ICollection<DistributionListRecipient> Recipients { get; set; }
    
    public virtual Tenant? Tenant { get; set; }
}

public class DistributionListRecipient : BaseEntity
{
    public Guid DistributionListId { get; set; }
    public string Company { get; set; }
    public string Email { get; set; }
    
    public virtual EmailDistributionList DistributionList { get; set; }
}
```

**DbContext Changes:**
```csharp
public DbSet<EmailTemplate> EmailTemplates => Set<EmailTemplate>();
public DbSet<EmailDistributionList> EmailDistributionLists => Set<EmailDistributionList>();
public DbSet<DistributionListRecipient> DistributionListRecipients => Set<DistributionListRecipient>();
```

---

### **PHASE 3: WORKFLOW & CONFIGURATION** (Weeks 7–8)

**Priority: Tier 3 gaps**

#### 6.3.1 Create Workflow Configuration

```csharp
public class WorkflowStatus : BaseAuditableEntity, IHasTenant
{
    public Guid? TenantId { get; set; }
    public string WorkflowType { get; set; } // Bunker, Transaction, Voyage, etc.
    public string StatusValue { get; set; }
    public string DisplayName { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; }
    
    public virtual Tenant? Tenant { get; set; }
    public virtual ICollection<WorkflowTransition> AllowedTransitionsFrom { get; set; }
}

public class WorkflowTransition : BaseAuditableEntity, IHasTenant
{
    public Guid? TenantId { get; set; }
    public Guid FromStatusId { get; set; }
    public Guid ToStatusId { get; set; }
    public string AllowedRoles { get; set; } // JSON array of roles
    public string? Description { get; set; }
    
    public virtual WorkflowStatus FromStatus { get; set; }
    public virtual WorkflowStatus ToStatus { get; set; }
    public virtual Tenant? Tenant { get; set; }
}

public class BusinessRule : BaseAuditableEntity, IHasTenant
{
    public Guid? TenantId { get; set; }
    public string RuleCode { get; set; }
    public string RuleType { get; set; } // Validation, Trigger, Calculation
    public string EntityType { get; set; } // Voyage, Bunker, etc.
    public string Condition { get; set; } // JSON rule definition
    public string Action { get; set; } // What happens when condition is met
    public bool IsActive { get; set; }
    
    public virtual Tenant? Tenant { get; set; }
}
```

**DbContext Changes:**
```csharp
public DbSet<WorkflowStatus> WorkflowStatuses => Set<WorkflowStatus>();
public DbSet<WorkflowTransition> WorkflowTransitions => Set<WorkflowTransition>();
public DbSet<BusinessRule> BusinessRules => Set<BusinessRule>();
```

#### 6.3.2 Create Area Constraints Entity

```csharp
public class AreaConstraint : BaseAuditableEntity, IHasTenant
{
    public Guid? TenantId { get; set; }
    public string ConstraintName { get; set; }
    public string? Description { get; set; }
    public string ConstraintType { get; set; } // Weather Zone, Political, Environmental, etc.
    public string BoundaryGeojson { get; set; } // GeoJSON feature collection
    public string? RestrictionReason { get; set; }
    public bool IsActive { get; set; }
    
    public virtual Tenant? Tenant { get; set; }
}
```

**DbContext Changes:**
```csharp
public DbSet<AreaConstraint> AreaConstraints => Set<AreaConstraint>();
```

---

### **PHASE 4: SUPPORTING ENTITIES** (Weeks 9–10)

#### 6.4.1 Normalize JSON Blobs to Relational Entities

**Separate out from BunkerRequirement:**
```csharp
public class BunkerQuote : BaseEntity
{
    public Guid BunkerRequirementId { get; set; }
    public string Supplier { get; set; }
    public decimal PricePerMt { get; set; }
    public decimal TotalCost { get; set; }
    public string Terms { get; set; }
    public DateTime DeliveryDate { get; set; }
    public string DeliveryMethod { get; set; }
    public int CreditDays { get; set; }
    public decimal Rating { get; set; }
    public decimal Performance { get; set; }
    public decimal Score { get; set; }
    public bool Recommended { get; set; }
    
    public virtual BunkerRequirement BunkerRequirement { get; set; }
    public virtual ICollection<BunkerAdditionalCharge> AdditionalCharges { get; set; }
}

public class BunkerAdditionalCharge : BaseEntity
{
    public Guid BunkerQuoteId { get; set; }
    public string Label { get; set; }
    public decimal Amount { get; set; }
    
    public virtual BunkerQuote BunkerQuote { get; set; }
}

public class BunkerClaim : BaseEntity
{
    public Guid BunkerRequirementId { get; set; }
    public string Type { get; set; }
    public string Description { get; set; }
    public decimal Amount { get; set; }
    public string Status { get; set; } // Open, Accepted, Rejected, Settled
    public DateTime RaisedOn { get; set; }
    
    public virtual BunkerRequirement BunkerRequirement { get; set; }
}

public class EmissionAdjustment : BaseEntity
{
    public Guid EmissionsRecordId { get; set; }
    public string Field { get; set; }
    public string OldValue { get; set; }
    public string NewValue { get; set; }
    public string Reason { get; set; }
    public string CreatedBy { get; set; }
    public DateTime CreatedDate { get; set; }
    public string? ModifiedBy { get; set; }
    public DateTime? ModifiedDate { get; set; }
    public string? ApprovedBy { get; set; }
    public DateTime? ApprovedDate { get; set; }
    
    public virtual EmissionsRecord EmissionsRecord { get; set; }
}

public class TransactionAuditEntry : BaseEntity
{
    public Guid FinancialTransactionId { get; set; }
    public DateTime AuditDate { get; set; }
    public string User { get; set; }
    public string Action { get; set; }
    public string? FromStatus { get; set; }
    public string? ToStatus { get; set; }
    public string? Notes { get; set; }
    
    public virtual FinancialTransaction FinancialTransaction { get; set; }
}
```

#### 6.4.2 Create Saved Route Entities

```csharp
public class SavedPassage : BaseAuditableEntity, IHasTenant
{
    public Guid? TenantId { get; set; }
    public string PassageName { get; set; }
    public string? Description { get; set; }
    public string OriginPort { get; set; }
    public string DestinationPort { get; set; }
    public string? RouteGeojson { get; set; } // GeoJSON LineString
    public decimal? EstimatedDistance { get; set; }
    public string DistanceUnit { get; set; } // Nautical Miles, Kilometers
    public bool IsActive { get; set; }
    
    public virtual Tenant? Tenant { get; set; }
    public virtual ICollection<PassageNode> Waypoints { get; set; }
}

public class PassageNode : BaseEntity
{
    public Guid SavedPassageId { get; set; }
    public int Sequence { get; set; }
    public decimal Latitude { get; set; }
    public decimal Longitude { get; set; }
    public string? LocationName { get; set; }
    
    public virtual SavedPassage SavedPassage { get; set; }
}

public class SavedRoute : BaseAuditableEntity, IHasTenant
{
    public Guid? TenantId { get; set; }
    public Guid? VoyageId { get; set; }
    public string RouteName { get; set; }
    public string? Description { get; set; }
    public string RouteGeojson { get; set; } // GeoJSON LineString
    public decimal? TotalDistance { get; set; }
    public decimal? EstimatedTime { get; set; }
    public string TimeUnit { get; set; } // Hours, Days
    public decimal? FuelConsumption { get; set; }
    public string Status { get; set; } // Active, Archived
    
    public virtual Tenant? Tenant { get; set; }
    public virtual Voyage? Voyage { get; set; }
}
```

#### 6.4.3 Create Form Definition Entity

```csharp
public class ReportTemplate : BaseAuditableEntity, IHasTenant
{
    public Guid? TenantId { get; set; }
    public string TemplateCode { get; set; }
    public string TemplateName { get; set; }
    public string? Description { get; set; }
    public string EntityType { get; set; } // VesselReport, etc.
    public bool IsActive { get; set; }
    
    public virtual Tenant? Tenant { get; set; }
    public virtual ICollection<ReportSection> Sections { get; set; }
}

public class ReportSection : BaseEntity
{
    public Guid ReportTemplateId { get; set; }
    public int Sequence { get; set; }
    public string SectionTitle { get; set; }
    public string? SectionDescription { get; set; }
    
    public virtual ReportTemplate ReportTemplate { get; set; }
    public virtual ICollection<ReportField> Fields { get; set; }
}

public class ReportField : BaseEntity
{
    public Guid ReportSectionId { get; set; }
    public int Sequence { get; set; }
    public string FieldName { get; set; }
    public string FieldLabel { get; set; }
    public string FieldType { get; set; } // Text, Number, Date, Checkbox, Select, etc.
    public bool IsRequired { get; set; }
    public string? ValidationRules { get; set; } // JSON
    public string? Options { get; set; } // JSON array for selects
    
    public virtual ReportSection ReportSection { get; set; }
}
```

---

### **PHASE 5: DATA MIGRATION STRATEGY**

#### 6.5.1 Settings API Migration

**Current Pattern:** `UserSetting` stores JSON blobs for master data

**New Pattern:** Move structured data to dedicated entities

**Migration Script:**
```sql
-- Example: Migrate email templates
INSERT INTO EmailTemplates (
    TenantId, TemplateCode, Category, Title, Body, IsActive, CreatedBy, CreatedAt
)
SELECT 
    us.TenantId,
    JSON_EXTRACT(us.ValueJson, '$.id') AS TemplateCode,
    JSON_EXTRACT(us.ValueJson, '$.category') AS Category,
    JSON_EXTRACT(us.ValueJson, '$.title') AS Title,
    JSON_EXTRACT(us.ValueJson, '$.body') AS Body,
    1 AS IsActive,
    'MIGRATION' AS CreatedBy,
    GETDATE() AS CreatedAt
FROM UserSettings us
WHERE us.Key = 'emailTemplates'
  AND JSON_EXTRACT(us.ValueJson, '$.id') IS NOT NULL;
```

#### 6.5.2 localStorage Sync Strategy

**Current:** Data stored in localStorage, synced to backend on demand

**New:** 
- Primary storage in database
- Frontend hydrates from API on load
- localStorage used as cache only
- Offline-first sync when reconnected

**Implementation:**
1. Create API endpoints for each data type
2. Modify data hooks to fetch from API first
3. Implement sync queue for offline changes
4. Add conflict resolution logic

---

## 7. IMPLEMENTATION CHECKLIST

### Phase 1 (Weeks 1–3)
- [ ] Create Postfix entities (PDA, FDA, AgentInvoice, AdditionalService, Claim, Milestone)
- [ ] Create VoyageRecap & LaytimeCalculation entities
- [ ] Create Client & ClientEnumValue entities
- [ ] Create API endpoints for all Tier 1 entities
- [ ] Update frontend to use new APIs (stop using seed data)
- [ ] Create migration scripts to backfill existing voyage data

### Phase 2 (Weeks 4–6)
- [ ] Create EnumerationValue & subsidiary enum tables
- [ ] Create CargoMaster entity
- [ ] Create EmailTemplate & DistributionList entities
- [ ] Create API endpoints for all enum tables
- [ ] Update estimationOptions.ts to fetch from API
- [ ] Update cargoMaster.ts to fetch from API
- [ ] Create admin UI to manage enums

### Phase 3 (Weeks 7–8)
- [ ] Create WorkflowStatus, WorkflowTransition, BusinessRule entities
- [ ] Create AreaConstraint entity with geospatial support
- [ ] Add API endpoints
- [ ] Update PostfixPage to use PDA/FDA APIs
- [ ] Implement workflow validation in backend

### Phase 4 (Weeks 9–10)
- [ ] Normalize JSON blobs (BunkerQuote, EmissionAdjustment, etc.)
- [ ] Create SavedPassage & SavedRoute entities
- [ ] Create ReportTemplate entities
- [ ] Write data migration scripts
- [ ] Create API endpoints

### Phase 5 (Ongoing)
- [ ] Settings API migration (UserSetting → dedicated entities)
- [ ] localStorage → API sync strategy
- [ ] Testing & validation
- [ ] Performance optimization

---

## 8. CRITICAL IMPLEMENTATION NOTES

### 8.1 Multi-Tenancy
- All new entities must implement `IHasTenant` interface
- Always apply query filters in DbContext
- Validate TenantId on every API request

### 8.2 Audit & Compliance
- All entities should inherit from `BaseAuditableEntity`
- Track who created/modified each record
- Maintain audit trail for sensitive fields (settlement, claims, etc.)

### 8.3 Workflow Validation
- Implement status transition validation in backend
- Prevent invalid state changes at API level
- Log all status changes for audit

### 8.4 Data Integrity
- Add foreign key constraints
- Implement cascading delete policies
- Use database transactions for multi-entity operations (e.g., settlement finalization)

### 8.5 Performance Considerations
- Index on VoyageId for all voyage-related entities
- Index on TenantId for multi-tenant queries
- Consider pagination for large result sets (e.g., transactions, reports)

---

## 9. SUMMARY OF FINDINGS

### Data Storage Status Breakdown
- **Database-backed:** ~35% (core voyage, vessel, bunker, emissions, financials)
- **Partially structured (JSON blobs):** ~20% (quotes, claims, adjustments in single fields)
- **Unstructured (UserSetting):** ~20% (email templates, cargo master, options)
- **localStorage only:** ~25% (settlement, recap, optimization, routes, area constraints)

### Critical Risks
1. **Postfix settlement data not persisted** — User edits lost on reload
2. **Operations recap in localStorage** — No audit trail, no multi-user sync
3. **Client management hardcoded** — Cannot create new accounts
4. **Reference data not managed** — All enums hardcoded, cannot customize
5. **No workflow validation** — Invalid status transitions allowed

### Recommended Priority Order
1. **IMMEDIATE:** Create Postfix & VoyageRecap entities (blocks settlement workflows)
2. **HIGH:** Create Client & Enum tables (enables account management)
3. **MEDIUM:** Migrate settings to dedicated entities (improves data governance)
4. **LOW:** Normalize JSON blobs (technical debt, improves maintainability)

---

**Report Generated:** 2026-09-15  
**Auditor:** Comprehensive Data Persistence Audit System  
**Scope:** Frontend requirements vs Backend database entities  
**Next Step:** Executive review & prioritization for implementation roadmap
