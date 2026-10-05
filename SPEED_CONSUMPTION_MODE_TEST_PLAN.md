# Speed & Consumption Mode Testing Plan

## Overview
This document outlines the 10 test scenarios to verify that FULL/ECO/CUSTOM speed modes correctly control the calculation engine.

---

## Test Scenario 1: Full Mode — Display & Calculation
**Setup**:
- Create a new estimation
- Enter vessel particulars (DWT: 65000)
- Set Full mode: Ballast Speed: 15 knots, Laden Speed: 13.5 knots
- Set FO Consumption: Normal Ballast: 40 MT/day, Laden: 35 MT/day

**Actions**:
1. Add ballast leg (Loading port) - 2000 NM
2. Add laden leg (Discharge port) - 3000 NM
3. Enter cargo: 60,000 MT

**Expected Results**:
- Speed table shows: Ballast 15 | Laden 13.5 ✅
- Ballast leg uses 15 knots (4.17 days sea time)
- Laden leg uses 13.5 knots (9.26 days sea time)
- FO consumption uses mainNormal: Ballast 40 MT/day, Laden 35 MT/day
- Total bunker = (4.17 × 40) + (9.26 × 35) = 489 MT

---

## Test Scenario 2: Eco Mode — Display & Calculation
**Setup**: Reuse estimation from Test 1

**Actions**:
1. Set Eco mode: Ballast Speed: 13 knots, Laden Speed: 11.5 knots
2. Set FO Consumption ECA: Normal Ballast: 30 MT/day, Laden: 26 MT/day
3. Click Eco radio button

**Expected Results**:
- Speed table shows: Ballast 13 | Laden 11.5 ✅
- Ballast leg recalculates to 13 knots (6.41 days)
- Laden leg recalculates to 11.5 knots (10.96 days)
- Consumption switches to mainEca: Ballast 30 MT/day, Laden 26 MT/day
- Total bunker = (6.41 × 30) + (10.96 × 26) = 478 MT
- Voyage days increase (longer at eco speeds)
- TCE/PNL updates to reflect slower passage + lower bunker cost

---

## Test Scenario 3: Custom Speed — Creation & Activation
**Setup**: Reuse estimation from Test 2

**Actions**:
1. Click "+" button to add custom speed
2. Rename to "Weather Degraded"
3. Set Custom: Ballast 12.5 knots, Laden 11 knots

**Expected Results**:
- New custom option appears: "Weather Degraded" radio button ✅
- Speedmode automatically switches to "Weather Degraded"
- All ports update to new custom speeds: Ballast 12.5, Laden 11
- Calculation uses mainNormal consumption (custom shares Full's consumption)
- Total bunker recalculates with new speeds

---

## Test Scenario 4: Mode Switching (Full → Eco)
**Setup**: Test 3 (at Custom mode)

**Actions**:
1. Click Full radio button
2. Observe speed table and calculation

**Expected Results**:
- Speedmode changes to "Full"
- Speed table shows Full values: Ballast 15 | Laden 13.5
- All port legs update to Full speeds
- Consumption switches back to mainNormal (Full's consumption)
- Total bunker uses mainNormal values
- Voyage days decrease
- PNL updates

---

## Test Scenario 5: Mode Switching (Eco → Custom → Full)
**Setup**: Test 4 (at Full mode)

**Actions**:
1. Click Eco radio button
2. Wait for recalculation
3. Click "Weather Degraded" custom speed
4. Wait for recalculation
5. Click Full radio button again

**Expected Results**:
- Each mode switch updates all port speeds within 500ms
- Consumption always matches the active mode
- Voyage days and TCE update correctly at each step
- No calculation errors in browser console
- PNL line items update (demurrage/despatch may change due to day differences)

---

## Test Scenario 6: Ballast vs Laden Detection by Leg Type
**Setup**: New estimation

**Actions**:
1. Set Full mode: Ballast 15 | Laden 13.5
2. Add Ballast leg (port type = Ballast) - 1000 NM
3. Add Loading leg (port type = Loading) - manual
4. Add Laden leg (port type = Laden) - 2000 NM
5. Add Discharging leg (port type = Discharging) - manual
6. Add Delivery leg (port type = Delivery) - manual

**Expected Results**:
- Ballast leg speed = 15 knots ✅
- Loading leg speed = 13.5 knots (laden is default)
- Laden leg speed = 13.5 knots
- Discharging leg speed = 13.5 knots (laden is default)
- Delivery leg speed = 15 knots (ballast)

---

## Test Scenario 7: ECA Zone Consumption Split
**Setup**: New estimation with ECA route

**Actions**:
1. Set Full mode
2. Set FO Normal: Ballast 40, Laden 35
3. Set FO ECA: Ballast 30, Laden 26
4. Add laden leg with ECA distance = 1000 NM, Total distance = 2000 NM
5. Confirm ecaRoute = "Suez" or similar

**Expected Results**:
- Consumption calculation:
  - Normal sea days (1000 NM) = 1000/spd/24 = uses mainNormal consumption
  - ECA sea days (1000 NM) = 1000/spd/24 = uses mainEca consumption
- FO breakdown shows both VLSFO (normal) and ULSFO (ECA) separately
- Total consumption = (normal days × 35) + (eca days × 26)
- User can see VLSFO and ULSFO prices applied separately

---

## Test Scenario 8: Port Idle/Work Consumption
**Setup**: New estimation

**Actions**:
1. Set Full mode: FO Normal Idle 2 MT/day, Work 5 MT/day
2. Add port with idle 2 days, work 3 days

**Expected Results**:
- FO Port consumption = (2 × 2) + (3 × 5) = 19 MT
- DO Port consumption = (2 × idle_rate) + (3 × work_rate)
- Total bunker includes port consumption
- Switching to Eco mode uses mainEca's idle/work rates

---

## Test Scenario 9: ROB (Remaining on Board) Tracking
**Setup**: Test 1 (Full mode)

**Actions**:
1. Enter initial bunker: VLSFO = 600 MT
2. Calculate leg 1 consumption (ballast): ~167 MT
3. Check ROB after leg 1 = 600 - 167 = 433 MT
4. Calculate leg 2 consumption (laden): ~322 MT
5. Check ROB after leg 2 = 433 - 322 = 111 MT

**Expected Results**:
- ROB calculation tracks consumption per leg
- Shows remaining bunker after each port call
- Warning if ROB goes negative
- Switching modes recalculates all ROB values

---

## Test Scenario 10: New Port Inherits Mode Speed
**Setup**: New estimation at Eco mode

**Actions**:
1. Set Eco mode: Ballast 13, Laden 11.5
2. Add first port (Discharging)
3. Add second port (should auto-get Eco laden speed)
4. Switch to Full mode
5. Add third port (should auto-get Full laden speed)

**Expected Results**:
- Port 1 speed = 11.5 (Eco laden) ✅
- Port 2 speed = 11.5 (Eco laden)
- After switching to Full:
- Port 3 speed = 13.5 (Full laden)
- All three ports update to Full speeds when mode changes

---

## Verification Checklist

- [ ] All 10 scenarios execute without console errors
- [ ] Speed values update within 500ms of mode change
- [ ] Consumption values update without delay
- [ ] TCE/PNL recalculates correctly for each mode
- [ ] Ballast/laden detection works for all leg types
- [ ] ECA zone consumption splits correctly
- [ ] Custom speed creation and application works
- [ ] Port ROB tracking is accurate per mode
- [ ] New ports inherit current mode speeds
- [ ] Mode switching is smooth (no lag/flicker)
- [ ] Frontend build: 0 errors ✅
- [ ] Backend build: 0 errors ✅
- [ ] No "undefined" or "NaN" values in calculations
- [ ] Database auto-save captures mode correctly in DataJson
