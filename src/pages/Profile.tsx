import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Avatar from "../components/Avatar";
import Composer from "../components/Composer";
import PostList from "../components/PostList";
import AvatarUploadModal from "../components/AvatarUploadModal";
import ProfileDetailsModal from "../components/ProfileDetailsModal";
import PhotoViewer from "../components/PhotoViewer";
import ConfirmModal from "../components/ConfirmModal";
import FriendButton from "../components/FriendButton";
import BlockModal from "../components/BlockModal";
import { useBlocks } from "../context/BlocksContext";
import { useBookmarks } from "../context/BookmarksContext";
import ShareModal from "../components/ShareModal";
import AlbumsTab from "../components/media/AlbumsTab";
import MusicTab from "../components/media/MusicTab";
import VideoTab from "../components/media/VideoTab";
import ArticlesTab from "../components/media/ArticlesTab";
import { useSnackbar } from "../components/Snackbar";
import {
  AlbumsIcon,
  BlockIcon,
  BookmarkFilledIcon,
  BookmarkIcon,
  ArticlesIcon,
  CameraIcon,
  CloseIcon,
  EducationIcon,
  InfoIcon,
  MapPinIcon,
  MessageIcon,
  MoreIcon,
  MusicIcon,
  ShareIcon,
  PhotoIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  VideoIcon,
  type Icon,
} from "../components/Icons";
import { useProfile } from "../context/ProfileContext";
import { useFriends } from "../context/FriendsContext";
import { useChatActions, useOnlineIds } from "../context/ChatContext";
import { bg } from "../data";
import { formatEducation, fullName } from "../profile";
import { useDismiss, useDropdown, useFileDrop, useFilePicker } from "../hooks";
import {
  useFriendsOf,
  usePhotos,
  usePosts,
  useResource,
  useUserProfile,
} from "../resources";
import { fetchUserCommunities } from "../api";
import { explainError, removeImage, uploadImage } from "../api";
import { lastSeen, readImage } from "../utils";
import type { PostsFeed, PublishData } from "../resources";
import type { CommunityBrief, Navigate, Person, Photo, Profile as ProfileType } from "../types";

const DEFAULT_COVER = "var(--cover-empty)";
const STATUS_LIMIT = 140;

// Удаляем старый файл аватара/обложки, только если он лежит в своей папке
// (аватаром может быть фото из альбома — его трогать нельзя)
const removeOld = (url: string | null, folder: string) =>
  url?.includes(`/${folder}/`) && removeImage(url).catch(() => {});

// ---------- Обложка ----------
type PhotoAlbum = ReturnType<typeof usePhotos>;

function Cover({ profile, editable }: { profile: ProfileType; editable: boolean }) {
  const { myId, updateProfile } = useProfile();
  const showSnackbar = useSnackbar();
  const menu = useDropdown();
  const [uploading, setUploading] = useState(false);
  const picker = useFilePicker({
    accept: "image/*",
    onPick: ([file]) => upload(file),
  });

  const upload = async (file: File | undefined) => {
    setUploading(true);
    try {
      const dataUrl = await readImage(file, { max: 1600 });
      const { url } = await uploadImage(myId, dataUrl, "covers");
      const old = profile.cover;
      if (await updateProfile({ cover: url })) {
        removeOld(old, "covers");
        showSnackbar("Обложка обновлена");
      }
    } catch (e) {
      showSnackbar(explainError(e), "error");
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    const old = profile.cover;
    if (await updateProfile({ cover: null })) {
      removeOld(old, "covers");
      showSnackbar("Обложка удалена");
    }
  };

  return (
    <div
      className="profile-cover"
      style={{
        background: profile.cover
          ? bg(profile.cover, DEFAULT_COVER)
          : DEFAULT_COVER,
      }}
    >
      {editable && (
        <div className="profile-cover__action" ref={menu.ref}>
          <button
            className="btn btn--overlay"
            onClick={menu.toggle}
            disabled={uploading}
          >
            <CameraIcon size={20} />{" "}
            {uploading ? "Загрузка…" : "Изменить обложку"}
          </button>
          {menu.open && (
            <div className="dropdown dropdown--right">
              <button
                className="dropdown__item"
                onClick={() => {
                  menu.close();
                  picker.open();
                }}
              >
                <PhotoIcon /> Загрузить изображение
              </button>
              {profile.cover && (
                <button
                  className="dropdown__item"
                  onClick={() => {
                    menu.close();
                    remove();
                  }}
                >
                  <TrashIcon /> Удалить обложку
                </button>
              )}
            </div>
          )}
          {picker.input}
        </div>
      )}
    </div>
  );
}

// ---------- Аватар как в VK: клик открывает фото, у своего при наведении — «Обновить / Удалить» ----------
function ProfileAvatar({
  profile,
  editable,
  owner,
  album,
}: {
  profile: ProfileType;
  editable: boolean;
  owner: Person;
  album: PhotoAlbum;
}) {
  const { updateProfile } = useProfile();
  const onlineIds = useOnlineIds();
  const showSnackbar = useSnackbar();
  const [modal, setModal] = useState<"upload" | "delete" | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  // Аватар — это одно из фото со страницы: открываем просмотр на нём и даём листать остальные.
  // Старый аватар без записи в «Фото» показываем отдельно, без лайков и комментариев
  const avatarIndex = album.photos.findIndex((p) => p.src === profile.avatar);
  const viewerPhotos: Photo[] =
    avatarIndex >= 0
      ? album.photos
      : [
          {
            id: -1,
            src: profile.avatar ?? "",
            path: "",
            ownerId: profile.id,
            albumId: null,
            createdAt: profile.createdAt,
            likes: 0,
            liked: false,
            comments: [],
            readOnly: true,
          },
        ];

  const open = () => {
    if (profile.avatar) setViewerIndex(avatarIndex >= 0 ? avatarIndex : 0);
    else if (editable) setModal("upload");
  };

  return (
    <div className="profile-info__avatar">
      <div
        className={`avatar-frame ${editable && profile.avatar ? "avatar-frame--editable" : ""}`}
      >
        <button
          className="avatar-open"
          onClick={open}
          disabled={!profile.avatar && !editable}
          title={
            profile.avatar
              ? "Открыть фотографию"
              : editable
                ? "Загрузить фотографию"
                : undefined
          }
        >
          <Avatar
            name={fullName(profile)}
            color={profile.color}
            src={profile.avatar}
            size={148}
            online={!editable && onlineIds.has(profile.id)}
          />
          {editable && !profile.avatar && (
            <span className="avatar-edit__overlay">
              <CameraIcon size={28} />
            </span>
          )}
        </button>

        {editable && profile.avatar && (
          <div className="avatar-actions">
            <button onClick={() => setModal("upload")}>
              Обновить фотографию
            </button>
            <button onClick={() => setModal("delete")}>Удалить</button>
          </div>
        )}
      </div>

      {editable && (
        <button
          className="avatar-add"
          onClick={() => setModal("upload")}
          title="Обновить фотографию"
          aria-label="Обновить фотографию"
        >
          <PlusIcon size={16} />
        </button>
      )}

      {viewerIndex !== null && viewerPhotos[viewerIndex] && (
        <PhotoViewer
          photos={viewerPhotos}
          index={viewerIndex}
          owner={owner}
          album="Фотографии со страницы"
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
          onDelete={album.remove}
          onToggleLike={album.toggleLike}
          onComment={album.comment}
          onDeleteComment={album.deleteComment}
        />
      )}

      {modal === "upload" && (
        <AvatarUploadModal
          onClose={() => setModal(null)}
          onSaved={album.addLocal}
        />
      )}

      {modal === "delete" && (
        <ConfirmModal
          title="Удаление фотографии"
          text="Фотография исчезнет с аватара. В разделе «Фото» она останется — удалить её совсем можно там."
          onConfirm={async () => {
            setModal(null);
            const old = profile.avatar;
            if (await updateProfile({ avatar: null })) {
              removeOld(old, "avatars"); // файл удаляем, только если это старый отдельный аватар
              showSnackbar("Фотография убрана с аватара");
            }
          }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// ---------- Статус: свой редактируется по клику ----------
function Status({ profile, editable }: { profile: ProfileType; editable: boolean }) {
  const { updateProfile } = useProfile();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(profile.status);
  const ref = useRef(null);
  const cancel = useCallback(() => setEditing(false), []);
  useDismiss(ref, editing, cancel);

  if (!editable) {
    return profile.status ? (
      <div className="profile-info__status">{profile.status}</div>
    ) : null;
  }

  const start = () => {
    setValue(profile.status);
    setEditing(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditing(false);
    await updateProfile({ status: value.trim() });
  };

  if (!editing) {
    return (
      <div
        className={`profile-info__status status ${profile.status ? "" : "status--empty"}`}
        onClick={start}
        title="Изменить статус"
      >
        {profile.status || "Установить статус"}
      </div>
    );
  }

  return (
    <form className="status-editor" ref={ref} onSubmit={save}>
      <input
        className="field"
        autoFocus
        value={value}
        maxLength={STATUS_LIMIT}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Введите статус"
      />
      <div className="status-editor__footer">
        <span className="muted">{STATUS_LIMIT - value.length}</span>
        <button type="button" className="btn btn--tertiary" onClick={cancel}>
          Отмена
        </button>
        <button className="btn">Сохранить</button>
      </div>
    </form>
  );
}

// ---------- Медиа: фото (с сервера) и личные вкладки (только на своей странице) ----------
type MediaTab = "photos" | "albums" | "music" | "video" | "articles";

const MEDIA_TABS: { id: MediaTab; label: string; Icon: Icon; own?: boolean }[] = [
  { id: "photos", label: "Фото", Icon: PhotoIcon },
  { id: "albums", label: "Альбомы", Icon: AlbumsIcon },
  { id: "music", label: "Музыка", Icon: MusicIcon },
  { id: "video", label: "Видео", Icon: VideoIcon },
  { id: "articles", label: "Статьи", Icon: ArticlesIcon, own: true },
];
const PHOTOS_PREVIEW = 6;

// Плитка фото: клик открывает просмотр, ✕ в углу — удаление (только своих)
export function PhotoTile({ photo, onOpen, onDelete }: { photo: Photo; onOpen: () => void; onDelete?: () => void }) {
  return (
    <div className="media__photo">
      <button
        className="media__photo-open"
        style={{ background: bg(photo.src, "var(--field-bg)") }}
        onClick={onOpen}
        aria-label="Открыть фотографию"
      />
      {onDelete && (
        <button
          className="media__photo-delete"
          onClick={onDelete}
          title="Удалить фотографию"
          aria-label="Удалить фотографию"
        >
          <CloseIcon size={16} />
        </button>
      )}
    </div>
  );
}

function MediaCard({ owner, isMe, album }: { owner: Person; isMe: boolean; album: PhotoAlbum }) {
  const showSnackbar = useSnackbar();
  const { photos } = album;
  const [tab, setTab] = useState<MediaTab>("photos");
  const [uploading, setUploading] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<Photo | null>(null);
  const tabs = MEDIA_TABS.filter((t) => isMe || !t.own);
  const visible = photos.slice(0, PHOTOS_PREVIEW);

  const upload = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) {
      showSnackbar("Выберите изображение в формате JPG, PNG или GIF", "error");
      return;
    }
    setUploading(true);
    setTab("photos");
    const { added, failed, error } = await album.upload(images);
    setUploading(false);

    if (failed && added) {
      showSnackbar(`Загружено ${added} из ${images.length}: ${error}`, "error");
    } else if (failed) {
      showSnackbar(error, "error");
    } else {
      showSnackbar(
        added > 1 ? `Загружено фотографий: ${added}` : "Фотография загружена",
      );
    }
  };

  const picker = useFilePicker({
    accept: "image/*",
    multiple: true,
    onPick: upload,
  });
  const [dragOver, dropProps] = useFileDrop(upload);
  const uploadLabel = uploading ? "Загрузка…" : "Загрузить фото";
  // Удалять свои фото можно крестиком на плитке; у чужих крестика нет
  const askDelete = (photo: Photo) => (isMe ? () => setToDelete(photo) : undefined);

  return (
    <section
      className={`card media ${dragOver && isMe ? "media--drag" : ""}`}
      {...(isMe ? dropProps : {})}
    >
      <div className="media__tabs" role="tablist">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`seg media__tab ${tab === id ? "active" : ""}`}
            onClick={() => setTab(id)}
          >
            <Icon size={20} />
            {label}
            {id === "photos" && photos.length > 0 && (
              <span className="media__count">{photos.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "photos" ? (
        <>
          {album.loading && !album.data ? (
            <div className="media__empty" role="status">
              <div className="chat-status__spinner" />
            </div>
          ) : album.error && !album.data ? (
            <div className="media__empty" role="alert">
              Не удалось загрузить фото: {album.error}
              <button className="btn btn--neutral" onClick={album.reload}>
                Повторить
              </button>
            </div>
          ) : photos.length > 0 ? (
            <div className="media__photos">
              {visible.map((p, i) => (
                <PhotoTile
                  key={p.id}
                  photo={p}
                  onOpen={() => setViewerIndex(i)}
                  onDelete={askDelete(p)}
                />
              ))}
            </div>
          ) : (
            <div className="media__empty">
              <PhotoIcon size={32} />
              {isMe
                ? "Здесь пока нет фотографий — загрузите первую или перетащите файлы сюда"
                : `${owner.firstName} пока не добавил(а) фотографии`}
            </div>
          )}

          {(isMe || photos.length > PHOTOS_PREVIEW) && (
            <div
              className={`media__actions ${isMe ? "" : "media__actions--single"}`}
            >
              {isMe && (
                <button
                  className="btn btn--neutral"
                  onClick={picker.open}
                  disabled={uploading}
                >
                  {uploadLabel}
                </button>
              )}
              <a
                className="btn btn--neutral"
                href={isMe ? "#photos" : `#photos/${owner.id}`}
              >
                Показать всё
              </a>
            </div>
          )}
          {isMe && picker.input}
        </>
      ) : tab === "albums" ? (
        <AlbumsTab owner={owner} isMe={isMe} photos={photos} />
      ) : tab === "music" ? (
        <MusicTab owner={owner} isMe={isMe} />
      ) : tab === "video" ? (
        <VideoTab owner={owner} isMe={isMe} />
      ) : (
        <ArticlesTab />
      )}

      {dragOver && isMe && (
        <div className="media__drop">Отпустите, чтобы загрузить фото</div>
      )}

      {viewerIndex !== null && photos[viewerIndex] && (
        <PhotoViewer
          photos={photos}
          index={viewerIndex}
          owner={owner}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
          onDelete={album.remove}
          onToggleLike={album.toggleLike}
          onComment={album.comment}
          onDeleteComment={album.deleteComment}
        />
      )}

      {toDelete && (
        <ConfirmModal
          title="Удаление фотографии"
          text="Вы действительно хотите удалить эту фотографию?"
          onConfirm={() => {
            album.remove(toDelete);
            setToDelete(null);
          }}
          onClose={() => setToDelete(null)}
        />
      )}
    </section>
  );
}

// ---------- «Создать пост»: свёрнутая кнопка раскрывается в редактор ----------
function CreatePost({
  owner,
  isMe,
  onPublish,
}: {
  owner: Person;
  isMe: boolean;
  onPublish: (data: PublishData) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <Composer
        autoFocus
        placeholder={
          isMe ? "Что у вас нового?" : "Напишите что-нибудь на стене…"
        }
        onPublish={async (data) => {
          const ok = await onPublish({ ownerId: owner.id, ...data });
          if (ok) setOpen(false);
          return ok;
        }}
        onCancel={() => setOpen(false)}
      />
    );
  }

  return (
    <div className="card create-post">
      <button className="create-post__main" onClick={() => setOpen(true)}>
        <PlusIcon size={22} />
        {isMe ? "Создать пост" : "Написать на стене"}
      </button>
    </div>
  );
}

// ---------- Стена ----------
const WALL_TABS: { id: "all" | "own"; label: string }[] = [
  { id: "all", label: "Все записи" },
  { id: "own", label: "Записи владельца" },
];

function Wall({ owner, isMe, feed }: { owner: Person; isMe: boolean; feed: PostsFeed }) {
  const [tab, setTab] = useState<"all" | "own">("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  // Фильтры по вкладке и поиску — поверх загруженной стены
  const view = useMemo(
    () => ({
      ...feed,
      posts: feed.posts
        .filter((p) => tab === "all" || p.author.id === owner.id)
        .filter((p) => !q || p.text.toLowerCase().includes(q)),
    }),
    [feed, tab, q, owner.id],
  );

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
  };

  return (
    <>
      <div className="card wall-head">
        {searchOpen ? (
          <div className="wall-search">
            <SearchIcon size={20} />
            <input
              autoFocus
              placeholder="Поиск по записям"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && closeSearch()}
            />
            <button className="btn btn--tertiary" onClick={closeSearch}>
              Отмена
            </button>
          </div>
        ) : (
          <>
            <div className="wall-tabs">
              {WALL_TABS.map((t) => (
                <button
                  key={t.id}
                  className={`seg ${tab === t.id ? "active" : ""}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.id === "own" && isMe ? "Мои записи" : t.label}
                </button>
              ))}
            </div>
            <button
              className="icon-btn"
              title="Поиск по записям"
              onClick={() => setSearchOpen(true)}
            >
              <SearchIcon size={20} />
            </button>
          </>
        )}
      </div>

      <PostList
        feed={view}
        emptyText={
          q
            ? "По вашему запросу ничего не найдено"
            : "На стене пока нет ни одной записи"
        }
      />
    </>
  );
}

// ---------- Друзья человека (правая колонка) ----------
function FriendsCard({ owner, isMe }: { owner: Person; isMe: boolean }) {
  const mine = useFriends();
  const theirs = useFriendsOf(isMe ? null : owner.id);
  const friends = isMe ? mine.friends : (theirs.data ?? []);
  const loading = isMe
    ? mine.status === "loading"
    : theirs.loading && !theirs.data;

  return (
    <section className="card">
      <a
        className="card__header card__header--link"
        href={isMe ? "#friends" : undefined}
      >
        Друзья <span className="muted">{loading ? "" : friends.length}</span>
      </a>
      {loading ? (
        <div className="media__empty" role="status">
          <div className="chat-status__spinner" />
        </div>
      ) : friends.length ? (
        <div className="friends-mini friends-mini--wide">
          {friends.slice(0, 8).map((p) => (
            <a key={p.id} href={`#user/${p.id}`}>
              <Avatar name={p.name} color={p.color} src={p.avatar} size={64} />
              <span>{p.firstName}</span>
            </a>
          ))}
        </div>
      ) : (
        <div className="friends-empty">
          {isMe ? (
            <>
              Пока нет друзей. <a href="#friends/search">Найти знакомых</a>
            </>
          ) : (
            "Пока нет друзей"
          )}
        </div>
      )}
    </section>
  );
}

// ---------- Подписки: сообщества человека (как в VK — в правой колонке) ----------
function SubscriptionsCard({ userId, isMe }: { userId: string; isMe: boolean }) {
  const list = useResource(
    () => fetchUserCommunities(userId).catch((): CommunityBrief[] => []),
    [userId],
  );
  const communities = list.data ?? [];
  if (!communities.length) return null;
  return (
    <section className="card">
      <a
        className="card__header card__header--link"
        href={isMe ? "#communities" : undefined}
      >
        Подписки <span className="muted">{communities.length}</span>
      </a>
      <div className="subs-list">
        {communities.slice(0, 5).map((c) => (
          <a key={c.id} href={`#club/${c.id}`} className="subs-item">
            <Avatar
              name={c.name}
              color={c.color}
              src={c.avatar}
              size={40}
              empty={false}
            />
            <div>
              <div className="subs-item__name">{c.name}</div>
              <div className="subs-item__desc">
                {c.isPage ? "Публичная страница" : "Группа"}
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

// ---------- «⋯» на чужой странице: заблокировать / разблокировать ----------
function ProfileMoreMenu({ person }: { person: Person }) {
  const menu = useDropdown();
  const { isBlocked, block, unblock } = useBlocks();
  const { isSaved, toggle } = useBookmarks();
  const [confirm, setConfirm] = useState(false);
  const blocked = isBlocked(person.id);
  const saved = isSaved("person", person.id);
  return (
    <div className="profile-more" ref={menu.ref}>
      <button className="btn btn--neutral btn--icon" title="Ещё" onClick={menu.toggle}>
        <MoreIcon size={18} />
      </button>
      {menu.open && (
        <div className="dropdown dropdown--right profile-more__dropdown">
          <button
            className="dropdown__item"
            onClick={() => {
              menu.close();
              toggle("person", person.id);
            }}
          >
            {saved ? <BookmarkFilledIcon /> : <BookmarkIcon />} {saved ? "Удалить из закладок" : "Добавить в закладки"}
          </button>
          <button
            className={`dropdown__item ${blocked ? "" : "dropdown__item--danger"}`}
            onClick={() => {
              menu.close();
              if (blocked) unblock(person);
              else setConfirm(true);
            }}
          >
            <BlockIcon /> {blocked ? "Разблокировать" : "Заблокировать"}
          </button>
        </div>
      )}
      {confirm && (
        <BlockModal
          person={person}
          onClose={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            block(person);
          }}
        />
      )}
    </div>
  );
}

// ---------- Страница ----------
export default function Profile({ userId, onNavigate }: { userId: string; onNavigate: Navigate }) {
  const { myId, profile: myProfile } = useProfile();
  const { relationTo } = useFriends();
  const { openChat } = useChatActions();
  const { isBlocked, hasBlockedMe, unblock, refreshBlockedMe } = useBlocks();
  const onlineIds = useOnlineIds();
  const isMe = userId === myId;
  const other = useUserProfile(isMe ? myId : userId);
  // Не заблокировал ли меня хозяин страницы — проверяем при каждом открытии
  useEffect(() => {
    if (!isMe) refreshBlockedMe();
  }, [isMe, userId, refreshBlockedMe]);
  const profile = isMe ? myProfile : other.data;
  const feed = usePosts({ wall: userId });
  const album = usePhotos(userId); // общий для аватара и блока «Фото»
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [sharing, setSharing] = useState(false);

  if (!isMe && other.loading && !other.data) {
    return (
      <div className="card list-state" role="status">
        <div className="chat-status__spinner" />
        Загружаем страницу…
      </div>
    );
  }

  if (!isMe && other.error) {
    return (
      <div className="card list-state" role="alert">
        Не удалось загрузить страницу: {other.error}
        <button className="btn" onClick={other.reload}>
          Повторить
        </button>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="card list-state">
        Такой страницы нет — возможно, пользователь удалил аккаунт.
        <a className="btn" href="#feed">
          В ленту
        </a>
      </div>
    );
  }

  const name = fullName(profile);
  const person: Person = {
    id: profile.id,
    name,
    firstName: profile.firstName,
    lastName: profile.lastName,
    color: profile.color,
    avatar: profile.avatar,
    city: profile.contacts.city,
    gender: profile.gender,
  };
  const education = formatEducation(profile.education);
  const iBlocked = !isMe && isBlocked(userId);
  const blockedMe = !isMe && hasBlockedMe(userId);
  const canPost = (isMe || relationTo(userId) === "friend") && !iBlocked && !blockedMe;
  const she = profile.gender === "female";

  // Меня заблокировали — как в VK: только имя и аватар, без записей и кнопок
  if (blockedMe) {
    return (
      <div className="card profile-head">
        <div className="profile-cover" style={{ background: DEFAULT_COVER }} />
        <div className="profile-info">
          <div className="profile-info__avatar">
            <div className="avatar-frame">
              <Avatar name={name} color={profile.color} src={profile.avatar} size={148} />
            </div>
          </div>
          <div className="profile-info__meta">
            <h1 className="profile-info__name">{name}</h1>
          </div>
        </div>
        <div className="profile-blocked">
          <BlockIcon size={40} />
          <div className="profile-blocked__title">
            {profile.firstName} {she ? "ограничила" : "ограничил"} вам доступ к своей странице
          </div>
          <div className="muted">Вы не можете просматривать записи, писать сообщения и добавлять в друзья.</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card profile-head">
        <Cover profile={profile} editable={isMe} />
        <div className="profile-info">
          <ProfileAvatar
            profile={profile}
            editable={isMe}
            owner={person}
            album={album}
          />
          <div className="profile-info__meta">
            <h1 className="profile-info__name">
              {name}
              {!isMe && (
                <span className={`profile-info__online ${onlineIds.has(profile.id) ? "profile-info__online--on" : ""}`}>
                  {onlineIds.has(profile.id) ? "в сети" : lastSeen(profile.gender)}
                </span>
              )}
            </h1>
            <Status profile={profile} editable={isMe} />
            <div className="profile-info__details">
              {profile.contacts.city && (
                <span className="profile-info__chip">
                  <MapPinIcon size={20} />
                  {profile.contacts.city}
                </span>
              )}
              {education && (
                <span className="profile-info__chip">
                  <EducationIcon size={20} />
                  {education}
                </span>
              )}
              <button
                className="profile-info__chip profile-info__more"
                onClick={() => setDetailsOpen(true)}
              >
                <InfoIcon size={20} />
                Подробнее
              </button>
            </div>
          </div>
          <div className="profile-info__actions">
            {isMe ? (
              <button
                className="btn btn--neutral"
                onClick={() => onNavigate("edit")}
              >
                Редактировать профиль
              </button>
            ) : iBlocked ? (
              <button className="btn" onClick={() => unblock(person)}>
                Разблокировать
              </button>
            ) : (
              <>
                <FriendButton person={person} />
                <button
                  className="btn btn--neutral btn--icon"
                  title="Написать сообщение"
                  aria-label="Написать сообщение"
                  onClick={() => {
                    openChat(person);
                    onNavigate("messages");
                  }}
                >
                  <MessageIcon size={18} />
                </button>
              </>
            )}
            <button
              className="btn btn--neutral btn--icon"
              title="Поделиться страницей"
              onClick={() => setSharing(true)}
            >
              <ShareIcon size={18} />
            </button>
            {!isMe && <ProfileMoreMenu person={person} />}
          </div>
        </div>
        {iBlocked && (
          <div className="profile-blocked profile-blocked--mine">
            {name} в вашем чёрном списке: {she ? "она" : "он"} не может писать вам, комментировать ваши записи и не
            видит вашу страницу.
          </div>
        )}
      </div>

      {sharing && (
        <ShareModal
          shared={{ type: "profile", id: profile.id }}
          link={`#user/${profile.id}`}
          onClose={() => setSharing(false)}
        />
      )}

      {detailsOpen && (
        <ProfileDetailsModal
          profile={profile}
          onClose={() => setDetailsOpen(false)}
          onEdit={
            isMe
              ? () => {
                  setDetailsOpen(false);
                  onNavigate("edit");
                }
              : undefined
          }
        />
      )}

      <div className="columns columns--profile">
        <div>
          <MediaCard owner={person} isMe={isMe} album={album} />
          {canPost && (
            <CreatePost owner={person} isMe={isMe} onPublish={feed.publish} />
          )}
          <Wall owner={person} isMe={isMe} feed={feed} />
        </div>

        <aside className="columns__side">
          <FriendsCard owner={person} isMe={isMe} />
          <SubscriptionsCard userId={profile.id} isMe={isMe} />
        </aside>
      </div>
    </>
  );
}
