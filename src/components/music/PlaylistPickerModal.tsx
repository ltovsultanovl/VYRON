import { useState } from "react";
import Modal from "../Modal";
import PlaylistModal from "./PlaylistModal";
import { CheckIcon, PlaylistIcon, PlusIcon } from "../Icons";
import { useMusic } from "../../context/MusicContext";
import { coverGradient } from "./format";
import type { Track } from "../../types";

export default function PlaylistPickerModal({
  track,
  onClose,
}: {
  track: Track;
  onClose: () => void;
}) {
  const { playlists, addToPlaylist, createPlaylist } = useMusic();
  const [creating, setCreating] = useState(false);

  if (creating) {
    return (
      <PlaylistModal
        onClose={() => setCreating(false)}
        onSave={async (data) => {
          const playlist = await createPlaylist(data);
          if (!playlist) return false;
          await addToPlaylist(playlist, track);
          onClose();
          return true;
        }}
      />
    );
  }

  return (
    <Modal title="Добавить в плейлист" onClose={onClose} width={420}>
      <div className="album-picker">
        <button
          className="album-picker__item"
          onClick={() => setCreating(true)}
        >
          <span className="album-picker__cover album-picker__cover--new">
            <PlusIcon size={20} />
          </span>
          <span className="album-picker__title">Новый плейлист</span>
        </button>
        {playlists.map((p) => {
          const inside = p.tracks.some((t) => t.id === track.id);
          return (
            <button
              key={p.id}
              className={`album-picker__item ${inside ? "album-picker__item--current" : ""}`}
              disabled={inside}
              onClick={async () => {
                onClose();
                await addToPlaylist(p, track);
              }}
            >
              <span
                className="album-picker__cover"
                style={{ background: coverGradient(p.title) }}
              >
                <PlaylistIcon size={20} />
              </span>
              <span className="album-picker__title">{p.title}</span>
              {inside && <CheckIcon size={18} />}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
