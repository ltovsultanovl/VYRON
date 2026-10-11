// Все запросы к Supabase в одном месте: компоненты работают с привычными
// объектами (profile, person, post, photo), а не с колонками базы
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { emptyProfileInfo } from "./data";
import { dataUrlToBlob, readImage } from "./utils";
import type {
  Album,
  AlbumPrivacy,
  AppNotification,
  AttachmentType,
  Comment,
  Community,
  CommunityAccess,
  CommunityBrief,
  CommunityDetails,
  CommunityKind,
  CommunityMember,
  CommunityMessageRow,
  CommunityRole,
  Friendship,
  MemberStatus,
  Membership,
  MyCommunity,
  NotificationType,
  Person,
  Photo,
  Playlist,
  Post,
  Profile,
  ProfileInfo,
  SharedPhoto,
  Track,
  Video,
} from "./types";

// ---------- Строки базы (то, что приходит из Supabase) ----------

interface PersonRow {
  id: string;
  first_name: string;
  last_name: string;
  color: string;
  avatar_url: string | null;
  info?: Partial<ProfileInfo> | null;
}

interface ProfileRow extends PersonRow {
  status: string | null;
  cover_url: string | null;
  created_at: string;
}

interface CommunityBriefRow {
  id: number;
  name: string;
  kind: CommunityKind;
  color: string;
  avatar_url: string | null;
}

interface CommunityRow extends CommunityBriefRow {
  access: CommunityAccess | null;
  wall: Community["wall"] | null;
  category: string | null;
  status: string | null;
  description: string | null;
  website: string | null;
  city: string | null;
  cover_url: string | null;
  messages_enabled: boolean | null;
  created_by: string;
  created_at: string;
}

interface CommentRow {
  id: number;
  text: string;
  created_at: string;
  author: PersonRow;
}

interface LikeRow {
  user_id: string;
}

interface PostRow {
  id: number;
  text: string;
  image_url: string | null;
  pinned: boolean;
  created_at: string;
  owner_id: string | null;
  community_id: number | null;
  as_community: boolean;
  suggested: boolean;
  author: PersonRow;
  community: CommunityBriefRow | null;
  owner: PersonRow | null;
  likes: LikeRow[];
  comments: CommentRow[];
}

interface PhotoRow {
  id: number;
  url: string;
  path: string;
  created_at: string;
  owner_id: string;
  album_id: number | null;
  likes: LikeRow[];
  comments: CommentRow[];
}

interface AlbumRow {
  id: number;
  owner_id: string;
  title: string;
  description: string | null;
  privacy: AlbumPrivacy;
  cover_photo_id: number | null;
  created_at: string;
}

interface AudioRow {
  id: number;
  uploader_id: string;
  artist: string | null;
  title: string;
  duration: number | null;
  url: string;
  path: string;
  created_at: string;
}

interface PlaylistRow {
  id: number;
  owner_id: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  owner: PersonRow | null;
  tracks: { added_at: string; audio: AudioRow | null }[] | null;
}

interface VideoRow {
  id: number;
  owner_id: string;
  title: string;
  description: string | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  url: string;
  path: string;
  poster_url: string | null;
  poster_path: string | null;
  views: number | null;
  created_at: string;
  owner: PersonRow | null;
  likes: LikeRow[] | null;
  comments: { count: number }[] | null;
}

interface SupabaseError {
  message?: string;
  code?: string;
}

// ---------- Ошибки ----------

// Понятный текст для частых ошибок Supabase
export const explainError = (error: unknown): string => {
  const err = error as SupabaseError | null | undefined;
  const text = err?.message ?? String(error);
  if (/fetch|network|Load failed/i.test(text)) return "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз";
  if (/email rate limit/i.test(text)) return "Лимит писем исчерпан: бесплатная почта Supabase отправляет лишь пару писем в час. Попробуйте позже";
  const wait = text.match(/after (\d+) seconds?/i);
  if (wait) return `Подождите ${wait[1]} с и попробуйте снова`;
  if (/rate limit|too many/i.test(text)) return "Слишком много попыток. Подождите немного и попробуйте снова";
  if (/invalid login credentials/i.test(text)) return "Неверная почта или пароль";
  if (/already registered|already been registered|user_already_exists/i.test(text)) return "Эта почта уже зарегистрирована — войдите или восстановите пароль";
  if (/email not confirmed/i.test(text)) return "Почта не подтверждена. Откройте ссылку из письма, которое пришло при регистрации";
  if (/password.*(at least|characters)|weak.?password/i.test(text)) return "Пароль слишком простой: минимум 8 символов, не из списка утёкших";
  if (/same.*password|different from the old/i.test(text)) return "Новый пароль должен отличаться от старого";
  if (/expired|invalid.*(token|otp)|token.*invalid/i.test(text)) return "Код неверный или устарел. Запросите новый";
  if (/find_profile_by_email/i.test(text)) return "Поиск по почте ещё не включён: выполните обновлённый supabase/schema.sql в SQL Editor";
  if (/Блокировка/.test(text)) return "Действие недоступно: пользователь в чёрном списке";
  if (/row-level security|permission denied/i.test(text)) return "Нет прав на это действие";
  if (/violates check constraint/i.test(text)) return "Некорректные данные — проверьте, что всё заполнено правильно";
  if (
    /Bucket not found|Could not find the function|column .* does not exist|in the schema cache/i.test(text) ||
    ["42703", "PGRST202", "PGRST204"].includes(err?.code ?? "")
  ) {
    return "База Supabase не обновлена: откройте SQL Editor, вставьте supabase/schema.sql целиком и нажмите Run";
  }
  if (/exceeded the maximum allowed size|too large/i.test(text)) return "Файл слишком большой";
  if (/mime type/i.test(text)) return "Такой формат не поддерживается. Можно: фото JPG, PNG, GIF, WEBP, видео MP4, MOV, WEBM и музыку MP3, M4A, OGG, WAV, FLAC";
  return text;
};

// Supabase возвращает { data, error } — превращаем ошибку в исключение.
// T — тип строк, которые мы запросили в select(...): supabase-js без схемы базы выводит его лишь приблизительно
const unwrap = <T = unknown>({ data, error }: { data?: unknown; error: unknown }): T => {
  if (error) throw error;
  return data as T;
};

// ---------- Вход по ссылке / коду из письма ----------

export const sendLoginEmail = (email: string) =>
  supabase.auth
    .signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } })
    .then(unwrap);

export const verifyLoginCode = (email: string, token: string) =>
  supabase.auth.verifyOtp({ email, token, type: "email" }).then(unwrap);

export const signOut = () => supabase.auth.signOut().then(unwrap);

// ---------- Вход по паролю ----------

const redirectTo = () => location.origin + location.pathname;

// Если в Supabase включено «Confirm email», сессии сразу не будет — нужно подтвердить почту
export const signUpWithPassword = async (email: string, password: string) => {
  const data = unwrap<{ user: User | null; session: Session | null }>(
    await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } }),
  );
  // Supabase не сообщает, что почта занята (защита от перебора): у такого «пользователя» нет identities
  if (data.user && !data.session && data.user.identities?.length === 0) {
    throw new Error("User already registered");
  }
  return { needsConfirmation: !data.session };
};

export const signInWithPassword = (email: string, password: string) =>
  supabase.auth.signInWithPassword({ email, password }).then(unwrap);

export const sendPasswordReset = (email: string) =>
  supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() }).then(unwrap);

export const setNewPassword = (password: string) => supabase.auth.updateUser({ password }).then(unwrap);

// ---------- Профили ----------

const PERSON_FIELDS = "id, first_name, last_name, color, avatar_url, info";
const PROFILE_FIELDS = "id, first_name, last_name, color, status, avatar_url, cover_url, info, created_at";
const INFO_KEYS = Object.keys(emptyProfileInfo) as (keyof ProfileInfo)[];

// Краткие данные о человеке — для аватаров, списков, постов
function toPerson(row: PersonRow): Person;
function toPerson(row: PersonRow | null | undefined): Person | null;
function toPerson(row: PersonRow | null | undefined): Person | null {
  if (!row) return null;
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    name: `${row.first_name} ${row.last_name}`.trim(),
    color: row.color,
    avatar: row.avatar_url,
    city: row.info?.contacts?.city ?? "",
    gender: row.info?.gender,
  };
}

// Полный профиль — для страницы пользователя и редактирования
const fromProfileRow = (row: ProfileRow | null): Profile | null => {
  if (!row) return null;
  const info: Partial<ProfileInfo> = row.info ?? {};
  return {
    ...emptyProfileInfo,
    ...info,
    contacts: { ...emptyProfileInfo.contacts, ...info.contacts },
    interests: { ...emptyProfileInfo.interests, ...info.interests },
    education: { ...emptyProfileInfo.education, ...info.education },
    career: { ...emptyProfileInfo.career, ...info.career },
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    color: row.color,
    status: row.status ?? "",
    avatar: row.avatar_url,
    cover: row.cover_url,
    createdAt: row.created_at,
  };
};

const toProfileRow = (p: Profile) => ({
  first_name: p.firstName,
  last_name: p.lastName,
  color: p.color,
  status: p.status,
  avatar_url: p.avatar,
  cover_url: p.cover,
  info: Object.fromEntries(INFO_KEYS.map((k) => [k, p[k]])),
  updated_at: new Date().toISOString(),
});

export const fetchProfile = async (id: string) =>
  fromProfileRow(
    unwrap(await supabase.from("profiles").select(PROFILE_FIELDS).eq("id", id).maybeSingle()),
  );

export const createProfile = async (
  id: string,
  { firstName, lastName, color }: { firstName: string; lastName: string; color: string },
) =>
  fromProfileRow(
    unwrap(
      await supabase
        .from("profiles")
        .insert({ id, first_name: firstName, last_name: lastName, color })
        .select(PROFILE_FIELDS)
        .single(),
    ),
  );

export const saveProfile = async (profile: Profile) =>
  unwrap(await supabase.from("profiles").update(toProfileRow(profile)).eq("id", profile.id));

export const fetchPeople = async (ids: string[]): Promise<Person[]> => {
  if (!ids.length) return [];
  return unwrap<PersonRow[]>(await supabase.from("profiles").select(PERSON_FIELDS).in("id", ids)).map((r) => toPerson(r));
};

// Поиск: по точной почте (если в запросе есть @), иначе по имени и фамилии;
// пустой запрос — недавно зарегистрированные
export const searchPeople = async (query: string): Promise<Person[]> => {
  if (query.includes("@")) {
    const rows = unwrap<PersonRow[]>(await supabase.rpc("find_profile_by_email", { p_email: query.trim() }));
    return rows.map((r) => toPerson(r));
  }
  let request = supabase.from("profiles").select(PERSON_FIELDS).order("created_at", { ascending: false }).limit(50);
  const words = query.trim().split(/\s+/).filter(Boolean).map((w) => w.replace(/[%_,()]/g, ""));
  for (const word of words) {
    request = request.or(`first_name.ilike.%${word}%,last_name.ilike.%${word}%`);
  }
  return unwrap<PersonRow[]>(await request).map((r) => toPerson(r));
};

// ---------- Картинки в Storage ----------

const BUCKET = "media";

// dataURL (после сжатия в readImage) → файл в папке пользователя → публичная ссылка
export const uploadImage = async (userId: string, dataUrl: string, folder: string) => {
  const blob = dataUrlToBlob(dataUrl);
  const path = `${userId}/${folder}/${crypto.randomUUID()}.jpg`;
  unwrap(
    await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: blob.type || "image/jpeg",
      cacheControl: "31536000",
    }),
  );
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
};

// Путь файла по его публичной ссылке (для удаления старого аватара/обложки)
const pathFromUrl = (url: string | null | undefined) => url?.split(`/object/public/${BUCKET}/`)[1] ?? null;

// Удаление файла — «по возможности»: если не вышло, остаётся только лишний файл в хранилище
export const removeImage = async (pathOrUrl: string | null | undefined) => {
  const path = pathOrUrl?.startsWith("http") ? pathFromUrl(pathOrUrl) : pathOrUrl;
  if (path) await supabase.storage.from(BUCKET).remove([path]);
};

// ---------- Сообщества ----------

const COMMUNITY_FIELDS =
  "id, name, kind, access, wall, category, status, description, website, city, color, avatar_url, cover_url, messages_enabled, created_by, created_at";

// Коротко — для постов, списков, чата
function toCommunityBrief(row: CommunityBriefRow): CommunityBrief;
function toCommunityBrief(row: CommunityBriefRow | null | undefined): CommunityBrief | null;
function toCommunityBrief(row: CommunityBriefRow | null | undefined): CommunityBrief | null {
  return row ? { id: row.id, name: row.name, kind: row.kind, color: row.color, avatar: row.avatar_url, isPage: row.kind === "page" } : null;
}

const toCommunity = (row: CommunityRow): Community => ({
    ...toCommunityBrief(row),
    access: row.access ?? "open",
    wall: row.wall ?? "limited",
    category: row.category ?? "",
    status: row.status ?? "",
    description: row.description ?? "",
    website: row.website ?? "",
    city: row.city ?? "",
    cover: row.cover_url,
    messagesEnabled: row.messages_enabled ?? true,
    createdBy: row.created_by,
    createdAt: row.created_at,
  });

const toCommunityRow = (c: Community) => ({
  name: c.name,
  access: c.access,
  wall: c.wall,
  category: c.category,
  status: c.status,
  description: c.description,
  website: c.website,
  city: c.city,
  color: c.color,
  avatar_url: c.avatar ?? null,
  cover_url: c.cover ?? null,
  messages_enabled: c.messagesEnabled,
});

const countMembers = async (communityId: number, status: MemberStatus = "member") => {
  const { count, error } = await supabase
    .from("community_members")
    .select("user_id", { count: "exact", head: true })
    .eq("community_id", communityId)
    .eq("status", status);
  if (error) throw error;
  return count ?? 0;
};

// Сообщество + моё место в нём ({ role, status } или null) + число участников
export const fetchCommunity = async (id: number | string, myId: string): Promise<CommunityDetails | null> => {
  const row = unwrap<CommunityRow | null>(await supabase.from("communities").select(COMMUNITY_FIELDS).eq("id", Number(id)).maybeSingle());
  if (!row) return null;
  const [mine, membersCount] = await Promise.all([
    supabase
      .from("community_members")
      .select("role, status")
      .eq("community_id", row.id)
      .eq("user_id", myId)
      .maybeSingle()
      .then((res) => unwrap<Membership | null>(res)),
    countMembers(row.id).catch(() => null), // у закрытой группы чужим число не видно
  ]);
  return { ...toCommunity(row), membership: mine, membersCount };
};

// Мои сообщества: где я участник, куда подал заявку, куда приглашён
export const fetchMyCommunities = async (myId: string): Promise<MyCommunity[]> =>
  unwrap<{ role: CommunityRole; status: MemberStatus; community: CommunityRow | null }[]>(
    await supabase
      .from("community_members")
      .select(`role, status, created_at, community:communities(${COMMUNITY_FIELDS})`)
      .eq("user_id", myId)
      .order("created_at", { ascending: false }),
  )
    .filter((r) => r.community)
    .map((r) => ({ community: toCommunity(r.community!), role: r.role, status: r.status }));

// Подписки другого человека (то, что видно мне по правилам доступа)
export const fetchUserCommunities = async (userId: string): Promise<CommunityBrief[]> =>
  unwrap<{ community: CommunityBriefRow | null }[]>(
    await supabase
      .from("community_members")
      .select(`community:communities(${COMMUNITY_BRIEF})`)
      .eq("user_id", userId)
      .eq("status", "member")
      .limit(50),
  )
    .filter((r) => r.community)
    .map((r) => toCommunityBrief(r.community!));

export const searchCommunities = async (query: string): Promise<Community[]> => {
  let request = supabase.from("communities").select(COMMUNITY_FIELDS).order("created_at", { ascending: false }).limit(50);
  const q = query.trim().replace(/[%_,()]/g, "");
  // Ищем по названию, тематике и статусу, как в VK
  if (q) request = request.or(`name.ilike.%${q}%,category.ilike.%${q}%,status.ilike.%${q}%`);
  return unwrap<CommunityRow[]>(await request).map(toCommunity);
};

export const createCommunity = async ({
  name,
  kind,
  access,
  category,
}: {
  name: string;
  kind: CommunityKind;
  access: CommunityAccess;
  category: string;
}) =>
  toCommunity(
    unwrap(
      await supabase
        .from("communities")
        .insert({ name, kind, access: kind === "page" ? "open" : access, category })
        .select(COMMUNITY_FIELDS)
        .single(),
    ),
  );

export const saveCommunity = async (community: Community) =>
  unwrap(await supabase.from("communities").update(toCommunityRow(community)).eq("id", community.id));

export const deleteCommunity = async (id: number) => unwrap(await supabase.from("communities").delete().eq("id", id));

// Участники (status: member | requested | invited) с профилями
export const fetchCommunityMembers = async (communityId: number, status: MemberStatus = "member"): Promise<CommunityMember[]> =>
  unwrap<{ role: CommunityRole; status: MemberStatus; created_at: string; user: PersonRow }[]>(
    await supabase
      .from("community_members")
      .select(`role, status, created_at, user:profiles!community_members_user_id_fkey(${PERSON_FIELDS})`)
      .eq("community_id", communityId)
      .eq("status", status)
      .order("created_at", { ascending: true })
      .limit(500),
  ).map((r) => ({ person: toPerson(r.user), role: r.role, status: r.status, since: r.created_at }));

const rpc = async <T = null>(name: string, args: Record<string, unknown>) => unwrap<T>(await supabase.rpc(name, args));

export const joinCommunity = (id: number) => rpc<MemberStatus>("join_community", { c: id }); // → member | requested
export const leaveCommunity = (id: number) => rpc("leave_community", { c: id });
export const inviteToCommunity = (id: number, userId: string) => rpc("invite_to_community", { c: id, u: userId });
export const answerCommunityRequest = (id: number, userId: string, accept: boolean) =>
  rpc("answer_community_request", { c: id, u: userId, accept });
export const setCommunityRole = (id: number, userId: string, role: CommunityRole) =>
  rpc("set_community_role", { c: id, u: userId, r: role });
export const removeFromCommunity = (id: number, userId: string) => rpc("remove_from_community", { c: id, u: userId });

// ---------- Сообщения сообществу ----------

type CommunityMessageDbRow = Omit<CommunityMessageRow, "community" | "user"> & {
  community?: CommunityBriefRow | null;
  user?: PersonRow | null;
};

const toCommunityMessage = (r: CommunityMessageDbRow): CommunityMessageRow => ({
  ...r,
  community: toCommunityBrief(r.community),
  user: undefined,
});

// Мои переписки с сообществами (я — собеседник)
export const fetchMyCommunityMessages = async (myId: string): Promise<CommunityMessageRow[]> =>
  unwrap<CommunityMessageDbRow[]>(
    await supabase
      .from("community_messages")
      .select(`*, community:communities(${COMMUNITY_BRIEF})`)
      .eq("user_id", myId)
      .order("created_at", { ascending: true })
      .limit(1000),
  ).map(toCommunityMessage);

// Входящие сообщества — для его руководителей
export const fetchCommunityInbox = async (communityId: number): Promise<CommunityMessageRow[]> =>
  unwrap<CommunityMessageDbRow[]>(
    await supabase
      .from("community_messages")
      .select(`*, user:profiles!community_messages_user_id_fkey(${PERSON_FIELDS})`)
      .eq("community_id", communityId)
      .order("created_at", { ascending: true })
      .limit(2000),
  ).map((r) => ({ ...r, community: undefined, user: toPerson(r.user) }));

export const sendCommunityMessage = async ({
  communityId,
  userId,
  fromCommunity = false,
  text,
}: {
  communityId: number;
  userId: string;
  fromCommunity?: boolean;
  text: string;
}) =>
  unwrap<CommunityMessageRow>(
    await supabase
      .from("community_messages")
      .insert({ community_id: communityId, user_id: userId, from_community: fromCommunity, text })
      .select("*")
      .single(),
  );

// Отметить прочитанными сообщения другой стороны в переписке userId ↔ сообщество
export const markCommunityMessagesRead = async ({
  communityId,
  userId,
  fromCommunity,
}: {
  communityId: number;
  userId: string;
  fromCommunity: boolean;
}) =>
  unwrap(
    await supabase
      .from("community_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("community_id", communityId)
      .eq("user_id", userId)
      .eq("from_community", fromCommunity)
      .is("read_at", null),
  );

export const fetchCommunityBrief = async (id: number | string) =>
  toCommunityBrief(unwrap<CommunityBriefRow | null>(await supabase.from("communities").select(COMMUNITY_BRIEF).eq("id", Number(id)).maybeSingle()));

// ---------- Друзья ----------

const FRIENDSHIP_FIELDS = `requester_id, addressee_id, status, created_at,
  requester:profiles!friendships_requester_id_fkey(${PERSON_FIELDS}),
  addressee:profiles!friendships_addressee_id_fkey(${PERSON_FIELDS})`;

// Все связи пользователя: друзья, входящие и исходящие заявки
export const fetchFriendships = async (userId: string): Promise<Friendship[]> =>
  unwrap<{ requester_id: string; status: string; created_at: string; requester: PersonRow; addressee: PersonRow }[]>(
    await supabase
      .from("friendships")
      .select(FRIENDSHIP_FIELDS)
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .order("created_at", { ascending: false }),
  ).map((row) => {
    const outgoing = row.requester_id === userId;
    return {
      person: toPerson(outgoing ? row.addressee : row.requester),
      status: row.status === "accepted" ? ("friend" as const) : outgoing ? ("outgoing" as const) : ("incoming" as const),
      createdAt: row.created_at,
    };
  });

export const sendFriendRequest = async (userId: string) =>
  unwrap(await supabase.from("friendships").insert({ addressee_id: userId }));

export const acceptFriendRequest = async (myId: string, userId: string) =>
  unwrap(
    await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("requester_id", userId)
      .eq("addressee_id", myId),
  );

// Отклонить, отменить заявку или удалить из друзей — одна операция
export const removeFriendship = async (myId: string, userId: string) =>
  unwrap(
    await supabase
      .from("friendships")
      .delete()
      .or(
        `and(requester_id.eq.${myId},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${myId})`,
      ),
  );

// ---------- Посты ----------

const COMMUNITY_BRIEF = "id, name, kind, color, avatar_url";

const POST_FIELDS = `id, text, image_url, pinned, created_at, owner_id, community_id, as_community, suggested,
  author:profiles!posts_author_id_fkey(${PERSON_FIELDS}),
  community:communities(${COMMUNITY_BRIEF}),
  owner:profiles!posts_owner_id_fkey(${PERSON_FIELDS}),
  likes:post_likes(user_id),
  comments:post_comments(id, text, created_at, author:profiles!post_comments_author_id_fkey(${PERSON_FIELDS}))`;

const byCreated = (a: { createdAt: string }, b: { createdAt: string }) =>
  new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

export const toComment = (c: CommentRow): Comment => ({ id: c.id, text: c.text, createdAt: c.created_at, author: toPerson(c.author) });

const toPost = (row: PostRow, myId: string): Post => ({
  id: row.id,
  text: row.text,
  image: row.image_url,
  pinned: row.pinned,
  createdAt: row.created_at,
  ownerId: row.owner_id,
  communityId: row.community_id,
  community: toCommunityBrief(row.community),
  asCommunity: row.as_community,
  suggested: row.suggested,
  author: toPerson(row.author),
  owner: toPerson(row.owner),
  likes: row.likes.length,
  liked: row.likes.some((l) => l.user_id === myId),
  comments: row.comments.map(toComment).sort(byCreated),
});

const POSTS_LIMIT = 50;

// Стена пользователя: закреплённая запись первой
export const fetchWall = async (ownerId: string, myId: string) =>
  unwrap<PostRow[]>(
    await supabase
      .from("posts")
      .select(POST_FIELDS)
      .eq("owner_id", ownerId)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(POSTS_LIMIT),
  ).map((row) => toPost(row, myId));

// Лента: записи на стенах ownerIds (друзья и я); null — записи всех пользователей
// Лента: записи на стенах ownerIds (друзья и я) и в сообществах communityIds;
// ownerIds = null — записи всех. Предложенные новости в ленту не попадают
export const fetchFeed = async (ownerIds: string[] | null, myId: string, communityIds: number[] = []) => {
  let request = supabase
    .from("posts")
    .select(POST_FIELDS)
    .eq("suggested", false)
    .order("created_at", { ascending: false })
    .limit(POSTS_LIMIT);
  if (ownerIds) {
    const filters = [`owner_id.in.(${ownerIds.join(",")})`];
    if (communityIds.length) filters.push(`community_id.in.(${communityIds.join(",")})`);
    request = request.or(filters.join(","));
  }
  return unwrap<PostRow[]>(await request).map((row) => toPost(row, myId));
};

// Стена сообщества: опубликованные записи или предложенные новости
export const fetchCommunityWall = async (communityId: number, myId: string, { suggested = false } = {}) =>
  unwrap<PostRow[]>(
    await supabase
      .from("posts")
      .select(POST_FIELDS)
      .eq("community_id", communityId)
      .eq("suggested", suggested)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(POSTS_LIMIT),
  ).map((row) => toPost(row, myId));

export const approveSuggestedPost = async (postId: number) =>
  unwrap(await supabase.rpc("approve_suggested_post", { p: postId }));

export const fetchLikedPosts = async (myId: string) => {
  const liked = unwrap<{ post_id: number }[]>(
    await supabase.from("post_likes").select("post_id").eq("user_id", myId).order("created_at", { ascending: false }).limit(POSTS_LIMIT),
  );
  if (!liked.length) return [];
  const order = liked.map((l) => l.post_id);
  const rows = unwrap<PostRow[]>(await supabase.from("posts").select(POST_FIELDS).in("id", order));
  return rows.map((row) => toPost(row, myId)).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
};

// На стену человека (ownerId) или сообщества (communityId):
// asCommunity — от имени сообщества, suggested — «предложить новость»
export interface NewPost {
  ownerId?: string;
  communityId?: number;
  asCommunity?: boolean;
  suggested?: boolean;
  text: string;
  imageUrl?: string | null;
  myId: string;
}

export const createPost = async ({ ownerId, communityId, asCommunity = false, suggested = false, text, imageUrl, myId }: NewPost) =>
  toPost(
    unwrap(
      await supabase
        .from("posts")
        .insert({
          ...(communityId ? { community_id: communityId, as_community: asCommunity, suggested } : { owner_id: ownerId }),
          text,
          image_url: imageUrl ?? null,
        })
        .select(POST_FIELDS)
        .single(),
    ),
    myId,
  );

export const deletePost = async (post: Post) => {
  unwrap(await supabase.from("posts").delete().eq("id", post.id));
  if (post.image) await removeImage(post.image);
};

// Закреплённой может быть только одна запись на стене
export const setPostPinned = async (post: Post, pinned: boolean) => {
  if (pinned) {
    const reset = supabase.from("posts").update({ pinned: false }).eq("pinned", true);
    unwrap(await (post.communityId ? reset.eq("community_id", post.communityId) : reset.eq("owner_id", post.ownerId!)));
  }
  unwrap(await supabase.from("posts").update({ pinned }).eq("id", post.id));
};

export const setPostLiked = async (postId: number, myId: string, liked: boolean) =>
  liked
    ? unwrap(await supabase.from("post_likes").insert({ post_id: postId }))
    : unwrap(await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", myId));

export const addPostComment = async (postId: number, text: string) =>
  toComment(
    unwrap(
      await supabase
        .from("post_comments")
        .insert({ post_id: postId, text })
        .select(`id, text, created_at, author:profiles!post_comments_author_id_fkey(${PERSON_FIELDS})`)
        .single(),
    ),
  );

export const deletePostComment = async (commentId: number) =>
  unwrap(await supabase.from("post_comments").delete().eq("id", commentId));

// ---------- Фото ----------

const PHOTO_FIELDS = `id, url, path, created_at, owner_id, album_id,
  likes:photo_likes(user_id),
  comments:photo_comments(id, text, created_at, author:profiles!photo_comments_author_id_fkey(${PERSON_FIELDS}))`;

const toPhoto = (row: PhotoRow, myId: string): Photo => ({
  id: row.id,
  src: row.url,
  path: row.path,
  ownerId: row.owner_id,
  albumId: row.album_id ?? null,
  createdAt: row.created_at,
  likes: row.likes.length,
  liked: row.likes.some((l) => l.user_id === myId),
  comments: row.comments.map(toComment).sort(byCreated),
});

// Фото человека (без тех, что он загрузил в сообщества) или фото сообщества.
// albumId: число — один альбом, 0 — «Фотографии с моей страницы» (без альбома)
export interface PhotoSource {
  communityId?: number;
  albumId?: number; // 0 — «Фотографии с моей страницы»
  bookmarked?: boolean; // сохранённые в закладках
}

export const fetchPhotos = async (ownerId: string | null, myId: string, { communityId, albumId, bookmarked }: PhotoSource = {}) => {
  if (bookmarked) return fetchBookmarkedPhotos(myId);
  let request = supabase.from("photos").select(PHOTO_FIELDS).order("created_at", { ascending: false });
  request = communityId ? request.eq("community_id", communityId) : request.eq("owner_id", ownerId!).is("community_id", null);
  if (albumId === 0) request = request.is("album_id", null);
  else if (albumId) request = request.eq("album_id", albumId);
  return unwrap<PhotoRow[]>(await request).map((row) => toPhoto(row, myId));
};

export const addPhoto = async (myId: string, dataUrl: string, { communityId, albumId }: PhotoSource = {}) => {
  const { path, url } = await uploadImage(myId, dataUrl, "photos");
  try {
    return toPhoto(
      unwrap(
        await supabase
          .from("photos")
          .insert({ path, url, ...(communityId && { community_id: communityId }), ...(albumId && { album_id: albumId }) })
          .select(PHOTO_FIELDS)
          .single(),
      ),
      myId,
    );
  } catch (e) {
    await removeImage(path); // запись не создалась — файл не нужен
    throw e;
  }
};

export const deletePhoto = async (photo: Pick<Photo, "id" | "path">) => {
  unwrap(await supabase.from("photos").delete().eq("id", photo.id));
  await removeImage(photo.path);
};

// ---------- Фотоальбомы ----------

const ALBUM_FIELDS = "id, owner_id, title, description, privacy, cover_photo_id, created_at";

const toAlbum = (row: AlbumRow): Album => ({
  id: row.id,
  ownerId: row.owner_id,
  title: row.title,
  description: row.description ?? "",
  privacy: row.privacy,
  coverPhotoId: row.cover_photo_id ?? null,
  createdAt: row.created_at,
});

export const fetchAlbums = async (ownerId: string) =>
  unwrap<AlbumRow[]>(
    await supabase.from("photo_albums").select(ALBUM_FIELDS).eq("owner_id", ownerId).order("created_at", { ascending: false }),
  ).map(toAlbum);

export const fetchAlbum = async (id: number | string) => {
  const row = unwrap<AlbumRow | null>(await supabase.from("photo_albums").select(ALBUM_FIELDS).eq("id", Number(id)).maybeSingle());
  return row && toAlbum(row);
};

export interface AlbumData {
  title: string;
  description?: string;
  privacy?: AlbumPrivacy;
}

export const createAlbum = async ({ title, description = "", privacy = "all" }: AlbumData) =>
  toAlbum(unwrap(await supabase.from("photo_albums").insert({ title, description, privacy }).select(ALBUM_FIELDS).single()));

export const saveAlbum = async ({ id, title, description, privacy }: Pick<Album, "id" | "title" | "description" | "privacy">) =>
  unwrap(await supabase.from("photo_albums").update({ title, description, privacy }).eq("id", id));

export const setAlbumCover = async (albumId: number, photoId: number) =>
  unwrap(await supabase.from("photo_albums").update({ cover_photo_id: photoId }).eq("id", albumId));

// Альбом удаляется вместе с фото (в базе — каскадом), файлы убираем сами
export const deleteAlbum = async (album: Album, photos: Photo[]) => {
  unwrap(await supabase.from("photo_albums").delete().eq("id", album.id));
  const paths = photos.map((p) => p.path).filter(Boolean);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
};

// Перенести фото в альбом (null — на «мою страницу»)
export const movePhotos = async (photoIds: number[], albumId: number | null) =>
  unwrap(await supabase.from("photos").update({ album_id: albumId }).in("id", photoIds));

export const setPhotoLiked = async (photoId: number, myId: string, liked: boolean) =>
  liked
    ? unwrap(await supabase.from("photo_likes").insert({ photo_id: photoId }))
    : unwrap(await supabase.from("photo_likes").delete().eq("photo_id", photoId).eq("user_id", myId));

export const addPhotoComment = async (photoId: number, text: string) =>
  toComment(
    unwrap(
      await supabase
        .from("photo_comments")
        .insert({ photo_id: photoId, text })
        .select(`id, text, created_at, author:profiles!photo_comments_author_id_fkey(${PERSON_FIELDS})`)
        .single(),
    ),
  );

export const deletePhotoComment = async (commentId: number) =>
  unwrap(await supabase.from("photo_comments").delete().eq("id", commentId));

// ---------- Вложения в сообщениях (закрытое хранилище chat) ----------

const CHAT_BUCKET = "chat";
export const MAX_VIDEO_MB = 50;
export const MAX_FILE_MB = MAX_VIDEO_MB; // общий лимит хранилища chat — и для видео, и для музыки

// Тип вложения по файлу: image | video | audio | null (не поддерживается)
export const attachmentKind = (file: File): "image" | "video" | "audio" | null =>
  file.type.startsWith("image/")
    ? "image"
    : file.type.startsWith("video/")
      ? "video"
      : file.type.startsWith("audio/") || /\.(mp3|m4a|aac|ogg|oga|wav|flac)$/i.test(file.name)
        ? "audio"
        : null;

// Название трека из имени файла: «Кино - Группа крови.mp3» → «Кино - Группа крови»
export const trackTitle = (fileName: string) => fileName.replace(/\.[^.]+$/, "").slice(0, 200);
const LINK_TTL = 60 * 60 * 24; // временная ссылка на файл живёт сутки

// Фото сжимаем (кроме GIF — иначе пропадёт анимация), видео и музыку загружаем как есть.
// Путь <я>/<собеседник>/… — по нему правила хранилища пускают только нас двоих
// kind: "voice" — голосовое с микрофона (тип у файла audio/*, но показываем иначе, чем музыку)
export const uploadChatFile = async (
  myId: string,
  peerId: string,
  file: File,
  { kind: forcedKind }: { kind?: AttachmentType } = {},
): Promise<{ path: string; type: AttachmentType; name: string | null }> => {
  let blob: Blob = file;
  let ext: string;
  let type: AttachmentType;
  let name: string | null = null;
  const kind = forcedKind ?? attachmentKind(file);
  if (kind === "voice") {
    ext = { "audio/mp4": "m4a", "audio/ogg": "ogg" }[file.type] ?? "webm";
    type = "voice";
  } else if (kind === "audio") {
    if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`Файл больше ${MAX_FILE_MB} МБ`);
    ext = (file.name.split(".").pop() || "mp3").toLowerCase();
    type = "audio";
    name = trackTitle(file.name);
  } else if (file.type === "image/gif") {
    ext = "gif";
    type = "image";
  } else if (file.type.startsWith("image/")) {
    blob = dataUrlToBlob(await readImage(file, { max: 1600, quality: 0.85 }));
    ext = "jpg";
    type = "image";
  } else if (file.type.startsWith("video/")) {
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) throw new Error(`Видео больше ${MAX_VIDEO_MB} МБ — выберите покороче`);
    ext = (file.name.split(".").pop() || "mp4").toLowerCase();
    type = "video";
  } else {
    throw new Error("Можно отправить только фото, видео или музыку");
  }

  const path = `${myId}/${peerId}/${crypto.randomUUID()}.${ext}`;
  unwrap(
    await supabase.storage.from(CHAT_BUCKET).upload(path, blob, {
      // без параметров вроде ";codecs=opus" — хранилище сверяет только сам тип
      contentType: (blob.type || file.type || (type === "audio" ? "audio/mpeg" : "")).split(";")[0] || undefined,
      cacheControl: "31536000",
    }),
  );
  return { path, type, name };
};

// Временные ссылки на вложения: { путь: ссылка }
export const getChatFileUrls = async (paths: string[]): Promise<Record<string, string>> => {
  if (!paths.length) return {};
  const data = unwrap<{ path: string | null; signedUrl: string }[]>(await supabase.storage.from(CHAT_BUCKET).createSignedUrls(paths, LINK_TTL));
  return Object.fromEntries(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
};

export const removeChatFile = (path: string) => supabase.storage.from(CHAT_BUCKET).remove([path]);

// ---------- «Поделиться»: одна запись, одно фото — для карточки в чате ----------

export const fetchPost = async (id: number | string, myId: string) => {
  // id приходит из сообщения строкой — у записей и фото он числовой
  const row = unwrap<PostRow | null>(await supabase.from("posts").select(POST_FIELDS).eq("id", Number(id)).maybeSingle());
  return row && toPost(row, myId);
};

export const fetchPhoto = async (id: number | string): Promise<SharedPhoto | null> => {
  const row = unwrap<{ id: number; url: string; created_at: string; owner: PersonRow | null } | null>(
    await supabase
      .from("photos")
      .select(`id, url, created_at, owner:profiles!photos_owner_id_fkey(${PERSON_FIELDS})`)
      .eq("id", Number(id))
      .maybeSingle(),
  );
  return row && { id: row.id, src: row.url, createdAt: row.created_at, owner: toPerson(row.owner) };
};

// ---------- Удаление сообщений ----------

// «У себя» — скрыть только для меня (у собеседника сообщение останется)
export const deleteMessageForMe = async (id: number) => unwrap(await supabase.rpc("delete_message_for_me", { p_id: id }));

// «У всех» — удалить совсем; файл вложения тоже удаляем
export const deleteMessageForAll = async (id: number) => {
  const path = unwrap<string | null>(await supabase.rpc("delete_message_for_all", { p_id: id }));
  if (path) await removeChatFile(path).catch(() => { });
};

// ---------- Музыка ----------

const MUSIC_BUCKET = "music";
export const MAX_AUDIO_MB = 50;
const AUDIO_FIELDS = "id, uploader_id, artist, title, duration, url, path, created_at";

const toAudio = (row: AudioRow): Track => ({
  id: row.id,
  uploaderId: row.uploader_id,
  artist: row.artist ?? "",
  title: row.title,
  duration: row.duration ?? 0,
  url: row.url,
  path: row.path,
  createdAt: row.created_at,
});

// «Исполнитель - Название.mp3» → { artist, title }
export const parseTrackName = (fileName: string) => {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/_/g, " ").trim();
  const match = base.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  return match ? { artist: match[1].trim().slice(0, 100), title: match[2].trim().slice(0, 150) } : { artist: "", title: base.slice(0, 150) };
};

// «Моя музыка» человека: свои и добавленные треки, новые сверху
export const fetchUserMusic = async (userId: string): Promise<Track[]> =>
  unwrap<{ audio: AudioRow | null }[]>(
    await supabase
      .from("user_audios")
      .select(`added_at, audio:audios(${AUDIO_FIELDS})`)
      .eq("user_id", userId)
      .order("added_at", { ascending: false }),
  )
    .filter((r) => r.audio)
    .map((r) => toAudio(r.audio!));

// Поиск по всей музыке; без запроса — новые треки
export const searchAudios = async (query: string): Promise<Track[]> => {
  let request = supabase.from("audios").select(AUDIO_FIELDS).order("created_at", { ascending: false }).limit(100);
  const q = query.trim().replace(/[%_,()]/g, "");
  if (q) request = request.or(`title.ilike.%${q}%,artist.ilike.%${q}%`);
  return unwrap<AudioRow[]>(await request).map(toAudio);
};

export const fetchAudio = async (id: number | string) => {
  const row = unwrap<AudioRow | null>(await supabase.from("audios").select(AUDIO_FIELDS).eq("id", Number(id)).maybeSingle());
  return row && toAudio(row);
};

// Файл → бакет music → запись о треке → сразу в «Мою музыку»
export interface TrackInfo {
  artist: string;
  title: string;
  duration: number;
}

export const uploadAudio = async (myId: string, file: File, { artist, title, duration }: TrackInfo) => {
  if (file.size > MAX_AUDIO_MB * 1024 * 1024) throw new Error(`Файл больше ${MAX_AUDIO_MB} МБ`);
  const ext = (file.name.match(/\.(\w{2,5})$/)?.[1] ?? "mp3").toLowerCase();
  const path = `${myId}/${crypto.randomUUID()}.${ext}`;
  unwrap(
    await supabase.storage.from(MUSIC_BUCKET).upload(path, file, {
      contentType: file.type || "audio/mpeg",
      cacheControl: "31536000",
    }),
  );
  const { data } = supabase.storage.from(MUSIC_BUCKET).getPublicUrl(path);
  try {
    const row = unwrap<AudioRow>(
      await supabase
        .from("audios")
        .insert({ artist, title, duration: Math.round(duration || 0), path, url: data.publicUrl })
        .select(AUDIO_FIELDS)
        .single(),
    );
    unwrap(await supabase.from("user_audios").insert({ audio_id: row.id }));
    return toAudio(row);
  } catch (e) {
    await supabase.storage.from(MUSIC_BUCKET).remove([path]);
    throw e;
  }
};

export const addToMyMusic = async (audioId: number) =>
  unwrap(await supabase.from("user_audios").insert({ audio_id: audioId }));

export const removeFromMyMusic = async (myId: string, audioId: number) =>
  unwrap(await supabase.from("user_audios").delete().eq("user_id", myId).eq("audio_id", audioId));

export const saveAudio = async ({ id, artist, title }: Pick<Track, "id" | "artist" | "title">) =>
  unwrap(await supabase.from("audios").update({ artist, title }).eq("id", id));

// Удалить трек совсем (только загрузивший): пропадёт у всех и из плейлистов
export const deleteAudio = async (audio: Track) => {
  unwrap(await supabase.from("audios").delete().eq("id", audio.id));
  await supabase.storage.from(MUSIC_BUCKET).remove([audio.path]);
};

const PLAYLIST_FIELDS = `id, owner_id, title, description, created_at, updated_at,
  owner:profiles!playlists_owner_id_fkey(${PERSON_FIELDS}),
  tracks:playlist_tracks(added_at, audio:audios(${AUDIO_FIELDS}))`;

const toPlaylist = (row: PlaylistRow): Playlist => ({
  id: row.id,
  ownerId: row.owner_id,
  owner: row.owner ? toPerson(row.owner) : null,
  title: row.title,
  description: row.description ?? "",
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  tracks: (row.tracks ?? [])
    .filter((t) => t.audio)
    .sort((a, b) => new Date(a.added_at).getTime() - new Date(b.added_at).getTime())
    .map((t) => toAudio(t.audio!)),
});

export const fetchPlaylists = async (ownerId: string) =>
  unwrap<PlaylistRow[]>(
    await supabase.from("playlists").select(PLAYLIST_FIELDS).eq("owner_id", ownerId).order("updated_at", { ascending: false }),
  ).map(toPlaylist);

export const fetchPlaylist = async (id: number | string) => {
  const row = unwrap<PlaylistRow | null>(await supabase.from("playlists").select(PLAYLIST_FIELDS).eq("id", Number(id)).maybeSingle());
  return row && toPlaylist(row);
};

export const createPlaylist = async ({ title, description = "" }: { title: string; description?: string }) =>
  toPlaylist(unwrap(await supabase.from("playlists").insert({ title, description }).select(PLAYLIST_FIELDS).single()));

export const savePlaylist = async ({ id, title, description }: Pick<Playlist, "id" | "title" | "description">) =>
  unwrap(
    await supabase.from("playlists").update({ title, description, updated_at: new Date().toISOString() }).eq("id", id),
  );

export const deletePlaylist = async (id: number) => unwrap(await supabase.from("playlists").delete().eq("id", id));

export const addToPlaylist = async (playlistId: number, audioId: number) => {
  unwrap(await supabase.from("playlist_tracks").insert({ playlist_id: playlistId, audio_id: audioId }));
  await supabase.from("playlists").update({ updated_at: new Date().toISOString() }).eq("id", playlistId);
};

export const removeFromPlaylist = async (playlistId: number, audioId: number) =>
  unwrap(await supabase.from("playlist_tracks").delete().eq("playlist_id", playlistId).eq("audio_id", audioId));

// ---------- Видео ----------

const VIDEO_BUCKET = "videos";
export const MAX_UPLOAD_VIDEO_MB = 50;
const VIDEO_FIELDS = `id, owner_id, title, description, duration, width, height, url, path, poster_url, poster_path, views, created_at,
  owner:profiles!videos_owner_id_fkey(${PERSON_FIELDS}),
  likes:video_likes(user_id),
  comments:video_comments(count)`;

const toVideo = (row: VideoRow, myId: string): Video => ({
  id: row.id,
  ownerId: row.owner_id,
  owner: row.owner ? toPerson(row.owner) : null,
  title: row.title,
  description: row.description ?? "",
  duration: row.duration ?? 0,
  width: row.width,
  height: row.height,
  url: row.url,
  path: row.path,
  poster: row.poster_url,
  posterPath: row.poster_path,
  views: row.views ?? 0,
  createdAt: row.created_at,
  likes: row.likes?.length ?? 0,
  liked: !!row.likes?.some((l) => l.user_id === myId),
  commentsCount: row.comments?.[0]?.count ?? 0,
});

// «Мои видео» человека: загруженные и добавленные, новые сверху
export const fetchUserVideos = async (userId: string, myId: string): Promise<Video[]> =>
  unwrap<{ video: VideoRow | null }[]>(
    await supabase
      .from("user_videos")
      .select(`added_at, video:videos(${VIDEO_FIELDS})`)
      .eq("user_id", userId)
      .order("added_at", { ascending: false }),
  )
    .filter((r) => r.video)
    .map((r) => toVideo(r.video!, myId));

export const searchVideos = async (query: string, myId: string): Promise<Video[]> => {
  let request = supabase.from("videos").select(VIDEO_FIELDS).order("created_at", { ascending: false }).limit(60);
  const q = query.trim().replace(/[%_,()]/g, "");
  if (q) request = request.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
  return unwrap<VideoRow[]>(await request).map((row) => toVideo(row, myId));
};

export const fetchVideo = async (id: number | string, myId: string) => {
  const row = unwrap<VideoRow | null>(await supabase.from("videos").select(VIDEO_FIELDS).eq("id", Number(id)).maybeSingle());
  return row && toVideo(row, myId);
};

// Файл и превью → бакет videos → запись → сразу в «Мои видео»
export interface VideoInfo {
  title: string;
  description?: string;
  duration?: number;
  width?: number;
  height?: number;
  poster?: Blob | null;
}

export const uploadVideo = async (myId: string, file: File, { title, description = "", duration, width, height, poster }: VideoInfo) => {
  if (file.size > MAX_UPLOAD_VIDEO_MB * 1024 * 1024) throw new Error(`Файл больше ${MAX_UPLOAD_VIDEO_MB} МБ`);
  const id = crypto.randomUUID();
  const ext = (file.name.match(/\.(\w{2,5})$/)?.[1] ?? "mp4").toLowerCase();
  const path = `${myId}/${id}.${ext}`;
  const posterPath = poster ? `${myId}/${id}.jpg` : null;
  const bucket = supabase.storage.from(VIDEO_BUCKET);
  unwrap(await bucket.upload(path, file, { contentType: file.type || "video/mp4", cacheControl: "31536000" }));
  try {
    if (poster && posterPath) unwrap(await bucket.upload(posterPath, poster, { contentType: "image/jpeg", cacheControl: "31536000" }));
    const row = unwrap<VideoRow>(
      await supabase
        .from("videos")
        .insert({
          title,
          description,
          duration: Math.round(duration || 0),
          width: width || null,
          height: height || null,
          path,
          url: bucket.getPublicUrl(path).data.publicUrl,
          poster_path: posterPath,
          poster_url: posterPath ? bucket.getPublicUrl(posterPath).data.publicUrl : null,
        })
        .select(VIDEO_FIELDS)
        .single(),
    );
    unwrap(await supabase.from("user_videos").insert({ video_id: row.id }));
    return toVideo(row, myId);
  } catch (e) {
    await bucket.remove([path, posterPath].filter((p): p is string => !!p));
    throw e;
  }
};

export const addToMyVideos = async (videoId: number) => unwrap(await supabase.from("user_videos").insert({ video_id: videoId }));

export const removeFromMyVideos = async (myId: string, videoId: number) =>
  unwrap(await supabase.from("user_videos").delete().eq("user_id", myId).eq("video_id", videoId));

export const saveVideo = async ({ id, title, description }: Pick<Video, "id" | "title" | "description">) =>
  unwrap(await supabase.from("videos").update({ title, description }).eq("id", id));

export const deleteVideo = async (video: Video) => {
  unwrap(await supabase.from("videos").delete().eq("id", video.id));
  await supabase.storage.from(VIDEO_BUCKET).remove([video.path, video.posterPath].filter((p): p is string => !!p));
};

export const setVideoLiked = async (videoId: number, myId: string, liked: boolean) =>
  liked
    ? unwrap(await supabase.from("video_likes").insert({ video_id: videoId }))
    : unwrap(await supabase.from("video_likes").delete().eq("video_id", videoId).eq("user_id", myId));

const VIDEO_COMMENT_FIELDS = `id, text, created_at, author:profiles!video_comments_author_id_fkey(${PERSON_FIELDS})`;

export const fetchVideoComments = async (videoId: number) =>
  unwrap<CommentRow[]>(
    await supabase.from("video_comments").select(VIDEO_COMMENT_FIELDS).eq("video_id", videoId).order("created_at"),
  ).map(toComment);

export const addVideoComment = async (videoId: number, text: string) =>
  toComment(unwrap(await supabase.from("video_comments").insert({ video_id: videoId, text }).select(VIDEO_COMMENT_FIELDS).single()));

export const deleteVideoComment = async (commentId: number) =>
  unwrap(await supabase.from("video_comments").delete().eq("id", commentId));

// Засчитать просмотр (каждый зритель — один раз) → новое число просмотров
export const viewVideo = async (videoId: number) => unwrap<number>(await supabase.rpc("view_video", { v: videoId }));

// ---------- Уведомления ----------

const NOTIFICATION_FIELDS = `id, type, text, created_at, read_at,
  actor:profiles!notifications_actor_id_fkey(${PERSON_FIELDS}),
  post:posts(id, text, image_url, owner_id, community_id),
  photo:photos(id, url, owner_id),
  video:videos(id, title, poster_url),
  community:communities(${COMMUNITY_BRIEF})`;

interface NotificationRow {
  id: number;
  type: NotificationType;
  text: string;
  created_at: string;
  read_at: string | null;
  actor: PersonRow | null;
  post: { id: number; text: string; image_url: string | null; owner_id: string | null; community_id: number | null } | null;
  photo: { id: number; url: string; owner_id: string } | null;
  video: { id: number; title: string; poster_url: string | null } | null;
  community: CommunityBriefRow | null;
}

const toNotification = (row: NotificationRow): AppNotification => ({
  id: row.id,
  type: row.type,
  text: row.text ?? "",
  createdAt: row.created_at,
  readAt: row.read_at,
  actor: toPerson(row.actor),
  post: row.post && {
    id: row.post.id,
    text: row.post.text,
    image: row.post.image_url,
    ownerId: row.post.owner_id,
    communityId: row.post.community_id,
  },
  photo: row.photo && { id: row.photo.id, src: row.photo.url, ownerId: row.photo.owner_id },
  video: row.video && { id: row.video.id, title: row.video.title, poster: row.video.poster_url },
  community: toCommunityBrief(row.community),
});

const NOTIFICATIONS_LIMIT = 100;

export const fetchNotifications = async () =>
  unwrap<NotificationRow[]>(
    await supabase
      .from("notifications")
      .select(NOTIFICATION_FIELDS)
      .order("created_at", { ascending: false })
      .limit(NOTIFICATIONS_LIMIT),
  ).map(toNotification);

export const fetchNotification = async (id: number) => {
  const row = unwrap<NotificationRow | null>(
    await supabase.from("notifications").select(NOTIFICATION_FIELDS).eq("id", id).maybeSingle(),
  );
  return row && toNotification(row);
};

// Отметить прочитанными все мои непрочитанные
export const markNotificationsRead = async (myId: string) =>
  unwrap(
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", myId)
      .is("read_at", null),
  );

export const deleteNotification = async (id: number) =>
  unwrap(await supabase.from("notifications").delete().eq("id", id));

// ---------- Настройки чатов: закреплён, архив, «непрочитанный» ----------

export interface ChatSetting {
  peer: string;
  pinnedAt: string | null;
  archivedAt: string | null;
  markedUnread: boolean;
}

interface ChatSettingRow {
  peer: string;
  pinned_at: string | null;
  archived_at: string | null;
  marked_unread: boolean;
}

export const toChatSetting = (r: ChatSettingRow): ChatSetting => ({
  peer: r.peer,
  pinnedAt: r.pinned_at,
  archivedAt: r.archived_at,
  markedUnread: r.marked_unread,
});

export const fetchChatSettings = async () =>
  unwrap<ChatSettingRow[]>(await supabase.from("chat_settings").select("peer, pinned_at, archived_at, marked_unread")).map(
    toChatSetting,
  );

export const saveChatSetting = async (myId: string, setting: ChatSetting) =>
  unwrap(
    await supabase.from("chat_settings").upsert(
      {
        user_id: myId,
        peer: setting.peer,
        pinned_at: setting.pinnedAt,
        archived_at: setting.archivedAt,
        marked_unread: setting.markedUnread,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,peer" },
    ),
  );

// ---------- Чёрный список ----------

export interface BlockedPerson {
  person: Person;
  since: string;
}

export const fetchBlocked = async (): Promise<BlockedPerson[]> =>
  unwrap<{ created_at: string; blocked: PersonRow }[]>(
    await supabase
      .from("blocks")
      .select(`created_at, blocked:profiles!blocks_blocked_id_fkey(${PERSON_FIELDS})`)
      .order("created_at", { ascending: false }),
  ).map((r) => ({ person: toPerson(r.blocked), since: r.created_at }));

// id тех, кто заблокировал меня
export const fetchBlockedMe = async () => unwrap<string[]>(await supabase.rpc("blocked_me_ids"));

export const blockUser = (userId: string) => rpc("block_user", { u: userId });
export const unblockUser = (userId: string) => rpc("unblock_user", { u: userId });

// ---------- Закладки ----------

export type BookmarkKind = "post" | "photo" | "video" | "person" | "community";

const BOOKMARK_COLUMN: Record<BookmarkKind, string> = {
  post: "post_id",
  photo: "photo_id",
  video: "video_id",
  person: "person_id",
  community: "community_id",
};

// Ключ закладки: "post:12", "person:<uuid>"
export const bookmarkKey = (kind: BookmarkKind, id: string | number) => `${kind}:${id}`;

type BookmarkRow = Record<"post_id" | "photo_id" | "video_id" | "person_id" | "community_id", string | number | null>;

// Все мои закладки — только ключи, чтобы в меню сразу видеть «Сохранено / Сохранить»
export const fetchBookmarkKeys = async () =>
  unwrap<BookmarkRow[]>(
    await supabase.from("bookmarks").select("post_id, photo_id, video_id, person_id, community_id").limit(5000),
  ).map((row) => {
    const kind = (Object.keys(BOOKMARK_COLUMN) as BookmarkKind[]).find((k) => row[BOOKMARK_COLUMN[k] as keyof BookmarkRow] != null)!;
    return bookmarkKey(kind, row[BOOKMARK_COLUMN[kind] as keyof BookmarkRow]!);
  });

export const setBookmarked = async (kind: BookmarkKind, id: string | number, on: boolean) => {
  const column = BOOKMARK_COLUMN[kind];
  const value = kind === "person" ? String(id) : Number(id);
  return on
    ? unwrap(await supabase.from("bookmarks").insert({ [column]: value } as never))
    : unwrap(await supabase.from("bookmarks").delete().eq(column, value));
};

// id сохранённого по порядку «новые сверху»
const bookmarkedIds = async <T extends string | number>(kind: BookmarkKind): Promise<T[]> => {
  const column = BOOKMARK_COLUMN[kind];
  return unwrap<Record<string, T>[]>(
    await supabase.from("bookmarks").select(column).not(column, "is", null).order("created_at", { ascending: false }).limit(200),
  ).map((r) => r[column]);
};

// Удалённое или скрытое от меня (RLS) просто не придёт — в списке его не будет
const inOrder = <T extends { id: string | number }>(items: T[], order: (string | number)[]) =>
  items.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

export const fetchBookmarkedPosts = async (myId: string) => {
  const ids = await bookmarkedIds<number>("post");
  if (!ids.length) return [];
  const rows = unwrap<PostRow[]>(await supabase.from("posts").select(POST_FIELDS).in("id", ids));
  return inOrder(rows.map((row) => toPost(row, myId)), ids);
};

export const fetchBookmarkedPhotos = async (myId: string) => {
  const ids = await bookmarkedIds<number>("photo");
  if (!ids.length) return [];
  return inOrder(
    unwrap<PhotoRow[]>(await supabase.from("photos").select(PHOTO_FIELDS).in("id", ids)).map((row) => toPhoto(row, myId)),
    ids,
  );
};

// Люди по списку id (например, владельцы сохранённых фото)
export const fetchPeopleByIds = async (ids: string[]) =>
  ids.length
    ? unwrap<PersonRow[]>(await supabase.from("profiles").select(PERSON_FIELDS).in("id", ids))
        .map(toPerson)
        .filter((p): p is Person => !!p)
    : [];

export const fetchBookmarkedVideos = async (myId: string) => {
  const ids = await bookmarkedIds<number>("video");
  if (!ids.length) return [];
  return inOrder(
    unwrap<VideoRow[]>(await supabase.from("videos").select(VIDEO_FIELDS).in("id", ids)).map((row) => toVideo(row, myId)),
    ids,
  );
};

export const fetchBookmarkedPeople = async () => {
  const ids = await bookmarkedIds<string>("person");
  return inOrder(await fetchPeopleByIds(ids), ids);
};

export const fetchBookmarkedCommunities = async () => {
  const ids = await bookmarkedIds<number>("community");
  if (!ids.length) return [];
  return inOrder(
    unwrap<CommunityRow[]>(await supabase.from("communities").select(COMMUNITY_FIELDS).in("id", ids)).map(toCommunity),
    ids,
  );
};
