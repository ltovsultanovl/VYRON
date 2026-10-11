export const formatDuration = (sec: number) => {
  if (!Number.isFinite(sec) || sec <= 0) return "0:00";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};

export const formatTotal = (sec: number) => {
  if (sec < 60) return `${Math.round(sec)} с`;
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`;
};

export const coverGradient = (seed = ""): string => {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `linear-gradient(135deg, hsl(${h} 65% 58%), hsl(${(h + 50) % 360} 60% 38%))`;
};
