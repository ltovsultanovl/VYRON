import { memo, useRef, useState, type FormEvent } from "react";
import type {
  Comment as CommentType,
  Person,
  Post as PostType,
} from "../types";
import Avatar from "./Avatar";
import MeAvatar from "./MeAvatar";
import ConfirmModal from "./ConfirmModal";
import EmojiPicker from "./EmojiPicker";
import { MentionText, useMentions } from "./Mentions";
import ShareModal from "./ShareModal";
import {
  BookmarkFilledIcon,
  BookmarkIcon,
  CommentIcon,
  LikeIcon,
  MoreIcon,
  PinIcon,
  SendIcon,
  ShareIcon,
  TrashIcon,
} from "./Icons";
import { useProfile } from "../context/ProfileContext";
import { useCommunities } from "../context/CommunitiesContext";
import { useDropdown } from "../hooks";
import { useBookmarks } from "../context/BookmarksContext";
import { formatCount, formatDate } from "../utils";

const TEXT_LIMIT = 300;
const COMMENTS_PREVIEW = 2;
const COMMENTS_STEP = 10;

const PersonLink = ({
  person,
  className,
}: {
  person: Person;
  className?: string;
}) => (
  <a href={`#user/${person.id}`} className={className}>
    {person.name}
  </a>
);

function PostMenu({
  post,
  canPin,
  canDelete,
  onTogglePin,
  onDelete,
}: {
  post: PostType;
  canPin: boolean;
  canDelete: boolean;
  onTogglePin: (post: PostType) => void;
  onDelete: (post: PostType) => void;
}) {
  const menu = useDropdown();
  const [confirming, setConfirming] = useState(false);
  const { isSaved, toggle } = useBookmarks();
  const saved = isSaved("post", post.id);

  return (
    <div className="post__menu" ref={menu.ref}>
      <button className="icon-btn" title="Действия" onClick={menu.toggle}>
        <MoreIcon size={20} />
      </button>

      {menu.open && (
        <div className="dropdown dropdown--right">
          {!post.suggested && (
            <button
              className="dropdown__item"
              onClick={() => {
                menu.close();
                toggle("post", post.id);
              }}
            >
              {saved ? <BookmarkFilledIcon /> : <BookmarkIcon />}
              {saved ? "Удалить из закладок" : "Сохранить в закладках"}
            </button>
          )}
          {canPin && (
            <button
              className="dropdown__item"
              onClick={() => {
                menu.close();
                onTogglePin(post);
              }}
            >
              <PinIcon /> {post.pinned ? "Открепить" : "Закрепить"}
            </button>
          )}
          {canDelete && (
            <button
              className="dropdown__item dropdown__item--danger"
              onClick={() => {
                menu.close();
                setConfirming(true);
              }}
            >
              <TrashIcon /> Удалить запись
            </button>
          )}
        </div>
      )}

      {confirming && (
        <ConfirmModal
          title="Удаление записи"
          text="Вы действительно хотите удалить эту запись?"
          onConfirm={() => {
            setConfirming(false);
            onDelete(post);
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

function Comment({
  comment,
  canDelete,
  onReply,
  onDelete,
}: {
  comment: CommentType;
  canDelete: boolean;
  onReply: (author: Person) => void;
  onDelete: (comment: CommentType) => void;
}) {
  const { myId } = useProfile();
  const mine = comment.author.id === myId;

  return (
    <div className="comment">
      <a href={`#user/${comment.author.id}`}>
        <Avatar
          name={comment.author.name}
          color={comment.author.color}
          src={comment.author.avatar}
          size={32}
        />
      </a>
      <div className="comment__body">
        <PersonLink person={comment.author} className="comment__name" />
        <div className="comment__text">
          <MentionText text={comment.text} />
        </div>
        <div className="comment__meta">
          <span>{formatDate(comment.createdAt)}</span>
          {!mine && (
            <button
              className="comment__reply"
              onClick={() => onReply(comment.author)}
            >
              Ответить
            </button>
          )}
          {canDelete && (
            <button
              className="comment__reply"
              onClick={() => onDelete(comment)}
            >
              Удалить
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(function Post({
  post,
  onLike,
  onComment,
  onDeleteComment,
  onDelete,
  onTogglePin,
  onApprove,
}: {
  post: PostType;
  onLike: (post: PostType) => void;
  onComment: (post: PostType, text: string) => Promise<boolean>;
  onDeleteComment: (post: PostType, comment: CommentType) => void;
  onDelete: (post: PostType) => void;
  onTogglePin: (post: PostType) => void;
  onApprove?: (post: PostType) => void;
}) {
  const { myId } = useProfile();
  const { canPublishIn, canManage } = useCommunities();
  const [commentsOpen, setCommentsOpen] = useState(post.comments.length > 0);
  const [shown, setShown] = useState(COMMENTS_PREVIEW);
  const [expanded, setExpanded] = useState(false);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [sharing, setSharing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mentions = useMentions(comment, setComment, inputRef);

  const { author, owner, community } = post;
  const onOtherWall = owner && owner.id !== author.id;
  const communityPublisher =
    !!post.communityId && canPublishIn(post.communityId);
  const wallOwner = post.ownerId === myId || communityPublisher;
  const canDelete = author.id === myId || wallOwner;
  const canPin =
    !post.suggested &&
    (post.ownerId === myId ||
      (!!post.communityId && canManage(post.communityId)));
  const header =
    post.asCommunity && community
      ? {
          href: `#club/${community.id}`,
          name: community.name,
          color: community.color,
          avatar: community.avatar,
        }
      : {
          href: `#user/${author.id}`,
          name: author.name,
          color: author.color,
          avatar: author.avatar,
        };

  const isLong = post.text.length > TEXT_LIMIT;
  const text =
    isLong && !expanded ? post.text.slice(0, TEXT_LIMIT).trimEnd() : post.text;

  const hidden = Math.max(post.comments.length - shown, 0);
  const collapsible =
    shown > COMMENTS_PREVIEW && post.comments.length > COMMENTS_PREVIEW;
  const visibleComments = post.comments.slice(hidden);

  const focusInput = () =>
    requestAnimationFrame(() => inputRef.current?.focus());

  const toggleComments = () => {
    setCommentsOpen((o) => !o);
    if (!commentsOpen) focusInput();
  };

  const reply = (author: Person) => {
    if (!commentsOpen) setCommentsOpen(true);
    mentions.replyTo(author);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = comment.trim();
    if (!value || sending) return;
    setSending(true);
    if (await onComment(post, mentions.encode(value))) {
      setComment("");
      mentions.reset();
      setShown((n) => n + 1);
    }
    setSending(false);
  };

  return (
    <article className="card post">
      <header className="post__head">
        <a href={header.href}>
          <Avatar
            name={header.name}
            color={header.color}
            src={header.avatar}
            size={40}
            empty={!post.asCommunity}
          />
        </a>
        <div className="post__head-text">
          <a href={header.href} className="post__author">
            {header.name}
          </a>
          {onOtherWall && (
            <>
              <span className="post__arrow"> ▸ </span>
              <PersonLink person={owner} className="post__author" />
            </>
          )}
          {!post.asCommunity && community && (
            <>
              <span className="post__arrow"> ▸ </span>
              <a href={`#club/${community.id}`} className="post__author">
                {community.name}
              </a>
            </>
          )}
          <div className="post__time">
            {post.suggested && (
              <span className="post__suggested">Предложенная новость · </span>
            )}
            {post.pinned && (
              <span className="post__pinned">
                <PinIcon size={12} /> запись закреплена ·{" "}
              </span>
            )}
            {formatDate(post.createdAt)}
          </div>
        </div>
        {(canDelete || canPin || !post.suggested) && (
          <PostMenu
            post={post}
            canPin={canPin}
            canDelete={canDelete}
            onTogglePin={onTogglePin}
            onDelete={onDelete}
          />
        )}
      </header>

      {post.text && (
        <div className="post__text">
          {text}
          {isLong && !expanded && (
            <>
              {"… "}
              <button
                className="post__text-more"
                onClick={() => setExpanded(true)}
              >
                Показать ещё
              </button>
            </>
          )}
        </div>
      )}

      {post.image && !imageFailed && (
        <img
          className="post__image"
          src={post.image}
          alt=""
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      )}

      {post.suggested && communityPublisher && onApprove && (
        <div className="post__suggest-actions">
          <button className="btn" onClick={() => onApprove(post)}>
            Опубликовать
          </button>
          <button className="btn btn--neutral" onClick={() => onDelete(post)}>
            Отклонить
          </button>
        </div>
      )}

      <footer className="post__actions">
        <button
          className={`pill ${post.liked ? "pill--liked" : ""}`}
          onClick={() => onLike(post)}
          title="Нравится"
        >
          <LikeIcon filled={post.liked} />
          {post.likes > 0 && <span>{formatCount(post.likes)}</span>}
        </button>
        <button
          className="pill"
          onClick={toggleComments}
          title="Комментировать"
        >
          <CommentIcon />
          {post.comments.length > 0 && <span>{post.comments.length}</span>}
        </button>
        <button
          className="pill"
          onClick={() => setSharing(true)}
          title="Поделиться"
        >
          <ShareIcon />
        </button>
      </footer>

      {commentsOpen && (
        <div className="comments">
          {hidden > 0 && (
            <button
              className="comments__more"
              onClick={() => setShown((n) => n + COMMENTS_STEP)}
            >
              Показать предыдущие комментарии
            </button>
          )}
          {visibleComments.map((c) => (
            <Comment
              key={c.id}
              comment={c}
              canDelete={c.author.id === myId || wallOwner}
              onReply={reply}
              onDelete={(target) => onDeleteComment(post, target)}
            />
          ))}
          {collapsible && (
            <button
              className="comments__more comments__more--collapse"
              onClick={() => setShown(COMMENTS_PREVIEW)}
            >
              Свернуть комментарии
            </button>
          )}
          <form className="comment-form" onSubmit={submit}>
            <MeAvatar size={32} />
            <div className="comment-form__field">
              {mentions.list}
              <input
                ref={inputRef}
                placeholder="Написать комментарий..."
                maxLength={2000}
                value={comment}
                onChange={(e) => {
                  setComment(e.target.value);
                  mentions.detect();
                }}
                onSelect={mentions.detect}
                onKeyDown={mentions.onKeyDown}
              />
              <EmojiPicker
                inputRef={inputRef}
                value={comment}
                onChange={setComment}
                size={20}
              />
              <button
                className="icon-btn icon-btn--sm comment-form__send"
                disabled={!comment.trim() || sending}
                title="Отправить"
              >
                <SendIcon size={20} />
              </button>
            </div>
          </form>
        </div>
      )}
      {sharing && (
        <ShareModal
          shared={{ type: "post", id: post.id }}
          link={`#user/${post.ownerId}`}
          onClose={() => setSharing(false)}
        />
      )}
    </article>
  );
});
