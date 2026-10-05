export interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Reusable confirmation dialog modal component
 * Used for important actions like delete operations
 */
export function ConfirmationDialog({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDangerous = false,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fv-confirmation-dialog__overlay" onClick={onCancel}>
      <div className="fv-confirmation-dialog__modal" onClick={(e) => e.stopPropagation()}>
        <div className="fv-confirmation-dialog__header">
          <h2 className="fv-confirmation-dialog__title">{title}</h2>
        </div>
        <div className="fv-confirmation-dialog__body">
          <p className="fv-confirmation-dialog__message">{message}</p>
        </div>
        <div className="fv-confirmation-dialog__footer">
          <button
            type="button"
            className="fv-confirmation-dialog__btn fv-confirmation-dialog__btn--cancel"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`fv-confirmation-dialog__btn fv-confirmation-dialog__btn--confirm${isDangerous ? ' fv-confirmation-dialog__btn--danger' : ''}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
