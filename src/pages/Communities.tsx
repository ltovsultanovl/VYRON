import { useEffect, useState } from "react";
import Avatar from "../components/Avatar";
import SideMenu from "../components/SideMenu";
import CommunityJoinButton from "../components/CommunityJoinButton";
import CreateCommunityModal from "../components/CreateCommunityModal";
import { CloseIcon, PlusIcon, SearchIcon } from "../components/Icons";
import { useCommunities } from "../context/CommunitiesContext";
import { useResource } from "../resources";
import { searchCommunities } from "../api";
import { useDebounced } from "../hooks";
import type { Community, Navigate } from "../types";
import { leaderLabel } from "../components/communityRoles";


export const communityKindLabel = (c: Pick<Community, "isPage" | "access" | "category">) =>
  [
    c.isPage
      ? "Публичная страница"
      : {
          open: "Открытая группа",
          closed: "Закрытая группа",
          private: "Частная группа",
        }[c.access],
    c.category,
  ]
    .filter(Boolean)
    .join(" · ");

function Highlight({ text, query }: { text: string; query: string }) {
  const i = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="search-mark">{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}

function CommunityRow({ community, note, query = "" }: { community: Community; note?: string; query?: string }) {
  return (
    <div className="friend community-row">
      <a href={`#club/${community.id}`}>
        <Avatar
          name={community.name}
          color={community.color}
          src={community.avatar}
          size={64}
          empty={false}
        />
      </a>
      <div className="friend__info">
        <a href={`#club/${community.id}`} className="friend__name">
          <Highlight text={community.name} query={query} />
        </a>
        <div className="friend__city">
          {note ?? communityKindLabel(community)}
        </div>
        {community.status && (
          <div className="community-row__status">{community.status}</div>
        )}
      </div>
      <CommunityJoinButton community={community} className="friend__button" />
    </div>
  );
}


const matches = (c: Community, q: string) =>
  [c.name, c.category, c.status].some((field) =>
    field?.toLowerCase().includes(q.toLowerCase()),
  );

function Spinner() {
  return (
    <div className="list-state" role="status">
      <div className="chat-status__spinner" />
    </div>
  );
}

function SearchResults({ query, mine, onlyGlobal }: { query: string; mine: Community[]; onlyGlobal: boolean }) {
  const q = useDebounced(query.trim(), 300);
  const results = useResource(() => searchCommunities(q), [q]);
  const mineIds = new Set(mine.map((c) => c.id));
  const own = onlyGlobal || !q ? [] : mine.filter((c) => matches(c, q));
  const others = (results.data ?? []).filter(
    (c) => onlyGlobal || !mineIds.has(c.id),
  );

  return (
    <>
      {own.length > 0 && (
        <>
          <div className="friends-group">
            Мои сообщества <span className="muted">{own.length}</span>
          </div>
          {own.map((c) => (
            <CommunityRow key={c.id} community={c} query={q} />
          ))}
        </>
      )}
      {!(own.length && results.data && !others.length) && (
        <>
          <div className="friends-group">
            {q
              ? onlyGlobal
                ? "Результаты поиска"
                : "Другие сообщества"
              : "Новые сообщества"}{" "}
            {results.data && q && (
              <span className="muted">{others.length}</span>
            )}
          </div>
          {results.loading && !results.data ? (
            <Spinner />
          ) : results.error ? (
            <div className="list-state" role="alert">
              {results.error}
              <button className="btn" onClick={results.reload}>
                Повторить
              </button>
            </div>
          ) : others.length ? (
            others.map((c) => (
              <CommunityRow key={c.id} community={c} query={q} />
            ))
          ) : (
            <div className="empty empty--compact">
              {q
                ? `По запросу «${q}» ничего не нашлось`
                : "Сообществ пока нет — создайте первое!"}
            </div>
          )}
        </>
      )}
    </>
  );
}

export default function Communities({
  section,
  query: initialQuery,
  onNavigate,
}: {
  section: string;
  query: string;
  onNavigate: Navigate;
}) {
  const { joined, managed, invitations, status, error, reload } =
    useCommunities();
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState(initialQuery ?? "");
  const current = ["manage", "search"].includes(section) ? section : "all";

  useEffect(() => {
    if (initialQuery) setQuery(initialQuery);
  }, [initialQuery]);

  const TABS: { id: string; path: string; label: string; counter?: number }[] = [
    {
      id: "all",
      path: "communities",
      label: "Мои сообщества",
      counter: joined.length,
    },
    {
      id: "manage",
      path: "communities/manage",
      label: "Управление",
      counter: managed.length,
    },
    { id: "search", path: "communities/search", label: "Поиск сообществ" },
  ];

  const searching = current === "search" || query.trim().length > 0;
  const placeholder =
    current === "manage"
      ? "Поиск по управляемым сообществам"
      : "Поиск сообществ";

  let content;
  if (status === "loading" && !searching) content = <Spinner />;
  else if (status === "error" && !searching) {
    content = (
      <div className="list-state" role="alert">
        {error}
        <button className="btn" onClick={reload}>
          Повторить
        </button>
      </div>
    );
  } else if (current === "manage") {
    const q = query.trim();
    const list = q ? managed.filter((m) => matches(m.community, q)) : managed;
    content = list.length ? (
      list.map((m) => (
        <CommunityRow
          key={m.community.id}
          community={m.community}
          note={leaderLabel(m.role)}
          query={q}
        />
      ))
    ) : (
      <div className="empty">
        {q
          ? `Среди управляемых сообществ нет «${q}»`
          : "Вы пока ничем не управляете. Создайте своё сообщество — кнопка «Создать» вверху"}
      </div>
    );
  } else if (searching) {
    content = (
      <SearchResults
        query={query}
        mine={joined}
        onlyGlobal={current === "search"}
      />
    );
  } else {
    content = (
      <>
        {invitations.length > 0 && (
          <>
            <div className="friends-group">Приглашения</div>
            {invitations.map((c) => (
              <CommunityRow key={c.id} community={c} />
            ))}
            <div className="friends-group">Сообщества</div>
          </>
        )}
        {joined.length ? (
          joined.map((c) => <CommunityRow key={c.id} community={c} />)
        ) : (
          <div className="empty">
            Вы пока не состоите в сообществах.{" "}
            <a className="link" href="#communities/search">
              Найти интересные
            </a>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="columns">
      <div className="card">
        <div className="wall-head communities-head">
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
          <button
            className="btn communities-head__create"
            onClick={() => setCreating(true)}
          >
            <PlusIcon size={18} /> Создать
          </button>
        </div>

        <div className="friends-search">
          <label className="search">
            <SearchIcon size={16} />
            <input
              type="search"
              placeholder={placeholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setQuery("")}
              autoFocus={current === "search"}
            />
            {query && (
              <button
                type="button"
                className="search__clear"
                title="Очистить"
                onClick={() => setQuery("")}
              >
                <CloseIcon size={16} />
              </button>
            )}
          </label>
        </div>

        {content}
      </div>

      <aside className="columns__side">
        <SideMenu
          items={TABS.map((t) => ({
            label: t.label,
            active: current === t.id,
            counter: t.id === "all" ? invitations.length : 0,
            accent: true,
            onClick: () => onNavigate(t.path),
          }))}
        />
      </aside>

      {creating && (
        <CreateCommunityModal
          onClose={() => setCreating(false)}
          onCreated={(c) => {
            setCreating(false);
            onNavigate(`club/${c.id}`);
          }}
        />
      )}
    </div>
  );
}
