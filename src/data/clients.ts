/**
 * Client administration records shown in Settings → Client Details.
 *
 * This is the admin store for clients: their contact details plus the login
 * credentials and role assigned to them. User edits (add / update / delete)
 * are persisted to localStorage and layered over the built-in seed list,
 * mirroring the Email Templates store.
 */

export interface Client {
  id: string;
  /** Company / client name. */
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
  /** STEM PIC — company person-in-charge this client is assigned to. */
  pic: string;
  /** Whether the login is enabled. */
  active: boolean;
}

export const CLIENT_ROLES = [
  'Administrator',
  'Manager',
  'Operations Manager',
  'Chartering',
  'Accounts',
  'Client User',
  'Viewer',
] as const;

/**
 * Company (STEM) persons-in-charge a client can be assigned to when
 * created in Settings → Client Details.
 */
export const STEM_PICS = [
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
  },
  {
    id: 'cl-northstar',
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
  },
  {
    id: 'cl-pacifica',
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
      // Normalise older records saved before `pic` existed.
      return (parsed as Client[]).map((c) => ({ ...c, pic: c.pic ?? '' }));
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

function isClient(v: unknown): v is Client {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Client).id === 'string' &&
    typeof (v as Client).name === 'string' &&
    typeof (v as Client).email === 'string'
  );
}
