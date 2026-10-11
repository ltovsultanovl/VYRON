import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "./Icons";
import { useScrollLock } from "../hooks";

const openModals: object[] = [];

export default function Modal({
  title,
  onClose,
  footer,
  width = 480,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  width?: number;
  children?: ReactNode;
}) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useScrollLock();

  useEffect(() => {
    const token = {};
    openModals.push(token);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openModals.at(-1) === token)
        onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      openModals.splice(openModals.indexOf(token), 1);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal" style={{ width }} role="dialog" aria-modal="true">
        <div className="modal__head">
          <div className="modal__title">{title}</div>
          <button className="icon-btn" onClick={onClose} title="Закрыть">
            <CloseIcon />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
