export type LoginCredentials = {
  identifier: string
  password: string
}

export type RegisterData = {
  name: string
  email: string
  password: string
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, "")
}

/** Live Render API — used when VITE_API_BASE_URL is missing in a production build. */
export const PRODUCTION_API_BASE_URL =
  "https://scanity-api.onrender.com/api/v1"

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()

const API_BASE_URL = trimTrailingSlash(
  configuredBaseUrl ||
    (import.meta.env.DEV
      ? "http://localhost:8000/api/v1"
      : PRODUCTION_API_BASE_URL),
)

const AUTH_FETCH_TIMEOUT_MS = 45_000

export function requireApiBaseUrl() {
  if (!API_BASE_URL) {
    throw new Error("AUTH_API_NOT_READY")
  }
  return API_BASE_URL
}

export function apiOriginFromBase(base = requireApiBaseUrl()) {
  return base.replace(/\/api\/v1\/?$/, "")
}

/** Ping the API root so a sleeping Render instance can wake before login. */
export async function wakeApi(timeoutMs = AUTH_FETCH_TIMEOUT_MS): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), timeoutMs)
    const response = await fetch(`${apiOriginFromBase()}/`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    })
    window.clearTimeout(timer)
    return response.ok || response.status < 500
  } catch {
    return false
  }
}

function toAuthError(error: unknown) {
  if (
    error instanceof Error &&
    (error.message === "AUTH_API_NOT_READY" ||
      error.message === "AUTH_API_UNREACHABLE")
  ) {
    return error
  }

  if (
    error instanceof DOMException &&
    error.name === "AbortError"
  ) {
    return new Error("AUTH_API_UNREACHABLE")
  }

  if (
    error instanceof TypeError ||
    (error instanceof Error &&
      /failed to fetch|networkerror|load failed|aborted|timeout/i.test(
        error.message,
      ))
  ) {
    return new Error("AUTH_API_UNREACHABLE")
  }

  return error instanceof Error ? error : new Error("Request failed")
}

function errorMessageFromBody(result: unknown, fallback: string) {
  if (result && typeof result === "object" && "detail" in result) {
    const detail = (result as { detail: unknown }).detail
    if (typeof detail === "string" && detail.trim()) {
      return detail
    }
  }
  return fallback
}

async function authFetch(
  path: string,
  body: Record<string, unknown>,
  attempt = 1,
): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(
    () => controller.abort(),
    AUTH_FETCH_TIMEOUT_MS,
  )
  try {
    return await fetch(`${requireApiBaseUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (error) {
    if (attempt < 2) {
      await wakeApi()
      return authFetch(path, body, attempt + 1)
    }
    throw toAuthError(error)
  } finally {
    window.clearTimeout(timer)
  }
}

// ─────────────────────────────────────────────
// REGISTER
// POST /api/v1/auth/register
// ─────────────────────────────────────────────
export async function registerUser(data: RegisterData) {
  try {
    await wakeApi(12_000)
    const response = await authFetch("/auth/register", {
      full_name: data.name,
      email: data.email,
      password: data.password,
    })

    const result = await response.json().catch(() => null)

    console.log("Registration status:", response.status)
    console.log("Registration response:", result)

    if (!response.ok) {
      throw new Error(
        errorMessageFromBody(
          result,
          `Registration failed with status ${response.status}`,
        ),
      )
    }

    return result
  } catch (error) {
    console.error("Registration request failed:", error)
    throw toAuthError(error)
  }
}

// ─────────────────────────────────────────────
// LOGIN
// POST /api/v1/auth/login
// ─────────────────────────────────────────────
export async function loginUser(credentials: LoginCredentials) {
  try {
    await wakeApi(12_000)
    const response = await authFetch("/auth/login", {
      email: credentials.identifier,
      password: credentials.password,
    })

    const result = await response.json().catch(() => null)

    console.log("Login status:", response.status)
    console.log("Login response:", result)

    if (!response.ok) {
      throw new Error(
        errorMessageFromBody(
          result,
          `Login failed with status ${response.status}`,
        ),
      )
    }

    return result
  } catch (error) {
    console.error("Login request failed:", error)
    throw toAuthError(error)
  }
}
