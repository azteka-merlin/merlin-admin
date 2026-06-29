import React from "react";

export default function Modal({ title, subtitle, children, actions, onClose, closeDisabled = false, closeConfirmMessage = "" }) {
  function handleClose() {
    if (closeDisabled) return;
    if (closeConfirmMessage && !window.confirm(closeConfirmMessage)) return;
    onClose();
  }

  return (
    <div className="overlay" onClick={handleClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <div>
            <h3>{title}</h3>
            <p>{subtitle}</p>
          </div>
          <button className="icon-button" onClick={handleClose} aria-label="Fechar" disabled={closeDisabled}>
            x
          </button>
        </div>
        <div className="modal__body">{children}</div>
        <div className="modal__footer">{actions}</div>
      </div>
    </div>
  );
}
