import { useMemo, useState } from "react";
import SideMenu from "../components/SideMenu";
import { Failed, Loading, SearchField } from "../components/ListStates";
import ConfirmModal from "../components/ConfirmModal";
import ShareModal from "../components/ShareModal";
import PlayerBar from "../components/music/PlayerBar";
import TrackList from "../components/music/TrackList";
import PlaylistModal from "../components/music/PlaylistModal";
import UploadMusicModal from "../components/music/UploadMusicModal";
import { coverGradient, formatTotal } from "../components/music/format";
import {
  MusicIcon,
  PlayIcon,
  PlaylistIcon,
  PlusIcon,
  ShuffleIcon,
  UploadIcon,
} from "../components/Icons";
import { usePlayer } from "../context/PlayerContext";
import { useMusic } from "../context/MusicContext";
import { useProfile } from "../context/ProfileContext";
import { useFileDrop, useDebounced } from "../hooks";
import { useResource, useUserProfile } from "../resources";
import {
  fetchPlaylist,
  fetchPlaylists,
  fetchUserMusic,
  searchAudios,
} from "../api";
import { fullName } from "../profile";
import { plural } from "../utils";
import type { ReactNode } from "react";
import type { Navigate, Playlist, Track } from "../types";

const tracksWord = (n: number) =>
  plural(n, ["аудиозапись", "аудиозаписи", "аудиозаписей"]);

function ListActions({ tracks }: { tracks: Track[] }) {
  const player = usePlayer();
  if (!tracks.length) return null;
  return (
    <div className="music-actions">
      <button className="btn" onClick={() => player.play(tracks, 0)}>
        <PlayIcon size={18} /> Слушать
      </button>
      <button
        className="btn btn--neutral"
        onClick={() => player.playShuffled(tracks)}
      >
        <ShuffleIcon size={18} /> Перемешать
      </button>
    </div>
  );
}

const matches = (t: Track, q: string) =>
  `${t.artist} ${t.title}`.toLowerCase().includes(q.toLowerCase());

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="media__empty">
      <MusicIcon size={32} />
      {children}
    </div>
  );
}

function MyMusic({ onUpload }: { onUpload: () => void }) {
  const music = useMusic();
  const [query, setQuery] = useState("");
  const q = query.trim();
  const list = q ? music.tracks.filter((t) => matches(t, q)) : music.tracks;

  if (music.status === "loading") return <Loading />;
  if (music.status === "error")
    return <Failed error={music.error} onRetry={music.reload} />;

  return (
    <>
      {music.tracks.length > 0 && (
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Поиск по моей музыке"
        />
      )}
      {!q && <ListActions tracks={music.tracks} />}
      <TrackList
        tracks={list}
        empty={
          <Empty>
            {q ? (
              `В вашей музыке нет «${q}»`
            ) : (
              <>
                Здесь пока пусто. Загрузите свои треки или найдите музыку в{" "}
                <a className="link" href="#music/search">
                  поиске
                </a>
                <button className="btn" onClick={onUpload}>
                  Загрузить музыку
                </button>
              </>
            )}
          </Empty>
        }
      />
    </>
  );
}

function SearchMusic({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const q = useDebounced(query.trim(), 300);
  const results = useResource(() => searchAudios(q), [q]);
  const list = results.data ?? [];

  return (
    <>
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Исполнитель или название"
        autoFocus
      />
      <div className="friends-group">
        {q ? "Результаты поиска" : "Новые аудиозаписи"}{" "}
        {results.data && <span className="muted">{list.length}</span>}
      </div>
      {results.loading && !results.data ? (
        <Loading />
      ) : results.error ? (
        <Failed error={results.error} onRetry={results.reload} />
      ) : (
        <TrackList
          tracks={list}
          empty={
            <Empty>
              {q
                ? `По запросу «${q}» ничего не нашлось`
                : "Музыки пока нет — загрузите первую!"}
            </Empty>
          }
        />
      )}
    </>
  );
}

function PlaylistGrid({ playlists, empty = null }: { playlists: Playlist[]; empty?: ReactNode }) {
  if (!playlists.length) return empty;
  return (
    <div className="playlist-grid">
      {playlists.map((p) => (
        <a
          key={p.id}
          className="playlist-card"
          href={`#music/playlist/${p.id}`}
        >
          <span
            className="playlist-card__cover"
            style={{ background: coverGradient(p.title) }}
          >
            <PlaylistIcon size={40} />
          </span>
          <span className="playlist-card__title">{p.title}</span>
          <span className="playlist-card__meta">
            {p.tracks.length} {tracksWord(p.tracks.length)}
          </span>
        </a>
      ))}
    </div>
  );
}

function MyPlaylists() {
  const music = useMusic();
  const [creating, setCreating] = useState(false);
  if (music.playlistsStatus === "loading") return <Loading />;
  if (music.playlistsStatus === "error")
    return (
      <Failed error={music.playlistsError} onRetry={music.reloadPlaylists} />
    );
  return (
    <>
      <div className="music-actions">
        <button className="btn btn--neutral" onClick={() => setCreating(true)}>
          <PlusIcon size={18} /> Создать плейлист
        </button>
      </div>
      <PlaylistGrid
        playlists={music.playlists}
        empty={
          <Empty>Плейлистов пока нет — соберите первый из любимых треков</Empty>
        }
      />
      {creating && (
        <PlaylistModal
          onClose={() => setCreating(false)}
          onSave={async (data) => {
            const p = await music.createPlaylist(data);
            if (p) setCreating(false);
            return !!p;
          }}
        />
      )}
    </>
  );
}

function PlaylistPage({ id, onNavigate }: { id: number; onNavigate: Navigate }) {
  const { myId } = useProfile();
  const music = useMusic();
  const player = usePlayer();
  const own = music.playlists.find((p) => p.id === id);
  const remote = useResource(
    (): Promise<Playlist | null> => (own ? Promise.resolve(null) : fetchPlaylist(id)),
    [id, !!own],
  );
  const playlist = own ?? remote.data;
  const [modal, setModal] = useState<"edit" | "delete" | "share" | null>(null);

  if (!own && remote.loading && !remote.data) return <Loading />;
  if (!own && remote.error)
    return <Failed error={remote.error} onRetry={remote.reload} />;
  if (!playlist) {
    return (
      <div className="list-state">
        Плейлист не найден — возможно, его удалили.
        <a className="btn" href="#music/playlists">
          К плейлистам
        </a>
      </div>
    );
  }
  const mine = playlist.ownerId === myId;
  const total = playlist.tracks.reduce((s, t) => s + t.duration, 0);

  return (
    <>
      <div className="playlist-head">
        <span
          className="playlist-head__cover"
          style={{ background: coverGradient(playlist.title) }}
        >
          <PlaylistIcon size={56} />
        </span>
        <div className="playlist-head__info">
          <div className="playlist-head__kind">Плейлист</div>
          <h2 className="playlist-head__title">{playlist.title}</h2>
          {!mine && playlist.owner && (
            <a className="link" href={`#music/user/${playlist.owner.id}`}>
              {playlist.owner.name}
            </a>
          )}
          {playlist.description && (
            <p className="playlist-head__desc">{playlist.description}</p>
          )}
          <div className="playlist-head__meta">
            {playlist.tracks.length} {tracksWord(playlist.tracks.length)}
            {total > 0 && ` · ${formatTotal(total)}`}
          </div>
          <div className="music-actions music-actions--inline">
            <button
              className="btn"
              disabled={!playlist.tracks.length}
              onClick={() => player.play(playlist.tracks, 0)}
            >
              <PlayIcon size={18} /> Слушать
            </button>
            <button
              className="btn btn--neutral"
              disabled={!playlist.tracks.length}
              onClick={() => player.playShuffled(playlist.tracks)}
            >
              <ShuffleIcon size={18} /> Перемешать
            </button>
            <button
              className="btn btn--neutral"
              onClick={() => setModal("share")}
            >
              Поделиться
            </button>
            {mine && (
              <button
                className="btn btn--neutral"
                onClick={() => setModal("edit")}
              >
                Редактировать
              </button>
            )}
          </div>
        </div>
      </div>
      <TrackList
        tracks={playlist.tracks}
        playlist={playlist}
        numbered
        empty={
          <Empty>
            {mine
              ? "Плейлист пуст. Добавляйте треки через «⋯ → Добавить в плейлист»"
              : "Плейлист пуст"}
          </Empty>
        }
      />

      {modal === "share" && (
        <ShareModal
          shared={{ type: "playlist", id: playlist.id }}
          link={`#music/playlist/${playlist.id}`}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "edit" && (
        <PlaylistModal
          playlist={playlist}
          onClose={() => setModal(null)}
          onDelete={() => setModal("delete")}
          onSave={async (data) => {
            const ok = await music.savePlaylist({ ...playlist, ...data });
            if (ok) setModal(null);
            return ok;
          }}
        />
      )}
      {modal === "delete" && (
        <ConfirmModal
          title="Удаление плейлиста"
          text={`Удалить плейлист «${playlist.title}»? Сами аудиозаписи останутся.`}
          onConfirm={async () => {
            setModal(null);
            if (await music.deletePlaylist(playlist))
              onNavigate("music/playlists");
          }}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

function UserMusic({ userId }: { userId: string }) {
  const person = useUserProfile(userId);
  const tracks = useResource(() => fetchUserMusic(userId), [userId]);
  const playlists = useResource(() => fetchPlaylists(userId), [userId]);
  const list = tracks.data ?? [];

  if ((person.loading && !person.data) || (tracks.loading && !tracks.data))
    return <Loading />;
  if (person.error || tracks.error)
    return (
      <Failed error={person.error || tracks.error} onRetry={tracks.reload} />
    );
  if (!person.data) return <div className="list-state">Такой страницы нет</div>;
  const name = fullName(person.data);

  return (
    <>
      <div className="friends-group">
        Музыка ·{" "}
        <a className="link" href={`#user/${userId}`}>
          {name}
        </a>{" "}
        <span className="muted">{list.length}</span>
      </div>
      {(playlists.data ?? []).length > 0 && (
        <>
          <div className="friends-group">Плейлисты</div>
          <PlaylistGrid playlists={playlists.data ?? []} />
        </>
      )}
      <ListActions tracks={list} />
      <TrackList
        tracks={list}
        empty={<Empty>{person.data.firstName} пока не добавил(а) музыку</Empty>}
      />
    </>
  );
}

export default function Music({
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
  const music = useMusic();
  const [upload, setUpload] = useState<{ files: File[] } | null>(null);
  const [dragOver, dropProps] = useFileDrop((files) => setUpload({ files }));
  const userId = section === "user" && param !== myId ? param : null;
  const current = userId
    ? "user"
    : section === "playlist"
      ? "playlists"
      : ["playlists", "search"].includes(section)
        ? section
        : "all";

  const TABS = useMemo(
    (): { id: string; path: string; label: string; counter?: number }[] => [
      {
        id: "all",
        path: "music",
        label: "Моя музыка",
        counter: music.tracks.length,
      },
      {
        id: "playlists",
        path: "music/playlists",
        label: "Плейлисты",
        counter: music.playlists.length,
      },
      { id: "search", path: "music/search", label: "Поиск музыки" },
    ],
    [music.tracks.length, music.playlists.length],
  );

  return (
    <div className="columns">
      <div className="music-page" {...dropProps}>
        <section className="card music-player-card">
          <PlayerBar />
        </section>

        <section className={`card music-card ${dragOver ? "media--drag" : ""}`}>
          <div className="wall-head communities-head">
            <div className="wall-tabs">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  className={`seg ${current === t.id ? "active" : ""}`}
                  onClick={() => onNavigate(t.path)}
                >
                  {t.label}{" "}
                  {!!t.counter && <span className="muted">{t.counter}</span>}
                </button>
              ))}
            </div>
            <button
              className="btn communities-head__create"
              onClick={() => setUpload({ files: [] })}
            >
              <UploadIcon size={18} /> Загрузить
            </button>
          </div>

          {userId ? (
            <UserMusic key={userId} userId={userId} />
          ) : section === "playlist" ? (
            <PlaylistPage
              key={param}
              id={Number(param)}
              onNavigate={onNavigate}
            />
          ) : current === "playlists" ? (
            <MyPlaylists />
          ) : current === "search" ? (
            <SearchMusic key={query} initialQuery={query} />
          ) : (
            <MyMusic onUpload={() => setUpload({ files: [] })} />
          )}
        </section>
        {dragOver && (
          <div className="photos-page__drop">
            Отпустите, чтобы загрузить музыку
          </div>
        )}
      </div>

      <aside className="columns__side">
        <SideMenu
          items={TABS.map((t) => ({
            label: t.label,
            active: current === t.id,
            onClick: () => onNavigate(t.path),
          }))}
        />
      </aside>

      {upload && (
        <UploadMusicModal
          initialFiles={upload.files}
          onClose={() => setUpload(null)}
        />
      )}
    </div>
  );
}
