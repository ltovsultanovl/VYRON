import type { Album, Photo } from "../../types";

interface AlbumStat {
  count: number;
  cover: string | null;
}

export function albumStats(albums: Album[], photos: Photo[]): Record<number, AlbumStat> {
  const map: Record<number, AlbumStat> = { 0: { count: 0, cover: null } };
  albums.forEach((a) => (map[a.id] = { count: 0, cover: null }));
  photos.forEach((p) => {
    const s = map[p.albumId ?? 0];
    if (!s) return;
    s.count += 1;
    s.cover ??= p.src;
  });
  albums.forEach((a) => {
    const chosen = a.coverPhotoId && photos.find((p) => p.id === a.coverPhotoId);
    if (chosen) map[a.id].cover = chosen.src;
  });
  return map;
}
