import { AlbumsIcon, LockIcon } from "../Icons";
import { bg } from "../../data";
import { plural } from "../../utils";
import type { AlbumPrivacy } from "../../types";

export const photosWord = (n: number) =>
  plural(n, ["фотография", "фотографии", "фотографий"]);

export default function AlbumCard({
  title,
  count,
  cover,
  href,
  privacy,
}: {
  title: string;
  count: number;
  cover?: string | null;
  href: string;
  privacy?: AlbumPrivacy;
}) {
  return (
    <a className="album-card" href={href}>
      <span
        className="album-card__cover"
        style={cover ? { background: bg(cover, "var(--field-bg)") } : undefined}
      >
        {!cover && <AlbumsIcon size={36} />}
      </span>
      <span className="album-card__info">
        <span className="album-card__title">
          {privacy && privacy !== "all" && <LockIcon size={14} />}
          {title}
        </span>
        <span className="album-card__count">
          {count} {photosWord(count)}
        </span>
      </span>
    </a>
  );
}
