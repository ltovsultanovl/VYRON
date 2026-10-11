import { useState } from "react";
import Modal from "../Modal";
import type { Playlist } from "../../types";

export default function PlaylistModal({
  playlist,
  onSave,
  onDelete,
  onClose,
}: {
  playlist?: Playlist | null;
  onSave: (data: { title: string; description: string }) => Promise<boolean>;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(playlist?.title ?? "");
  const [description, setDescription] = useState(playlist?.description ?? "");
  const [saving, setSaving] = useState(false);
  const valid = title.trim().length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    if (
      !(await onSave({ title: title.trim(), description: description.trim() }))
    )
      setSaving(false);
  };

  return (
    <Modal
      title={playlist ? "Редактирование плейлиста" : "Новый плейлист"}
      onClose={onClose}
      width={440}
      footer={
        <>
          {onDelete && (
            <button
              className="btn btn--tertiary album-modal__delete"
              onClick={onDelete}
            >
              Удалить плейлист
            </button>
          )}
          <button className="btn btn--secondary" onClick={onClose}>
            Отмена
          </button>
          <button
            className="btn"
            form="playlist-form"
            disabled={!valid || saving}
          >
            {playlist ? "Сохранить" : "Создать"}
          </button>
        </>
      }
    >
      <form id="playlist-form" className="media-form" onSubmit={submit}>
        <label className="media-form__label">
          Название
          <input
            className="field"
            autoFocus
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например, «В дорогу»"
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
      </form>
    </Modal>
  );
}
