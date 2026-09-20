const THEME_STORAGE_KEY = "scanityTheme"

export type ThemeMode = "light" | "dark"

export function loadThemeMode(): ThemeMode {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (raw === "dark" || raw === "light") return raw
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "dark"
  }
  return "light"
}

export function saveThemeMode(mode: ThemeMode) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    /* ignore */
  }
  applyThemeMode(mode)
  try {
    window.dispatchEvent(new CustomEvent("scanity-theme-updated", { detail: mode }))
  } catch {
    /* ignore */
  }
}

export function applyThemeMode(mode: ThemeMode = loadThemeMode()) {
  if (typeof document === "undefined") return
  document.documentElement.dataset.theme = mode
  document.documentElement.style.colorScheme = mode
}

export function toggleThemeMode(): ThemeMode {
  const next: ThemeMode = loadThemeMode() === "dark" ? "light" : "dark"
  saveThemeMode(next)
  return next
}
