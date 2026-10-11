import { memo, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import type { AttachmentType, ChatPeer, Shared, Track, VoiceMeta } from "../types";
import { usePlayer } from "../context/PlayerContext";
import { createPortal } from "react-dom";
import Avatar from "../components/Avatar";
import EmojiPicker from "../components/EmojiPicker";
import BlockModal from "../components/BlockModal";
import ConfirmModal from "../components/ConfirmModal";
import { lastSeen } from "../utils";
import SharedCard from "../components/SharedCard";
import Modal from "../components/Modal";
import { useSnackbar } from "../components/Snackbar";
import {
  useDropdown,
  useFileDrop,
  useFilePicker,
  useScrollLock,
  useVoiceRecorder,
  voiceRecordingSupported,
} from "../hooks";
import { MAX_FILE_MB, attachmentKind } from "../api";
import {
  ArchiveIcon,
  AttachIcon,
  BlockIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronUpIcon,
  LockIcon,
  PinIcon,
  UnreadIcon,
  CamcorderIcon,
  CloseIcon,
  CopyIcon,
  MusicIcon,
  PauseIcon,
  PhotoIcon,
  PlayIcon,
  TrashIcon,
  MicIcon,
  MoreIcon,
  SearchIcon,
  SendIcon,
  WriteIcon,
} from "../components/Icons";

type Folder = "Все" | "Непрочитанные" | "Архив";

function Highlighted({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let from = 0;
  for (let i = lower.indexOf(q); i !== -1; i = lower.indexOf(q, i + q.length)) {
    parts.push(text.slice(from, i), <mark key={i} className="msg__mark">{text.slice(i, i + q.length)}</mark>);
    from = i + q.length;
  }
  parts.push(text.slice(from));
  return <>{parts}</>;
}

const matchesQuery = (text: string | undefined, q: string) => !!text && !!q && text.toLowerCase().includes(q.toLowerCase());

export type MessageState = "pending" | "sent" | "read" | "failed";

export interface ChatAttachment {
  type: AttachmentType;
  name?: string | null;
  meta?: VoiceMeta | null;
  url: string | null;
}

export interface ViewMessage<R = unknown> {
  id: number | string;
  out: boolean;
  text: string;
  summary?: string;
  attachment?: ChatAttachment | null;
  shared?: Shared | null;
  time: string;
  day: string;
  state?: MessageState;
  deletable?: boolean;
  canDeleteForAll?: boolean;
  listened?: boolean;
  raw: R;
}

export interface ViewDialog<R = unknown> {
  id: string;
  person: ChatPeer;
  textOnly?: boolean;
  pinned?: boolean;
  archived?: boolean;
  markedUnread?: boolean;
  blocked?: "byMe" | "me";
  unread: number;
  typing?: boolean;
  time: string;
  messages: ViewMessage<R>[];
}

const STATUS_LABELS: Record<MessageState, string> = {
  pending: "Отправляется",
  sent: "Отправлено",
  read: "Прочитано",
  failed: "Не отправлено",
};

function MessageStatus({ state }: { state?: MessageState }) {
  if (!state || !STATUS_LABELS[state]) return null;
  return (
    <span
      className={`msg-status msg-status--${state}`}
      title={STATUS_LABELS[state]}
      aria-label={STATUS_LABELS[state]}
    >
      {state === "pending" ? (
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <circle
            cx="8"
            cy="8"
            r="6.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M8 4.8V8l2.2 1.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      ) : state === "failed" ? (
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path
            d="M8 4.5v4.2M8 11.2v.3"
            stroke="#fff"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 20 14" width="18" height="13" aria-hidden="true">
          {state === "read" ? (
            <>
              <path d="M1.5 7.5 5 11l7-7.5" />
              <path d="M8.6 10.2 9.4 11l7-7.5" />
            </>
          ) : (
            <path d="M4.5 7.5 8 11l7-7.5" />
          )}
        </svg>
      )}
    </span>
  );
}

const personHref = (person: ChatPeer) =>
  person.isCommunity ? `#club/${person.communityId}` : `#user/${person.id}`;

function MessageActions({ message, onDeleteClick }: { message: ViewMessage; onDeleteClick: (() => void) | null }) {
  const showSnackbar = useSnackbar();
  const menu = useDropdown();
  const [up, setUp] = useState(true);

  const toggle = (e: MouseEvent<HTMLButtonElement>) => {
    setUp(e.currentTarget.getBoundingClientRect().top > 220);
    menu.toggle();
  };

  const copy = async () => {
    menu.close();
    try {
      await navigator.clipboard.writeText(message.text);
      showSnackbar("Текст скопирован");
    } catch {
      showSnackbar("Не удалось скопировать", "error");
    }
  };

  return (
    <div
      className={`msg-actions ${menu.open ? "msg-actions--open" : ""}`}
      ref={menu.ref}
    >
      <button
        type="button"
        className="msg-actions__btn"
        title="Действия"
        aria-label="Действия с сообщением"
        onClick={toggle}
      >
        <MoreIcon size={18} />
      </button>
      {menu.open && (
        <div
          className={`dropdown msg-actions__menu ${up ? "msg-actions__menu--up" : ""} ${message.out ? "" : "msg-actions__menu--left"}`}
        >
          {message.text && (
            <button className="dropdown__item" onClick={copy}>
              <CopyIcon /> Копировать текст
            </button>
          )}
          {onDeleteClick && (
            <button
              className="dropdown__item dropdown__item--danger"
              onClick={() => {
                menu.close();
                onDeleteClick();
              }}
            >
              <TrashIcon /> Удалить
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DeleteMessageModal({
  canDeleteForAll,
  onConfirm,
  onClose,
}: {
  canDeleteForAll?: boolean;
  onConfirm: (forAll: boolean) => void;
  onClose: () => void;
}) {
  const [forAll, setForAll] = useState(false);
  return (
    <Modal
      title="Удалить сообщение?"
      onClose={onClose}
      width={420}
      footer={
        <>
          <button className="btn btn--secondary" onClick={onClose}>
            Отмена
          </button>
          <button
            className="btn btn--danger"
            onClick={() => onConfirm(forAll)}
            autoFocus
          >
            Удалить
          </button>
        </>
      }
    >
      <p className="modal__text">
        {forAll
          ? "Сообщение удалится у вас и у собеседника."
          : "Сообщение удалится только у вас — у собеседника оно останется."}
      </p>
      {canDeleteForAll && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={forAll}
            onChange={(e) => setForAll(e.target.checked)}
          />
          <span className="checkbox__box" aria-hidden="true" />
          Удалить для всех
        </label>
      )}
    </Modal>
  );
}

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="lightbox" onClick={onClose} role="dialog" aria-modal="true">
      <img src={url} alt="" />
      <button className="viewer__close" title="Закрыть">
        <CloseIcon size={28} />
      </button>
    </div>,
    document.body,
  );
}

const formatDuration = (sec: number) => {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const VOICE_RATES = [1, 1.5, 2];
let voiceRate = (() => {
  try {
    const saved = Number(localStorage.getItem("voiceRate"));
    return VOICE_RATES.includes(saved) ? saved : 1;
  } catch {
    return 1;
  }
})();
let playingVoice: HTMLAudioElement | null = null;

function VoicePlayer({
  url,
  meta,
  pending,
  out = false,
  listened = true,
  onListened,
}: {
  url: string | null;
  meta?: VoiceMeta | null;
  pending?: boolean;
  out?: boolean;
  listened?: boolean;
  onListened?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [rate, setRate] = useState(voiceRate);
  const [failed, setFailed] = useState<false | "load" | "format">(false);
  const playedRef = useRef<HTMLDivElement>(null);
  const duration = meta?.duration || 0;
  const bars = useMemo(() => {
    const raw: number[] = meta?.waveform?.length ? meta.waveform : Array(48).fill(20);
    return raw.map((h, i) => ((raw[i - 1] ?? h) + 2 * h + (raw[i + 1] ?? h)) / 4);
  }, [meta?.waveform]);

  const paint = useCallback(
    (seconds: number) => {
      const el = playedRef.current;
      if (el) el.style.clipPath = `inset(0 ${100 - (duration ? Math.min(seconds / duration, 1) : 0) * 100}% 0 0)`;
    },
    [duration],
  );
  useEffect(() => {
    if (!playing) return;
    let frame = requestAnimationFrame(function tick() {
      const audio = audioRef.current;
      if (audio) paint(audio.currentTime);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, paint]);
  useEffect(() => {
    if (!playing) paint(time);
  }, [playing, time, paint]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.playbackRate = voiceRate;
      audio.play().catch((e: DOMException) => setFailed(e.name === "NotSupportedError" ? "format" : "load"));
    } else audio.pause();
  };

  const seekAt = (clientX: number, wave: HTMLElement) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = wave.getBoundingClientRect();
    const next = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1) * duration;
    audio.currentTime = next;
    setTime(next);
    paint(next);
  };

  const changeRate = () => {
    voiceRate = VOICE_RATES[(VOICE_RATES.indexOf(voiceRate) + 1) % VOICE_RATES.length];
    try {
      localStorage.setItem("voiceRate", String(voiceRate));
    } catch {
    }
    setRate(voiceRate);
    if (audioRef.current) audioRef.current.playbackRate = voiceRate;
  };

  const playNext = () => {
    const root = rootRef.current;
    const all = [...(root?.closest(".chat__body")?.querySelectorAll<HTMLElement>(".voice") ?? [])];
    const next = all.slice(all.indexOf(root!) + 1).find((v) => v.dataset.autonext === "1");
    next?.querySelector<HTMLButtonElement>(".voice__play")?.click();
  };

  const unlistened = !listened && !pending;
  return (
    <div className={`voice ${unlistened ? "voice--new" : ""}`} ref={rootRef} data-autonext={!out && unlistened ? "1" : undefined}>
      <button
        type="button"
        className="voice__play"
        onClick={toggle}
        disabled={!url || pending || !!failed}
        aria-label={playing ? "Пауза" : "Слушать"}
      >
        {pending ? <div className="chat-status__spinner" /> : playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
      </button>
      <div className="voice__body">
        <div
          className="voice__wave"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            seekAt(e.clientX, e.currentTarget);
          }}
          onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && seekAt(e.clientX, e.currentTarget)}
        >
          <div className="voice__bars">
            {bars.map((h, i) => (
              <span key={i} style={{ height: `${Math.max(14, h)}%` }} />
            ))}
          </div>
          <div className="voice__bars voice__bars--played" ref={playedRef} style={{ clipPath: "inset(0 100% 0 0)" }}>
            {bars.map((h, i) => (
              <span key={i} style={{ height: `${Math.max(14, h)}%` }} />
            ))}
          </div>
        </div>
        <span className="voice__meta">
          <span className="voice__time">
            {failed === "format"
              ? "Старый формат — не играет на этом устройстве"
              : failed
                ? "Не удалось загрузить"
                : formatDuration(playing || time ? time : Math.max(duration, duration > 0 ? 1 : 0))}
          </span>
          {unlistened && <span className="voice__dot" title={out ? "Ещё не прослушано" : "Не прослушано"} />}
          {(playing || time > 0) && (
            <button type="button" className="voice__rate" onClick={changeRate} title="Скорость воспроизведения">
              {rate}x
            </button>
          )}
        </span>
      </div>
      {url && (
        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          onPlay={(e) => {
            const audio = e.currentTarget;
            if (playingVoice && playingVoice !== audio) playingVoice.pause();
            playingVoice = audio;
            audio.playbackRate = voiceRate;
            setRate(voiceRate);
            setPlaying(true);
            if (!out && !listened) onListened?.();
          }}
          onPause={() => setPlaying(false)}
          onEnded={(e) => {
            setPlaying(false);
            setTime(0);
            if (playingVoice === e.currentTarget) playingVoice = null;
            if (!out) playNext();
          }}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onError={(e) => setFailed(e.currentTarget.error?.code === 4 ? "format" : "load")}
        />
      )}
    </div>
  );
}

const parseTrackName = (name?: string | null) => {
  const base = (name || "Аудиозапись").replace(/\.[a-z0-9]{2,4}$/i, "").replace(/_/g, " ").trim();
  const [artist, ...rest] = base.split(/\s+[-–—]\s+/);
  return rest.length ? { artist: artist.trim(), title: rest.join(" – ").trim() } : { artist: "", title: base };
};

function AudioAttachment({ attachment, pending, trackId }: { attachment: ChatAttachment; pending?: boolean; trackId: number }) {
  const player = usePlayer();
  const { url } = attachment;
  const { artist, title } = parseTrackName(attachment.name);
  const [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!url) return;
    const probe = new Audio();
    probe.preload = "metadata";
    probe.onloadedmetadata = () => Number.isFinite(probe.duration) && setDuration(probe.duration);
    probe.onerror = () => setFailed(true);
    probe.src = url;
    return () => {
      probe.onloadedmetadata = null;
      probe.onerror = null;
      probe.removeAttribute("src");
    };
  }, [url]);

  const track = useMemo<Track | null>(
    () =>
      url
        ? { id: trackId, uploaderId: "", artist, title, duration: Math.round(duration), url, path: "", createdAt: "" }
        : null,
    [url, trackId, artist, title, duration],
  );
  const current = !!track && player.isCurrent(track);
  const playingNow = current && player.playing;

  return (
    <div className={`msg__audio ${current ? "msg__audio--current" : ""}`}>
      <button
        type="button"
        className="msg__audio-play"
        onClick={() => track && player.toggle(track, [track], 0)}
        disabled={!track || pending || failed}
        aria-label={playingNow ? "Пауза" : "Слушать"}
      >
        {pending ? <div className="chat-status__spinner" /> : playingNow ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
      </button>
      <span className="msg__audio-body">
        <span className="msg__audio-title">{title}</span>
        <span className="msg__audio-artist">{failed ? "Не удалось загрузить" : artist || "Аудиозапись"}</span>
      </span>
      {duration > 0 && <span className="msg__audio-duration">{formatDuration(duration)}</span>}
    </div>
  );
}

function Attachment({
  attachment,
  pending,
  onOpen,
  voice,
  trackId = -1,
}: {
  attachment: ChatAttachment;
  pending?: boolean;
  onOpen: (url: string) => void;
  trackId?: number;
  voice?: { out: boolean; listened: boolean; onListened: () => void };
}) {
  const { type, url } = attachment;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (type === "audio")
    return <AudioAttachment attachment={attachment} pending={pending} trackId={trackId} />;
  if (type === "voice")
    return <VoicePlayer url={url} meta={attachment.meta} pending={pending} {...voice} />;
  const failed = url && url === failedUrl;

  return (
    <div className={`msg__media ${pending ? "msg__media--pending" : ""}`}>
      {!url || failed ? (
        <div className="msg__media-placeholder">
          {failed ? (
            <span className="msg__media-error">
              {type === "video" ? "🎬 Видео" : "📷 Фото"} не удалось загрузить
            </span>
          ) : (
            <div className="chat-status__spinner" />
          )}
        </div>
      ) : type === "video" ? (
        <video
          src={url}
          controls
          preload="metadata"
          playsInline
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <img
          src={url}
          alt=""
          onClick={() => onOpen(url)}
          loading="lazy"
          onError={() => setFailedUrl(url)}
        />
      )}
      {pending && url && (
        <div className="msg__media-overlay">
          <div className="chat-status__spinner" />
        </div>
      )}
    </div>
  );
}

function TypingDots() {
  return (
    <span className="typing-dots" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

const Typing = ({ label = "печатает" }: { label?: string }) => (
  <span className="typing">
    {label}
    <TypingDots />
  </span>
);

const MessageItem = memo(function MessageItem({
  message: m,
  day,
  deletable,
  onZoom,
  onAskDelete,
  onRetry,
  onListened,
  highlight = "",
  current = false,
}: {
  message: ViewMessage<unknown>;
  onListened?: (message: ViewMessage<unknown>) => void;
  highlight?: string;
  current?: boolean;
  day: string | null;
  deletable: boolean;
  onZoom: (url: string) => void;
  onAskDelete: (message: ViewMessage<unknown>) => void;
  onRetry: (message: ViewMessage<unknown>) => void;
}) {
  const visual = m.attachment?.type === "image" ? "image" : m.attachment?.type === "video" ? "video" : null;
  return (
    <div className={`chat__item ${current ? "chat__item--current" : ""}`} data-msg-id={m.id}>
      {day && <div className="chat__day">{day}</div>}
      <div className={`msg-line ${m.out ? "msg-line--out" : ""}`}>
        <div
          className={`msg ${m.out ? "msg--out" : ""} ${m.state === "failed" ? "msg--failed" : ""} ${m.attachment || m.shared ? "msg--with-media" : ""} ${visual ? `msg--photo msg--${visual}` : ""} ${visual && !m.text && !m.shared ? "msg--media-only" : ""}`}
        >
          {m.attachment && (
            <Attachment
              attachment={m.attachment}
              pending={m.state === "pending"}
              onOpen={onZoom}
              voice={{ out: m.out, listened: m.listened !== false, onListened: () => onListened?.(m) }}
              trackId={-Math.abs(Number(m.id) || 1)}
            />
          )}
          {m.text && (
            <span className="msg__text">
              <Highlighted text={m.text} query={highlight} />
            </span>
          )}
          {m.shared && <SharedCard shared={m.shared} />}
          <span className="msg__time">
            {m.time}
            {m.out && <MessageStatus state={m.state} />}
          </span>
        </div>
        {m.state !== "pending" && (m.text || deletable) && (
          <MessageActions message={m} onDeleteClick={deletable ? () => onAskDelete(m) : null} />
        )}
      </div>
      {m.state === "failed" && (
        <button className="msg__retry" onClick={() => onRetry(m)}>
          Не отправлено. Повторить
        </button>
      )}
    </div>
  );
});

interface ChatMenuActions {
  togglePin: (id: string) => void;
  toggleArchive: (id: string) => void;
  markUnread: (id: string) => void;
  block: (id: string) => void;
  unblock: (id: string) => void;
  clearHistory?: (id: string) => void;
  deleteChat?: (id: string) => void;
}

function ChatMenu({
  dialog,
  actions,
  onLeave,
  inList = false,
}: {
  dialog: ViewDialog<unknown>;
  actions?: ChatMenuActions;
  onLeave?: () => void;
  inList?: boolean;
}) {
  const menu = useDropdown();
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [place, setPlace] = useState<React.CSSProperties>();
  const { open, close } = menu;
  useEffect(() => {
    if (!inList || !open) return;
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [inList, open, close]);
  if (!actions) return null;
  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (inList && !menu.open) {
      const r = e.currentTarget.getBoundingClientRect();
      const below = r.bottom + 220 < window.innerHeight;
      setPlace({
        position: "fixed",
        right: window.innerWidth - r.right,
        ...(below ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }),
      });
    }
    menu.toggle();
  };
  const item = (label: string, Icon: typeof PinIcon, run: () => void, danger = false) => (
    <button
      className={`dropdown__item ${danger ? "dropdown__item--danger" : ""}`}
      onClick={() => {
        menu.close();
        run();
      }}
    >
      <Icon size={20} /> {label}
    </button>
  );
  return (
    <div className={`chat-menu ${inList ? "chat-menu--list" : ""} ${menu.open ? "chat-menu--open" : ""}`} ref={menu.ref}>
      <button className="icon-btn" title="Действия с чатом" aria-label="Действия с чатом" onClick={toggle}>
        <MoreIcon size={inList ? 20 : 22} />
      </button>
      {menu.open && (
        <div className="dropdown dropdown--right chat-menu__dropdown" style={inList ? place : undefined}>
          {actions && (
            <>
              {!dialog.archived &&
                item(dialog.pinned ? "Открепить чат" : "Закрепить чат", PinIcon, () => actions.togglePin(dialog.id))}
              {!dialog.markedUnread &&
                dialog.unread === 0 &&
                item("Отметить непрочитанным", UnreadIcon, () => {
                  actions.markUnread(dialog.id);
                  onLeave?.();
                })}
              {item(dialog.archived ? "Вернуть из архива" : "Архивировать чат", ArchiveIcon, () => {
                actions.toggleArchive(dialog.id);
                if (!dialog.archived) onLeave?.();
              })}
              {!dialog.person.isCommunity &&
                actions.clearHistory &&
                dialog.messages.length > 0 &&
                item("Очистить историю", TrashIcon, () => setConfirmClear(true), true)}
              {!dialog.person.isCommunity &&
                actions.deleteChat &&
                item("Удалить чат", TrashIcon, () => setConfirmDelete(true), true)}
              {!dialog.person.isCommunity &&
                (dialog.blocked === "byMe"
                  ? item("Разблокировать", BlockIcon, () => actions.unblock(dialog.id))
                  : item("Заблокировать", BlockIcon, () => setConfirmBlock(true), true))}
            </>
          )}
        </div>
      )}
      {confirmClear && (
        <ConfirmModal
          title="Очистить историю?"
          text="Все сообщения в этом чате будут удалены только у вас — у собеседника переписка останется. Отменить это действие нельзя."
          confirmLabel="Очистить"
          onClose={() => setConfirmClear(false)}
          onConfirm={() => {
            setConfirmClear(false);
            actions.clearHistory?.(dialog.id);
          }}
        />
      )}
      {confirmDelete && (
        <ConfirmModal
          title="Удалить чат?"
          text="Переписка будет удалена только у вас, а чат пропадёт из списка — у собеседника всё останется. Если он напишет снова, чат вернётся."
          confirmLabel="Удалить"
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            actions.deleteChat?.(dialog.id);
            onLeave?.();
          }}
        />
      )}
      {confirmBlock && (
        <BlockModal
          person={dialog.person}
          onClose={() => setConfirmBlock(false)}
          onConfirm={() => {
            setConfirmBlock(false);
            actions.block(dialog.id);
          }}
        />
      )}
    </div>
  );
}

export default function Messenger<R>({
  dialogs,
  activeId,
  onOpen,
  onSend,
  onTyping,
  onRetry,
  onListened,
  onDelete,
  emptyText = "Здесь пока нет чатов",
  startInChat = false,
  chatActions,
}: {
  dialogs: ViewDialog<R>[];
  activeId: string | undefined;
  onOpen: (id: string) => void;
  onSend: (id: string, text: string, file?: File | null, voice?: VoiceMeta | null) => void;
  onTyping?: (id: string) => void;
  onRetry?: (message: ViewMessage<R>) => void;
  onListened?: (message: ViewMessage<R>) => void;
  onDelete?: (message: ViewMessage<R>, forAll: boolean) => void;
  emptyText?: string;
  startInChat?: boolean;
  chatActions?: ChatMenuActions;
}) {
  const [chatOpen, setChatOpen] = useState(startInChat);
  const onRetryRef = useRef(onRetry);
  useEffect(() => {
    onRetryRef.current = onRetry;
  });
  const retry = useCallback((m: ViewMessage<unknown>) => onRetryRef.current?.(m as ViewMessage<R>), []);
  const onListenedRef = useRef(onListened);
  useEffect(() => {
    onListenedRef.current = onListened;
  });
  const listenedCb = useCallback((m: ViewMessage<unknown>) => onListenedRef.current?.(m as ViewMessage<R>), []);
  const askDelete = useCallback((m: ViewMessage<unknown>) => setToDelete(m as ViewMessage<R>), []);
  const [toDelete, setToDelete] = useState<ViewMessage<R> | null>(null);
  const [text, setText] = useState("");
  const [folder, setFolder] = useState<Folder>("Все");
  const [search, setSearch] = useState<{ q: string; currentId: number | string | null } | null>(null);
  const [query, setQuery] = useState("");
  const [attachment, setAttachment] = useState<{ file: File; url: string; type: AttachmentType } | null>(null);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const showSnackbar = useSnackbar();
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const active = dialogs.find((d) => d.id === activeId) ?? dialogs[0] ?? null;

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [active?.messages.length, active?.id, active?.typing]);

  const archivedCount = dialogs.filter((d) => d.archived).length;
  const folders: Folder[] = archivedCount ? ["Все", "Непрочитанные", "Архив"] : ["Все", "Непрочитанные"];
  const inFolder = (d: ViewDialog<R>) =>
    folder === "Архив"
      ? d.archived
      : !d.archived && (folder !== "Непрочитанные" || d.unread > 0 || !!d.markedUnread);
  const q = query.trim();
  const visible = dialogs.filter((d) => inFolder(d) && d.person.name.toLowerCase().includes(q.toLowerCase()));
  const messageHits =
    q.length >= 2
      ? dialogs
          .flatMap((d) => d.messages.filter((m) => matchesQuery(m.text, q)).map((m) => ({ dialog: d, message: m })))
          .reverse()
          .slice(0, 50)
      : [];

  const chatMatches = search?.q ? (active?.messages ?? []).filter((m) => matchesQuery(m.text, search.q)) : [];
  const currentIndex = chatMatches.findIndex((m) => m.id === search?.currentId);
  const step = (dir: -1 | 1) => {
    if (!chatMatches.length) return;
    const from = currentIndex === -1 ? chatMatches.length : currentIndex;
    const next = chatMatches[(from + dir + chatMatches.length) % chatMatches.length];
    setSearch((st) => (st ? { ...st, currentId: next.id } : st));
  };

  const [searchChat, setSearchChat] = useState(active?.id);
  if (searchChat !== active?.id) {
    setSearchChat(active?.id);
    if (search && !search.currentId) setSearch(null);
  }

  useEffect(() => {
    if (!search?.currentId) return;
    const el = bodyRef.current?.querySelector(`[data-msg-id="${CSS.escape(String(search.currentId))}"]`);
    el?.scrollIntoView({ block: "center" });
  }, [search?.currentId, active?.id]);

  const openFromSearch = (dialogId: string, messageId: number | string) => {
    onOpen(dialogId);
    setChatOpen(true);
    setSearch({ q, currentId: messageId });
  };

  const choose = (file: File | undefined) => {
    if (!file) return;
    if (active?.textOnly) {
      showSnackbar("Сообществу можно отправить только текст", "info");
      return;
    }
    const type = attachmentKind(file);
    if (!type) {
      showSnackbar("Можно отправить только фото, видео или музыку", "error");
      return;
    }
    if (type !== "image" && file.size > MAX_FILE_MB * 1024 * 1024) {
      showSnackbar(
        `Файл больше ${MAX_FILE_MB} МБ — выберите поменьше`,
        "error",
      );
      return;
    }
    setAttachment((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { file, url: URL.createObjectURL(file), type };
    });
    inputRef.current?.focus();
  };

  const clearAttachment = () =>
    setAttachment((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });

  const attachMenu = useDropdown();
  const photoPicker = useFilePicker({
    accept: "image/*",
    onPick: ([file]) => choose(file),
  });
  const videoPicker = useFilePicker({
    accept: "video/*",
    onPick: ([file]) => choose(file),
  });
  const musicPicker = useFilePicker({
    accept: "audio/*,.mp3,.m4a,.aac,.ogg,.wav,.flac",
    onPick: ([file]) => choose(file),
  });
  const ATTACH_ITEMS = [
    { label: "Фото", Icon: PhotoIcon, picker: photoPicker },
    { label: "Видео", Icon: CamcorderIcon, picker: videoPicker },
    { label: "Музыка", Icon: MusicIcon, picker: musicPicker },
  ];
  const [dragging, dropProps] = useFileDrop(([file]) => choose(file));

  const finishVoiceRef = useRef<(() => Promise<void>) | null>(null);
  const recorder = useVoiceRecorder({
    maxSeconds: 300,
    onLimit: () => finishVoiceRef.current?.(),
  });

  const [voiceMode, setVoiceMode] = useState<"hold" | "locked" | null>(null);
  const [slide, setSlide] = useState({ dx: 0, dy: 0 });
  const [preview, setPreview] = useState<{ blob: Blob; url: string; duration: number; waveform: number[] } | null>(null);

  const startVoice = async (): Promise<boolean> => {
    if (!voiceRecordingSupported()) {
      showSnackbar("Этот браузер не умеет записывать звук", "error");
      return false;
    }
    try {
      await recorder.start();
      navigator.vibrate?.(15);
      return true;
    } catch (err) {
      const e = err as DOMException;
      showSnackbar(
        e.name === "NotAllowedError"
          ? "Нет доступа к микрофону. Разрешите его в настройках браузера (значок слева от адреса сайта)"
          : e.name === "NotFoundError"
            ? "Микрофон не найден — подключите его и попробуйте снова"
            : `Не удалось включить микрофон: ${e.message}`,
        "error",
      );
      return false;
    }
  };

  const onMicDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || recorder.recording) return;
    e.preventDefault();
    const hold = { x: e.clientX, y: e.clientY, t: Date.now(), started: false, released: false, over: false };
    setSlide({ dx: 0, dy: 0 });
    setVoiceMode("hold");
    const stopTracking = () => {
      hold.over = true;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    const move = (ev: PointerEvent) => {
      const dx = Math.min(0, ev.clientX - hold.x);
      const dy = Math.min(0, ev.clientY - hold.y);
      setSlide({ dx, dy });
      if (dx < -100) {
        stopTracking();
        recorder.cancel();
        setVoiceMode(null);
      } else if (dy < -70) {
        stopTracking();
        setVoiceMode("locked");
      }
    };
    const up = () => {
      stopTracking();
      hold.released = true;
      if (!hold.started || Date.now() - hold.t < 300) setVoiceMode("locked");
      else finishVoice();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    startVoice().then((ok) => {
      hold.started = ok;
      if (!ok) {
        stopTracking();
        setVoiceMode(null);
      }
    });
  };

  const discardVoice = () => {
    recorder.cancel();
    setVoiceMode(null);
    setPreview((p) => {
      if (p) URL.revokeObjectURL(p.url);
      return null;
    });
  };

  const previewVoice = async () => {
    const result = await recorder.stop();
    setVoiceMode(null);
    if (result && result.blob.size) setPreview({ ...result, url: URL.createObjectURL(result.blob) });
  };

  const sendVoice = (result: { blob: Blob; duration: number; waveform: number[] } | null) => {
    if (!result || !active) return;
    if (result.duration < 0.7 || !result.blob.size) {
      showSnackbar(
        "Слишком короткое сообщение — удерживайте запись подольше",
        "info",
      );
      return;
    }
    const ext =
      { "audio/mp4": "m4a", "audio/ogg": "ogg" }[result.blob.type] ?? "webm";
    const file = new File([result.blob], `voice.${ext}`, {
      type: result.blob.type,
    });
    onSend(active.id, "", file, {
      duration: result.duration,
      waveform: result.waveform,
    });
  };

  const finishVoice = async () => {
    setVoiceMode(null);
    if (preview) {
      sendVoice(preview);
      URL.revokeObjectURL(preview.url);
      setPreview(null);
      return;
    }
    sendVoice(await recorder.stop());
  };
  finishVoiceRef.current = finishVoice;

  const { cancel: cancelVoice } = recorder;
  useEffect(
    () => () => {
      cancelVoice();
      setVoiceMode(null);
      setPreview((p) => {
        if (p) URL.revokeObjectURL(p.url);
        return null;
      });
    },
    [active?.id, cancelVoice],
  );

  useEffect(
    () => () => {
      if (attachment) URL.revokeObjectURL(attachment.url);
    },
    [attachment],
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if ((!value && !attachment) || !active) return;
    onSend(active.id, value, attachment?.file ?? null);
    setText("");
    setAttachment(null);
  };

  const canSend = text.trim() || attachment;

  return (
    <div className={`card messenger ${chatOpen ? "messenger--chat" : ""}`}>
      <div className="im-list">
        <div className="im-list__head">
          <label className="search">
            <SearchIcon size={16} />
            <input
              type="search"
              placeholder="Поиск"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button className="icon-btn" title="Новый чат">
            <WriteIcon size={22} />
          </button>
        </div>

        <div className="im-folders">
          {folders.map((f) => (
            <button
              key={f}
              className={`seg ${folder === f ? "active" : ""}`}
              onClick={() => setFolder(f)}
            >
              {f}
              {f === "Архив" && <span className="muted"> {archivedCount}</span>}
            </button>
          ))}
        </div>

        <div className="im-list__items">
          {visible.map((d) => {
            const last = d.messages.at(-1);
            return (
              <div key={d.id} className={`dialog-row ${chatActions ? "dialog-row--menu" : ""}`}>
              <button
                type="button"
                className={`dialog ${d.id === active?.id ? "active" : ""} ${d.pinned ? "dialog--pinned" : ""}`}
                onClick={() => {
                  onOpen(d.id);
                  setChatOpen(true);
                }}
              >
                <Avatar
                  name={d.person.name}
                  color={d.person.color}
                  src={d.person.avatar}
                  empty={!d.person.isCommunity}
                  size={48}
                  online={d.person.online}
                />
                <span className="dialog__body">
                  <span className="dialog__top">
                    <span className="dialog__name">{d.person.name}</span>
                    <span className="dialog__time">{d.time}</span>
                  </span>
                  <span className="dialog__bottom">
                    <span
                      className={`dialog__last ${d.typing ? "dialog__last--typing" : ""}`}
                    >
                      {d.typing ? (
                        <Typing />
                      ) : last ? (
                        <>
                          {last.out && (
                            <>
                              <MessageStatus state={last.state} />
                              <b>Вы: </b>
                            </>
                          )}
                          {last.summary ?? last.text}
                        </>
                      ) : (
                        "Нет сообщений"
                      )}
                    </span>
                    {d.unread > 0 ? (
                      <span className="dialog__unread">{d.unread}</span>
                    ) : d.markedUnread ? (
                      <span className="dialog__unread dialog__unread--dot" title="Отмечен непрочитанным" />
                    ) : d.pinned ? (
                      <PinIcon size={16} className="dialog__pin" />
                    ) : null}
                  </span>
                </span>
              </button>
              <ChatMenu dialog={d} actions={chatActions} inList />
              </div>
            );
          })}
          {visible.length === 0 && messageHits.length === 0 && (
            <div className="empty">
              {dialogs.length ? (q ? "Ничего не найдено" : "В этой папке пока пусто") : emptyText}
            </div>
          )}
          {messageHits.length > 0 && (
            <>
              <div className="im-list__section">Сообщения</div>
              {messageHits.map(({ dialog: d, message: m }) => (
                <button key={`${d.id}:${m.id}`} type="button" className="dialog" onClick={() => openFromSearch(d.id, m.id)}>
                  <Avatar name={d.person.name} color={d.person.color} src={d.person.avatar} empty={!d.person.isCommunity} size={48} />
                  <span className="dialog__body">
                    <span className="dialog__top">
                      <span className="dialog__name">{d.person.name}</span>
                      <span className="dialog__time">{m.day === "Сегодня" ? m.time : m.day}</span>
                    </span>
                    <span className="dialog__bottom">
                      <span className="dialog__last">
                        {m.out && <b>Вы: </b>}
                        <Highlighted text={m.text} query={q} />
                      </span>
                    </span>
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {active ? (
        <div className={`chat ${dragging ? "chat--drag" : ""}`} {...dropProps}>
          <div className="chat__head">
            <button type="button" className="icon-btn chat__back" title="Назад к чатам" onClick={() => setChatOpen(false)}>
              <ChevronLeftIcon size={24} />
            </button>
            <a
              href={personHref(active.person)}
              className="chat__person"
              title="Открыть страницу"
            >
              <Avatar
                name={active.person.name}
                color={active.person.color}
                src={active.person.avatar}
                empty={!active.person.isCommunity}
                size={36}
                online={active.person.online}
              />
            </a>
            <div className="chat__title">
              <a
                href={personHref(active.person)}
                className="chat__name chat__name--link"
              >
                {active.person.name}
              </a>
              <div
                className={`chat__status ${active.person.online || active.typing ? "chat__status--online" : ""}`}
              >
                <span key={active.typing ? "typing" : active.person.online ? "online" : "away"} className="status-swap">
                  {active.person.isCommunity
                    ? "Сообщество"
                    : active.typing
                      ? <Typing />
                      : active.person.online
                        ? "в сети"
                        : lastSeen(active.person.gender)}
                </span>
              </div>
            </div>
            <button className="icon-btn" title="Поиск по сообщениям" onClick={() => setSearch({ q: "", currentId: null })}>
              <SearchIcon size={22} />
            </button>
            <ChatMenu
              dialog={active}
              actions={chatActions}
              onLeave={() => setChatOpen(false)}
            />
          </div>

          {search && (
            <form
              className="chat-search"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                step(-1);
              }}
            >
              <SearchIcon size={18} />
              <input
                autoFocus
                type="search"
                placeholder="Поиск по сообщениям"
                value={search.q}
                onChange={(e) => {
                  const value = e.target.value;
                  const found = (active.messages ?? []).filter((m) => matchesQuery(m.text, value.trim()));
                  setSearch({ q: value.trim(), currentId: found.at(-1)?.id ?? null });
                }}
                onKeyDown={(e) => e.key === "Escape" && setSearch(null)}
              />
              <span className="chat-search__count">
                {search.q ? (chatMatches.length ? `${currentIndex + 1} из ${chatMatches.length}` : "Не найдено") : ""}
              </span>
              <button type="button" className="icon-btn icon-btn--sm" title="Раньше" disabled={!chatMatches.length} onClick={() => step(-1)}>
                <ChevronUpIcon size={20} />
              </button>
              <button type="button" className="icon-btn icon-btn--sm" title="Позже" disabled={!chatMatches.length} onClick={() => step(1)}>
                <ChevronDownIcon size={20} />
              </button>
              <button type="button" className="icon-btn icon-btn--sm" title="Закрыть поиск" onClick={() => setSearch(null)}>
                <CloseIcon size={18} />
              </button>
            </form>
          )}

          <div className="chat__body" ref={bodyRef}>
            {active.messages.length > 0 ? (
              active.messages.map((m, i) => {
                const day = m.day ?? "Сегодня";
                const showDay =
                  i === 0 || day !== (active.messages[i - 1].day ?? "Сегодня");
                return (
                  <MessageItem
                    key={m.id}
                    message={m}
                    day={showDay ? day : null}
                    deletable={!!onDelete && m.deletable !== false}
                    onZoom={setZoomUrl}
                    onAskDelete={askDelete}
                    onRetry={retry}
                    onListened={listenedCb}
                    highlight={search?.q && matchesQuery(m.text, search.q) ? search.q : ""}
                    current={m.id === search?.currentId}
                  />
                );
              })
            ) : (
              <div className="chat__empty">Здесь будет история переписки</div>
            )}
            {active.typing && (
              <div className="msg msg--typing" role="status" aria-label={`${active.person.name} печатает`}>
                <TypingDots />
              </div>
            )}
          </div>

          {dragging && (
            <div className="chat__drop">
              Отпустите, чтобы прикрепить фото, видео или музыку
            </div>
          )}

          {attachment && (
            <div className="chat__attachment">
              {attachment.type === "video" ? (
                <video src={attachment.url} muted />
              ) : attachment.type === "audio" ? (
                <span className="chat__attachment-audio">
                  <MusicIcon size={24} />
                </span>
              ) : (
                <img src={attachment.url} alt="" />
              )}
              <span className="chat__attachment-name">
                {attachment.file.name}
              </span>
              <button
                className="icon-btn icon-btn--sm"
                onClick={clearAttachment}
                title="Убрать вложение"
              >
                <CloseIcon size={18} />
              </button>
            </div>
          )}

          {active.blocked ? (
            <div className="chat-blocked">
              {active.blocked === "byMe" ? (
                <>
                  Вы заблокировали этого пользователя
                  <button type="button" className="btn btn--secondary btn--sm" onClick={() => chatActions?.unblock(active.id)}>
                    Разблокировать
                  </button>
                </>
              ) : (
                "Вы не можете отправить сообщение этому пользователю, так как он ограничил круг лиц, которые могут присылать ему сообщения."
              )}
            </div>
          ) : preview ? (
            <div className="chat__composer chat__composer--recording">
              <button type="button" className="icon-btn chat__send voice-rec__trash" title="Удалить запись" onClick={discardVoice}>
                <TrashIcon size={22} />
              </button>
              <div className="voice-rec__preview">
                <VoicePlayer url={preview.url} meta={preview} out />
              </div>
              <button type="button" className="icon-btn chat__send" title="Отправить голосовое" onClick={finishVoice}>
                <SendIcon size={26} />
              </button>
            </div>
          ) : voiceMode === "hold" ? (
            <div className="chat__composer chat__composer--recording voice-rec voice-rec--hold">
              <div className="recording" role="status">
                <span className="recording__dot" />
                <span className="recording__time">{formatDuration(recorder.seconds)}</span>
              </div>
              <span className="voice-rec__cancel-hint" style={{ transform: `translateX(${slide.dx}px)`, opacity: 1 + slide.dx / 120 }}>
                <ChevronLeftIcon size={18} /> Влево — отмена
              </span>
              <span className="voice-rec__lock" style={{ transform: `translateY(${Math.max(slide.dy, -60)}px)` }} title="Вверх — закрепить">
                <LockIcon size={16} />
                <ChevronUpIcon size={14} />
              </span>
              <span
                className="voice-rec__mic"
                style={{ transform: `translate(${slide.dx}px, ${slide.dy}px) scale(${1 + Math.min(recorder.levels.at(-1) ?? 0, 0.3)})` }}
              >
                <MicIcon size={26} />
              </span>
            </div>
          ) : recorder.recording || voiceMode === "locked" ? (
            <form
              className="chat__composer chat__composer--recording"
              onSubmit={(e) => {
                e.preventDefault();
                finishVoice();
              }}
            >
              <button type="button" className="icon-btn chat__send voice-rec__trash" title="Удалить запись" onClick={discardVoice}>
                <TrashIcon size={22} />
              </button>
              <div className={`recording ${recorder.paused ? "recording--paused" : ""}`} role="status">
                <span className="recording__dot" />
                <span className="recording__time">{formatDuration(recorder.seconds)}</span>
                {recorder.paused ? (
                  <button type="button" className="voice-rec__listen" onClick={previewVoice}>
                    <PlayIcon size={14} /> Прослушать
                  </button>
                ) : (
                  <span className="recording__wave">
                    {recorder.levels.map((l, i) => (
                      <span key={i} style={{ height: `${Math.min(100, 12 + l * 400)}%` }} />
                    ))}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="icon-btn chat__send"
                title={recorder.paused ? "Продолжить запись" : "Пауза"}
                onClick={recorder.paused ? recorder.resume : recorder.pause}
                disabled={!recorder.recording}
              >
                {recorder.paused ? <MicIcon size={22} /> : <PauseIcon size={22} />}
              </button>
              <button className="icon-btn chat__send" title="Отправить голосовое" disabled={!recorder.recording}>
                <SendIcon size={26} />
              </button>
            </form>
          ) : (
            <form className="chat__composer" onSubmit={submit}>
              {!active.textOnly && (
                <div className="attach-menu" ref={attachMenu.ref}>
                  <button
                    type="button"
                    className={`icon-btn chat__send ${attachMenu.open ? "attach-menu__trigger--open" : ""}`}
                    title="Прикрепить"
                    aria-haspopup="menu"
                    aria-expanded={attachMenu.open}
                    style={{ color: "var(--icon-secondary)" }}
                    onClick={attachMenu.toggle}
                  >
                    <AttachIcon size={24} />
                  </button>
                  {attachMenu.open && (
                    <div className="attach-menu__list" role="menu">
                      {ATTACH_ITEMS.map(({ label, Icon, picker }) => (
                        <button
                          key={label}
                          type="button"
                          role="menuitem"
                          className="attach-menu__item"
                          onClick={() => {
                            attachMenu.close();
                            picker.open();
                          }}
                        >
                          <Icon size={26} />
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                  {photoPicker.input}
                  {videoPicker.input}
                  {musicPicker.input}
                </div>
              )}
              <div className="chat__field">
                <input
                  ref={inputRef}
                  placeholder={attachment ? "Добавьте подпись…" : "Сообщение"}
                  autoComplete="off"
                  maxLength={4000}
                  value={text}
                  onPaste={(e) => {
                    const file = [...e.clipboardData.files].find((f) =>
                      attachmentKind(f),
                    );
                    if (file) {
                      e.preventDefault();
                      choose(file);
                    }
                  }}
                  onChange={(e) => {
                    setText(e.target.value);
                    if (e.target.value) onTyping?.(active.id);
                  }}
                />
                <EmojiPicker
                  inputRef={inputRef}
                  value={text}
                  onChange={(next) => {
                    setText(next);
                    if (next) onTyping?.(active.id);
                  }}
                />
              </div>
              {canSend || active.textOnly ? (
                <button
                  className="icon-btn chat__send"
                  title="Отправить"
                  disabled={!canSend}
                >
                  <SendIcon size={26} />
                </button>
              ) : (
                <button
                  type="button"
                  className="icon-btn chat__send voice-rec__start"
                  title="Голосовое: удерживайте, чтобы записать, или нажмите"
                  style={{ color: "var(--icon-secondary)" }}
                  onPointerDown={onMicDown}
                  onContextMenu={(e) => e.preventDefault()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      startVoice().then((ok) => ok && setVoiceMode("locked"));
                    }
                  }}
                >
                  <MicIcon size={24} />
                </button>
              )}
            </form>
          )}
        </div>
      ) : (
        <div className="chat chat--empty">
          <div className="chat__empty">Выберите чат слева</div>
        </div>
      )}

      {zoomUrl && <Lightbox url={zoomUrl} onClose={() => setZoomUrl(null)} />}

      {toDelete && (
        <DeleteMessageModal
          canDeleteForAll={toDelete.canDeleteForAll}
          onConfirm={(forAll) => {
            onDelete?.(toDelete, forAll);
            setToDelete(null);
          }}
          onClose={() => setToDelete(null)}
        />
      )}
    </div>
  );
}
