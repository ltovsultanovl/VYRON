import { useCallback, useMemo, useState } from "react";
import Avatar from "../components/Avatar";
import Composer from "../components/Composer";
import PostList from "../components/PostList";
import Modal from "../components/Modal";
import PhotoViewer from "../components/PhotoViewer";
import ConfirmModal from "../components/ConfirmModal";
import ShareModal from "../components/ShareModal";
import InviteFriendsModal from "../components/InviteFriendsModal";
import CommunityJoinButton from "../components/CommunityJoinButton";
import { PhotoTile } from "./Profile";
import { communityKindLabel } from "./Communities";
import { useSnackbar } from "../components/Snackbar";
import {
  InfoIcon,
  LinkIcon,
  MapPinIcon,
  MessageIcon,
  MoreIcon,
  PhotoIcon,
  SettingsIcon,
  type Icon,
} from "../components/Icons";
import { useProfile } from "../context/ProfileContext";
import { useCommunities } from "../context/CommunitiesContext";
import { useChatActions } from "../context/ChatContext";
import { useDropdown, useFilePicker } from "../hooks";
import { useBookmarks } from "../context/BookmarksContext";
import { usePhotos, usePosts, useResource } from "../resources";
import { bg } from "../data";
import { fetchCommunity, fetchCommunityMembers } from "../api";
import { formatDate, plural } from "../utils";
import { isLeader, leaderLabel } from "../components/communityRoles";
import type { ReactNode } from "react";
import type { Resource } from "../resources";
import type { Community as CommunityType, CommunityDetails, CommunityMember, CommunityRole, Navigate, Photo, Post } from "../types";

const PHOTOS_PREVIEW = 6;

const membersWord = (c: Pick<CommunityType, "isPage">, n: number) =>
  plural(
    n,
    c.isPage
      ? ["подписчик", "подписчика", "подписчиков"]
      : ["участник", "участника", "участников"],
  );

const siteHref = (site: string) =>
  /^https?:\/\//.test(site) ? site : `https://${site}`;

type InfoRow = { icon: Icon; value: ReactNode };

function InfoCard({ community }: { community: CommunityType }) {
  const rows = ([
    community.description && {
      icon: InfoIcon,
      value: (
        <span className="community-info__text">{community.description}</span>
      ),
    },
    community.website && {
      icon: LinkIcon,
      value: (
        <a
          className="link"
          href={siteHref(community.website)}
          target="_blank"
          rel="noreferrer"
        >
          {community.website}
        </a>
      ),
    },
    community.city && { icon: MapPinIcon, value: community.city },
  ] as (InfoRow | "" | false)[]).filter((row): row is InfoRow => !!row);

  return (
    <section className="card community-info">
      <div className="card__header">Информация</div>
      {rows.length ? (
        rows.map(({ icon: Icon, value }, i) => (
          <div key={i} className="community-info__row">
            <Icon size={20} />
            {value}
          </div>
        ))
      ) : (
        <div className="community-info__row community-info__row--muted">
          Описания пока нет
        </div>
      )}
      <div className="community-info__row community-info__row--muted">
        Создано {formatDate(community.createdAt)}
      </div>
    </section>
  );
}

function CommunityPhotos({
  community,
  canPublish,
  canManage,
}: {
  community: CommunityType;
  canPublish: boolean;
  canManage: boolean;
}) {
  const showSnackbar = useSnackbar();
  const album = usePhotos(null, { communityId: community.id });
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [allOpen, setAllOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Photo | null>(null);
  const [uploading, setUploading] = useState(false);
  const owner = {
    id: `club-${community.id}`,
    name: community.name,
    firstName: community.name,
    color: community.color,
    avatar: community.avatar,
  };

  const upload = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length)
      return showSnackbar(
        "Выберите изображение в формате JPG, PNG или GIF",
        "error",
      );
    setUploading(true);
    const { added, failed, error } = await album.upload(images);
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

  if (!canPublish && album.data && !album.photos.length) return null;

  const tiles = (list: Photo[], onOpen: (index: number) => void) =>
    list.map((p, i) => (
      <PhotoTile
        key={p.id}
        photo={p}
        onOpen={() => onOpen(i)}
        onDelete={canManage ? () => setToDelete(p) : undefined}
      />
    ));

  return (
    <section className="card media">
      <div className="card__header">
        Фотографии <span className="muted">{album.photos.length || ""}</span>
        {canPublish && (
          <button
            className="card__header-action btn btn--tertiary"
            onClick={picker.open}
            disabled={uploading}
          >
            {uploading ? "Загрузка…" : "Добавить фото"}
          </button>
        )}
      </div>
      {album.loading && !album.data ? (
        <div className="media__empty" role="status">
          <div className="chat-status__spinner" />
        </div>
      ) : album.photos.length ? (
        <>
          <div className="media__photos">
            {tiles(album.photos.slice(0, PHOTOS_PREVIEW), setViewerIndex)}
          </div>
          {album.photos.length > PHOTOS_PREVIEW && (
            <div className="media__actions media__actions--single">
              <button
                className="btn btn--neutral"
                onClick={() => setAllOpen(true)}
              >
                Показать все {album.photos.length}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="media__empty">
          <PhotoIcon size={32} />В альбоме сообщества пока нет фотографий
        </div>
      )}
      {picker.input}

      {viewerIndex !== null && album.photos[viewerIndex] && (
        <PhotoViewer
          photos={album.photos}
          index={viewerIndex}
          owner={owner}
          ownerHref={`#club/${community.id}`}
          canManage={canManage}
          allowMakeAvatar={false}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
          onDelete={album.remove}
          onToggleLike={album.toggleLike}
          onComment={album.comment}
          onDeleteComment={album.deleteComment}
        />
      )}
      {allOpen && (
        <Modal
          title={`Фотографии · ${community.name}`}
          onClose={() => setAllOpen(false)}
          width={760}
        >
          <div className="photos-all">
            {tiles(album.photos, (i) => {
              setAllOpen(false);
              setViewerIndex(i);
            })}
          </div>
        </Modal>
      )}
      {toDelete && (
        <ConfirmModal
          title="Удаление фотографии"
          text="Удалить фотографию из альбома сообщества?"
          onConfirm={() => {
            album.remove(toDelete);
            setToDelete(null);
          }}
          onClose={() => setToDelete(null)}
        />
      )}
    </section>
  );
}

function CommunityWall({
  community,
  role,
  canPublish,
}: {
  community: CommunityType;
  role: CommunityRole | null;
  canPublish: boolean;
}) {
  const { myId } = useProfile();
  const [tab, setTab] = useState("posts");
  const [asCommunity, setAsCommunity] = useState(true);
  const published = usePosts({ community: community.id });
  const suggested = usePosts({ community: community.id, suggested: true });
  const approveSuggested = suggested.approve;
  const reloadPublished = published.reload;
  const approve = useCallback(
    async (post: Post) => {
      const ok = await approveSuggested(post);
      if (ok) reloadPublished();
      return ok;
    },
    [approveSuggested, reloadPublished],
  );
  const feed = tab === "posts" ? published : { ...suggested, approve };

  const isMember = !!role;
  const openWall = !community.isPage && community.wall === "open";
  const mode = canPublish
    ? asCommunity || !openWall
      ? "community"
      : "self"
    : openWall
      ? "self"
      : "suggest";

  const publish = (data: { text: string; imageDataUrl: string | null }) =>
    (mode === "suggest" ? suggested : published).publish({
      communityId: community.id,
      asCommunity: mode === "community",
      suggested: mode === "suggest",
      ...data,
    });

  const mySuggestions = suggested.posts.filter(
    (p) => p.author.id === myId,
  ).length;
  const suggestedCount = canPublish ? suggested.posts.length : mySuggestions;

  return (
    <>
      {isMember && (
        <div className="community-composer">
          {canPublish && openWall && (
            <label className="checkbox community-composer__as">
              <input
                type="checkbox"
                checked={asCommunity}
                onChange={(e) => setAsCommunity(e.target.checked)}
              />
              <span className="checkbox__box" aria-hidden="true" />
              От имени сообщества
            </label>
          )}
          <Composer
            placeholder={
              mode === "suggest"
                ? "Предложите новость — её опубликуют руководители"
                : mode === "community"
                  ? `Запись от имени «${community.name}»`
                  : "Напишите что-нибудь…"
            }
            onPublish={publish}
          />
        </div>
      )}

      <div className="card wall-head">
        <div className="wall-tabs">
          <button
            className={`seg ${tab === "posts" ? "active" : ""}`}
            onClick={() => setTab("posts")}
          >
            Записи сообщества
          </button>
          {isMember && (
            <button
              className={`seg ${tab === "suggested" ? "active" : ""}`}
              onClick={() => setTab("suggested")}
            >
              {canPublish ? "Предложенные" : "Мои предложенные"}{" "}
              {suggestedCount > 0 && (
                <span className="muted">{suggestedCount}</span>
              )}
            </button>
          )}
        </div>
      </div>

      <PostList
        feed={
          tab === "suggested" && !canPublish
            ? { ...feed, posts: feed.posts.filter((p) => p.author.id === myId) }
            : feed
        }
        emptyText={
          tab === "posts"
            ? "В сообществе пока нет записей"
            : canPublish
              ? "Предложенных новостей нет"
              : "Вы ещё ничего не предлагали"
        }
      />
    </>
  );
}

function MembersCard({ community, members }: { community: CommunityDetails; members: Resource<CommunityMember[]> }) {
  const [allOpen, setAllOpen] = useState(false);
  const list = members.data ?? [];
  const title = community.isPage ? "Подписчики" : "Участники";

  return (
    <section className="card">
      <button
        className="card__header card__header--button"
        onClick={() => setAllOpen(true)}
        disabled={!list.length}
      >
        {title}{" "}
        <span className="muted">{community.membersCount ?? list.length}</span>
      </button>
      {members.loading && !members.data ? (
        <div className="media__empty" role="status">
          <div className="chat-status__spinner" />
        </div>
      ) : (
        <div className="friends-mini friends-mini--wide">
          {list.slice(0, 8).map(({ person }) => (
            <a key={person.id} href={`#user/${person.id}`}>
              <Avatar
                name={person.name}
                color={person.color}
                src={person.avatar}
                size={56}
              />
              <span>{person.firstName}</span>
            </a>
          ))}
        </div>
      )}
      {allOpen && (
        <Modal
          title={`${title} · ${list.length}`}
          onClose={() => setAllOpen(false)}
          width={460}
        >
          <div className="share__list">
            {list.map(({ person, role }) => (
              <a
                key={person.id}
                href={`#user/${person.id}`}
                className="share__person"
                onClick={() => setAllOpen(false)}
              >
                <Avatar
                  name={person.name}
                  color={person.color}
                  src={person.avatar}
                  size={40}
                />
                <span className="share__name">{person.name}</span>
                {isLeader(role) && (
                  <span className="muted">{leaderLabel(role)}</span>
                )}
              </a>
            ))}
          </div>
        </Modal>
      )}
    </section>
  );
}

function ContactsCard({ members }: { members: Resource<CommunityMember[]> }) {
  const leaders = (members.data ?? []).filter((m) => isLeader(m.role));
  if (!leaders.length) return null;
  return (
    <section className="card">
      <div className="card__header">Контакты</div>
      <div className="subs-list">
        {leaders.map(({ person, role }) => (
          <a key={person.id} href={`#user/${person.id}`} className="subs-item">
            <Avatar
              name={person.name}
              color={person.color}
              src={person.avatar}
              size={40}
            />
            <div>
              <div className="subs-item__name">{person.name}</div>
              <div className="subs-item__desc">{leaderLabel(role)}</div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

export default function Community({ id, onNavigate }: { id: number; onNavigate: Navigate }) {
  const { myId } = useProfile();
  const {
    roleIn,
    statusIn,
    canPublishIn,
    canManage: canManageIn,
  } = useCommunities();
  const { openCommunityChat } = useChatActions();
  const showSnackbar = useSnackbar();
  const menu = useDropdown();
  const { isSaved, toggle: toggleBookmark } = useBookmarks();
  const [modal, setModal] = useState<"share" | "invite" | null>(null);
  const status = statusIn(id);
  const info = useResource(
    () => fetchCommunity(id, myId),
    [id, myId, status, roleIn(id)],
  );
  const community = info.data;
  const role = roleIn(id);
  const canView = community && (community.access === "open" || !!role);
  const members = useResource(
    () => (canView ? fetchCommunityMembers(community.id) : Promise.resolve([])),
    [id, canView, status],
  );
  const memberIds = useMemo(
    () => new Set((members.data ?? []).map((m) => m.person.id)),
    [members.data],
  );

  if (info.loading && !info.data) {
    return (
      <div className="card list-state" role="status">
        <div className="chat-status__spinner" />
        Загружаем сообщество…
      </div>
    );
  }
  if (info.error) {
    return (
      <div className="card list-state" role="alert">
        Не удалось загрузить сообщество: {info.error}
        <button className="btn" onClick={info.reload}>
          Повторить
        </button>
      </div>
    );
  }
  if (!community) {
    return (
      <div className="card list-state">
        Сообщество не найдено — возможно, его удалили или оно частное.
        <a className="btn" href="#communities">
          К сообществам
        </a>
      </div>
    );
  }

  const canPublish = canPublishIn(id);
  const canManage = canManageIn(id);
  const coverStyle = {
    background: community.cover
      ? bg(community.cover, "var(--cover-empty)")
      : "var(--cover-empty)",
  };

  return (
    <>
      <div className="card profile-head community-head">
        <div className="profile-cover" style={coverStyle} />
        <div className="profile-info">
          <div className="profile-info__avatar">
            <Avatar
              name={community.name}
              color={community.color}
              src={community.avatar}
              size={148}
              empty={false}
            />
          </div>
          <div className="profile-info__meta">
            <h1 className="profile-info__name">{community.name}</h1>
            {community.status && (
              <div className="profile-info__status">{community.status}</div>
            )}
            <div className="profile-info__details">
              <span className="profile-info__chip">
                {communityKindLabel(community)}
              </span>
              {community.membersCount != null && (
                <span className="profile-info__chip">
                  {community.membersCount}{" "}
                  {membersWord(community, community.membersCount)}
                </span>
              )}
            </div>
          </div>
          <div className="profile-info__actions">
            <CommunityJoinButton community={community} />
            {community.messagesEnabled && !canPublish && (
              <button
                className="btn btn--neutral btn--icon"
                title="Написать сообщение"
                aria-label="Написать сообщение"
                onClick={() => {
                  openCommunityChat(community);
                  onNavigate("messages");
                }}
              >
                <MessageIcon size={18} />
              </button>
            )}
            {canPublish && (
              <button
                className="btn btn--neutral"
                onClick={() => onNavigate(`club/${community.id}/manage`)}
              >
                <SettingsIcon size={18} /> Управление
              </button>
            )}
            <div className="friend-menu" ref={menu.ref}>
              <button
                className="btn btn--neutral btn--icon"
                title="Ещё"
                onClick={menu.toggle}
              >
                <MoreIcon size={18} />
              </button>
              {menu.open && (
                <div className="dropdown dropdown--right">
                  <button
                    className="dropdown__item"
                    onClick={() => {
                      menu.close();
                      setModal("share");
                    }}
                  >
                    Поделиться
                  </button>
                  {role && (
                    <button
                      className="dropdown__item"
                      onClick={() => {
                        menu.close();
                        setModal("invite");
                      }}
                    >
                      Пригласить друзей
                    </button>
                  )}
                  <button
                    className="dropdown__item"
                    onClick={async () => {
                      menu.close();
                      try {
                        await navigator.clipboard.writeText(
                          `${location.origin}${location.pathname}#club/${community.id}`,
                        );
                        showSnackbar("Ссылка скопирована");
                      } catch {
                        showSnackbar("Не удалось скопировать ссылку", "error");
                      }
                    }}
                  >
                    Скопировать ссылку
                  </button>
                  <button
                    className="dropdown__item"
                    onClick={() => {
                      menu.close();
                      toggleBookmark("community", community.id);
                    }}
                  >
                    {isSaved("community", community.id) ? "Удалить из закладок" : "Добавить в закладки"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {!canView ? (
        <div className="card list-state">
          <b>
            {community.access === "private"
              ? "Это частная группа"
              : "Это закрытая группа"}
          </b>
          {status === "requested"
            ? "Ваша заявка отправлена — когда её примут, здесь появятся записи и участники."
            : "Записи и участников видят только участники группы. Подайте заявку, чтобы вступить."}
        </div>
      ) : (
        <div className="columns columns--profile">
          <div>
            <InfoCard community={community} />
            <CommunityPhotos
              community={community}
              canPublish={canPublish}
              canManage={canManage}
            />
            <CommunityWall
              community={community}
              role={role}
              canPublish={canPublish}
            />
          </div>
          <aside className="columns__side">
            <MembersCard community={community} members={members} />
            <ContactsCard members={members} />
            {community.website && (
              <section className="card">
                <div className="card__header">Ссылки</div>
                <a
                  className="subs-item"
                  href={siteHref(community.website)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <LinkIcon size={20} />
                  <div className="subs-item__name">{community.website}</div>
                </a>
              </section>
            )}
          </aside>
        </div>
      )}

      {modal === "share" && (
        <ShareModal
          shared={{ type: "community", id: community.id }}
          link={`#club/${community.id}`}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "invite" && (
        <InviteFriendsModal
          community={community}
          knownIds={memberIds}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
