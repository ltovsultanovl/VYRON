import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import type { Playlist, Track } from "../types";
import { useSnackbar } from "../components/Snackbar";
import { useProfile } from "./ProfileContext";
import { usePlayer } from "./PlayerContext";
import { useResource } from "../resources";
import * as api from "../api";

type PlaylistData = { title: string; description: string };

interface MusicValue {
  status: "loading" | "error" | "ready";
  error: string;
  reload: () => void;
  tracks: Track[];
  ids: Set<number>;
  has: (track: Track) => boolean;
  add: (track: Track) => Promise<void>;
  remove: (track: Track) => Promise<void>;
  upload: (file: File, info: api.TrackInfo) => Promise<Track>;
  edit: (
    track: Track,
    data: { artist: string; title: string },
  ) => Promise<boolean>;
  destroy: (track: Track) => Promise<boolean>;
  playlists: Playlist[];
  playlistsStatus: "loading" | "error" | "ready";
  playlistsError: string;
  reloadPlaylists: () => void;
  createPlaylist: (data: PlaylistData) => Promise<Playlist | null>;
  savePlaylist: (playlist: Playlist) => Promise<boolean>;
  deletePlaylist: (playlist: Playlist) => Promise<boolean>;
  addToPlaylist: (playlist: Playlist, track: Track) => Promise<void>;
  removeFromPlaylist: (playlist: Playlist, track: Track) => Promise<void>;
}

const MusicContext = createContext<MusicValue | null>(null);

export function MusicProvider({ children }: { children: ReactNode }) {
  const { myId } = useProfile();
  const showSnackbar = useSnackbar();
  const { forget, patchTrack } = usePlayer();
  const library = useResource(() => api.fetchUserMusic(myId), [myId]);
  const lists = useResource(() => api.fetchPlaylists(myId), [myId]);
  const setTracks = library.setData;
  const updateTracks = library.update;
  const updatePlaylists = lists.update;
  const setPlaylists = lists.setData;
  const tracks = useMemo(() => library.data ?? [], [library.data]);
  const playlists = useMemo(() => lists.data ?? [], [lists.data]);
  const ids = useMemo(() => new Set(tracks.map((t) => t.id)), [tracks]);

  const fail = useCallback(
    (e: unknown, prefix: string) =>
      showSnackbar(`${prefix}: ${api.explainError(e)}`, "error"),
    [showSnackbar],
  );

  const add = useCallback(
    async (track: Track) => {
      setTracks((list) => [
        track,
        ...(list ?? []).filter((t) => t.id !== track.id),
      ]);
      try {
        await api.addToMyMusic(track.id);
        showSnackbar("Аудиозапись добавлена в «Мою музыку»");
      } catch (e) {
        updateTracks((list) => list.filter((t) => t.id !== track.id));
        fail(e, "Не удалось добавить");
      }
    },
    [fail, setTracks, updateTracks, showSnackbar],
  );

  const remove = useCallback(
    async (track: Track) => {
      const before = tracks;
      updateTracks((list) => list.filter((t) => t.id !== track.id));
      try {
        await api.removeFromMyMusic(myId, track.id);
        showSnackbar("Аудиозапись удалена из «Моей музыки»");
      } catch (e) {
        setTracks(() => before);
        fail(e, "Не удалось удалить");
      }
    },
    [fail, myId, setTracks, updateTracks, showSnackbar, tracks],
  );

  const upload = useCallback(
    async (file: File, info: api.TrackInfo) => {
      const track = await api.uploadAudio(myId, file, info);
      setTracks((list) => [track, ...(list ?? [])]);
      return track;
    },
    [myId, setTracks],
  );

  const patchEverywhere = useCallback(
    (track: Track, fn: (t: Track) => Track) => {
      updateTracks((list) => list.map((t) => (t.id === track.id ? fn(t) : t)));
      updatePlaylists((list) =>
        list.map((p) => ({
          ...p,
          tracks: p.tracks.map((t) => (t.id === track.id ? fn(t) : t)),
        })),
      );
    },
    [updatePlaylists, updateTracks],
  );

  const edit = useCallback(
    async (
      track: Track,
      { artist, title }: { artist: string; title: string },
    ) => {
      try {
        await api.saveAudio({ id: track.id, artist, title });
        patchEverywhere(track, (t) => ({ ...t, artist, title }));
        patchTrack({ id: track.id, artist, title });
        showSnackbar("Аудиозапись сохранена");
        return true;
      } catch (e) {
        fail(e, "Не удалось сохранить");
        return false;
      }
    },
    [fail, patchEverywhere, patchTrack, showSnackbar],
  );

  const destroy = useCallback(
    async (track: Track) => {
      try {
        await api.deleteAudio(track);
        forget(track);
        updateTracks((list) => list.filter((t) => t.id !== track.id));
        updatePlaylists((list) =>
          list.map((p) => ({
            ...p,
            tracks: p.tracks.filter((t) => t.id !== track.id),
          })),
        );
        showSnackbar("Аудиозапись удалена");
        return true;
      } catch (e) {
        fail(e, "Не удалось удалить");
        return false;
      }
    },
    [fail, forget, updatePlaylists, updateTracks, showSnackbar],
  );

  const createPlaylist = useCallback(
    async (data: PlaylistData) => {
      try {
        const playlist = await api.createPlaylist(data);
        setPlaylists((list) => [playlist, ...(list ?? [])]);
        showSnackbar("Плейлист создан");
        return playlist;
      } catch (e) {
        fail(e, "Не удалось создать плейлист");
        return null;
      }
    },
    [fail, setPlaylists, showSnackbar],
  );

  const savePlaylist = useCallback(
    async (playlist: Playlist) => {
      try {
        await api.savePlaylist(playlist);
        updatePlaylists((list) =>
          list.map((p) => (p.id === playlist.id ? { ...p, ...playlist } : p)),
        );
        showSnackbar("Плейлист сохранён");
        return true;
      } catch (e) {
        fail(e, "Не удалось сохранить");
        return false;
      }
    },
    [fail, updatePlaylists, showSnackbar],
  );

  const deletePlaylist = useCallback(
    async (playlist: Playlist) => {
      try {
        await api.deletePlaylist(playlist.id);
        updatePlaylists((list) => list.filter((p) => p.id !== playlist.id));
        showSnackbar("Плейлист удалён");
        return true;
      } catch (e) {
        fail(e, "Не удалось удалить плейлист");
        return false;
      }
    },
    [fail, updatePlaylists, showSnackbar],
  );

  const addToPlaylist = useCallback(
    async (playlist: Playlist, track: Track) => {
      if (playlist.tracks.some((t) => t.id === track.id)) {
        showSnackbar(`Уже есть в «${playlist.title}»`, "info");
        return;
      }
      updatePlaylists((list) =>
        list.map((p) =>
          p.id === playlist.id ? { ...p, tracks: [...p.tracks, track] } : p,
        ),
      );
      try {
        await api.addToPlaylist(playlist.id, track.id);
        showSnackbar(`Добавлено в «${playlist.title}»`);
      } catch (e) {
        lists.reload();
        fail(e, "Не удалось добавить");
      }
    },
    [fail, lists, updatePlaylists, showSnackbar],
  );

  const removeFromPlaylist = useCallback(
    async (playlist: Playlist, track: Track) => {
      updatePlaylists((list) =>
        list.map((p) =>
          p.id === playlist.id
            ? { ...p, tracks: p.tracks.filter((t) => t.id !== track.id) }
            : p,
        ),
      );
      try {
        await api.removeFromPlaylist(playlist.id, track.id);
        showSnackbar("Убрано из плейлиста");
      } catch (e) {
        lists.reload();
        fail(e, "Не удалось убрать");
      }
    },
    [fail, lists, updatePlaylists, showSnackbar],
  );

  const value = useMemo<MusicValue>(
    () => ({
      status:
        library.loading && !library.data
          ? "loading"
          : library.error
            ? "error"
            : "ready",
      error: library.error,
      reload: library.reload,
      tracks,
      ids,
      has: (track: Track) => ids.has(track.id),
      add,
      remove,
      upload,
      edit,
      destroy,
      playlists,
      playlistsStatus:
        lists.loading && !lists.data
          ? "loading"
          : lists.error
            ? "error"
            : "ready",
      playlistsError: lists.error,
      reloadPlaylists: lists.reload,
      createPlaylist,
      savePlaylist,
      deletePlaylist,
      addToPlaylist,
      removeFromPlaylist,
    }),
    [
      library.loading,
      library.data,
      library.error,
      library.reload,
      tracks,
      ids,
      add,
      remove,
      upload,
      edit,
      destroy,
      playlists,
      lists.loading,
      lists.data,
      lists.error,
      lists.reload,
      createPlaylist,
      savePlaylist,
      deletePlaylist,
      addToPlaylist,
      removeFromPlaylist,
    ],
  );

  return (
    <MusicContext.Provider value={value}>{children}</MusicContext.Provider>
  );
}

export function useMusic() {
  const context = useContext(MusicContext);
  if (!context)
    throw new Error("useMusic нужно вызывать внутри <MusicProvider>");
  return context;
}
