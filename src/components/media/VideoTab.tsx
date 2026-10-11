import { useState } from "react";
import MediaEmpty from "./MediaEmpty";
import VideoGrid from "../video/VideoGrid";
import VideoViewer from "../video/VideoViewer";
import UploadVideoModal from "../video/UploadVideoModal";
import { VideoIcon } from "../Icons";
import { useVideos } from "../../context/VideoContext";
import { useProfile } from "../../context/ProfileContext";
import { useResource } from "../../resources";
import { fetchUserVideos } from "../../api";
import type { Person, Video } from "../../types";

const PREVIEW = 4;

export default function VideoTab({
  owner,
  isMe,
}: {
  owner: Pick<Person, "id" | "firstName">;
  isMe: boolean;
}) {
  const { myId } = useProfile();
  const library = useVideos();
  const other = useResource<Video[]>(
    () => (isMe ? Promise.resolve([]) : fetchUserVideos(owner.id, myId)),
    [owner.id, isMe, myId],
  );
  const [opened, setOpened] = useState<Video | null>(null);
  const [uploading, setUploading] = useState(false);
  const videos = isMe ? library.videos : (other.data ?? []);
  const loading = isMe
    ? library.status === "loading"
    : other.loading && !other.data;

  if (loading) {
    return (
      <div className="media__empty" role="status">
        <div className="chat-status__spinner" />
      </div>
    );
  }

  return (
    <>
      <div className="profile-videos">
        <VideoGrid
          videos={videos.slice(0, PREVIEW)}
          onOpen={setOpened}
          showOwner={false}
          empty={
            <MediaEmpty Icon={VideoIcon}>
              {isMe
                ? "Видео пока нет"
                : `${owner.firstName} пока не добавил(а) видео`}
            </MediaEmpty>
          }
        />
      </div>
      <div className="media__actions">
        {isMe && (
          <button
            className="btn btn--neutral"
            onClick={() => setUploading(true)}
          >
            Загрузить видео
          </button>
        )}
        <a
          className="btn btn--neutral"
          href={isMe ? "#video" : `#video/user/${owner.id}`}
        >
          Все видео {videos.length > 0 && videos.length}
        </a>
      </div>
      {opened && (
        <VideoViewer
          id={opened.id}
          video={opened}
          onClose={() => setOpened(null)}
          onChange={(id, data) =>
            !isMe &&
            other.update((list) =>
              list.map((v) => (v.id === id ? { ...v, ...data } : v)),
            )
          }
          onDeleted={() => !isMe && other.reload()}
        />
      )}
      {uploading && <UploadVideoModal onClose={() => setUploading(false)} />}
    </>
  );
}
