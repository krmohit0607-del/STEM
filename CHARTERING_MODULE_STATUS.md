# Chartering Module - Implementation Summary

## What's Been Completed ✅

### Backend Enhancements (100% Complete)
1. **CharteringCalculationService.cs** - Full voyage estimation calculation engine
   - Mirrors frontend EstimateInputs/EstimateResult logic exactly
   - Handles all commercial terms (freight, hire, commissions, demurrage)
   - Calculates bunker consumption (VLSFO, ULSFO, MGO)
   - Computes voyage days, TCE, profit breakdown
   - Includes loadable quantity calculation
   - Port-by-port leg calculations with arrival/departure times

2. **CharteringCalculationDto.cs** - Extended DTOs
   - `VoyageEstimateCalculationDto` - Full calculation results
   - `LegCalculationDto` - Per-leg breakdown
   - `LoadableQuantityDto` - LQ calculation results
   - Port/Vessel/Account data DTOs for database matching

3. **CharteringController.cs** - New endpoints
   - `/api/chartering/calculate` - Real-time calculation (POST)
   - `/api/chartering/estimates/auto-save` - Debounced save with calculations
   - `/api/chartering/calculate-loadable-quantity` - LQ calculation endpoint

4. **DependencyInjection.cs** - Service registration
   - Registered `ICharteringCalculationService` in DI container

### Frontend Enhancements (90% Complete)

1. **charteringApi.ts** - New API client methods
   - `calculateEstimate(dataJson)` - Get real-time calculations
   - `autoSaveEstimate(dto)` - Save with auto-calculated results
   - `calculateLoadableQuantity(estimateDataJson, lqDataJson)` - LQ via backend
   - New DTOs for calculation results and loadable quantity

2. **useCharteringCalculations.ts** - New hooks and utilities (NEW FILE)
   - `useAutoSaveEstimate(debounceMs)` - Debounced auto-save hook
   - `normalizePortName()` - Port name normalization
   - `findBestMatchPort()` - Fuzzy port matching (exact/starts-with/contains)
   - `calculatePortDates()` - Auto-calc arrival/departure dates
   - `calculateLoadableQty()` - LQ calculation utility
   - Date formatting and math helpers

## What Needs Manual Integration 🔄

### ChateringEstimationPage.tsx - 4 Integration Points

**1. Add Imports (Line ~1)**
```typescript
import { useAutoSaveEstimate, findBestMatchPort, normalizePortName } from '../hooks/useCharteringCalculations';
import type { VoyageEstimateCalculationDto, CreateVoyageEstimateDto } from '../api/charteringApi';
```

**2. Add Auto-Save Hook (~Line 1250, after result memo)**
- Create `const autoSave = useAutoSaveEstimate(2500);`
- Add effect that triggers on inputs/vessel/status change
- Sends data to `/api/chartering/estimates/auto-save` every 2.5 seconds
- Fire-and-forget: errors swallowed so UI never blocks

**3. Enhance applyQuickPaste Function (~Line 1400)**
- Replace hardcoded port application with `findBestMatchPort()` calls
- Match both load ports and discharge ports against database
- Falls back to pasted text if no match found
- Enriches database port data (coordinates, country codes)

**4. Add Port Rotation Manual Date Entry (~Line 2750)**
- Add state for `manualStartDate` (read from inputs.startDate)
- Add date input field in port rotation table
- Effect to update inputs.startDate when date changes
- Display row should show:
  ```
  "Voyage Start Date (Local) [DATE PICKER]"
  "Set start date; all subsequent dates auto-calculate"
  ```
- Arrival/departure cells already show calculated times from result.perLeg[]

## Architecture Overview

```
User Input (ChateringEstimationPage)
    ↓
Frontend calculation (computeEstimate) → Real-time results display
    ↓
Auto-save trigger (2.5s debounce) on any field change
    ↓
POST /api/chartering/estimates/auto-save
    ↓
Backend calculation (CharteringCalculationService)
    ↓
Parallel calculation engine (same logic as frontend)
    ↓
Results stored in VoyageEstimate.DataJson + summary fields
    ↓
Sync stored & reflects on next reload
```

### Data Flow: Paste → Calculate → Save

1. User pastes vessel/cargo recap
2. `parseEstimatePaste()` extracts structured data
3. `applyQuickPaste()` applies to fields with DB port matching
4. Frontend `useMemo` recalculates: `computeEstimate(inputs)` → EstimateResult
5. Results displayed in table (TCE, profit, voyage days, per-leg)
6. `useAutoSaveEstimate` debounces change events
7. Sends DTO to backend with dataJson payload
8. Backend service recalculates in parallel for verification
9. Results persisted to database
10. Next reload hydrates from saved data

### Loadable Quantity Flow

```
User opens Loadable Qty modal
    ↓
Enters: Summer DWT, Lightship, Density, Bunker/Water ROB
    ↓
Frontend calculates: DWT - Lightship = Deadweight
    ↓
Calculate: (Deadweight - Deductions) / Density = Loadable Cargo
    ↓
Display max loadable + allow "Use for Cargo #1" button
    ↓
Optional: Send to backend for complex scenarios
```

## Testing Checklist

### Backend
- [ ] `dotnet build` compiles without errors
- [ ] `dotnet run` starts API on http://localhost:5063
- [ ] `POST /api/chartering/calculate` returns VoyageEstimateCalculationDto
- [ ] `POST /api/chartering/estimates/auto-save` persists & calculates
- [ ] Results JSON matches frontend results within 0.01% (rounding)

### Frontend
- [ ] `npm run dev` compiles TypeScript without errors
- [ ] Create new estimation → shows blank form
- [ ] Paste recap → fields populate with DB port matching
- [ ] Edit any field → auto-save fires after 2.5s
- [ ] Modify voyage start date → arrival/departure dates recalculate
- [ ] Open Loadable Qty → calculates correctly
- [ ] Fixed estimate → "Copy to Operations" sends to Ops module

### Integration
- [ ] Backend + Frontend running simultaneously
- [ ] Paste & modify data → Network tab shows auto-save POST requests
- [ ] Reload page → data rehydrates from database
- [ ] No console errors or warnings related to chartering

## Performance Notes

- **Auto-save debounce**: 2.5 seconds (adjustable in hook)
- **Fire-and-forget**: Errors don't block UI
- **Frontend-first**: Frontend calculation always happens; backend is verification
- **Memory efficient**: Port matching uses simple string comparison
- **Database queries**: Future enhancement for vessel types & account lookup

## Future Enhancements

1. **Database Port Matching** - Load actual port list from `/api/ports` and cache
2. **Vessel Type Presets** - Query vessel types from settings, auto-fill DWT/draft/speed
3. **Account Lookup** - Suggest accounts from database during paste
4. **Historical Data** - Suggest common rates based on past estimates
5. **Conflict Resolution** - Handle simultaneous edits across tabs/users
6. **Calculation Caching** - Cache backend results for identical inputs
7. **Audit Trail** - Log all changes (currently fires silently)
8. **Offline Support** - Queue saves when backend is down

## Related Files

- `/src/components/ChateringEstimationPage.tsx` - Main component (3000+ lines)
- `/src/api/charteringApi.ts` - API client
- `/src/hooks/useCharteringCalculations.ts` - Calculation utilities
- `/backend/src/MultiTenantSaaS.Application/Services/CharteringCalculationService.cs`
- `/backend/src/MultiTenantSaaS.API/Controllers/CharteringController.cs`
- `/backend/src/MultiTenantSaaS.Application/DTOs/Chartering/CharteringCalculationDto.cs`
- [CHARTERING_IMPLEMENTATION_GUIDE.md](./CHARTERING_IMPLEMENTATION_GUIDE.md) - Detailed code integration steps

## Known Limitations

1. Port database matching only via fuzzy text search (not actual DB queries yet)
2. Vessel type defaults hardcoded (not queried from settings DB)
3. Account lookup suggestions not yet implemented
4. No LT/UTC time zone conversion (shows port local time only)
5. Loadable quantity doesn't account for trim/stability
6. Per-leg dates don't show timezone information

## Questions?

Refer to the implementation guide for exact code snippets and line numbers.
Run `npm run dev` + `dotnet run` to test end-to-end.
Check browser Network tab to verify auto-save POST requests to `/api/chartering/estimates/auto-save`.
