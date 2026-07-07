import { useEffect, useMemo, useState } from 'react';

import { useL } from '../i18n/LocalizationProvider';
import {
  VESSEL_FIELDS,
  VESSEL_GROUPS,
  diffVessel,
  loadVessels,
  makeBlankVessel,
  newVesselId,
  resetVessels,
  saveVessels,
  type Vessel,
  type VesselChange,
  type VesselFieldKey,
  type VesselGroup,
} from '../data/vessels';
import {
  hitToVessel,
  loadImoDatabase,
  searchImoDatabase,
  type ImoSearchHit,
} from '../data/imoShipDatabase';

/**
 * Settings → Vessels Details panel.
 *
 * Lists the fleet's vessels with the IMO ship-search particulars (identity,
 * type, builder, dimensions, engine, commercial), lets the operator add /
 * edit / delete them, and keeps a per-vessel change history opened from the
 * "History" button on each card.
 */
export function VesselsPanel() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const [vessels, setVessels] = useState<Vessel[]>(() => loadVessels());
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Vessel | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);

  // "Add from IMO database" lookup state.
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupHits, setLookupHits] = useState<ImoSearchHit[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  useEffect(() => {
    saveVessels(vessels);
  }, [vessels]);

  // Debounced search against the (lazily-loaded) IMO reference database.
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
      searchImoDatabase(q)
        .then((hits) => {
          if (!cancelled) setLookupHits(hits);
        })
        .catch(() => {
          if (!cancelled) setLookupError(t('imoDbFailed', 'Could not load the IMO ship database.'));
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
    // Kick off the (large) dataset fetch up front.
    loadImoDatabase().catch(() =>
      setLookupError(t('imoDbFailed', 'Could not load the IMO ship database.')),
    );
  };

  const pickHit = (hit: ImoSearchHit) => {
    setEditing(hitToVessel(hit));
    setLookupOpen(false);
    setLookupQuery('');
    setLookupHits([]);
  };

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q
        ? vessels.filter(
            (v) =>
              v.name.toLowerCase().includes(q) ||
              v.shortName.toLowerCase().includes(q) ||
              v.imo.toLowerCase().includes(q) ||
              v.email.toLowerCase().includes(q) ||
              v.vesselType.toLowerCase().includes(q) ||
              v.flag.toLowerCase().includes(q) ||
              v.owner.toLowerCase().includes(q),
          )
        : vessels,
    [vessels, q],
  );

  const startNew = () => setEditing(makeBlankVessel());
  const startEdit = (v: Vessel) => setEditing({ ...v });

  const deleteVessel = (id: string) => {
    if (!window.confirm(t('confirmDeleteVessel', 'Delete this vessel?'))) return;
    setVessels((prev) => prev.filter((x) => x.id !== id));
    setEditing((e) => (e && e.id === id ? null : e));
    setHistoryId((h) => (h === id ? null : h));
  };

  const saveEditing = () => {
    if (!editing) return;
    const name = editing.name.trim();
    const imo = editing.imo.trim();
    if (!name || !imo) return;

    // Trim every string field.
    const cleaned: Vessel = { ...editing };
    const rec = cleaned as unknown as Record<string, unknown>;
    for (const { key } of VESSEL_FIELDS) {
      const val = cleaned[key];
      if (typeof val === 'string') rec[key] = val.trim();
    }

    setVessels((prev) => {
      if (editing.id) {
        const before = prev.find((x) => x.id === editing.id);
        const changes = before ? diffVessel(before, cleaned) : [];
        const merged: Vessel = {
          ...cleaned,
          history: [...changes, ...(before?.history ?? [])],
        };
        return prev.map((x) => (x.id === editing.id ? merged : x));
      }
      const created: Vessel = {
        ...cleaned,
        id: newVesselId(),
        history: [
          { at: new Date().toISOString(), by: '', field: t('created', 'Created'), from: '', to: name },
        ],
      };
      return [created, ...prev];
    });
    setEditing(null);
  };

  const restoreDefaults = () => {
    if (
      !window.confirm(
        t('confirmRestoreVessels', 'Restore the built-in vessels? Your custom changes will be lost.'),
      )
    )
      return;
    setVessels(resetVessels());
    setEditing(null);
    setHistoryId(null);
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
            placeholder={t('searchVessels', 'Search by name, IMO, type…')}
            aria-label={t('searchVessels', 'Search vessels')}
          />
        </div>
        <div className="fv-email-templates__bar-actions">
          <button
            type="button"
            className="fv-email-template__btn"
            onClick={restoreDefaults}
            title={t('restoreDefaults', 'Restore defaults')}
          >
            <i className="fas fa-rotate-left" aria-hidden="true" /> {t('restoreDefaults', 'Restore defaults')}
          </button>
          <button type="button" className="fv-email-template__btn" onClick={openLookup}>
            <i className="fas fa-magnifying-glass-location" aria-hidden="true" />{' '}
            {t('addFromImoDb', 'Add from IMO database')}
          </button>
          <button type="button" className="fv-email-templates__new" onClick={startNew}>
            <i className="fas fa-plus" aria-hidden="true" /> {t('newVessel', 'New vessel')}
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
                placeholder={t('imoDbSearch', 'Search IMO number or ship name…')}
              />
            </div>
            <button
              type="button"
              className="fv-email-template__btn"
              onClick={() => setLookupOpen(false)}
            >
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
                'imoDbHint',
                'Type at least 2 characters (IMO or ship name). The reference database (~63,000 ships) loads on first search.',
              )}
            </p>
          ) : lookupHits.length === 0 ? (
            <p className="fv-imo-lookup__hint">{t('imoDbNoMatch', 'No ships match.')}</p>
          ) : (
            <ul className="fv-imo-lookup__list">
              {lookupHits.map((hit, i) => (
                <li key={`${hit.imo}-${i}`}>
                  <button type="button" className="fv-imo-lookup__hit" onClick={() => pickHit(hit)}>
                    <span className="fv-imo-lookup__hit-main">
                      <span className="fv-imo-lookup__hit-name">{hit.name || '—'}</span>
                      <span className="fv-imo-lookup__hit-meta">
                        IMO {hit.imo || '—'}
                        {hit.vesselType && ` · ${hit.vesselType}`}
                        {hit.builtYear && ` · ${t('built', 'Built')} ${hit.builtYear}`}
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
        <VesselEditor
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
            ? t('noVesselsMatchSearch', 'No vessels match your search.')
            : t('noVessels', 'No vessels yet. Add one to get started.')}
        </p>
      ) : (
        filtered.map((v) =>
          editing && editing.id === v.id ? (
            <VesselEditor
              key={v.id}
              t={t}
              value={editing}
              onChange={setEditing}
              onSave={saveEditing}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <article key={v.id} className="fv-client-card">
              <header className="fv-email-template__head">
                <div className="fv-email-template__titles">
                  <span className="fv-email-template__cat">{v.vesselType || t('vessel', 'Vessel')}</span>
                  <h5 className="fv-email-template__title">
                    {v.name}
                    {v.shortName && <span className="fv-vessel-code">{v.shortName}</span>}
                    <span className="fv-client-card__status fv-client-card__status--on">
                      IMO {v.imo || '—'}
                    </span>
                  </h5>
                </div>
                <div className="fv-email-template__actions">
                  <button
                    type="button"
                    className="fv-email-template__btn"
                    onClick={() => setHistoryId((h) => (h === v.id ? null : v.id))}
                    aria-expanded={historyId === v.id}
                  >
                    <i className="fas fa-clock-rotate-left" aria-hidden="true" /> {t('history', 'History')}
                    {v.history.length > 0 && <span className="fv-vessel-hist__count">{v.history.length}</span>}
                  </button>
                  <button
                    type="button"
                    className="fv-email-template__btn"
                    onClick={() => startEdit(v)}
                    aria-label={t('edit', 'Edit')}
                    title={t('edit', 'Edit')}
                  >
                    <i className="fas fa-pen" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="fv-email-template__btn fv-email-template__btn--danger"
                    onClick={() => deleteVessel(v.id)}
                    aria-label={t('delete', 'Delete')}
                    title={t('delete', 'Delete')}
                  >
                    <i className="fas fa-trash" aria-hidden="true" />
                  </button>
                </div>
              </header>

              <dl className="fv-client-card__grid">
                <div>
                  <dt>{t('email', 'Email')}</dt>
                  <dd>{v.email || '—'}</dd>
                </div>
                <div>
                  <dt>{t('flag', 'Flag')}</dt>
                  <dd>{v.flag || '—'}</dd>
                </div>
                <div>
                  <dt>{t('gt', 'GT')}</dt>
                  <dd>{v.gt || '—'}</dd>
                </div>
                <div>
                  <dt>{t('deadweight', 'DWT')}</dt>
                  <dd>{v.deadweight || '—'}</dd>
                </div>
                <div>
                  <dt>{t('builtYear', 'Built')}</dt>
                  <dd>{v.builtYear || '—'}</dd>
                </div>
                <div>
                  <dt>{t('lengthOverall', 'LOA')}</dt>
                  <dd>{v.lengthOverall || '—'}</dd>
                </div>
                <div>
                  <dt>{t('totalKwMainEng', 'M/E kW')}</dt>
                  <dd>{v.totalKwMainEng || '—'}</dd>
                </div>
                <div>
                  <dt>{t('owner', 'Owner')}</dt>
                  <dd>{v.owner || '—'}</dd>
                </div>
              </dl>

              {historyId === v.id && <VesselHistory t={t} changes={v.history} />}
            </article>
          ),
        )
      )}
    </div>
  );
}

function VesselHistory({
  t,
  changes,
}: {
  t: (key: string, fallback: string) => string;
  changes: VesselChange[];
}) {
  if (changes.length === 0) {
    return (
      <div className="fv-vessel-hist">
        <p className="fv-vessel-hist__empty">{t('noVesselChanges', 'No changes recorded yet.')}</p>
      </div>
    );
  }
  return (
    <div className="fv-vessel-hist">
      <table className="fv-ports-table">
        <thead>
          <tr>
            <th>{t('changedAt', 'Date / Time')}</th>
            <th>{t('field', 'Field')}</th>
            <th>{t('from', 'From')}</th>
            <th>{t('to', 'To')}</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c, i) => (
            <tr key={`${c.at}-${i}`}>
              <td>{new Date(c.at).toLocaleString()}</td>
              <td>{c.field}</td>
              <td>{c.from || '—'}</td>
              <td>{c.to || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const GROUP_LABELS: Record<VesselGroup, string> = {
  Identity: 'Ship Identity',
  Type: 'Ship Type',
  Builder: 'Ship Builder',
  Dimensions: 'Ship Dimensions',
  Engine: 'Ship Engine',
  Commercial: 'Commercial / Other',
};

function VesselEditor({
  t,
  value,
  onChange,
  onSave,
  onCancel,
}: {
  t: (key: string, fallback: string) => string;
  value: Vessel;
  onChange: (vessel: Vessel) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const canSave = value.name.trim().length > 0 && value.imo.trim().length > 0;
  const set = (key: VesselFieldKey, v: string) => onChange({ ...value, [key]: v });

  return (
    <form
      className="fv-email-template fv-email-template--edit"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      {VESSEL_GROUPS.map((group) => (
        <fieldset key={group} className="fv-vessel-group">
          <legend>{t(`vesselGroup_${group}`, GROUP_LABELS[group])}</legend>
          <div className="fv-vessel-group__grid">
            {VESSEL_FIELDS.filter((f) => f.group === group).map((f) => (
              <label key={f.key} className="fv-email-template__field">
                <span>
                  {f.label}
                  {f.required && <em className="fv-vessel-req"> *</em>}
                </span>
                <input
                  type={f.type ?? 'text'}
                  value={value[f.key]}
                  placeholder={f.placeholder}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              </label>
            ))}
          </div>
        </fieldset>
      ))}

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
