import type { AppNotification, Gender, NotificationType } from "../../types";
import { plural } from "../../utils";

// Группа одинаковых уведомлений: «Анна и ещё 2 человека оценили вашу запись»
export interface NotificationGroup {
  key: string;
  type: NotificationType;
  items: AppNotification[]; // от новых к старым
  latest: AppNotification;
}

const LIKES: NotificationType[] = ["post_like", "photo_like", "video_like"];

// Лайки одного и того же объекта собираем в одну строку, остальное — по одному
export function groupNotifications(list: AppNotification[]): NotificationGroup[] {
  const groups = new Map<string, NotificationGroup>();
  for (const n of list) {
    const object = n.post?.id ?? n.photo?.id ?? n.video?.id;
    const key = LIKES.includes(n.type) && object ? `${n.type}:${object}` : `one:${n.id}`;
    const group = groups.get(key);
    if (group) group.items.push(n);
    else groups.set(key, { key, type: n.type, items: [n], latest: n });
  }
  return [...groups.values()];
}

// Глагол по полу: «оценил» / «оценила»; во множественном числе — «оценили»
const verb = (gender: Gender | undefined, many: boolean, [male, female, plural_]: [string, string, string]) =>
  many ? plural_ : gender === "female" ? female : male;

const VERBS: Record<NotificationType, [string, string, string]> = {
  post_like: ["оценил", "оценила", "оценили"],
  photo_like: ["оценил", "оценила", "оценили"],
  video_like: ["оценил", "оценила", "оценили"],
  post_comment: ["прокомментировал", "прокомментировала", "прокомментировали"],
  photo_comment: ["прокомментировал", "прокомментировала", "прокомментировали"],
  video_comment: ["прокомментировал", "прокомментировала", "прокомментировали"],
  wall_post: ["написал", "написала", "написали"],
  friend_request: ["хочет", "хочет", "хотят"],
  friend_accepted: ["принял", "приняла", "приняли"],
  community_invite: ["приглашает", "приглашает", "приглашают"],
  community_accepted: ["", "", ""],
  post_approved: ["", "", ""],
  mention: ["упомянул", "упомянула", "упомянули"],
  comment_reply: ["ответил", "ответила", "ответили"],
};

const WHAT: Partial<Record<NotificationType, string>> = {
  post_like: "вашу запись",
  post_comment: "вашу запись",
  photo_like: "вашу фотографию",
  photo_comment: "вашу фотографию",
  video_like: "ваше видео",
  video_comment: "ваше видео",
};

// Текст после имени: «оценила вашу запись», «и ещё 2 человека оценили вашу фотографию»
export function describe(group: NotificationGroup): { others: string; action: string } {
  const { type, items, latest } = group;
  const many = items.length > 1;
  const others = many ? ` и ещё ${items.length - 1} ${plural(items.length - 1, ["человек", "человека", "человек"])}` : "";
  const v = verb(latest.actor?.gender, many, VERBS[type]);
  const community = latest.community ? `«${latest.community.name}»` : "сообщество";

  switch (type) {
    case "wall_post":
      return { others, action: `${v} на вашей стене` };
    case "friend_request":
      return { others, action: `${v} добавить вас в друзья` };
    case "friend_accepted":
      return { others, action: `${v} вашу заявку в друзья` };
    case "community_invite":
      return { others, action: `${v} вас в ${community}` };
    case "community_accepted":
      return { others: "", action: `Ваша заявка в ${community} одобрена` };
    case "post_approved":
      return { others: "", action: `Ваша новость опубликована в ${community}` };
    case "comment_reply":
      return { others, action: `${v} на ваш комментарий` };
    case "mention":
      return {
        others,
        action: `${v} вас в комментарии ${latest.photo ? "к фотографии" : latest.video ? "к видео" : "к записи"}`,
      };
    default:
      return { others, action: `${v} ${WHAT[type] ?? ""}` };
  }
}

// Короткий текст для всплывашки о новом уведомлении
export function summary(n: AppNotification): string {
  const { action } = describe({ key: "", type: n.type, items: [n], latest: n });
  if (n.type === "community_accepted" || n.type === "post_approved") return action;
  return `${n.actor?.name ?? "Кто-то"} ${action}`;
}

// Куда ведёт клик по уведомлению
export function target(n: AppNotification, myId: string): string {
  if (n.post) {
    if (n.post.communityId) return `#club/${n.post.communityId}`;
    return n.post.ownerId === myId ? "#profile" : `#user/${n.post.ownerId}`;
  }
  if (n.photo) return n.photo.ownerId === myId ? "#photos" : `#photos/${n.photo.ownerId}`;
  if (n.video) return `#video/${n.video.id}`;
  if (n.community) return `#club/${n.community.id}`;
  if (n.actor) return `#user/${n.actor.id}`;
  return "#notifications";
}

// Фильтры страницы уведомлений
export type NotificationFilter = "all" | "replies" | "likes" | "friends" | "communities";

export const FILTERS: Record<NotificationFilter, (t: NotificationType) => boolean> = {
  all: () => true,
  replies: (t) =>
    t === "post_comment" || t === "photo_comment" || t === "video_comment" || t === "wall_post" || t === "mention" || t === "comment_reply",
  likes: (t) => LIKES.includes(t),
  friends: (t) => t === "friend_request" || t === "friend_accepted",
  communities: (t) => t === "community_invite" || t === "community_accepted" || t === "post_approved",
};
