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
  loadClients,
  newClientId,
  resetClients,
  saveClients,
  type Client,
} from '../data/clients';
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
            {active.id === 'client-details' && <ClientsPanel />}
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
          c.role.toLowerCase().includes(q),
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
