import { useEffect, useState } from 'react';

export interface BankAccount {
  verified: boolean;
  details: string;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  swift: string;
  iban: string;
}

interface BankAccountBoxProps {
  /** The bank account details to display. */
  account: BankAccount;
  /** Name of the party (e.g., 'Oceanic Bulk Carriers', 'Ocean Bunkers'). */
  partyName: string;
  /** Label for the box (e.g., 'Supplier Account Details', 'Our Company Account', 'Charterer Payment Details'). */
  label?: string;
  /** Whether the account details can be edited inline. */
  editable?: boolean;
  /** Callback when account is updated. Only fires if editable is true. */
  onUpdate?: (account: BankAccount) => void;
  /** Optional CSS class for styling. */
  className?: string;
}

/**
 * Reusable component for displaying and optionally editing bank account details.
 * Used in payment modules (Hire, Freight, Laytime, PDA/FDA, Invoices, Services, Bunker)
 * to show the account receiving payment, and in Invoices for our company's account details.
 */
export function BankAccountBox({
  account,
  partyName,
  label = 'Bank Account Details',
  editable = false,
  onUpdate,
  className,
}: BankAccountBoxProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [displayAccount, setDisplayAccount] = useState<BankAccount>(account);
  const [tempAccount, setTempAccount] = useState<BankAccount>(account);

  useEffect(() => {
    setDisplayAccount(account);
    setTempAccount(account);
  }, [account]);

  const handleFieldChange = (field: keyof BankAccount, value: string) => {
    setTempAccount((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    setDisplayAccount(tempAccount);
    onUpdate?.(tempAccount);
    setIsEditing(false);
  };

  const toggleVerified = () => {
    const next = { ...displayAccount, verified: !displayAccount.verified };
    setDisplayAccount(next);
    setTempAccount(next);
    onUpdate?.(next);
  };

  const handleCancel = () => {
    setTempAccount(displayAccount);
    setIsEditing(false);
  };

  const isEmpty = !displayAccount.details && !displayAccount.bankName && !displayAccount.accountHolder && !displayAccount.accountNumber && !displayAccount.swift && !displayAccount.iban;

  if (!isEditing) {
    return (
      <div className={`fv-bank-account-box ${className ?? ''}`}>
        <div className="fv-bank-account-box__header">
          <h4 className="fv-bank-account-box__label">{label}</h4>
          <span className="fv-bank-account-box__party">{partyName}</span>
          <label className="fv-bank-account-box__verify" title="Only verified account details are used in PDFs and payment handover to Accounts.">
            <input
              type="checkbox"
              checked={Boolean(displayAccount.verified)}
              onChange={toggleVerified}
              disabled={!editable}
            />
            <span>{displayAccount.verified ? 'Verified' : 'Unverified'}</span>
          </label>
          {editable && (
            <button
              type="button"
              className="fv-bank-account-box__edit-btn"
              onClick={() => setIsEditing(true)}
              title="Edit account details"
            >
              <i className="fas fa-pencil" aria-hidden="true" /> Edit
            </button>
          )}
        </div>

        {isEmpty ? (
          <div className="fv-bank-account-box__empty">
            <p>No bank account details saved</p>
            {editable && (
              <button
                type="button"
                className="fv-bank-account-box__add-btn"
                onClick={() => setIsEditing(true)}
              >
                <i className="fas fa-plus" aria-hidden="true" /> Add Bank Details
              </button>
            )}
          </div>
        ) : (
          <div className="fv-bank-account-box__content">
            {displayAccount.details ? (
              <pre className="fv-bank-account-box__value" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{displayAccount.details}</pre>
            ) : (
              <>
                <div className="fv-bank-account-box__row">
                  <span className="fv-bank-account-box__label-small">Bank Name</span>
                  <span className="fv-bank-account-box__value">{displayAccount.bankName || '—'}</span>
                </div>
                <div className="fv-bank-account-box__row">
                  <span className="fv-bank-account-box__label-small">Account Holder</span>
                  <span className="fv-bank-account-box__value">{displayAccount.accountHolder || '—'}</span>
                </div>
                <div className="fv-bank-account-box__row">
                  <span className="fv-bank-account-box__label-small">Account Number</span>
                  <span className="fv-bank-account-box__value fv-bank-account-box__mono">{displayAccount.accountNumber || '—'}</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  // Edit mode
  return (
    <div className={`fv-bank-account-box fv-bank-account-box--editing ${className ?? ''}`}>
      <div className="fv-bank-account-box__header">
        <h4 className="fv-bank-account-box__label">Edit {label}</h4>
        <span className="fv-bank-account-box__party">{partyName}</span>
        <label className="fv-bank-account-box__verify" title="Only verified account details are used in PDFs and payment handover to Accounts.">
          <input
            type="checkbox"
            checked={Boolean(tempAccount.verified)}
            onChange={(e) => setTempAccount((prev) => ({ ...prev, verified: e.target.checked }))}
          />
          <span>{tempAccount.verified ? 'Verified' : 'Unverified'}</span>
        </label>
      </div>

      <div className="fv-bank-account-box__edit-form">
        <div className="fv-bank-account-box__field">
          <label className="fv-bank-account-box__field-label">Account Details</label>
          <textarea
            className="fv-bank-account-box__input"
            rows={6}
            value={tempAccount.details}
            onChange={(e) => handleFieldChange('details', e.target.value)}
            placeholder={'Paste full bank details here\nBank Name:\nAccount Name:\nAccount Number:\nSWIFT:\nIBAN:'}
          />
        </div>

        <div className="fv-bank-account-box__actions">
          <button
            type="button"
            className="fv-bank-account-box__btn fv-bank-account-box__btn--primary"
            onClick={handleSave}
          >
            <i className="fas fa-check" aria-hidden="true" /> Save
          </button>
          <button
            type="button"
            className="fv-bank-account-box__btn fv-bank-account-box__btn--secondary"
            onClick={handleCancel}
          >
            <i className="fas fa-times" aria-hidden="true" /> Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
