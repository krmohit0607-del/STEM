/**
 * Account & Service-Provider administration records shown in
 * Settings → Account Details / Service Provider Details.
 *
 * Admin store: contact details plus login credentials and role. User edits
 * (add / update / delete) are persisted to localStorage and layered over the
 * built-in seed list, mirroring the Email Templates store.
 */

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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clients));
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
