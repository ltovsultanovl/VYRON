import { useState } from "react";
import Modal from "../Modal";
import type { Album, AlbumPrivacy } from "../../types";

const TITLE_LIMIT = 64;

const PRIVACY_OPTIONS: { id: AlbumPrivacy; label: string }[] = [
  { id: "all", label: "Все пользователи" },
  { id: "friends", label: "Только друзья" },
  { id: "me", label: "Только я" },
];
export const privacyLabel = (id: AlbumPrivacy) =>
  PRIVACY_OPTIONS.find((o) => o.id === id)?.label ?? "";

export default function AlbumModal({
  album,
  onSave,
  onDelete,
  onClose,
}: {
  album?: Album | null;
  onSave: (data: {
    title: string;
    description: string;
    privacy: AlbumPrivacy;
  }) => Promise<boolean>;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(album?.title ?? "");
  const [description, setDescription] = useState(album?.description ?? "");
  const [privacy, setPrivacy] = useState<AlbumPrivacy>(album?.privacy ?? "all");
  const [saving, setSaving] = useState(false);
  const valid = title.trim().length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    const done = await onSave({
      title: title.trim(),
      description: description.trim(),
      privacy,
    });
    if (!done) setSaving(false);
  };

  return (
    <Modal
      title={album ? "Редактирование альбома" : "Новый альбом"}
      onClose={onClose}
      width={460}
      footer={
        <>
          {onDelete && (
            <button
              className="btn btn--tertiary album-modal__delete"
              onClick={onDelete}
            >
              Удалить альбом
            </button>
          )}
          <button className="btn btn--secondary" onClick={onClose}>
            Отмена
          </button>
          <button className="btn" form="album-form" disabled={!valid || saving}>
            {saving ? "Сохраняем…" : album ? "Сохранить" : "Создать альбом"}
          </button>
        </>
      }
    >
      <form id="album-form" className="media-form" onSubmit={submit}>
        <label className="media-form__label">
          Название
          <input
            className="field"
            autoFocus
            maxLength={TITLE_LIMIT}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например, «Лето 2026»"
          />
        </label>
        <label className="media-form__label">
          Описание
          <textarea
            className="field field--textarea"
            maxLength={1000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Необязательно"
          />
        </label>
        <label className="media-form__label">
          Кто может просматривать этот альбом?
          <select
            className="field field--select"
            value={privacy}
            onChange={(e) => setPrivacy(e.target.value as AlbumPrivacy)}
          >
            {PRIVACY_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </form>
    </Modal>
  );
}
