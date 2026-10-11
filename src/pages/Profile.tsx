import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Avatar from "../components/Avatar";
import Composer from "../components/Composer";
import EmojiPicker from "../components/EmojiPicker";
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
import { useSnackbar } from "../components/Snackbar";
import {
  AlbumsIcon,
  BlockIcon,
  BookmarkFilledIcon,
  BookmarkIcon,
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
  ChevronRightIcon,
  TrashIcon,
  VideoIcon,
  type Icon,
} from "../components/Icons";
import { useProfile } from "../context/ProfileContext";
import { useFriends } from "../context/FriendsContext";
import { useChatActions, useOnlineIds } from "../context/ChatContext";
import { bg } from "../data";
import { formatEducation, fullName } from "../profile";
import {
  useDismiss,
  useDropdown,
  useFileDrop,
  useFilePicker,
  useKeyboardInset,
  useMediaQuery,
  useScrollLock,
} from "../hooks";
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

const removeOld = (url: string | null, folder: string) =>
  url?.includes(`/${folder}/`) && removeImage(url).catch(() => {});

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
  const onlineIds = useOnlineIds();
  const [modal, setModal] = useState<"upload" | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

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
      <div className="avatar-frame">
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

    </div>
  );
}

const SHEET_DISMISS_DRAG = 90;

function StatusSheet({
  initial,
  onSave,
  onClose,
}: {
  initial: string;
  onSave: (status: string) => void;
  onClose: () => void;
}) {
  useScrollLock();
  const keyboard = useKeyboardInset();
  const [value, setValue] = useState(initial);
  const [closing, setClosing] = useState(false);
  const [drag, setDrag] = useState(0);
  const dragFrom = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pending = useRef<string | null>(null);

  const close = useCallback((save: string | null = null) => {
    pending.current = save;
    setClosing(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const finish = () => {
    if (!closing) return;
    if (pending.current !== null) onSave(pending.current);
    onClose();
  };

  const trimmed = value.trim();
  const left = STATUS_LIMIT - value.length;

  return createPortal(
    <div
      className={`status-sheet ${closing ? "status-sheet--closing" : ""}`}
      style={{ "--kb": `${keyboard}px` } as CSSProperties}
      onMouseDown={(e) => e.target === e.currentTarget && close()}
      onAnimationEnd={(e) => e.target === e.currentTarget && finish()}
    >
      <form
        className={`status-sheet__panel ${drag ? "status-sheet__panel--drag" : ""}`}
        style={drag ? { transform: `translateY(${drag}px)` } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label="Статус"
        onSubmit={(e) => {
          e.preventDefault();
          close(trimmed === initial ? null : trimmed);
        }}
      >
        <div
          className="status-sheet__head"
          onTouchStart={(e) => (dragFrom.current = e.touches[0].clientY)}
          onTouchMove={(e) => {
            if (dragFrom.current === null) return;
            setDrag(Math.max(0, e.touches[0].clientY - dragFrom.current));
          }}
          onTouchEnd={() => {
            dragFrom.current = null;
            if (drag > SHEET_DISMISS_DRAG) close();
            else setDrag(0);
          }}
        >
          <div className="sheet__grip" />
          <div className="status-sheet__title-row">
            <h2 className="status-sheet__title">Статус</h2>
            <button
              type="button"
              className="icon-btn status-sheet__close"
              aria-label="Закрыть"
              onClick={() => close()}
            >
              <CloseIcon size={22} />
            </button>
          </div>
          <p className="status-sheet__hint">Его увидят все, кто откроет вашу страницу</p>
        </div>

        <div className="status-sheet__field">
          <textarea
            ref={inputRef}
            rows={1}
            autoFocus
            value={value}
            maxLength={STATUS_LIMIT}
            enterKeyHint="done"
            placeholder="Что у вас нового?"
            aria-label="Статус"
            onFocus={(e) => {
              const end = e.currentTarget.value.length;
              e.currentTarget.setSelectionRange(end, end);
            }}
            onChange={(e) => setValue(e.target.value.replace(/\s*\n\s*/g, " "))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <EmojiPicker inputRef={inputRef} value={value} onChange={setValue} placement="top" size={22} />
        </div>
        <div className={`status-sheet__counter ${left <= 10 ? "status-sheet__counter--low" : ""}`}>
          {value.length} / {STATUS_LIMIT}
        </div>

        <div className="status-sheet__actions">
          {initial && (
            <button type="button" className="btn btn--neutral status-sheet__clear" onClick={() => close("")}>
              Очистить
            </button>
          )}
          <button className="btn status-sheet__save" disabled={trimmed === initial}>
            Сохранить
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function Status({ profile, editable }: { profile: ProfileType; editable: boolean }) {
  const { updateProfile } = useProfile();
  const phone = useMediaQuery("(max-width: 760px)");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(profile.status);
  const ref = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancel = useCallback(() => setEditing(false), []);
  useDismiss(ref, editing && !phone, cancel);

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
    const next = value.trim();
    if (next !== profile.status) await updateProfile({ status: next });
  };

  return (
    <div className="profile-info__status status-wrap">
      <button
        type="button"
        className={`status ${profile.status ? "" : "status--empty"}`}
        onClick={start}
        aria-expanded={editing}
      >
        {profile.status || "изменить статус"}
      </button>
      {editing && phone && (
        <StatusSheet
          initial={profile.status}
          onSave={(status) => updateProfile({ status })}
          onClose={cancel}
        />
      )}
      {editing && !phone && (
        <form className="status-editor" ref={ref} onSubmit={save}>
          <div className="status-editor__field">
            <input
              ref={inputRef}
              className="field"
              autoFocus
              value={value}
              maxLength={STATUS_LIMIT}
              onChange={(e) => setValue(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              placeholder="Введите статус"
              aria-label="Статус"
            />
            <EmojiPicker
              inputRef={inputRef}
              value={value}
              onChange={setValue}
              placement="bottom"
              size={20}
            />
          </div>
          <button className="btn status-editor__save">Сохранить</button>
        </form>
      )}
    </div>
  );
}

type MediaTab = "photos" | "albums" | "music" | "video";

const MEDIA_TABS: { id: MediaTab; label: string; Icon: Icon }[] = [
  { id: "photos", label: "Фото", Icon: PhotoIcon },
  { id: "albums", label: "Альбомы", Icon: AlbumsIcon },
  { id: "music", label: "Музыка", Icon: MusicIcon },
  { id: "video", label: "Видео", Icon: VideoIcon },
];
const PHOTOS_PREVIEW = 6;

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
  const askDelete = (photo: Photo) => (isMe ? () => setToDelete(photo) : undefined);

  return (
    <section
      className={`card media ${dragOver && isMe ? "media--drag" : ""}`}
      {...(isMe ? dropProps : {})}
    >
      <div className="media__tabs" role="tablist">
        {MEDIA_TABS.map(({ id, label, Icon }) => (
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
      ) : (
        <VideoTab owner={owner} isMe={isMe} />
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

const WALL_TABS: { id: "all" | "own"; label: string }[] = [
  { id: "all", label: "Все записи" },
  { id: "own", label: "Записи владельца" },
];

function Wall({ owner, isMe, feed }: { owner: Person; isMe: boolean; feed: PostsFeed }) {
  const [tab, setTab] = useState<"all" | "own">("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

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

const MINI_STRIP_LIMIT = 8;

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
        <ChevronRightIcon size={20} className="card__header-chevron" />
      </a>
      {loading ? (
        <div className="media__empty" role="status">
          <div className="chat-status__spinner" />
        </div>
      ) : friends.length ? (
        <div className="friends-mini friends-mini--wide">
          {friends.slice(0, MINI_STRIP_LIMIT).map((p) => (
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
        <ChevronRightIcon size={20} className="card__header-chevron" />
      </a>
      <div className="subs-list">
        {communities.slice(0, MINI_STRIP_LIMIT).map((c) => (
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

export default function Profile({ userId, onNavigate }: { userId: string; onNavigate: Navigate }) {
  const { myId, profile: myProfile } = useProfile();
  const { relationTo } = useFriends();
  const { openChat } = useChatActions();
  const { isBlocked, hasBlockedMe, unblock, refreshBlockedMe } = useBlocks();
  const onlineIds = useOnlineIds();
  const isMe = userId === myId;
  const other = useUserProfile(isMe ? myId : userId);
  useEffect(() => {
    if (!isMe) refreshBlockedMe();
  }, [isMe, userId, refreshBlockedMe]);
  const profile = isMe ? myProfile : other.data;
  const feed = usePosts({ wall: userId });
  const album = usePhotos(userId);
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
        <div className="profile-main">
          <div className="profile-main__media">
            <MediaCard owner={person} isMe={isMe} album={album} />
          </div>
          <div className="profile-main__wall">
            {canPost && (
              <CreatePost owner={person} isMe={isMe} onPublish={feed.publish} />
            )}
            <Wall owner={person} isMe={isMe} feed={feed} />
          </div>
        </div>

        <aside className="columns__side">
          <FriendsCard owner={person} isMe={isMe} />
          <SubscriptionsCard userId={profile.id} isMe={isMe} />
        </aside>
      </div>
    </>
  );
}
