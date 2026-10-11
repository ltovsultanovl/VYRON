import Avatar from "./Avatar";
import { useProfile } from "../context/ProfileContext";
import { useResource } from "../resources";
import {
  fetchAudio,
  fetchCommunity,
  fetchPhoto,
  fetchPlaylist,
  fetchPost,
  fetchProfile,
  fetchVideo,
} from "../api";
import { formatDuration, viewsLabel } from "./video/format";
import { bg } from "../data";
import TrackList from "./music/TrackList";
import { coverGradient } from "./music/format";
import { PlayIcon, PlaylistIcon } from "./Icons";
import { fullName } from "../profile";
import { formatDate, plural } from "../utils";
import type {
  CommunityDetails,
  Playlist,
  Post,
  Profile,
  Shared,
  SharedPhoto,
  SharedType,
  Track,
  Video,
} from "../types";

type SharedData =
  | { type: "post"; value: Post | null }
  | { type: "photo"; value: SharedPhoto | null }
  | { type: "community"; value: CommunityDetails | null }
  | { type: "audio"; value: Track | null }
  | { type: "playlist"; value: Playlist | null }
  | { type: "video"; value: Video | null }
  | { type: "profile"; value: Profile | null };

const load = async (
  type: SharedType,
  id: string | number,
  myId: string,
): Promise<SharedData> => {
  switch (type) {
    case "post":
      return { type, value: await fetchPost(id, myId) };
    case "photo":
      return { type, value: await fetchPhoto(id) };
    case "community":
      return { type, value: await fetchCommunity(id, myId) };
    case "audio":
      return { type, value: await fetchAudio(id) };
    case "playlist":
      return { type, value: await fetchPlaylist(id) };
    case "video":
      return { type, value: await fetchVideo(id, myId) };
    case "profile":
      return { type, value: await fetchProfile(String(id)) };
  }
};

const cache = new Map<string, SharedData>();

function useShared(type: SharedType, id: string | number, myId: string) {
  const key = `${type}:${id}`;
  return useResource(async () => {
    const cached = cache.get(key);
    if (cached) return cached;
    const value = await load(type, id, myId);
    cache.set(key, value);
    return value;
  }, [key]);
}

const GONE: Record<SharedType, string> = {
  post: "Запись удалена",
  photo: "Фотография удалена",
  profile: "Страница удалена",
  community: "Сообщество удалено",
  audio: "Аудиозапись удалена",
  playlist: "Плейлист удалён",
  video: "Видео удалено",
};

export default function SharedCard({ shared }: { shared: Shared }) {
  const { myId } = useProfile();
  const { data, loading, error, reload } = useShared(
    shared.type,
    shared.id,
    myId,
  );

  if (loading && !data) {
    return (
      <div className="shared shared--state">
        <div className="chat-status__spinner" />
      </div>
    );
  }
  if (error) {
    return (
      <button type="button" className="shared shared--state" onClick={reload}>
        Не удалось загрузить. Нажмите, чтобы повторить
      </button>
    );
  }
  if (!data?.value) {
    return (
      <div className="shared shared--state">
        {GONE[shared.type]} или недоступна
      </div>
    );
  }

  if (data.type === "post") {
    const post = data.value;
    const href = post.communityId
      ? `#club/${post.communityId}`
      : `#user/${post.ownerId}`;
    return (
      <a className="shared" href={href}>
        <span className="shared__head">
          <Avatar
            name={post.author.name}
            color={post.author.color}
            src={post.author.avatar}
            size={32}
          />
          <span>
            <span className="shared__name">{post.author.name}</span>
            <span className="shared__meta">
              Запись · {formatDate(post.createdAt)}
            </span>
          </span>
        </span>
        {post.text && <span className="shared__text">{post.text}</span>}
        {post.image && (
          <img
            className="shared__image"
            src={post.image}
            alt=""
            loading="lazy"
          />
        )}
      </a>
    );
  }

  if (data.type === "video") {
    const v = data.value;
    return (
      <a className="shared shared--video" href={`#video/${v.id}`}>
        <span
          className="shared__video-poster"
          style={v.poster ? { background: bg(v.poster, "#000") } : undefined}
        >
          <span className="video-card__play">
            <PlayIcon size={28} />
          </span>
          {v.duration > 0 && (
            <span className="video-card__duration">
              {formatDuration(v.duration)}
            </span>
          )}
        </span>
        <span className="shared__name">{v.title}</span>
        <span className="shared__meta">{viewsLabel(v.views)}</span>
      </a>
    );
  }

  if (data.type === "audio") {
    return (
      <div className="shared shared--audio">
        <TrackList tracks={[data.value]} />
      </div>
    );
  }

  if (data.type === "playlist") {
    const p = data.value;
    return (
      <a className="shared shared--profile" href={`#music/playlist/${p.id}`}>
        <span
          className="shared__playlist-cover"
          style={{ background: coverGradient(p.title) }}
        >
          <PlaylistIcon size={24} />
        </span>
        <span>
          <span className="shared__name">{p.title}</span>
          <span className="shared__meta">
            Плейлист · {p.tracks.length}{" "}
            {plural(p.tracks.length, ["трек", "трека", "треков"])}
          </span>
          <span className="shared__open">Открыть плейлист</span>
        </span>
      </a>
    );
  }

  if (data.type === "community") {
    const c = data.value;
    return (
      <a className="shared shared--profile" href={`#club/${c.id}`}>
        <Avatar
          name={c.name}
          color={c.color}
          src={c.avatar}
          size={48}
          empty={false}
        />
        <span>
          <span className="shared__name">{c.name}</span>
          <span className="shared__meta">
            {c.isPage ? "Публичная страница" : "Группа"}
            {c.membersCount != null &&
              ` · ${c.membersCount} ${c.isPage ? "подписчиков" : "участников"}`}
          </span>
          <span className="shared__open">Открыть сообщество</span>
        </span>
      </a>
    );
  }

  if (data.type === "photo") {
    const photo = data.value;
    return (
      <a
        className="shared"
        href={photo.owner ? `#user/${photo.owner.id}` : "#photos"}
      >
        <img
          className="shared__image shared__image--photo"
          src={photo.src}
          alt=""
          loading="lazy"
        />
        <span className="shared__meta">
          Фотография{photo.owner && ` · ${photo.owner.name}`}
        </span>
      </a>
    );
  }

  const profile = data.value;
  return (
    <a className="shared shared--profile" href={`#user/${profile.id}`}>
      <Avatar
        name={fullName(profile)}
        color={profile.color}
        src={profile.avatar}
        size={48}
      />
      <span>
        <span className="shared__name">{fullName(profile)}</span>
        <span className="shared__meta">
          {profile.contacts.city || "Страница VYRON"}
        </span>
        <span className="shared__open">Открыть страницу</span>
      </span>
    </a>
  );
}
