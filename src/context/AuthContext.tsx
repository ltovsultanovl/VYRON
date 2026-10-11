import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "../lib/supabase";

interface AuthValue {
  session: Session | null | undefined;
  recovering: boolean;
  finishRecovery: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

// После выхода сохранённая копия профиля (см. ProfileContext) на устройстве не нужна
function forgetCachedProfiles() {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith("profile:"))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // Хранилище недоступно — и кэша там нет
  }
}

// Сессия Supabase: undefined — ещё проверяем, null — не вошёл, объект — вошёл.
// recovering — пользователь пришёл по ссылке «Восстановить пароль» и должен задать новый
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(supabaseConfigured ? undefined : null);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (event === "SIGNED_OUT") {
        setRecovering(false);
        forgetCachedProfiles();
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo(
    () => ({ session, recovering, finishRecovery: () => setRecovering(false) }),
    [session, recovering],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth нужно вызывать внутри <AuthProvider>");
  return context;
}
