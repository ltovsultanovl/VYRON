import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  Community,
  CommunityBrief,
  CommunityRole,
  MemberStatus,
  MyCommunity,
} from "../types";
import { supabase } from "../lib/supabase";
import {
  explainError,
  fetchMyCommunities,
  joinCommunity,
  leaveCommunity,
} from "../api";
import { useProfile } from "./ProfileContext";
import { useSnackbar } from "../components/Snackbar";

type CommunityRef = Pick<CommunityBrief, "id" | "name" | "isPage">;

interface CommunitiesValue {
  status: "loading" | "ready" | "error";
  error: string;
  reload: () => Promise<void>;
  join: (community: CommunityRef) => Promise<MemberStatus | null>;
  leave: (community: CommunityRef) => Promise<boolean>;
  joined: Community[];
  managed: MyCommunity[];
  invitations: Community[];
  roleIn: (id: number | string) => CommunityRole | null;
  statusIn: (id: number | string) => MemberStatus | "none";
  canPublishIn: (id: number | string) => boolean;
  canManage: (id: number | string) => boolean;
}

const CommunitiesContext = createContext<CommunitiesValue | null>(null);

const PUBLISHERS: CommunityRole[] = ["owner", "admin", "editor"];
const MANAGERS: CommunityRole[] = ["owner", "admin"];

export function CommunitiesProvider({ children }: { children: ReactNode }) {
  const { myId } = useProfile();
  const showSnackbar = useSnackbar();
  const [links, setLinks] = useState<MyCommunity[]>([]);
  const [status, setStatus] = useState<CommunitiesValue["status"]>("loading");
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      setLinks(await fetchMyCommunities(myId));
      setStatus("ready");
    } catch (e) {
      setError(explainError(e));
      setStatus("error");
    }
  }, [myId]);

  useEffect(() => {
    reload();
    const channel = supabase
      .channel("community-members")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_members" },
        reload,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [reload]);

  const byId = useMemo(
    () => new Map(links.map((l) => [l.community.id, l])),
    [links],
  );

  const join = useCallback(
    async (community: CommunityRef) => {
      try {
        const result = await joinCommunity(community.id);
        await reload();
        showSnackbar(
          result === "requested"
            ? "Заявка отправлена — администраторы её рассмотрят"
            : community.isPage
              ? `Вы подписались на «${community.name}»`
              : `Вы вступили в «${community.name}»`,
        );
        return result;
      } catch (e) {
        showSnackbar(explainError(e), "error");
        return null;
      }
    },
    [reload, showSnackbar],
  );

  const leave = useCallback(
    async (community: CommunityRef) => {
      const was = byId.get(community.id)?.status;
      try {
        await leaveCommunity(community.id);
        await reload();
        showSnackbar(
          was === "requested"
            ? "Заявка отменена"
            : was === "invited"
              ? "Приглашение отклонено"
              : community.isPage
                ? "Вы отписались"
                : "Вы вышли из группы",
        );
        return true;
      } catch (e) {
        showSnackbar(explainError(e), "error");
        return false;
      }
    },
    [byId, reload, showSnackbar],
  );

  const value = useMemo<CommunitiesValue>(() => {
    const member = (l: MyCommunity) => l.status === "member";
    return {
      status,
      error,
      reload,
      join,
      leave,
      joined: links.filter(member).map((l) => l.community),
      managed: links.filter((l) => member(l) && PUBLISHERS.includes(l.role)),
      invitations: links
        .filter((l) => l.status === "invited")
        .map((l) => l.community),
      roleIn: (id) => {
        const l = byId.get(Number(id));
        return l?.status === "member" ? l.role : null;
      },
      statusIn: (id) => byId.get(Number(id))?.status ?? "none",
      canPublishIn: (id) => {
        const l = byId.get(Number(id));
        return l?.status === "member" && PUBLISHERS.includes(l.role);
      },
      canManage: (id) => {
        const l = byId.get(Number(id));
        return l?.status === "member" && MANAGERS.includes(l.role);
      },
    };
  }, [links, byId, status, error, reload, join, leave]);

  return (
    <CommunitiesContext.Provider value={value}>
      {children}
    </CommunitiesContext.Provider>
  );
}

export function useCommunities() {
  const context = useContext(CommunitiesContext);
  if (!context)
    throw new Error(
      "useCommunities нужно вызывать внутри <CommunitiesProvider>",
    );
  return context;
}
