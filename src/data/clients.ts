/**
 * Account & Service-Provider administration records shown in
 * Settings → Account Details / Service Provider Details.
 *
 * Admin store: contact details plus login credentials and role. User edits
 * (add / update / delete) are persisted to localStorage and layered over the
 * built-in seed list, mirroring the Email Templates store, and mirrored to the
 * tenant database via `clientsApi` so every module (Operations, Chartering,
 * Accounts) sees the same account/charterer/broker list, not just the browser
 * that created it. Login credentials (`username`/`password`) have no backend
 * equivalent (the Clients API only models the commercial counterparty record)
 * so they're preserved locally across a backend sync rather than round-tripped.
 */
import { useSyncExternalStore } from 'react';
import { clientsApi, type BackendClientDto, type CreateClientDto, type UpdateClientDto } from '../api/clientsApi';

export interface Client {
  id: string;
  /** Record kind — a commercial account or a service provider. */
  kind: 'Account' | 'Service Provider';
  /** Category/type within the kind (e.g. Owner / Charterer, or Bunker Surveyor). */
  category: string;
  /** Company / account name. */
  name: string;
  /** City / country or office location. */
  location: string;
  /** Primary email address. */
  email: string;
  /** Contact person name. */
  contactName: string;
  /** Phone / contact number. */
  phone: string;
  /** Login username. */
  username: string;
  /** Login password. */
  password: string;
  /** Assigned role controlling access. */
  role: string;
  /** ODAS PIC — company person-in-charge this account is assigned to. */
  pic: string;
  /** Whether the login is enabled. */
  active: boolean;
    /** Bank account details for payments. */
    bankAccount: {
      verified: boolean;
      details: string;
      bankName: string;
      accountHolder: string;
      accountNumber: string;
      swift: string;
      iban: string;
    };
}

/** Account types (Settings → Account Details). */
export const ACCOUNT_TYPES = ['Owner', 'Charterer', 'Broker', 'Operator'] as const;

/** Service provider types (Settings → Service Provider Details). */
export const SERVICE_PROVIDER_TYPES = [
  'Bunker Surveyor',
  'Draft Surveyor',
  'Bunker Sample Testing',
  'Hold Inspector',
  'OnHire-OffHire Bunker Surveyor',
  'Bunker Supplier / Trader',
  'Weather Routing Service',
  'PNI Club',
] as const;

export const CLIENT_ROLES = [
  'Administrator',
  'Manager',
  'Operations Manager',
  'Chartering',
  'Accounts',
  'Account User',
  'Viewer',
] as const;

/**
 * Company (ODAS) persons-in-charge an account can be assigned to when
 * created in Settings → Account Details.
 */
export const ODAS_PICS = [
  'Amit Sharma',
  'Rahul Verma',
  'Priya Nair',
  'Tom Becker',
  'Liang Wei',
  'Sofia Marin',
  'James Okoro',
] as const;

export const CLIENTS: Client[] = [
  {
    id: 'cl-oceanic',
    kind: 'Account',
    category: 'Owner',
    name: 'Oceanic Bulk Carriers',
    location: 'Singapore',
    email: 'ops@oceanicbulk.example.com',
    contactName: 'Marcus Tan',
    phone: '+65 6123 4567',
    username: 'oceanic.ops',
    password: 'Change#2026',
    role: 'Operations Manager',
    pic: 'Amit Sharma',
    active: true,
      bankAccount: { verified: false, details: '', bankName: '', accountHolder: '', accountNumber: '', swift: '', iban: '' },
  },
  {
    id: 'cl-northstar',
    kind: 'Account',
    category: 'Charterer',
    name: 'Northstar Chartering',
    location: 'London, UK',
    email: 'chartering@northstar.example.com',
    contactName: 'Eleanor Hughes',
    phone: '+44 20 7946 0102',
    username: 'northstar.chart',
    password: 'Charter!77',
    role: 'Chartering',
    pic: 'Priya Nair',
    active: true,
      bankAccount: { verified: false, details: '', bankName: '', accountHolder: '', accountNumber: '', swift: '', iban: '' },
  },
  {
    id: 'cl-pacifica',
    kind: 'Account',
    category: 'Operator',
    name: 'Pacifica Shipping Lines',
    location: 'Rotterdam, NL',
    email: 'accounts@pacifica.example.com',
    contactName: 'Johan de Vries',
    phone: '+31 10 224 6688',
    username: 'pacifica.acct',
    password: 'Invoice$09',
    role: 'Accounts',
    pic: 'Tom Becker',
    active: false,
      bankAccount: { verified: false, details: '', bankName: '', accountHolder: '', accountNumber: '', swift: '', iban: '' },
  },
  {
    id: 'sp-veritas',
    kind: 'Service Provider',
    category: 'Draft Surveyor',
    name: 'Bureau Veritas Marine',
    location: 'Rotterdam, NL',
    email: 'survey@bvmarine.example.com',
    contactName: 'Lars Jansen',
    phone: '+31 10 445 9900',
    username: 'bv.survey',
    password: 'Survey#2026',
    role: 'Viewer',
    pic: 'Tom Becker',
    active: true,
      bankAccount: { verified: false, details: '', bankName: '', accountHolder: '', accountNumber: '', swift: '', iban: '' },
  },
  {
    id: 'sp-oceanbunkers',
    kind: 'Service Provider',
    category: 'Bunker Supplier / Trader',
    name: 'Ocean Bunkers',
    location: 'Singapore',
    email: 'trading@oceanbunkers.example.com',
    contactName: 'Wei Ling',
    phone: '+65 6222 8080',
    username: 'ocean.bunkers',
    password: 'Bunker$77',
    role: 'Account User',
    pic: 'Liang Wei',
    active: true,
      bankAccount: { verified: false, details: '', bankName: '', accountHolder: '', accountNumber: '', swift: '', iban: '' },
  },
  {
    id: 'sp-stormgeo',
    kind: 'Service Provider',
    category: 'Weather Routing Service',
    name: 'StormGeo Routing',
    location: 'Bergen, NO',
    email: 'routing@stormgeo.example.com',
    contactName: 'Ingrid Solberg',
    phone: '+47 55 60 38 00',
    username: 'stormgeo.route',
    password: 'Route!2026',
    role: 'Viewer',
    pic: 'Sofia Marin',
    active: true,
      bankAccount: { verified: false, details: '', bankName: '', accountHolder: '', accountNumber: '', swift: '', iban: '' },
  },
];

// --- Persistence -------------------------------------------------------------

const STORAGE_KEY = 'fv.clients';

export function loadClients(): Client[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...CLIENTS];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(isClient)) {
      // Normalise older records saved before newer fields existed.
        return (parsed as Client[]).map((c) => ({
          ...c,
          pic: c.pic ?? '',
          kind: c.kind ?? 'Account',
          category: c.category ?? '',
          bankAccount: {
            verified: c.bankAccount?.verified ?? false,
            details: c.bankAccount?.details ?? '',
            bankName: c.bankAccount?.bankName ?? '',
            accountHolder: c.bankAccount?.accountHolder ?? '',
            accountNumber: c.bankAccount?.accountNumber ?? '',
            swift: c.bankAccount?.swift ?? '',
            iban: c.bankAccount?.iban ?? '',
          },
        }));
    }
  } catch {
    /* fall back to defaults */
  }
  return [...CLIENTS];
}

export function saveClients(clients: Client[]): void {
  try {
    clientSnapshot = clients;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clients));
    notifyClientListeners();
  } catch {
    /* storage unavailable — ignore */
  }
}

export function resetClients(): Client[] {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return [...CLIENTS];
}

export function newClientId(): string {
  return `cl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/* ----- Backend sync ----- */

const toBackendKind = (kind: Client['kind']): string => (kind === 'Service Provider' ? 'ServiceProvider' : 'Account');
const fromBackendKind = (kind: string): Client['kind'] => (kind === 'ServiceProvider' ? 'Service Provider' : 'Account');

function mapBackendToClient(dto: BackendClientDto, existing?: Client): Client {
  return {
    id: dto.id,
    kind: fromBackendKind(dto.kind),
    category: dto.category ?? '',
    name: dto.name,
    location: dto.location ?? '',
    email: dto.email ?? '',
    contactName: dto.contactName ?? '',
    phone: dto.phone ?? '',
    // Login credentials aren't part of the backend Client record — keep whatever this
    // browser already has locally for this account rather than wiping it on every sync.
    username: existing?.username ?? '',
    password: existing?.password ?? '',
    role: dto.role ?? '',
    pic: dto.picAssignment ?? '',
    active: dto.isActive,
    bankAccount: {
      verified: dto.bankAccountVerified,
      details: existing?.bankAccount?.details ?? '',
      bankName: dto.bankName ?? '',
      accountHolder: dto.accountHolder ?? '',
      accountNumber: dto.accountNumber ?? '',
      swift: dto.swift ?? '',
      iban: dto.iban ?? '',
    },
  };
}

export function clientToCreateDto(c: Client): CreateClientDto {
  return {
    name: c.name,
    kind: toBackendKind(c.kind),
    category: c.category,
    location: c.location,
    email: c.email,
    contactName: c.contactName,
    phone: c.phone,
    role: c.role,
    picAssignment: c.pic,
    bankName: c.bankAccount.bankName,
    accountHolder: c.bankAccount.accountHolder,
    accountNumber: c.bankAccount.accountNumber,
    swift: c.bankAccount.swift,
    iban: c.bankAccount.iban,
  };
}

export function clientToUpdateDto(c: Client): UpdateClientDto {
  return { ...clientToCreateDto(c), isActive: c.active, bankAccountVerified: c.bankAccount.verified };
}

/** Pull the tenant's Clients from the backend, merging over the local cache (by id) so
 *  browser-only fields like login credentials survive; returns the merged list. Never wipes
 *  the local cache when the backend has no records yet — an empty backend just means nothing
 *  has been pushed there so far, not that the locally-held accounts should be deleted. */
export async function syncClientsFromBackend(): Promise<Client[]> {
  try {
    const list = await clientsApi.list();
    if (!list || list.length === 0) return loadClients();
    const existingById = new Map(loadClients().map((c) => [c.id, c]));
    const mapped = list.map((dto) => mapBackendToClient(dto, existingById.get(dto.id)));
    saveClients(mapped);
    return mapped;
  } catch {
    // Offline / backend unavailable — fall back to whatever's cached locally.
  }
  return loadClients();
}

/* ----- Reactive client state management ----- */

let clientSnapshot: Client[] = loadClients();
const clientListeners = new Set<() => void>();

function subscribeClients(listener: () => void): () => void {
  clientListeners.add(listener);
  return () => clientListeners.delete(listener);
}

function notifyClientListeners(): void {
  clientListeners.forEach((l) => l());
}

export function getClients(): Client[] {
  return clientSnapshot;
}

/** React hook: the live list of clients/accounts (updates whenever any component or a
 *  backend sync changes them) — use this instead of `loadClients()` in components so
 *  autocomplete lists (Owners/Charterers/Brokers) stay current without a page reload. */
export function useClients(): Client[] {
  return useSyncExternalStore(subscribeClients, getClients, getClients);
}

/**
 * Names of the commercial accounts (kind === 'Account') created in
 * Settings → Account Details, for use as autocomplete options wherever an
 * account/counterparty is selected across the app.
 */
export function accountNames(): string[] {
  return loadClients()
    .filter((c) => (c.kind ?? 'Account') === 'Account')
    .map((c) => c.name.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function isClient(v: unknown): v is Client {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Client).id === 'string' &&
    typeof (v as Client).name === 'string' &&
    typeof (v as Client).email === 'string'
  );
}
