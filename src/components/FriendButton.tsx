import { useState } from "react";
import ConfirmModal from "./ConfirmModal";
import { useFriends } from "../context/FriendsContext";
import { useDropdown } from "../hooks";
import { ChevronDownIcon } from "./Icons";
import type { Person } from "../types";

export default function FriendButton({
  person,
  className = "",
}: {
  person: Person;
  className?: string;
}) {
  const { relationTo, sendRequest, cancel, accept, decline, remove } =
    useFriends();
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const menu = useDropdown();
  const relation = relationTo(person.id);

  const act = (fn: (person: Person) => Promise<boolean>) => async () => {
    menu.close();
    setBusy(true);
    await fn(person);
    setBusy(false);
  };

  if (relation === "incoming") {
    return (
      <span className={`friend-actions ${className}`}>
        <button className="btn" onClick={act(accept)} disabled={busy}>
          Принять заявку
        </button>
        <button
          className="btn btn--neutral"
          onClick={act(decline)}
          disabled={busy}
        >
          Отклонить
        </button>
      </span>
    );
  }

  if (relation === "none") {
    return (
      <button
        className={`btn ${className}`}
        onClick={act(sendRequest)}
        disabled={busy}
      >
        Добавить в друзья
      </button>
    );
  }

  const label = relation === "friend" ? "У вас в друзьях" : "Заявка отправлена";
  return (
    <div className={`friend-menu ${className}`} ref={menu.ref}>
      <button
        className="btn btn--neutral"
        onClick={menu.toggle}
        disabled={busy}
      >
        {label}
        <ChevronDownIcon size={16} />
      </button>
      {menu.open && (
        <div className="dropdown dropdown--right">
          {relation === "friend" ? (
            <button
              className="dropdown__item dropdown__item--danger"
              onClick={() => {
                menu.close();
                setConfirmRemove(true);
              }}
            >
              Удалить из друзей
            </button>
          ) : (
            <button className="dropdown__item" onClick={act(cancel)}>
              Отменить заявку
            </button>
          )}
        </div>
      )}
      {confirmRemove && (
        <ConfirmModal
          title="Удаление из друзей"
          text={`Удалить ${person.name} из друзей?`}
          onConfirm={async () => {
            setConfirmRemove(false);
            await act(remove)();
          }}
          onClose={() => setConfirmRemove(false)}
        />
      )}
    </div>
  );
}
