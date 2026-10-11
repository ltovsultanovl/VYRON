import { lazy, type ComponentType } from "react";

const RELOAD_KEY = "lazy-page-reloaded";

export function lazyPage<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  return lazy(() =>
    load().then(
      (module) => {
        sessionStorage.removeItem(RELOAD_KEY);
        return module;
      },
      (error) => {
        if (!sessionStorage.getItem(RELOAD_KEY)) {
          sessionStorage.setItem(RELOAD_KEY, "1");
          location.reload();
          return new Promise<never>(() => {});
        }
        throw error;
      },
    ),
  );
}
