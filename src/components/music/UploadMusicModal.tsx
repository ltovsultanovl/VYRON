import { useEffect, useState } from "react";
import Modal from "../Modal";
import { MusicIcon, UploadIcon } from "../Icons";
import { useSnackbar } from "../Snackbar";
import { useMusic } from "../../context/MusicContext";
import { useFileDrop, useFilePicker } from "../../hooks";
import { explainError, MAX_AUDIO_MB, parseTrackName } from "../../api";
import { formatDuration } from "./format";

const readDuration = (file: File) =>
  new Promise<number>((resolve) => {
    const url = URL.createObjectURL(file);
    const probe = new Audio();
    const done = (d: number) => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(d) ? d : 0);
    };
    probe.onloadedmetadata = () => done(probe.duration);
    probe.onerror = () => done(0);
    probe.src = url;
  });

interface UploadItem {
  key: string;
  file: File;
  artist: string;
  title: string;
  duration: number;
  state: "ready" | "uploading" | "done" | "error";
  error?: string;
}

export default function UploadMusicModal({
  onClose,
  initialFiles = [],
}: {
  onClose: () => void;
  initialFiles?: File[];
}) {
  const showSnackbar = useSnackbar();
  const { upload } = useMusic();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);

  const addFiles = (files: File[]) => {
    const audio = files.filter(
      (f) =>
        f.type.startsWith("audio/") ||
        /\.(mp3|m4a|aac|ogg|wav|flac|opus)$/i.test(f.name),
    );
    if (!audio.length)
      return showSnackbar(
        "Выберите аудиофайлы: MP3, M4A, OGG, WAV или FLAC",
        "error",
      );
    const tooBig = audio.filter((f) => f.size > MAX_AUDIO_MB * 1024 * 1024);
    if (tooBig.length)
      showSnackbar(
        `Файлы больше ${MAX_AUDIO_MB} МБ пропущены: ${tooBig.length}`,
        "error",
      );
    const fresh = audio
      .filter((f) => !tooBig.includes(f))
      .map(
        (file): UploadItem => ({
          key: crypto.randomUUID(),
          file,
          ...parseTrackName(file.name),
          duration: 0,
          state: "ready",
        }),
      );
    setItems((list) => [...list, ...fresh]);
    fresh.forEach(async (item) => {
      const duration = await readDuration(item.file);
      setItems((list) =>
        list.map((x) => (x.key === item.key ? { ...x, duration } : x)),
      );
    });
  };

  const picker = useFilePicker({
    accept: "audio/*",
    multiple: true,
    onPick: addFiles,
  });
  const [dragOver, dropProps] = useFileDrop(addFiles);

  const [initial] = useState(initialFiles);
  useEffect(() => {
    if (initial.length) addFiles(initial);
  }, [initial]);

  const patch = (key: string, data: Partial<UploadItem>) =>
    setItems((list) =>
      list.map((x) => (x.key === key ? { ...x, ...data } : x)),
    );
  const pending = items.filter(
    (x) => x.state === "ready" || x.state === "error",
  );
  const valid = pending.length > 0 && pending.every((x) => x.title.trim());

  const start = async () => {
    setBusy(true);
    let done = 0;
    for (const item of pending) {
      patch(item.key, { state: "uploading", error: "" });
      try {
        await upload(item.file, {
          artist: item.artist.trim(),
          title: item.title.trim(),
          duration: item.duration,
        });
        patch(item.key, { state: "done" });
        done += 1;
      } catch (e) {
        patch(item.key, { state: "error", error: explainError(e) });
      }
    }
    setBusy(false);
    if (done === pending.length) {
      showSnackbar(
        done > 1 ? `Загружено аудиозаписей: ${done}` : "Аудиозапись загружена",
      );
      onClose();
    } else if (done)
      showSnackbar(`Загружено ${done} из ${pending.length}`, "error");
  };

  return (
    <Modal
      title="Загрузка аудиозаписей"
      onClose={busy ? () => {} : onClose}
      width={560}
      footer={
        <>
          <button
            className="btn btn--secondary"
            onClick={onClose}
            disabled={busy}
          >
            Отмена
          </button>
          <button className="btn" onClick={start} disabled={!valid || busy}>
            {busy
              ? "Загрузка…"
              : pending.length > 1
                ? `Загрузить ${pending.length}`
                : "Загрузить"}
          </button>
        </>
      }
    >
      <div
        className={`music-upload ${dragOver ? "music-upload--drag" : ""}`}
        {...dropProps}
      >
        {items.length === 0 ? (
          <button className="music-upload__drop" onClick={picker.open}>
            <UploadIcon size={32} />
            <b>Выберите файлы или перетащите их сюда</b>
            <span>
              MP3, M4A, OGG, WAV, FLAC — до {MAX_AUDIO_MB} МБ. Название вида
              «Исполнитель - Трек» разберём сами
            </span>
          </button>
        ) : (
          <>
            <div className="music-upload__list">
              {items.map((x) => (
                <div
                  key={x.key}
                  className={`music-upload__item music-upload__item--${x.state}`}
                >
                  <MusicIcon size={20} />
                  <input
                    className="field"
                    placeholder="Исполнитель"
                    maxLength={100}
                    value={x.artist}
                    disabled={x.state === "uploading" || x.state === "done"}
                    onChange={(e) => patch(x.key, { artist: e.target.value })}
                  />
                  <input
                    className={`field ${x.title.trim() ? "" : "field--invalid"}`}
                    placeholder="Название"
                    maxLength={150}
                    value={x.title}
                    disabled={x.state === "uploading" || x.state === "done"}
                    onChange={(e) => patch(x.key, { title: e.target.value })}
                  />
                  <span className="music-upload__status">
                    {x.state === "uploading" ? (
                      <div className="chat-status__spinner" />
                    ) : x.state === "done" ? (
                      "✓"
                    ) : (
                      formatDuration(x.duration)
                    )}
                  </span>
                  {x.state === "error" && (
                    <div className="music-upload__error">{x.error}</div>
                  )}
                </div>
              ))}
            </div>
            {!busy && (
              <button className="btn btn--tertiary" onClick={picker.open}>
                + Добавить ещё
              </button>
            )}
          </>
        )}
        {picker.input}
      </div>
    </Modal>
  );
}
