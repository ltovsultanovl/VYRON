import PlayerBar from "./PlayerBar";
import { MusicIcon, NextIcon, PauseIcon, PlayIcon } from "../Icons";
import { usePlayer } from "../../context/PlayerContext";
import { useDropdown } from "../../hooks";
import type { Navigate } from "../../types";

export default function HeaderPlayer({ onNavigate }: { onNavigate: Navigate }) {
  const player = usePlayer();
  const menu = useDropdown();
  const { current, playing } = player;

  if (!current) {
    return (
      <button
        className="icon-btn"
        title="Музыка"
        onClick={() => onNavigate("music")}
      >
        <MusicIcon size={28} />
      </button>
    );
  }

  return (
    <div className="header-player" ref={menu.ref}>
      <button
        className="icon-btn icon-btn--sm"
        title={playing ? "Пауза" : "Воспроизвести"}
        onClick={() => (playing ? player.pause() : player.resume())}
      >
        {playing ? <PauseIcon size={18} /> : <PlayIcon size={20} />}
      </button>
      <button
        className="icon-btn icon-btn--sm"
        title="Следующая"
        onClick={player.next}
      >
        <NextIcon size={18} />
      </button>
      <button
        className="header-player__title"
        onClick={menu.toggle}
        title="Открыть плеер"
      >
        <b>{current.title}</b>
        {current.artist && <span> — {current.artist}</span>}
      </button>
      {menu.open && (
        <div className="dropdown header-player__dropdown">
          <PlayerBar compact />
          <button
            className="btn btn--tertiary header-player__go"
            onClick={() => {
              menu.close();
              onNavigate("music");
            }}
          >
            Перейти в «Музыку»
          </button>
        </div>
      )}
    </div>
  );
}
