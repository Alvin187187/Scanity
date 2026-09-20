const USER_STORAGE_KEY = "scanityUser"
const AVATAR_STORAGE_PREFIX = "scanityAvatar:"
const AVATAR_UPDATED_EVENT = "scanity-avatar-updated"

export type SessionUser = {
  name: string
  email: string
  joinedAt: string
  accessToken?: string
  avatarUrl?: string
}

function avatarStorageKey(owner: string) {
  return `${AVATAR_STORAGE_PREFIX}${owner}`
}

function avatarOwner(email?: string | null): string {
  const session = readStoredUser()
  const target = (email || session?.email || "").trim().toLowerCase()
  // Always persist somewhere — empty email used to silently drop photos.
  return target || "local"
}

function readStoredAvatar(owner: string): string | null {
  if (!owner) return null
  try {
    const raw = window.localStorage.getItem(avatarStorageKey(owner))
    return raw && raw.startsWith("data:image") ? raw : null
  } catch {
    return null
  }
}

function notifyAvatarUpdated() {
  try {
    window.dispatchEvent(new Event(AVATAR_UPDATED_EVENT))
  } catch {
    /* ignore */
  }
}

export function loadProfileAvatar(email?: string | null): string | null {
  const owner = avatarOwner(email)
  const direct = readStoredAvatar(owner)
  if (direct) return direct
  // Fall back to previous local key if the user later gained an email.
  if (owner !== "local") return readStoredAvatar("local")
  return null
}

export function saveProfileAvatar(avatarUrl: string | null, email?: string | null) {
  const owner = avatarOwner(email)
  try {
    if (!avatarUrl) {
      window.localStorage.removeItem(avatarStorageKey(owner))
      notifyAvatarUpdated()
      return
    }
    // Keep avatars reasonably small for localStorage.
    if (avatarUrl.length > 1_800_000) {
      throw new Error("Profile picture is too large to save on this device.")
    }
    window.localStorage.setItem(avatarStorageKey(owner), avatarUrl)
    // Keep a local mirror so dashboard still finds it after email edits.
    if (owner !== "local") {
      window.localStorage.setItem(avatarStorageKey("local"), avatarUrl)
    }
    notifyAvatarUpdated()
  } catch (error) {
    throw error instanceof Error ? error : new Error("Could not save profile picture.")
  }
}

function readStoredUser(): SessionUser | null {
  try {
    const raw = window.localStorage.getItem(USER_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SessionUser>
    if (!parsed.email && !parsed.name) return null
    return {
      name: parsed.name?.trim() || "",
      email: parsed.email?.trim() || "",
      joinedAt: parsed.joinedAt || new Date().toISOString(),
      accessToken: parsed.accessToken,
    }
  } catch {
    return null
  }
}

export function loadSessionUser(): SessionUser | null {
  return readStoredUser()
}

export function saveSessionUser(user: SessionUser) {
  const existing = readStoredUser()
  const next: SessionUser = {
    name: user.name.trim() || existing?.name || "",
    email: user.email.trim() || existing?.email || "",
    joinedAt:
      existing?.email &&
      existing.email.toLowerCase() === user.email.trim().toLowerCase()
        ? existing.joinedAt
        : user.joinedAt || existing?.joinedAt || new Date().toISOString(),
    accessToken: user.accessToken || existing?.accessToken,
  }

  window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(next))
}

export function clearSessionUser() {
  window.localStorage.removeItem(USER_STORAGE_KEY)
}

export function getAccessToken() {
  return readStoredUser()?.accessToken || null
}

export function firstName(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return "there"
  return trimmed.split(/\s+/)[0]
}

export function formatJoinedLabel(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return " - "
  return date.toLocaleString("en-US", { month: "long", year: "numeric" })
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1]
    if (!part) return null
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4)
    return JSON.parse(atob(padded)) as Record<string, unknown>
  } catch {
    return null
  }
}

function nameFromMetadata(payload: Record<string, unknown> | null) {
  const metadata = payload?.user_metadata
  if (metadata && typeof metadata === "object") {
    const fullName = (metadata as { full_name?: unknown }).full_name
    if (typeof fullName === "string" && fullName.trim()) return fullName.trim()
    const name = (metadata as { name?: unknown }).name
    if (typeof name === "string" && name.trim()) return name.trim()
  }
  return ""
}

function fallbackName(identifier: string) {
  const local = identifier.includes("@")
    ? identifier.slice(0, identifier.indexOf("@"))
    : identifier
  return local.replace(/[._-]+/g, " ").trim() || identifier
}

export function sessionUserFromRegister(
  result: { full_name?: string; email?: string } | null,
  name: string,
  email: string,
): SessionUser {
  return {
    name: result?.full_name?.trim() || name.trim(),
    email: result?.email?.trim() || email.trim(),
    joinedAt: new Date().toISOString(),
  }
}

export function sessionUserFromLogin(
  accessToken: string | undefined,
  identifier: string,
): SessionUser {
  const payload = accessToken ? decodeJwtPayload(accessToken) : null
  const emailFromToken =
    typeof payload?.email === "string" ? payload.email.trim() : ""
  const iat =
    typeof payload?.iat === "number" ? new Date(payload.iat * 1000) : null

  return {
    name: nameFromMetadata(payload) || fallbackName(identifier),
    email: emailFromToken || identifier.trim(),
    joinedAt:
      iat && !Number.isNaN(iat.getTime())
        ? iat.toISOString()
        : new Date().toISOString(),
    accessToken,
  }
}
