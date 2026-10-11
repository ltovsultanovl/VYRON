import { useEffect, useState, type ReactNode } from "react";
import Avatar from "../components/Avatar";
import SideMenu from "../components/SideMenu";
import PostList from "../components/PostList";
import PhotoGrid from "../components/photos/PhotoGrid";
import PhotoViewer from "../components/PhotoViewer";
import VideoGrid from "../components/video/VideoGrid";
import VideoViewer from "../components/video/VideoViewer";
import { Failed, Loading } from "../components/ListStates";
import { BookmarkIcon } from "../components/Icons";
import { useBookmarks } from "../context/BookmarksContext";
import { useProfile } from "../context/ProfileContext";
import { usePhotos, usePosts, useResource, type Resource } from "../resources";
import * as api from "../api";
import type { Navigate, Video } from "../types";

const TABS = [
  { id: "posts", label: "Записи" },
  { id: "photos", label: "Фотографии" },
  { id: "videos", label: "Видео" },
  { id: "people", label: "Люди" },
  { id: "communities", label: "Сообщества" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const EMPTY: Record<Tab, string> = {
  posts: "Сохраняйте записи через меню «⋯» у записи — они появятся здесь",
  photos: "Сохраняйте фотографии кнопкой «В закладки» при просмотре фото",
  videos: "Сохраняйте видео кнопкой «В закладки» под видео",
  people: "Добавляйте людей через меню «⋯» на их странице",
  communities: "Добавляйте сообщества через меню «⋯» на их странице",
};

function Empty({ tab }: { tab: Tab }) {
  return (
    <div className="empty bookmarks__empty">
      <BookmarkIcon size={48} />
      <div>Здесь пока пусто</div>
      <div className="muted">{EMPTY[tab]}</div>
    </div>
  );
}

// Список «загрузка / ошибка / пусто / данные» для простых вкладок
function State<T>({ res, tab, children }: { res: Resource<T[]>; tab: Tab; children: (items: T[]) => ReactNode }) {
  if (res.loading && !res.data) return <Loading />;
  if (res.error) return <Failed error={res.error} onRetry={res.reload} />;
  if (!res.data?.length) return <Empty tab={tab} />;
  return <>{children(res.data)}</>;
}

function SavedPosts({ version }: { version: number }) {
  const feed = usePosts({ bookmarked: true });
  const { reload } = feed;
  useEffect(() => {
    if (version) reload();
  }, [version, reload]);
  return <PostList feed={feed} emptyText={<Empty tab="posts" />} />;
}

function SavedPhotos({ version }: { version: number }) {
  const photos = usePhotos(null, { bookmarked: true });
  const [index, setIndex] = useState<number | null>(null);
  const ownerIds = [...new Set(photos.photos.map((p) => p.ownerId))].sort();
  const owners = useResource(() => api.fetchPeopleByIds(ownerIds), [ownerIds.join()]);
  const { reload } = photos;
  useEffect(() => {
    // Пока открыт просмотр, список не трогаем — иначе фото «уедет» из-под пальца
    if (version && index === null) reload();
  }, [version, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  if (photos.loading && !photos.data) return <Loading />;
  if (photos.error) return <Failed error={photos.error} onRetry={photos.reload} />;
  if (!photos.photos.length) return <Empty tab="photos" />;

  const current = index !== null ? photos.photos[index] : null;
  const owner = owners.data?.find((p) => p.id === current?.ownerId);
  return (
    <>
      <div className="bookmarks__grid">
        <PhotoGrid photos={photos.photos} onOpen={setIndex} />
      </div>
      {current && index !== null && (
        <PhotoViewer
          photos={photos.photos}
          index={index}
          owner={owner ?? { id: current.ownerId, name: "", color: "#888", avatar: null }}
          onIndexChange={setIndex}
          onClose={() => setIndex(null)}
          onDelete={photos.remove}
          onToggleLike={photos.toggleLike}
          onComment={photos.comment}
          onDeleteComment={photos.deleteComment}
          allowMakeAvatar={false}
        />
      )}
    </>
  );
}

function SavedVideos({ version }: { version: number }) {
  const { myId } = useProfile();
  const res = useResource(() => api.fetchBookmarkedVideos(myId), [myId, version]);
  const [opened, setOpened] = useState<Video | null>(null);
  return (
    <>
      <State res={res} tab="videos">
        {(videos) => (
          <div className="bookmarks__grid">
            <VideoGrid videos={videos} onOpen={setOpened} showOwner />
          </div>
        )}
      </State>
      {opened && <VideoViewer key={opened.id} id={opened.id} video={opened} onClose={() => setOpened(null)} />}
    </>
  );
}

function SavedPeople({ version }: { version: number }) {
  const { toggle } = useBookmarks();
  const res = useResource(() => api.fetchBookmarkedPeople(), [version]);
  return (
    <State res={res} tab="people">
      {(people) =>
        people.map((p) => (
          <div key={p.id} className="bookmarks__row">
            <a href={`#user/${p.id}`}>
              <Avatar name={p.name} color={p.color} src={p.avatar} size={56} />
            </a>
            <div className="bookmarks__info">
              <a href={`#user/${p.id}`} className="bookmarks__name">
                {p.name}
              </a>
              {p.city && <div className="muted">{p.city}</div>}
            </div>
            <button className="btn btn--secondary btn--sm" onClick={() => toggle("person", p.id)}>
              Убрать
            </button>
          </div>
        ))
      }
    </State>
  );
}

function SavedCommunities({ version }: { version: number }) {
  const { toggle } = useBookmarks();
  const res = useResource(() => api.fetchBookmarkedCommunities(), [version]);
  return (
    <State res={res} tab="communities">
      {(list) =>
        list.map((c) => (
          <div key={c.id} className="bookmarks__row">
            <a href={`#club/${c.id}`}>
              <Avatar name={c.name} color={c.color} src={c.avatar} size={56} empty={false} />
            </a>
            <div className="bookmarks__info">
              <a href={`#club/${c.id}`} className="bookmarks__name">
                {c.name}
              </a>
              <div className="muted">{c.isPage ? "Публичная страница" : "Группа"}</div>
            </div>
            <button className="btn btn--secondary btn--sm" onClick={() => toggle("community", c.id)}>
              Убрать
            </button>
          </div>
        ))
      }
    </State>
  );
}

// «Закладки» как в VK: сохранённые записи, фото, видео, люди и сообщества
export default function Bookmarks({ section, onNavigate }: { section: string; onNavigate: Navigate }) {
  const { version } = useBookmarks();
  const tab: Tab = TABS.some((t) => t.id === section) ? (section as Tab) : "posts";
  const go = (id: Tab) => onNavigate(id === "posts" ? "bookmarks" : `bookmarks/${id}`);
  const title = TABS.find((t) => t.id === tab)!.label;

  return (
    <div className="columns">
      <div>
        <div className="card bookmarks__head">
          <div className="wall-tabs">
            {TABS.map((t) => (
              <button key={t.id} className={`seg ${tab === t.id ? "active" : ""}`} onClick={() => go(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {tab === "posts" ? (
          <SavedPosts version={version} />
        ) : (
          <div className="card bookmarks" aria-label={title}>
            {tab === "photos" && <SavedPhotos version={version} />}
            {tab === "videos" && <SavedVideos version={version} />}
            {tab === "people" && <SavedPeople version={version} />}
            {tab === "communities" && <SavedCommunities version={version} />}
          </div>
        )}
      </div>
      <aside className="columns__side">
        <SideMenu items={TABS.map((t) => ({ label: t.label, active: tab === t.id, onClick: () => go(t.id) }))} />
      </aside>
    </div>
  );
}
