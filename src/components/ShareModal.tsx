import { useState } from "react";
import Modal from "./Modal";
import Avatar from "./Avatar";
import { LinkIcon, SearchIcon } from "./Icons";
import { useSnackbar } from "./Snackbar";
import { useChat } from "../context/ChatContext";
import { plural } from "../utils";
import type { Shared, SharedType } from "../types";

const TITLES: Record<SharedType, string> = {
  post: "запись",
  photo: "фотографию",
  profile: "страницу",
  community: "сообщество",
  audio: "аудиозапись",
  playlist: "плейлист",
  video: "видео",
};

export default function ShareModal({
  shared,
  link,
  onClose,
}: {
  shared: Shared;
  link: string;
  onClose: () => void;
}) {
  const { dialogs, sendMessage } = useChat();
  const showSnackbar = useSnackbar();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set<string>());
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);

  const people = dialogs
    .map((d) => d.person)
    .filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()));

  const toggle = (id: string) =>
    setSelected((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const send = async () => {
    setSending(true);
    await Promise.all(
      [...selected].map((id) =>
        sendMessage(id, { text: comment.trim(), shared }),
      ),
    );
    const n = selected.size;
    showSnackbar(
      n > 1
        ? `Отправлено ${n} ${plural(n, ["получателю", "получателям", "получателям"])}`
        : "Отправлено",
    );
    onClose();
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(
        `${location.origin}${location.pathname}${link}`,
      );
      showSnackbar("Ссылка скопирована");
    } catch {
      showSnackbar("Не удалось скопировать ссылку", "error");
    }
  };

  return (
    <Modal
      title={`Отправить ${TITLES[shared.type]} сообщением`}
      onClose={onClose}
      width={460}
      footer={
        <>
          {link && (
            <button
              className="btn btn--tertiary share__copy"
              onClick={copyLink}
            >
              <LinkIcon size={18} /> Скопировать ссылку
            </button>
          )}
          <button
            className="btn"
            onClick={send}
            disabled={!selected.size || sending}
          >
            {sending
              ? "Отправляем…"
              : selected.size > 1
                ? `Отправить (${selected.size})`
                : "Отправить"}
          </button>
        </>
      }
    >
      <label className="search share__search">
        <SearchIcon size={16} />
        <input
          type="search"
          placeholder="Кому отправить"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </label>

      <div className="share__list">
        {people.map((p) => (
          <label
            key={p.id}
            className={`share__person ${selected.has(p.id) ? "share__person--on" : ""}`}
          >
            <Avatar
              name={p.name}
              color={p.color}
              src={p.avatar}
              size={40}
              online={p.online}
            />
            <span className="share__name">{p.name}</span>
            <input
              type="checkbox"
              checked={selected.has(p.id)}
              onChange={() => toggle(p.id)}
            />
            <span className="share__check" aria-hidden="true" />
          </label>
        ))}
        {!people.length && (
          <div className="empty empty--compact">
            {dialogs.length
              ? "Никого не нашлось"
              : "Здесь появятся друзья и ваши чаты — пока отправить некому"}
          </div>
        )}
      </div>

      {selected.size > 0 && (
        <input
          className="field share__comment"
          placeholder="Добавить сообщение (необязательно)"
          maxLength={4000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      )}
    </Modal>
  );
}
