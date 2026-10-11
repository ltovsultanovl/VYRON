import { useEffect, useState } from "react";
import MeAvatar from "./MeAvatar";
import { MessageIcon, MoreIcon, FriendsIcon, NewsIcon } from "./Icons";
import { NAV_GROUPS, activeSection } from "./Sidebar";
import { useScrollLock } from "../hooks";
import type { Navigate } from "../types";

function MoreSheet({
  active,
  counters,
  onNavigate,
  onClose,
}: {
  active: string;
  counters: Record<string, number>;
  onNavigate: Navigate;
  onClose: () => void;
}) {
  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="sheet-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Все разделы"
      >
        <div className="sheet__grip" />
        {NAV_GROUPS.map((items, i) => (
          <div key={i} className="sheet__group">
            {items.map(({ view, Icon, label }) => (
              <button
                key={label}
                className={`sheet__item ${view && view === active ? "active" : ""}`}
                disabled={!view}
                onClick={() => {
                  if (!view) return;
                  onClose();
                  onNavigate(view);
                }}
              >
                <Icon size={24} />
                <span>{label}</span>
                {!!view && counters[view] > 0 && (
                  <span className="counter">{counters[view]}</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MobileNav({
  view,
  counters,
  onNavigate,
}: {
  view: string;
  counters: Record<string, number>;
  onNavigate: Navigate;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const active = activeSection(view);
  const MAIN = [
    { view: "feed", label: "Лента", icon: <NewsIcon size={26} /> },
    { view: "friends", label: "Друзья", icon: <FriendsIcon size={26} /> },
    { view: "messages", label: "Мессенджер", icon: <MessageIcon size={26} /> },
    { view: "profile", label: "Профиль", icon: <MeAvatar size={26} /> },
  ];
  const inMain = MAIN.some((m) => m.view === active);
  const moreCount = Object.entries(counters)
    .filter(([key]) => !MAIN.some((m) => m.view === key))
    .reduce((sum, [, n]) => sum + n, 0);

  return (
    <>
      <nav className="mobile-nav" aria-label="Разделы">
        {MAIN.map((m) => (
          <button
            key={m.view}
            className={`mobile-nav__item ${active === m.view ? "active" : ""}`}
            onClick={() => onNavigate(m.view)}
          >
            <span className="mobile-nav__icon">
              {m.icon}
              {counters[m.view] > 0 && (
                <span className="badge">{counters[m.view]}</span>
              )}
            </span>
            {m.label}
          </button>
        ))}
        <button
          className={`mobile-nav__item ${!inMain ? "active" : ""}`}
          onClick={() => setMoreOpen(true)}
        >
          <span className="mobile-nav__icon">
            <MoreIcon size={26} />
            {moreCount > 0 && <span className="badge">{moreCount}</span>}
          </span>
          Ещё
        </button>
      </nav>
      {moreOpen && (
        <MoreSheet
          active={active}
          counters={counters}
          onNavigate={onNavigate}
          onClose={() => setMoreOpen(false)}
        />
      )}
    </>
  );
}
