import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelectedVoyage } from '../data/selectedVoyage';

const keyFor = (id: string) => `fv.voyageTags.${id}`;
const RECENT_KEY = 'fv.recentVoyageTags';
const colors = ['blue', 'green', 'amber', 'red', 'purple', 'cyan'] as const;
type TagColor = (typeof colors)[number];
type VoyageTag = { id: string; text: string; color: TagColor };

function loadTags(id: string, fallback: string): VoyageTag[] {
  try {
    const raw = localStorage.getItem(keyFor(id));
    if (raw) {
      const parsed = JSON.parse(raw) as VoyageTag[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* use voyage tags */
  }
  return fallback.split(',').map((text) => text.trim()).filter(Boolean).map((text, index) => ({ id: `${id}-${index}`, text, color: 'blue' }));
}

function loadRecentTags(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, 8) : [];
  } catch { return []; }
}

export function VoyageTagsStrip() {
  const voyage = useSelectedVoyage({ emptyWhenCleared: true });
  const [tags, setTags] = useState<VoyageTag[]>([]);
  const [value, setValue] = useState('');
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [recentTags, setRecentTags] = useState<string[]>(loadRecentTags);
  const ref = useRef<HTMLDivElement | null>(null);
  const suggestions = useMemo(() => {
    const all = [...recentTags, ...tags.map((tag) => tag.text)];
    return Array.from(new Set(all)).filter((tag) => tag.toLowerCase().includes(value.toLowerCase()) && !tags.some((current) => current.text.toLowerCase() === tag.toLowerCase())).slice(0, 8);
  }, [recentTags, tags, value]);

  useEffect(() => {
    if (!voyage) { setTags([]); return; }
    setTags(loadTags(voyage.id, voyage.tags));
  }, [voyage?.id, voyage?.tags]);

  useEffect(() => {
    if (!suggestionsOpen) return;
    const onDocument = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setSuggestionsOpen(false);
    };
    document.addEventListener('mousedown', onDocument);
    return () => document.removeEventListener('mousedown', onDocument);
  }, [suggestionsOpen]);

  const persist = (next: VoyageTag[]) => {
    setTags(next);
    if (voyage) localStorage.setItem(keyFor(voyage.id), JSON.stringify(next));
  };
  const add = (rawText = value) => {
    const text = rawText.trim();
    if (!text || tags.some((tag) => tag.text.toLowerCase() === text.toLowerCase())) return;
    const color = colors[tags.length % colors.length];
    persist([...tags, { id: `${voyage?.id ?? 'tag'}-${Date.now()}`, text, color }]);
    const recent = [text, ...recentTags.filter((item) => item.toLowerCase() !== text.toLowerCase())].slice(0, 8);
    setRecentTags(recent);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    setValue('');
    setSuggestionsOpen(false);
  };
  const remove = (id: string) => persist(tags.filter((tag) => tag.id !== id));
  return (
    <div className="fv-voyage-tags" ref={ref} aria-label="Voyage tags">
      <span className="fv-voyage-tags__vessel" title="Voyage Tags"><i className="fas fa-tags" aria-hidden="true" /></span>
      <div className="fv-voyage-tags__items">
        {tags.map((tag, index) => <span key={tag.id} className={`fv-voyage-tags__tag fv-voyage-tags__tag--${colors[index % colors.length]}`}><i className="fas fa-tag" aria-hidden="true" /> {tag.text}<button type="button" onClick={() => remove(tag.id)} aria-label={`Remove ${tag.text}`}><i className="fas fa-xmark" aria-hidden="true" /></button></span>)}
      </div>
      {voyage && <div className="fv-voyage-tags__add"><input value={value} onFocus={() => setSuggestionsOpen(true)} onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 150)} onChange={(e) => { setValue(e.target.value); setSuggestionsOpen(true); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder="Add tag and press Enter…" aria-label="Add voyage tag" />{suggestionsOpen && suggestions.length > 0 && <div className="fv-voyage-tags__suggestions">{suggestions.map((suggestion) => <button type="button" key={suggestion} onMouseDown={(e) => { e.preventDefault(); add(suggestion); }}>{suggestion}</button>)}</div>}</div>}
    </div>
  );
}
