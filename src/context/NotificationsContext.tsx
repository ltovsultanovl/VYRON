import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabase";
import { useProfile } from "./ProfileContext";
import { useSnackbar } from "../components/Snackbar";
import { summary } from "../components/notifications/describe";
import * as api from "../api";
import { useResume } from "../hooks";
import type { AppNotification } from "../types";

interface NotificationsValue {
  status: "loading" | "ready" | "error";
  error: string;
  reload: () => void;
  notifications: AppNotification[];
  unread: number;
  markAllRead: () => void;
  hide: (n: AppNotification) => void;
}

const NotificationsContext = createContext<NotificationsValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { myId } = useProfile();
  const showSnackbar = useSnackbar();
  const [list, setList] = useState<AppNotification[]>([]);
  const [status, setStatus] = useState<NotificationsValue["status"]>("loading");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.fetchNotifications().then(
      (rows) => {
        if (cancelled) return;
        setList(rows.filter((n) => n.actor?.id !== myId));
        setStatus("ready");
      },
      (e) => {
        if (cancelled) return;
        setError(api.explainError(e));
        setStatus("error");
      },
    );

    const channel = supabase
      .channel("notifications")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${myId}`,
        },
        async (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as { id?: number };
            if (old.id) setList((l) => l.filter((n) => n.id !== old.id));
            return;
          }
          const id = (payload.new as { id?: number }).id;
          if (!id) return;
          if (payload.eventType === "UPDATE") {
            const readAt = (payload.new as { read_at: string | null }).read_at;
            setList((l) => l.map((n) => (n.id === id ? { ...n, readAt } : n)));
            return;
          }
          const fresh = await api.fetchNotification(id).catch(() => null);
          if (!fresh || cancelled || fresh.actor?.id === myId) return;
          setList((l) => [fresh, ...l.filter((n) => n.id !== fresh.id)]);
          if (!location.hash.startsWith("#notifications"))
            showSnackbar(summary(fresh), "info");
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [myId, attempt, showSnackbar]);

  useResume(() => setAttempt((a) => a + 1));

  const markAllRead = useCallback(() => {
    const now = new Date().toISOString();
    let changed = false;
    setList((l) =>
      l.map((n) => {
        if (n.readAt) return n;
        changed = true;
        return { ...n, readAt: now };
      }),
    );
    queueMicrotask(() => {
      if (changed) api.markNotificationsRead(myId).catch(() => {});
    });
  }, [myId]);

  const hide = useCallback(
    (n: AppNotification) => {
      setList((l) => l.filter((x) => x.id !== n.id));
      api.deleteNotification(n.id).catch((e) => {
        showSnackbar(api.explainError(e), "error");
        setAttempt((a) => a + 1);
      });
    },
    [showSnackbar],
  );

  const value = useMemo<NotificationsValue>(
    () => ({
      status,
      error,
      reload: () => setAttempt((a) => a + 1),
      notifications: list,
      unread: list.filter((n) => !n.readAt).length,
      markAllRead,
      hide,
    }),
    [status, error, list, markAllRead, hide],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context)
    throw new Error(
      "useNotifications нужно вызывать внутри <NotificationsProvider>",
    );
  return context;
}
