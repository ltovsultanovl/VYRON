import { useState } from "react";
import MediaEmpty from "./MediaEmpty";
import TrackList from "../music/TrackList";
import UploadMusicModal from "../music/UploadMusicModal";
import { MusicIcon } from "../Icons";
import { useMusic } from "../../context/MusicContext";
import { useResource } from "../../resources";
import { fetchUserMusic } from "../../api";
import type { Person, Track } from "../../types";

const PREVIEW = 5;

export default function MusicTab({
  owner,
  isMe,
}: {
  owner: Pick<Person, "id" | "firstName">;
  isMe: boolean;
}) {
  const music = useMusic();
  const other = useResource<Track[]>(
    () => (isMe ? Promise.resolve([]) : fetchUserMusic(owner.id)),
    [owner.id, isMe],
  );
  const [uploading, setUploading] = useState(false);
  const tracks = isMe ? music.tracks : (other.data ?? []);
  const loading = isMe
    ? music.status === "loading"
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
      <div className="profile-tracks">
        <TrackList
          tracks={tracks.slice(0, PREVIEW)}
          empty={
            <MediaEmpty Icon={MusicIcon}>
              {isMe
                ? "Аудиозаписей пока нет"
                : `${owner.firstName} пока не добавил(а) музыку`}
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
            Загрузить музыку
          </button>
        )}
        <a
          className="btn btn--neutral"
          href={isMe ? "#music" : `#music/user/${owner.id}`}
        >
          Вся музыка {tracks.length > 0 && tracks.length}
        </a>
      </div>
      {uploading && <UploadMusicModal onClose={() => setUploading(false)} />}
    </>
  );
}
