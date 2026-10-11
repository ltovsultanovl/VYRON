import {
  BookmarkIcon,
  FriendsIcon,
  GroupsIcon,
  MessageIcon,
  MusicIcon,
  NewsIcon,
  PhotoIcon,
  UserIcon,
  VideoIcon,
  type Icon,
} from "./Icons";
import type { Navigate } from "../types";

export interface MenuItem {
  view?: string;
  Icon: Icon;
  label: string;
}

export const NAV_GROUPS: MenuItem[][] = [
  [
    { view: "profile", Icon: UserIcon, label: "Профиль" },
    { view: "feed", Icon: NewsIcon, label: "Лента" },
    { view: "messages", Icon: MessageIcon, label: "Мессенджер" },
    { view: "friends", Icon: FriendsIcon, label: "Друзья" },
    { view: "communities", Icon: GroupsIcon, label: "Сообщества" },
    { view: "photos", Icon: PhotoIcon, label: "Фото" },
    { view: "music", Icon: MusicIcon, label: "Музыка" },
    { view: "video", Icon: VideoIcon, label: "Видео" },
  ],
  [
    { view: "bookmarks", Icon: BookmarkIcon, label: "Закладки" },
  ],
];

// counters — числа у пунктов по их view: { messages: 3, friends: 1 }
// Подразделы подсвечивают свой раздел: редактирование — профиль, сообщество — «Сообщества»
export const activeSection = (view: string) =>
  ({ edit: "profile", club: "communities" } as Record<string, string>)[view] ?? view;

export default function Sidebar({
  view,
  onNavigate,
  counters = {},
}: {
  view: string;
  onNavigate: Navigate;
  counters?: Record<string, number>;
}) {
  // Редактирование профиля — подраздел профиля
  const activeView = activeSection(view);

  const renderItem = ({ view: target, Icon, label }: MenuItem) => {
    const value = target ? counters[target] : 0;
    return (
      <a
        key={label}
        href="#"
        className={`nav-item ${target && target === activeView ? "active" : ""}`}
        onClick={(e) => {
          e.preventDefault();
          if (target) onNavigate(target);
        }}
      >
        <span className="nav-item__icon">
          <Icon size={24} />
        </span>
        <span className="nav-item__label">{label}</span>
        {value > 0 && <span className="counter">{value}</span>}
      </a>
    );
  };

  return (
    <nav className="sidebar">
      {NAV_GROUPS.map((items, i) => (
        <div key={i}>
          {i > 0 && <div className="separator" />}
          {items.map(renderItem)}
        </div>
      ))}
    </nav>
  );
}
