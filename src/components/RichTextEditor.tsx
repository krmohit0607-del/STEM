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
  };

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
        <div className="fv-rte__tokens">
          {tokens.map((tok) => (
            <button
              key={tok.token}
              type="button"
              className="fv-rte__token"
              title={tok.label}
              onClick={() => insertToken(tok.token)}
            >
              {tok.token}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
