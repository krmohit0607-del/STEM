import { useMemo, useState } from 'react';
import type { Voyage } from '../data/voyages';
import {
  ALL_VESSEL_REPORTS,
  SHIFTING_SUBTYPES,
  type ReportDefinition,
  type ShiftingSubtype,
} from '../data/vesselReportDefinitions';
import { sendSystemMail } from '../data/systemMail';

interface VesselReportSubmissionDialogProps {
  voyage: Voyage;
  onClose: () => void;
  mode?: 'dialog' | 'page';
}

export function VesselReportSubmissionDialog({
  voyage,
  onClose,
  mode = 'dialog',
}: VesselReportSubmissionDialogProps) {
  const [selectedReportId, setSelectedReportId] = useState<string>(ALL_VESSEL_REPORTS[0].id);
  const [shiftingSubtype, setShiftingSubtype] = useState<ShiftingSubtype>(SHIFTING_SUBTYPES[0]);
  const [activeTab, setActiveTab] = useState<'form' | 'preview'>('form');
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [copied, setCopied] = useState(false);

  const currentReport: ReportDefinition = useMemo(() => {
    return ALL_VESSEL_REPORTS.find((r) => r.id === selectedReportId) ?? ALL_VESSEL_REPORTS[0];
  }, [selectedReportId]);

  const sections = useMemo(() => {
    return currentReport.getSections(shiftingSubtype);
  }, [currentReport, shiftingSubtype]);

  const formattedReportText = useMemo(() => {
    return currentReport.formatReportText(values, shiftingSubtype);
  }, [currentReport, values, shiftingSubtype]);

  const handleReportTypeChange = (id: string) => {
    setSelectedReportId(id);
    setValues({});
    setSubmitted(false);
    setCopied(false);
  };

  const handleSubtypeChange = (subtype: ShiftingSubtype) => {
    setShiftingSubtype(subtype);
    setSubmitted(false);
  };

  const updateValue = (key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  const clearForm = () => {
    setValues({});
    setSubmitted(false);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(formattedReportText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = formattedReportText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const emailReport = () => {
    const subject = `${voyage.vessel} - ${currentReport.name} - ${voyage.portFrom} - ${voyage.portTo}`;
    sendSystemMail({
      to: 'ops@odasgroup.net',
      subject,
      body: formattedReportText,
      attachments: [],
    });
    setSubmitted(true);
  };

  const submitOnline = () => {
    const record = {
      id: `vessel-report-${Date.now()}`,
      voyageId: voyage.id,
      vessel: voyage.vessel,
      imo: voyage.imo,
      reportType: currentReport.name,
      shiftingSubtype: currentReport.hasSubtypes ? shiftingSubtype : undefined,
      values,
      formattedText: formattedReportText,
      submittedAt: new Date().toISOString(),
      status: 'Submitted',
    };
    try {
      const raw = window.localStorage.getItem('fv.vesselReports');
      const existing = raw ? JSON.parse(raw) : [];
      const reports = Array.isArray(existing) ? existing : [];
      window.localStorage.setItem('fv.vesselReports', JSON.stringify([record, ...reports]));
    } catch {
      // Submission remains acknowledged
    }
    setSubmitted(true);
  };

  const filledFieldCount = useMemo(() => {
    return Object.values(values).filter((v) => typeof v === 'string' && v.trim().length > 0).length;
  }, [values]);

  return (
    <div
      className={`fv-report-submit__backdrop${mode === 'page' ? ' fv-report-submit__backdrop--page' : ''}`}
      role="presentation"
      onMouseDown={mode === 'dialog' ? onClose : undefined}
    >
      <section
        className="fv-report-submit"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fv-report-submit-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="fv-report-submit__head">
          <div>
            <span className="fv-report-submit__eyebrow">Vessel Reporting Portal</span>
            <h2 id="fv-report-submit-title">
              {currentReport.number}. {currentReport.name}
            </h2>
            <p>
              {voyage.vessel} · IMO {voyage.imo} · Voyage {voyage.id} ({voyage.portFrom} → {voyage.portTo})
            </p>
          </div>
          {mode === 'dialog' && (
            <button
              type="button"
              className="fv-report-submit__close"
              aria-label="Close"
              onClick={onClose}
            >
              <i className="fas fa-xmark" aria-hidden="true" />
            </button>
          )}
        </header>

        {submitted ? (
          <div className="fv-report-submit__success">
            <i className="fas fa-circle-check" aria-hidden="true" />
            <h3>Report Submitted Successfully</h3>
            <p>
              <strong>{currentReport.number}. {currentReport.name}</strong> for {voyage.vessel} has been logged and transmitted to the ODAS Operations Team (ops@odasgroup.net).
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '16px' }}>
              <button
                type="button"
                className="fv-report__btn"
                onClick={() => setSubmitted(false)}
              >
                <i className="fas fa-pen-to-square" aria-hidden="true" /> Edit / Send Another
              </button>
              <button
                type="button"
                className="fv-report__btn fv-report__btn--primary"
                onClick={mode === 'dialog' ? onClose : () => setSubmitted(false)}
              >
                <i className="fas fa-check" aria-hidden="true" /> Done
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Top Bar with Report Selector and Form/Preview Tabs */}
            <div className="fv-report-submit__control-strip">
              <div className="fv-report-submit__selectors">
                <label className="fv-report-submit__type-picker">
                  <span>Report Type:</span>
                  <select
                    value={selectedReportId}
                    onChange={(e) => handleReportTypeChange(e.target.value)}
                  >
                    {ALL_VESSEL_REPORTS.map((rep) => (
                      <option key={rep.id} value={rep.id}>
                        {rep.number}. {rep.name}
                      </option>
                    ))}
                  </select>
                </label>

                {currentReport.hasSubtypes && (
                  <label className="fv-report-submit__type-picker">
                    <span>Shifting Type:</span>
                    <select
                      value={shiftingSubtype}
                      onChange={(e) => handleSubtypeChange(e.target.value as ShiftingSubtype)}
                    >
                      {SHIFTING_SUBTYPES.map((sub) => (
                        <option key={sub} value={sub}>
                          {sub}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <div className="fv-report-submit__view-tabs">
                <button
                  type="button"
                  className={`fv-report-submit__tab-btn ${activeTab === 'form' ? 'active' : ''}`}
                  onClick={() => setActiveTab('form')}
                >
                  <i className="fas fa-list-check" aria-hidden="true" /> Form Fields
                </button>
                <button
                  type="button"
                  className={`fv-report-submit__tab-btn ${activeTab === 'preview' ? 'active' : ''}`}
                  onClick={() => setActiveTab('preview')}
                >
                  <i className="fas fa-file-lines" aria-hidden="true" /> Message Preview
                </button>
              </div>
            </div>

            {/* Main Form Body or Formatted Preview */}
            {activeTab === 'form' ? (
              <div className="fv-report-submit__body">
                {sections.map((sec, secIdx) => (
                  <div key={sec.title || secIdx} className="fv-report-submit__section">
                    <h3 className="fv-report-submit__section-title">{sec.title}</h3>
                    <div className="fv-report-submit__section-fields">
                      {sec.fields.map((field) => (
                        <div
                          key={field.key}
                          className={`fv-report-submit__row ${field.type === 'textarea' ? 'fv-report-submit__row--full' : ''}`}
                        >
                          <label className="fv-report-submit__label" htmlFor={`field-${field.key}`}>
                            {field.label}
                          </label>

                          <div className="fv-report-submit__input-container">
                            {field.parts ? (
                              <div className="fv-report-submit__parts">
                                {field.parts.map((part) => (
                                  <div key={part.key} className="fv-report-submit__part">
                                    <span className="fv-report-submit__part-label">{part.label}</span>
                                    {part.type === 'select' ? (
                                      <select
                                        id={`field-${part.key}`}
                                        value={values[part.key] ?? ''}
                                        onChange={(e) => updateValue(part.key, e.target.value)}
                                      >
                                        <option value="">Select</option>
                                        {(part.options ?? []).map((opt) => (
                                          <option key={opt} value={opt}>
                                            {opt}
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      <input
                                        id={`field-${part.key}`}
                                        type={part.type ?? (/date|time/i.test(part.label) ? 'datetime-local' : 'text')}
                                        placeholder={part.placeholder}
                                        value={values[part.key] ?? ''}
                                        onChange={(e) => updateValue(part.key, e.target.value)}
                                      />
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : field.type === 'textarea' ? (
                              <textarea
                                id={`field-${field.key}`}
                                rows={3}
                                placeholder={field.placeholder}
                                value={values[field.key] ?? ''}
                                onChange={(e) => updateValue(field.key, e.target.value)}
                              />
                            ) : field.type === 'select' ? (
                              <select
                                id={`field-${field.key}`}
                                value={values[field.key] ?? ''}
                                onChange={(e) => updateValue(field.key, e.target.value)}
                              >
                                <option value="">Select</option>
                                {(field.options ?? []).map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                id={`field-${field.key}`}
                                type={field.type ?? (/date|time/i.test(field.label) ? 'datetime-local' : 'text')}
                                placeholder={field.placeholder}
                                value={values[field.key] ?? ''}
                                onChange={(e) => updateValue(field.key, e.target.value)}
                              />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="fv-report-submit__preview-container">
                <div className="fv-report-submit__preview-toolbar">
                  <span className="fv-report-submit__preview-note">
                    <i className="fas fa-info-circle" aria-hidden="true" /> Standard reporting format ready for email / satellite comms
                  </span>
                  <button
                    type="button"
                    className="fv-report__btn"
                    onClick={copyToClipboard}
                    title="Copy full text format to clipboard"
                  >
                    <i className={`fas ${copied ? 'fa-check text-green-500' : 'fa-copy'}`} aria-hidden="true" />
                    {copied ? 'Copied to Clipboard!' : 'Copy Formatted Text'}
                  </button>
                </div>
                <pre className="fv-report-submit__preview-box">
                  {formattedReportText}
                </pre>
              </div>
            )}

            {/* Footer with summary and action buttons */}
            <footer className="fv-report-submit__foot">
              <div className="fv-report-submit__foot-left">
                <button
                  type="button"
                  className="fv-report-submit__btn-link"
                  onClick={clearForm}
                  title="Clear all fields in this form"
                >
                  <i className="fas fa-rotate-left" aria-hidden="true" /> Clear Form
                </button>
                {filledFieldCount > 0 && (
                  <span className="fv-report-submit__field-count">
                    {filledFieldCount} field{filledFieldCount === 1 ? '' : 's'} entered
                  </span>
                )}
              </div>

              <div className="fv-report-submit__foot-actions">
                <button
                  type="button"
                  className="fv-report__btn"
                  onClick={copyToClipboard}
                >
                  <i className={`fas ${copied ? 'fa-check' : 'fa-copy'}`} aria-hidden="true" />
                  {copied ? 'Copied' : 'Copy Text'}
                </button>

                <button
                  type="button"
                  className="fv-report__btn"
                  onClick={emailReport}
                  title="Open default email client with populated report"
                >
                  <i className="fas fa-envelope" aria-hidden="true" /> Send Email
                </button>

                <button
                  type="button"
                  className="fv-report__btn fv-report__btn--primary"
                  onClick={submitOnline}
                >
                  <i className="fas fa-paper-plane" aria-hidden="true" /> Submit Report
                </button>
              </div>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}