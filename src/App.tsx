import { Suspense, useEffect, useState } from "react";
import { lazyPage } from "./lazyPage";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import Splash from "./components/Splash";
import ErrorBoundary from "./components/ErrorBoundary";
import MobileNav from "./components/MobileNav";
import AuthPage from "./pages/AuthPage";
import SetupNeeded from "./pages/SetupNeeded";
import NewPassword from "./pages/NewPassword";
import { useAuth } from "./context/AuthContext";
import { ProfileProvider, useProfile } from "./context/ProfileContext";
import { FriendsProvider, useFriends } from "./context/FriendsContext";
import {
  CommunitiesProvider,
  useCommunities,
} from "./context/CommunitiesContext";
import { ChatProvider, useChatUnread } from "./context/ChatContext";
import { PlayerProvider } from "./context/PlayerContext";
import { MusicProvider } from "./context/MusicContext";
import { VideoProvider } from "./context/VideoContext";
import { NotificationsProvider } from "./context/NotificationsContext";
import { BlocksProvider } from "./context/BlocksContext";
import { BookmarksProvider } from "./context/BookmarksContext";
import { supabaseConfigured } from "./lib/supabase";
import { useStoredState } from "./hooks";

// Страницы грузятся отдельными файлами — первый экран открывается быстрее
// Загрузчики страниц: браузер скачивает файл страницы один раз, повторный вызов берёт готовый
const pages = {
  feed: () => import("./pages/Feed"),
  profile: () => import("./pages/Profile"),
  messenger: () => import("./pages/OnlineMessenger"),
  friends: () => import("./pages/Friends"),
  communities: () => import("./pages/Communities"),
  photos: () => import("./pages/Photos"),
  music: () => import("./pages/Music"),
  video: () => import("./pages/Video"),
  notifications: () => import("./pages/Notifications"),
  community: () => import("./pages/Community"),
  communityManage: () => import("./pages/CommunityManage"),
  editProfile: () => import("./pages/EditProfile"),
  blacklist: () => import("./pages/Blacklist"),
  bookmarks: () => import("./pages/Bookmarks"),
};
const Feed = lazyPage(pages.feed);
const Profile = lazyPage(pages.profile);
const OnlineMessenger = lazyPage(pages.messenger);
const Friends = lazyPage(pages.friends);
const Communities = lazyPage(pages.communities);
const Photos = lazyPage(pages.photos);
const Music = lazyPage(pages.music);
const Video = lazyPage(pages.video);
const Notifications = lazyPage(pages.notifications);
const Community = lazyPage(pages.community);
const CommunityManage = lazyPage(pages.communityManage);
const EditProfile = lazyPage(pages.editProfile);
const Blacklist = lazyPage(pages.blacklist);
const Bookmarks = lazyPage(pages.bookmarks);


// Тему до отрисовки уже поставил скрипт в index.html (с учётом системной)
type Theme = "light" | "dark";
const readTheme = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

// Адрес → экран: #feed, #profile, #user/<id>, #edit, #messages, #friends[/requests|/search?q=…],
// #communities[/manage|/search], #club/<id>[/manage[/раздел]],
// #photos[/<id>][/album/<id>] — фотографии и альбомы,
// #music[/playlists|/search?q=|/playlist/<id>|/user/<id>] — музыка,
// #video[/search?q=|/user/<id>|/<id>] — видео, #notifications — уведомления
const VIEWS = [
  "feed",
  "profile",
  "user",
  "edit",
  "messages",
  "friends",
  "communities",
  "club",
  "photos",
  "music",
  "video",
  "notifications",
  "blacklist",
  "bookmarks",
];
const readRoute = () => {
  const [path, search = ""] = decodeURIComponent(
    window.location.hash.slice(1),
  ).split("?");
  const [view, param = "", sub = "", section = ""] = path.split("/");
  return {
    view: VIEWS.includes(view) ? view : "feed",
    param,
    sub,
    section,
    query: new URLSearchParams(search).get("q") ?? "",
  };
};

// Код открытой страницы начинаем качать сразу при запуске — параллельно с проверкой
// входа и загрузкой профиля, а не после них. Ошибку здесь глушим: её покажет сама страница
const PAGE_OF_VIEW: Record<string, keyof typeof pages> = {
  feed: "feed",
  profile: "profile",
  user: "profile",
  edit: "editProfile",
  messages: "messenger",
  friends: "friends",
  communities: "communities",
  club: "community",
  photos: "photos",
  music: "music",
  video: "video",
  notifications: "notifications",
  blacklist: "blacklist",
  bookmarks: "bookmarks",
};
if (supabaseConfigured) pages[PAGE_OF_VIEW[readRoute().view]]().catch(() => {});

// Остальные разделы докачиваем, когда браузер освободится, — тогда переход по меню
// открывается мгновенно, без крутилки. В режиме экономии трафика не докачиваем
function usePrefetchPages() {
  useEffect(() => {
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (saveData) return;
    const run = () => Object.values(pages).forEach((load) => load().catch(() => {}));
    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(run, { timeout: 3000 });
      return () => cancelIdleCallback(id);
    }
    const t = setTimeout(run, 1500);
    return () => clearTimeout(t);
  }, []);
}

function PageLoading() {
  return (
    <div className="card list-state" role="status" aria-label="Загрузка">
      <div className="chat-status__spinner" />
    </div>
  );
}

function PageError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="card error-screen" role="alert">
      <div className="error-screen__title">Не удалось показать страницу</div>
      <p className="error-screen__text">
        Произошла ошибка. Попробуйте ещё раз или откройте другой раздел в меню
        слева.
      </p>
      <button className="btn" onClick={onRetry}>
        Попробовать снова
      </button>
    </div>
  );
}

// Приложение для вошедшего пользователя
function Shell({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  usePrefetchPages();
  const { myId } = useProfile();
  const { incoming } = useFriends();
  const unreadMessages = useChatUnread();
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    const onHash = () => {
      setRoute(readRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = (path: string) => {
    if (window.location.hash === `#${path}`) setRoute(readRoute());
    else window.location.hash = path;
  };

  const { view, param, sub, section, query } = route;
  const { invitations } = useCommunities();
  // Своя страница по адресу #user/<мой id> — то же, что #profile
  const profileId =
    view === "profile" || (view === "user" && param === myId)
      ? myId
      : view === "user"
        ? param
        : null;

  return (
    <>
      <Header
        onNavigate={navigate}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />
      <div className="layout">
        <Sidebar
          view={profileId === myId ? "profile" : view}
          onNavigate={navigate}
          counters={{
            messages: unreadMessages,
            friends: incoming.length,
            communities: invitations.length,
          }}
        />
        <main className="main">
          <ErrorBoundary
            key={`${view}/${param}/${sub}`}
            fallback={(reset) => <PageError onRetry={reset} />}
          >
            <Suspense fallback={<PageLoading />}>
            {view === "feed" && <Feed />}
            {profileId && (
              <Profile
                key={profileId}
                userId={profileId}
                onNavigate={navigate}
              />
            )}
            {view === "edit" && <EditProfile onNavigate={navigate} />}
            {view === "messages" && <OnlineMessenger />}
            {view === "friends" && (
              <Friends section={param} query={query} onNavigate={navigate} />
            )}
            {view === "communities" && (
              <Communities
                section={param}
                query={query}
                onNavigate={navigate}
              />
            )}
            {view === "music" && (
              <Music
                section={param}
                param={sub}
                query={query}
                onNavigate={navigate}
              />
            )}
            {view === "notifications" && <Notifications onNavigate={navigate} />}
            {view === "blacklist" && <Blacklist />}
            {view === "bookmarks" && <Bookmarks section={param} onNavigate={navigate} />}
            {view === "video" && (
              <Video
                section={param}
                param={sub}
                query={query}
                onNavigate={navigate}
              />
            )}
            {view === "photos" && (
              <Photos
                key={!param || param === "album" ? "me" : param}
                param={param}
                sub={sub}
                section={section}
                onNavigate={navigate}
              />
            )}
            {view === "club" && sub !== "manage" && (
              <Community key={param} id={Number(param)} onNavigate={navigate} />
            )}
            {view === "club" && sub === "manage" && (
              <CommunityManage
                key={param}
                id={Number(param)}
                section={section}
                onNavigate={navigate}
              />
            )}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <MobileNav
        view={profileId === myId ? "profile" : view}
        onNavigate={navigate}
        counters={{
          messages: unreadMessages,
          friends: incoming.length,
          communities: invitations.length,
        }}
      />
    </>
  );
}

export default function App() {
  const { session, recovering, finishRecovery } = useAuth();
  const [theme, setTheme] = useStoredState<Theme>("theme", readTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  if (!supabaseConfigured) return <SetupNeeded />;
  if (session === undefined) return <Splash />;
  if (!session) return <AuthPage />;
  if (recovering) return <NewPassword onDone={finishRecovery} />;

  // key — при смене аккаунта все данные предыдущего пользователя сбрасываются
  return (
    <ProfileProvider key={session.user.id} userId={session.user.id}>
      <FriendsProvider>
        <BlocksProvider>
        <BookmarksProvider>
        <CommunitiesProvider>
          <ChatProvider>
            <PlayerProvider>
              <MusicProvider>
                <VideoProvider>
                  <NotificationsProvider>
                    <Shell
                      theme={theme}
                      onToggleTheme={() =>
                        setTheme((t) => (t === "dark" ? "light" : "dark"))
                      }
                    />
                  </NotificationsProvider>
                </VideoProvider>
              </MusicProvider>
            </PlayerProvider>
          </ChatProvider>
        </CommunitiesProvider>
        </BookmarksProvider>
        </BlocksProvider>
      </FriendsProvider>
    </ProfileProvider>
  );
}
