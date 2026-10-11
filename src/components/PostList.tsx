import Post from "./Post";
import type { ReactNode } from "react";
import type { PostsFeed } from "../resources";
import type { Post as PostType } from "../types";

export default function PostList({
  feed,
  emptyText,
  emptyAction,
}: {
  feed: Pick<
    PostsFeed,
    | "posts"
    | "data"
    | "loading"
    | "error"
    | "reload"
    | "toggleLike"
    | "comment"
    | "deleteComment"
    | "remove"
    | "togglePin"
    | "approve"
  >;
  emptyText: ReactNode;
  emptyAction?: ReactNode;
}) {
  const { posts, data, loading, error, reload } = feed;

  if (loading && !data) {
    return (
      <div className="card list-state" role="status">
        <div className="chat-status__spinner" />
        Загружаем записи…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="card list-state" role="alert">
        Не удалось загрузить записи: {error}
        <button className="btn" onClick={reload}>
          Повторить
        </button>
      </div>
    );
  }

  if (!posts.length) {
    return (
      <div className="card list-state">
        {emptyText}
        {emptyAction}
      </div>
    );
  }

  return posts.map((post: PostType) => (
    <Post
      key={post.id}
      post={post}
      onLike={feed.toggleLike}
      onComment={feed.comment}
      onDeleteComment={feed.deleteComment}
      onDelete={feed.remove}
      onTogglePin={feed.togglePin}
      onApprove={feed.approve}
    />
  ));
}
