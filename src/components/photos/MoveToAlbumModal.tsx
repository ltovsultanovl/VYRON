import Modal from "../Modal";
import { AlbumsIcon, CheckIcon } from "../Icons";
import { bg } from "../../data";
import type { Album } from "../../types";

export const PROFILE_ALBUM_TITLE = "Фотографии с моей страницы";

export default function MoveToAlbumModal({
  albums,
  currentAlbumId,
  count = 1,
  covers = {},
  onMove,
  onClose,
}: {
  albums: Album[];
  currentAlbumId?: number | null;
  count?: number;
  covers?: Record<string, string | null>;
  onMove: (albumId: number | null, title: string) => void;
  onClose: () => void;
}) {
  const options: { id: number | null; title: string }[] = [
    { id: null, title: PROFILE_ALBUM_TITLE },
    ...albums,
  ];
  return (
    <Modal
      title={
        count > 1 ? `Перенести ${count} фото в альбом` : "Перенести в альбом"
      }
      onClose={onClose}
      width={420}
    >
      <div className="album-picker">
        {options.map((a) => {
          const current = (a.id ?? null) === (currentAlbumId ?? null);
          const cover = covers[a.id ?? 0];
          return (
            <button
              key={a.id ?? 0}
              className={`album-picker__item ${current ? "album-picker__item--current" : ""}`}
              disabled={current}
              onClick={() => onMove(a.id, a.title)}
            >
              <span
                className="album-picker__cover"
                style={
                  cover
                    ? { background: bg(cover, "var(--field-bg)") }
                    : undefined
                }
              >
                {!cover && <AlbumsIcon size={20} />}
              </span>
              <span className="album-picker__title">{a.title}</span>
              {current && <CheckIcon size={18} />}
            </button>
          );
        })}
      </div>
      {!albums.length && (
        <div className="album-picker__hint">
          Создайте альбом в разделе «Фото», чтобы раскладывать снимки
        </div>
      )}
    </Modal>
  );
}
