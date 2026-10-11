import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import type { Video } from "../types";
import { useSnackbar } from "../components/Snackbar";
import { useProfile } from "./ProfileContext";
import { useResource } from "../resources";
import * as api from "../api";

interface VideoValue {
  status: "loading" | "error" | "ready";
  error: string;
  reload: () => void;
  videos: Video[];
  has: (video: Video) => boolean;
  add: (video: Video) => Promise<void>;
  remove: (video: Video) => Promise<void>;
  upload: (file: File, info: api.VideoInfo) => Promise<Video>;
  edit: (
    video: Video,
    data: { title: string; description: string },
  ) => Promise<boolean>;
  destroy: (video: Video) => Promise<boolean>;
  patch: (id: number, data: Partial<Video>) => void;
}

const VideoContext = createContext<VideoValue | null>(null);

export function VideoProvider({ children }: { children: ReactNode }) {
  const { myId } = useProfile();
  const showSnackbar = useSnackbar();
  const library = useResource(() => api.fetchUserVideos(myId, myId), [myId]);
  const setVideos = library.setData;
  const updateVideos = library.update;
  const videos = useMemo(() => library.data ?? [], [library.data]);
  const ids = useMemo(() => new Set(videos.map((v) => v.id)), [videos]);
  const fail = useCallback(
    (e: unknown, prefix: string) =>
      showSnackbar(`${prefix}: ${api.explainError(e)}`, "error"),
    [showSnackbar],
  );

  const add = useCallback(
    async (video: Video) => {
      setVideos((list) => [
        video,
        ...(list ?? []).filter((v) => v.id !== video.id),
      ]);
      try {
        await api.addToMyVideos(video.id);
        showSnackbar("Видео добавлено в «Мои видео»");
      } catch (e) {
        updateVideos((list) => list.filter((v) => v.id !== video.id));
        fail(e, "Не удалось добавить");
      }
    },
    [fail, setVideos, updateVideos, showSnackbar],
  );

  const remove = useCallback(
    async (video: Video) => {
      updateVideos((list) => list.filter((v) => v.id !== video.id));
      try {
        await api.removeFromMyVideos(myId, video.id);
        showSnackbar("Видео убрано из «Моих видео»");
      } catch (e) {
        library.reload();
        fail(e, "Не удалось убрать");
      }
    },
    [fail, library, myId, updateVideos, showSnackbar],
  );

  const upload = useCallback(
    async (file: File, info: api.VideoInfo) => {
      const video = await api.uploadVideo(myId, file, info);
      setVideos((list) => [video, ...(list ?? [])]);
      return video;
    },
    [myId, setVideos],
  );

  const patch = useCallback(
    (id: number, data: Partial<Video>) =>
      updateVideos((list) =>
        list.map((v) => (v.id === id ? { ...v, ...data } : v)),
      ),
    [updateVideos],
  );

  const edit = useCallback(
    async (
      video: Video,
      { title, description }: { title: string; description: string },
    ) => {
      try {
        await api.saveVideo({ id: video.id, title, description });
        patch(video.id, { title, description });
        showSnackbar("Видео сохранено");
        return true;
      } catch (e) {
        fail(e, "Не удалось сохранить");
        return false;
      }
    },
    [fail, patch, showSnackbar],
  );

  const destroy = useCallback(
    async (video: Video) => {
      try {
        await api.deleteVideo(video);
        updateVideos((list) => list.filter((v) => v.id !== video.id));
        showSnackbar("Видео удалено");
        return true;
      } catch (e) {
        fail(e, "Не удалось удалить");
        return false;
      }
    },
    [fail, updateVideos, showSnackbar],
  );

  const value = useMemo<VideoValue>(
    () => ({
      status:
        library.loading && !library.data
          ? "loading"
          : library.error
            ? "error"
            : "ready",
      error: library.error,
      reload: library.reload,
      videos,
      has: (video: Video) => ids.has(video.id),
      add,
      remove,
      upload,
      edit,
      destroy,
      patch,
    }),
    [
      library.loading,
      library.data,
      library.error,
      library.reload,
      videos,
      ids,
      add,
      remove,
      upload,
      edit,
      destroy,
      patch,
    ],
  );

  return (
    <VideoContext.Provider value={value}>{children}</VideoContext.Provider>
  );
}

export function useVideos() {
  const context = useContext(VideoContext);
  if (!context)
    throw new Error("useVideos нужно вызывать внутри <VideoProvider>");
  return context;
}
