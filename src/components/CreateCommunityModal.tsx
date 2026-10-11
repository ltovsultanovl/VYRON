import { useState } from "react";
import Modal from "./Modal";
import { createCommunity, explainError } from "../api";
import { useCommunities } from "../context/CommunitiesContext";
import type { Community, CommunityAccess, CommunityKind } from "../types";

export const COMMUNITY_CATEGORIES = [
  "Бизнес",
  "Блог",
  "Видеоигры",
  "Еда и рецепты",
  "Искусство",
  "Кино",
  "Красота",
  "Музыка",
  "Наука",
  "Новости и СМИ",
  "Образование",
  "Путешествия",
  "Развлечения",
  "Спорт",
  "Технологии",
  "Творчество",
  "Хобби",
  "Юмор",
  "Другое",
];

const KINDS: { id: CommunityKind; title: string; text: string }[] = [
  {
    id: "group",
    title: "Группа",
    text: "Для общения, обсуждений и совместных интересов. Участники могут писать на стене",
  },
  {
    id: "page",
    title: "Публичная страница",
    text: "Для новостей, блога или бренда. Пишут только администраторы, остальные — подписчики",
  },
];

export const ACCESS_OPTIONS: {
  id: CommunityAccess;
  title: string;
  text: string;
}[] = [
  { id: "open", title: "Открытая", text: "Вступить может любой" },
  {
    id: "closed",
    title: "Закрытая",
    text: "Вступают по заявке, записи видят только участники",
  },
  {
    id: "private",
    title: "Частная",
    text: "Только по приглашению, группу не найти в поиске",
  },
];

export default function CreateCommunityModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (community: Community) => void;
}) {
  const { reload } = useCommunities();
  const [kind, setKind] = useState<CommunityKind>("group");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [access, setAccess] = useState<CommunityAccess>("open");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setError("Название — от 2 символов");
    setSaving(true);
    setError("");
    try {
      const community = await createCommunity({
        name: name.trim(),
        kind,
        access,
        category,
      });
      await reload();
      onCreated(community);
    } catch (err) {
      setError(explainError(err));
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Создание сообщества"
      onClose={onClose}
      width={520}
      footer={
        <>
          <button className="btn btn--secondary" onClick={onClose}>
            Отмена
          </button>
          <button className="btn" form="create-community" disabled={saving}>
            {saving ? "Создаём…" : "Создать сообщество"}
          </button>
        </>
      }
    >
      <form
        id="create-community"
        className="media-form"
        onSubmit={submit}
        noValidate
      >
        <div className="kind-cards">
          {KINDS.map((k) => (
            <label
              key={k.id}
              className={`kind-card ${kind === k.id ? "kind-card--on" : ""}`}
            >
              <input
                type="radio"
                name="kind"
                checked={kind === k.id}
                onChange={() => setKind(k.id)}
              />
              <span className="kind-card__title">{k.title}</span>
              <span className="kind-card__text">{k.text}</span>
            </label>
          ))}
        </div>

        <label className="media-form__label">
          Название
          <input
            className={`field ${error ? "field--invalid" : ""}`}
            autoFocus
            maxLength={64}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
            placeholder={
              kind === "page"
                ? "Например, «Новости района»"
                : "Например, «Фотографы Москвы»"
            }
          />
        </label>

        <label className="media-form__label">
          Тематика
          <select
            className="field field--select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Не выбрана</option>
            {COMMUNITY_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>

        {kind === "group" && (
          <div className="media-form__label">
            Тип группы
            <div className="access-options">
              {ACCESS_OPTIONS.map((o) => (
                <label key={o.id} className="access-option">
                  <input
                    type="radio"
                    name="access"
                    checked={access === o.id}
                    onChange={() => setAccess(o.id)}
                  />
                  <span>
                    <span className="access-option__title">{o.title}</span>
                    <span className="access-option__text">{o.text}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {error && <div className="form-row__error">{error}</div>}
      </form>
    </Modal>
  );
}
