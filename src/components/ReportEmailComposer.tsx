import { useState } from 'react';

import type { ReportEmail } from '../data/reports';

/**
 * Editable email composer shared by the Reports pages.
 *
 * The email is generated from the current voyage's data (voyage, client,
 * vessel, ports, etc.) via the `build` function. It is generated once on
 * mount and can be regenerated with the "Generate" button — useful after
 * the underlying order data changes. Every field (recipient, subject,
 * attachments note and body) can be edited before sending.
 *
 * "Send Email" opens the operator's mail client via a `mailto:` link
 * (consistent with the Email Details page). "Copy" copies the body to
 * the clipboard. Remount with a `key` when the source voyage changes so
 * the draft resets.
 */
export function ReportEmailComposer({ build }: { build: () => ReportEmail }) {
  const [draft, setDraft] = useState<ReportEmail>(() => build());
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [generated, setGenerated] = useState(false);

  const update = (patch: Partial<ReportEmail>) =>
    setDraft((d) => ({ ...d, ...patch }));

  const generate = () => {
    setDraft(build());
    setGenerated(true);
    window.setTimeout(() => setGenerated(false), 2000);
  };

  const send = () => {
    const href =
      `mailto:${encodeURIComponent(draft.to)}` +
      `?subject=${encodeURIComponent(draft.subject)}` +
      `&body=${encodeURIComponent(draft.body)}`;
    window.location.href = href;
    setSent(true);
    window.setTimeout(() => setSent(false), 4000);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft.body);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  return (
    <section className="fv-report__composer">
      <header className="fv-report__composer-head">
        <h2>
          <i className="fas fa-paper-plane" aria-hidden="true" /> Create &amp; Send Report
        </h2>
        <div className="fv-report__composer-actions">
          <button type="button" className="fv-report__btn" onClick={generate}>
            <i className="fas fa-rotate" aria-hidden="true" />{' '}
            {generated ? 'Generated' : 'Generate'}
          </button>
          <button type="button" className="fv-report__btn" onClick={copy}>
            <i className="fas fa-copy" aria-hidden="true" /> {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" className="fv-report__btn fv-report__btn--primary" onClick={send}>
            <i className="fas fa-paper-plane" aria-hidden="true" /> Send Email
          </button>
        </div>
      </header>

      <p className="fv-report__composer-hint">
        Generated from this voyage&apos;s order data (voyage, client, vessel &amp; ports). Edit any
        field below before sending.
      </p>

      <div className="fv-report__field">
        <label htmlFor="fv-report-to">To</label>
        <input
          id="fv-report-to"
          type="text"
          value={draft.to}
          onChange={(e) => update({ to: e.target.value })}
        />
      </div>

      <div className="fv-report__field">
        <label htmlFor="fv-report-subject">Subject</label>
        <input
          id="fv-report-subject"
          type="text"
          value={draft.subject}
          onChange={(e) => update({ subject: e.target.value })}
        />
      </div>

      {draft.attachments.length > 0 && (
        <div className="fv-report__field">
          <label>Attachments</label>
          <div className="fv-report__attachments">
            {draft.attachments.map((name) => (
              <span key={name} className="fv-report__attachment">
                <i className="fas fa-paperclip" aria-hidden="true" /> {name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="fv-report__field">
        <label htmlFor="fv-report-body">Message</label>
        <textarea
          id="fv-report-body"
          className="fv-report__body-input"
          value={draft.body}
          onChange={(e) => update({ body: e.target.value })}
          rows={18}
          spellCheck={false}
        />
      </div>

      {sent && (
        <p className="fv-report__sent" role="status">
          <i className="fas fa-circle-check" aria-hidden="true" /> Your mail client has been opened
          with this report.
        </p>
      )}
    </section>
  );
}
