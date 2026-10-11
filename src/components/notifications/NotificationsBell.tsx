import { useState } from "react";
import NotificationItem from "./NotificationItem";
import { groupNotifications } from "./describe";
import { BellIcon } from "../Icons";
import { useNotifications } from "../../context/NotificationsContext";
import { useDropdown } from "../../hooks";
import type { Navigate } from "../../types";

const PREVIEW = 8;

export default function NotificationsBell({
  onNavigate,
}: {
  onNavigate: Navigate;
}) {
  const { notifications, unread, status, markAllRead } = useNotifications();
  const menu = useDropdown();
  const [fresh, setFresh] = useState<Set<number>>(() => new Set());
  const groups = groupNotifications(notifications).slice(0, PREVIEW);

  const toggle = () => {
    if (!menu.open) {
      setFresh(
        new Set(notifications.filter((n) => !n.readAt).map((n) => n.id)),
      );
      markAllRead();
    }
    menu.toggle();
  };

  const go = (href: string) => {
    menu.close();
    onNavigate(href.slice(1));
  };

  return (
    <div className="notif-bell" ref={menu.ref}>
      <button
        className={`icon-btn ${menu.open ? "icon-btn--active" : ""}`}
        title="Уведомления"
        onClick={toggle}
      >
        <BellIcon size={28} />
        {unread > 0 && (
          <span className="badge">{unread > 99 ? "99+" : unread}</span>
        )}
      </button>
      {menu.open && (
        <div className="dropdown notif-panel">
          <div className="notif-panel__head">Уведомления</div>
          <div className="notif-panel__list">
            {status === "loading" ? (
              <div className="notif-panel__empty">
                <div className="chat-status__spinner" />
              </div>
            ) : groups.length ? (
              groups.map((g) => (
                <NotificationItem
                  key={g.key}
                  group={g}
                  unread={g.items.some((n) => fresh.has(n.id))}
                  onOpen={go}
                />
              ))
            ) : (
              <div className="notif-panel__empty">
                <BellIcon size={40} />
                Здесь будут лайки, комментарии, заявки в друзья и приглашения
              </div>
            )}
          </div>
          <button
            className="notif-panel__all"
            onClick={() => go("#notifications")}
          >
            Показать все
          </button>
        </div>
      )}
    </div>
  );
}
