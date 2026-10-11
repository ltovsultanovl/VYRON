import {
  createElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type RefObject,
} from "react";
import { useSnackbar } from "./components/Snackbar";

const STORAGE_FULL_MESSAGE =
  "В браузере закончилось место — последние изменения пропадут после перезагрузки";

export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, open, onClose]);
}

export function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  useDismiss(ref, open, close);
  return { open, ref, close, toggle };
}

export function useScrollLock() {
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);
}

export function useFilePicker({
  accept,
  multiple = false,
  onPick,
}: {
  accept: string;
  multiple?: boolean;
  onPick: (files: File[]) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onPickRef.current = onPick;
  });

  const input = createElement("input", {
    ref,
    type: "file",
    accept,
    multiple,
    hidden: true,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = [...(e.target.files ?? [])];
      e.target.value = "";
      if (files.length) onPickRef.current(files);
    },
  });

  const open = useCallback(() => ref.current?.click(), []);
  return { open, input };
}

export function useFileDrop(onDrop: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);

  const props = {
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (![...e.dataTransfer.types].includes("Files")) return;
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: (e: DragEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      setDragging(false);
      onDrop([...e.dataTransfer.files]);
    },
  };

  return [dragging, props] as const;
}

export function useStoredState<T>(key: string, initial: T, { revive }: { revive?: (saved: unknown) => T } = {}) {
  const showSnackbar = useSnackbar();
  const failedRef = useRef(false);
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null");
      if (saved == null) return initial;
      return revive ? revive(saved) : saved;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      failedRef.current = false;
    } catch {
      if (!failedRef.current) showSnackbar(STORAGE_FULL_MESSAGE, "error");
      failedRef.current = true;
    }
  }, [key, value, showSnackbar]);

  return [value, setValue] as const;
}

const VOICE_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
const WAVEFORM_BARS = 48;
const SAMPLE_MS = 100;

const toWaveform = (levels: number[]) => {
  if (!levels.length) return Array(WAVEFORM_BARS).fill(0);
  const bars = Array.from({ length: WAVEFORM_BARS }, (_, i) => {
    const from = Math.floor((i * levels.length) / WAVEFORM_BARS);
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / WAVEFORM_BARS));
    return Math.max(...levels.slice(from, to));
  });
  const peak = Math.max(...bars, 0.01);
  return bars.map((v) => Math.round((v / peak) * 100));
};

export const voiceRecordingSupported = () =>
  typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

interface RecordingSession {
  stream: MediaStream;
  recorder: MediaRecorder;
  chunks: Blob[];
  audioContext: AudioContext;
  timer: ReturnType<typeof setInterval>;
  samples: number[];
  recorded: number;
  lastTick: number;
  paused: boolean;
}

export function useVoiceRecorder({ maxSeconds = 300, onLimit }: { maxSeconds?: number; onLimit?: () => void } = {}) {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const session = useRef<RecordingSession | null>(null);
  const onLimitRef = useRef(onLimit);
  useEffect(() => {
    onLimitRef.current = onLimit;
  });

  const cleanup = useCallback(() => {
    const s = session.current;
    if (!s) return;
    clearInterval(s.timer);
    s.stream.getTracks().forEach((t) => t.stop());
    s.audioContext.close().catch(() => { });
    session.current = null;
    setRecording(false);
    setPaused(false);
    setSeconds(0);
    setLevels([]);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    if (session.current) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = VOICE_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported?.(t));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    const buffer = new Uint8Array(analyser.fftSize);

    const samples: number[] = [];
    const timer = setInterval(() => {
      const s = session.current;
      if (!s) return;
      const now = Date.now();
      if (s.paused) {
        s.lastTick = now;
        return;
      }
      s.recorded += now - s.lastTick;
      s.lastTick = now;
      analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (const v of buffer) sum += ((v - 128) / 128) ** 2;
      const level = Math.sqrt(sum / buffer.length);
      samples.push(level);
      setLevels((prev) => [...prev.slice(-29), level]);
      const elapsed = s.recorded / 1000;
      setSeconds(Math.floor(elapsed));
      if (elapsed >= maxSeconds) onLimitRef.current?.();
    }, SAMPLE_MS);

    session.current = { stream, recorder, chunks, audioContext, timer, samples, recorded: 0, lastTick: Date.now(), paused: false };
    recorder.start(250);
    setRecording(true);
  }, [maxSeconds]);

  const stop = useCallback(
    () =>
      new Promise<{ blob: Blob; duration: number; waveform: number[] } | null>((resolve) => {
        const s = session.current;
        if (!s) return resolve(null);
        s.recorder.onstop = () => {
          const type = (s.recorder.mimeType || "audio/webm").split(";")[0];
          const blob = new Blob(s.chunks, { type });
          if (!s.paused) s.recorded += Date.now() - s.lastTick;
          const duration = Math.round(s.recorded / 100) / 10;
          const waveform = toWaveform(s.samples);
          cleanup();
          resolve({ blob, duration, waveform });
        };
        s.recorder.stop();
      }),
    [cleanup],
  );

  const cancel = useCallback(() => {
    const s = session.current;
    if (!s) return;
    s.recorder.onstop = null;
    if (s.recorder.state !== "inactive") s.recorder.stop();
    cleanup();
  }, [cleanup]);

  const pause = useCallback(() => {
    const s = session.current;
    if (!s || s.paused || s.recorder.state !== "recording") return;
    s.recorded += Date.now() - s.lastTick;
    s.lastTick = Date.now();
    s.paused = true;
    s.recorder.pause();
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    const s = session.current;
    if (!s || !s.paused) return;
    s.lastTick = Date.now();
    s.paused = false;
    s.recorder.resume();
    setPaused(false);
  }, []);

  return { recording, paused, seconds, levels, start, stop, cancel, pause, resume };
}

export function usePageVisible() {
  const [visible, setVisible] = useState(() => document.visibilityState === "visible");
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}

export function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function useResume(onResume: () => void, minAwayMs = 30_000) {
  const ref = useRef(onResume);
  useEffect(() => {
    ref.current = onResume;
  });
  useEffect(() => {
    let hiddenAt = document.visibilityState === "hidden" ? Date.now() : 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = 0;
      if (away >= minAwayMs) ref.current();
    };
    const onOnline = () => ref.current();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [minAwayMs]);
}
