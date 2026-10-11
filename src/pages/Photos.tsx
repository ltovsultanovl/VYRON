import { useMemo, useState } from "react";
import ConfirmModal from "../components/ConfirmModal";
import PhotoViewer from "../components/PhotoViewer";
import AlbumCard, { photosWord } from "../components/photos/AlbumCard";
import AlbumModal, { privacyLabel } from "../components/photos/AlbumModal";
import MoveToAlbumModal, {
  PROFILE_ALBUM_TITLE,
} from "../components/photos/MoveToAlbumModal";
import PhotoGrid from "../components/photos/PhotoGrid";
import { albumStats } from "../components/photos/albumStats";
import { useSnackbar } from "../components/Snackbar";
import {
  AlbumsIcon,
  ChevronLeftIcon,
  CheckIcon,
  LockIcon,
  PencilIcon,
  PhotoIcon,
  PlusIcon,
} from "../components/Icons";
import { useProfile } from "../context/ProfileContext";
import { useFileDrop, useFilePicker } from "../hooks";
import { useAlbums, usePhotos, useUserProfile } from "../resources";
import { fullName } from "../profile";
import type { Album, Navigate, Photo } from "../types";

const ALBUMS_PREVIEW = 6;

function Spinner({ text }: { text?: string }) {
  return (
    <div className="card list-state" role="status">
      <div className="chat-status__spinner" />
      {text}
    </div>
  );
}

function SelectionBar({
  count,
  onMove,
  onDelete,
  onCancel,
}: {
  count: number;
  onMove: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="photos-selection">
      <span className="photos-selection__count">
        {count ? `Выбрано: ${count}` : "Отметьте фотографии"}
      </span>
      <button className="btn btn--neutral" disabled={!count} onClick={onMove}>
        Перенести
      </button>
      <button
        className="btn btn--neutral photos-selection__delete"
        disabled={!count}
        onClick={onDelete}
      >
        Удалить
      </button>
      <button className="btn btn--tertiary" onClick={onCancel}>
        Отмена
      </button>
    </div>
  );
}

export default function Photos({
  param,
  sub,
  section,
  onNavigate,
}: {
  param: string;
  sub: string;
  section: string;
  onNavigate: Navigate;
}) {
  const { myId, profile: myProfile } = useProfile();
  const showSnackbar = useSnackbar();
  const own = !param || param === "album" || param === myId;
  const ownerId = own ? myId : param;
  const albumParam = param === "album" ? sub : sub === "album" ? section : "";
  const albumId = albumParam === "" ? null : Number(albumParam);
  const base = own ? "#photos" : `#photos/${ownerId}`;

  const other = useUserProfile(own ? null : ownerId);
  const profile = own ? myProfile : other.data;
  const photos = usePhotos(ownerId);
  const albums = useAlbums(ownerId);

  const [viewer, setViewer] = useState<{ index: number } | null>(null);
  const [editing, setEditing] = useState<"new" | Album | null>(null);
  const [deletingAlbum, setDeletingAlbum] = useState<Album | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set<number>());
  const [movingSelected, setMovingSelected] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [allAlbums, setAllAlbums] = useState(false);

  const [shownAlbum, setShownAlbum] = useState(albumId);
  if (shownAlbum !== albumId) {
    setShownAlbum(albumId);
    setSelecting(false);
    setSelected(new Set());
    setViewer(null);
  }

  const album = albumId ? albums.albums.find((a) => a.id === albumId) : null;
  const list = useMemo(
    () =>
      albumId === null
        ? photos.photos
        : photos.photos.filter((p) =>
            albumId === 0 ? p.albumId === null : p.albumId === albumId,
          ),
    [photos.photos, albumId],
  );

  const stats = useMemo(() => albumStats(albums.albums, photos.photos), [albums.albums, photos.photos]);
  const covers = Object.fromEntries(
    Object.entries(stats).map(([id, s]) => [id, s.cover]),
  );

  const upload = async (files: File[]) => {
    if (!own) return;
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length)
      return showSnackbar(
        "Выберите изображение в формате JPG, PNG или GIF",
        "error",
      );
    setUploading(true);
    const { added, failed, error } = await photos.upload(images, {
      albumId: albumId || undefined,
    });
    setUploading(false);
    if (failed)
      showSnackbar(
        added ? `Загружено ${added} из ${images.length}: ${error}` : error,
        "error",
      );
    else
      showSnackbar(
        added > 1 ? `Загружено фотографий: ${added}` : "Фотография загружена",
      );
  };
  const picker = useFilePicker({
    accept: "image/*",
    multiple: true,
    onPick: upload,
  });
  const [dragOver, dropProps] = useFileDrop(upload);

  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const toggle = (p: Photo) =>
    setSelected((set) => {
      const next = new Set(set);
      if (next.has(p.id)) next.delete(p.id);
      else next.add(p.id);
      return next;
    });
  const selectedPhotos = list.filter((p) => selected.has(p.id));

  if (!own && other.loading && !other.data)
    return <Spinner text="Загружаем фотографии…" />;
  if (!profile) {
    if (own) return <Spinner />;
    return (
      <div className="card list-state">
        {other.error || "Такой страницы нет"}
        <a className="btn" href="#feed">
          В ленту
        </a>
      </div>
    );
  }
  const name = fullName(profile);
  const loading =
    (photos.loading && !photos.data) || (albums.loading && !albums.data);
  const error = photos.error || albums.error;

  if (albumId && !loading && !album) {
    return (
      <div className="card list-state">
        Альбом не найден — возможно, его удалили или скрыли настройками
        приватности.
        <a className="btn" href={base}>
          К фотографиям
        </a>
      </div>
    );
  }

  const ownerLink = (
    <a className="link" href={own ? "#profile" : `#user/${ownerId}`}>
      {name}
    </a>
  );
  const pageTitle =
    albumId === null ? (
      own ? (
        "Мои фотографии"
      ) : (
        <>Фотографии · {ownerLink}</>
      )
    ) : null;
  const albumTitle = albumId === 0 ? PROFILE_ALBUM_TITLE : album?.title;
  const albumsShown = allAlbums
    ? albums.albums
    : albums.albums.slice(0, ALBUMS_PREVIEW - 1);

  const actions = own && (
    <div className="photos-head__actions">
      {albumId === null && (
        <button className="btn btn--neutral" onClick={() => setEditing("new")}>
          <PlusIcon size={18} /> Создать альбом
        </button>
      )}
      {album && (
        <button className="btn btn--neutral" onClick={() => setEditing(album)}>
          <PencilIcon size={18} /> Редактировать
        </button>
      )}
      <button className="btn" onClick={picker.open} disabled={uploading}>
        {uploading ? "Загрузка…" : "Добавить фотографии"}
      </button>
    </div>
  );

  return (
    <div
      className={`photos-page ${dragOver && own ? "photos-page--drag" : ""}`}
      {...(own ? dropProps : {})}
    >
      <section className="card photos-head">
        {albumId === null ? (
          <h1 className="photos-head__title">
            {pageTitle}{" "}
            {photos.data && (
              <span className="muted">{photos.photos.length}</span>
            )}
          </h1>
        ) : (
          <div className="photos-head__album">
            <a className="photos-head__back" href={base}>
              <ChevronLeftIcon size={18} />{" "}
              {own ? "Мои фотографии" : <>Фотографии · {name}</>}
            </a>
            <h1 className="photos-head__title">
              {album && album.privacy !== "all" && <LockIcon size={18} />}
              {albumTitle} <span className="muted">{list.length}</span>
            </h1>
            {album?.description && (
              <p className="photos-head__desc">{album.description}</p>
            )}
            {own && album && (
              <div className="photos-head__privacy">
                Видят: {privacyLabel(album.privacy).toLowerCase()}
              </div>
            )}
          </div>
        )}
        {actions}
        {picker.input}
      </section>

      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="card list-state" role="alert">
          Не удалось загрузить фотографии: {error}
          <button
            className="btn"
            onClick={() => {
              photos.reload();
              albums.reload();
            }}
          >
            Повторить
          </button>
        </div>
      ) : (
        <>
          {albumId === null &&
            (stats[0].count > 0 || albums.albums.length > 0 || own) && (
              <section className="card photos-section">
                <div className="card__header">
                  {own ? "Мои альбомы" : "Альбомы"}{" "}
                  <span className="muted">{albums.albums.length + 1}</span>
                  {albums.albums.length > ALBUMS_PREVIEW - 1 && (
                    <button
                      className="card__header-action btn btn--tertiary"
                      onClick={() => setAllAlbums((v) => !v)}
                    >
                      {allAlbums ? "Свернуть" : "Показать все"}
                    </button>
                  )}
                </div>
                <div className="album-grid">
                  <AlbumCard
                    title={PROFILE_ALBUM_TITLE}
                    count={stats[0].count}
                    cover={stats[0].cover}
                    href={`${base}/album/0`}
                  />
                  {albumsShown.map((a) => (
                    <AlbumCard
                      key={a.id}
                      title={a.title}
                      count={stats[a.id]?.count ?? 0}
                      cover={stats[a.id]?.cover}
                      privacy={own ? a.privacy : undefined}
                      href={`${base}/album/${a.id}`}
                    />
                  ))}
                </div>
              </section>
            )}

          <section className="card photos-section">
            <div className="card__header">
              {albumId === null
                ? own
                  ? "Мои фотографии"
                  : "Фотографии"
                : "Фотографии в альбоме"}{" "}
              <span className="muted">{list.length}</span>
              {own && list.length > 0 && !selecting && (
                <button
                  className="card__header-action btn btn--tertiary"
                  onClick={() => setSelecting(true)}
                >
                  <CheckIcon size={16} /> Выбрать
                </button>
              )}
            </div>
            {selecting && (
              <SelectionBar
                count={selected.size}
                onMove={() => setMovingSelected(true)}
                onDelete={() => setDeletingSelected(true)}
                onCancel={stopSelecting}
              />
            )}
            {list.length ? (
              <PhotoGrid
                photos={list}
                selecting={selecting}
                selected={selected}
                onToggle={toggle}
                onOpen={(index) => setViewer({ index })}
              />
            ) : (
              <div className="media__empty">
                {albumId === null ? (
                  <PhotoIcon size={32} />
                ) : (
                  <AlbumsIcon size={32} />
                )}
                {own
                  ? albumId === null
                    ? "Здесь пока нет фотографий — нажмите «Добавить фотографии» или перетащите файлы сюда"
                    : "В альбоме пока нет фотографий — добавьте их кнопкой выше или перетащите сюда"
                  : "Здесь пока нет фотографий"}
              </div>
            )}
          </section>
        </>
      )}

      {dragOver && own && (
        <div className="photos-page__drop">
          Отпустите, чтобы загрузить{" "}
          {albumTitle ? `в «${albumTitle}»` : "фотографии"}
        </div>
      )}

      {viewer && list[viewer.index] && (
        <PhotoViewer
          photos={list}
          index={viewer.index}
          owner={{
            id: ownerId,
            name,
            firstName: profile.firstName,
            color: profile.color,
            avatar: profile.avatar,
          }}
          onIndexChange={(index) => setViewer({ index })}
          onClose={() => setViewer(null)}
          onDelete={photos.remove}
          onToggleLike={photos.toggleLike}
          onComment={photos.comment}
          onDeleteComment={photos.deleteComment}
          albums={own ? albums.albums : undefined}
          onMove={(photo, target, title) => photos.move([photo], target, title)}
          onSetCover={(photo) => {
            const a = albums.albums.find((x) => x.id === photo.albumId);
            if (a) albums.setCover(a, photo);
          }}
        />
      )}

      {editing && (
        <AlbumModal
          album={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDelete={
            editing !== "new" ? () => setDeletingAlbum(editing) : undefined
          }
          onSave={async (data) => {
            if (editing === "new") {
              const created = await albums.create(data);
              if (!created) return false;
              setEditing(null);
              onNavigate(`photos/album/${created.id}`);
              return true;
            }
            const ok = await albums.save({ ...editing, ...data });
            if (ok) setEditing(null);
            return ok;
          }}
        />
      )}

      {deletingAlbum && (
        <ConfirmModal
          title="Удаление альбома"
          text={`Удалить альбом «${deletingAlbum.title}» вместе с ${stats[deletingAlbum.id]?.count ?? 0} ${photosWord(stats[deletingAlbum.id]?.count ?? 0)}? Это нельзя отменить.`}
          onConfirm={async () => {
            const inside = photos.photos.filter(
              (p) => p.albumId === deletingAlbum.id,
            );
            setDeletingAlbum(null);
            setEditing(null);
            if (await albums.remove(deletingAlbum, inside)) {
              photos.reload();
              onNavigate("photos");
            }
          }}
          onClose={() => setDeletingAlbum(null)}
        />
      )}

      {movingSelected && (
        <MoveToAlbumModal
          albums={albums.albums}
          currentAlbumId={albumId === null ? undefined : albumId || null}
          count={selected.size}
          covers={covers}
          onMove={async (target, title) => {
            setMovingSelected(false);
            await photos.move(selectedPhotos, target, title);
            stopSelecting();
          }}
          onClose={() => setMovingSelected(false)}
        />
      )}

      {deletingSelected && (
        <ConfirmModal
          title="Удаление фотографий"
          text={`Удалить выбранные фотографии (${selected.size})? Это нельзя отменить.`}
          onConfirm={async () => {
            setDeletingSelected(false);
            await photos.removeMany(selectedPhotos);
            stopSelecting();
          }}
          onClose={() => setDeletingSelected(false)}
        />
      )}
    </div>
  );
}
