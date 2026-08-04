import type { ReactNode } from "react";

export function Modal({ title, children, onClose, width = 720 }: { title: string; children: ReactNode; onClose: () => void; width?: number }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card" style={{ maxWidth: width }}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">MKNG VISUAL</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
