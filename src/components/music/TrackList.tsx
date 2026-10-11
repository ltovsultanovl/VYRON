import { useState } from "react";
import TrackCover from "./TrackCover";
import EditTrackModal from "./EditTrackModal";
import PlaylistPickerModal from "./PlaylistPickerModal";
import ConfirmModal from "../ConfirmModal";
import ShareModal from "../ShareModal";
import { CheckIcon, MoreIcon, PlusIcon } from "../Icons";
import { formatDuration } from "./format";
import { usePlayer } from "../../context/PlayerContext";
import { useMusic } from "../../context/MusicContext";
import { useProfile } from "../../context/ProfileContext";
import { useDropdown } from "../../hooks";
import type { ReactNode } from "react";
import type { Playlist, Track } from "../../types";

type TrackAction =
  | "playlist"
  | "share"
  | "edit"
  | "unlist"
  | "remove"
  | "destroy";

function TrackMenu({
  track,
  playlist,
  onAction,
}: {
  track: Track;
  playlist?: Playlist;
  onAction: (action: TrackAction) => void;
}) {
  const { myId } = useProfile();
  const { has } = useMusic();
  const menu = useDropdown();
  const item = (label: string, action: TrackAction, danger = false) => (
    <button
      className={`dropdown__item ${danger ? "dropdown__item--danger" : ""}`}
      onClick={() => {
        menu.close();
        onAction(action);
      }}
    >
      {label}
    </button>
  );
  return (
    <div className="track__more" ref={menu.ref}>
      <button
        className="icon-btn icon-btn--sm"
        title="Ещё"
        onClick={menu.toggle}
      >
        <MoreIcon size={18} />
      </button>
      {menu.open && (
        <div className="dropdown dropdown--right">
          {item("Добавить в плейлист", "playlist")}
          {item("Поделиться", "share")}
          {track.uploaderId === myId && item("Редактировать", "edit")}
          {playlist &&
            playlist.ownerId === myId &&
            item("Убрать из плейлиста", "unlist", true)}
          {has(track) && item("Удалить из моей музыки", "remove", true)}
          {track.uploaderId === myId &&
            item("Удалить трек совсем", "destroy", true)}
        </div>
      )}
    </div>
  );
}

export default function TrackList({
  tracks,
  playlist,
  empty,
  numbered = false,
}: {
  tracks: Track[];
  playlist?: Playlist;
  empty?: ReactNode;
  numbered?: boolean;
}) {
  const player = usePlayer();
  const music = useMusic();
  const [modal, setModal] = useState<{
    type: Exclude<TrackAction, "remove" | "unlist">;
    track: Track;
  } | null>(null);

  if (!tracks.length) return empty ?? null;

  const act = (track: Track) => (type: TrackAction) => {
    if (type === "remove") return void music.remove(track);
    if (type === "unlist") {
      if (playlist) void music.removeFromPlaylist(playlist, track);
      return;
    }
    setModal({ type, track });
  };

  return (
    <>
      <div className="tracks">
        {tracks.map((t, i) => {
          const current = player.isCurrent(t);
          const playing = current && player.playing;
          const mine = music.has(t);
          return (
            <div
              key={t.id}
              className={`track ${current ? "track--current" : ""}`}
              onDoubleClick={() => player.toggle(t, tracks, i)}
            >
              {numbered && <span className="track__num">{i + 1}</span>}
              <TrackCover
                track={t}
                current={current}
                playing={playing}
                onClick={() => player.toggle(t, tracks, i)}
              />
              <button
                className="track__info"
                onClick={() => player.toggle(t, tracks, i)}
              >
                <span className="track__title">{t.title}</span>
                <span className="track__artist">
                  {t.artist || "Неизвестный исполнитель"}
                </span>
              </button>
              <div className="track__actions">
                <button
                  className={`icon-btn icon-btn--sm track__add ${mine ? "track__add--on" : ""}`}
                  title={
                    mine ? "Удалить из моей музыки" : "Добавить в мою музыку"
                  }
                  onClick={() => (mine ? music.remove(t) : music.add(t))}
                >
                  {mine ? <CheckIcon size={18} /> : <PlusIcon size={18} />}
                </button>
                <TrackMenu track={t} playlist={playlist} onAction={act(t)} />
              </div>
              <span className="track__time">{formatDuration(t.duration)}</span>
            </div>
          );
        })}
      </div>

      {modal?.type === "playlist" && (
        <PlaylistPickerModal
          track={modal.track}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "share" && (
        <ShareModal
          shared={{ type: "audio", id: modal.track.id }}
          link="#music"
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "edit" && (
        <EditTrackModal track={modal.track} onClose={() => setModal(null)} />
      )}
      {modal?.type === "destroy" && (
        <ConfirmModal
          title="Удаление аудиозаписи"
          text={`Удалить «${modal.track.title}» совсем? Она пропадёт у всех, кто её добавил, и из плейлистов.`}
          onConfirm={() => {
            music.destroy(modal.track);
            setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
