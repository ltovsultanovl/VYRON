import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as api from "../api";
import { useProfile } from "./ProfileContext";
import { useFriends } from "./FriendsContext";
import { useSnackbar } from "../components/Snackbar";
import type { Person } from "../types";

interface BlocksValue {
  blocked: api.BlockedPerson[];
  isBlocked: (userId: string) => boolean;
  hasBlockedMe: (userId: string) => boolean;
  block: (person: Pick<Person, "id" | "firstName">) => Promise<boolean>;
  unblock: (person: Pick<Person, "id" | "firstName">) => Promise<boolean>;
  refreshBlockedMe: () => void;
}

const BlocksContext = createContext<BlocksValue | null>(null);

export function BlocksProvider({ children }: { children: ReactNode }) {
  const { myId } = useProfile();
  const { reload: reloadFriends } = useFriends();
  const showSnackbar = useSnackbar();
  const [blocked, setBlocked] = useState<api.BlockedPerson[]>([]);
  const [blockedMe, setBlockedMe] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    try {
      setBlocked(await api.fetchBlocked());
    } catch {}
  }, []);

  const refreshBlockedMe = useCallback(() => {
    api.fetchBlockedMe().then(
      (ids) => setBlockedMe(new Set(ids)),
      () => {},
    );
  }, []);

  useEffect(() => {
    load();
    refreshBlockedMe();
  }, [myId, load, refreshBlockedMe]);

  const block = useCallback(
    async (person: Pick<Person, "id" | "firstName">) => {
      try {
        await api.blockUser(person.id);
        await Promise.all([load(), reloadFriends()]);
        showSnackbar("Пользователь добавлен в чёрный список");
        return true;
      } catch (e) {
        showSnackbar(api.explainError(e), "error");
        return false;
      }
    },
    [load, reloadFriends, showSnackbar],
  );

  const unblock = useCallback(
    async (person: Pick<Person, "id" | "firstName">) => {
      setBlocked((list) => list.filter((b) => b.person.id !== person.id));
      try {
        await api.unblockUser(person.id);
        showSnackbar("Пользователь удалён из чёрного списка");
        return true;
      } catch (e) {
        showSnackbar(api.explainError(e), "error");
        load();
        return false;
      }
    },
    [load, showSnackbar],
  );

  const value = useMemo<BlocksValue>(() => {
    const ids = new Set(blocked.map((b) => b.person.id));
    return {
      blocked,
      isBlocked: (id) => ids.has(id),
      hasBlockedMe: (id) => blockedMe.has(id),
      block,
      unblock,
      refreshBlockedMe,
    };
  }, [blocked, blockedMe, block, unblock, refreshBlockedMe]);

  return (
    <BlocksContext.Provider value={value}>{children}</BlocksContext.Provider>
  );
}

export function useBlocks() {
  const context = useContext(BlocksContext);
  if (!context)
    throw new Error("useBlocks нужно вызывать внутри <BlocksProvider>");
  return context;
}
