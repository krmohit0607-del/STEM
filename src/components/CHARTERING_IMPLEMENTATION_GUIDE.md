// IMPLEMENTATION GUIDE: Chartering Module Auto-Save & Real-Time Calculations
// This file shows the exact integration points needed in ChateringEstimationPage.tsx

import { useAutoSaveEstimate, findBestMatchPort, calculatePortDates, normalizePortName } from '../hooks/useCharteringCalculations';

// ============================================================================
// STEP 1: Add imports at the top of ChateringEstimationPage.tsx
// ============================================================================
// Add these to the existing imports:
// import { useAutoSaveEstimate, findBestMatchPort, normalizePortName } from '../hooks/useCharteringCalculations';
// import { charteringApi } from '../api/charteringApi';

// ============================================================================
// STEP 2: Add auto-save hook (~line 1250, after result memo and before patch helpers)
// ============================================================================
// After: const result = useMemo(() => computeEstimate(inputs), [inputs]);
// Add this code:

/*
// Auto-save with 2.5 second debounce - fire-and-forget updates to backend
const autoSave = useAutoSaveEstimate(2500);

// Whenever inputs/vessel/status change (not when locked), trigger auto-save
useEffect(() => {
  if (locked || !voyage || !estimateId) return;

  // Prepare the data for backend
  const dto: CreateVoyageEstimateDto = {
    estimateNo: estNo,
    vesselName: vessel.name.trim() || 'Untitled',
    fixType: inputs.fixType,
    status: status as any,
    profit: result.profit,
    tce: result.tce,
    commodity: inputs.cargoes[0]?.name || '',
    loadPort: inputs.ports.find((p) => p.type === 'Loading')?.port || '',
    dischargePort: inputs.ports.find((p) => p.type === 'Discharging')?.port || '',
    quantity: inputs.cargoes.reduce((s, c) => s + c.quantity, 0),
    freightRate: inputs.cargoes[0]?.frt || 0,
    dataJson: JSON.stringify({ inputs, vessel }),
  };

  // Trigger debounced auto-save
  autoSave(dto);
}, [inputs, vessel, status, result, estNo, locked, voyage, estimateId, autoSave]);
*/

// ============================================================================
// STEP 3: Enhance applyQuickPaste with port name matching (~line 1375)
// ============================================================================
// Replace the port application logic in applyQuickPaste function.
// Current code (around line 1900-1950 in applyQuickPaste):
//   if (parsed.loadPort) {
//     basePorts[loadIdx] = { ...basePorts[loadIdx], port: parsed.loadPort };
//     applied.push('load port (rotation)');
//   }

// Should become:
/*
if (parsed.loadPort) {
  // Try to match the parsed port name against available ports from database
  const matchedPort = findBestMatchPort(parsed.loadPort, 
    portOptions.map(p => ({ name: p })));
  const finalPort = matchedPort || parsed.loadPort; // Use matched or fallback to parsed
  
  basePorts[loadIdx] = { ...basePorts[loadIdx], port: finalPort };
  applied.push('load port (rotation)');
}

// Also apply to discharge ports:
dischTargets.forEach((portName, idx) => {
  const di = dischIndexes[idx];
  if (di == null) return;
  
  // Match against database ports
  const matchedPort = findBestMatchPort(portName, 
    portOptions.map(p => ({ name: p })));
  const finalPort = matchedPort || portName;
  
  const rate = parsed.dischargeRates[normalizePortName(portName)] ?? basePorts[di].ldRate;
  basePorts[di] = { 
    ...basePorts[di], 
    port: finalPort,  // Use the matched port name
    ldRate: rate > 0 ? rate : basePorts[di].ldRate 
  };
});
*/

// ============================================================================
// STEP 4: Enhance the Port Rotation table to include manual first date entry
// ============================================================================
// In the Port Rotation section, around line 2750, the table should have:
// - A date input for the first port's START date (currently just shows calculated dates)
// - Auto-calculated dates for all subsequent ports

// Add state for manual start date entry:
/*
const [manualStartDate, setManualStartDate] = useState<string>(() => {
  const d = new Date(inputs.startDate);
  return d.toISOString().split('T')[0];
});

// Effect to update inputs.startDate when manual date changes
useEffect(() => {
  if (manualStartDate) {
    patch({ startDate: `${manualStartDate}T${inputs.startDate.split('T')[1] || '12:00'}` });
  }
}, [manualStartDate]);
*/

// Then in the Port Rotation table header, add a row for date entry:
/*
<tr className="fv-ce__date-control">
  <td colSpan={2}>
    <label>
      <span>Voyage Start Date (Local)</span>
      <input 
        type="date" 
        value={manualStartDate}
        disabled={locked}
        onChange={(e) => setManualStartDate(e.target.value)}
        title="Set the first date manually; subsequent dates auto-calculate based on voyage days"
      />
    </label>
  </td>
  <td colSpan={16} className="fv-ce__hint">
    Set the start date for the voyage. All subsequent arrival/departure times calculate automatically.
  </td>
</tr>
*/

// ============================================================================
// STEP 5: Loadable Quantity Calculator Enhancement
// ============================================================================
// The loadable quantity modal is already present around line 1920.
// It should auto-calculate and display in real-time as values change.
// The current code does this, but to integrate backend calculation:

/*
// When user wants to calculate via backend (for more complex scenarios):
const submitLoadableQuantity = async () => {
  const result = await charteringApi.calculateLoadableQuantity(
    JSON.stringify({ inputs, vessel }),
    JSON.stringify(lq)
  ).catch(() => null);
  
  if (result?.data) {
    setLq((s) => ({
      ...s,
      loadableQuantity: result.data.loadableQuantity || 0
    }));
  }
};
*/

// ============================================================================
// STEP 6: Add date format helpers to ChateringEstimationPage imports
// ============================================================================
// Import these from useCharteringCalculations:
// import { 
//   formatIsoDateTime, 
//   addDays, 
//   calculateLoadableQty 
// } from '../hooks/useCharteringCalculations';

// ============================================================================
// VERIFICATION CHECKLIST
// ============================================================================
// After making these changes, verify:
// 
// ✅ Imports: useAutoSaveEstimate, findBestMatchPort, etc. are imported
// ✅ Auto-save: useEffect fires on inputs/vessel/status change, calls autoSave()
// ✅ Paste apply: Enhanced with port matching for load and discharge ports
// ✅ Port dates: Manual start date input + auto-calculated subsequent dates
// ✅ Loadable Qty: Modal appears and calculates with density-based formula
// ✅ Backend: API endpoints working (/api/chartering/calculate, /auto-save, etc.)
// ✅ No TypeScript errors: Run `npx tsc --noEmit` to verify
//
// Testing:
// 1. Create new estimation
// 2. Paste vessel/cargo details - should apply with DB port matching
// 3. Change any field - should auto-save after 2.5 seconds (check Network tab)
// 4. Modify start date - should recalculate all port dates
// 5. Open Loadable Qty - should calculate dynamically
// 6. Run `dotnet build` in backend folder - should compile without errors
// 7. Run `npm run dev` - should show NO console errors related to chartering

export {};
