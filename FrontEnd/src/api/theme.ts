const THEME_STORAGE_KEY = "scanityTheme"

export type ThemeMode = "light" | "dark"

export function loadThemeMode(): ThemeMode {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (raw === "dark" || raw === "light") return raw
  } catch {
    /* ignore */
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
  const root = document.documentElement
  root.classList.add("theme-switching")
  root.dataset.theme = mode
  root.style.colorScheme = mode
  window.setTimeout(() => root.classList.remove("theme-switching"), 200)
}

export function toggleThemeMode(): ThemeMode {
  const next: ThemeMode = loadThemeMode() === "dark" ? "light" : "dark"
  saveThemeMode(next)
  return next
}
