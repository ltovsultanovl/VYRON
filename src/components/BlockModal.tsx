import Modal from "./Modal";
import type { Person } from "../types";

export default function BlockModal({
  person,
  onConfirm,
  onClose,
}: {
  person: Pick<Person, "name">;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Заблокировать пользователя?"
      onClose={onClose}
      width={440}
      footer={
        <>
          <button className="btn btn--secondary" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn--danger" onClick={onConfirm}>
            Заблокировать
          </button>
        </>
      }
    >
      <div className="block-modal">
        <p>
          {person.name} не сможет писать вам сообщения, отправлять заявки в
          друзья, писать на вашей стене, комментировать и оценивать ваши записи,
          фото и видео, а также не увидит вашу страницу.
        </p>
        <p className="block-modal__muted">
          Если вы дружите, дружба будет удалена. Пользователь не получит
          уведомления о блокировке. Разблокировать можно в любой момент — в
          «Чёрном списке».
        </p>
      </div>
    </Modal>
  );
}
