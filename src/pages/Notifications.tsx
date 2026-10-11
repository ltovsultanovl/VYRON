import { useEffect, useMemo, useState } from "react";
import SideMenu from "../components/SideMenu";
import NotificationItem from "../components/notifications/NotificationItem";
import { FILTERS, groupNotifications, type NotificationFilter } from "../components/notifications/describe";
import { Failed, Loading } from "../components/ListStates";
import { BellIcon } from "../components/Icons";
import { useNotifications } from "../context/NotificationsContext";
import type { Navigate } from "../types";

const TABS: { id: NotificationFilter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "replies", label: "Ответы" },
  { id: "likes", label: "Отметки «Нравится»" },
  { id: "friends", label: "Друзья" },
  { id: "communities", label: "Сообщества" },
];

export default function Notifications({ onNavigate }: { onNavigate: Navigate }) {
  const { notifications, status, error, reload, markAllRead, hide } = useNotifications();
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [fresh] = useState(() => new Set(notifications.filter((n) => !n.readAt).map((n) => n.id)));

  useEffect(() => {
    markAllRead();
  }, [markAllRead, notifications.length]);

  const groups = useMemo(
    () => groupNotifications(notifications.filter((n) => FILTERS[filter](n.type))),
    [notifications, filter],
  );

  return (
    <div className="columns">
      <section className="card notif-page">
        <div className="card__header">
          Уведомления <span className="muted">{groups.length || ""}</span>
        </div>
        {status === "loading" ? (
          <Loading />
        ) : status === "error" ? (
          <Failed error={error} onRetry={reload} />
        ) : groups.length ? (
          groups.map((g) => (
            <NotificationItem
              key={g.key}
              group={g}
              unread={g.items.some((n) => fresh.has(n.id))}
              onOpen={(href) => onNavigate(href.slice(1))}
              onHide={() => g.items.forEach(hide)}
            />
          ))
        ) : (
          <div className="media__empty">
            <BellIcon size={40} />
            {filter === "all" ? "Новых событий пока нет" : "В этом разделе пока ничего нет"}
          </div>
        )}
      </section>

      <aside className="columns__side">
        <SideMenu items={TABS.map((t) => ({ label: t.label, active: filter === t.id, onClick: () => setFilter(t.id) }))} />
      </aside>
    </div>
  );
}
