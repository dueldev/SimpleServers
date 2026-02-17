import { useId, useRef } from "react";
import { useAccessibleDialog } from "./useAccessibleDialog";

type DeleteConfirmModalProps = {
  visible: boolean;
  title: string;
  detail: string;
  confirmToken: string;
  expectedToken: string;
  busy: boolean;
  itemNames: string[];
  onConfirmTokenChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export function DeleteConfirmModal(props: DeleteConfirmModalProps) {
  const {
    visible,
    title,
    detail,
    confirmToken,
    expectedToken,
    busy,
    itemNames,
    onConfirmTokenChange,
    onClose,
    onConfirm
  } = props;
  const dialogRef = useRef<HTMLElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const headingId = useId();
  const descriptionId = useId();
  const canConfirm = confirmToken.trim() === expectedToken && !busy;
  const { onBackdropClick } = useAccessibleDialog({
    open: visible,
    dialogRef,
    initialFocusRef: cancelButtonRef,
    onRequestClose: onClose
  });

  if (!visible) {
    return null;
  }

  return (
    <section className="v2-modal-backdrop" role="presentation" onClick={onBackdropClick}>
      <article
        ref={dialogRef}
        className="panel v2-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <header className="v2-modal-header">
          <div>
            <h3 id={headingId}>{title}</h3>
            <p id={descriptionId} className="muted-note">
              {detail}
            </p>
          </div>
          <button ref={cancelButtonRef} type="button" onClick={onClose} disabled={busy}>
            Close
          </button>
        </header>

        <ul className="list list-compact">
          {itemNames.slice(0, 8).map((name) => (
            <li key={name}>
              <div>
                <strong>{name}</strong>
              </div>
            </li>
          ))}
          {itemNames.length > 8 ? (
            <li>
              <div>
                <span>+ {itemNames.length - 8} more</span>
              </div>
            </li>
          ) : null}
        </ul>

        <label>
          Type <code>{expectedToken}</code> to confirm
          <input value={confirmToken} onChange={(event) => onConfirmTokenChange(event.target.value)} autoComplete="off" />
        </label>

        <div className="inline-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="danger-btn" onClick={onConfirm} disabled={!canConfirm}>
            {busy ? "Deleting..." : "Delete Permanently"}
          </button>
        </div>
      </article>
    </section>
  );
}
