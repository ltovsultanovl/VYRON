import Modal from "./Modal";

export default function ConfirmModal({
  title,
  text,
  confirmLabel = "Удалить",
  onConfirm,
  onClose,
}: {
  title: string;
  text: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      width={420}
      footer={
        <>
          <button className="btn btn--secondary" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn--danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="modal__text">{text}</p>
    </Modal>
  );
}
