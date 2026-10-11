import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Запрос, на который сервер не ответил за 20 секунд, прерываем — иначе при плохой связи
// загрузка крутилась бы бесконечно. Загрузку файлов (видео до 50 МБ) не ограничиваем
const TIMEOUT_MS = 20_000;
const fetchWithTimeout: typeof fetch = (input, init = {}) => {
  const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = (init.method ?? "GET").toUpperCase();
  if (href.includes("/storage/v1/object/") && method !== "GET" && method !== "HEAD") return fetch(input, init);
  if (typeof AbortSignal.timeout !== "function") return fetch(input, init); // старые браузеры (iOS 15) — без тайм-аута
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const signal = init.signal && "any" in AbortSignal ? AbortSignal.any([init.signal, timeout]) : (init.signal ?? timeout);
  return fetch(input, { ...init, signal });
};

// Без ключей в .env.local приложение показывает инструкцию по подключению и не обращается к серверу.
// Клиент создаём всегда (с заглушкой), чтобы в коде не проверять его на null
export const supabaseConfigured = Boolean(url && key);
export const supabase = createClient(url || "http://localhost", key || "not-configured", {
  global: { fetch: fetchWithTimeout },
});
