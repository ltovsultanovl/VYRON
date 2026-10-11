// Типы данных приложения — то, с чем работают компоненты (после перевода из колонок базы в api.ts)

// ---------- Люди ----------

export type Gender = "male" | "female";
export type BirthVisibility = "show" | "month" | "hide";

export interface Contacts {
  country: string;
  city: string;
  phone: string;
  phone2: string;
  site: string;
}

export interface Interests {
  activities: string;
  interests: string;
  music: string;
  movies: string;
  books: string;
  games: string;
  quotes: string;
  about: string;
}

export interface Education {
  university: string;
  faculty: string;
  graduation: string;
  school: string;
}

export interface Career {
  company: string;
  city: string;
  position: string;
  from: string;
  to: string;
}

// Поля «Редактировать профиль» (в базе — profiles.info)
export interface ProfileInfo {
  gender: Gender;
  relation: string;
  birthDay: string;
  birthMonth: string;
  birthYear: string;
  birthVisibility: BirthVisibility;
  hometown: string;
  languages: string;
  contacts: Contacts;
  interests: Interests;
  education: Education;
  career: Career;
}

// Полный профиль — страница пользователя и редактирование
export interface Profile extends ProfileInfo {
  id: string;
  firstName: string;
  lastName: string;
  color: string;
  status: string;
  avatar: string | null;
  cover: string | null;
  createdAt: string;
}

// Кратко о человеке — аватары, списки, авторы постов
export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  color: string;
  avatar: string | null;
  city: string;
  gender?: Gender; // для «оценил / оценила» в уведомлениях
  online?: boolean;
}

export type FriendStatus = "friend" | "outgoing" | "incoming";
export type Relation = FriendStatus | "none" | "me";

export interface Friendship {
  person: Person;
  status: FriendStatus;
  createdAt: string;
}

// ---------- Сообщества ----------

export type CommunityKind = "group" | "page";
export type CommunityAccess = "open" | "closed" | "private";
export type CommunityWall = "open" | "limited";
export type CommunityRole = "owner" | "admin" | "editor" | "member";
export type MemberStatus = "member" | "requested" | "invited";

export interface CommunityBrief {
  id: number;
  name: string;
  kind: CommunityKind;
  color: string;
  avatar: string | null;
  isPage: boolean;
}

export interface Community extends CommunityBrief {
  access: CommunityAccess;
  wall: CommunityWall;
  category: string;
  status: string;
  description: string;
  website: string;
  city: string;
  cover: string | null;
  messagesEnabled: boolean;
  createdBy: string;
  createdAt: string;
}

export interface Membership {
  role: CommunityRole;
  status: MemberStatus;
}

// Страница сообщества: само сообщество, моё место в нём и число участников
export interface CommunityDetails extends Community {
  membership: Membership | null;
  membersCount: number | null;
}

export interface MyCommunity {
  community: Community;
  role: CommunityRole;
  status: MemberStatus;
}

export interface CommunityMember {
  person: Person;
  role: CommunityRole;
  status: MemberStatus;
  since: string;
}

// Строка community_messages (+ сообщество или собеседник, если подгружены)
export interface CommunityMessageRow {
  id: number | string; // временные (ещё не отправленные) — строка tmp-…
  community_id: number;
  user_id: string;
  author_id?: string;
  from_community: boolean;
  text: string;
  created_at: string;
  read_at: string | null;
  community?: CommunityBrief | null;
  user?: Person | null;
  pending?: boolean;
  failed?: boolean;
}

// ---------- Посты, комментарии ----------

export interface Comment {
  id: number;
  text: string;
  createdAt: string;
  author: Person;
}

export interface Post {
  id: number;
  text: string;
  image: string | null;
  pinned: boolean;
  createdAt: string;
  ownerId: string | null;
  communityId: number | null;
  community: CommunityBrief | null;
  asCommunity: boolean;
  suggested: boolean;
  author: Person;
  owner: Person | null;
  likes: number;
  liked: boolean;
  comments: Comment[];
}

// ---------- Фото ----------

export interface Photo {
  id: number;
  src: string;
  path: string;
  ownerId: string;
  albumId: number | null;
  createdAt: string;
  likes: number;
  liked: boolean;
  comments: Comment[];
  readOnly?: boolean; // старый аватар без записи в «Фото»
}

// Фото для карточки «Поделиться»
export interface SharedPhoto {
  id: number;
  src: string;
  createdAt: string;
  owner: Person | null;
}

export type AlbumPrivacy = "all" | "friends" | "me";

export interface Album {
  id: number;
  ownerId: string;
  title: string;
  description: string;
  privacy: AlbumPrivacy;
  coverPhotoId: number | null;
  createdAt: string;
}

// ---------- Музыка ----------

export interface Track {
  id: number;
  uploaderId: string;
  artist: string;
  title: string;
  duration: number;
  url: string;
  path: string;
  createdAt: string;
  removed?: boolean;
}

export interface Playlist {
  id: number;
  ownerId: string;
  owner: Person | null;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  tracks: Track[];
}

// ---------- Видео ----------

export interface Video {
  id: number;
  ownerId: string;
  owner: Person | null;
  title: string;
  description: string;
  duration: number;
  width: number | null;
  height: number | null;
  url: string;
  path: string;
  poster: string | null;
  posterPath: string | null;
  views: number;
  createdAt: string;
  likes: number;
  liked: boolean;
  commentsCount: number;
}

// ---------- Сообщения ----------

export type AttachmentType = "image" | "video" | "audio" | "voice";
export type SharedType = "post" | "photo" | "profile" | "community" | "audio" | "playlist" | "video";

export interface Shared {
  type: SharedType;
  id: string | number;
}

// Голосовое: длительность и волна для отрисовки
export interface VoiceMeta {
  duration?: number;
  waveform?: number[];
}

// Строка messages в том виде, как её хранит чат (+ поля временного сообщения)
export interface MessageRow {
  id: number | string;
  sender_id: string;
  recipient_id: string;
  text: string;
  created_at: string;
  read_at: string | null;
  attachment_path?: string | null;
  attachment_type?: AttachmentType | null;
  attachment_name?: string | null;
  attachment_meta?: VoiceMeta | null;
  shared_type?: SharedType | null;
  shared_id?: string | null;
  hidden_by_sender?: boolean;
  hidden_by_recipient?: boolean;
  listened_at?: string | null; // голосовое прослушано получателем
  // Только на клиенте
  pending?: boolean;
  failed?: boolean;
  localUrl?: string | null;
  file?: File | null;
  community_id?: number;
}

export interface VoiceRecording {
  blob: Blob;
  duration: number;
  waveform: number[];
}

// Собеседник в мессенджере: человек или сообщество (тогда id — "club:<id>")
export interface ChatPeer {
  id: string;
  name: string;
  firstName?: string;
  color: string;
  avatar: string | null;
  online: boolean;
  gender?: Gender; // «был» / «была» недавно
  isCommunity?: boolean;
  communityId?: number;
}

export interface Dialog {
  person: ChatPeer;
  messages: MessageRow[];
  last: MessageRow | null;
  unread: number;
  typing: boolean;
  isCommunity?: boolean;
  pinned: boolean;
  archived: boolean;
  markedUnread: boolean;
}

export interface SendOptions {
  text?: string;
  file?: File | null;
  voice?: VoiceMeta | null;
  shared?: Shared | null;
}

// ---------- Уведомления ----------

export type NotificationType =
  | "post_like"
  | "post_comment"
  | "wall_post"
  | "post_approved"
  | "photo_like"
  | "photo_comment"
  | "video_like"
  | "video_comment"
  | "friend_request"
  | "friend_accepted"
  | "community_invite"
  | "community_accepted";

export interface AppNotification {
  id: number;
  type: NotificationType;
  text: string; // начало комментария или записи
  createdAt: string;
  readAt: string | null;
  actor: Person | null;
  post: { id: number; text: string; image: string | null; ownerId: string | null; communityId: number | null } | null;
  photo: { id: number; src: string; ownerId: string } | null;
  video: { id: number; title: string; poster: string | null } | null;
  community: CommunityBrief | null;
}

// ---------- Общее ----------

// Состояние загрузки «по просьбе» (useResource)
export interface ResourceState<T> {
  data: T | null;
  loading: boolean;
  error: string;
}

export type SnackbarKind = "info" | "error";

// Переход по разделам: onNavigate("friends/requests") → #friends/requests
export type Navigate = (path: string) => void;
