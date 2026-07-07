import { useEffect, useState } from 'react';

import { useL } from '../i18n/LocalizationProvider';
import {
  EMAIL_TEMPLATE_CATEGORIES,
  loadEmailTemplates,
  newTemplateId,
  resetEmailTemplates,
  saveEmailTemplates,
  type EmailTemplate,
} from '../data/emailTemplates';
import {
  CLIENT_ROLES,
  STEM_PICS,
  loadClients,
  newClientId,
  resetClients,
  saveClients,
  type Client,
} from '../data/clients';
import { VesselsPanel } from './VesselsPanel';
import { loadPortIndex, searchPortIndex, type PortHit } from '../data/portIndex';
import {
  getSavedPorts,
  newSavedPortId,
  setSavedPorts,
  type SavedPort,
} from '../data/savedPorts';
import { AreaConstraintsPage } from './AreaConstraintsPage';

/**
 * Settings popup opened from the profile menu (Profile Settings → Settings).
 *
 * A left-hand section list drives the content shown on the right. Each
 * section body is a placeholder for now — the real controls come next.
 */

interface SettingsSection {
  id: string;
  labelKey: string;
  labelFallback: string;
  icon: string;
}

const SECTIONS: SettingsSection[] = [
  { id: 'email-templates', labelKey: 'emailTemplates', labelFallback: 'Email Templates', icon: 'fa-envelope' },
  { id: 'report-templates', labelKey: 'reportTemplates', labelFallback: 'Report Templates', icon: 'fa-file-lines' },
  { id: 'vessel-details', labelKey: 'vesselsDetails', labelFallback: 'Vessels Details', icon: 'fa-ship' },
  { id: 'client-details', labelKey: 'clientDetails', labelFallback: 'Client Details', icon: 'fa-user-tie' },
  { id: 'port-details', labelKey: 'portDetails', labelFallback: 'Port Details', icon: 'fa-anchor' },
  { id: 'area-constraints', labelKey: 'areaConstraints', labelFallback: 'Area Constraints', icon: 'fa-draw-polygon' },
  { id: 'saved-passages', labelKey: 'savedPassages', labelFallback: 'Saved Passages', icon: 'fa-route' },
];

export function SettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const [activeId, setActiveId] = useState<string>(SECTIONS[0].id);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const active = SECTIONS.find((s) => s.id === activeId) ?? SECTIONS[0];

  return (
    <div
      className="fv-settings-modal__overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="fv-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('settings', 'Settings')}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="fv-settings-modal__head">
          <h3>
            <i className="fas fa-gear" aria-hidden="true" /> {t('settings', 'Settings')}
          </h3>
          <button
            type="button"
            className="fv-settings-modal__close"
            onClick={onClose}
            aria-label={t('close', 'Close')}
          >
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </header>
        <div className="fv-settings-modal__body">
          <nav className="fv-settings-modal__nav" aria-label={t('settings', 'Settings')}>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`fv-settings-modal__nav-item${
                  s.id === activeId ? ' fv-settings-modal__nav-item--active' : ''
                }`}
                aria-current={s.id === activeId ? 'page' : undefined}
                onClick={() => setActiveId(s.id)}
              >
                <i className={`fas ${s.icon}`} aria-hidden="true" />
                <span>{t(s.labelKey, s.labelFallback)}</span>
              </button>
            ))}
          </nav>
          <section className="fv-settings-modal__content">
            <h4 className="fv-settings-modal__content-title">
              <i className={`fas ${active.icon}`} aria-hidden="true" />{' '}
              {t(active.labelKey, active.labelFallback)}
            </h4>
            {active.id === 'email-templates' && <EmailTemplatesPanel />}
            {active.id === 'vessel-details' && <VesselsPanel />}
            {active.id === 'client-details' && <ClientsPanel />}
            {active.id === 'port-details' && <PortsPanel />}
            {active.id === 'area-constraints' && (
              <div className="fv-settings-area">
                <AreaConstraintsPage mode="admin" />
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function EmailTemplatesPanel() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const [templates, setTemplates] = useState<EmailTemplate[]>(() => loadEmailTemplates());
  const [query, setQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // `editing` holds the template currently in the editor (id === '' for a new one).
  const [editing, setEditing] = useState<EmailTemplate | null>(null);

  // Persist every change so edits survive across sessions.
  useEffect(() => {
    saveEmailTemplates(templates);
  }, [templates]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? templates.filter(
        (tpl) =>
          tpl.title.toLowerCase().includes(q) ||
          tpl.body.toLowerCase().includes(q) ||
          tpl.category.toLowerCase().includes(q),
      )
    : templates;

  const copy = async (id: string, body: string) => {
    try {
      await navigator.clipboard.writeText(body);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const startNew = () =>
    setEditing({
      id: '',
      category: EMAIL_TEMPLATE_CATEGORIES[0],
      title: '',
      body: '',
    });

  const startEdit = (tpl: EmailTemplate) => setEditing({ ...tpl });

  const deleteTemplate = (id: string) => {
    if (!window.confirm(t('confirmDeleteTemplate', 'Delete this template?'))) return;
    setTemplates((prev) => prev.filter((x) => x.id !== id));
    setEditing((e) => (e && e.id === id ? null : e));
  };

  const saveEditing = () => {
    if (!editing) return;
    const title = editing.title.trim();
    const body = editing.body.trim();
    if (!title || !body) return;
    const category = editing.category.trim() || EMAIL_TEMPLATE_CATEGORIES[0];
    setTemplates((prev) => {
      if (editing.id) {
        return prev.map((x) =>
          x.id === editing.id ? { ...editing, title, body, category } : x,
        );
      }
      return [{ id: newTemplateId(), title, body, category }, ...prev];
    });
    setEditing(null);
  };

  const restoreDefaults = () => {
    if (
      !window.confirm(
        t(
          'confirmRestoreTemplates',
          'Restore the built-in templates? Your custom changes will be lost.',
        ),
      )
    )
      return;
    setTemplates(resetEmailTemplates());
    setEditing(null);
  };

  return (
    <div className="fv-email-templates">
      <div className="fv-email-templates__bar">
        <div className="fv-email-templates__search">
          <i className="fas fa-magnifying-glass" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchTemplates', 'Search templates…')}
            aria-label={t('searchTemplates', 'Search templates…')}
          />
        </div>
        <button type="button" className="fv-email-templates__new" onClick={startNew}>
          <i className="fas fa-plus" aria-hidden="true" /> {t('newTemplate', 'New template')}
        </button>
        <button
          type="button"
          className="fv-email-templates__reset"
          onClick={restoreDefaults}
          title={t('restoreDefaults', 'Restore defaults')}
          aria-label={t('restoreDefaults', 'Restore defaults')}
        >
          <i className="fas fa-rotate-left" aria-hidden="true" />
        </button>
      </div>

      {editing && editing.id === '' && (
        <TemplateEditor
          t={t}
          value={editing}
          onChange={setEditing}
          onSave={saveEditing}
          onCancel={() => setEditing(null)}
        />
      )}

      <div className="fv-email-templates__list">
        {filtered.length === 0 ? (
          <p className="fv-email-templates__empty">
            {t('noTemplatesMatch', 'No templates match your search.')}
          </p>
        ) : (
          filtered.map((tpl) =>
            editing && editing.id === tpl.id ? (
              <TemplateEditor
                key={tpl.id}
                t={t}
                value={editing}
                onChange={setEditing}
                onSave={saveEditing}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <article key={tpl.id} className="fv-email-template">
                <header className="fv-email-template__head">
                  <div className="fv-email-template__titles">
                    <span className="fv-email-template__cat">{tpl.category}</span>
                    <h5 className="fv-email-template__title">{tpl.title}</h5>
                  </div>
                  <div className="fv-email-template__actions">
                    <button
                      type="button"
                      className="fv-email-template__btn"
                      onClick={() => copy(tpl.id, tpl.body)}
                    >
                      <i
                        className={`fas ${copiedId === tpl.id ? 'fa-check' : 'fa-copy'}`}
                        aria-hidden="true"
                      />{' '}
                      {copiedId === tpl.id ? t('copied', 'Copied') : t('copy', 'Copy')}
                    </button>
                    <button
                      type="button"
                      className="fv-email-template__btn"
                      onClick={() => startEdit(tpl)}
                      aria-label={t('edit', 'Edit')}
                      title={t('edit', 'Edit')}
                    >
                      <i className="fas fa-pen" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="fv-email-template__btn fv-email-template__btn--danger"
                      onClick={() => deleteTemplate(tpl.id)}
                      aria-label={t('delete', 'Delete')}
                      title={t('delete', 'Delete')}
                    >
                      <i className="fas fa-trash" aria-hidden="true" />
                    </button>
                  </div>
                </header>
                <p className="fv-email-template__body">{tpl.body}</p>
              </article>
            ),
          )
        )}
      </div>
    </div>
  );
}

function TemplateEditor({
  t,
  value,
  onChange,
  onSave,
  onCancel,
}: {
  t: (key: string, fallback: string) => string;
  value: EmailTemplate;
  onChange: (tpl: EmailTemplate) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const canSave = value.title.trim().length > 0 && value.body.trim().length > 0;
  return (
    <form
      className="fv-email-template fv-email-template--edit"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <div className="fv-email-template__field-row">
        <label className="fv-email-template__field">
          <span>{t('templateTitle', 'Title')}</span>
          <input
            type="text"
            value={value.title}
            autoFocus
            onChange={(e) => onChange({ ...value, title: e.target.value })}
          />
        </label>
        <label className="fv-email-template__field fv-email-template__field--cat">
          <span>{t('category', 'Category')}</span>
          <input
            type="text"
            list="fv-template-categories"
            value={value.category}
            onChange={(e) => onChange({ ...value, category: e.target.value })}
          />
          <datalist id="fv-template-categories">
            {EMAIL_TEMPLATE_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
      </div>
      <label className="fv-email-template__field">
        <span>{t('templateBody', 'Body')}</span>
        <textarea
          rows={6}
          value={value.body}
          onChange={(e) => onChange({ ...value, body: e.target.value })}
        />
      </label>
      <div className="fv-email-template__edit-actions">
        <button type="button" className="fv-email-template__btn" onClick={onCancel}>
          {t('cancel', 'Cancel')}
        </button>
        <button
          type="submit"
          className="fv-email-template__btn fv-email-template__btn--primary"
          disabled={!canSave}
        >
          <i className="fas fa-check" aria-hidden="true" /> {t('save', 'Save')}
        </button>
      </div>
    </form>
  );
}

function clientToText(c: Client): string {
  return [
    `Name: ${c.name}`,
    `Location: ${c.location}`,
    `Contact: ${c.contactName}`,
    `Email: ${c.email}`,
    `Phone: ${c.phone}`,
    `Username: ${c.username}`,
    `Role: ${c.role}`,
    `STEM PIC: ${c.pic || 'Unassigned'}`,
    `Status: ${c.active ? 'Active' : 'Inactive'}`,
  ].join('\n');
}

function ClientsPanel() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const [clients, setClients] = useState<Client[]>(() => loadClients());
  const [query, setQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revealId, setRevealId] = useState<string | null>(null);
  // `editing` holds the client currently in the editor (id === '' for a new one).
  const [editing, setEditing] = useState<Client | null>(null);

  useEffect(() => {
    saveClients(clients);
  }, [clients]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? clients.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.location.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.contactName.toLowerCase().includes(q) ||
          c.username.toLowerCase().includes(q) ||
          c.role.toLowerCase().includes(q) ||
          c.pic.toLowerCase().includes(q),
      )
    : clients;

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const startNew = () =>
    setEditing({
      id: '',
      name: '',
      location: '',
      email: '',
      contactName: '',
      phone: '',
      username: '',
      password: '',
      role: CLIENT_ROLES[0],
      pic: '',
      active: true,
    });

  const startEdit = (c: Client) => setEditing({ ...c });

  const duplicate = (c: Client) => {
    setEditing({
      ...c,
      id: '',
      name: `${c.name} (copy)`,
      username: '',
      password: '',
    });
  };

  const deleteClient = (id: string) => {
    if (!window.confirm(t('confirmDeleteClient', 'Delete this client?'))) return;
    setClients((prev) => prev.filter((x) => x.id !== id));
    setEditing((e) => (e && e.id === id ? null : e));
  };

  const saveEditing = () => {
    if (!editing) return;
    const name = editing.name.trim();
    const email = editing.email.trim();
    if (!name || !email) return;
    const next: Client = {
      ...editing,
      name,
      email,
      location: editing.location.trim(),
      contactName: editing.contactName.trim(),
      phone: editing.phone.trim(),
      username: editing.username.trim(),
      role: editing.role.trim() || CLIENT_ROLES[0],
      pic: editing.pic,
    };
    setClients((prev) => {
      if (editing.id) {
        return prev.map((x) => (x.id === editing.id ? next : x));
      }
      return [{ ...next, id: newClientId() }, ...prev];
    });
    setEditing(null);
  };

  const restoreDefaults = () => {
    if (
      !window.confirm(
        t(
          'confirmRestoreClients',
          'Restore the built-in clients? Your custom changes will be lost.',
        ),
      )
    )
      return;
    setClients(resetClients());
    setEditing(null);
  };

  return (
    <div className="fv-email-templates">
      <div className="fv-email-templates__bar">
        <div className="fv-email-templates__search">
          <i className="fas fa-magnifying-glass" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchClients', 'Search clients…')}
            aria-label={t('searchClients', 'Search clients…')}
          />
        </div>
        <button type="button" className="fv-email-templates__new" onClick={startNew}>
          <i className="fas fa-plus" aria-hidden="true" /> {t('newClient', 'New client')}
        </button>
        <button
          type="button"
          className="fv-email-templates__reset"
          onClick={restoreDefaults}
          title={t('restoreDefaults', 'Restore defaults')}
          aria-label={t('restoreDefaults', 'Restore defaults')}
        >
          <i className="fas fa-rotate-left" aria-hidden="true" />
        </button>
      </div>

      {editing && editing.id === '' && (
        <ClientEditor
          t={t}
          value={editing}
          onChange={setEditing}
          onSave={saveEditing}
          onCancel={() => setEditing(null)}
        />
      )}

      <div className="fv-email-templates__list">
        {filtered.length === 0 ? (
          <p className="fv-email-templates__empty">
            {t('noClientsMatch', 'No clients match your search.')}
          </p>
        ) : (
          filtered.map((c) =>
            editing && editing.id === c.id ? (
              <ClientEditor
                key={c.id}
                t={t}
                value={editing}
                onChange={setEditing}
                onSave={saveEditing}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <article key={c.id} className="fv-client-card">
                <header className="fv-email-template__head">
                  <div className="fv-email-template__titles">
                    <span className="fv-email-template__cat">{c.role}</span>
                    <h5 className="fv-email-template__title">
                      {c.name}
                      <span
                        className={`fv-client-card__status fv-client-card__status--${
                          c.active ? 'on' : 'off'
                        }`}
                      >
                        {c.active ? t('active', 'Active') : t('inactive', 'Inactive')}
                      </span>
                    </h5>
                  </div>
                  <div className="fv-email-template__actions">
                    <button
                      type="button"
                      className="fv-email-template__btn"
                      onClick={() => copy(c.id, clientToText(c))}
                    >
                      <i
                        className={`fas ${copiedId === c.id ? 'fa-check' : 'fa-copy'}`}
                        aria-hidden="true"
                      />{' '}
                      {copiedId === c.id ? t('copied', 'Copied') : t('copy', 'Copy')}
                    </button>
                    <button
                      type="button"
                      className="fv-email-template__btn"
                      onClick={() => duplicate(c)}
                      aria-label={t('duplicate', 'Duplicate')}
                      title={t('duplicate', 'Duplicate')}
                    >
                      <i className="fas fa-clone" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="fv-email-template__btn"
                      onClick={() => startEdit(c)}
                      aria-label={t('edit', 'Edit')}
                      title={t('edit', 'Edit')}
                    >
                      <i className="fas fa-pen" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="fv-email-template__btn fv-email-template__btn--danger"
                      onClick={() => deleteClient(c.id)}
                      aria-label={t('delete', 'Delete')}
                      title={t('delete', 'Delete')}
                    >
                      <i className="fas fa-trash" aria-hidden="true" />
                    </button>
                  </div>
                </header>
                <dl className="fv-client-card__grid">
                  <div>
                    <dt>{t('clientLocation', 'Location')}</dt>
                    <dd>{c.location || '—'}</dd>
                  </div>
                  <div>
                    <dt>{t('clientContact', 'Contact')}</dt>
                    <dd>{c.contactName || '—'}</dd>
                  </div>
                  <div>
                    <dt>{t('clientEmail', 'Email')}</dt>
                    <dd>{c.email || '—'}</dd>
                  </div>
                  <div>
                    <dt>{t('clientPhone', 'Phone')}</dt>
                    <dd>{c.phone || '—'}</dd>
                  </div>
                  <div>
                    <dt>{t('clientUsername', 'Username')}</dt>
                    <dd>{c.username || '—'}</dd>
                  </div>
                  <div>
                    <dt>{t('clientPic', 'STEM PIC')}</dt>
                    <dd>{c.pic || t('unassigned', 'Unassigned')}</dd>
                  </div>
                  <div>
                    <dt>{t('clientPassword', 'Password')}</dt>
                    <dd className="fv-client-card__password">
                      <span>{revealId === c.id ? c.password || '—' : '••••••••'}</span>
                      <button
                        type="button"
                        className="fv-client-card__reveal"
                        onClick={() =>
                          setRevealId((r) => (r === c.id ? null : c.id))
                        }
                        aria-label={
                          revealId === c.id
                            ? t('hidePassword', 'Hide password')
                            : t('showPassword', 'Show password')
                        }
                        title={
                          revealId === c.id
                            ? t('hidePassword', 'Hide password')
                            : t('showPassword', 'Show password')
                        }
                      >
                        <i
                          className={`fas ${revealId === c.id ? 'fa-eye-slash' : 'fa-eye'}`}
                          aria-hidden="true"
                        />
                      </button>
                    </dd>
                  </div>
                </dl>
              </article>
            ),
          )
        )}
      </div>
    </div>
  );
}

function ClientEditor({
  t,
  value,
  onChange,
  onSave,
  onCancel,
}: {
  t: (key: string, fallback: string) => string;
  value: Client;
  onChange: (client: Client) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const canSave = value.name.trim().length > 0 && value.email.trim().length > 0;
  return (
    <form
      className="fv-email-template fv-email-template--edit"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <div className="fv-email-template__field-row">
        <label className="fv-email-template__field">
          <span>{t('clientName', 'Client name')}</span>
          <input
            type="text"
            value={value.name}
            autoFocus
            onChange={(e) => onChange({ ...value, name: e.target.value })}
          />
        </label>
        <label className="fv-email-template__field">
          <span>{t('clientLocation', 'Location')}</span>
          <input
            type="text"
            value={value.location}
            onChange={(e) => onChange({ ...value, location: e.target.value })}
          />
        </label>
      </div>

      <div className="fv-email-template__field-row">
        <label className="fv-email-template__field">
          <span>{t('clientContact', 'Contact name')}</span>
          <input
            type="text"
            value={value.contactName}
            onChange={(e) => onChange({ ...value, contactName: e.target.value })}
          />
        </label>
        <label className="fv-email-template__field">
          <span>{t('clientPhone', 'Phone')}</span>
          <input
            type="tel"
            value={value.phone}
            onChange={(e) => onChange({ ...value, phone: e.target.value })}
          />
        </label>
      </div>

      <label className="fv-email-template__field">
        <span>{t('clientEmail', 'Email')}</span>
        <input
          type="email"
          value={value.email}
          onChange={(e) => onChange({ ...value, email: e.target.value })}
        />
      </label>

      <div className="fv-email-template__field-row">
        <label className="fv-email-template__field">
          <span>{t('clientUsername', 'Username')}</span>
          <input
            type="text"
            autoComplete="off"
            value={value.username}
            onChange={(e) => onChange({ ...value, username: e.target.value })}
          />
        </label>
        <label className="fv-email-template__field">
          <span>{t('clientPassword', 'Password')}</span>
          <input
            type="text"
            autoComplete="new-password"
            value={value.password}
            onChange={(e) => onChange({ ...value, password: e.target.value })}
          />
        </label>
      </div>

      <div className="fv-email-template__field-row">
        <label className="fv-email-template__field fv-email-template__field--cat">
          <span>{t('clientRole', 'Role')}</span>
          <select
            value={value.role}
            onChange={(e) => onChange({ ...value, role: e.target.value })}
          >
            {CLIENT_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="fv-email-template__field fv-email-template__field--cat">
          <span>{t('clientPic', 'STEM PIC (assigned to)')}</span>
          <select
            value={value.pic}
            onChange={(e) => onChange({ ...value, pic: e.target.value })}
          >
            <option value="">{t('unassigned', 'Unassigned')}</option>
            {STEM_PICS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="fv-email-template__field-row">
        <label className="fv-email-template__field fv-client-editor__active">
          <span>{t('clientStatus', 'Login enabled')}</span>
          <input
            type="checkbox"
            checked={value.active}
            onChange={(e) => onChange({ ...value, active: e.target.checked })}
          />
        </label>
      </div>

      <div className="fv-email-template__edit-actions">
        <button type="button" className="fv-email-template__btn" onClick={onCancel}>
          {t('cancel', 'Cancel')}
        </button>
        <button
          type="submit"
          className="fv-email-template__btn fv-email-template__btn--primary"
          disabled={!canSave}
        >
          <i className="fas fa-check" aria-hidden="true" /> {t('save', 'Save')}
        </button>
      </div>
    </form>
  );
}

// --- Ports -----------------------------------------------------------------

/** A port being edited (`id === ''` means a new, unsaved port). */
interface PortDraft {
  id: string;
  name: string;
  lat: string;
  lon: string;
  unlocode: string;
  country: string;
}

function toDraft(p: SavedPort): PortDraft {
  return {
    id: p.id,
    name: p.name,
    lat: String(p.lat),
    lon: String(p.lon),
    unlocode: p.unlocode ?? '',
    country: p.country ?? '',
  };
}

/**
 * Parse a latitude/longitude typed in a flexible format into signed
 * decimal degrees. Accepts, for either axis:
 *   - decimal degrees:      "-35.5", "35.5 S", "151.2 E"
 *   - degrees dec. minutes: "35 30.5 S", "35°30.5' S"
 *   - degrees min. seconds: "35 30 15 S", "35°30'15\" S"
 * Hemisphere letters (N/S/E/W) or a leading minus set the sign. Returns
 * `null` when the value can't be parsed or is out of range.
 */
function parseCoordinate(raw: string, axis: 'lat' | 'lon'): number | null {
  if (raw == null) return null;
  let s = String(raw).trim().toUpperCase();
  if (s === '') return null;

  let sign = 1;
  const hemi = s.match(/[NSEW]/);
  if (hemi) {
    if (hemi[0] === 'S' || hemi[0] === 'W') sign = -1;
    s = s.replace(/[NSEW]/g, ' ');
  } else if (s.startsWith('-')) {
    sign = -1;
  }

  // Normalise degree/minute/second symbols and separators to spaces.
  s = s.replace(/[°ºd:'′`"″,]/g, ' ').replace(/-/g, ' ');
  const nums = s.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return null;

  const [d, m = '0', sec = '0'] = nums;
  const value =
    sign * (Math.abs(Number(d)) + Number(m) / 60 + Number(sec) / 3600);
  if (!Number.isFinite(value)) return null;

  const limit = axis === 'lat' ? 90 : 180;
  if (value < -limit || value > limit) return null;
  return Math.round(value * 1e5) / 1e5;
}

function PortsPanel() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const [ports, setPorts] = useState<SavedPort[]>(() => getSavedPorts());
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<PortDraft | null>(null);

  // "Add from World Port Index" lookup state.
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupHits, setLookupHits] = useState<PortHit[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Debounced search against the (lazily-loaded) World Port Index.
  useEffect(() => {
    if (!lookupOpen) return;
    const q = lookupQuery.trim();
    if (q.length < 2) {
      setLookupHits([]);
      setLookupLoading(false);
      return;
    }
    let cancelled = false;
    setLookupLoading(true);
    setLookupError(null);
    const id = window.setTimeout(() => {
      searchPortIndex(q)
        .then((hits) => {
          if (!cancelled) setLookupHits(hits);
        })
        .catch(() => {
          if (!cancelled) setLookupError(t('portIndexFailed', 'Could not load the World Port Index.'));
        })
        .finally(() => {
          if (!cancelled) setLookupLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupQuery, lookupOpen]);

  const openLookup = () => {
    setEditing(null);
    setLookupOpen(true);
    loadPortIndex().catch(() =>
      setLookupError(t('portIndexFailed', 'Could not load the World Port Index.')),
    );
  };

  const pickPortHit = (hit: PortHit) => {
    setEditing({
      id: '',
      name: hit.name,
      lat: hit.lat,
      lon: hit.lon,
      unlocode: hit.unlocode,
      country: hit.country,
    });
    setLookupOpen(false);
    setLookupQuery('');
    setLookupHits([]);
  };

  const q = query.trim().toLowerCase();
  const filtered = q
    ? ports.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.unlocode ?? '').toLowerCase().includes(q) ||
          (p.country ?? '').toLowerCase().includes(q),
      )
    : ports;

  // Persist to the shared store (also updates the map) and mirror to state.
  const commit = (next: SavedPort[]) => {
    setSavedPorts(next);
    setPorts(getSavedPorts());
  };

  const startNew = () =>
    setEditing({ id: '', name: '', lat: '', lon: '', unlocode: '', country: '' });
  const startEdit = (p: SavedPort) => setEditing(toDraft(p));

  const saveEditing = () => {
    if (!editing) return;
    const name = editing.name.trim();
    const lat = parseCoordinate(editing.lat, 'lat');
    const lon = parseCoordinate(editing.lon, 'lon');
    if (!name || lat === null || lon === null) return;
    const unlocode = editing.unlocode.trim().toUpperCase();
    const country = editing.country.trim();

    if (editing.id) {
      const id = editing.id;
      commit(ports.map((p) => (p.id === id ? { ...p, name, lat, lon, unlocode, country } : p)));
    } else {
      commit([...ports, { id: newSavedPortId(), name, lat, lon, unlocode, country }]);
    }
    setEditing(null);
  };

  const deletePort = (p: SavedPort) => {
    if (!window.confirm(t('confirmDeletePort', `Delete the port “${p.name}”?`))) return;
    commit(ports.filter((x) => x.id !== p.id));
    setEditing((e) => (e && e.id === p.id ? null : e));
  };

  return (
    <div className="fv-email-templates">
      <div className="fv-email-templates__bar">
        <div className="fv-email-templates__search">
          <i className="fas fa-magnifying-glass" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPorts', 'Search ports…')}
            aria-label={t('searchPorts', 'Search ports…')}
          />
        </div>
        <div className="fv-email-templates__bar-actions">
          <button type="button" className="fv-email-template__btn" onClick={openLookup}>
            <i className="fas fa-magnifying-glass-location" aria-hidden="true" />{' '}
            {t('addFromPortIndex', 'Add from World Port Index')}
          </button>
          <button type="button" className="fv-email-templates__new" onClick={startNew}>
            <i className="fas fa-plus" aria-hidden="true" /> {t('newPort', 'New port')}
          </button>
        </div>
      </div>

      {lookupOpen && (
        <div className="fv-imo-lookup">
          <div className="fv-imo-lookup__head">
            <div className="fv-imo-lookup__search">
              <i className="fas fa-magnifying-glass" aria-hidden="true" />
              <input
                type="search"
                autoFocus
                value={lookupQuery}
                onChange={(e) => setLookupQuery(e.target.value)}
                placeholder={t('portIndexSearch', 'Search port name, UN/LOCODE or country…')}
              />
            </div>
            <button type="button" className="fv-email-template__btn" onClick={() => setLookupOpen(false)}>
              {t('close', 'Close')}
            </button>
          </div>
          {lookupError ? (
            <p className="fv-email-templates__empty" role="alert">
              <i className="fas fa-triangle-exclamation" aria-hidden="true" /> {lookupError}
            </p>
          ) : lookupLoading ? (
            <p className="fv-imo-lookup__hint">{t('searching', 'Searching…')}</p>
          ) : lookupQuery.trim().length < 2 ? (
            <p className="fv-imo-lookup__hint">
              {t(
                'portIndexHint',
                'Type at least 2 characters (port name, UN/LOCODE or country). The World Port Index (~3,700 ports) loads on first search.',
              )}
            </p>
          ) : lookupHits.length === 0 ? (
            <p className="fv-imo-lookup__hint">{t('portIndexNoMatch', 'No ports match.')}</p>
          ) : (
            <ul className="fv-imo-lookup__list">
              {lookupHits.map((hit, i) => (
                <li key={`${hit.name}-${i}`}>
                  <button type="button" className="fv-imo-lookup__hit" onClick={() => pickPortHit(hit)}>
                    <span className="fv-imo-lookup__hit-main">
                      <span className="fv-imo-lookup__hit-name">
                        {hit.name}
                        {hit.unlocode && <span className="fv-vessel-code">{hit.unlocode}</span>}
                      </span>
                      <span className="fv-imo-lookup__hit-meta">
                        {hit.country || '—'} · {hit.lat}, {hit.lon}
                      </span>
                    </span>
                    <span className="fv-imo-lookup__hit-add">
                      <i className="fas fa-plus" aria-hidden="true" /> {t('add', 'Add')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {editing && editing.id === '' && (
        <PortEditor
          t={t}
          value={editing}
          onChange={setEditing}
          onSave={saveEditing}
          onCancel={() => setEditing(null)}
        />
      )}

      {filtered.length === 0 ? (
        <p className="fv-email-templates__empty">
          {q
            ? t('noPortsMatch', 'No ports match your search.')
            : t('noPorts', 'No ports yet. Add one from the World Port Index or create one.')}
        </p>
      ) : (
        <table className="fv-ports-table">
          <thead>
            <tr>
              <th>{t('portName', 'Port')}</th>
              <th>{t('portUnlocode', 'UN/LOCODE')}</th>
              <th>{t('portCountry', 'Country')}</th>
              <th>{t('portLat', 'Latitude')}</th>
              <th>{t('portLon', 'Longitude')}</th>
              <th aria-label={t('actions', 'Actions')} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) =>
              editing && editing.id === p.id ? (
                <tr key={p.id}>
                  <td colSpan={6}>
                    <PortEditor
                      t={t}
                      value={editing}
                      onChange={setEditing}
                      onSave={saveEditing}
                      onCancel={() => setEditing(null)}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.unlocode || '\u2014'}</td>
                  <td>{p.country || '\u2014'}</td>
                  <td>{p.lat.toFixed(2)}</td>
                  <td>{p.lon.toFixed(2)}</td>
                  <td className="fv-ports-table__actions">
                    <button
                      type="button"
                      className="fv-email-template__btn"
                      onClick={() => startEdit(p)}
                      aria-label={t('edit', 'Edit')}
                      title={t('edit', 'Edit')}
                    >
                      <i className="fas fa-pen" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="fv-email-template__btn fv-email-template__btn--danger"
                      onClick={() => deletePort(p)}
                      aria-label={t('delete', 'Delete')}
                      title={t('delete', 'Delete')}
                    >
                      <i className="fas fa-trash" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PortEditor({
  t,
  value,
  onChange,
  onSave,
  onCancel,
}: {
  t: (key: string, fallback: string) => string;
  value: PortDraft;
  onChange: (port: PortDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const canSave =
    value.name.trim().length > 0 &&
    parseCoordinate(value.lat, 'lat') !== null &&
    parseCoordinate(value.lon, 'lon') !== null;
  const latDecimal = parseCoordinate(value.lat, 'lat');
  const lonDecimal = parseCoordinate(value.lon, 'lon');
  return (
    <form
      className="fv-email-template fv-email-template--edit"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <div className="fv-email-template__field-row">
        <label className="fv-email-template__field">
          <span>{t('portName', 'Port')}</span>
          <input
            type="text"
            value={value.name}
            autoFocus
            onChange={(e) => onChange({ ...value, name: e.target.value })}
          />
        </label>
        <label className="fv-email-template__field">
          <span>{t('portUnlocode', 'UN/LOCODE')}</span>
          <input
            type="text"
            value={value.unlocode}
            placeholder="e.g. SGSIN"
            maxLength={10}
            onChange={(e) => onChange({ ...value, unlocode: e.target.value })}
          />
        </label>
        <label className="fv-email-template__field">
          <span>{t('portCountry', 'Country')}</span>
          <input
            type="text"
            value={value.country}
            placeholder="e.g. Singapore"
            onChange={(e) => onChange({ ...value, country: e.target.value })}
          />
        </label>
      </div>
      <div className="fv-email-template__field-row">
        <label className="fv-email-template__field">
          <span>{t('portLat', 'Latitude')}</span>
          <input
            type="text"
            inputMode="text"
            value={value.lat}
            placeholder="e.g. 1.29 or 01 17.4 N"
            onChange={(e) => onChange({ ...value, lat: e.target.value })}
          />
          <small className="fv-port-coord-hint">
            {value.lat.trim() === ''
              ? t('portCoordFormats', 'Decimal or deg/min, e.g. 1.29 · 01 17.4 N')
              : latDecimal === null
                ? t('portCoordInvalid', 'Unrecognised latitude')
                : `= ${latDecimal.toFixed(5)}°`}
          </small>
        </label>
        <label className="fv-email-template__field">
          <span>{t('portLon', 'Longitude')}</span>
          <input
            type="text"
            inputMode="text"
            value={value.lon}
            placeholder="e.g. 103.85 or 103 51.0 E"
            onChange={(e) => onChange({ ...value, lon: e.target.value })}
          />
          <small className="fv-port-coord-hint">
            {value.lon.trim() === ''
              ? t('portCoordFormats', 'Decimal or deg/min, e.g. 103.85 · 103 51.0 E')
              : lonDecimal === null
                ? t('portCoordInvalid', 'Unrecognised longitude')
                : `= ${lonDecimal.toFixed(5)}°`}
          </small>
        </label>
      </div>
      <div className="fv-email-template__edit-actions">
        <button type="button" className="fv-email-template__btn" onClick={onCancel}>
          {t('cancel', 'Cancel')}
        </button>
        <button
          type="submit"
          className="fv-email-template__btn fv-email-template__btn--primary"
          disabled={!canSave}
        >
          <i className="fas fa-check" aria-hidden="true" /> {t('save', 'Save')}
        </button>
      </div>
    </form>
  );
}
