import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ConfirmModal from "./ConfirmModal";
import EmojiPicker from "./EmojiPicker";
import ShareModal from "./ShareModal";
import MoveToAlbumModal from "./photos/MoveToAlbumModal";
import Avatar from "./Avatar";
import MeAvatar from "./MeAvatar";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  CommentIcon,
  DownloadIcon,
  ImageCoverIcon,
  BookmarkFilledIcon,
  BookmarkIcon,
  LikeIcon,
  MoveIcon,
  SendIcon,
  ShareIcon,
  UserIcon,
} from "./Icons";
import { useSnackbar } from "./Snackbar";
import { useBookmarks } from "../context/BookmarksContext";
import { useProfile } from "../context/ProfileContext";
import { useDropdown, useScrollLock } from "../hooks";
import { formatCount, formatDate } from "../utils";
import type { Album, Comment, Photo } from "../types";

// Владелец фото для шапки просмотра: человек или сообщество
export interface PhotoOwner {
  id: string;
  name: string;
  firstName?: string;
  color: string;
  avatar: string | null;
}

// ---------- «Ещё» под фото ----------
type MenuAction = (() => void) | false | null | undefined | 0;

function MoreMenu({
  photo,
  onMakeAvatar,
  onMove,
  onSetCover,
}: {
  photo: Photo;
  onMakeAvatar: MenuAction;
  onMove?: MenuAction;
  onSetCover?: MenuAction;
}) {
  const { open, ref, close, toggle } = useDropdown();

  return (
    <div className="viewer__more" ref={ref}>
      <button className="viewer__link" onClick={toggle}>
        Ещё <ChevronDownIcon size={16} />
      </button>
      {open && (
        <div className="dropdown viewer__dropdown">
          {onMakeAvatar && (
            <button
              className="dropdown__item"
              onClick={() => {
                close();
                onMakeAvatar();
              }}
            >
              <UserIcon /> Сделать фото профиля
            </button>
          )}
          {onMove && (
            <button
              className="dropdown__item"
              onClick={() => {
                close();
                onMove();
              }}
            >
              <MoveIcon /> Перенести в альбом
            </button>
          )}
          {onSetCover && (
            <button
              className="dropdown__item"
              onClick={() => {
                close();
                onSetCover();
              }}
            >
              <ImageCoverIcon /> Сделать обложкой альбома
            </button>
          )}
          <a
            className="dropdown__item"
            href={photo.src}
            download="photo.jpg"
            target="_blank"
            rel="noreferrer"
            onClick={close}
          >
            <DownloadIcon /> Скачать
          </a>
        </div>
      )}
    </div>
  );
}

// ---------- Просмотр фото как в VK: фото слева, автор и комментарии справа ----------
// owner — владелец фото; удалять фото и ставить на аватар может только он сам.
// Действия — из usePhotos: onDelete, onToggleLike, onComment, onDeleteComment
export default function PhotoViewer({
  photos,
  index,
  owner,
  album,
  onIndexChange,
  onClose,
  onDelete,
  onToggleLike,
  onComment,
  onDeleteComment,
  // Для фото сообщества: canManage — может удалять, ownerHref — ссылка на сообщество,
  // allowMakeAvatar={false} — без «Сделать фото профиля»
  canManage,
  ownerHref,
  allowMakeAvatar = true,
  // Альбомы владельца: albums — список, onMove(photo, albumId, title), onSetCover(photo) — только внутри альбома
  albums,
  onMove,
  onSetCover,
}: {
  photos: Photo[];
  index: number;
  owner: PhotoOwner;
  album?: string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onDelete: (photo: Photo) => void;
  onToggleLike: (photo: Photo) => void;
  onComment: (photo: Photo, text: string) => Promise<boolean>;
  onDeleteComment: (photo: Photo, comment: Comment) => void;
  canManage?: boolean;
  ownerHref?: string;
  allowMakeAvatar?: boolean;
  albums?: Album[];
  onMove?: (photo: Photo, albumId: number | null, title: string) => void;
  onSetCover?: (photo: Photo) => void;
}) {
  const { myId, updateProfile } = useProfile();
  const showSnackbar = useSnackbar();
  const [confirming, setConfirming] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const isMine = canManage ?? owner.id === myId;
  const { isSaved, toggle: toggleBookmark } = useBookmarks();
  const href = ownerHref ?? `#user/${owner.id}`;
  const commentsRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const count = photos.length;
  const photo = photos[index];

  const go = useCallback(
    (step: number) => {
      onIndexChange((index + step + count) % count);
      setComment("");
    },
    [index, count, onIndexChange],
  );

  // ← → листают (кроме ввода комментария), Esc закрывает.
  // Пока открыто подтверждение удаления, клавиши обрабатывает оно
  useEffect(() => {
    if (confirming || sharing || moving) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if ((e.target as HTMLElement | null)?.tagName === "INPUT" || count < 2) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirming, sharing, moving, count, go, onClose]);

  useScrollLock();

  if (!photo) return null;

  const remove = () => {
    setConfirming(false);
    onDelete(photo);
    if (count === 1) onClose();
    else if (index === count - 1) onIndexChange(index - 1);
  };

  const share = () => setSharing(true);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = comment.trim();
    if (!text || sending) return;
    setSending(true);
    const ok = await onComment(photo, text);
    setSending(false);
    if (!ok) return;
    setComment("");
    // Прокручиваем к новому комментарию
    requestAnimationFrame(() => {
      const el = commentsRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  return createPortal(
    <div
      className="viewer"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <button className="viewer__close" onClick={onClose} title="Закрыть">
        <CloseIcon size={28} />
      </button>

      <div className="viewer__box">
        {/* ---------- Фото ---------- */}
        <div className="viewer__stage">
          <div className="viewer__image">
            {photo.src === failedSrc ? (
              <div className="viewer__broken">Не удалось загрузить фотографию</div>
            ) : (
              <img
                src={photo.src}
                alt=""
                onClick={() => count > 1 && go(1)}
                onError={() => setFailedSrc(photo.src)}
                style={{ cursor: count > 1 ? "pointer" : "default" }}
              />
            )}
            {count > 1 && (
              <>
                <button className="viewer__nav viewer__nav--prev" onClick={() => go(-1)} title="Предыдущая">
                  <ChevronLeftIcon size={32} />
                </button>
                <button className="viewer__nav viewer__nav--next" onClick={() => go(1)} title="Следующая">
                  <ChevronRightIcon size={32} />
                </button>
              </>
            )}
          </div>

          <div className="viewer__bar">
            <span className="viewer__album">{album ?? `Фотографии · ${owner.name}`}</span>
            <span className="viewer__counter">
              {index + 1} из {count}
            </span>
            <div className="viewer__links">
              <button className="viewer__link" onClick={share}>
                Поделиться
              </button>
              {isMine && !photo.readOnly && (
                <>
                  <span className="viewer__dot">·</span>
                  <button className="viewer__link" onClick={() => setConfirming(true)}>
                    Удалить
                  </button>
                </>
              )}
              <span className="viewer__dot">·</span>
              <MoreMenu
                photo={photo}
                onMakeAvatar={
                  isMine &&
                  allowMakeAvatar &&
                  !photo.readOnly &&
                  (async () => {
                    if (await updateProfile({ avatar: photo.src })) {
                      showSnackbar("Фотография профиля обновлена");
                    }
                  })
                }
                onMove={isMine && onMove && albums && !photo.readOnly && (() => setMoving(true))}
                onSetCover={isMine && onSetCover && photo.albumId && (() => onSetCover(photo))}
              />
            </div>
          </div>
        </div>

        {/* ---------- Автор, лайки, комментарии ---------- */}
        <aside className="viewer__side">
          <header className="viewer__author">
            <Avatar name={owner.name} color={owner.color} src={owner.avatar} size={48} />
            <div>
              <a href={href} className="viewer__name" onClick={onClose}>
                {owner.name}
              </a>
              <div className="viewer__date">{formatDate(photo.createdAt)}</div>
            </div>
          </header>

          {photo.readOnly ? (
            <div className="viewer__comments">
              <div className="viewer__empty">
                Это фото загружено на аватар раньше, чем появились лайки и комментарии. Обновите
                фотографию профиля — и её можно будет оценить и обсудить.
              </div>
            </div>
          ) : (
            <>
            <div className="viewer__actions">
              <button
                className={`viewer__action ${photo.liked ? "viewer__action--liked" : ""}`}
                onClick={() => onToggleLike(photo)}
                title="Нравится"
              >
                <LikeIcon size={28} filled={photo.liked} />
                {photo.likes > 0 && <span>{formatCount(photo.likes)}</span>}
              </button>
              <button className="viewer__action" onClick={share} title="Поделиться">
                <ShareIcon size={28} />
              </button>
              <button
                className={`viewer__action ${isSaved("photo", photo.id) ? "viewer__action--saved" : ""}`}
                onClick={() => toggleBookmark("photo", photo.id)}
                title={isSaved("photo", photo.id) ? "Удалить из закладок" : "В закладки"}
              >
                {isSaved("photo", photo.id) ? <BookmarkFilledIcon size={28} /> : <BookmarkIcon size={28} />}
              </button>
            </div>

            <div className="viewer__comments" ref={commentsRef}>
              {photo.comments.length === 0 ? (
                <div className="viewer__empty">
                  <CommentIcon size={56} />
                  Оставьте первый комментарий к этой фотографии
                </div>
              ) : (
                photo.comments.map((c) => (
                  <div key={c.id} className="comment viewer__comment">
                    <Avatar name={c.author.name} color={c.author.color} src={c.author.avatar} size={32} />
                    <div className="comment__body">
                      <a href={`#user/${c.author.id}`} className="comment__name" onClick={onClose}>
                        {c.author.name}
                      </a>
                      <div className="comment__text">{c.text}</div>
                      <div className="comment__meta">
                        <span>{formatDate(c.createdAt)}</span>
                        {(isMine || c.author.id === myId) && (
                          <button className="comment__reply" onClick={() => onDeleteComment(photo, c)}>
                            Удалить
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <form className="viewer__form" onSubmit={submit}>
              <MeAvatar size={32} />
              <input
                ref={commentInputRef}
                placeholder="Написать комментарий..."
                maxLength={2000}
                disabled={sending}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <EmojiPicker inputRef={commentInputRef} value={comment} onChange={setComment} size={20} />
              {comment.trim() && (
                <button className="icon-btn icon-btn--sm comment-form__send" title="Отправить">
                  <SendIcon size={20} />
                </button>
              )}
            </form>
            </>
          )}
        </aside>
      </div>

      {moving && albums && (
        <MoveToAlbumModal
          albums={albums}
          currentAlbumId={photo.albumId}
          onMove={(albumId, title) => {
            setMoving(false);
            onMove?.(photo, albumId, title);
          }}
          onClose={() => setMoving(false)}
        />
      )}

      {sharing && (
        <ShareModal
          // Старый аватар без записи в «Фото» — делимся страницей владельца
          shared={photo.readOnly ? { type: "profile", id: owner.id } : { type: "photo", id: photo.id }}
          link={href}
          onClose={() => setSharing(false)}
        />
      )}

      {confirming && (
        <ConfirmModal
          title="Удаление фотографии"
          text="Вы действительно хотите удалить эту фотографию?"
          onConfirm={remove}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>,
    document.body,
  );
}
