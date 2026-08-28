export interface SystemMailRecord {
  id: string;
  to: string;
  subject: string;
  body: string;
  attachments: string[];
  sentAt: string;
  status: 'Sent';
}

const KEY = 'fv.systemMail.sent';

export function sendSystemMail(mail: Omit<SystemMailRecord, 'id' | 'sentAt' | 'status'>): SystemMailRecord {
  const record: SystemMailRecord = {
    ...mail,
    id: `system-mail-${Date.now()}`,
    sentAt: new Date().toISOString(),
    status: 'Sent',
  };
  try {
    const raw = window.localStorage.getItem(KEY);
    const existing = raw ? JSON.parse(raw) : [];
    const messages = Array.isArray(existing) ? existing : [];
    window.localStorage.setItem(KEY, JSON.stringify([record, ...messages]));
  } catch {
    // Keep the in-page confirmation even if browser storage is unavailable.
  }
  return record;
}
