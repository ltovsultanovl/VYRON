{
  let saved = null;
  try {
    const raw = localStorage.getItem("theme");
    saved = raw && raw.startsWith('"') ? JSON.parse(raw) : raw;
  } catch {}
  const prefersDark = matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = saved || (prefersDark ? "dark" : "light");
}
