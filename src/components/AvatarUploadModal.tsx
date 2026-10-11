import { useState } from "react";
import Modal from "./Modal";
import { useProfile } from "../context/ProfileContext";
import { useSnackbar } from "./Snackbar";
import { errorText, readImage } from "../utils";
import type { Photo } from "../types";
import { addPhoto, explainError, removeImage } from "../api";
import { useFileDrop, useFilePicker } from "../hooks";

export default function AvatarUploadModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved?: (photo: Photo) => void;
}) {
  const { myId, profile, updateProfile } = useProfile();
  const [saving, setSaving] = useState(false);
  const showSnackbar = useSnackbar();
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleFile = async (file: File | undefined) => {
    setError("");
    setLoading(true);
    try {
      setImage(await readImage(file, { max: 1600, quality: 0.85 }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  };

  const picker = useFilePicker({
    accept: "image/jpeg,image/png,image/gif,image/webp",
    onPick: ([file]) => handleFile(file),
  });
  const [dragging, dropProps] = useFileDrop(([file]) => handleFile(file));

  const save = async () => {
    setSaving(true);
    try {
      if (!image) return;
      const photo = await addPhoto(myId, image);
      onSaved?.(photo);
      const old = profile.avatar;
      if (await updateProfile({ avatar: photo.src })) {
        if (old?.includes("/avatars/")) removeImage(old).catch(() => {});
        showSnackbar("Фотография обновлена");
        onClose();
        return;
      }
    } catch (e) {
      setError(explainError(e));
    }
    setSaving(false);
  };

  if (image) {
    return (
      <Modal
        title="Фотография на вашей странице"
        onClose={onClose}
        width={560}
        footer={
          <>
            <button
              className="btn btn--secondary"
              onClick={() => setImage(null)}
              disabled={saving}
            >
              Вернуться назад
            </button>
            <button className="btn" onClick={save} disabled={saving}>
              {saving ? "Сохраняем…" : "Сохранить и продолжить"}
            </button>
          </>
        }
      >
        <p className="modal__text">
          Выбранная область будет показываться на вашей странице, в новостях,
          сообщениях и комментариях.
        </p>
        {error && <div className="form-row__error">{error}</div>}
        <div className="upload-preview">
          <img className="upload-preview__main" src={image} alt="" />
          <div className="upload-preview__thumbs">
            <img src={image} alt="" style={{ width: 100, height: 100 }} />
            <img src={image} alt="" style={{ width: 50, height: 50 }} />
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Загрузка новой фотографии" onClose={onClose} width={560}>
      <div
        className={`dropzone ${dragging ? "dropzone--active" : ""}`}
        {...dropProps}
      >
        <p className="modal__text">
          Друзьям будет проще узнать вас, если вы загрузите свою настоящую
          фотографию.
          <br />
          Вы можете загрузить изображение в формате JPG, GIF или PNG.
        </p>
        <button className="btn" onClick={picker.open} disabled={loading}>
          {loading ? "Загрузка…" : "Выбрать файл"}
        </button>
        {picker.input}
        {error && <div className="form-row__error">{error}</div>}
        <p className="dropzone__hint">
          Можно перетащить фотографию сюда. Если у вас возникают проблемы с
          загрузкой, попробуйте выбрать фотографию меньшего размера.
        </p>
      </div>
    </Modal>
  );
}
