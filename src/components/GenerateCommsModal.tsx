import { useEffect, useMemo, useState } from 'react';

import type { Voyage } from '../data/voyages';
import {
  applyVoyageTokens,
  ensureHtml,
  htmlToPlain,
  loadEmailTemplates,
  resolveRecipientsLine,
  resolveSubject,
  type EmailAttachment,
  type EmailTemplate,
} from '../data/emailTemplates';
import { consumeCommsDraft } from '../data/commsStore';
import { RichTextEditor } from './RichTextEditor';

/**
 * "Generate Comms" dialog opened from the header envelope icon.
 *
 * The operator picks a folder (template category) and a template. The email is
 * then generated from the currently selected voyage: the template's recipient
 * type auto-fills the "To" address, and any {{token}} placeholders in the
 * subject/body are substituted with the voyage's live data
 * (see {@link applyVoyageTokens}). Every field stays editable before sending.
 */
export function GenerateCommsModal({
  voyage,
  onClose,
}: {
  voyage: Voyage | undefined;
  onClose: () => void;
}) {
  const templates = useMemo(() => loadEmailTemplates(), []);

  // Folders = the distinct main template categories.
  const folders = useMemo(
    () => Array.from(new Set(templates.map((t) => t.category))).sort((a, b) => a.localeCompare(b)),
    [templates],
  );

  const [folder, setFolder] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [subSubCategory, setSubSubCategory] = useState('');
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(voyage?.vessel ?? '');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  // Consume any queued forecast draft and pre-fill on mount
  useEffect(() => {
    const draft = consumeCommsDraft();
    if (draft) {
      if (draft.subject) setSubject(draft.subject);
      if (draft.body) setBody(ensureHtml(draft.body));
      if (draft.to) setTo(draft.to);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sub categories available within the chosen main folder.
  const subCategories = useMemo(
    () =>
      folder
        ? Array.from(
            new Set(templates.filter((t) => t.category === folder).map((t) => (t.subCategory ?? '').trim())),
          ).sort((a, b) => a.localeCompare(b))
        : [],
    [templates, folder],
  );
  // Sub-sub categories available within the chosen main + sub.
  const subSubCategories = useMemo(
    () =>
      folder
        ? Array.from(
            new Set(
              templates
                .filter((t) => t.category === folder && (t.subCategory ?? '').trim() === subCategory)
                .map((t) => (t.subSubCategory ?? '').trim()),
            ),
          ).sort((a, b) => a.localeCompare(b))
        : [],
    [templates, folder, subCategory],
  );

  const matchesFor = (main: string, sub: string, subSub: string): EmailTemplate[] =>
    main
      ? templates.filter(
          (t) =>
            t.category === main &&
            (t.subCategory ?? '').trim() === sub &&
            (t.subSubCategory ?? '').trim() === subSub,
        )
      : [];

  const fill = (tpl: EmailTemplate) => {
    setTo(resolveRecipientsLine(tpl.to, voyage));
    setCc(resolveRecipientsLine(tpl.cc, voyage));
    setAttachments(tpl.attachments ?? []);
    setSubject(resolveSubject(tpl, voyage));
    setBody(applyVoyageTokens(ensureHtml(tpl.body), voyage));
  };

  // Load the template matching the chosen main / sub / sub-sub path.
  const resolveAndFill = (main: string, sub: string, subSub: string) => {
    const matches = matchesFor(main, sub, subSub);
    if (matches.length > 0) fill(matches[0]);
  };

  const distinctSubs = (main: string) =>
    Array.from(new Set(templates.filter((t) => t.category === main).map((t) => (t.subCategory ?? '').trim())));
  const distinctSubSubs = (main: string, sub: string) =>
    Array.from(
      new Set(
        templates
          .filter((t) => t.category === main && (t.subCategory ?? '').trim() === sub)
          .map((t) => (t.subSubCategory ?? '').trim()),
      ),
    );

  // Cascading selection — each level narrows the next and auto-picks singletons.
  const onPickFolder = (next: string) => {
    const subs = distinctSubs(next);
    const sub = subs.length === 1 ? subs[0] : '';
    const subSubs = distinctSubSubs(next, sub);
    const subSub = subSubs.length === 1 ? subSubs[0] : '';
    setFolder(next);
    setSubCategory(sub);
    setSubSubCategory(subSub);
    resolveAndFill(next, sub, subSub);
  };

  const onPickSub = (next: string) => {
    const subSubs = distinctSubSubs(folder, next);
    const subSub = subSubs.length === 1 ? subSubs[0] : '';
    setSubCategory(next);
    setSubSubCategory(subSub);
    resolveAndFill(folder, next, subSub);
  };

  const onPickSubSub = (next: string) => {
    setSubSubCategory(next);
    resolveAndFill(folder, subCategory, next);
  };

  const regenerate = () => resolveAndFill(folder, subCategory, subSubCategory);

  // Download one attachment so the operator can attach it to the draft.
  const downloadAttachment = (a: EmailAttachment) => {
    const link = document.createElement('a');
    link.href = a.dataUrl;
    link.download = a.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const draft = () => {
    // mailto cannot carry attachments, so download them for the operator to attach.
    attachments.forEach(downloadAttachment);
    const plain = htmlToPlain(body);
    // Auto-copy the body so the operator can paste formatted text if the mail
    // client strips the mailto body (also covers mailto length limits).
    void copyRich(plain);
    const href =
      `mailto:${encodeURIComponent(to)}` +
      `?cc=${encodeURIComponent(cc)}` +
      `&subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(plain)}`;
    window.location.href = href;
    setSent(true);
    window.setTimeout(() => setSent(false), 4000);
  };

  // Copy the body to the clipboard as both HTML and plain text when possible.
  const copyRich = async (plain: string) => {
    try {
      if (navigator.clipboard && 'write' in navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([body], { type: 'text/html' }),
            'text/plain': new Blob([plain], { type: 'text/plain' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
      return true;
    } catch {
      return false;
    }
  };

  const copyBody = async () => {
    if (await copyRich(htmlToPlain(body))) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  // Copy the whole email (headers + body) as plain text for any mail client.
  const copyEmail = async () => {
    const text = `To: ${to}\nCC: ${cc}\nSubject: ${subject}\n\n${htmlToPlain(body)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      window.setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="fv-comms-overlay" role="presentation" onClick={onClose}>
      <div
        className="fv-comms"
        role="dialog"
        aria-modal="true"
        aria-label="Generate Comms"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="fv-comms__head">
          <h4><i className="fas fa-envelope-open-text" aria-hidden="true" /> Generate Comms</h4>
          <button type="button" className="fv-comms__close" onClick={onClose} aria-label="Close">
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </header>

        <div className="fv-comms__body">
          <div className="fv-comms__top">
            <div className="fv-comms__to-line">
              Generating Comms to <b>{voyage?.vessel || 'No vessel selected'}</b>
            </div>
            <div className="fv-comms__selects">
              <label>
                <span>Main Category [{folders.length}]</span>
                <select value={folder} onChange={(e) => onPickFolder(e.target.value)}>
                  <option value="">Select a folder</option>
                  {folders.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Sub Category [{subCategories.length}]</span>
                <select value={subCategory} onChange={(e) => onPickSub(e.target.value)} disabled={!folder}>
                  {subCategories.map((s) => (
                    <option key={s || '__none'} value={s}>{s || '— None —'}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Sub-Sub Category [{subSubCategories.length}]</span>
                <select value={subSubCategory} onChange={(e) => onPickSubSub(e.target.value)} disabled={!folder}>
                  {subSubCategories.map((s) => (
                    <option key={s || '__none'} value={s}>{s || '— None —'}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {!voyage && (
            <p className="fv-comms__warn">
              <i className="fas fa-triangle-exclamation" aria-hidden="true" /> No voyage selected — pick a vessel from the fleet list so the email is filled with its data.
            </p>
          )}

          <div className="fv-comms__field">
            <label htmlFor="fv-comms-to">To:</label>
            <input id="fv-comms-to" type="text" value={to} onChange={(e) => setTo(e.target.value)} placeholder="recipient@email" />
            <div className="fv-comms__field-actions">
              <button type="button" className="fv-comms__field-btn" onClick={() => setTo('')} aria-label="Clear To">
                <i className="fas fa-xmark" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="fv-comms__field">
            <label htmlFor="fv-comms-cc">CC:</label>
            <input id="fv-comms-cc" type="text" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="cc@email, cc2@email" />
            <div className="fv-comms__field-actions">
              <button type="button" className="fv-comms__field-btn" onClick={() => setCc('')} aria-label="Clear CC">
                <i className="fas fa-xmark" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="fv-comms__field">
            <label htmlFor="fv-comms-subject">Subject:</label>
            <input id="fv-comms-subject" type="text" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          {attachments.length > 0 && (
            <div className="fv-comms__attach">
              <span className="fv-comms__attach-label">
                <i className="fas fa-paperclip" aria-hidden="true" /> Attachments ({attachments.length}) — downloaded when you draft, so you can attach them:
              </span>
              <div className="fv-comms__attach-list">
                {attachments.map((a, i) => (
                  <button
                    key={`${a.name}-${i}`}
                    type="button"
                    className="fv-comms__attach-chip"
                    onClick={() => downloadAttachment(a)}
                    title={`Download ${a.name}`}
                  >
                    <i className="fas fa-file-arrow-down" aria-hidden="true" /> {a.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="fv-comms__preview">
            <span className="fv-comms__preview-label">Message Preview:</span>
            <RichTextEditor value={body} onChange={setBody} minHeight={140} placeholder={`Enter text here or pick a template to create a message${voyage ? ` to ${voyage.vessel}` : ''}.`} />
          </div>
        </div>

        <footer className="fv-comms__foot">
          <button type="button" className="fv-comms__icon-btn" onClick={regenerate} disabled={!folder} title="Regenerate from template" aria-label="Regenerate from template">
            <i className="fas fa-rotate" aria-hidden="true" />
          </button>
          <button type="button" className="fv-comms__link" onClick={copyBody}>
            <i className="fas fa-copy" aria-hidden="true" /> {copied ? 'Copied' : 'Copy body'}
          </button>
          <button type="button" className="fv-comms__link" onClick={copyEmail}>
            <i className="fas fa-envelope" aria-hidden="true" /> {copiedAll ? 'Copied' : 'Copy email'}
          </button>
          <span className="fv-comms__spacer" />
          <button type="button" className="fv-comms__primary" onClick={draft} disabled={!to}>
            <i className="fas fa-paper-plane" aria-hidden="true" /> {sent ? 'Drafted' : 'Draft Message'}
          </button>
        </footer>
      </div>
    </div>
  );
}
