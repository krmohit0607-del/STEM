import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';

import { useL } from '../i18n/LocalizationProvider';
import { RichTextEditor } from './RichTextEditor';
import {
  EMAIL_MAIN_CATEGORIES,
  EMAIL_SUB_CATEGORIES,
  EMAIL_SUB_SUB_CATEGORIES,
  EMAIL_TOKENS,
  SAMPLE_VOYAGE,
  applyVoyageTokens,
  ensureHtml,
  getRecipientTypeOptions,
  htmlToPlain,
  loadEmailTemplates,
  newTemplateId,
  resetEmailTemplates,
  saveEmailTemplates,
  type EmailTemplate,
  type EmailAttachment,
  type RecipientTypeGroup,
  loadEmailDistributionLists,
  newDistributionListId,
  saveEmailDistributionLists,
  type EmailDistributionList,
} from '../data/emailTemplates';
import {
  ACCOUNT_TYPES,
  CLIENT_ROLES,
  ODAS_PICS,
  SERVICE_PROVIDER_TYPES,
  loadClients,
  newClientId,
  resetClients,
  saveClients,
  type Client,
} from '../data/clients';
import { VesselsPanel } from './VesselsPanel';
import { useWorkflowConfig, setWorkflowConfig } from '../data/workflowConfig';
import {
  EST_OPTION_LABELS,
  resetEstimationOptions,
  setEstimationOptionList,
  useEstimationOptions,
  type EstOptionKey,
} from '../data/estimationOptions';
import { loadPortIndex, searchPortIndex, type PortHit } from '../data/portIndex';
import {
  getSavedPorts,
  newSavedPortId,
  setSavedPorts,
  type SavedPort,
} from '../data/savedPorts';
import { AreaConstraintsPage } from './AreaConstraintsPage';
import { loadSavedPassages, loadBundledSavedPassages, mergeSavedPassages, saveSavedPassages, type SavedPassage } from '../data/savedPassages';
import { CargoMasterPanel } from './CargoMasterPanel';

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
  { id: 'email-distribution', labelKey: 'emailDistribution', labelFallback: 'Email Distribution List', icon: 'fa-users' },
  { id: 'report-templates', labelKey: 'reportTemplates', labelFallback: 'Report Templates', icon: 'fa-file-lines' },
  { id: 'vessel-details', labelKey: 'vesselsDetails', labelFallback: 'Vessels Details', icon: 'fa-ship' },
  { id: 'estimation-options', labelKey: 'estimationOptions', labelFallback: 'Estimation Options', icon: 'fa-sliders' },
  { id: 'client-details', labelKey: 'accountDetails', labelFallback: 'Account Details', icon: 'fa-user-tie' },
  { id: 'service-providers', labelKey: 'serviceProviderDetails', labelFallback: 'Service Provider Details', icon: 'fa-user-gear' },
  { id: 'port-details', labelKey: 'portDetails', labelFallback: 'Port Details', icon: 'fa-anchor' },
  { id: 'cargo-master', labelKey: 'cargoMaster', labelFallback: 'Cargo Master', icon: 'fa-boxes-stacked' },
  { id: 'area-constraints', labelKey: 'areaConstraints', labelFallback: 'Area Constraints', icon: 'fa-draw-polygon' },
  { id: 'saved-passages', labelKey: 'savedPassages', labelFallback: 'Saved Passages', icon: 'fa-route' },
  { id: 'workflow-config', labelKey: 'workflowConfig', labelFallback: 'Company & Workflow', icon: 'fa-building' },
];

export function SettingsModal({
  open,
  onClose,
  asPage,
}: {
  open: boolean;
  onClose: () => void;
  /** Render as a full standalone page (Settings route) instead of a modal overlay. */
  asPage?: boolean;
}) {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const [activeId, setActiveId] = useState<string>(SECTIONS[0].id);

  useEffect(() => {
    if (!open || asPage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, asPage]);

  if (!open) return null;

  const active = SECTIONS.find((s) => s.id === activeId) ?? SECTIONS[0];

  const nav = (
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
  );

  const content = (
    <section className="fv-settings-modal__content">
      <h4 className="fv-settings-modal__content-title">
        <i className={`fas ${active.icon}`} aria-hidden="true" />{' '}
        {t(active.labelKey, active.labelFallback)}
      </h4>
      {active.id === 'email-templates' && <EmailTemplatesPanel />}
      {active.id === 'email-distribution' && <EmailDistributionPanel />}
      {active.id === 'vessel-details' && <VesselsPanel />}
      {active.id === 'estimation-options' && <EstimationOptionsPanel />}
      {active.id === 'client-details' && <ClientsPanel kind="Account" />}
      {active.id === 'service-providers' && <ClientsPanel kind="Service Provider" />}
      {active.id === 'port-details' && <PortsPanel />}
      {active.id === 'cargo-master' && <CargoMasterPanel />}
      {active.id === 'area-constraints' && (
        <div className="fv-settings-area">
          <AreaConstraintsPage mode="admin" />
        </div>
      )}
      {active.id === 'saved-passages' && <SavedPassagesPanel />}
      {active.id === 'workflow-config' && <WorkflowConfigPanel />}
    </section>
  );

  if (asPage) {
    return (
      <div className="fv-settings-page">
        <header className="fv-settings-page__head">
          <h1>
            <i className="fas fa-gear" aria-hidden="true" /> {t('settings', 'Settings')}
          </h1>
          <p className="fv-settings-page__sub">
            {t('settingsPageSub', 'Admin settings panel — configure templates, master data and workflow for the application.')}
          </p>
        </header>
        <div className="fv-settings-page__body">
          {nav}
          {content}
        </div>
      </div>
    );
  }

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
          {nav}
          {content}
        </div>
      </div>
    </div>
  );
}

/**
 * Admin editor for the Voyage Estimation dropdown lists. Values are persisted
 * so estimation dropdowns are data-driven (add / rename / reorder / remove).
 */
function EstimationOptionsPanel() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };
  const opts = useEstimationOptions();
  const keys = Object.keys(EST_OPTION_LABELS) as EstOptionKey[];
  const [activeKey, setActiveKey] = useState<EstOptionKey>(keys[0]);
  const [draft, setDraft] = useState('');

  const list = opts[activeKey];

  const update = (next: string[]) => setEstimationOptionList(activeKey, next);
  const add = () => {
    const v = draft.trim();
    if (!v || list.includes(v)) return;
    update([...list, v]);
    setDraft('');
  };
  const rename = (i: number, v: string) => update(list.map((x, idx) => (idx === i ? v : x)));
  const remove = (i: number) => update(list.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    update(next);
  };
  const restore = () => {
    if (!window.confirm(t('confirmRestoreOptions', 'Restore all estimation option lists to defaults?'))) return;
    resetEstimationOptions();
  };

  return (
    <div className="fv-est-opts">
      <div className="fv-est-opts__cats">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            className={`fv-est-opts__cat${k === activeKey ? ' fv-est-opts__cat--active' : ''}`}
            onClick={() => setActiveKey(k)}
          >
            {EST_OPTION_LABELS[k]}
            <span className="fv-est-opts__count">{opts[k].length}</span>
          </button>
        ))}
      </div>
      <div className="fv-est-opts__editor">
        <div className="fv-est-opts__editor-head">
          <h5>{EST_OPTION_LABELS[activeKey]}</h5>
          <button type="button" className="fv-email-template__btn" onClick={restore} title={t('restoreDefaults', 'Restore defaults')}>
            <i className="fas fa-rotate-left" aria-hidden="true" /> {t('restoreDefaults', 'Restore defaults')}
          </button>
        </div>
        <div className="fv-est-opts__add">
          <input
            type="text"
            value={draft}
            placeholder={t('addValue', 'Add value…')}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          />
          <button type="button" className="fv-email-template__btn fv-email-template__btn--primary" onClick={add}>
            <i className="fas fa-plus" aria-hidden="true" /> {t('add', 'Add')}
          </button>
        </div>
        <ul className="fv-est-opts__list">
          {list.map((val, i) => (
            <li key={`${val}-${i}`} className="fv-est-opts__row">
              <input type="text" value={val} onChange={(e) => rename(i, e.target.value)} />
              <span className="fv-est-opts__row-actions">
                <button type="button" className="fv-email-template__btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t('moveUp', 'Move up')} title={t('moveUp', 'Move up')}>
                  <i className="fas fa-chevron-up" aria-hidden="true" />
                </button>
                <button type="button" className="fv-email-template__btn" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label={t('moveDown', 'Move down')} title={t('moveDown', 'Move down')}>
                  <i className="fas fa-chevron-down" aria-hidden="true" />
                </button>
                <button type="button" className="fv-email-template__btn fv-email-template__btn--danger" onClick={() => remove(i)} aria-label={t('delete', 'Delete')} title={t('delete', 'Delete')}>
                  <i className="fas fa-trash" aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function EmailDistributionPanel() {
  const [lists, setLists] = useState<EmailDistributionList[]>(() => loadEmailDistributionLists());
  const [editing, setEditing] = useState<EmailDistributionList | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => { saveEmailDistributionLists(lists); }, [lists]);

  const startNew = () => setEditing({ id: '', name: '', recipients: [{ company: '', email: '' }] });
  const startEdit = (list: EmailDistributionList) => setEditing({ ...list, recipients: list.recipients.map((recipient) => ({ ...recipient })) });
  const save = () => {
    if (!editing) return;
    const name = editing.name.trim();
    const recipients = editing.recipients.map((recipient) => ({ company: recipient.company.trim(), email: recipient.email.trim() })).filter((recipient) => recipient.company || recipient.email);
    if (!name || recipients.length === 0 || recipients.some((recipient) => !recipient.company || !recipient.email)) return;
    const next = { ...editing, id: editing.id || newDistributionListId(), name, recipients };
    setLists((current) => editing.id ? current.map((item) => item.id === editing.id ? next : item) : [next, ...current]);
    setEditing(null);
  };
  const remove = (id: string) => {
    if (window.confirm('Delete this distribution list?')) setLists((current) => current.filter((item) => item.id !== id));
  };

  return (
    <div className="fv-email-templates">
      <div className="fv-email-templates__bar">
        <span className="fv-settings-panel__hint">Create reusable company email groups for email generation.</span>
        <button type="button" className="fv-email-templates__new" onClick={startNew}><i className="fas fa-plus" aria-hidden="true" /> New Distribution List</button>
      </div>
      {editing && (
        <div className="fv-email-template__editor">
          <label className="fv-email-template__field"><span>Distribution List Name</span><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Voyage Operations" /></label>
          <div className="fv-email-template__field"><span>Companies and Email Addresses</span>
            {editing.recipients.map((recipient, index) => (
              <div key={index} className="fv-email-template__recipient-row">
                <input value={recipient.company} onChange={(e) => setEditing({ ...editing, recipients: editing.recipients.map((value, i) => i === index ? { ...value, company: e.target.value } : value) })} placeholder="Company name" />
                <input type="email" value={recipient.email} onChange={(e) => setEditing({ ...editing, recipients: editing.recipients.map((value, i) => i === index ? { ...value, email: e.target.value } : value) })} placeholder="name@company.com" />
                <button type="button" className="fv-email-template__attach-rm" onClick={() => setEditing({ ...editing, recipients: editing.recipients.filter((_, i) => i !== index) })} aria-label="Remove company"><i className="fas fa-xmark" aria-hidden="true" /></button>
              </div>
            ))}
            <button type="button" className="fv-email-templates__btn" onClick={() => setEditing({ ...editing, recipients: [...editing.recipients, { company: '', email: '' }] })}><i className="fas fa-plus" aria-hidden="true" /> Add Company</button>
          </div>
          <div className="fv-email-template__edit-actions"><button type="button" className="fv-email-templates__btn" onClick={() => setEditing(null)}>Cancel</button><button type="button" className="fv-email-templates__btn fv-email-templates__btn--primary" onClick={save} disabled={!editing.name.trim() || editing.recipients.length === 0 || editing.recipients.some((recipient) => !recipient.company.trim() || !recipient.email.trim())}><i className="fas fa-check" aria-hidden="true" /> Save</button></div>
        </div>
      )}
      <div className="fv-email-templates__grid">
        {lists.length === 0 && <div className="fv-email-templates__empty">No distribution lists yet.</div>}
        {lists.map((list) => (
          <article key={list.id} className="fv-email-template__card">
            <div className="fv-email-template__card-head"><div><h5><i className="fas fa-list" aria-hidden="true" /> {list.name}</h5><span>{list.recipients.length} compan{list.recipients.length === 1 ? 'y' : 'ies'}</span></div><div><button type="button" className="fv-email-templates__btn" onClick={() => setExpanded((current) => { const next = new Set(current); next.has(list.id) ? next.delete(list.id) : next.add(list.id); return next; })}><i className={`fas ${expanded.has(list.id) ? 'fa-chevron-up' : 'fa-chevron-down'}`} aria-hidden="true" /> {expanded.has(list.id) ? 'Hide' : 'View'}</button><button type="button" className="fv-email-templates__btn" onClick={() => startEdit(list)}><i className="fas fa-pen" aria-hidden="true" /> Edit</button><button type="button" className="fv-email-template__attach-rm" onClick={() => remove(list.id)} aria-label="Delete distribution list"><i className="fas fa-trash" aria-hidden="true" /></button></div></div>
            {expanded.has(list.id) && <ul className="fv-email-template__attachments">{list.recipients.map((recipient) => <li key={`${recipient.company}-${recipient.email}`}><i className="fas fa-building" aria-hidden="true" /> <b>{recipient.company}</b> · {recipient.email}</li>)}</ul>}
          </article>
        ))}
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
  const [category, setCategory] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [subSubCategory, setSubSubCategory] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // `editing` holds the template currently in the editor (id === '' for a new one).
  const [editing, setEditing] = useState<EmailTemplate | null>(null);

  // Persist every change so edits survive across sessions.
  useEffect(() => {
    saveEmailTemplates(templates);
  }, [templates]);

  const q = query.trim().toLowerCase();
  const categories = Array.from(new Set(templates.map((tpl) => tpl.category).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const subCategories = Array.from(new Set(templates.filter((tpl) => !category || tpl.category === category).map((tpl) => tpl.subCategory ?? '').filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const subSubCategories = Array.from(new Set(templates.filter((tpl) => (!category || tpl.category === category) && (!subCategory || (tpl.subCategory ?? '') === subCategory)).map((tpl) => tpl.subSubCategory ?? '').filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const filtered = templates.filter((tpl) => {
    if (category && tpl.category !== category) return false;
    if (subCategory && (tpl.subCategory ?? '') !== subCategory) return false;
    if (subSubCategory && (tpl.subSubCategory ?? '') !== subSubCategory) return false;
    return !q || tpl.title.toLowerCase().includes(q) || tpl.body.toLowerCase().includes(q) || tpl.category.toLowerCase().includes(q) || (tpl.subCategory ?? '').toLowerCase().includes(q) || (tpl.subSubCategory ?? '').toLowerCase().includes(q);
  });

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
      category: EMAIL_MAIN_CATEGORIES[0],
      subCategory: '',
      subSubCategory: '',
      to: [],
      cc: [],
      attachments: [],
      title: '',
      body: '',
    });

  const startEdit = (tpl: EmailTemplate) => setEditing({ ...tpl, body: ensureHtml(tpl.body) });

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
    const category = editing.category.trim() || EMAIL_MAIN_CATEGORIES[0];
    const subCategory = (editing.subCategory ?? '').trim();
    const subSubCategory = (editing.subSubCategory ?? '').trim();
    const to = editing.to ?? [];
    const cc = editing.cc ?? [];
    const attachments = editing.attachments ?? [];
    setTemplates((prev) => {
      if (editing.id) {
        return prev.map((x) =>
          x.id === editing.id
            ? { ...editing, title, body, category, subCategory, subSubCategory, to, cc, attachments }
            : x,
        );
      }
      return [
        { id: newTemplateId(), title, body, category, subCategory, subSubCategory, to, cc, attachments },
        ...prev,
      ];
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
      <div className="fv-email-templates__category-row" aria-label="Filter templates by category">
        <label><span>Main Category</span><select value={category} onChange={(e) => { setCategory(e.target.value); setSubCategory(''); setSubSubCategory(''); }}><option value="">All categories</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label><span>Sub Category</span><select value={subCategory} onChange={(e) => { setSubCategory(e.target.value); setSubSubCategory(''); }} disabled={!category && subCategories.length === 0}><option value="">All sub categories</option>{subCategories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label><span>Sub-Sub Category</span><select value={subSubCategory} onChange={(e) => setSubSubCategory(e.target.value)} disabled={!subCategory && subSubCategories.length === 0}><option value="">All sub-sub categories</option>{subSubCategories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      </div>
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
                    <span className="fv-email-template__cat">
                      {[tpl.category, tpl.subCategory, tpl.subSubCategory]
                        .filter((x) => x && x.trim())
                        .join(' › ')}
                      {tpl.to && tpl.to.length > 0 ? ` · To: ${tpl.to.join(', ')}` : ''}
                    </span>
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
                <p className="fv-email-template__body">{htmlToPlain(tpl.body)}</p>
              </article>
            ),
          )
        )}
      </div>
    </div>
  );
}

/** Multi-select checkbox dropdown for To / CC recipient types. The panel stays
 * open so several types can be ticked at once; selections show as removable chips. */
function RecipientTypePicker({
  t,
  label,
  groups,
  selected,
  onChange,
}: {
  t: (key: string, fallback: string) => string;
  label: string;
  groups: RecipientTypeGroup[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggle = (type: string) =>
    onChange(selected.includes(type) ? selected.filter((x) => x !== type) : [...selected, type]);

  return (
    <div className="fv-email-template__field">
      <span>{label}</span>
      <div className="fv-recip-select" ref={ref}>
        <button
          type="button"
          className="fv-recip-select__btn"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span
            className={`fv-recip-select__value${
              selected.length ? '' : ' fv-recip-select__value--ph'
            }`}
          >
            {selected.length
              ? `${selected.length} ${t('selected', 'selected')}`
              : t('selectTypes', 'Select types…')}
          </span>
          <i className="fas fa-chevron-down" aria-hidden="true" />
        </button>
        {open && (
          <div className="fv-recip-select__panel">
            {groups.map((g) => (
              <div key={g.group} className="fv-recip-select__group">
                <div className="fv-recip-select__group-label">{g.group}</div>
                {g.types.map((ty) => (
                  <label key={ty} className="fv-recip-select__opt">
                    <span>{ty}</span>
                    <input
                      type="checkbox"
                      checked={selected.includes(ty)}
                      onChange={() => toggle(ty)}
                    />
                  </label>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      {selected.length > 0 && (
        <ul className="fv-email-template__chips">
          {selected.map((ty) => (
            <li key={ty}>
              <span>{ty}</span>
              <button
                type="button"
                aria-label={t('remove', 'Remove')}
                title={t('remove', 'Remove')}
                onClick={() => toggle(ty)}
              >
                <i className="fas fa-xmark" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
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
  // Options sourced live from the directory so new accounts / service providers appear automatically.
  const typeGroups = useMemo(() => getRecipientTypeOptions(), []);
  const [customMain, setCustomMain] = useState(() => !EMAIL_MAIN_CATEGORIES.some((category) => category === value.category));
  const [customSub, setCustomSub] = useState(() => Boolean(value.subCategory && !EMAIL_SUB_CATEGORIES.includes(value.subCategory)));
  const [customSubSub, setCustomSubSub] = useState(() => Boolean(value.subSubCategory && !EMAIL_SUB_SUB_CATEGORIES.includes(value.subSubCategory)));
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
          <span>{t('templateTitle', 'Title (used as the subject)')}</span>
          <input
            type="text"
            value={value.title}
            autoFocus
            onChange={(e) => onChange({ ...value, title: e.target.value })}
          />
        </label>
      </div>
      <div className="fv-email-template__cols">
        <div className="fv-email-template__col-recipients">
          <RecipientTypePicker
            t={t}
            label={t('toTypes', 'To (recipient types)')}
            groups={typeGroups}
            selected={value.to ?? []}
            onChange={(next) => onChange({ ...value, to: next })}
          />
          <RecipientTypePicker
            t={t}
            label={t('ccTypes', 'CC (recipient types)')}
            groups={typeGroups}
            selected={value.cc ?? []}
            onChange={(next) => onChange({ ...value, cc: next })}
          />
        </div>
        <div className="fv-email-template__col-cats">
          <label className="fv-email-template__field">
            <span>{t('mainCategory', 'Main Category')}</span>
            <select
              value={customMain ? '__custom__' : value.category}
              onChange={(e) => {
                const isCustom = e.target.value === '__custom__';
                setCustomMain(isCustom);
                onChange({ ...value, category: isCustom ? '' : e.target.value });
              }}
            >
              {EMAIL_MAIN_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value="__custom__">Add new category…</option>
            </select>
            {customMain && <input type="text" value={value.category} placeholder="Enter new main category" onChange={(e) => onChange({ ...value, category: e.target.value })} />}
          </label>
          <label className="fv-email-template__field">
            <span>{t('subCategory', 'Sub Category')}</span>
            <select
              value={customSub ? '__custom__' : value.subCategory ?? ''}
              onChange={(e) => {
                const isCustom = e.target.value === '__custom__';
                setCustomSub(isCustom);
                onChange({ ...value, subCategory: isCustom ? '' : e.target.value });
              }}
            >
              <option value="">{t('none', 'None')}</option>
              {EMAIL_SUB_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value="__custom__">Add new sub-category…</option>
            </select>
            {customSub && <input type="text" value={value.subCategory ?? ''} placeholder="Enter new sub-category" onChange={(e) => onChange({ ...value, subCategory: e.target.value })} />}
          </label>
          <label className="fv-email-template__field">
            <span>{t('subSubCategory', 'Sub-Sub Category')}</span>
            <select
              value={customSubSub ? '__custom__' : value.subSubCategory ?? ''}
              onChange={(e) => {
                const isCustom = e.target.value === '__custom__';
                setCustomSubSub(isCustom);
                onChange({ ...value, subSubCategory: isCustom ? '' : e.target.value });
              }}
            >
              <option value="">{t('none', 'None')}</option>
              {EMAIL_SUB_SUB_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value="__custom__">Add new sub-sub-category…</option>
            </select>
            {customSubSub && <input type="text" value={value.subSubCategory ?? ''} placeholder="Enter new sub-sub-category" onChange={(e) => onChange({ ...value, subSubCategory: e.target.value })} />}
          </label>
        </div>
      </div>
      <div className="fv-email-template__attach">
        <div className="fv-email-template__attach-head">
          <span className="fv-email-template__tokens-label">
            <i className="fas fa-paperclip" aria-hidden="true" /> {t('templateAttachments', 'Attachments — sent with emails generated from this template')}
          </span>
          <label className="fv-email-template__btn fv-email-template__attach-add">
            <i className="fas fa-plus" aria-hidden="true" /> {t('addFiles', 'Add files')}
            <input
              type="file"
              multiple
              hidden
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length === 0) return;
                Promise.all(
                  files.map(
                    (f) =>
                      new Promise<EmailAttachment>((resolve) => {
                        const reader = new FileReader();
                        reader.onload = () =>
                          resolve({ name: f.name, type: f.type, dataUrl: String(reader.result) });
                        reader.readAsDataURL(f);
                      }),
                  ),
                ).then((added) => {
                  onChange({ ...value, attachments: [...(value.attachments ?? []), ...added] });
                });
                e.target.value = '';
              }}
            />
          </label>
        </div>
        {(value.attachments ?? []).length > 0 && (
          <ul className="fv-email-template__attach-list">
            {(value.attachments ?? []).map((a, i) => (
              <li key={`${a.name}-${i}`}>
                <i className="fas fa-file" aria-hidden="true" />
                <span>{a.name}</span>
                <button
                  type="button"
                  className="fv-email-template__attach-rm"
                  aria-label={t('remove', 'Remove')}
                  title={t('remove', 'Remove')}
                  onClick={() =>
                    onChange({ ...value, attachments: (value.attachments ?? []).filter((_, j) => j !== i) })
                  }
                >
                  <i className="fas fa-xmark" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <label className="fv-email-template__field">
        <span>{t('templateBody', 'Body')}</span>
      </label>
      <RichTextEditor
        value={value.body}
        onChange={(html) => onChange({ ...value, body: html })}
        tokens={EMAIL_TOKENS}
        placeholder={t('composeBody', 'Compose the email body…')}
        renderPreview={(html) => applyVoyageTokens(ensureHtml(html), SAMPLE_VOYAGE)}
      />
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
    `Type: ${c.category}`,
    `Location: ${c.location}`,
    `Contact: ${c.contactName}`,
    `Email: ${c.email}`,
    `Phone: ${c.phone}`,
    `Username: ${c.username}`,
    `Role: ${c.role}`,
    `ODAS PIC: ${c.pic || 'Unassigned'}`,
    `Status: ${c.active ? 'Active' : 'Inactive'}`,
  ].join('\n');
}

function ClientsPanel({ kind }: { kind: Client['kind'] }) {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const isService = kind === 'Service Provider';
  const noun = isService ? t('serviceProvider', 'service provider') : t('account', 'account');
  const NounCap = isService ? t('ServiceProvider', 'Service provider') : t('Account', 'Account');
  const categoryLabel = isService ? t('providerType', 'Provider type') : t('accountType', 'Account type');
  const typeOptions = isService ? SERVICE_PROVIDER_TYPES : ACCOUNT_TYPES;

  const [clients, setClients] = useState<Client[]>(() => loadClients());
  const [query, setQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revealId, setRevealId] = useState<string | null>(null);
  // `editing` holds the record currently in the editor (id === '' for a new one).
  const [editing, setEditing] = useState<Client | null>(null);

  useEffect(() => {
    saveClients(clients);
  }, [clients]);

  const ofKind = clients.filter((c) => (c.kind ?? 'Account') === kind);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? ofKind.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.location.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.contactName.toLowerCase().includes(q) ||
          c.username.toLowerCase().includes(q) ||
          c.role.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q) ||
          c.pic.toLowerCase().includes(q),
      )
    : ofKind;

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
      kind,
      category: typeOptions[0],
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
      bankAccount: { verified: false, details: '', bankName: '', accountHolder: '', accountNumber: '', swift: '', iban: '' },
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
    if (!window.confirm(t('confirmDeleteAccount', `Delete this ${noun}?`))) return;
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
      kind,
      category: editing.category.trim() || typeOptions[0],
      name,
      email,
      location: editing.location.trim(),
      contactName: editing.contactName.trim(),
      phone: editing.phone.trim(),
      username: editing.username.trim(),
      role: editing.role.trim() || CLIENT_ROLES[0],
      pic: editing.pic,
      bankAccount: editing.bankAccount ?? { verified: false, details: '', bankName: '', accountHolder: '', accountNumber: '', swift: '', iban: '' },
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
          'confirmRestoreAccounts',
          `Restore the built-in ${noun}s? Your custom changes will be lost.`,
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
            placeholder={t('searchAccounts', `Search ${noun}s…`)}
            aria-label={t('searchAccounts', `Search ${noun}s…`)}
          />
        </div>
        <button type="button" className="fv-email-templates__new" onClick={startNew}>
          <i className="fas fa-plus" aria-hidden="true" /> {t('newAccount', `New ${noun}`)}
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
          nounCap={NounCap}
          categoryLabel={categoryLabel}
          typeOptions={typeOptions}
        />
      )}

      <div className="fv-email-templates__list">
        {filtered.length === 0 ? (
          <p className="fv-email-templates__empty">
            {t('noAccountsMatch', `No ${noun}s match your search.`)}
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
                nounCap={NounCap}
                categoryLabel={categoryLabel}
                typeOptions={typeOptions}
              />
            ) : (
              <article key={c.id} className="fv-client-card">
                <header className="fv-email-template__head">
                  <div className="fv-email-template__titles">
                    <span className="fv-email-template__cat">{c.category || c.role}</span>
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
                    <dt>{isService ? t('providerType', 'Provider type') : t('accountType', 'Account type')}</dt>
                    <dd>{c.category || '—'}</dd>
                  </div>
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
                    <dt>{t('clientPic', 'ODAS PIC')}</dt>
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
  nounCap,
  categoryLabel,
  typeOptions,
}: {
  t: (key: string, fallback: string) => string;
  value: Client;
  onChange: (client: Client) => void;
  onSave: () => void;
  onCancel: () => void;
  nounCap: string;
  categoryLabel: string;
  typeOptions: readonly string[];
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
          <span>{t('accountName', `${nounCap} name`)}</span>
          <input
            type="text"
            value={value.name}
            autoFocus
            onChange={(e) => onChange({ ...value, name: e.target.value })}
          />
        </label>
        <label className="fv-email-template__field fv-email-template__field--cat">
          <span>{categoryLabel}</span>
          <select
            value={value.category}
            onChange={(e) => onChange({ ...value, category: e.target.value })}
          >
            {typeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="fv-email-template__field-row">
        <label className="fv-email-template__field">
          <span>{t('clientLocation', 'Location')}</span>
          <input
            type="text"
            value={value.location}
            onChange={(e) => onChange({ ...value, location: e.target.value })}
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
          <span>{t('clientEmail', 'Email')}</span>
          <input
            type="email"
            value={value.email}
            onChange={(e) => onChange({ ...value, email: e.target.value })}
          />
        </label>
      </div>

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
          <span>{t('clientPic', 'ODAS PIC (assigned to)')}</span>
          <select
            value={value.pic}
            onChange={(e) => onChange({ ...value, pic: e.target.value })}
          >
            <option value="">{t('unassigned', 'Unassigned')}</option>
            {ODAS_PICS.map((p) => (
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

      <div className="fv-settings-wf__group">
        <div className="fv-settings-wf__group-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span><i className="fas fa-university" aria-hidden="true" /> Bank Account Details</span>
          <label className="fv-settings-wf__verify-inline">
            <span>Verified</span>
            <input
              type="checkbox"
              checked={Boolean(value.bankAccount?.verified)}
              onChange={(e) => onChange({
                ...value,
                bankAccount: { ...(value.bankAccount ?? { verified: false, details: '', bankName: '', accountHolder: '', accountNumber: '', swift: '', iban: '' }), verified: e.target.checked },
              })}
            />
          </label>
        </div>
        <div className="fv-settings-wf__fields">
          <div className="fv-settings-wf__field-row">
            <label className="fv-settings-wf__field">
              <span className="fv-settings-wf__field-label">Account Details</span>
              <textarea
                className="fv-settings-wf__textarea"
                rows={5}
                placeholder={'Paste full bank details here\nBank Name:\nAccount Name:\nAccount Number:\nSWIFT:\nIBAN:'}
                value={value.bankAccount?.details ?? ''}
                onChange={(e) => onChange({
                  ...value,
                  bankAccount: { ...(value.bankAccount ?? { verified: false, details: '', bankName: '', accountHolder: '', accountNumber: '', swift: '', iban: '' }), details: e.target.value },
                })}
              />
              <span className="fv-settings-wf__field-hint">Only verified account details are used in PDFs and payment handover to Accounts.</span>
            </label>
          </div>
        </div>
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

function WorkflowConfigPanel() {
  const cfg = useWorkflowConfig();
  const logoInputRef = useRef<HTMLInputElement>(null);

  const pickLogo = () => logoInputRef.current?.click();
  const onLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setWorkflowConfig({ companyLogoDataUrl: reader.result as string });
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="fv-settings-wf">
      <p className="fv-settings-wf__intro">
        Configure company identity and module interaction based on your department structure.
      </p>

      {/* Company Identity */}
      <div className="fv-settings-wf__group">
        <div className="fv-settings-wf__group-title"><i className="fas fa-building" aria-hidden="true" /> Company Identity</div>
        <div className="fv-settings-wf__fields">

          <div className="fv-settings-wf__field-row">
            <label className="fv-settings-wf__field">
              <span className="fv-settings-wf__field-label">Company Name</span>
              <input
                className="fv-settings-wf__input"
                value={cfg.companyName}
                placeholder="e.g. Oceanic Freight Pte. Ltd."
                onChange={(e) => setWorkflowConfig({ companyName: e.target.value })}
              />
              <span className="fv-settings-wf__field-hint">Printed on invoices, hire SOA, freight &amp; laytime documents.</span>
            </label>
          </div>

          <div className="fv-settings-wf__field-row">
            <label className="fv-settings-wf__field">
              <span className="fv-settings-wf__field-label">Company Address</span>
              <textarea
                className="fv-settings-wf__textarea"
                value={cfg.companyAddress}
                placeholder={"e.g. 1 Maritime Square, #10-01\nHarbourFront Centre\nSingapore 099253"}
                rows={4}
                onChange={(e) => setWorkflowConfig({ companyAddress: e.target.value })}
              />
              <span className="fv-settings-wf__field-hint">Full address block — appears on document headers.</span>
            </label>
          </div>

          <div className="fv-settings-wf__field-row">
            <div className="fv-settings-wf__field">
              <span className="fv-settings-wf__field-label">Company Logo</span>
              <div className="fv-settings-wf__logo-area">
                {cfg.companyLogoDataUrl ? (
                  <div className="fv-settings-wf__logo-preview-wrap">
                    <img src={cfg.companyLogoDataUrl} alt="Company logo" className="fv-settings-wf__logo-preview" />
                    <div className="fv-settings-wf__logo-actions">
                      <button type="button" className="fv-settings-wf__logo-btn" onClick={pickLogo}>
                        <i className="fas fa-arrow-up-from-bracket" aria-hidden="true" /> Replace
                      </button>
                      <button type="button" className="fv-settings-wf__logo-btn fv-settings-wf__logo-btn--danger" onClick={() => setWorkflowConfig({ companyLogoDataUrl: '' })}>
                        <i className="fas fa-trash" aria-hidden="true" /> Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="fv-settings-wf__logo-upload" onClick={pickLogo}>
                    <i className="fas fa-image" aria-hidden="true" />
                    <span>Upload logo</span>
                    <small>PNG, JPG or SVG · recommended 300 × 80 px</small>
                  </button>
                )}
                <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onLogoFile} />
              </div>
              <span className="fv-settings-wf__field-hint">Shown in the top-left of printed documents.</span>
            </div>
          </div>

        </div>
      </div>

      <div className="fv-settings-wf__group">
        <div className="fv-settings-wf__group-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span><i className="fas fa-university" aria-hidden="true" /> Company Bank Account</span>
          <label className="fv-settings-wf__verify-inline">
            <span>Verified</span>
            <input
              type="checkbox"
              checked={Boolean(cfg.companyBankAccount.verified)}
              onChange={(e) => setWorkflowConfig({
                companyBankAccount: { ...cfg.companyBankAccount, verified: e.target.checked },
              })}
            />
          </label>
        </div>
        <div className="fv-settings-wf__fields">
          <p className="fv-settings-wf__intro">
            Bank details used when your company is receiving payments on invoices.
          </p>
          <div className="fv-settings-wf__field-row">
            <label className="fv-settings-wf__field">
              <span className="fv-settings-wf__field-label">Account Details</span>
              <textarea
                className="fv-settings-wf__textarea"
                rows={6}
                placeholder={'Paste full bank details here\nBeneficiary:\nBank Name:\nAccount Number:\nSWIFT:\nIBAN:'}
                value={cfg.companyBankAccount.details ?? ''}
                onChange={(e) => setWorkflowConfig({
                  companyBankAccount: { ...cfg.companyBankAccount, details: e.target.value },
                })}
              />
              <span className="fv-settings-wf__field-hint">Only verified account details are used in PDFs and payment handover to Accounts.</span>
            </label>
          </div>
        </div>
      </div>

      {/* Postfix workflow */}
      <div className="fv-settings-wf__group">
        <div className="fv-settings-wf__group-title"><i className="fas fa-file-signature" aria-hidden="true" /> Postfix Department</div>
        <label className="fv-settings-wf__row">
          <div className="fv-settings-wf__row-text">
            <span className="fv-settings-wf__row-label">Always show Operations voyages in Postfix</span>
            <span className="fv-settings-wf__row-desc">
              <b>ON</b> — every voyage in Operations automatically appears in the Postfix fleet list.
              Use this when your Operations team handles freight settlement (no separate Postfix dept).
              &nbsp;<b>OFF</b> — a voyage appears in Postfix only after Operations clicks <em>Copy to Postfix</em> on the
              Freight Invoices or Laytime Calculations card. Use this when you have a dedicated post-fixture settlement team.
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={cfg.postfixAlwaysShowOpsVoyages}
            className={`fv-settings-wf__toggle${cfg.postfixAlwaysShowOpsVoyages ? ' fv-settings-wf__toggle--on' : ''}`}
            onClick={() => setWorkflowConfig({ postfixAlwaysShowOpsVoyages: !cfg.postfixAlwaysShowOpsVoyages })}
          >
            <span className="fv-settings-wf__toggle-knob" />
            <span className="fv-settings-wf__toggle-label">{cfg.postfixAlwaysShowOpsVoyages ? 'ON' : 'OFF'}</span>
          </button>
        </label>
      </div>
    </div>
  );
}

function SavedPassagesPanel() {
  const [passages, setPassages] = useState<SavedPassage[]>(() => loadSavedPassages());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const importRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void importRoutes();
  }, []);

  const importRoutes = async () => {
    setLoading(true);
    const bundled = await loadBundledSavedPassages();
    const before = passages.length;
    const next = mergeSavedPassages(bundled);
    setPassages(next);
    setMessage(`${bundled.length} source routes checked; ${Math.max(0, next.length - before)} new passages added.`);
    setLoading(false);
  };

  const mergeImportedPassages = (incoming: SavedPassage[]) => {
    const current = loadSavedPassages();
    const idSet = new Set(current.map((passage) => passage.id));
    const geomSet = new Set(
      current.map((passage) => passage.points.map((p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`).join(';')),
    );
    const accepted = incoming.filter((passage) => {
      if (!passage.points || passage.points.length < 2) return false;
      const geom = passage.points.map((p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`).join(';');
      if (idSet.has(passage.id) || geomSet.has(geom)) return false;
      idSet.add(passage.id);
      geomSet.add(geom);
      return true;
    });
    const next = [...current, ...accepted];
    saveSavedPassages(next);
    setPassages(next);
    setMessage(`${incoming.length} route files parsed; ${accepted.length} new passages imported.`);
  };

  const slug = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'route';

  const parseKmlPassage = (name: string, text: string): SavedPassage[] => {
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'application/xml');
    const coordEls = Array.from(xml.getElementsByTagNameNS('*', 'coordinates'));
    const placemarkName = xml.getElementsByTagNameNS('*', 'name')?.[0]?.textContent?.trim();
    const points: [number, number][] = [];
    coordEls.forEach((el) => {
      const tokens = (el.textContent || '').trim().split(/\s+/);
      tokens.forEach((token) => {
        const [lonRaw, latRaw] = token.split(',');
        const lon = Number(lonRaw);
        const lat = Number(latRaw);
        if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
          points.push([lat, lon]);
        }
      });
    });
    if (points.length < 2) return [];
    const routeName = placemarkName || name.replace(/\.[^.]+$/, '');
    return [{ id: `imp-${slug(routeName)}-${points.length}`, name: routeName, source: name, points }];
  };

  const parseWayfinderCsvPassage = (name: string, text: string): SavedPassage[] => {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const points: [number, number][] = [];
    for (const line of lines) {
      if (!/^\d+,/.test(line)) continue;
      const cols = line.split(',');
      if (cols.length < 7) continue;
      const latD = Number(cols[1]);
      const latM = Number(cols[2]);
      const latH = (cols[3] || '').toUpperCase();
      const lonD = Number(cols[4]);
      const lonM = Number(cols[5]);
      const lonH = (cols[6] || '').toUpperCase();
      if (![latD, latM, lonD, lonM].every(Number.isFinite)) continue;
      let lat = Math.abs(latD) + Math.abs(latM) / 60;
      let lon = Math.abs(lonD) + Math.abs(lonM) / 60;
      if (latH === 'S') lat *= -1;
      if (lonH === 'W') lon *= -1;
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) points.push([lat, lon]);
    }
    if (points.length < 2) return [];
    const routeName = name.replace(/\.[^.]+$/, '');
    return [{ id: `imp-${slug(routeName)}-${points.length}`, name: routeName, source: name, points }];
  };

  const parseTableRowsPassages = (
    name: string,
    rows: Array<Record<string, unknown>>,
  ): SavedPassage[] => {
    if (!rows.length) return [];
    const sample = rows.find((row) => Object.keys(row).length > 0) ?? rows[0];
    const keys = Object.keys(sample);
    const latKey = keys.find((k) => /^lat/i.test(k));
    const lonKey = keys.find((k) => /^(lon|lng|long)/i.test(k));
    if (!latKey || !lonKey) return [];
    const routeKey = keys.find((k) => /(route|passage|name|track)/i.test(k));

    const grouped = new Map<string, [number, number][]>();
    rows.forEach((row) => {
      const lat = parseCoordinate(String(row[latKey] ?? ''), 'lat');
      const lon = parseCoordinate(String(row[lonKey] ?? ''), 'lon');
      if (lat == null || lon == null) return;
      const routeName = String(
        (routeKey ? row[routeKey] : '') || name.replace(/\.[^.]+$/, ''),
      ).trim();
      if (!grouped.has(routeName)) grouped.set(routeName, []);
      grouped.get(routeName)!.push([lat, lon]);
    });

    return Array.from(grouped.entries())
      .filter(([, pts]) => pts.length >= 2)
      .map(([routeName, points]) => ({
        id: `imp-${slug(routeName)}-${points.length}`,
        name: routeName,
        source: name,
        points,
      }));
  };

  const parseGenericCsvPassage = (name: string, text: string): SavedPassage[] => {
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map((h) => h.trim());
    const rows = lines.slice(1).map((line) => {
      const cells = line.split(',');
      const row: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        row[h] = (cells[i] ?? '').trim();
      });
      return row;
    });
    return parseTableRowsPassages(name, rows);
  };

  const parseExcelPassages = (name: string, bytes: ArrayBuffer): SavedPassage[] => {
    try {
      const wb = XLSX.read(bytes, { type: 'array' });
      const passages: SavedPassage[] = [];
      wb.SheetNames.forEach((sheetName) => {
        const sheet = wb.Sheets[sheetName];
        if (!sheet) return;
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
        passages.push(...parseTableRowsPassages(`${name}:${sheetName}`, rows));
      });
      return passages;
    } catch {
      return [];
    }
  };

  const parseRtzPassages = (name: string, text: string): SavedPassage[] => {
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'application/xml');
    const wpNodes = Array.from(xml.getElementsByTagNameNS('*', 'waypoint'));
    const points: [number, number][] = [];
    wpNodes.forEach((node) => {
      const latAttr = node.getAttribute('lat') || node.getAttribute('latitude');
      const lonAttr = node.getAttribute('lon') || node.getAttribute('longitude');
      const pos = node.getElementsByTagNameNS('*', 'position')?.[0];
      const latPos = pos?.getAttribute('lat') || pos?.getAttribute('latitude');
      const lonPos = pos?.getAttribute('lon') || pos?.getAttribute('longitude');
      const lat = parseCoordinate(String(latAttr || latPos || ''), 'lat');
      const lon = parseCoordinate(String(lonAttr || lonPos || ''), 'lon');
      if (lat != null && lon != null) points.push([lat, lon]);
    });
    if (points.length < 2) return [];
    const routeName =
      xml.getElementsByTagNameNS('*', 'route')?.[0]?.getAttribute('name') ||
      name.replace(/\.[^.]+$/, '');
    return [
      {
        id: `imp-${slug(routeName)}-${points.length}`,
        name: routeName,
        source: name,
        points,
      },
    ];
  };

  const parseJsonPassages = (name: string, text: string): SavedPassage[] => {
    try {
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      return list
        .map((item, idx) => {
          const pts = Array.isArray(item?.points)
            ? item.points
                .map((p: unknown) => {
                  const pair = p as [number, number];
                  return Array.isArray(pair) && Number.isFinite(pair[0]) && Number.isFinite(pair[1])
                    ? [Number(pair[0]), Number(pair[1])] as [number, number]
                    : null;
                })
                .filter(Boolean) as [number, number][]
            : [];
          if (pts.length < 2) return null;
          const routeName = String(item?.name || `${name.replace(/\.[^.]+$/, '')} ${idx + 1}`);
          return {
            id: String(item?.id || `imp-${slug(routeName)}-${pts.length}`),
            name: routeName,
            source: String(item?.source || name),
            points: pts,
          } as SavedPassage;
        })
        .filter((x): x is SavedPassage => !!x);
    } catch {
      return [];
    }
  };

  const onImportFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const all: SavedPassage[] = [];
    for (const file of files) {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.kml')) {
        const text = await file.text();
        all.push(...parseKmlPassage(file.name, text));
      } else if (lower.endsWith('.csv')) {
        const text = await file.text();
        const parsed = parseWayfinderCsvPassage(file.name, text);
        all.push(...(parsed.length ? parsed : parseGenericCsvPassage(file.name, text)));
      } else if (lower.endsWith('.xls') || lower.endsWith('.xlsx')) {
        all.push(...parseExcelPassages(file.name, await file.arrayBuffer()));
      } else if (lower.endsWith('.rtz')) {
        const text = await file.text();
        all.push(...parseRtzPassages(file.name, text));
      } else if (lower.endsWith('.json')) {
        const text = await file.text();
        all.push(...parseJsonPassages(file.name, text));
      }
    }
    mergeImportedPassages(all);
    e.target.value = '';
  };

  const deletePassage = (id: string) => {
    const next = passages.filter((passage) => passage.id !== id);
    saveSavedPassages(next);
    setPassages(next);
  };

  const filteredPassages = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return passages;
    return passages.filter((passage) =>
      `${passage.name} ${passage.source || ''}`.toLowerCase().includes(q),
    );
  }, [passages, query]);

  return (
    <div className="fv-saved-passages">
      <div className="fv-saved-passages__toolbar">
        <div className="fv-saved-passages__summary">
          <strong>Saved passage routes</strong>
          <span>{passages.length} routes available</span>
        </div>
        <div className="fv-saved-passages__actions">
          <button type="button" className="fv-email-template__btn" onClick={() => importRef.current?.click()}>
            <i className="fas fa-folder-open" aria-hidden="true" /> Import route files
          </button>
          <button type="button" className="fv-email-template__btn fv-email-template__btn--primary" onClick={importRoutes} disabled={loading}>
            <i className="fas fa-file-import" aria-hidden="true" /> {loading ? 'Importing...' : 'Import source routes'}
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".kml,.csv,.json,.rtz,.xls,.xlsx"
            multiple
            hidden
            onChange={onImportFiles}
          />
        </div>
      </div>
      <label className="fv-saved-passages__search">
        <i className="fas fa-magnifying-glass" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search route name or source file"
        />
      </label>
      {message && <p className="fv-saved-passages__message">{message}</p>}
      <div className="fv-saved-passages__list" role="list" aria-label="Saved passages">
        {filteredPassages.map((passage) => (
          <div className="fv-saved-passages__row" key={passage.id} role="listitem">
            <div className="fv-saved-passages__route">
              <strong>{passage.name}</strong>
              <small>{passage.source || 'Saved passage'} · {passage.points.length} waypoints</small>
            </div>
            <button
              type="button"
              className="fv-saved-passages__delete"
              title="Delete saved passage"
              aria-label={`Delete ${passage.name}`}
              onClick={() => deletePassage(passage.id)}
            >
              <i className="fas fa-trash" aria-hidden="true" />
            </button>
          </div>
        ))}
        {!filteredPassages.length && <p className="fv-saved-passages__empty">No saved passages match your search or import criteria.</p>}
      </div>
    </div>
  );
}