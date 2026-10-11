import { MusicIcon, PauseIcon, PlayIcon } from "../Icons";
import { coverGradient } from "./format";
import type { Track } from "../../types";

export default function TrackCover({
  track,
  size = 40,
  current = false,
  playing = false,
  onClick,
}: {
  track: Pick<Track, "artist" | "title">;
  size?: number;
  current?: boolean;
  playing?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`track-cover ${current ? "track-cover--current" : ""} ${playing ? "track-cover--playing" : ""}`}
      style={{
        width: size,
        height: size,
        background: coverGradient(track.artist + track.title),
      }}
      onClick={onClick}
      title={playing ? "Пауза" : "Слушать"}
      aria-label={playing ? "Пауза" : "Слушать"}
    >
      <MusicIcon size={size * 0.45} className="track-cover__note" />
      <span className="track-cover__overlay">
        {playing ? (
          <>
            <span className="track-cover__eq" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <PauseIcon size={size * 0.4} className="track-cover__pause" />
          </>
        ) : (
          <PlayIcon size={size * 0.45} />
        )}
      </span>
    </button>
  );
}
