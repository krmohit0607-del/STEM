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
