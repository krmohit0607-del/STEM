# ✅ Backend Save Implementation Complete

## Overview

The Save button now creates an Estimation in the backend database and receives a unique Estimation Number (e.g., `EST-2609-01`).

---

## Changes Made

### 1. Added charteringApi Import
**File**: [src/components/ChateringEstimationPage.tsx](src/components/ChateringEstimationPage.tsx) (line 26)
```typescript
import { charteringApi } from '../api/charteringApi';
```

### 2. Added Save State Management
**File**: [src/components/ChateringEstimationPage.tsx](src/components/ChateringEstimationPage.tsx) (line ~1155)
```typescript
const [isSaving, setIsSaving] = useState(false);
```
Tracks whether a save is in progress to prevent duplicate saves.

### 3. Implemented Backend Save Function
**File**: [src/components/ChateringEstimationPage.tsx](src/components/ChateringEstimationPage.tsx) (lines ~1724-1797)

The new `save()` function:
- Is now `async`
- Prevents duplicate saves with `isSaving` guard
- Calls `charteringApi.upsertEstimate()` to POST to backend
- Sends estimation data including:
  - Vessel name, fix type, status
  - Profit and TCE calculations
  - Commodity, load/discharge ports, quantity, freight rate
  - Full JSON snapshot of inputs and vessel data
- Receives response with backend-generated `EstimateNo` (e.g., `EST-2609-01`)
- Saves to local state for UI consistency
- Creates voyage record if in create mode
- Shows notification with EstimateNo: `Estimation #EST-2609-01 created — ...`
- Handles errors gracefully with try/catch

### 4. Updated Save Button UI
**File**: [src/components/ChateringEstimationPage.tsx](src/components/ChateringEstimationPage.tsx) (lines ~2173-2183)
- Button shows "Saving..." with spinner icon while saving
- Button is disabled during save to prevent duplicate clicks
- Button text/icon updates on completion

---

## Backend Flow

### Endpoint: `POST /api/chartering/estimates`

1. **Request** (from frontend):
```json
{
  "vesselName": "MSC Example",
  "fixType": "Voyage",
  "status": "Estimate",
  "profit": 125000,
  "tce": 45000,
  "commodity": "Iron Ore",
  "loadPort": "Shanghai",
  "dischargePort": "Rotterdam",
  "quantity": 170000,
  "freightRate": 12.50,
  "dataJson": "{...full estimation data...}"
}
```

2. **Backend Processing** (CharteringController):
   - Route to `UpsertVoyageEstimateCommand` via MediatR
   - Auto-calculate profit/TCE if needed (via CharteringCalculationService)
   - Handle data validation

3. **Command Handler** (UpsertVoyageEstimateCommandHandler):
   - Check if estimation exists by EstimateNo
   - If new: Generate EstimateNo as `EST-{YY}{MM}-{count:D2}`
     - Example: `EST-2609-01` (Sept 2026, 1st estimation)
   - Create VoyageEstimate entity with:
     - Tenant ID (multi-tenant isolation)
     - Audit fields (CreatedByUserId, CreatedAt)
     - Full DataJson snapshot
   - Save to database
   - Log audit trail
   - Map to DTO

4. **Response** (to frontend):
```json
{
  "data": {
    "id": "guid",
    "estimateNo": "EST-2609-01",
    "vesselName": "MSC Example",
    "fixType": "Voyage",
    "status": "Estimate",
    "profit": 125000,
    "tce": 45000,
    "createdAt": "2026-09-16T14:05:00Z",
    ...
  },
  "isSuccess": true,
  "message": "Voyage estimate saved successfully."
}
```

5. **Frontend Handling**:
   - Extract EstimateNo from response
   - Update local state with returned data
   - Display notification: `Estimation #EST-2609-01 created`

---

## EstimateNo Generation Format

Format: `EST-{YY}{MM}-{count:D2}`

Examples:
- September 2026, 1st estimate: `EST-2609-01`
- September 2026, 15th estimate: `EST-2609-15`
- December 2025, 99th estimate: `EST-2512-99`

---

## Error Handling

If the save fails:
- Error is caught and logged to console
- User-friendly error message displayed:
  - `Failed to save estimation: [specific error message]`
- Save button returns to normal state
- No data is lost (frontend state remains intact)

---

## Database Persistence

The VoyageEstimate record includes:

| Field | Purpose |
|-------|---------|
| `Id` | Unique GUID |
| `TenantId` | Multi-tenant isolation |
| `EstimateNo` | Human-readable identifier (e.g., EST-2609-01) |
| `VesselName` | Vessel name |
| `FixType` | Fixture type (Voyage, Time Charter, etc.) |
| `Status` | Estimation status (Estimate, Quoted, On Subs, Fixed, etc.) |
| `Profit` | Calculated profit (USD) |
| `Tce` | Time Charter Equivalent |
| `Commodity` | Cargo commodity |
| `LoadPort` | Loading port |
| `DischargePort` | Discharging port |
| `Quantity` | Cargo quantity |
| `FreightRate` | Freight rate |
| `DataJson` | Full estimation inputs snapshot (for recalculation) |
| `CreatedAt` | Timestamp |
| `CreatedByUserId` | User who created |
| `UpdatedAt` | Last modification timestamp |
| `UpdatedByUserId` | User who last modified |

---

## API Response Handling

The frontend receives an `ApiResponse<VoyageEstimateDto>` structure:

```typescript
interface ApiResponse<T> {
  data: T;
  isSuccess: boolean;
  message: string;
}

interface VoyageEstimateDto {
  id: string;
  estimateNo: string;
  vesselName: string;
  fixType: string;
  status: string;
  profit: number;
  tce: number;
  commodity?: string;
  loadPort?: string;
  dischargePort?: string;
  quantity: number;
  freightRate: number;
  dataJson?: string;
  createdAt: string;
}
```

---

## Testing Checklist

- [ ] Create new estimation with all required data
- [ ] Click Save button
- [ ] Verify:
  - [ ] Button shows "Saving..." with spinner
  - [ ] Button is disabled
  - [ ] After 2-3 seconds, notification appears: `Estimation #EST-YYMM-## created`
  - [ ] Estimation No. displayed in header matches response
  - [ ] All data is persisted (refresh page and see data still there)
  - [ ] Editing and saving again updates the same record (not creating new)
  - [ ] EstimateNo in notification matches EstimateNo in header
- [ ] Check backend logs for successful save
- [ ] Verify database VoyageEstimate table has the new record

---

## Implementation Flow Diagram

```
User clicks Save
    ↓
save() function triggered
    ↓
Set isSaving = true (disable button, show spinner)
    ↓
Collect estimation data:
- Vessel name, fix type, status
- Profit, TCE from calculations
- Commodity, ports, quantity, freight
- Full JSON snapshot of inputs
    ↓
POST /api/chartering/estimates
    ↓
Backend:
  - Generate EstimateNo (EST-2609-01)
  - Create VoyageEstimate entity
  - Save to database
  - Log audit trail
  - Return EstimateNo in response
    ↓
Frontend receives response
    ↓
Update local state with EstimateNo
    ↓
Show notification with EstimateNo
    ↓
Set isSaving = false (enable button)
```

---

## Architecture Notes

1. **Real-time Calculation**: Frontend calculates profit/TCE immediately via `useMemo()` and shows in UI
2. **Debounced Auto-Save**: Changes are auto-saved to backend every 2.5s (fire-and-forget) for data redundancy
3. **Explicit Save**: User clicks Save to finalize the estimation and get the EstimateNo
4. **Backend Verification**: Backend recalculates profit/TCE to verify frontend calculations
5. **Multi-Tenant Isolation**: All records filtered by TenantId for data security
6. **Audit Trail**: All saves logged with user ID and timestamp

---

## Next Steps

1. **Start dev servers**: `npm run dev:all`
2. **Test workflow**:
   - Create new estimation
   - Enter vessel/cargo/port details
   - Click Save
   - Verify EstimateNo appears in notification
   - Refresh page and verify data persists
3. **Verify backend database**: Check `VoyageEstimates` table for new records
4. **Test error scenarios**:
   - Network error during save
   - Invalid data submission
   - Concurrent saves

---

**Status**: ✅ **IMPLEMENTATION COMPLETE & READY FOR TESTING**
