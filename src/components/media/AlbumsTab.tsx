import { useMemo, useState } from "react";
import MediaEmpty from "./MediaEmpty";
import AlbumCard from "../photos/AlbumCard";
import AlbumModal from "../photos/AlbumModal";
import { PROFILE_ALBUM_TITLE } from "../photos/MoveToAlbumModal";
import { AlbumsIcon } from "../Icons";
import { useAlbums } from "../../resources";
import { albumStats } from "../photos/albumStats";
import type { Photo } from "../../types";

const PREVIEW = 3;

export default function AlbumsTab({
  owner,
  isMe,
  photos,
}: {
  owner: { id: string };
  isMe: boolean;
  photos: Photo[];
}) {
  const albums = useAlbums(owner.id);
  const [creating, setCreating] = useState(false);
  const base = isMe ? "#photos" : `#photos/${owner.id}`;

  const stats = useMemo(
    () => albumStats(albums.albums, photos),
    [albums.albums, photos],
  );

  if (albums.loading && !albums.data) {
    return (
      <div className="media__empty" role="status">
        <div className="chat-status__spinner" />
      </div>
    );
  }

  const shown = albums.albums.slice(0, PREVIEW - 1);
  const hasAny = stats[0].count > 0 || albums.albums.length > 0;

  return (
    <>
      {hasAny ? (
        <div className="album-grid album-grid--compact">
          <AlbumCard
            title={PROFILE_ALBUM_TITLE}
            count={stats[0].count}
            cover={stats[0].cover}
            href={`${base}/album/0`}
          />
          {shown.map((a) => (
            <AlbumCard
              key={a.id}
              title={a.title}
              count={stats[a.id].count}
              cover={stats[a.id].cover}
              privacy={isMe ? a.privacy : undefined}
              href={`${base}/album/${a.id}`}
            />
          ))}
        </div>
      ) : (
        <MediaEmpty Icon={AlbumsIcon}>Альбомов пока нет</MediaEmpty>
      )}

      <div className="media__actions">
        {isMe && (
          <button
            className="btn btn--neutral"
            onClick={() => setCreating(true)}
          >
            Создать альбом
          </button>
        )}
        <a className="btn btn--neutral" href={base}>
          Все альбомы {albums.albums.length + 1}
        </a>
      </div>

      {creating && (
        <AlbumModal
          onClose={() => setCreating(false)}
          onSave={async (data) => {
            const created = await albums.create(data);
            if (created) setCreating(false);
            return !!created;
          }}
        />
      )}
    </>
  );
}
