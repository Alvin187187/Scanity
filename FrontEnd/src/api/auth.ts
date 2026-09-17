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

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()

// Local Vite defaults to the FastAPI server. Production must set VITE_API_BASE_URL
// at build time (Vercel env vars are inlined during `vite build`).
const API_BASE_URL = trimTrailingSlash(
  configuredBaseUrl ||
    (import.meta.env.DEV ? "http://localhost:8000/api/v1" : ""),
)

export function requireApiBaseUrl() {
  if (!API_BASE_URL) {
    throw new Error("AUTH_API_NOT_READY")
  }
  return API_BASE_URL
}

function toAuthError(error: unknown) {
  if (error instanceof Error && error.message === "AUTH_API_NOT_READY") {
    return error
  }

  if (
    error instanceof TypeError ||
    (error instanceof Error &&
      /failed to fetch|networkerror|load failed/i.test(error.message))
  ) {
    return new Error("AUTH_API_NOT_READY")
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

// ─────────────────────────────────────────────
// REGISTER
// POST /api/v1/auth/register
// ─────────────────────────────────────────────
export async function registerUser(data: RegisterData) {
  try {
    const response = await fetch(`${requireApiBaseUrl()}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        full_name: data.name,
        email: data.email,
        password: data.password,
      }),
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
export async function loginUser(
  credentials: LoginCredentials,
) {
  try {
    const response = await fetch(`${requireApiBaseUrl()}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: credentials.identifier,
        password: credentials.password,
      }),
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
