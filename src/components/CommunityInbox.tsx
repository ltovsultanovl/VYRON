import { useCallback, useEffect, useMemo, useState } from "react";
import Messenger, {
  type MessageState,
  type ViewDialog,
} from "../pages/Messenger";
import type { Community, CommunityMessageRow, Person } from "../types";
import { supabase } from "../lib/supabase";
import {
  explainError,
  fetchCommunityInbox,
  fetchPeople,
  markCommunityMessagesRead,
  sendCommunityMessage,
} from "../api";
import { useSnackbar } from "./Snackbar";
import { usePageVisible } from "../hooks";
import { formatDay, formatDialogTime, formatTime } from "../utils";

const byTime = (a: { created_at: string }, b: { created_at: string }) =>
  new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

export default function CommunityInbox({
  community,
}: {
  community: Community;
}) {
  const showSnackbar = useSnackbar();
  const pageVisible = usePageVisible();
  const [rows, setRows] = useState<CommunityMessageRow[]>([]);
  const [people, setPeople] = useState<Record<string, Person>>({});
  const [state, setState] = useState({ loading: true, error: "" });
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ loading: true, error: "" });
    try {
      const data = await fetchCommunityInbox(community.id);
      setRows(data);
      setPeople(
        Object.fromEntries(
          data.flatMap((r) => (r.user ? [[r.user.id, r.user]] : [])),
        ),
      );
      setState({ loading: false, error: "" });
    } catch (e) {
      setState({ loading: false, error: explainError(e) });
    }
  }, [community.id]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`club-inbox-${community.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_messages",
          filter: `community_id=eq.${community.id}`,
        },
        (payload) => {
          const row = payload.new as CommunityMessageRow;
          if (!row?.id) return;
          setRows((list) =>
            [...list.filter((m) => m.id !== row.id), row].sort(byTime),
          );
          fetchPeople([row.user_id]).then((list) =>
            setPeople((map) => ({
              ...map,
              ...Object.fromEntries(list.map((p) => [p.id, p])),
            })),
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [community.id, load]);

  const dialogs = useMemo(() => {
    const byUser = new Map<string, CommunityMessageRow[]>();
    rows.forEach((r) =>
      byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]),
    );
    return [...byUser.entries()]
      .filter(([userId]) => people[userId])
      .map(
        ([userId, thread]): ViewDialog<CommunityMessageRow> & {
          last: CommunityMessageRow;
        } => ({
          id: userId,
          person: { ...people[userId], online: false },
          textOnly: true,
          unread: thread.filter((m) => !m.from_community && !m.read_at).length,
          time: formatDialogTime(thread.at(-1)?.created_at),
          last: thread.at(-1)!,
          messages: thread.map((m) => ({
            id: m.id,
            out: m.from_community,
            text: m.text,
            time: formatTime(m.created_at),
            day: formatDay(m.created_at),
            state: (m.failed
              ? "failed"
              : m.pending
                ? "pending"
                : m.from_community
                  ? m.read_at
                    ? "read"
                    : "sent"
                  : undefined) satisfies MessageState | undefined,
            deletable: false,
            raw: m,
          })),
        }),
      )
      .sort((a, b) => byTime(b.last, a.last));
  }, [rows, people]);

  const active = dialogs.find((d) => d.id === activeId) ?? dialogs[0];

  useEffect(() => {
    if (!pageVisible || !active?.unread) return;
    const now = new Date().toISOString();
    setRows((list) =>
      list.map((m) =>
        m.user_id === active.id && !m.from_community && !m.read_at
          ? { ...m, read_at: now }
          : m,
      ),
    );
    markCommunityMessagesRead({
      communityId: community.id,
      userId: active.id,
      fromCommunity: false,
    }).catch(() => {});
  }, [pageVisible, active?.id, active?.unread, community.id]);

  const send = async (userId: string, text: string) => {
    const tempId = `tmp-${crypto.randomUUID()}`;
    setRows((list): CommunityMessageRow[] => [
      ...list,
      {
        id: tempId,
        community_id: community.id,
        user_id: userId,
        from_community: true,
        text,
        created_at: new Date().toISOString(),
        read_at: null,
        pending: true,
      },
    ]);
    try {
      const row = await sendCommunityMessage({
        communityId: community.id,
        userId,
        fromCommunity: true,
        text,
      });
      setRows((list) =>
        [...list.filter((m) => m.id !== tempId && m.id !== row.id), row].sort(
          byTime,
        ),
      );
    } catch (e) {
      setRows((list) =>
        list.map((m) =>
          m.id === tempId ? { ...m, pending: false, failed: true } : m,
        ),
      );
      showSnackbar(`Не отправлено: ${explainError(e)}`, "error");
    }
  };

  if (state.loading && !rows.length) {
    return (
      <div className="list-state" role="status">
        <div className="chat-status__spinner" />
      </div>
    );
  }
  if (state.error) {
    return (
      <div className="list-state" role="alert">
        {state.error}
        <button className="btn" onClick={load}>
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className="community-inbox">
      <Messenger
        dialogs={dialogs}
        activeId={active?.id}
        onOpen={setActiveId}
        onSend={(userId, text) => send(userId, text)}
        onRetry={(m) => {
          setRows((list) => list.filter((r) => r.id !== m.raw.id));
          send(m.raw.user_id, m.raw.text);
        }}
        emptyText={
          community.messagesEnabled
            ? "Сообщений пока нет. Когда кто-то напишет сообществу, переписка появится здесь"
            : "Сообщения сообщества выключены — включите их в разделе «Основное»"
        }
      />
    </div>
  );
}
