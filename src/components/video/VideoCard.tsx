import { PlayIcon, VideoIcon } from "../Icons";
import { bg } from "../../data";
import { formatDate } from "../../utils";
import { formatDuration, viewsLabel } from "./format";
import type { Video } from "../../types";

export default function VideoCard({
  video,
  onOpen,
  showOwner = true,
}: {
  video: Video;
  onOpen: (video: Video) => void;
  showOwner?: boolean;
}) {
  return (
    <button className="video-card" onClick={() => onOpen(video)}>
      <span
        className="video-card__poster"
        style={
          video.poster
            ? { background: bg(video.poster, "var(--field-bg)") }
            : undefined
        }
      >
        {!video.poster && <VideoIcon size={36} />}
        <span className="video-card__play">
          <PlayIcon size={28} />
        </span>
        {video.duration > 0 && (
          <span className="video-card__duration">
            {formatDuration(video.duration)}
          </span>
        )}
      </span>
      <span className="video-card__title">{video.title}</span>
      <span className="video-card__meta">
        {showOwner && video.owner && <>{video.owner.name} · </>}
        {viewsLabel(video.views)} · {formatDate(video.createdAt)}
      </span>
    </button>
  );
}
