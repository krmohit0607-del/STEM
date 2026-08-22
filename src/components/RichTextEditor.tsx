import { useEffect, useRef, useState } from 'react';

/**
 * Minimal rich-text editor (contentEditable) with a small formatting toolbar
 * and optional {{token}} insert chips. The value is the body HTML; onChange
 * fires with the latest HTML. Kept intentionally lightweight (execCommand) so
 * it works across mail-oriented HTML without a heavy dependency.
 *
 * When `renderPreview` is supplied, a toolbar toggle switches the same box
 * between editing and a rendered preview (e.g. with voyage tokens applied).
 */
export function RichTextEditor({
  value,
  onChange,
  tokens,
  minHeight = 160,
  placeholder,
  renderPreview,
}: {
  value: string;
  onChange: (html: string) => void;
  tokens?: { token: string; label: string }[];
  minHeight?: number;
  placeholder?: string;
  renderPreview?: (html: string) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState(false);
  const [tokenQuery, setTokenQuery] = useState('');

  // Sync DOM only when the value changes from outside (avoids caret jumps).
  useEffect(() => {
    if (preview) return;
    const el = ref.current;
    if (el && el.innerHTML !== value) el.innerHTML = value;
  }, [value, preview]);

  const emit = () => onChange(ref.current?.innerHTML ?? '');

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    emit();
  };

  const insertToken = (token: string) => {
    ref.current?.focus();
    document.execCommand('insertText', false, token);
    emit();
    setTokenQuery('');
  };

  const tokenSuggestions = (tokens ?? [])
    .filter((tok) => `${tok.token} ${tok.label}`.toLowerCase().includes(tokenQuery.trim().toLowerCase()))
    .slice(0, 8);

  const addLink = () => {
    const url = window.prompt('Link URL', 'https://');
    if (url) exec('createLink', url);
  };

  return (
    <div className="fv-rte">
      <div className="fv-rte__toolbar">
        <button type="button" onClick={() => exec('bold')} disabled={preview} title="Bold" aria-label="Bold"><b>B</b></button>
        <button type="button" onClick={() => exec('italic')} disabled={preview} title="Italic" aria-label="Italic"><i>I</i></button>
        <button type="button" onClick={() => exec('underline')} disabled={preview} title="Underline" aria-label="Underline"><u>U</u></button>
        <span className="fv-rte__sep" />
        <button type="button" onClick={() => exec('insertUnorderedList')} disabled={preview} title="Bulleted list" aria-label="Bulleted list"><i className="fas fa-list-ul" /></button>
        <button type="button" onClick={() => exec('insertOrderedList')} disabled={preview} title="Numbered list" aria-label="Numbered list"><i className="fas fa-list-ol" /></button>
        <button type="button" onClick={addLink} disabled={preview} title="Insert link" aria-label="Insert link"><i className="fas fa-link" /></button>
        <span className="fv-rte__sep" />
        <button type="button" onClick={() => exec('removeFormat')} disabled={preview} title="Clear formatting" aria-label="Clear formatting"><i className="fas fa-eraser" /></button>
        <label className="fv-rte__color" title="Text color"><i className="fas fa-font" aria-hidden="true" /><input type="color" defaultValue="#e6edf3" disabled={preview} onChange={(e) => exec('foreColor', e.target.value)} aria-label="Text color" /></label>
        <label className="fv-rte__color" title="Highlight color"><i className="fas fa-highlighter" aria-hidden="true" /><input type="color" defaultValue="#f0b429" disabled={preview} onChange={(e) => exec('hiliteColor', e.target.value)} aria-label="Highlight color" /></label>
        {renderPreview && (
          <>
            <span className="fv-rte__spacer" />
            <button
              type="button"
              className={`fv-rte__toggle${preview ? ' fv-rte__toggle--on' : ''}`}
              onClick={() => setPreview((p) => !p)}
              title={preview ? 'Back to editing' : 'Preview'}
            >
              <i className={`fas ${preview ? 'fa-pen' : 'fa-eye'}`} aria-hidden="true" /> {preview ? 'Edit' : 'Preview'}
            </button>
          </>
        )}
      </div>
      {preview && renderPreview ? (
        <div
          className="fv-rte__area fv-rte__preview"
          style={{ minHeight }}
          // Preview only — content is authored template HTML with tokens applied.
          dangerouslySetInnerHTML={{ __html: renderPreview(value) }}
        />
      ) : (
        <div
          ref={ref}
          className="fv-rte__area"
          contentEditable
          role="textbox"
          aria-multiline="true"
          data-placeholder={placeholder}
          style={{ minHeight }}
          onInput={emit}
          onBlur={emit}
          suppressContentEditableWarning
        />
      )}
      {tokens && tokens.length > 0 && !preview && (
        <div className="fv-rte__token-picker">
          <label htmlFor="fv-rte-token-search"><i className="fas fa-code" aria-hidden="true" /> Insert token</label>
          <input
            id="fv-rte-token-search"
            value={tokenQuery}
            onChange={(e) => setTokenQuery(e.target.value)}
            placeholder="Search fields…"
            list="fv-rte-token-options"
            aria-label="Search email tokens"
          />
          <datalist id="fv-rte-token-options">
            {tokens.map((tok) => <option key={tok.token} value={tok.token}>{tok.label}</option>)}
          </datalist>
          {tokenQuery.trim() && tokenSuggestions.length > 0 && (
            <div className="fv-rte__token-suggestions">
              {tokenSuggestions.map((tok) => (
                <button key={tok.token} type="button" title={`${tok.label} — insert at cursor`} onClick={() => insertToken(tok.token)}>
                  <strong>{tok.token}</strong><span>{tok.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
