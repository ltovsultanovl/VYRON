import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Friendship, FriendStatus, Person } from "../types";
import { supabase } from "../lib/supabase";
import {
  acceptFriendRequest,
  explainError,
  fetchFriendships,
  removeFriendship,
  sendFriendRequest,
} from "../api";
import { useProfile } from "./ProfileContext";
import { useSnackbar } from "../components/Snackbar";

type FriendAction = (person: Person) => Promise<boolean>;

interface FriendsValue {
  status: "loading" | "ready" | "error";
  error: string;
  reload: () => Promise<void>;
  friends: Person[];
  incoming: Person[];
  outgoing: Person[];
  relationTo: (userId: string) => FriendStatus | "none";
  sendRequest: FriendAction;
  accept: FriendAction;
  decline: FriendAction;
  cancel: FriendAction;
  remove: FriendAction;
}

const FriendsContext = createContext<FriendsValue | null>(null);

export function FriendsProvider({ children }: { children: ReactNode }) {
  const { myId } = useProfile();
  const showSnackbar = useSnackbar();
  const [links, setLinks] = useState<Friendship[]>([]);
  const [status, setStatus] = useState<FriendsValue["status"]>("loading");
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      setLinks(await fetchFriendships(myId));
      setStatus("ready");
    } catch (e) {
      setError(explainError(e));
      setStatus("error");
    }
  }, [myId]);

  useEffect(() => {
    reload();
    const channel = supabase
      .channel("friendships")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        reload,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [reload]);

  const run = useCallback(
    async (action: () => Promise<unknown>, success?: string) => {
      try {
        await action();
        await reload();
        if (success) showSnackbar(success);
        return true;
      } catch (e) {
        showSnackbar(explainError(e), "error");
        await reload();
        return false;
      }
    },
    [reload, showSnackbar],
  );

  const value = useMemo<FriendsValue>(() => {
    const byStatus = (s: FriendStatus) =>
      links.filter((l) => l.status === s).map((l) => l.person);
    const statusById = new Map(links.map((l) => [l.person.id, l.status]));
    return {
      status,
      error,
      reload,
      friends: byStatus("friend"),
      incoming: byStatus("incoming"),
      outgoing: byStatus("outgoing"),
      relationTo: (userId: string) => statusById.get(userId) ?? "none",
      sendRequest: (person) =>
        run(() => sendFriendRequest(person.id), "Заявка отправлена"),
      accept: (person) =>
        run(
          () => acceptFriendRequest(myId, person.id),
          `${person.firstName} теперь у вас в друзьях`,
        ),
      decline: (person) =>
        run(() => removeFriendship(myId, person.id), "Заявка отклонена"),
      cancel: (person) =>
        run(() => removeFriendship(myId, person.id), "Заявка отменена"),
      remove: (person) =>
        run(
          () => removeFriendship(myId, person.id),
          `${person.firstName} удалён(а) из друзей`,
        ),
    };
  }, [links, status, error, reload, run, myId]);

  return (
    <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>
  );
}

export function useFriends() {
  const context = useContext(FriendsContext);
  if (!context)
    throw new Error("useFriends нужно вызывать внутри <FriendsProvider>");
  return context;
}
