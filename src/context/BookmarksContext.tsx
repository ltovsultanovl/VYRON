import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as api from "../api";
import { useProfile } from "./ProfileContext";
import { useSnackbar } from "../components/Snackbar";

interface BookmarksValue {
  isSaved: (kind: api.BookmarkKind, id: string | number) => boolean;
  toggle: (kind: api.BookmarkKind, id: string | number) => void;
  version: number;
}

const BookmarksContext = createContext<BookmarksValue | null>(null);

const SAVED: Record<api.BookmarkKind, string> = {
  post: "Запись сохранена в закладках",
  photo: "Фотография сохранена в закладках",
  video: "Видео сохранено в закладках",
  person: "Человек добавлен в закладки",
  community: "Сообщество добавлено в закладки",
};

export function BookmarksProvider({ children }: { children: ReactNode }) {
  const { myId } = useProfile();
  const showSnackbar = useSnackbar();
  const [keys, setKeys] = useState<Set<string>>(() => new Set());
  const [version, setVersion] = useState(0);
  const keysRef = useRef(keys);
  useEffect(() => {
    keysRef.current = keys;
  });

  useEffect(() => {
    api.fetchBookmarkKeys().then(
      (list) => setKeys(new Set(list)),
      () => {},
    );
  }, [myId]);

  const toggle = useCallback(
    (kind: api.BookmarkKind, id: string | number) => {
      const key = api.bookmarkKey(kind, id);
      const on = !keysRef.current.has(key);
      const flip = (add: boolean) =>
        setKeys((set) => {
          const next = new Set(set);
          if (add) next.add(key);
          else next.delete(key);
          return next;
        });
      flip(on);
      api.setBookmarked(kind, id, on).then(
        () => {
          setVersion((v) => v + 1);
          showSnackbar(on ? SAVED[kind] : "Удалено из закладок");
        },
        (e) => {
          flip(!on);
          showSnackbar(api.explainError(e), "error");
        },
      );
    },
    [showSnackbar],
  );

  const value = useMemo<BookmarksValue>(
    () => ({
      isSaved: (kind, id) => keys.has(api.bookmarkKey(kind, id)),
      toggle,
      version,
    }),
    [keys, toggle, version],
  );

  return (
    <BookmarksContext.Provider value={value}>
      {children}
    </BookmarksContext.Provider>
  );
}

export function useBookmarks() {
  const context = useContext(BookmarksContext);
  if (!context)
    throw new Error("useBookmarks нужно вызывать внутри <BookmarksProvider>");
  return context;
}
