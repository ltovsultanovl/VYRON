import { useEffect, useState } from "react";
import Avatar from "../components/Avatar";
import SideMenu from "../components/SideMenu";
import ConfirmModal from "../components/ConfirmModal";
import CommunityInbox from "../components/CommunityInbox";
import {
  ACCESS_OPTIONS,
  COMMUNITY_CATEGORIES,
} from "../components/CreateCommunityModal";
import { useSnackbar } from "../components/Snackbar";
import { CameraIcon, SearchIcon } from "../components/Icons";
import { useProfile } from "../context/ProfileContext";
import { useCommunities } from "../context/CommunitiesContext";
import { useFilePicker } from "../hooks";
import { useResource } from "../resources";
import { bg } from "../data";
import {
  answerCommunityRequest,
  deleteCommunity,
  explainError,
  fetchCommunity,
  fetchCommunityMembers,
  removeFromCommunity,
  saveCommunity,
  setCommunityRole,
  uploadImage,
} from "../api";
import { readImage } from "../utils";
import { ROLE_LABELS } from "../components/communityRoles";
import type { ChangeEvent } from "react";
import type { Community, CommunityDetails, CommunityRole, MemberStatus, Navigate, Person } from "../types";

interface ManageSection {
  id: string;
  label: string;
}


function InfoSection({ community, onSaved }: { community: Community; onSaved: (community: Community) => void }) {
  const { myId } = useProfile();
  const showSnackbar = useSnackbar();
  const [draft, setDraft] = useState(community);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"avatar" | "cover" | null>(null);
  const set =
    (key: keyof Community) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setDraft((d) => ({
        ...d,
        [key]: e.target instanceof HTMLInputElement && e.target.type === "checkbox" ? e.target.checked : e.target.value,
      }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(community);

  const uploadTo =
    (key: "avatar" | "cover") =>
    async ([file]: File[]) => {
      setUploading(key);
      try {
        const dataUrl = await readImage(
          file,
          key === "avatar" ? { max: 600, square: true } : { max: 1600 },
        );
        const { url } = await uploadImage(myId, dataUrl, "communities");
        setDraft((d) => ({ ...d, [key]: url }));
      } catch (e) {
        showSnackbar(explainError(e), "error");
      } finally {
        setUploading(null);
      }
    };
  const avatarPicker = useFilePicker({
    accept: "image/*",
    onPick: uploadTo("avatar"),
  });
  const coverPicker = useFilePicker({
    accept: "image/*",
    onPick: uploadTo("cover"),
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (draft.name.trim().length < 2)
      return showSnackbar("Название — от 2 символов", "error");
    setSaving(true);
    try {
      const clean = {
        ...draft,
        name: draft.name.trim(),
        website: draft.website.trim(),
      };
      await saveCommunity(clean);
      showSnackbar("Изменения сохранены");
      onSaved(clean);
    } catch (err) {
      showSnackbar(`Не удалось сохранить: ${explainError(err)}`, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="edit__form" onSubmit={save}>
      <div className="manage-design">
        <div
          className="manage-design__cover"
          style={{
            background: draft.cover
              ? bg(draft.cover, "var(--cover-empty)")
              : "var(--cover-empty)",
          }}
        >
          <button
            type="button"
            className="btn btn--overlay"
            onClick={coverPicker.open}
            disabled={!!uploading}
          >
            <CameraIcon size={18} />{" "}
            {uploading === "cover" ? "Загрузка…" : "Обложка"}
          </button>
          {draft.cover && (
            <button
              type="button"
              className="btn btn--overlay"
              onClick={() => setDraft((d) => ({ ...d, cover: null }))}
            >
              Убрать
            </button>
          )}
        </div>
        <button
          type="button"
          className="manage-design__avatar"
          onClick={avatarPicker.open}
          title="Изменить аватар"
          disabled={!!uploading}
        >
          <Avatar
            name={draft.name}
            color={draft.color}
            src={draft.avatar}
            size={96}
            empty={false}
          />
          <span className="avatar-edit__overlay">
            <CameraIcon size={22} />
          </span>
        </button>
        {avatarPicker.input}
        {coverPicker.input}
      </div>

      <div className="form-row">
        <div className="form-row__label">Название</div>
        <div className="form-row__field">
          <input
            className="field"
            value={draft.name}
            onChange={set("name")}
            maxLength={64}
          />
        </div>
      </div>
      <div className="form-row">
        <div className="form-row__label">Статус</div>
        <div className="form-row__field">
          <input
            className="field"
            value={draft.status}
            onChange={set("status")}
            maxLength={140}
            placeholder="Коротко о главном"
          />
        </div>
      </div>
      <div className="form-row">
        <div className="form-row__label">Описание</div>
        <div className="form-row__field">
          <textarea
            className="field field--textarea"
            rows={4}
            value={draft.description}
            onChange={set("description")}
            maxLength={4000}
          />
        </div>
      </div>
      <div className="form-row">
        <div className="form-row__label">Тематика</div>
        <div className="form-row__field">
          <select
            className="field field--select"
            value={draft.category}
            onChange={set("category")}
          >
            <option value="">Не выбрана</option>
            {COMMUNITY_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-row__label">Сайт</div>
        <div className="form-row__field">
          <input
            className="field"
            value={draft.website}
            onChange={set("website")}
            maxLength={200}
            placeholder="example.com"
          />
        </div>
      </div>
      <div className="form-row">
        <div className="form-row__label">Город</div>
        <div className="form-row__field">
          <input
            className="field"
            value={draft.city}
            onChange={set("city")}
            maxLength={64}
          />
        </div>
      </div>

      <div className="edit__separator" />

      {!community.isPage && (
        <>
          <div className="form-row">
            <div className="form-row__label">Тип группы</div>
            <div className="form-row__field access-options">
              {ACCESS_OPTIONS.map((o) => (
                <label key={o.id} className="access-option">
                  <input
                    type="radio"
                    name="access"
                    checked={draft.access === o.id}
                    onChange={() => setDraft((d) => ({ ...d, access: o.id }))}
                  />
                  <span>
                    <span className="access-option__title">{o.title}</span>
                    <span className="access-option__text">{o.text}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="form-row">
            <div className="form-row__label">Стена</div>
            <div className="form-row__field">
              <select
                className="field field--select"
                value={draft.wall}
                onChange={set("wall")}
              >
                <option value="open">Открытая — участники пишут от себя</option>
                <option value="limited">
                  Ограниченная — пишут руководители, участники предлагают
                  новости
                </option>
              </select>
            </div>
          </div>
        </>
      )}
      <div className="form-row">
        <div className="form-row__label">Сообщения</div>
        <div className="form-row__field">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={draft.messagesEnabled}
              onChange={set("messagesEnabled")}
            />
            <span className="checkbox__box" aria-hidden="true" />
            Разрешить писать сообществу
          </label>
        </div>
      </div>

      <div className="edit__footer">
        <button className="btn" disabled={!dirty || saving || !!uploading}>
          {saving ? "Сохраняем…" : "Сохранить"}
        </button>
        {dirty && (
          <button
            type="button"
            className="btn btn--tertiary"
            onClick={() => setDraft(community)}
          >
            Отменить
          </button>
        )}
      </div>
    </form>
  );
}

function MembersSection({
  community,
  myRole,
  status,
}: {
  community: Community;
  myRole: CommunityRole;
  status: MemberStatus;
}) {
  const showSnackbar = useSnackbar();
  const list = useResource(
    () => fetchCommunityMembers(community.id, status),
    [community.id, status],
  );
  const [query, setQuery] = useState("");
  const [toRemove, setToRemove] = useState<Person | null>(null);
  const people = (list.data ?? []).filter((m) =>
    m.person.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const run = async (fn: () => Promise<unknown>, success?: string) => {
    try {
      await fn();
      if (success) showSnackbar(success);
    } catch (e) {
      showSnackbar(explainError(e), "error");
    }
    list.reload();
  };

  const rolesFor = (role: CommunityRole): CommunityRole[] => {
    if (role === "owner") return [];
    if (myRole === "owner") return ["admin", "editor", "member"];
    if (myRole === "admin" && role !== "admin") return ["editor", "member"];
    return [];
  };
  const canRemove = (role: CommunityRole) =>
    role !== "owner" &&
    (myRole === "owner" || (myRole === "admin" && role !== "admin"));

  if (list.loading && !list.data) {
    return (
      <div className="list-state" role="status">
        <div className="chat-status__spinner" />
      </div>
    );
  }
  if (list.error) {
    return (
      <div className="list-state" role="alert">
        {list.error}
        <button className="btn" onClick={list.reload}>
          Повторить
        </button>
      </div>
    );
  }

  return (
    <>
      {status === "member" && (
        <div className="friends-search">
          <label className="search">
            <SearchIcon size={16} />
            <input
              type="search"
              placeholder="Поиск участников"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
      )}
      {people.map(({ person, role }) => {
        const roles = rolesFor(role);
        return (
          <div key={person.id} className="friend">
            <a href={`#user/${person.id}`}>
              <Avatar
                name={person.name}
                color={person.color}
                src={person.avatar}
                size={56}
              />
            </a>
            <div className="friend__info">
              <a href={`#user/${person.id}`} className="friend__name">
                {person.name}
              </a>
              {status === "member" && (
                <div className="friend__city">{ROLE_LABELS[role]}</div>
              )}
            </div>
            {status === "requested" ? (
              <span className="friend-actions">
                <button
                  className="btn"
                  onClick={() =>
                    run(
                      () =>
                        answerCommunityRequest(community.id, person.id, true),
                      `${person.firstName} теперь в группе`,
                    )
                  }
                >
                  Принять
                </button>
                <button
                  className="btn btn--neutral"
                  onClick={() =>
                    run(
                      () =>
                        answerCommunityRequest(community.id, person.id, false),
                      "Заявка отклонена",
                    )
                  }
                >
                  Отклонить
                </button>
              </span>
            ) : status === "invited" ? (
              <button
                className="btn btn--neutral"
                onClick={() =>
                  run(
                    () => removeFromCommunity(community.id, person.id),
                    "Приглашение отозвано",
                  )
                }
              >
                Отозвать
              </button>
            ) : (
              <span className="friend-actions">
                {roles.length > 0 && (
                  <select
                    className="field field--select manage-role"
                    value={role}
                    onChange={(e) =>
                      run(
                        () =>
                          setCommunityRole(
                            community.id,
                            person.id,
                            e.target.value as CommunityRole,
                          ),
                        "Роль изменена",
                      )
                    }
                  >
                    {[role, ...roles.filter((r) => r !== role)].map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                )}
                {canRemove(role) && (
                  <button
                    className="btn btn--neutral"
                    onClick={() => setToRemove(person)}
                  >
                    Удалить
                  </button>
                )}
              </span>
            )}
          </div>
        );
      })}
      {!people.length && (
        <div className="empty">
          {status === "requested"
            ? "Новых заявок нет"
            : status === "invited"
              ? "Нет отправленных приглашений"
              : "Никого не нашлось"}
        </div>
      )}
      {toRemove && (
        <ConfirmModal
          title="Удаление участника"
          text={`Удалить ${toRemove.name} из сообщества?`}
          onConfirm={() => {
            run(
              () => removeFromCommunity(community.id, toRemove.id),
              `${toRemove.firstName} удалён(а) из сообщества`,
            );
            setToRemove(null);
          }}
          onClose={() => setToRemove(null)}
        />
      )}
    </>
  );
}

export default function CommunityManage({
  id,
  section,
  onNavigate,
}: {
  id: number;
  section: string;
  onNavigate: Navigate;
}) {
  const { myId } = useProfile();
  const { roleIn, reload: reloadMine } = useCommunities();
  const showSnackbar = useSnackbar();
  const info = useResource(() => fetchCommunity(id, myId), [id, myId]);
  const [community, setCommunity] = useState<CommunityDetails | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const role = roleIn(id);
  const isManager = role === "owner" || role === "admin";

  useEffect(() => {
    if (info.data) setCommunity(info.data);
  }, [info.data]);

  if (info.loading && !community) {
    return (
      <div className="card list-state" role="status">
        <div className="chat-status__spinner" />
      </div>
    );
  }
  if (info.error || !community || !role || role === "member") {
    return (
      <div className="card list-state">
        {info.error || "Управлять сообществом могут только его руководители"}
        <a className="btn" href={`#club/${id}`}>
          К сообществу
        </a>
      </div>
    );
  }

  const SECTIONS = ([
    isManager && { id: "info", label: "Основное" },
    isManager && {
      id: "members",
      label: community.isPage ? "Подписчики" : "Участники",
    },
    isManager && !community.isPage && { id: "requests", label: "Заявки" },
    isManager && { id: "invites", label: "Приглашения" },
    { id: "messages", label: "Сообщения" },
    role === "owner" && { id: "delete", label: "Удаление сообщества" },
  ] as (ManageSection | false)[]).filter((s): s is ManageSection => !!s);
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const go = (s: string) => onNavigate(`club/${id}/manage/${s}`);

  return (
    <div className="columns">
      <div className="card edit">
        <div className="edit__title">
          <a className="link" href={`#club/${id}`}>
            {community.name}
          </a>{" "}
          · {current.label}
        </div>

        {current.id === "info" && (
          <InfoSection community={community} onSaved={(c) => setCommunity((prev) => (prev ? { ...prev, ...c } : prev))} />
        )}
        {current.id === "members" && (
          <MembersSection
            key="m"
            community={community}
            myRole={role}
            status="member"
          />
        )}
        {current.id === "requests" && (
          <MembersSection
            key="r"
            community={community}
            myRole={role}
            status="requested"
          />
        )}
        {current.id === "invites" && (
          <MembersSection
            key="i"
            community={community}
            myRole={role}
            status="invited"
          />
        )}
        {current.id === "messages" && <CommunityInbox community={community} />}
        {current.id === "delete" && (
          <div className="manage-delete">
            <p>
              Сообщество будет удалено навсегда вместе с записями, фотографиями,
              участниками и перепиской. Отменить это нельзя.
            </p>
            <button
              className="btn btn--danger"
              onClick={() => setConfirmDelete(true)}
            >
              Удалить сообщество
            </button>
          </div>
        )}
      </div>

      <aside className="columns__side">
        <SideMenu
          items={[
            ...SECTIONS.map((s) => ({
              label: s.label,
              active: s.id === current.id,
              onClick: () => go(s.id),
            })),
            "separator",
            {
              label: "Перейти к сообществу",
              onClick: () => onNavigate(`club/${id}`),
            },
          ]}
        />
      </aside>

      {confirmDelete && (
        <ConfirmModal
          title="Удаление сообщества"
          text={`Удалить «${community.name}» навсегда?`}
          onConfirm={async () => {
            setConfirmDelete(false);
            try {
              await deleteCommunity(community.id);
              await reloadMine();
              showSnackbar("Сообщество удалено");
              onNavigate("communities");
            } catch (e) {
              showSnackbar(explainError(e), "error");
            }
          }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
