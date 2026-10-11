import { useState } from "react";
import type { Community } from "../types";
import { useCommunities } from "../context/CommunitiesContext";
import { useDropdown } from "../hooks";
import { ChevronDownIcon } from "./Icons";

export default function CommunityJoinButton({
  community,
  className = "",
}: {
  community: Pick<Community, "id" | "name" | "isPage" | "access">;
  className?: string;
}) {
  const { statusIn, roleIn, join, leave } = useCommunities();
  const menu = useDropdown();
  const [busy, setBusy] = useState(false);
  const status = statusIn(community.id);
  const role = roleIn(community.id);

  const act = (fn: (c: typeof community) => Promise<unknown>) => async () => {
    menu.close();
    setBusy(true);
    await fn(community);
    setBusy(false);
  };

  if (role === "owner") return null;

  if (status === "invited") {
    return (
      <span className={`friend-actions ${className}`}>
        <button className="btn" onClick={act(join)} disabled={busy}>
          Принять приглашение
        </button>
        <button
          className="btn btn--neutral"
          onClick={act(leave)}
          disabled={busy}
        >
          Отклонить
        </button>
      </span>
    );
  }

  if (status === "none") {
    const label = community.isPage
      ? "Подписаться"
      : community.access === "closed"
        ? "Подать заявку"
        : "Вступить в группу";
    if (community.access === "private") return null;
    return (
      <button
        className={`btn ${className}`}
        onClick={act(join)}
        disabled={busy}
      >
        {label}
      </button>
    );
  }

  const label =
    status === "requested"
      ? "Заявка отправлена"
      : community.isPage
        ? "Вы подписаны"
        : "Вы участник";
  const leaveLabel =
    status === "requested"
      ? "Отменить заявку"
      : community.isPage
        ? "Отписаться"
        : "Выйти из группы";
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
          <button
            className="dropdown__item dropdown__item--danger"
            onClick={act(leave)}
          >
            {leaveLabel}
          </button>
        </div>
      )}
    </div>
  );
}
