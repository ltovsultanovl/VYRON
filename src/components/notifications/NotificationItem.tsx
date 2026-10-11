import { useState, type MouseEvent } from "react";
import Avatar from "../Avatar";
import {
  CheckIcon,
  CloseIcon,
  CommentIcon,
  FriendsIcon,
  GroupsIcon,
  LikeIcon,
  PencilIcon,
  type Icon,
} from "../Icons";
import { useFriends } from "../../context/FriendsContext";
import { useCommunities } from "../../context/CommunitiesContext";
import { useProfile } from "../../context/ProfileContext";
import { bg } from "../../data";
import { formatDate } from "../../utils";
import type { NotificationType } from "../../types";
import { describe, target, type NotificationGroup } from "./describe";

const BADGES: Record<NotificationType, { Icon: Icon; tone: string }> = {
  post_like: { Icon: LikeIcon, tone: "like" },
  photo_like: { Icon: LikeIcon, tone: "like" },
  video_like: { Icon: LikeIcon, tone: "like" },
  post_comment: { Icon: CommentIcon, tone: "comment" },
  photo_comment: { Icon: CommentIcon, tone: "comment" },
  video_comment: { Icon: CommentIcon, tone: "comment" },
  wall_post: { Icon: PencilIcon, tone: "comment" },
  mention: { Icon: CommentIcon, tone: "comment" },
  comment_reply: { Icon: CommentIcon, tone: "comment" },
  friend_request: { Icon: FriendsIcon, tone: "friend" },
  friend_accepted: { Icon: FriendsIcon, tone: "friend" },
  community_invite: { Icon: GroupsIcon, tone: "community" },
  community_accepted: { Icon: CheckIcon, tone: "friend" },
  post_approved: { Icon: CheckIcon, tone: "friend" },
};

function InlineActions({ group }: { group: NotificationGroup }) {
  const { relationTo, accept, decline } = useFriends();
  const { statusIn, join, leave } = useCommunities();
  const [busy, setBusy] = useState(false);
  const n = group.latest;

  const run = (fn: () => Promise<unknown>) => async (e: MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    await fn();
    setBusy(false);
  };

  if (n.type === "friend_request" && n.actor) {
    const actor = n.actor;
    const relation = relationTo(actor.id);
    if (relation === "friend")
      return <div className="notif__done">Вы теперь друзья</div>;
    if (relation !== "incoming") return null;
    return (
      <div className="notif__actions">
        <button
          className="btn"
          disabled={busy}
          onClick={run(() => accept(actor))}
        >
          Добавить в друзья
        </button>
        <button
          className="btn btn--neutral"
          disabled={busy}
          onClick={run(() => decline(actor))}
        >
          Отклонить
        </button>
      </div>
    );
  }

  if (n.type === "community_invite" && n.community) {
    const community = n.community;
    const status = statusIn(community.id);
    if (status === "member")
      return <div className="notif__done">Вы в сообществе</div>;
    if (status !== "invited") return null;
    return (
      <div className="notif__actions">
        <button
          className="btn"
          disabled={busy}
          onClick={run(() => join(community))}
        >
          Принять
        </button>
        <button
          className="btn btn--neutral"
          disabled={busy}
          onClick={run(() => leave(community))}
        >
          Отклонить
        </button>
      </div>
    );
  }
  return null;
}

export default function NotificationItem({
  group,
  unread,
  onOpen,
  onHide,
}: {
  group: NotificationGroup;
  unread: boolean;
  onOpen: (href: string) => void;
  onHide?: () => void;
}) {
  const { myId } = useProfile();
  const n = group.latest;
  const { others, action } = describe(group);
  const badge = BADGES[n.type];
  const fromCommunity =
    n.type === "community_accepted" || n.type === "post_approved";
  const face =
    fromCommunity && n.community
      ? {
          name: n.community.name,
          color: n.community.color,
          avatar: n.community.avatar,
        }
      : n.actor;
  const preview = n.photo?.src ?? n.video?.poster ?? n.post?.image ?? null;
  const quote =
    n.type.endsWith("_comment") ||
    n.type === "wall_post" ||
    n.type === "mention"
      ? n.text
      : n.type === "comment_reply"
        ? n.text.replace(/^[^,]{1,100},\s*/, "")
        : "";
  const href = target(n, myId);

  return (
    <div
      className={`notif ${unread ? "notif--unread" : ""}`}
      role="link"
      tabIndex={0}
      onClick={() => onOpen(href)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(href)}
    >
      <span className="notif__face">
        {face ? (
          <Avatar
            name={face.name}
            color={face.color}
            src={face.avatar}
            size={48}
            empty={!fromCommunity}
          />
        ) : (
          <Avatar name="?" size={48} />
        )}
        <span className={`notif__badge notif__badge--${badge.tone}`}>
          <badge.Icon size={12} />
        </span>
      </span>

      <div className="notif__body">
        <div className="notif__text">
          {!fromCommunity && n.actor && (
            <a
              className="notif__name"
              href={`#user/${n.actor.id}`}
              onClick={(e) => e.stopPropagation()}
            >
              {n.actor.name}
            </a>
          )}
          {others}
          {!fromCommunity && " "}
          {action}
        </div>
        {quote && <div className="notif__quote">{quote}</div>}
        <div className="notif__time">{formatDate(n.createdAt)}</div>
        <InlineActions group={group} />
      </div>

      {preview && (
        <span
          className="notif__preview"
          style={{ background: bg(preview, "var(--field-bg)") }}
        />
      )}
      {onHide && (
        <button
          className="icon-btn icon-btn--sm notif__hide"
          title="Скрыть уведомление"
          onClick={(e) => {
            e.stopPropagation();
            onHide();
          }}
        >
          <CloseIcon size={16} />
        </button>
      )}
    </div>
  );
}
