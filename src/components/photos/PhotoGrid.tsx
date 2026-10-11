import { CheckIcon } from "../Icons";
import { bg } from "../../data";
import type { Photo } from "../../types";

export default function PhotoGrid({
  photos,
  onOpen,
  selecting = false,
  selected = new Set(),
  onToggle,
}: {
  photos: Photo[];
  onOpen: (index: number) => void;
  selecting?: boolean;
  selected?: Set<number>;
  onToggle?: (photo: Photo) => void;
}) {
  return (
    <div className="photo-grid">
      {photos.map((p, i) => {
        const checked = selected.has(p.id);
        return (
          <button
            key={p.id}
            className={`photo-grid__item ${selecting ? "photo-grid__item--selecting" : ""} ${checked ? "photo-grid__item--checked" : ""}`}
            style={{ background: bg(p.src, "var(--field-bg)") }}
            onClick={() => (selecting ? onToggle?.(p) : onOpen(i))}
            aria-label={
              selecting
                ? checked
                  ? "Снять выбор"
                  : "Выбрать фотографию"
                : "Открыть фотографию"
            }
            aria-pressed={selecting ? checked : undefined}
          >
            {selecting && (
              <span className="photo-grid__check">
                {checked && <CheckIcon size={16} />}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
