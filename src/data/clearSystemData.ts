/**
 * CRITICAL: This utility completely wipes all voyage, estimation, and operations
 * data from both FRONTEND (localStorage) and BACKEND (database).
 * Use ONLY when you want a completely fresh start.
 * 
 * Data removed:
 * - All voyages from backend database
 * - All created voyages from frontend
 * - All operations recaps (voyageId-specific data)
 * - All saved estimations
 * - All voyage overrides
 * - All area constraints per voyage
 * - All selected voyage/leg state
 * - All cargo master data
 * - All emissions data per voyage
 * - All saved routes & optimization state
 * - All saved passages
 */

import { voyagesApi } from '../api/voyagesApi';

export async function clearAllVoyageData(): Promise<void> {
  try {
    console.log('🗑️  Starting complete system wipe (backend + frontend)...');
    
    // STEP 1: Delete all voyages from BACKEND
    console.log('📡 Deleting all voyages from backend database...');
    try {
      const response = await voyagesApi.deleteAll();
      console.log('✅ Backend voyages deleted:', response);
    } catch (err) {
      console.warn('⚠️  Backend delete failed (may be normal if already empty):', err);
      // Continue with frontend cleanup even if backend fails
    }
    
    // STEP 2: Clear all FRONTEND localStorage data
    const keysToDelete: string[] = [];
    
    // Iterate through all localStorage keys and identify voyage-related ones
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      
      // Main voyage storage keys
      if (
        key === 'fv.createdVoyages' ||           // All created voyages
        key === 'fv.savedEstimates' ||           // All saved estimations
        key === 'fv.selectedVoyage' ||           // Current selected voyage
        key === 'fv.selectedLeg' ||              // Current selected leg
        key === 'fv.activeRouteId' ||            // Route selection
        key === 'fv.savedRoutes' ||              // Saved routes
        key === 'cargoMaster.current' ||         // Cargo master state
        key === 'fv.savedPassages' ||            // Saved passages
        key.startsWith('fv.opsRecap.') ||        // Operations recap per voyage
        key.startsWith('fv.voyageShared.') ||    // Voyage overrides per voyage
        key.startsWith('areaConstraints.voyage.') || // Area constraints per voyage
        key.startsWith('emissions.') ||          // Emissions data per voyage
        key.startsWith('limitsConstraints.') ||  // Limits per voyage
        key.startsWith('selectedLeg.')           // Leg selection state
      ) {
        keysToDelete.push(key);
      }
    }
    
    // Delete all identified keys
    console.log(`🗑️  Deleting ${keysToDelete.length} localStorage keys...`);
    keysToDelete.forEach(key => {
      console.log(`  - Removing: ${key}`);
      window.localStorage.removeItem(key);
    });
    
    console.log('✅ All voyage data cleared from localStorage');
    console.log('⏰ Reloading page to refresh the system...');
    
    // Reload page to ensure all in-memory caches are reset
    window.location.reload();
  } catch (error) {
    console.error('❌ Error during system wipe:', error);
    throw error;
  }
}

/**
 * List all voyage-related localStorage keys (for debugging)
 */
export function listVoyageData(): { key: string; size: string }[] {
  const voyageKeys: { key: string; size: string }[] = [];
  
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    
    if (
      key.includes('voyage') ||
      key.includes('Voyage') ||
      key.includes('fv.') ||
      key.includes('cargoMaster') ||
      key.includes('emissions') ||
      key.includes('areaConstraints') ||
      key.includes('limitsConstraints')
    ) {
      const value = window.localStorage.getItem(key) || '';
      const sizeKb = (value.length / 1024).toFixed(2);
      voyageKeys.push({ key, size: `${sizeKb} KB` });
    }
  }
  
  return voyageKeys.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Show current data in console for debugging
 */
export function inspectSystemData(): void {
  console.group('📊 System Data Inspection');
  
  // Check createdVoyages
  const createdVoyagesRaw = window.localStorage.getItem('fv.createdVoyages');
  if (createdVoyagesRaw) {
    const voyages = JSON.parse(createdVoyagesRaw);
    console.log(`Created Voyages (${voyages.length}):`, voyages);
  }
  
  // Check savedEstimates
  const estimatesRaw = window.localStorage.getItem('fv.savedEstimates');
  if (estimatesRaw) {
    const estimates = JSON.parse(estimatesRaw);
    console.log(`Saved Estimates (${estimates.length}):`, estimates);
  }
  
  // List all opsRecap keys
  const opsRecapKeys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key?.startsWith('fv.opsRecap.')) {
      opsRecapKeys.push(key);
    }
  }
  if (opsRecapKeys.length > 0) {
    console.log(`Operations Recaps (${opsRecapKeys.length}):`, opsRecapKeys);
    opsRecapKeys.forEach(key => {
      const data = window.localStorage.getItem(key);
      console.log(`  ${key}:`, data ? JSON.parse(data) : 'empty');
    });
  }
  
  console.log('All Voyage-Related Keys:', listVoyageData());
  console.groupEnd();
}
