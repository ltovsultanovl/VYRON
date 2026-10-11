import { useState } from "react";
import Avatar from "../components/Avatar";
import { SearchField } from "../components/ListStates";
import { BlockIcon } from "../components/Icons";
import { useBlocks } from "../context/BlocksContext";
import { formatDate } from "../utils";

export default function Blacklist() {
  const { blocked, unblock } = useBlocks();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = blocked.filter((b) => b.person.name.toLowerCase().includes(q));

  return (
    <div className="card blacklist">
      <div className="blacklist__head">
        <h1 className="blacklist__title">
          Чёрный список <span className="muted">{blocked.length || ""}</span>
        </h1>
      </div>
      <p className="blacklist__hint">
        Пользователи из чёрного списка не могут писать вам сообщения, отправлять заявки в друзья, комментировать и
        оценивать ваши записи и не видят вашу страницу.
      </p>
      {blocked.length > 5 && <SearchField value={query} onChange={setQuery} placeholder="Поиск по чёрному списку" />}

      {visible.map(({ person, since }) => (
        <div key={person.id} className="blacklist__row">
          <a href={`#user/${person.id}`}>
            <Avatar name={person.name} color={person.color} src={person.avatar} size={48} />
          </a>
          <div className="blacklist__info">
            <a href={`#user/${person.id}`} className="blacklist__name">
              {person.name}
            </a>
            <div className="muted">
              {person.gender === "female" ? "Заблокирована" : "Заблокирован"} {formatDate(since)}
            </div>
          </div>
          <button className="btn btn--secondary btn--sm" onClick={() => unblock(person)}>
            Разблокировать
          </button>
        </div>
      ))}

      {blocked.length === 0 && (
        <div className="empty blacklist__empty">
          <BlockIcon size={48} />
          <div>В чёрном списке никого нет</div>
          <div className="muted">Заблокировать человека можно в меню «⋯» на его странице или в чате</div>
        </div>
      )}
      {blocked.length > 0 && visible.length === 0 && <div className="empty">Ничего не найдено</div>}
    </div>
  );
}
