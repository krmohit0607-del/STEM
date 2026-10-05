import { useEffect, useRef } from 'react';
import { charteringApi, CreateVoyageEstimateDto } from '../api/charteringApi';

/**
 * Hook for debounced auto-save of voyage estimates to backend.
 * Automatically saves every change after a 2-3 second debounce.
 * Fire-and-forget: errors are swallowed so UI is never blocked.
 */
export function useAutoSaveEstimate(debounceMs = 2500) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const autoSave = (dto: CreateVoyageEstimateDto) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      // Fire-and-forget: don't block on response, swallow errors
      charteringApi.autoSaveEstimate(dto).catch(() => {
        // Silently fail - the frontend cache is always kept in sync
      });
    }, debounceMs);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return autoSave;
}

/**
 * Calculate arrival/departure dates for port rotation.
 * Given a start date, calculates when each leg arrives and departs based on sea days + port time.
 * Returns dates in ISO format (YYYY-MM-DDTHH:mm).
 */
export function calculatePortDates(
  startDate: Date,
  legs: Array<{ seaDays: number; idleDays: number; workDays: number }>,
) {
  const dates: Array<{ arrival: string; departure: string }> = [];
  let cursor = new Date(startDate);

  for (const leg of legs) {
    const totalSeaDays = leg.seaDays;
    const arrival = new Date(cursor.getTime() + totalSeaDays * 24 * 60 * 60 * 1000);
    const portDays = leg.idleDays + leg.workDays;
    const departure = new Date(arrival.getTime() + portDays * 24 * 60 * 60 * 1000);

    dates.push({
      arrival: formatIsoDateTime(arrival),
      departure: formatIsoDateTime(departure),
    });

    cursor = departure;
  }

  return dates;
}

/**
 * Format a Date object as ISO datetime string (YYYY-MM-DDTHH:mm).
 */
export function formatIsoDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

/**
 * Normalize a port name for matching.
 * Removes country references and codes, keeping just the port name.
 */
export function normalizePortName(name: string): string {
  return name
    .split('<')[0]
    .split('(')[0]
    .trim()
    .toLowerCase();
}

/**
 * Find best match for a port name from a list of available ports.
 * Uses fuzzy matching: exact > starts with > contains.
 */
export function findBestMatchPort(
  portName: string,
  availablePorts: Array<{ name: string; country?: string; code?: string }>,
): string | null {
  const normalized = normalizePortName(portName);

  if (!normalized || availablePorts.length === 0) {
    return null;
  }

  // Exact match
  const exact = availablePorts.find((p) => normalizePortName(p.name) === normalized);
  if (exact) return exact.name;

  // Starts with match
  const startsWith = availablePorts.find((p) => normalizePortName(p.name).startsWith(normalized));
  if (startsWith) return startsWith.name;

  // Contains match
  const contains = availablePorts.find((p) => normalizePortName(p.name).includes(normalized));
  if (contains) return contains.name;

  return null;
}

/**
 * Convert CPDD format (DD.MM.YYYY) to ISO format (YYYY-MM-DD).
 */
export function cpddToIso(cpdd: string): string {
  const parts = cpdd.split('.');
  if (parts.length !== 3) return '';
  const [d, m, y] = parts;
  return `${y}-${m}-${d}`;
}

/**
 * Convert ISO date (YYYY-MM-DD) to CPDD format (DD.MM.YYYY).
 */
export function isoToCpdd(iso: string): string {
  const parts = iso.split('-');
  if (parts.length !== 3) return '';
  const [y, m, d] = parts;
  return `${d}.${m}.${y}`;
}

/**
 * Add days to a Date object.
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Calculate loadable quantity based on DWT, lightship, and deductions.
 * Returns cargo tonnage that can be loaded given density and constraints.
 */
export function calculateLoadableQty(params: {
  summerDwt: number;
  lightship: number;
  densityAtPort: number;
  vlsfo: number;
  mgo: number;
  fw: number;
  constants: number;
}): {
  deadweightAvailable: number;
  totalDeductions: number;
  loadableQuantity: number;
} {
  const deadweightAvailable = params.summerDwt - params.lightship;
  const totalDeductions = params.vlsfo + params.mgo + params.fw + params.constants;
  const loadableQuantity = Math.max(0, (deadweightAvailable - totalDeductions) / params.densityAtPort);

  return {
    deadweightAvailable,
    totalDeductions,
    loadableQuantity,
  };
}
