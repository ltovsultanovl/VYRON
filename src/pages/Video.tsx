import { useState } from "react";
import SideMenu from "../components/SideMenu";
import { Failed, Loading, SearchField } from "../components/ListStates";
import VideoGrid from "../components/video/VideoGrid";
import VideoViewer from "../components/video/VideoViewer";
import UploadVideoModal from "../components/video/UploadVideoModal";
import { UploadIcon, VideoIcon } from "../components/Icons";
import { useVideos } from "../context/VideoContext";
import { useProfile } from "../context/ProfileContext";
import { useFileDrop, useDebounced } from "../hooks";
import { useResource, useUserProfile } from "../resources";
import { fetchUserVideos, searchVideos } from "../api";
import { fullName } from "../profile";
import type { ReactNode } from "react";
import type { Navigate, Video as VideoType } from "../types";

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="media__empty">
      <VideoIcon size={32} />
      {children}
    </div>
  );
}

const matches = (v: VideoType, q: string) => `${v.title} ${v.description}`.toLowerCase().includes(q.toLowerCase());

function MyVideos({ onOpen, onUpload }: { onOpen: (video: VideoType) => void; onUpload: () => void }) {
  const library = useVideos();
  const [query, setQuery] = useState("");
  const q = query.trim();
  if (library.status === "loading") return <Loading />;
  if (library.status === "error") return <Failed error={library.error} onRetry={library.reload} />;
  const list = q ? library.videos.filter((v) => matches(v, q)) : library.videos;
  return (
    <>
      {library.videos.length > 0 && <SearchField value={query} onChange={setQuery} placeholder="Поиск по моим видео" />}
      <VideoGrid
        videos={list}
        onOpen={onOpen}
        empty={
          <Empty>
            {q ? (
              `Среди ваших видео нет «${q}»`
            ) : (
              <>
                Здесь пока пусто. Загрузите своё видео или найдите интересное в{" "}
                <a className="link" href="#video/search">
                  поиске
                </a>
                <button className="btn" onClick={onUpload}>
                  Загрузить видео
                </button>
              </>
            )}
          </Empty>
        }
      />
    </>
  );
}

function SearchVideo({
  initialQuery,
  onOpen,
  version,
}: {
  initialQuery: string;
  onOpen: (video: VideoType) => void;
  version: number;
}) {
  const { myId } = useProfile();
  const [query, setQuery] = useState(initialQuery ?? "");
  const q = useDebounced(query.trim(), 300);
  const results = useResource(() => searchVideos(q, myId), [q, myId, version]);
  const list = results.data ?? [];
  return (
    <>
      <SearchField value={query} onChange={setQuery} placeholder="Название или описание" autoFocus />
      <div className="friends-group">
        {q ? "Результаты поиска" : "Новые видео"} {results.data && <span className="muted">{list.length}</span>}
      </div>
      {results.loading && !results.data ? (
        <Loading />
      ) : results.error ? (
        <Failed error={results.error} onRetry={results.reload} />
      ) : (
        <VideoGrid videos={list} onOpen={onOpen} empty={<Empty>{q ? `По запросу «${q}» ничего не нашлось` : "Видео пока нет — загрузите первое!"}</Empty>} />
      )}
    </>
  );
}

function UserVideos({
  userId,
  onOpen,
  version,
}: {
  userId: string;
  onOpen: (video: VideoType) => void;
  version: number;
}) {
  const { myId } = useProfile();
  const person = useUserProfile(userId);
  const videos = useResource(() => fetchUserVideos(userId, myId), [userId, myId, version]);
  if ((person.loading && !person.data) || (videos.loading && !videos.data)) return <Loading />;
  if (person.error || videos.error) return <Failed error={person.error || videos.error} onRetry={videos.reload} />;
  if (!person.data) return <div className="list-state">Такой страницы нет</div>;
  const list = videos.data ?? [];
  return (
    <>
      <div className="friends-group">
        Видео ·{" "}
        <a className="link" href={`#user/${userId}`}>
          {fullName(person.data)}
        </a>{" "}
        <span className="muted">{list.length}</span>
      </div>
      <VideoGrid videos={list} onOpen={onOpen} empty={<Empty>{person.data.firstName} пока не добавил(а) видео</Empty>} />
    </>
  );
}

export default function Video({
  section,
  param,
  query,
  onNavigate,
}: {
  section: string;
  param: string;
  query: string;
  onNavigate: Navigate;
}) {
  const { myId } = useProfile();
  const library = useVideos();
  const [upload, setUpload] = useState<{ file: File | null } | null>(null);
  const [opened, setOpened] = useState<VideoType | null>(null);
  const [version, setVersion] = useState(0);
  const [dragOver, dropProps] = useFileDrop(([file]) => file && setUpload({ file }));
  const directId = /^\d+$/.test(section) ? Number(section) : null;
  const userId = section === "user" && param !== myId ? param : null;
  const current = userId ? "user" : section === "search" ? "search" : "all";
  const base = current === "search" ? "video/search" : current === "user" ? `video/user/${userId}` : "video";
  const viewingId = opened?.id ?? directId;

  const open = (video: VideoType) => setOpened(video);
  const close = () => {
    setOpened(null);
    if (current !== "all") setVersion((v) => v + 1);
    if (directId) onNavigate(base);
  };

  const TABS: { id: string; path: string; label: string; counter?: number }[] = [
    { id: "all", path: "video", label: "Мои видео", counter: library.videos.length },
    { id: "search", path: "video/search", label: "Поиск видео" },
  ];

  return (
    <div className="columns">
      <section className={`card video-page ${dragOver ? "media--drag" : ""}`} {...dropProps}>
        <div className="wall-head communities-head">
          <div className="wall-tabs">
            {TABS.map((t) => (
              <button key={t.id} className={`seg ${current === t.id ? "active" : ""}`} onClick={() => onNavigate(t.path)}>
                {t.label} {!!t.counter && <span className="muted">{t.counter}</span>}
              </button>
            ))}
          </div>
          <button className="btn communities-head__create" onClick={() => setUpload({ file: null })}>
            <UploadIcon size={18} /> Загрузить видео
          </button>
        </div>

        {userId ? (
          <UserVideos key={userId} userId={userId} onOpen={open} version={version} />
        ) : current === "search" ? (
          <SearchVideo key={query} initialQuery={query} onOpen={open} version={version} />
        ) : (
          <MyVideos onOpen={open} onUpload={() => setUpload({ file: null })} />
        )}
        {dragOver && <div className="photos-page__drop">Отпустите, чтобы загрузить видео</div>}
      </section>

      <aside className="columns__side">
        <SideMenu items={TABS.map((t) => ({ label: t.label, active: current === t.id, onClick: () => onNavigate(t.path) }))} />
      </aside>

      {viewingId && (
        <VideoViewer
          key={viewingId}
          id={viewingId}
          video={opened}
          onClose={close}
          onDeleted={() => setVersion((v) => v + 1)}
        />
      )}
      {upload && (
        <UploadVideoModal initialFile={upload.file} onClose={() => setUpload(null)} onUploaded={() => current === "search" && setVersion((x) => x + 1)} />
      )}
    </div>
  );
}
