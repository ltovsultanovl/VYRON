import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Avatar from "../Avatar";
import MeAvatar from "../MeAvatar";
import EmojiPicker from "../EmojiPicker";
import ShareModal from "../ShareModal";
import ConfirmModal from "../ConfirmModal";
import EditVideoModal from "./EditVideoModal";
import { useSnackbar } from "../Snackbar";
import {
  CheckIcon,
  CloseIcon,
  CommentIcon,
  LikeIcon,
  PencilIcon,
  PlusIcon,
  SendIcon,
  ShareIcon,
  BookmarkFilledIcon,
  BookmarkIcon,
} from "../Icons";
import { useBookmarks } from "../../context/BookmarksContext";
import { useProfile } from "../../context/ProfileContext";
import { usePlayer } from "../../context/PlayerContext";
import { useVideos } from "../../context/VideoContext";
import { useScrollLock } from "../../hooks";
import { useResource } from "../../resources";
import * as api from "../../api";
import { formatCount, formatDate } from "../../utils";
import { viewsLabel } from "./format";
import type { Comment, Video } from "../../types";

// Просмотр видео как в VK: плеер, под ним название и действия, справа комментарии.
// video — уже загруженный объект (из списка) или null — тогда грузим по id
export default function VideoViewer({
  id,
  video: initial,
  onClose,
  onChange,
  onDeleted,
}: {
  id: number;
  video?: Video | null;
  onClose: () => void;
  onChange?: (id: number, data: Partial<Video>) => void;
  onDeleted?: (video: Video) => void;
}) {
  const { myId } = useProfile();
  const showSnackbar = useSnackbar();
  const player = usePlayer();
  const library = useVideos();
  const { isSaved, toggle: toggleBookmark } = useBookmarks();
  const fresh = useResource(() => api.fetchVideo(id, myId), [id, myId]);
  const [video, setVideo] = useState<Video | null>(initial ?? null);
  const comments = useResource(() => api.fetchVideoComments(id), [id]);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [modal, setModal] = useState<"share" | "edit" | "delete" | null>(null);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const commentsRef = useRef<HTMLDivElement>(null);
  useScrollLock();

  // Свежие данные с сервера заменяют то, что пришло из списка
  const [seen, setSeen] = useState<Video | null>(null);
  if (fresh.data && fresh.data !== seen) {
    setSeen(fresh.data);
    setVideo(fresh.data);
  }

  const update = (data: Partial<Video>) => {
    setVideo((v) => (v ? { ...v, ...data } : v));
    onChange?.(id, data);
    library.patch(id, data);
  };

  // Просмотр засчитываем один раз при открытии
  useEffect(() => {
    let cancelled = false;
    api.viewVideo(id).then(
      (views) => !cancelled && typeof views === "number" && update({ views }),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (modal) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modal, onClose]);

  const toggleLike = async () => {
    if (!video) return;
    const liked = !video.liked;
    update({ liked, likes: video.likes + (liked ? 1 : -1) });
    try {
      await api.setVideoLiked(id, myId, liked);
    } catch (e) {
      update({ liked: !liked, likes: video.likes });
      showSnackbar(api.explainError(e), "error");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = comment.trim();
    if (!text || sending || !video) return;
    setSending(true);
    try {
      const c = await api.addVideoComment(id, text);
      comments.setData((list) => [...(list ?? []), c]);
      update({ commentsCount: video.commentsCount + 1 });
      setComment("");
      requestAnimationFrame(() => {
        const el = commentsRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    } catch (err) {
      showSnackbar(
        `Комментарий не отправлен: ${api.explainError(err)}`,
        "error",
      );
    } finally {
      setSending(false);
    }
  };

  const deleteComment = async (c: Comment) => {
    comments.update((list) => list.filter((x) => x.id !== c.id));
    if (video) update({ commentsCount: Math.max(0, video.commentsCount - 1) });
    try {
      await api.deleteVideoComment(c.id);
    } catch (e) {
      comments.reload();
      showSnackbar(api.explainError(e), "error");
    }
  };

  const mine = video?.ownerId === myId;
  const added = video && library.has(video);

  return createPortal(
    <div
      className="viewer video-viewer"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <button className="viewer__close" onClick={onClose} title="Закрыть">
        <CloseIcon size={28} />
      </button>

      <div className="viewer__box video-viewer__box">
        {!video ? (
          <div className="video-viewer__state">
            {fresh.error ? (
              <>
                Не удалось загрузить видео: {fresh.error}
                <button className="btn" onClick={fresh.reload}>
                  Повторить
                </button>
              </>
            ) : fresh.loading ? (
              <div className="chat-status__spinner" />
            ) : (
              "Видео не найдено — возможно, его удалили"
            )}
          </div>
        ) : (
          <>
            <div className="video-viewer__main">
              <div className="video-viewer__stage">
                {failed ? (
                  <div className="viewer__broken">
                    Не удалось воспроизвести видео
                  </div>
                ) : (
                  <video
                    key={video.url}
                    src={video.url}
                    poster={video.poster ?? undefined}
                    controls
                    autoPlay
                    playsInline
                    onPlay={() => player.playing && player.pause()}
                    onError={() => setFailed(true)}
                  />
                )}
              </div>
              <div className="video-viewer__info">
                <h2 className="video-viewer__title">{video.title}</h2>
                <div className="video-viewer__meta">
                  {viewsLabel(video.views)} · {formatDate(video.createdAt)}
                </div>
                <div className="video-viewer__actions">
                  <button
                    className={`pill ${video.liked ? "pill--liked" : ""}`}
                    onClick={toggleLike}
                    title="Нравится"
                  >
                    <LikeIcon filled={video.liked} />
                    {video.likes > 0 && <span>{formatCount(video.likes)}</span>}
                  </button>
                  <button
                    className="pill"
                    onClick={() => setModal("share")}
                    title="Поделиться"
                  >
                    <ShareIcon />
                  </button>
                  <button
                    className={`pill ${isSaved("video", video.id) ? "pill--saved" : ""}`}
                    onClick={() => toggleBookmark("video", video.id)}
                    title={isSaved("video", video.id) ? "Удалить из закладок" : "В закладки"}
                  >
                    {isSaved("video", video.id) ? <BookmarkFilledIcon /> : <BookmarkIcon />}
                  </button>
                  <button
                    className={`btn btn--neutral video-viewer__add ${added ? "video-viewer__add--on" : ""}`}
                    onClick={() =>
                      added ? library.remove(video) : library.add(video)
                    }
                  >
                    {added ? <CheckIcon size={18} /> : <PlusIcon size={18} />}
                    {added ? "В моих видео" : "Добавить к себе"}
                  </button>
                  {mine && (
                    <button
                      className="btn btn--neutral"
                      onClick={() => setModal("edit")}
                    >
                      <PencilIcon size={18} /> Редактировать
                    </button>
                  )}
                </div>
                {video.owner && (
                  <a
                    className="video-viewer__owner"
                    href={`#user/${video.owner.id}`}
                    onClick={onClose}
                  >
                    <Avatar
                      name={video.owner.name}
                      color={video.owner.color}
                      src={video.owner.avatar}
                      size={40}
                    />
                    <span>{video.owner.name}</span>
                  </a>
                )}
                {video.description && (
                  <p className="video-viewer__desc">{video.description}</p>
                )}
              </div>
            </div>

            <aside className="viewer__side video-viewer__side">
              <div className="video-viewer__comments-title">
                Комментарии{" "}
                <span className="muted">{video.commentsCount || ""}</span>
              </div>
              <div className="viewer__comments" ref={commentsRef}>
                {comments.loading && !comments.data ? (
                  <div className="viewer__empty">
                    <div className="chat-status__spinner" />
                  </div>
                ) : !(comments.data ?? []).length ? (
                  <div className="viewer__empty">
                    <CommentIcon size={56} />
                    Оставьте первый комментарий к этому видео
                  </div>
                ) : (
                  (comments.data ?? []).map((c) => (
                    <div key={c.id} className="comment viewer__comment">
                      <Avatar
                        name={c.author.name}
                        color={c.author.color}
                        src={c.author.avatar}
                        size={32}
                      />
                      <div className="comment__body">
                        <a
                          href={`#user/${c.author.id}`}
                          className="comment__name"
                          onClick={onClose}
                        >
                          {c.author.name}
                        </a>
                        <div className="comment__text">{c.text}</div>
                        <div className="comment__meta">
                          <span>{formatDate(c.createdAt)}</span>
                          {(mine || c.author.id === myId) && (
                            <button
                              className="comment__reply"
                              onClick={() => deleteComment(c)}
                            >
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
                  ref={inputRef}
                  placeholder="Написать комментарий..."
                  maxLength={2000}
                  disabled={sending}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <EmojiPicker
                  inputRef={inputRef}
                  value={comment}
                  onChange={setComment}
                  size={20}
                />
                {comment.trim() && (
                  <button
                    className="icon-btn icon-btn--sm comment-form__send"
                    title="Отправить"
                  >
                    <SendIcon size={20} />
                  </button>
                )}
              </form>
            </aside>
          </>
        )}
      </div>

      {video && modal === "share" && (
        <ShareModal
          shared={{ type: "video", id: video.id }}
          link={`#video/${video.id}`}
          onClose={() => setModal(null)}
        />
      )}
      {video && modal === "edit" && (
        <EditVideoModal
          video={video}
          onClose={() => setModal(null)}
          onDelete={() => setModal("delete")}
          onSave={async (data) => {
            const ok = await library.edit(video, data);
            if (ok) {
              update(data);
              setModal(null);
            }
            return ok;
          }}
        />
      )}
      {video && modal === "delete" && (
        <ConfirmModal
          title="Удаление видео"
          text={`Удалить «${video.title}»? Видео пропадёт у всех, кто его добавил.`}
          onConfirm={async () => {
            setModal(null);
            if (await library.destroy(video)) {
              onDeleted?.(video);
              onClose();
            }
          }}
          onClose={() => setModal(null)}
        />
      )}
    </div>,
    document.body,
  );
}
