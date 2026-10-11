import { useCallback, useEffect, useMemo, useState, type DependencyList } from "react";
import * as api from "./api";
import type { Album, Comment, Person, Photo, Post } from "./types";
import { useProfile } from "./context/ProfileContext";
import { useSnackbar } from "./components/Snackbar";
import { readImage } from "./utils";

const UPLOAD_PARALLEL = 3;

export interface Resource<T> {
  data: T | null;
  loading: boolean;
  error: string;
  setData: (fn: (data: T | null) => T | null) => void;
  update: (fn: (data: T) => T) => void;
  reload: () => void;
}

export function useResource<T>(load: () => Promise<T>, deps: DependencyList): Resource<T> {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string }>({
    data: null,
    loading: true,
    error: "",
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: "" }));
    load()
      .then((data) => !cancelled && setState({ data, loading: false, error: "" }))
      .catch((e) => !cancelled && setState((s) => ({ ...s, loading: false, error: api.explainError(e) })));
    return () => {
      cancelled = true;
    };
  }, [...deps, attempt]);

  const setData = useCallback((fn: (data: T | null) => T | null) => setState((s) => ({ ...s, data: fn(s.data) })), []);
  const update = useCallback(
    (fn: (data: T) => T) => setState((s) => (s.data === null ? s : { ...s, data: fn(s.data) })),
    [],
  );
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, setData, update, reload };
}

export const useUserProfile = (userId: string | null | undefined) =>
  useResource(() => (userId ? api.fetchProfile(userId) : Promise.resolve(null)), [userId]);

export const useFriendsOf = (userId: string | null | undefined) =>
  useResource<Person[]>(async () => {
    if (!userId) return [];
    return (await api.fetchFriendships(userId)).filter((l) => l.status === "friend").map((l) => l.person);
  }, [userId]);

export type PostSource =
  | { wall: string }
  | { community: number; suggested?: boolean }
  | { liked: true }
  | { bookmarked: true }
  | { feed: string[] | null; communities?: number[] };

export interface PublishData {
  ownerId?: string;
  communityId?: number;
  asCommunity?: boolean;
  suggested?: boolean;
  text: string;
  imageDataUrl?: string | null;
}

export type PostsFeed = ReturnType<typeof usePosts>;

export function usePosts(source: PostSource) {
  const { myId } = useProfile();
  const showSnackbar = useSnackbar();
  const key = JSON.stringify(source);

  const resource = useResource<Post[]>(() => {
    if ("wall" in source) return api.fetchWall(source.wall, myId);
    if ("community" in source) return api.fetchCommunityWall(source.community, myId, { suggested: !!source.suggested });
    if ("liked" in source) return api.fetchLikedPosts(myId);
    if ("bookmarked" in source) return api.fetchBookmarkedPosts(myId);
    return api.fetchFeed(source.feed, myId, source.communities ?? []);
  }, [key, myId]);
  const { setData, update, reload } = resource;
  const forSuggested = "suggested" in source && !!source.suggested;

  const patchPost = useCallback(
    (id: number, fn: (p: Post) => Post) => update((list) => list.map((p) => (p.id === id ? fn(p) : p))),
    [update],
  );

  const fail = useCallback(
    (e: unknown, text: string) => {
      showSnackbar(`${text}: ${api.explainError(e)}`, "error");
      reload();
    },
    [showSnackbar, reload],
  );

  const actions = useMemo(
    () => ({
    publish: async ({ ownerId, communityId, asCommunity, suggested, text, imageDataUrl }: PublishData) => {
      try {
        const image = imageDataUrl ? await api.uploadImage(myId, imageDataUrl, "posts") : null;
        const post = await api.createPost({
          ownerId,
          communityId,
          asCommunity,
          suggested,
          text,
          imageUrl: image?.url,
          myId,
        });
        if (suggested && !forSuggested) {
          showSnackbar("Новость предложена — её опубликуют после проверки руководители сообщества");
          return true;
        }
        setData((list) => {
          if (!list) return [post];
          const pinned = list.filter((p) => p.pinned);
          return [...pinned, post, ...list.filter((p) => !p.pinned)];
        });
        return true;
      } catch (e) {
        showSnackbar(`Не удалось опубликовать: ${api.explainError(e)}`, "error");
        return false;
      }
    },

    toggleLike: async (post: Post) => {
      const liked = !post.liked;
      patchPost(post.id, (p) => ({ ...p, liked, likes: p.likes + (liked ? 1 : -1) }));
      try {
        await api.setPostLiked(post.id, myId, liked);
      } catch (e) {
        patchPost(post.id, (p) => ({ ...p, liked: !liked, likes: p.likes + (liked ? -1 : 1) }));
        showSnackbar(api.explainError(e), "error");
      }
    },

    comment: async (post: Post, text: string) => {
      try {
        const comment = await api.addPostComment(post.id, text);
        patchPost(post.id, (p) => ({ ...p, comments: [...p.comments, comment] }));
        return true;
      } catch (e) {
        showSnackbar(`Комментарий не отправлен: ${api.explainError(e)}`, "error");
        return false;
      }
    },

    deleteComment: async (post: Post, comment: Comment) => {
      patchPost(post.id, (p) => ({ ...p, comments: p.comments.filter((c) => c.id !== comment.id) }));
      try {
        await api.deletePostComment(comment.id);
      } catch (e) {
        fail(e, "Не удалось удалить комментарий");
      }
    },

    remove: async (post: Post) => {
      update((list) => list.filter((p) => p.id !== post.id));
      try {
        await api.deletePost(post);
        showSnackbar("Запись удалена");
      } catch (e) {
        fail(e, "Не удалось удалить запись");
      }
    },

    approve: async (post: Post) => {
      update((list) => list.filter((p) => p.id !== post.id));
      try {
        await api.approveSuggestedPost(post.id);
        showSnackbar("Запись опубликована от имени сообщества");
        return true;
      } catch (e) {
        fail(e, "Не удалось опубликовать");
        return false;
      }
    },

    togglePin: async (post: Post) => {
      try {
        await api.setPostPinned(post, !post.pinned);
        reload();
      } catch (e) {
        fail(e, "Не удалось закрепить запись");
      }
    },
    }),
    [myId, showSnackbar, setData, update, patchPost, fail, reload, forSuggested],
  );

  return { ...resource, posts: resource.data ?? [], ...actions };
}

export function usePhotos(ownerId: string | null, { communityId, albumId, bookmarked }: api.PhotoSource = {}) {
  const { myId, profile, updateProfile } = useProfile();
  const showSnackbar = useSnackbar();
  const resource = useResource<Photo[]>(
    () => api.fetchPhotos(ownerId, myId, { communityId, albumId, bookmarked }),
    [ownerId, communityId, albumId, bookmarked, myId],
  );
  const { setData, update, reload } = resource;

  const patchPhoto = useCallback(
    (id: number, fn: (p: Photo) => Photo) => update((list) => list.map((p) => (p.id === id ? fn(p) : p))),
    [update],
  );

  const upload = async (files: File[], { albumId: target = albumId }: { albumId?: number } = {}) => {
    let added = 0;
    let lastError: unknown = null;
    const queue = [...files];
    const worker = async () => {
      for (let file = queue.shift(); file; file = queue.shift()) {
        try {
          const dataUrl = await readImage(file, { max: 1600, quality: 0.85 });
          const photo = await api.addPhoto(myId, dataUrl, { communityId, albumId: target || undefined });
          setData((list) => [photo, ...(list ?? [])]);
          added += 1;
        } catch (e) {
          lastError = e;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(UPLOAD_PARALLEL, files.length) }, worker));
    return { added, failed: files.length - added, error: lastError ? api.explainError(lastError) : "" };
  };

  const addLocal = (photo: Photo) => setData((list) => [photo, ...(list ?? []).filter((p) => p.id !== photo.id)]);

  const remove = async (photo: Photo) => {
    update((list) => list.filter((p) => p.id !== photo.id));
    try {
      await api.deletePhoto(photo);
      if (photo.ownerId === myId && profile?.avatar === photo.src) await updateProfile({ avatar: null });
      showSnackbar("Фотография удалена");
    } catch (e) {
      showSnackbar(`Не удалось удалить: ${api.explainError(e)}`, "error");
      reload();
    }
  };

  const removeMany = async (photos: Photo[]) => {
    const ids = photos.map((p) => p.id);
    update((list) => list.filter((p) => !ids.includes(p.id)));
    const results = await Promise.allSettled(photos.map((p) => api.deletePhoto(p)));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (photos.some((p) => p.ownerId === myId && profile?.avatar === p.src)) await updateProfile({ avatar: null });
    if (failed) {
      showSnackbar(`Не удалось удалить ${failed} из ${photos.length}`, "error");
      reload();
    } else {
      showSnackbar(photos.length > 1 ? `Удалено фотографий: ${photos.length}` : "Фотография удалена");
    }
  };

  const toggleLike = async (photo: Photo) => {
    const liked = !photo.liked;
    patchPhoto(photo.id, (p) => ({ ...p, liked, likes: p.likes + (liked ? 1 : -1) }));
    try {
      await api.setPhotoLiked(photo.id, myId, liked);
    } catch (e) {
      patchPhoto(photo.id, (p) => ({ ...p, liked: !liked, likes: p.likes + (liked ? -1 : 1) }));
      showSnackbar(api.explainError(e), "error");
    }
  };

  const comment = async (photo: Photo, text: string) => {
    try {
      const c = await api.addPhotoComment(photo.id, text);
      patchPhoto(photo.id, (p) => ({ ...p, comments: [...p.comments, c] }));
      return true;
    } catch (e) {
      showSnackbar(`Комментарий не отправлен: ${api.explainError(e)}`, "error");
      return false;
    }
  };

  const deleteComment = async (photo: Photo, c: Comment) => {
    patchPhoto(photo.id, (p) => ({ ...p, comments: p.comments.filter((x) => x.id !== c.id) }));
    try {
      await api.deletePhotoComment(c.id);
    } catch (e) {
      showSnackbar(api.explainError(e), "error");
      reload();
    }
  };

  const move = async (photos: Photo[], targetAlbumId: number | null, targetTitle: string) => {
    const ids = photos.map((p) => p.id);
    const leaves = albumId !== undefined && (targetAlbumId ?? 0) !== albumId;
    update((list) =>
      leaves ? list.filter((p) => !ids.includes(p.id)) : list.map((p) => (ids.includes(p.id) ? { ...p, albumId: targetAlbumId } : p)),
    );
    try {
      await api.movePhotos(ids, targetAlbumId);
      showSnackbar(
        ids.length > 1 ? `Фотографии перенесены в «${targetTitle}»` : `Фотография перенесена в «${targetTitle}»`,
      );
    } catch (e) {
      showSnackbar(`Не удалось перенести: ${api.explainError(e)}`, "error");
      reload();
    }
  };

  return { ...resource, photos: resource.data ?? [], upload, addLocal, remove, removeMany, move, toggleLike, comment, deleteComment };
}

export function useAlbums(ownerId: string) {
  const showSnackbar = useSnackbar();
  const resource = useResource<Album[]>(() => api.fetchAlbums(ownerId), [ownerId]);
  const { setData, update, reload } = resource;

  const create = async (data: api.AlbumData) => {
    try {
      const album = await api.createAlbum(data);
      setData((list) => [album, ...(list ?? [])]);
      showSnackbar("Альбом создан");
      return album;
    } catch (e) {
      showSnackbar(`Не удалось создать альбом: ${api.explainError(e)}`, "error");
      return null;
    }
  };

  const save = async (album: Album) => {
    try {
      await api.saveAlbum(album);
      update((list) => list.map((a) => (a.id === album.id ? { ...a, ...album } : a)));
      showSnackbar("Альбом сохранён");
      return true;
    } catch (e) {
      showSnackbar(`Не удалось сохранить: ${api.explainError(e)}`, "error");
      return false;
    }
  };

  const remove = async (album: Album, photos: Photo[]) => {
    try {
      await api.deleteAlbum(album, photos);
      update((list) => list.filter((a) => a.id !== album.id));
      showSnackbar("Альбом удалён");
      return true;
    } catch (e) {
      showSnackbar(`Не удалось удалить альбом: ${api.explainError(e)}`, "error");
      reload();
      return false;
    }
  };

  const setCover = async (album: Album, photo: Photo) => {
    update((list) => list.map((a) => (a.id === album.id ? { ...a, coverPhotoId: photo.id } : a)));
    try {
      await api.setAlbumCover(album.id, photo.id);
      showSnackbar("Обложка альбома изменена");
    } catch (e) {
      showSnackbar(api.explainError(e), "error");
      reload();
    }
  };

  return { ...resource, albums: resource.data ?? [], create, save, remove, setCover };
}
