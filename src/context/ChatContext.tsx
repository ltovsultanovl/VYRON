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
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type {
  AttachmentType,
  ChatPeer,
  CommunityBrief,
  CommunityMessageRow,
  Dialog,
  MessageRow,
  Person,
  SendOptions,
  SharedType,
} from "../types";
import {
  attachmentKind,
  deleteMessageForAll,
  deleteMessageForMe,
  explainError,
  fetchChatSettings,
  clearChatForMe,
  markVoiceListened,
  fetchCommunityBrief,
  saveChatSetting,
  toChatSetting,
  type ChatSetting,
  fetchMyCommunityMessages,
  markCommunityMessagesRead,
  sendCommunityMessage,
  fetchPeople,
  getChatFileUrls,
  removeChatFile,
  trackTitle,
  uploadChatFile,
} from "../api";
import { useProfile } from "./ProfileContext";
import { useFriends } from "./FriendsContext";
import { useSnackbar } from "../components/Snackbar";
import { useResume, useStoredState } from "../hooks";

type ClubInfo = Pick<CommunityBrief, "id" | "name" | "color" | "avatar">;

interface ChatValue {
  status: "connecting" | "ready" | "error";
  error: string;
  myId: string;
  dialogs: Dialog[];
  fileUrls: Record<string, string>;
  unreadTotal: number;
  onlineIds: Set<string>;
  activePeerId: string | null;
  setActivePeerId: (id: string | null) => void;
  openChat: (person: Person) => void;
  openCommunityChat: (community: ClubInfo) => void;
  sendMessage: (to: string, options?: SendOptions) => Promise<void>;
  retryMessage: (message: MessageRow) => void;
  deleteMessage: (
    message: MessageRow,
    options?: { forAll?: boolean },
  ) => Promise<boolean>;
  markRead: (peerId: string) => Promise<void>;
  markListened: (messageId: number | string) => void;
  clearChat: (peerId: string, doneText?: string) => void;
  deleteChat: (peerId: string) => void;
  sendTyping: (to: string) => void;
  retry: () => void;
  togglePin: (peer: string) => void;
  toggleArchive: (peer: string) => void;
  markUnread: (peer: string) => void;
  clearMarkedUnread: (peer: string) => void;
}

const ChatContext = createContext<ChatValue | null>(null);

const ChatUnreadContext = createContext(0);
type ChatActions = Pick<
  ChatValue,
  "openChat" | "openCommunityChat" | "sendMessage"
>;
const ChatActionsContext = createContext<ChatActions | null>(null);
const OnlineContext = createContext<Set<string>>(new Set());

const TYPING_TIMEOUT = 3500;
const TYPING_THROTTLE = 2000;
const MESSAGES_LIMIT = 1000;

const isPresent = () =>
  document.visibilityState === "visible" && navigator.onLine;

const isTwin = (tmp: MessageRow, row: MessageRow) =>
  tmp.pending === true &&
  String(tmp.id).startsWith("tmp-") &&
  tmp.sender_id === row.sender_id &&
  tmp.recipient_id === row.recipient_id &&
  tmp.text === row.text &&
  (tmp.attachment_path ?? null) === (row.attachment_path ?? null) &&
  (tmp.shared_id ?? null) === (row.shared_id ?? null);

const settle = (list: MessageRow[], row: MessageRow, tempId?: string) => {
  if (list.some((m) => m.id === row.id))
    return upsertById(tempId ? list.filter((m) => m.id !== tempId) : list, row);
  const i = list.findIndex((m) => (tempId ? m.id === tempId : isTwin(m, row)));
  if (i === -1) return [...list, row];
  const tmp = list[i];
  const next = [...list];
  next[i] = {
    ...tmp,
    ...row,
    pending: false,
    failed: false,
    file: null,
    client_key: tmp.client_key ?? String(tmp.id),
    localUrl: tmp.localUrl,
  };
  return next;
};

const imageSize = async (url: string) => {
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
    return img.naturalWidth && img.naturalHeight
      ? { width: img.naturalWidth, height: img.naturalHeight }
      : null;
  } catch {
    return null;
  }
};

const upsertById = <T extends { id: number | string }>(
  list: T[],
  row: T,
): T[] => {
  const i = list.findIndex((m) => m.id === row.id);
  if (i === -1) return [...list, row];
  const next = [...list];
  next[i] = { ...next[i], ...row };
  return next;
};

const byTime = (a: { created_at: string }, b: { created_at: string }) =>
  new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

const SHARED_SUMMARY: Record<SharedType, string> = {
  post: "📝 Запись",
  photo: "🖼 Фотография",
  profile: "👤 Страница пользователя",
  community: "👥 Сообщество",
  audio: "🎵 Аудиозапись",
  playlist: "🎶 Плейлист",
  video: "🎬 Видео",
};
const ATTACHMENT_SUMMARY: Record<AttachmentType, string> = {
  image: "📷 Фотография",
  video: "🎬 Видео",
  audio: "🎵 Аудиозапись",
  voice: "🎤 Голосовое сообщение",
};
export const messageSummary = (m: MessageRow): string =>
  m.text ||
  (m.shared_type ? SHARED_SUMMARY[m.shared_type] : "") ||
  (m.attachment_type === "audio" && m.attachment_name
    ? `🎵 ${m.attachment_name}`
    : m.attachment_type
      ? ATTACHMENT_SUMMARY[m.attachment_type]
      : "");

export function ChatProvider({ children }: { children: ReactNode }) {
  const { myId } = useProfile();
  const { friends } = useFriends();
  const showSnackbar = useSnackbar();

  const [status, setStatus] = useState<ChatValue["status"]>("connecting");
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [clubMessages, setClubMessages] = useState<CommunityMessageRow[]>([]);
  const [clubs, setClubs] = useState<Record<number, ClubInfo>>({});
  const clubRows = useRef(new WeakMap<CommunityMessageRow, MessageRow>());
  const clubsRef = useRef(clubs);
  useEffect(() => {
    clubsRef.current = clubs;
  });
  const [people, setPeople] = useState<Record<string, Person>>({});
  const [onlineIds, setOnlineIds] = useState(() => new Set<string>());
  const [typingIds, setTypingIds] = useState(() => new Set<string>());
  const [activePeerId, setActivePeerId] = useState<string | null>(null);
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<Record<string, ChatSetting>>({});
  const [deletedPeers, setDeletedPeers] = useStoredState<string[]>(
    `chat:deleted:${myId}`,
    [],
  );
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  });
  const requestedUrls = useRef(new Set<string>());
  const [attempt, setAttempt] = useState(0);

  const presenceRef = useRef<RealtimeChannel | null>(null);
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {},
  );
  const lastTypingSent = useRef(0);
  const peopleRef = useRef(people);
  useEffect(() => {
    peopleRef.current = people;
  });

  const loadPeople = useCallback(async (ids: string[]) => {
    const missing = [...new Set(ids)].filter(
      (id) => id && !peopleRef.current[id],
    );
    if (!missing.length) return;
    try {
      const list = await fetchPeople(missing);
      setPeople((map) => ({
        ...map,
        ...Object.fromEntries(list.map((p) => [p.id, p])),
      }));
    } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;
    const channels: RealtimeChannel[] = [];

    const connect = async () => {
      setStatus("connecting");
      setError("");
      try {
        const { data, error } = await supabase
          .from("messages")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(MESSAGES_LIMIT);
        if (error) throw error;
        if (cancelled) return;

        const rows = (data ?? []) as MessageRow[];
        setMessages(rows.sort(byTime));

        try {
          const clubRows = await fetchMyCommunityMessages(myId);
          if (!cancelled) {
            setClubMessages(clubRows);
            setClubs((map) => ({
              ...map,
              ...Object.fromEntries(
                clubRows.flatMap((r) =>
                  r.community ? [[r.community.id, r.community]] : [],
                ),
              ),
            }));
          }
        } catch {}
        await loadPeople(
          rows.map((m) =>
            m.sender_id === myId ? m.recipient_id : m.sender_id,
          ),
        );

        channels.push(
          supabase
            .channel("messages")
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table: "messages" },
              (payload) => {
                if (payload.eventType === "DELETE") {
                  const old = payload.old as Partial<MessageRow>;
                  if (old?.id)
                    setMessages((list) => list.filter((m) => m.id !== old.id));
                  return;
                }
                const row = payload.new as MessageRow;
                if (!row?.id) return;
                setMessages((list) => settle(list, row).sort(byTime));
                const peer =
                  row.sender_id === myId ? row.recipient_id : row.sender_id;
                loadPeople([peer]);
                if (
                  payload.eventType === "INSERT" &&
                  row.recipient_id === myId
                ) {
                  clearTimeout(typingTimers.current[row.sender_id]);
                  setTypingIds((ids) => {
                    if (!ids.has(row.sender_id)) return ids;
                    const next = new Set(ids);
                    next.delete(row.sender_id);
                    return next;
                  });
                }
                const incoming = row.recipient_id === myId && !row.read_at;
                if (incoming && !location.hash.startsWith("#messages")) {
                  const from =
                    peopleRef.current[row.sender_id]?.name ?? "Новое сообщение";
                  showSnackbar(
                    `${from}: ${messageSummary(row).slice(0, 60)}`,
                    "info",
                  );
                }
              },
            )
            .subscribe(),
        );

        channels.push(
          supabase
            .channel("community-messages")
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table: "community_messages" },
              (payload) => {
                const row = payload.new as CommunityMessageRow;
                if (!row?.id || row.user_id !== myId) return;
                setClubMessages((list) => upsertById(list, row).sort(byTime));
                if (!clubsRef.current[row.community_id]) {
                  fetchCommunityBrief(row.community_id).then(
                    (c) => c && setClubs((map) => ({ ...map, [c.id]: c })),
                  );
                }
                if (
                  row.from_community &&
                  !row.read_at &&
                  !location.hash.startsWith("#messages")
                ) {
                  const name =
                    clubsRef.current[row.community_id]?.name ?? "Сообщество";
                  showSnackbar(`${name}: ${row.text.slice(0, 60)}`, "info");
                }
              },
            )
            .subscribe(),
        );

        const presence = supabase.channel("online", {
          config: { presence: { key: myId } },
        });
        presence
          .on("presence", { event: "sync" }, () => {
            setOnlineIds(new Set(Object.keys(presence.presenceState())));
          })
          .on("broadcast", { event: "typing" }, ({ payload }) => {
            if (payload?.to !== myId) return;
            const from: string = payload.from;
            setTypingIds((ids) =>
              ids.has(from) ? ids : new Set(ids).add(from),
            );
            clearTimeout(typingTimers.current[from]);
            typingTimers.current[from] = setTimeout(() => {
              setTypingIds((ids) => {
                const next = new Set(ids);
                next.delete(from);
                return next;
              });
            }, TYPING_TIMEOUT);
          })
          .subscribe((state) => {
            if (state === "SUBSCRIBED" && isPresent())
              presence.track({ at: Date.now() });
          });
        channels.push(presence);
        presenceRef.current = presence;

        try {
          const list = await fetchChatSettings();
          if (!cancelled)
            setSettings(Object.fromEntries(list.map((c) => [c.peer, c])));
        } catch {}
        channels.push(
          supabase
            .channel("chat-settings")
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "chat_settings",
                filter: `user_id=eq.${myId}`,
              },
              (payload) => {
                if (payload.eventType === "DELETE") return;
                const row = toChatSetting(
                  payload.new as Parameters<typeof toChatSetting>[0],
                );
                setSettings((map) => ({ ...map, [row.peer]: row }));
              },
            )
            .subscribe(),
        );

        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setError(explainError(e));
        setStatus("error");
      }
    };

    connect();

    return () => {
      cancelled = true;
      channels.forEach((ch) => supabase.removeChannel(ch));
      presenceRef.current = null;
      Object.values(typingTimers.current).forEach(clearTimeout);
    };
  }, [myId, attempt, loadPeople, showSnackbar]);

  useEffect(() => {
    if (status !== "ready") return;
    const update = () => {
      const presence = presenceRef.current;
      if (!presence) return;
      if (isPresent()) presence.track({ at: Date.now() });
      else presence.untrack();
    };
    const leave = () => presenceRef.current?.untrack();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("pageshow", update);
    window.addEventListener("pagehide", leave);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("pageshow", update);
      window.removeEventListener("pagehide", leave);
    };
  }, [status]);

  const sendToClub = useCallback(
    async (communityId: number, text: string) => {
      const tempId = `tmp-${crypto.randomUUID()}`;
      setClubMessages((list) => [
        ...list,
        {
          id: tempId,
          community_id: communityId,
          user_id: myId,
          from_community: false,
          text,
          created_at: new Date().toISOString(),
          read_at: null,
          pending: true,
        },
      ]);
      try {
        const row = await sendCommunityMessage({
          communityId,
          userId: myId,
          text,
        });
        setClubMessages((list) =>
          upsertById(
            list.filter((m) => m.id !== tempId),
            row,
          ).sort(byTime),
        );
      } catch (e) {
        setClubMessages((list) =>
          list.map((m) =>
            m.id === tempId ? { ...m, pending: false, failed: true } : m,
          ),
        );
        showSnackbar(`Сообщение не отправлено: ${explainError(e)}`, "error");
      }
    },
    [myId, showSnackbar],
  );

  const sendMessage = useCallback(
    async (
      to: string,
      { text = "", file = null, voice = null, shared = null }: SendOptions = {},
    ) => {
      if (String(to).startsWith("club:"))
        return sendToClub(Number(to.slice(5)), text);
      const tempId = `tmp-${crypto.randomUUID()}`;
      const localUrl = file ? URL.createObjectURL(file) : null;
      const attachmentType: AttachmentType | null = voice
        ? "voice"
        : file
          ? attachmentKind(file)
          : null;
      const size =
        attachmentType === "image" && localUrl
          ? await imageSize(localUrl)
          : null;
      const meta = voice ?? size;
      setMessages((list) => [
        ...list,
        {
          id: tempId,
          sender_id: myId,
          recipient_id: to,
          text,
          attachment_type: attachmentType,
          attachment_name:
            attachmentType === "audio" && file ? trackTitle(file.name) : null,
          attachment_meta: meta,
          client_key: tempId,
          shared_type: shared?.type ?? null,
          shared_id: shared ? String(shared.id) : null,
          localUrl,
          file,
          created_at: new Date().toISOString(),
          read_at: null,
          pending: true,
        },
      ]);

      let uploaded: Awaited<ReturnType<typeof uploadChatFile>> | null = null;
      try {
        if (file) {
          uploaded = await uploadChatFile(myId, to, file, {
            kind: voice ? "voice" : undefined,
          });
          const path = uploaded.path;
          if (localUrl) setFileUrls((urls) => ({ ...urls, [path]: localUrl }));
          setMessages((list) =>
            list.map((m) =>
              m.id === tempId ? { ...m, attachment_path: path } : m,
            ),
          );
        }
        const { data, error } = await supabase
          .from("messages")
          .insert({
            recipient_id: to,
            text,
            ...(uploaded && {
              attachment_path: uploaded.path,
              attachment_type: uploaded.type,
              ...(uploaded.name && { attachment_name: uploaded.name }),
              ...(meta && { attachment_meta: meta }),
            }),
            ...(shared && {
              shared_type: shared.type,
              shared_id: String(shared.id),
            }),
          })
          .select()
          .single();
        if (error) throw error;

        setMessages((list) =>
          settle(list, data as MessageRow, tempId).sort(byTime),
        );
      } catch (e) {
        if (uploaded) removeChatFile(uploaded.path).catch(() => {});
        setMessages((list) =>
          list.map((m) =>
            m.id === tempId ? { ...m, pending: false, failed: true } : m,
          ),
        );
        showSnackbar(`Сообщение не отправлено: ${explainError(e)}`, "error");
      }
    },
    [myId, showSnackbar, sendToClub],
  );

  const retryMessage = useCallback(
    (message: MessageRow) => {
      if (message.community_id) {
        setClubMessages((list) => list.filter((m) => m.id !== message.id));
        return sendToClub(message.community_id, message.text);
      }
      setMessages((list) => list.filter((m) => m.id !== message.id));
      if (message.localUrl) URL.revokeObjectURL(message.localUrl);
      sendMessage(message.recipient_id, {
        text: message.text,
        file: message.file,
        voice:
          message.attachment_type === "voice" ? message.attachment_meta : null,
        shared:
          message.shared_type && message.shared_id
            ? { type: message.shared_type, id: message.shared_id }
            : null,
      });
    },
    [sendMessage, sendToClub],
  );

  useEffect(() => {
    const missing = messages
      .map((m) => m.attachment_path)
      .filter(
        (path): path is string =>
          !!path && !fileUrls[path] && !requestedUrls.current.has(path),
      );
    if (!missing.length) return;
    missing.forEach((path) => requestedUrls.current.add(path));
    getChatFileUrls(missing)
      .then((urls) => setFileUrls((prev) => ({ ...prev, ...urls })))
      .catch(() =>
        missing.forEach((path) => requestedUrls.current.delete(path)),
      );
  }, [messages, fileUrls]);

  const markListened = useCallback((messageId: number | string) => {
    if (String(messageId).startsWith("tmp-")) return;
    setMessages((list) =>
      list.map((m) =>
        m.id === messageId && !m.listened_at
          ? { ...m, listened_at: new Date().toISOString() }
          : m,
      ),
    );
    markVoiceListened(messageId).catch(() => {});
  }, []);

  const markRead = useCallback(
    async (peerId: string) => {
      const now = new Date().toISOString();
      if (String(peerId).startsWith("club:")) {
        const communityId = Number(peerId.slice(5));
        setClubMessages((list) =>
          list.map((m) =>
            m.community_id === communityId && m.from_community && !m.read_at
              ? { ...m, read_at: now }
              : m,
          ),
        );
        await markCommunityMessagesRead({
          communityId,
          userId: myId,
          fromCommunity: true,
        }).catch(() => {});
        return;
      }
      setMessages((list) =>
        list.map((m) =>
          m.sender_id === peerId && m.recipient_id === myId && !m.read_at
            ? { ...m, read_at: now }
            : m,
        ),
      );
      await supabase
        .from("messages")
        .update({ read_at: now })
        .eq("sender_id", peerId)
        .eq("recipient_id", myId)
        .is("read_at", null);
    },
    [myId],
  );

  const sendTyping = useCallback(
    (to: string) => {
      const now = Date.now();
      if (
        !presenceRef.current ||
        now - lastTypingSent.current < TYPING_THROTTLE
      )
        return;
      lastTypingSent.current = now;
      presenceRef.current.send({
        type: "broadcast",
        event: "typing",
        payload: { from: myId, to },
      });
    },
    [myId],
  );

  const openCommunityChat = useCallback((community: ClubInfo) => {
    setClubs((map) => ({
      ...map,
      [community.id]: {
        id: community.id,
        name: community.name,
        color: community.color,
        avatar: community.avatar,
      },
    }));
    setActivePeerId(`club:${community.id}`);
  }, []);

  const openChat = useCallback(
    (person: Person) => {
      setPeople((map) =>
        map[person.id] ? map : { ...map, [person.id]: person },
      );
      setDeletedPeers((list) =>
        list.includes(person.id) ? list.filter((id) => id !== person.id) : list,
      );
      setActivePeerId(person.id);
    },
    [setDeletedPeers],
  );

  const deleteMessage = useCallback(
    async (
      message: MessageRow,
      { forAll = false }: { forAll?: boolean } = {},
    ) => {
      const isTemp = String(message.id).startsWith("tmp-");
      setMessages((list) => list.filter((m) => m.id !== message.id));
      if (isTemp) return true;

      try {
        if (forAll) await deleteMessageForAll(Number(message.id));
        else await deleteMessageForMe(Number(message.id));
        return true;
      } catch (e) {
        setMessages((list) => upsertById(list, message).sort(byTime));
        showSnackbar(`Не удалось удалить: ${explainError(e)}`, "error");
        return false;
      }
    },
    [showSnackbar],
  );

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const clearChat = useCallback(
    async (peerId: string, doneText = "История сообщений очищена") => {
      const inChat = (m: MessageRow) =>
        !String(m.id).startsWith("tmp-") &&
        ((m.sender_id === myId && m.recipient_id === peerId) ||
          (m.sender_id === peerId && m.recipient_id === myId));
      let removed: MessageRow[] = [];
      setMessages((list) => {
        removed = list.filter(inChat);
        return list.filter((m) => !inChat(m));
      });
      try {
        await clearChatForMe(peerId);
        if (doneText) showSnackbar(doneText);
      } catch (e) {
        setMessages((list) => [...list, ...removed].sort(byTime));
        showSnackbar(`Не удалось очистить: ${explainError(e)}`, "error");
      }
    },
    [myId, showSnackbar],
  );

  const deleteChat = useCallback(
    async (peerId: string) => {
      setDeletedPeers((list) =>
        list.includes(peerId) ? list : [...list, peerId],
      );
      setActivePeerId((current) => (current === peerId ? null : current));
      await clearChat(peerId, "");
      showSnackbar("Чат удалён");
    },
    [clearChat, setDeletedPeers, showSnackbar],
  );

  const resync = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(MESSAGES_LIMIT);
      if (error) throw error;
      const rows = (data ?? []) as MessageRow[];
      setMessages((list) => {
        const before = new Map(list.map((m) => [m.id, m]));
        const pending = list.filter((m) => String(m.id).startsWith("tmp-"));
        return [
          ...rows.map((r) =>
            before.has(r.id) ? { ...before.get(r.id), ...r } : r,
          ),
          ...pending,
        ].sort(byTime);
      });
      loadPeople(
        rows.map((m) => (m.sender_id === myId ? m.recipient_id : m.sender_id)),
      );
      fetchMyCommunityMessages(myId).then(setClubMessages, () => {});
      fetchChatSettings().then(
        (list) => setSettings(Object.fromEntries(list.map((c) => [c.peer, c]))),
        () => {},
      );
    } catch {}
  }, [myId, loadPeople]);

  useResume(() =>
    status === "error" ? retry() : status === "ready" && resync(),
  );

  const changeSetting = useCallback(
    (peer: string, patch: Partial<ChatSetting>, success?: string) => {
      const before = settingsRef.current[peer];
      const base: ChatSetting = before ?? {
        peer,
        pinnedAt: null,
        archivedAt: null,
        markedUnread: false,
      };
      const next: ChatSetting = { ...base, ...patch };
      setSettings((map) => ({ ...map, [peer]: next }));
      saveChatSetting(myId, next).then(
        () => success && showSnackbar(success),
        (e) => {
          setSettings((map) => {
            const rest = { ...map };
            if (before) rest[peer] = before;
            else delete rest[peer];
            return rest;
          });
          showSnackbar(explainError(e), "error");
        },
      );
    },
    [myId, showSnackbar],
  );

  const togglePin = useCallback(
    (peer: string) => {
      const pinned = !!settingsRef.current[peer]?.pinnedAt;
      changeSetting(
        peer,
        { pinnedAt: pinned ? null : new Date().toISOString() },
        pinned ? "Чат откреплён" : "Чат закреплён",
      );
    },
    [changeSetting],
  );

  const toggleArchive = useCallback(
    (peer: string) => {
      const archived = !!settingsRef.current[peer]?.archivedAt;
      changeSetting(
        peer,
        archived
          ? { archivedAt: null }
          : { archivedAt: new Date().toISOString(), pinnedAt: null },
        archived ? "Чат возвращён из архива" : "Чат перенесён в архив",
      );
    },
    [changeSetting],
  );

  const markUnread = useCallback(
    (peer: string) =>
      changeSetting(peer, { markedUnread: true }, "Чат отмечен непрочитанным"),
    [changeSetting],
  );

  const clearMarkedUnread = useCallback(
    (peer: string) => {
      if (settingsRef.current[peer]?.markedUnread)
        changeSetting(peer, { markedUnread: false });
    },
    [changeSetting],
  );

  const dialogs = useMemo<Dialog[]>(() => {
    const flags = (peer: string, thread: MessageRow[]) => {
      const c = settings[peer];
      const lastIncoming = [...thread]
        .reverse()
        .find((m) => m.recipient_id === myId);
      const archived =
        !!c?.archivedAt &&
        !(lastIncoming && lastIncoming.created_at > c.archivedAt);
      return {
        pinned: !!c?.pinnedAt && !archived,
        archived,
        markedUnread: !!c?.markedUnread,
      };
    };
    const contacts = new Map<string, Person>(Object.entries(people));
    friends.forEach((f) => contacts.set(f.id, f));

    return [...contacts.values()]
      .filter((p) => p.id !== myId)
      .map((person): Dialog => {
        const thread = messages.filter(
          (m) =>
            (m.sender_id === person.id &&
              m.recipient_id === myId &&
              !m.hidden_by_recipient) ||
            (m.sender_id === myId &&
              m.recipient_id === person.id &&
              !m.hidden_by_sender),
        );
        return {
          person: {
            ...person,
            online: onlineIds.has(person.id),
          } satisfies ChatPeer,
          messages: thread,
          last: thread.at(-1) ?? null,
          unread: thread.filter((m) => m.recipient_id === myId && !m.read_at)
            .length,
          typing: typingIds.has(person.id),
          ...flags(person.id, thread),
        };
      })
      .concat(
        Object.values(clubs).map((club): Dialog => {
          const peer = `club:${club.id}`;
          const thread = clubMessages
            .filter((m) => m.community_id === club.id)
            .map((m): MessageRow => {
              const cached = clubRows.current.get(m);
              if (cached) return cached;
              const row: MessageRow = {
                id: m.id,
                text: m.text,
                created_at: m.created_at,
                read_at: m.read_at,
                community_id: m.community_id,
                pending: m.pending,
                failed: m.failed,
                sender_id: m.from_community ? peer : myId,
                recipient_id: m.from_community ? myId : peer,
              };
              clubRows.current.set(m, row);
              return row;
            });
          return {
            person: {
              id: peer,
              name: club.name,
              color: club.color,
              avatar: club.avatar,
              online: false,
              isCommunity: true,
              communityId: club.id,
            },
            messages: thread,
            last: thread.at(-1) ?? null,
            unread: thread.filter((m) => m.recipient_id === myId && !m.read_at)
              .length,
            typing: false,
            isCommunity: true,
            ...flags(peer, thread),
          };
        }),
      )
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        if (a.pinned && b.pinned) {
          return (settings[b.person.id]?.pinnedAt ?? "").localeCompare(
            settings[a.person.id]?.pinnedAt ?? "",
          );
        }
        if (a.last && b.last) return byTime(b.last, a.last);
        if (a.last || b.last) return a.last ? -1 : 1;
        return Number(b.person.online) - Number(a.person.online);
      })
      .filter(
        (d) => d.messages.length > 0 || !deletedPeers.includes(d.person.id),
      );
  }, [
    people,
    friends,
    messages,
    myId,
    onlineIds,
    typingIds,
    clubs,
    clubMessages,
    settings,
    deletedPeers,
  ]);

  const unreadTotal = dialogs.reduce(
    (sum, d) => sum + (d.unread || (d.markedUnread ? 1 : 0)),
    0,
  );

  const value = useMemo<ChatValue>(
    () => ({
      status,
      error,
      myId,
      dialogs,
      fileUrls,
      unreadTotal,
      onlineIds,
      activePeerId,
      setActivePeerId,
      openChat,
      openCommunityChat,
      sendMessage,
      retryMessage,
      deleteMessage,
      markRead,
      markListened,
      clearChat,
      deleteChat,
      sendTyping,
      retry,
      togglePin,
      toggleArchive,
      markUnread,
      clearMarkedUnread,
    }),
    [
      status,
      error,
      myId,
      dialogs,
      fileUrls,
      unreadTotal,
      onlineIds,
      activePeerId,
      openChat,
      openCommunityChat,
      sendMessage,
      retryMessage,
      deleteMessage,
      markRead,
      markListened,
      clearChat,
      deleteChat,
      sendTyping,
      retry,
      togglePin,
      toggleArchive,
      markUnread,
      clearMarkedUnread,
    ],
  );

  const actions = useMemo<ChatActions>(
    () => ({ openChat, openCommunityChat, sendMessage }),
    [openChat, openCommunityChat, sendMessage],
  );

  return (
    <ChatContext.Provider value={value}>
      <ChatActionsContext.Provider value={actions}>
        <ChatUnreadContext.Provider value={unreadTotal}>
          <OnlineContext.Provider value={onlineIds}>
            {children}
          </OnlineContext.Provider>
        </ChatUnreadContext.Provider>
      </ChatActionsContext.Provider>
    </ChatContext.Provider>
  );
}

export const useChatUnread = () => useContext(ChatUnreadContext);

export const useOnlineIds = () => useContext(OnlineContext);

export function useChatActions() {
  const context = useContext(ChatActionsContext);
  if (!context)
    throw new Error("useChatActions нужно вызывать внутри <ChatProvider>");
  return context;
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) throw new Error("useChat нужно вызывать внутри <ChatProvider>");
  return context;
}
