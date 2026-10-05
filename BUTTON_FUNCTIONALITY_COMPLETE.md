# ✅ Chartering Module - Complete Button Functionality Implementation

## Overview

All buttons in the Chartering Estimation module have been implemented with full backend/frontend integration. Each button now performs its function, saves state changes to both frontend and backend, and updates the left sidebar accordingly.

---

## Button Implementations Summary

### 1. **NEW** Button ✅
**Purpose**: Opens a new blank estimation page

**Functionality**:
- Clears current estimate data
- Sets status to 'Estimate'
- Opens paste box for quick data entry
- Unlocks form for editing
- Clears scenarios (comparison variants)
- Updates frontend state via `setEstimationStatus()`

**Code Location**: `newEstimate()` function

### 2. **PASTE DETAILS / HIDE PASTE BOX** Button ✅
**Purpose**: Toggles the paste box for quick data entry

**Functionality**:
- `quickPasteOpen` state toggles visibility
- When open: Shows paste box for vessel/cargo details
- When closed: Hides paste box
- Uses `setQuickPasteOpen()` to toggle state

**Code Location**: Button onClick toggles `quickPasteOpen` boolean

**Features**:
- Parses pasted text via `parseEstimatePaste()`
- Applies fields via `applyQuickPaste()`
- Auto-matches ports to database via `findBestMatchPort()`
- Shows feedback messages on success/error

### 3. **DUPLICATE** Button ✅
**Purpose**: Creates a copy of the current estimation with a new EstimateNo

**Implementation** (NEW):
```typescript
const duplicate = async () => {
  // Collects all estimation data
  // POSTs to /api/chartering/estimates (no estimateNo param - backend generates new)
  // Backend creates new record with EST-YYMM-## format
  // Returns new EstimateNo to frontend
  // Saves duplicate to local state
  // Resets form to Estimate status
  // Shows notification with new EstimateNo
}
```

**Workflow**:
1. User clicks Duplicate
2. Current estimation data collected (vessel, cargo, ports, calculations)
3. POST to backend WITHOUT EstimateNo (triggers new number generation)
4. Backend generates unique EST-YYMM-## (e.g., EST-2609-02)
5. Frontend receives new EstimateNo
6. Duplicate saved to local state
7. Form reset for editing the duplicate
8. User can make changes and save with new number

**Backend Integration**: ✅
- `UpsertVoyageEstimateCommand` checks if EstimateNo provided
- If missing: generates `EST-{YY}{MM}-{count:D2}`
- Creates new VoyageEstimate record

### 4. **COMPARE** Button ✅
**Purpose**: Compare multiple estimation variants

**Functionality**:
- Toggles `compareOpen` state to show/hide comparison panel
- Creates scenarios with `addCargoVariant()` or `addVesselVariant()`
- Calculates results for each variant via `scenarioResult()`
- Displays side-by-side comparison table
- When saved: Saves all comparison data to backend

**Variants**:
- **Cargo Variant**: Changes commodity, quantity, freight rate
- **Vessel Variant**: Changes speed, fuel consumption, hire

**Compare Save Workflow**:
1. Make changes to scenario (e.g., different cargo rate)
2. Click Save button
3. All scenarios saved with main estimation
4. Backend stores full JSON with scenario data
5. Can reload and see comparison again

### 5. **SAVE** Button ✅
**Purpose**: Persists estimation to backend and receives EstimateNo

**Implementation** (ENHANCED):
```typescript
const save = async () => {
  // Prevents duplicate saves with isSaving guard
  // Collects all estimation data
  // POSTs to /api/chartering/estimates
  // Receives EstimateNo from backend
  // Updates local state with returned data
  // Creates voyage record if in create mode
  // Shows notification with EstimateNo
  // Updates button to "Saving..." with spinner
  // Handles errors gracefully
}
```

**Backend Integration**: ✅
- Endpoint: `POST /api/chartering/estimates`
- Auto-generates EstimateNo if not provided
- Stores full JSON snapshot in DataJson field
- Returns VoyageEstimateDto with EstimateNo

**Frontend State**:
- Updates via `upsertSavedEstimate()`
- Left sidebar updates via `setEstimationStatus()`
- Button shows spinner during save
- Button disabled to prevent duplicate clicks

### 6. **DISCARD** Button ✅
**Purpose**: Discards changes and clears form

**Functionality**:
- Calls `newEstimate()`
- Clears all inputs
- Resets to blank form
- Opens paste box for new data entry
- No backend call (changes not saved)

### 7. **TEMPLATE** Button ✅
**Purpose**: Apply vessel size templates to estimation

**Functionality**:
- Opens template modal via `setTplOpen(true)`
- User selects template (e.g., "Panamax", "Capesize")
- `applyTemplate()` fills vessel particulars and performance data
- Keeps manually entered vessel name intact
- Updates speed calculations

**Backend Integration**:
- Templates stored in `VESSEL_TEMPLATES` constant
- Could be extended to fetch from backend database

**Fields Applied**:
- DWT, Draft, TPC
- Vessel type
- Full/Eco ballast and laden speeds
- Fuel consumption by condition
- Main engine fuel consumption

### 8. **PDF** Button ✅
**Purpose**: Generates PDF report of estimation or comparison

**Functionality**:
- Creates formatted HTML table
- If Compare is open: Shows side-by-side comparison
- If Compare is closed: Shows single estimation details
- Opens in new window
- Triggers print dialog

**Content**:
- Vessel details (name, type, DWT, status)
- Cargo table (commodity, route, quantity, rate)
- Port rotation table (distances, sea days, work days)
- Result summary (profit, TCE, voyage days, bunker)
- Comparison table if comparing variants

### 9. **ON SUBS** Button ✅
**Purpose**: Change estimation status to "On Subscriptions"

**Implementation** (ENHANCED):
```typescript
const changeStatus = (next: EstStatus) => {
  // Prevents changes when locked (unless cancelling)
  // Sets status in frontend state
  // Updates sidebar via setEstimationStatus()
  // Saves status change to backend
  // For On Subs: persists to database
}
```

**Workflow**:
1. User clicks "On Subs"
2. Status changed to "On Subs" in UI immediately
3. Status saved to backend via `upsertSavedEstimate()`
4. Left sidebar filters update:
   - Estimation moves from "Active" to "On Subs" bucket
5. Can still edit when "On Subs"
6. Can Mark Fixed or Cancel from "On Subs"

**Sidebar Updates**: ✅
- `setEstimationStatus()` called to update frontend map
- `charteringBucket()` function buckets estimates by status
- Left sidebar listens to status changes via `useEstimationStatuses()`

### 10. **MARK FIXED** Button ✅
**Purpose**: Lock estimation as fixed with Charter Party Date

**Implementation** (ENHANCED):
```typescript
const markFixed = () => {
  // Opens date picker modal
  // User selects Charter Party Date (CPDD)
}

const confirmFixed = async () => {
  // Sets status to Fixed
  // Saves CPDD via setCpdd()
  // Generates Fixture No deterministically from voyage seed
  // Locks form (disabled = true)
  // Saves to backend
  // Updates sidebar
}
```

**Workflow**:
1. User clicks "Mark Fixed"
2. Date picker modal opens (defaults to current date or existing CPDD)
3. User selects Charter Party Date (e.g., 16.09.2026)
4. User confirms
5. Status changes to "Fixed"
6. Charter Party Date saved: `setCpdd(voyageId, "16.09.2026")`
7. Fixture No generated (e.g., "FIX-123")
8. Form locked (all fields disabled)
9. Estimation saved to backend
10. Left sidebar updates:
    - Estimation moves to "Fixed" tab/bucket
11. "Reopen" button becomes available to unlock for edits

**Backend Persistence**: ✅
- Status saved via `upsertSavedEstimate()`
- CPDD saved via `setCpdd()` (local state, synced to backend)
- Fixture No saved via `setFixtureNumber()`

### 11. **CANCEL** Button ✅
**Purpose**: Cancel the fixture (mark as Cancelled)

**Implementation** (ENHANCED WITH CONFIRMATION):
```typescript
const cancelEstimate = () => {
  // Shows confirmation dialog
  // If confirmed:
  //   - Sets status to Cancelled
  //   - Unlocks form
  //   - Clears Fixture No
  //   - Updates backend state
  //   - Saves to database
  //   - Updates sidebar
  // If cancelled: Does nothing
}
```

**Workflow**:
1. User clicks "Cancel"
2. Confirmation dialog appears:
   - "Are you sure you want to cancel this fixture?"
   - "This action will mark the estimation as Cancelled and cannot be undone."
3. If "OK":
   - Status changes to "Cancelled"
   - Form unlocked
   - Fixture No cleared
   - Saved to backend
   - Left sidebar updates:
     - Estimation moves to "Cancelled" tab/bucket
4. If "Cancel": No changes made

**Sidebar Updates**: ✅
- `setEstimationStatus()` called with 'Cancelled'
- `charteringBucket()` returns 'closed' for Cancelled status
- Left sidebar filters update automatically

---

## Status Lifecycle & Sidebar Updates

```
Estimate (Create)
    ↓
On Subs (click "On Subs" button)
    ↓
Quoted (not yet implemented - user can edit)
    ↓
Fixed (click "Mark Fixed" + date picker) ← Locked form
    ↓
Cancelled (click "Cancel" button)

OR from any state:
    ↓
Lost (status change)
Cancelled (click "Cancel")
```

### Left Sidebar Bucketing

| Status | Bucket | Icon | Filter Location |
|--------|--------|------|-----------------|
| Estimate | active | 📋 | "Active" tab |
| On Subs | active | ⏳ | "Active" tab |
| Quoted | active | 💬 | "Active" tab |
| Fixed | complete | ✓ | "Fixed" tab |
| Cancelled | closed | ✗ | "Cancelled" tab |
| Lost | closed | ✗ | "Cancelled" tab |

---

## Backend API Integration

### Key Endpoints Used

1. **POST /api/chartering/estimates** - Create/Update estimation
   - Generates EstimateNo if not provided
   - Stores full JSON snapshot
   - Returns VoyageEstimateDto with EstimateNo

2. **POST /api/chartering/estimates/auto-save** - Debounced auto-save
   - Called every 2.5s during editing
   - Fire-and-forget (no blocking)
   - Stores calculation results

3. **POST /api/chartering/calculate** - Calculate estimation
   - Real-time calculation
   - Returns profit, TCE, voyage days, etc.

### Database Persistence

Every status change and button action saves to backend:

| Action | Saves To | Fields Updated |
|--------|----------|-----------------|
| New | N/A | - |
| Paste | Auto-save | dataJson |
| Duplicate | Backend | New VoyageEstimate record |
| Compare | Auto-save | dataJson (includes scenarios) |
| Save | Backend | All fields + status |
| Discard | N/A | - |
| Template | Auto-save | vessel particulars |
| PDF | N/A | - |
| On Subs | Backend | status = "On Subs" |
| Mark Fixed | Backend | status = "Fixed", cpdd = date |
| Cancel | Backend | status = "Cancelled" |

---

## Frontend State Management

### State Variables

```typescript
const [status, setStatus] = useState<EstStatus>('Estimate');
const [locked, setLocked] = useState(false); // Form locked when Fixed
const [isSaving, setIsSaving] = useState(false); // Save button loading
const [scenarios, setScenarios] = useState<Scenario[]>([]); // Compare variants
const [compareOpen, setCompareOpen] = useState(false); // Compare panel open
const [quickPasteOpen, setQuickPasteOpen] = useState(createMode); // Paste box
const [fixOpen, setFixOpen] = useState(false); // Date picker modal
const [cpDate, setCpDate] = useState(''); // Charter Party Date
const [fixtureNo, setFixtureNo] = useState<string | null>(null); // Fixture No
```

### Auto-Save Hook

```typescript
const autoSave = useAutoSaveEstimate(2500); // 2.5s debounce

useEffect(() => {
  // Fires on any input/vessel/status change
  // Calls charteringApi.autoSaveEstimate()
  // Fire-and-forget (errors swallowed)
  autoSave(dto);
}, [inputs, vessel, status, result, ...]);
```

---

## User Workflow Example

### Scenario: Create & Fix New Estimation

1. **Create**: Click "New" → Blank form + paste box
2. **Paste**: Click "Paste Details" → Enter recap text → Ports auto-matched
3. **Edit**: Modify cargo, rates, ports, speeds
4. **Compare**: Click "Compare" → "Cargo Variant" → Change rate → See profit delta
5. **Save**: Click "Save" → Gets EST-2609-01 → Saved to backend
6. **Subscribe**: Click "On Subs" → Status updates → Appears in sidebar
7. **Fix**: Click "Mark Fixed" → Pick date 16.09.2026 → Form locks → Fixture No: FIX-123
8. **Export**: Click "PDF" → Print/save PDF report
9. **Export**: Click "Copy to Operations" → Send to Ops module
10. **Cancel**: (if needed) Click "Cancel" → Confirm → Status: Cancelled

---

## Error Handling

All button actions include try/catch:
- Network errors → User notification
- Invalid data → User notification
- Locked form → Button disabled or rejected
- Confirmation dialogs → User can abort

---

## Testing Checklist

- [ ] **New**: Clears form, opens paste box, resets status
- [ ] **Paste**: Toggles paste box visibility
- [ ] **Duplicate**: Creates new record with new EstimateNo, shows in sidebar
- [ ] **Compare**: Variants calculate correctly, save with main estimation
- [ ] **Save**: Creates/updates record, saves to backend, shows EstimateNo
- [ ] **Discard**: Clears form, no backend call
- [ ] **Template**: Fills vessel data, keeps manual name
- [ ] **PDF**: Generates proper report, opens print dialog
- [ ] **On Subs**: Status changes, saved to backend, sidebar updates
- [ ] **Mark Fixed**: Date picker works, CPDD saved, form locks, sidebar updates
- [ ] **Cancel**: Confirmation dialog appears, status changes to Cancelled, sidebar updates
- [ ] **Left Sidebar**: Updates correctly when status changes
- [ ] **Auto-Save**: Saves every 2.5s during editing (check Network tab)

---

## Status: ✅ COMPLETE & READY FOR TESTING

All button functionalities implemented with:
- ✅ Frontend state management
- ✅ Backend API integration
- ✅ Proper error handling
- ✅ Left sidebar updates
- ✅ Confirmation dialogs where needed
- ✅ TypeScript validation

**Next**: Start `npm run dev:all` and test the complete workflow!
