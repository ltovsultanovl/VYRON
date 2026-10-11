import { useEffect, useState } from "react";
import Modal from "../Modal";
import { UploadIcon, VideoIcon } from "../Icons";
import { useSnackbar } from "../Snackbar";
import { useVideos } from "../../context/VideoContext";
import { useFileDrop, useFilePicker } from "../../hooks";
import { explainError, MAX_UPLOAD_VIDEO_MB } from "../../api";
import { formatDuration } from "./format";
import type { Video } from "../../types";

const POSTER_WIDTH = 640;

interface VideoProbe {
  duration: number;
  width?: number;
  height?: number;
  poster?: Blob | null;
  posterUrl?: string | null;
}

const probeVideo = (file: File) =>
  new Promise<VideoProbe>((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    let settled = false;
    const finish = (result: VideoProbe) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const timer = setTimeout(
      () =>
        finish({
          duration: Number.isFinite(video.duration) ? video.duration : 0,
        }),
      8000,
    );
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, (video.duration || 0) / 3);
    };
    video.onseeked = () => {
      clearTimeout(timer);
      const scale = Math.min(
        1,
        POSTER_WIDTH / (video.videoWidth || POSTER_WIDTH),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.round((video.videoWidth || 640) * scale);
      canvas.height = Math.round((video.videoHeight || 360) * scale);
      try {
        canvas
          .getContext("2d")!
          .drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (poster) =>
            finish({
              duration: video.duration,
              width: video.videoWidth,
              height: video.videoHeight,
              poster,
              posterUrl: poster && URL.createObjectURL(poster),
            }),
          "image/jpeg",
          0.8,
        );
      } catch {
        finish({
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight,
        });
      }
    };
    video.onerror = () => {
      clearTimeout(timer);
      finish({ duration: 0 });
    };
    video.src = url;
  });

export default function UploadVideoModal({
  onClose,
  onUploaded,
  initialFile = null,
}: {
  onClose: () => void;
  onUploaded?: (video: Video) => void;
  initialFile?: File | null;
}) {
  const showSnackbar = useSnackbar();
  const { upload } = useVideos();
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<VideoProbe | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const choose = async ([picked]: File[]) => {
    if (!picked) return;
    if (
      !picked.type.startsWith("video/") &&
      !/\.(mp4|mov|webm|m4v)$/i.test(picked.name)
    ) {
      return showSnackbar("Выберите видео: MP4, MOV или WEBM", "error");
    }
    if (picked.size > MAX_UPLOAD_VIDEO_MB * 1024 * 1024) {
      return showSnackbar(
        `Видео больше ${MAX_UPLOAD_VIDEO_MB} МБ — сожмите его или обрежьте`,
        "error",
      );
    }
    setFile(picked);
    setTitle(
      picked.name
        .replace(/\.[^.]+$/, "")
        .replace(/_/g, " ")
        .slice(0, 150),
    );
    setInfo(null);
    setError("");
    setInfo(await probeVideo(picked));
  };

  const picker = useFilePicker({ accept: "video/*", onPick: choose });
  const [dragOver, dropProps] = useFileDrop(choose);

  const [initial] = useState(initialFile);
  useEffect(() => {
    if (initial) choose([initial]);
  }, [initial]);

  useEffect(
    () => () => {
      if (info?.posterUrl) URL.revokeObjectURL(info.posterUrl);
    },
    [info],
  );

  const submit = async () => {
    if (!file || !title.trim()) return;
    setBusy(true);
    setError("");
    try {
      const video = await upload(file, {
        title: title.trim(),
        description: description.trim(),
        duration: info?.duration,
        width: info?.width,
        height: info?.height,
        poster: info?.poster,
      });
      showSnackbar("Видео загружено");
      onUploaded?.(video);
      onClose();
    } catch (e) {
      setError(explainError(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Загрузка видео"
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
          <button
            className="btn"
            onClick={submit}
            disabled={!file || !title.trim() || busy || !info}
          >
            {busy ? "Загрузка…" : "Опубликовать"}
          </button>
        </>
      }
    >
      <div
        className={`music-upload ${dragOver ? "music-upload--drag" : ""}`}
        {...dropProps}
      >
        {!file ? (
          <button className="music-upload__drop" onClick={picker.open}>
            <UploadIcon size={32} />
            <b>Выберите видео или перетащите его сюда</b>
            <span>MP4, MOV, WEBM — до {MAX_UPLOAD_VIDEO_MB} МБ</span>
          </button>
        ) : (
          <div className="video-upload">
            <div className="video-upload__preview">
              {!info ? (
                <div className="chat-status__spinner" />
              ) : info.posterUrl ? (
                <img src={info.posterUrl} alt="" />
              ) : (
                <VideoIcon size={36} />
              )}
              {!!info?.duration && info.duration > 0 && (
                <span className="video-card__duration">
                  {formatDuration(info.duration)}
                </span>
              )}
            </div>
            <div className="media-form video-upload__fields">
              <label className="media-form__label">
                Название
                <input
                  className="field"
                  maxLength={150}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="media-form__label">
                Описание
                <textarea
                  className="field field--textarea"
                  rows={3}
                  maxLength={5000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={busy}
                  placeholder="Необязательно"
                />
              </label>
              {!busy && (
                <button
                  className="btn btn--tertiary video-upload__change"
                  onClick={picker.open}
                >
                  Выбрать другой файл
                </button>
              )}
            </div>
          </div>
        )}
        {error && <div className="form-row__error">{error}</div>}
        {picker.input}
      </div>
    </Modal>
  );
}
