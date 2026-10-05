# Quick Reference: 4 Manual Edits for ChateringEstimationPage.tsx

## Edit 1: Add Imports (Top of file, line ~1-10)

**Location**: After existing imports

**Add this:**
```typescript
import { useAutoSaveEstimate, findBestMatchPort, normalizePortName } from '../hooks/useCharteringCalculations';
```

---

## Edit 2: Add Auto-Save Hook (~line 1250 area)

**Location**: Right after this line:
```typescript
const result = useMemo(() => computeEstimate(inputs), [inputs]);
```

**Add this effect:**
```typescript
// Auto-save with 2.5 second debounce (fire-and-forget, non-blocking)
const autoSave = useAutoSaveEstimate(2500);

useEffect(() => {
  if (locked || !voyage || !estimateId) return;

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

  autoSave(dto);
}, [inputs, vessel, status, result, estNo, locked, voyage, estimateId, autoSave]);
```

---

## Edit 3: Enhance applyQuickPaste (~line 1900-1950)

**Location**: Inside `applyQuickPaste()` function, replace the load/discharge port assignment

**Find and replace this section:**
```typescript
if (parsed.loadPort) {
  basePorts[loadIdx] = { ...basePorts[loadIdx], port: parsed.loadPort };
  applied.push('load port (rotation)');
}
```

**With this:**
```typescript
if (parsed.loadPort) {
  const matchedPort = findBestMatchPort(parsed.loadPort, 
    portOptions.map(p => ({ name: p })));
  basePorts[loadIdx] = { 
    ...basePorts[loadIdx], 
    port: matchedPort || parsed.loadPort 
  };
  applied.push('load port (rotation)');
}
```

**Also find and replace discharge ports:**
```typescript
dischTargets.forEach((portName, idx) => {
  const di = dischIndexes[idx];
  if (di == null) return;
  const rate = parsed.dischargeRates[keyPortName(portName)] ?? basePorts[di].ldRate;
  basePorts[di] = { ...basePorts[di], port: portName, ldRate: rate > 0 ? rate : basePorts[di].ldRate };
});
```

**With this:**
```typescript
dischTargets.forEach((portName, idx) => {
  const di = dischIndexes[idx];
  if (di == null) return;
  const matchedPort = findBestMatchPort(portName, 
    portOptions.map(p => ({ name: p })));
  const rate = parsed.dischargeRates[normalizePortName(portName)] ?? basePorts[di].ldRate;
  basePorts[di] = { 
    ...basePorts[di], 
    port: matchedPort || portName, // Use matched port or fallback to parsed
    ldRate: rate > 0 ? rate : basePorts[di].ldRate 
  };
});
```

---

## Edit 4: Add Manual Start Date Input (~line 2750 in Port Rotation section)

**Location**: Inside the Port Rotation table, as the first row of `<tbody>`

**Add this state (before the return statement, near other state declarations):**
```typescript
const [manualStartDate, setManualStartDate] = useState<string>(() => {
  const d = new Date(inputs.startDate);
  return d.toISOString().split('T')[0];
});

useEffect(() => {
  if (manualStartDate) {
    const time = inputs.startDate.split('T')[1] || '12:00';
    patch({ startDate: `${manualStartDate}T${time}` });
  }
}, [manualStartDate]);
```

**Add this row before the port rows in the table tbody:**
```typescript
<tr className="fv-ce__date-header">
  <td colSpan={2}>
    <label className="fv-ce__lq-point" title="Set voyage start date; all subsequent dates auto-calculate">
      <span>Voyage Start (Local)</span>
      <input 
        type="date" 
        value={manualStartDate}
        disabled={locked}
        onChange={(e) => setManualStartDate(e.target.value)}
      />
    </label>
  </td>
  <td colSpan={14} className="fv-ce__hint">
    Set the first port's arrival date. All subsequent arrival/departure times auto-calculate based on voyage days.
  </td>
</tr>
```

---

## Verify & Test

After making all 4 edits:

1. **TypeScript Check**:
   ```bash
   npx tsc --noEmit -p tsconfig.json
   ```
   Should have no errors related to chartering

2. **Dev Server**:
   ```bash
   npm run dev
   ```
   Should compile and run without errors

3. **Functional Test**:
   - Create new estimation
   - Paste vessel/cargo details
   - Verify ports are matched from database
   - Change any field
   - Open browser Network tab → should see POST to `/api/chartering/estimates/auto-save` after 2.5s
   - Change start date → port table should update with recalculated arrival/departure times

4. **Backend Build**:
   ```bash
   cd backend/src/MultiTenantSaaS.API
   dotnet build
   dotnet run
   ```
   Should start API without errors

---

## Summary

These 4 edits complete the chartering module:
- ✅ Real-time auto-save to backend (2.5s debounce)
- ✅ Database port name matching
- ✅ Manual voyage date entry with auto-calculated subsequent dates
- ✅ Backend calculation service running in parallel with frontend

All calculation logic is already implemented and working. These edits wire it into the UI.
