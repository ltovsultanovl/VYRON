import { useRef, useState } from "react";
import MeAvatar from "./MeAvatar";
import { CloseIcon, PhotoIcon } from "./Icons";
import { useSnackbar } from "./Snackbar";
import { useFilePicker } from "../hooks";
import { errorText, readImage } from "../utils";

export default function Composer({
  onPublish,
  autoFocus = false,
  onCancel,
  placeholder = "Что у вас нового?",
}: {
  onPublish: (data: {
    text: string;
    imageDataUrl: string | null;
  }) => Promise<boolean>;
  autoFocus?: boolean;
  onCancel?: () => void;
  placeholder?: string;
}) {
  const showSnackbar = useSnackbar();
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const expanded = focused || text.length > 0 || image;
  const canPublish = (text.trim() || image) && !sending;

  const picking = useRef(false);
  const openPicker = () => {
    picking.current = true;
    window.addEventListener(
      "focus",
      () => {
        setTimeout(() => {
          picking.current = false;
          ref.current?.focus();
        }, 300);
      },
      { once: true },
    );
    picker.open();
  };

  const picker = useFilePicker({
    accept: "image/*",
    onPick: async ([file]) => {
      picking.current = false;
      try {
        setImage(await readImage(file, { max: 1600, quality: 0.85 }));
      } catch (e) {
        showSnackbar(errorText(e), "error");
      }
    },
  });

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  };

  const publish = async () => {
    if (!canPublish) return;
    setSending(true);
    const ok = await onPublish({ text: text.trim(), imageDataUrl: image });
    setSending(false);
    if (!ok) return;
    setText("");
    setImage(null);
    setFocused(false);
    if (ref.current) ref.current.style.height = "auto";
  };

  return (
    <div className={`card composer ${expanded ? "composer--expanded" : ""}`}>
      <MeAvatar size={28} />
      <textarea
        ref={ref}
        rows={1}
        autoFocus={autoFocus}
        placeholder={placeholder}
        maxLength={10000}
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          if (picking.current) return;
          setFocused(false);
          if (!text.trim() && !image) onCancel?.();
        }}
        onChange={(e) => {
          setText(e.target.value);
          resize();
        }}
      />
      <div className="composer__tools">
        <button
          className="icon-btn"
          title="Прикрепить фотографию"
          onMouseDown={(e) => e.preventDefault()}
          onClick={openPicker}
        >
          <PhotoIcon />
        </button>
        {picker.input}
      </div>
      {image && (
        <div className="composer__attachment">
          <img src={image} alt="" />
          <button
            className="media__photo-delete"
            onClick={() => setImage(null)}
            title="Убрать фото"
          >
            <CloseIcon size={16} />
          </button>
        </div>
      )}
      {expanded && (
        <div className="composer__footer">
          <button
            className="btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={publish}
            disabled={!canPublish}
          >
            {sending ? "Публикуем…" : "Опубликовать"}
          </button>
        </div>
      )}
    </div>
  );
}
