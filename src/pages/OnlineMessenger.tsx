import { useEffect, useMemo, useRef, useState } from "react";
import Messenger, { type MessageState, type ViewDialog, type ViewMessage } from "./Messenger";
import type { MessageRow } from "../types";
import { messageSummary, useChat } from "../context/ChatContext";
import { formatDay, formatDialogTime, formatTime } from "../utils";
import { usePageVisible } from "../hooks";
import { useBlocks } from "../context/BlocksContext";

const DAY_MS = 24 * 60 * 60 * 1000;

const messageState = (m: MessageRow, out: boolean): MessageState | undefined => {
  if (m.failed) return "failed";
  if (m.pending) return "pending";
  if (!out) return undefined;
  return m.read_at ? "read" : "sent";
};

export default function OnlineMessenger() {
  const {
    status,
    error,
    myId,
    dialogs,
    fileUrls,
    activePeerId,
    setActivePeerId,
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
  } = useChat();
  const { isBlocked, hasBlockedMe, block, unblock, refreshBlockedMe } = useBlocks();
  const chatActions = useMemo(() => {
    const peer = (id: string) => dialogs.find((d) => d.person.id === id)?.person;
    const asPerson = (id: string) => {
      const p = peer(id);
      return { id, firstName: p?.firstName ?? p?.name ?? "" };
    };
    return {
      togglePin,
      toggleArchive,
      markUnread,
      block: (id: string) => void block(asPerson(id)),
      unblock: (id: string) => void unblock(asPerson(id)),
      clearHistory: (id: string) => void clearChat(id),
      deleteChat: (id: string) => void deleteChat(id),
    };
  }, [togglePin, toggleArchive, markUnread, block, unblock, dialogs, clearChat, deleteChat]);

  const cache = useRef(new WeakMap<MessageRow, { url: string | null; view: ViewMessage<MessageRow> }>());

  const view = useMemo(
    () =>
      dialogs.map((d): ViewDialog<MessageRow> => ({
        id: d.person.id,
        person: d.person,
        textOnly: !!d.isCommunity,
        pinned: d.pinned,
        archived: d.archived,
        markedUnread: d.markedUnread,
        blocked: d.isCommunity ? undefined : isBlocked(d.person.id) ? "byMe" : hasBlockedMe(d.person.id) ? "me" : undefined,
        unread: d.unread,
        typing: d.typing,
        time: formatDialogTime(d.last?.created_at),
        messages: d.messages.map((m) => {
          const out = m.sender_id === myId;
          const url = m.localUrl ?? (m.attachment_path ? fileUrls[m.attachment_path] : null) ?? null;
          const cached = cache.current.get(m);
          if (cached && cached.url === url) return cached.view;
          const message: ViewMessage<MessageRow> = {
            id: m.id,
            key: m.client_key ?? String(m.id),
            out,
            text: m.text,
            summary: messageSummary(m),
            attachment: m.attachment_type
              ? {
                  type: m.attachment_type,
                  name: m.attachment_name,
                  meta: m.attachment_meta,
                  url,
                }
              : null,
            shared: m.shared_type && m.shared_id ? { type: m.shared_type, id: m.shared_id } : null,
            time: formatTime(m.created_at),
            day: formatDay(m.created_at),
            state: messageState(m, out),
            listened: m.attachment_type === "voice" ? !!m.listened_at : undefined,
            deletable: !d.isCommunity,
            canDeleteForAll:
              out &&
              !String(m.id).startsWith("tmp-") &&
              Date.now() - new Date(m.created_at).getTime() < DAY_MS,
            raw: m,
          };
          cache.current.set(m, { url, view: message });
          return message;
        }),
      })),
    [dialogs, myId, fileUrls, isBlocked, hasBlockedMe],
  );

  const active = view.find((d) => d.id === activePeerId) ?? view[0] ?? null;
  const [startInChat] = useState(() => !!activePeerId);

  useEffect(() => {
    if (!activePeerId && view[0]) setActivePeerId(view[0].id);
  }, [activePeerId, view, setActivePeerId]);

  useEffect(() => {
    if (active?.id) refreshBlockedMe();
  }, [active?.id, refreshBlockedMe]);

  const pageVisible = usePageVisible();
  useEffect(() => {
    if (pageVisible && active?.unread) markRead(active.id);
  }, [pageVisible, active?.id, active?.unread, markRead]);

  if (status === "connecting") {
    return (
      <div className="card chat-status" role="status">
        <div className="chat-status__spinner" />
        Подключаемся к чату…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="card chat-status" role="alert">
        <div className="chat-status__title">Не удалось подключиться к чату</div>
        <p className="chat-status__text">{error}</p>
        <button className="btn" onClick={retry}>
          Повторить
        </button>
      </div>
    );
  }

  return (
    <Messenger
      dialogs={view}
      activeId={active?.id}
      onOpen={(id) => {
        setActivePeerId(id);
        clearMarkedUnread(id);
      }}
      onSend={(id, text, file, voice) => {
        clearMarkedUnread(id);
        sendMessage(id, { text, file, voice });
      }}
      chatActions={chatActions}
      onListened={(m) => markListened(m.id)}
      onTyping={sendTyping}
      onRetry={(m) => retryMessage(m.raw)}
      onDelete={(m, forAll) => deleteMessage(m.raw, { forAll })}
      startInChat={startInChat}
      emptyText="Здесь появятся ваши друзья и переписки. Найдите знакомых в разделе «Друзья»"
    />
  );
}
