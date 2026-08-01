import { useSyncExternalStore } from 'react';

/**
 * Cross-module chartering → operations workflow.
 *
 * - Estimation status per voyage drives the Chartering sidebar buckets
 *   (Estimation / Fixed / Cancelled).
 * - Handover marks a fixed estimate as sent to Operations, so the voyage shows
 *   under the Operations/Performance "Active" bucket and a notification is
 *   raised for the operations team to assign a PIC.
 */

export type EstStatus = 'Estimate' | 'Quoted' | 'On Subs' | 'Fixed' | 'Cancelled' | 'Lost';
export type Lifecycle = 'active' | 'complete' | 'closed';

function stamp(): string {
  const d = new Date();
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())} ${mon} ${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* --------------------------------------------------- estimation status store */

const estStatus = new Map<string, EstStatus>();
let estSnapshot: Record<string, EstStatus> = {};
const estListeners = new Set<() => void>();
function emitEst(): void {
  estSnapshot = Object.fromEntries(estStatus);
  estListeners.forEach((l) => l());
}
export function setEstimationStatus(id: string, s: EstStatus): void {
  if (estStatus.get(id) === s) return;
  estStatus.set(id, s);
  emitEst();
}
export function getEstimationStatuses(): Record<string, EstStatus> {
  return estSnapshot;
}
export function useEstimationStatuses(): Record<string, EstStatus> {
  return useSyncExternalStore((l) => { estListeners.add(l); return () => estListeners.delete(l); }, getEstimationStatuses, getEstimationStatuses);
}

/** Bucket a chartering estimate for the sidebar tabs. */
export function charteringBucket(id: string, snap: Record<string, EstStatus>, fallback: Lifecycle): Lifecycle {
  const s = snap[id];
  if (!s) return fallback;
  if (s === 'Fixed') return 'complete';
  if (s === 'Cancelled' || s === 'Lost') return 'closed';
  return 'active';
}

/** Colour name for an estimate status — matches the estimation header badge. */
export function estStatusColor(status: string): string {
  switch (status) {
    case 'Quoted': return 'blue';
    case 'On Subs': return 'amber';
    case 'Fixed': return 'green';
    case 'Cancelled': return 'red';
    case 'Lost': return 'grey';
    default: return 'green'; // Estimate → "Estimation"
  }
}

/** Display label for an estimate status ('Estimate' shows as 'Estimation'). */
export function estStatusLabel(status: string): string {
  return status === 'Estimate' ? 'Estimation' : status;
}

/* --------------------------------------------------- estimate fix-type store */

const estFixType = new Map<string, string>();
let fixSnapshot: Record<string, string> = {};
const fixListeners = new Set<() => void>();
export function setEstimationFixType(id: string, fixType: string): void {
  if (estFixType.get(id) === fixType) return;
  estFixType.set(id, fixType);
  fixSnapshot = Object.fromEntries(estFixType);
  fixListeners.forEach((l) => l());
}
export function getEstimationFixTypes(): Record<string, string> {
  return fixSnapshot;
}
export function useEstimationFixTypes(): Record<string, string> {
  return useSyncExternalStore((l) => { fixListeners.add(l); return () => fixListeners.delete(l); }, getEstimationFixTypes, getEstimationFixTypes);
}

/* ------------------------------------------------------------ fixture number */

/** 3-letter company code used across the app for fixture numbers. */
export const COMPANY_CODE = 'STE';

/** Fixture number = <company 3 letters><YY><MM><2-digit monthly seq>, e.g. STE260723. */
export function makeFixtureNo(seq: number, date: Date = new Date()): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${COMPANY_CODE}${yy}${mm}${String(Math.max(1, seq)).padStart(2, '0')}`;
}

/** Per-voyage fixture number, assigned when the estimate is fixed in Chartering. */
const fixtureNos = new Map<string, string>();
let fixtureSnapshot: Record<string, string> = {};
const fixtureListeners = new Set<() => void>();
export function setFixtureNumber(id: string, no: string): void {
  if (fixtureNos.get(id) === no) return;
  fixtureNos.set(id, no);
  fixtureSnapshot = Object.fromEntries(fixtureNos);
  fixtureListeners.forEach((l) => l());
}
export function getFixtureNumbers(): Record<string, string> {
  return fixtureSnapshot;
}
export function useFixtureNumbers(): Record<string, string> {
  return useSyncExternalStore((l) => { fixtureListeners.add(l); return () => fixtureListeners.delete(l); }, getFixtureNumbers, getFixtureNumbers);
}

/* --------------------------------------------------- operations handover store */

const handed = new Set<string>();
let handedSnapshot: string[] = [];
const handedListeners = new Set<() => void>();
export function handoverToOperations(id: string): void {
  if (handed.has(id)) return;
  handed.add(id);
  handedSnapshot = [...handed];
  handedListeners.forEach((l) => l());
}
export function getHandedOver(): string[] {
  return handedSnapshot;
}
export function isHandedOver(id: string): boolean {
  return handed.has(id);
}
export function useHandedOver(): string[] {
  return useSyncExternalStore((l) => { handedListeners.add(l); return () => handedListeners.delete(l); }, getHandedOver, getHandedOver);
}

/* ------------------------------------------- manual module lifecycle override */

/** Modules whose Active / Completed / Closed status can be set manually. */
export type WorkflowModule = 'Operations' | 'Postfix';

const moduleKey = (m: WorkflowModule, id: string) => `${m}:${id}`;

const moduleLifecycle = new Map<string, Lifecycle>();
let moduleSnapshot: Record<string, Lifecycle> = {};
const moduleListeners = new Set<() => void>();
export function setModuleLifecycle(m: WorkflowModule, id: string, s: Lifecycle): void {
  const key = moduleKey(m, id);
  if (moduleLifecycle.get(key) === s) return;
  moduleLifecycle.set(key, s);
  moduleSnapshot = Object.fromEntries(moduleLifecycle);
  moduleListeners.forEach((l) => l());
}
export function getModuleLifecycles(): Record<string, Lifecycle> {
  return moduleSnapshot;
}
export function useModuleLifecycles(): Record<string, Lifecycle> {
  return useSyncExternalStore((l) => { moduleListeners.add(l); return () => moduleListeners.delete(l); }, getModuleLifecycles, getModuleLifecycles);
}
/** Manual status for a module row, or `undefined` when never set. */
export function moduleLifecycleOf(snap: Record<string, Lifecycle>, m: WorkflowModule, id: string): Lifecycle | undefined {
  return snap[moduleKey(m, id)];
}

/* --------------------------------------------------- charter party date (CPDD) */

/** Format a date as DD.MM.YYYY for CPDD display. */
export function formatCpdd(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

const cpdd = new Map<string, string>();
let cpddSnapshot: Record<string, string> = {};
const cpddListeners = new Set<() => void>();
/** Set the charter-party date (CPDD) for a voyage — the day it was fixed. */
export function setCpdd(id: string, date: string): void {
  if (cpdd.get(id) === date) return;
  cpdd.set(id, date);
  cpddSnapshot = Object.fromEntries(cpdd);
  cpddListeners.forEach((l) => l());
}
export function getCpdds(): Record<string, string> {
  return cpddSnapshot;
}
export function useCpdds(): Record<string, string> {
  return useSyncExternalStore((l) => { cpddListeners.add(l); return () => cpddListeners.delete(l); }, getCpdds, getCpdds);
}

/* --------------------------------------------------- operations → postfix copy */
const postfixHanded = new Set<string>();
let postfixSnapshot: string[] = [];
const postfixListeners = new Set<() => void>();
/** Mark a voyage's laytime as copied into Postfix (appears under its Active tab). */
export function copyLaytimeToPostfix(id: string): void {
  if (postfixHanded.has(id)) return;
  postfixHanded.add(id);
  postfixSnapshot = [...postfixHanded];
  postfixListeners.forEach((l) => l());
}
export function getPostfixHanded(): string[] {
  return postfixSnapshot;
}
export function usePostfixHanded(): string[] {
  return useSyncExternalStore((l) => { postfixListeners.add(l); return () => postfixListeners.delete(l); }, getPostfixHanded, getPostfixHanded);
}

/* --------------------------------------------------------- notifications store */

export interface WorkflowNotif {
  id: string;
  text: string;
  at: string;
  module: string;
  read: boolean;
}

let notifs: WorkflowNotif[] = [];
const notifListeners = new Set<() => void>();
export function addNotification(text: string, module = 'Chartering'): void {
  notifs = [{ id: `n-${Math.random().toString(36).slice(2, 8)}`, text, at: stamp(), module, read: false }, ...notifs];
  notifListeners.forEach((l) => l());
}
export function getNotifications(): WorkflowNotif[] {
  return notifs;
}
export function useNotifications(): WorkflowNotif[] {
  return useSyncExternalStore((l) => { notifListeners.add(l); return () => notifListeners.delete(l); }, getNotifications, getNotifications);
}
