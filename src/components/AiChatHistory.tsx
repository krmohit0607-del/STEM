import { useEffect, useState } from 'react';
import { assistantApi, type AssistantConversationSummary } from '../api/assistantApi';

function groupLabel(iso: string): string {
  const day = new Date(iso);
  const today = new Date();
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfDay(today) - startOfDay(day)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'Previous 7 days';
  return 'Older';
}

function when(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

interface Props {
  activeId: string | null;
  /** Changes whenever the open chat gains a message, so the list reloads. */
  refreshKey: number;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDeleted: (id: string | 'all') => void;
  onClose: () => void;
}

export function AiChatHistory({ activeId, refreshKey, onSelect, onNewChat, onDeleted, onClose }: Props) {
  const [items, setItems] = useState<AssistantConversationSummary[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      assistantApi.listConversations(search)
        .then((rows) => { if (!cancelled) { setItems(rows); setError(''); } })
        .catch((e) => { if (!cancelled) setError(errorText(e)); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, search ? 250 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [search, refreshKey]);

  const rename = async (id: string) => {
    const title = editTitle.trim();
    setEditingId(null);
    if (!title) return;
    try {
      await assistantApi.renameConversation(id, title);
      setItems((rows) => rows.map((row) => row.id === id ? { ...row, title } : row));
    } catch (e) {
      setError(errorText(e));
    }
  };

  const remove = async (item: AssistantConversationSummary) => {
    if (!window.confirm(`Delete this chat?\n\n${item.title}`)) return;
    try {
      await assistantApi.deleteConversation(item.id);
      setItems((rows) => rows.filter((row) => row.id !== item.id));
      onDeleted(item.id);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const removeAll = async () => {
    setConfirmAll(false);
    try {
      await assistantApi.deleteAllConversations();
      setItems([]);
      onDeleted('all');
    } catch (e) {
      setError(errorText(e));
    }
  };

  const groups = ['Today', 'Yesterday', 'Previous 7 days', 'Older']
    .map((label) => ({ label, rows: items.filter((item) => groupLabel(item.lastMessageAtUtc) === label) }))
    .filter((group) => group.rows.length > 0);

  return (
    <div className="fv-ai__history" role="region" aria-label="Chat history">
      <div className="fv-ai__history-head">
        <button type="button" className="fv-ai__history-new" onClick={onNewChat}>
          <i className="fas fa-plus" aria-hidden="true" /> New chat
        </button>
        <button type="button" className="fv-ai__close" onClick={onClose} aria-label="Back to chat" title="Back to chat">
          <i className="fas fa-xmark" aria-hidden="true" />
        </button>
      </div>
      <input
        className="fv-ai__history-search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search chats…"
        aria-label="Search chats"
      />
      <div className="fv-ai__history-list">
        {loading && items.length === 0 && <div className="fv-ai__history-empty">Loading…</div>}
        {error && <div className="fv-ai__history-empty fv-ai__history-error" role="alert">{error}</div>}
        {!loading && !error && items.length === 0 && (
          <div className="fv-ai__history-empty">{search ? 'No chats match your search.' : 'No saved chats yet. Ask the agent something to start one.'}</div>
        )}
        {groups.map((group) => (
          <div key={group.label}>
            <div className="fv-ai__history-group">{group.label}</div>
            {group.rows.map((item) => (
              <div key={item.id} className={`fv-ai__history-item${item.id === activeId ? ' is-active' : ''}`}>
                {editingId === item.id ? (
                  <input
                    className="fv-ai__history-rename"
                    value={editTitle}
                    maxLength={200}
                    autoFocus
                    onChange={(event) => setEditTitle(event.target.value)}
                    onBlur={() => { void rename(item.id); }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void rename(item.id);
                      if (event.key === 'Escape') setEditingId(null);
                    }}
                  />
                ) : (
                  <button type="button" className="fv-ai__history-open" onClick={() => onSelect(item.id)}>
                    <span className="fv-ai__history-title">{item.title}</span>
                    <span className="fv-ai__history-meta">{when(item.lastMessageAtUtc)} · {item.messageCount} message{item.messageCount === 1 ? '' : 's'}</span>
                  </button>
                )}
                <span className="fv-ai__history-tools">
                  <button type="button" onClick={() => { setEditingId(item.id); setEditTitle(item.title); }} aria-label={`Rename ${item.title}`} title="Rename">
                    <i className="fas fa-pen" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => { void remove(item); }} aria-label={`Delete ${item.title}`} title="Delete">
                    <i className="fas fa-trash" aria-hidden="true" />
                  </button>
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {items.length > 0 && (
        <div className="fv-ai__history-foot">
          {confirmAll ? (
            <>
              <span>Delete all chats?</span>
              <button type="button" className="fv-ai__history-danger" onClick={() => { void removeAll(); }}>Yes, delete all</button>
              <button type="button" onClick={() => setConfirmAll(false)}>Cancel</button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmAll(true)}>
              <i className="fas fa-trash" aria-hidden="true" /> Clear all chats
            </button>
          )}
        </div>
      )}
    </div>
  );
}
