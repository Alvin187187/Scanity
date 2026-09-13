export type LoginCredentials = {
  identifier: string
  password: string
}

export type RegisterData = {
  name: string
  email: string
  password: string
}

const API_BASE_URL = "http://localhost:8000/api/v1"

// ─────────────────────────────────────────────
// REGISTER
// POST /api/v1/auth/register
// ─────────────────────────────────────────────
export async function registerUser(data: RegisterData) {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
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
        result?.detail ||
          `Registration failed with status ${response.status}`,
      )
    }

    return result
  } catch (error) {
    console.error("Registration request failed:", error)
    throw error
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
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
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
        result?.detail ||
          `Login failed with status ${response.status}`,
      )
    }

    return result
  } catch (error) {
    console.error("Login request failed:", error)
    throw error
  }
}