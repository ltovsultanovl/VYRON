import { useState, type CSSProperties } from "react";
import TrackCover from "./TrackCover";
import { formatDuration } from "./format";
import {
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  RepeatIcon,
  ShuffleIcon,
  VolumeIcon,
} from "../Icons";
import { usePlayer, usePlayerTime } from "../../context/PlayerContext";

function Progress() {
  const { seek } = usePlayer();
  const { time, duration } = usePlayerTime();
  const [drag, setDrag] = useState<number | null>(null);
  const value = drag ?? time;
  const max = duration || 1;
  return (
    <div className="player__progress">
      <span className="player__time">{formatDuration(value)}</span>
      <input
        type="range"
        className="range"
        min={0}
        max={max}
        step={0.1}
        value={Math.min(value, max)}
        style={
          {
            "--fill": `${(Math.min(value, max) / max) * 100}%`,
          } as CSSProperties
        }
        onChange={(e) => setDrag(Number(e.target.value))}
        onPointerUp={() => {
          if (drag !== null) seek(drag);
          setDrag(null);
        }}
        onKeyUp={() => {
          if (drag !== null) seek(drag);
          setDrag(null);
        }}
        aria-label="Перемотка"
        disabled={!duration}
      />
      <span className="player__time">{formatDuration(duration)}</span>
    </div>
  );
}

function Volume() {
  const { volume, setVolume } = usePlayer();
  const [before, setBefore] = useState(0.8);
  return (
    <div className="player__volume">
      <button
        className="icon-btn icon-btn--sm"
        title={volume ? "Выключить звук" : "Включить звук"}
        onClick={() => {
          if (volume) {
            setBefore(volume);
            setVolume(0);
          } else setVolume(before || 0.8);
        }}
      >
        <VolumeIcon size={20} muted={!volume} />
      </button>
      <input
        type="range"
        className="range range--small"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        style={{ "--fill": `${volume * 100}%` } as CSSProperties}
        onChange={(e) => setVolume(Number(e.target.value))}
        aria-label="Громкость"
      />
    </div>
  );
}

export default function PlayerBar({ compact = false }: { compact?: boolean }) {
  const player = usePlayer();
  const { current, playing, loading, shuffle, repeat } = player;

  if (!current) {
    return (
      <div
        className={`player player--empty ${compact ? "player--compact" : ""}`}
      >
        Выберите аудиозапись — она будет играть, пока вы ходите по сайту
      </div>
    );
  }

  return (
    <div className={`player ${compact ? "player--compact" : ""}`}>
      <div className="player__controls">
        <button className="icon-btn" title="Предыдущая" onClick={player.prev}>
          <PrevIcon size={22} />
        </button>
        <button
          className={`player__play ${loading ? "player__play--loading" : ""}`}
          title={playing ? "Пауза" : "Воспроизвести"}
          onClick={() => (playing ? player.pause() : player.resume())}
        >
          {playing ? <PauseIcon size={20} /> : <PlayIcon size={22} />}
        </button>
        <button className="icon-btn" title="Следующая" onClick={player.next}>
          <NextIcon size={22} />
        </button>
      </div>

      <TrackCover
        track={current}
        size={compact ? 40 : 48}
        current
        playing={playing}
        onClick={() => player.toggle()}
      />

      <div className="player__main">
        <div className="player__title">{current.title}</div>
        <div className="player__artist">
          {current.artist || "Неизвестный исполнитель"}
        </div>
      </div>

      <div className="player__extra">
        <button
          className={`icon-btn icon-btn--sm ${shuffle ? "icon-btn--on" : ""}`}
          title={shuffle ? "Перемешивание включено" : "Перемешать"}
          onClick={player.toggleShuffle}
        >
          <ShuffleIcon size={20} />
        </button>
        <button
          className={`icon-btn icon-btn--sm ${repeat !== "off" ? "icon-btn--on" : ""}`}
          title={
            {
              off: "Повтор выключен",
              all: "Повторять список",
              one: "Повторять трек",
            }[repeat]
          }
          onClick={player.cycleRepeat}
        >
          <RepeatIcon size={20} one={repeat === "one"} />
        </button>
        <Volume />
      </div>
      <Progress />
    </div>
  );
}
