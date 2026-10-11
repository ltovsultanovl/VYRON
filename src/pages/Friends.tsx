import { useState } from "react";
import Avatar from "../components/Avatar";
import FriendButton from "../components/FriendButton";
import SideMenu from "../components/SideMenu";
import { SearchIcon } from "../components/Icons";
import { useProfile } from "../context/ProfileContext";
import { useFriends } from "../context/FriendsContext";
import { useChatActions } from "../context/ChatContext";
import { useResource } from "../resources";
import { searchPeople } from "../api";
import { useDebounced } from "../hooks";
import type { Navigate, Person } from "../types";

const SEARCH_DELAY = 300;


function PersonRow({ person, onNavigate }: { person: Person; onNavigate: Navigate }) {
  const { myId } = useProfile();
  const { openChat } = useChatActions();

  return (
    <div className="friend">
      <a href={`#user/${person.id}`}>
        <Avatar
          name={person.name}
          color={person.color}
          src={person.avatar}
          size={80}
        />
      </a>
      <div className="friend__info">
        <a href={`#user/${person.id}`} className="friend__name">
          {person.name}
        </a>
        {person.city && <div className="friend__city">{person.city}</div>}
        {person.id !== myId && (
          <button
            className="friend__write"
            onClick={() => {
              openChat(person);
              onNavigate("messages");
            }}
          >
            Написать сообщение
          </button>
        )}
      </div>
      {person.id !== myId && (
        <FriendButton person={person} className="friend__button" />
      )}
    </div>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="friends-search">
      <label className="search">
        <SearchIcon size={16} />
        <input
          type="search"
          placeholder={placeholder}
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  );
}

function MyFriends({ onNavigate }: { onNavigate: Navigate }) {
  const { friends, status, error, reload } = useFriends();
  const [query, setQuery] = useState("");
  const list = friends.filter((p) =>
    p.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  if (status === "loading") return <Loading />;
  if (status === "error") return <Failed error={error} onRetry={reload} />;

  return (
    <>
      <SearchBox value={query} onChange={setQuery} placeholder="Поиск друзей" />
      {list.map((p) => (
        <PersonRow key={p.id} person={p} onNavigate={onNavigate} />
      ))}
      {!friends.length && (
        <div className="empty">
          У вас пока нет друзей.{" "}
          <a className="link" href="#friends/search">
            Найти знакомых
          </a>
        </div>
      )}
      {friends.length > 0 && !list.length && (
        <div className="empty">Никого не нашлось</div>
      )}
    </>
  );
}

function Requests({ onNavigate }: { onNavigate: Navigate }) {
  const { incoming, outgoing, status, error, reload } = useFriends();
  if (status === "loading") return <Loading />;
  if (status === "error") return <Failed error={error} onRetry={reload} />;

  return (
    <>
      <div className="friends-group">Входящие заявки</div>
      {incoming.length ? (
        incoming.map((p) => (
          <PersonRow key={p.id} person={p} onNavigate={onNavigate} />
        ))
      ) : (
        <div className="empty empty--compact">Новых заявок нет</div>
      )}
      <div className="friends-group">Отправленные заявки</div>
      {outgoing.length ? (
        outgoing.map((p) => (
          <PersonRow key={p.id} person={p} onNavigate={onNavigate} />
        ))
      ) : (
        <div className="empty empty--compact">
          Вы никому не отправляли заявок
        </div>
      )}
    </>
  );
}

function PeopleSearch({ initialQuery, onNavigate }: { initialQuery: string; onNavigate: Navigate }) {
  const { myId } = useProfile();
  const [query, setQuery] = useState(initialQuery);
  const q = useDebounced(query.trim(), SEARCH_DELAY);
  const results = useResource(() => searchPeople(q), [q]);
  const people = (results.data ?? []).filter((p) => p.id !== myId);

  return (
    <>
      <SearchBox
        value={query}
        onChange={setQuery}
        placeholder="Имя, фамилия или почта"
        autoFocus
      />
      {!q && <div className="friends-group">Все участники — сначала новые</div>}
      {results.loading && !results.data ? (
        <Loading />
      ) : results.error ? (
        <Failed error={results.error} onRetry={results.reload} />
      ) : people.length ? (
        people.map((p) => (
          <PersonRow key={p.id} person={p} onNavigate={onNavigate} />
        ))
      ) : (
        <div className="empty">
          {q.includes("@")
            ? "С такой почтой никого нет. Проверьте адрес — нужно совпадение целиком"
            : q
              ? "Никого не нашлось. Попробуйте имя или почту человека"
              : "Кроме вас, здесь пока никого нет. Второй аккаунт появится в списке, когда на нём впервые войдут и укажут имя"}
        </div>
      )}
    </>
  );
}

const Loading = () => (
  <div className="list-state" role="status">
    <div className="chat-status__spinner" />
  </div>
);

const Failed = ({ error, onRetry }: { error: string; onRetry: () => void }) => (
  <div className="list-state" role="alert">
    {error}
    <button className="btn" onClick={onRetry}>
      Повторить
    </button>
  </div>
);

export default function Friends({ section, query, onNavigate }: { section: string; query: string; onNavigate: Navigate }) {
  const { friends, incoming } = useFriends();
  const current = ["requests", "search"].includes(section) ? section : "all";

  const TABS: { id: string; path: string; label: string; counter?: number; accent?: boolean }[] = [
    {
      id: "all",
      path: "friends",
      label: "Мои друзья",
      counter: friends.length,
    },
    {
      id: "requests",
      path: "friends/requests",
      label: "Заявки в друзья",
      counter: incoming.length,
      accent: true,
    },
    { id: "search", path: "friends/search", label: "Поиск людей" },
  ];

  return (
    <div className="columns">
      <div className="card">
        <div className="wall-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`seg ${current === t.id ? "active" : ""}`}
              onClick={() => onNavigate(t.path)}
            >
              {t.label}{" "}
              {!!t.counter && <span className="muted">{t.counter}</span>}
            </button>
          ))}
        </div>

        {current === "all" && <MyFriends onNavigate={onNavigate} />}
        {current === "requests" && <Requests onNavigate={onNavigate} />}
        {current === "search" && (
          <PeopleSearch
            key={query}
            initialQuery={query}
            onNavigate={onNavigate}
          />
        )}
      </div>

      <aside className="columns__side">
        <SideMenu
          items={TABS.map((t) => ({
            label: t.label,
            counter: t.id === "requests" ? t.counter : 0,
            accent: t.accent,
            active: current === t.id,
            onClick: () => onNavigate(t.path),
          }))}
        />
      </aside>
    </div>
  );
}
