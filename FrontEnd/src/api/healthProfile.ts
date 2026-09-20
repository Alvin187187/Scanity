import { requireApiBaseUrl } from "./auth"
import { getAccessToken } from "./session"

const PROFILE_KEY = "scanityHealthProfile"

/** UI chip id -> API allergen_name used by the allergy engine / users API. */
export const ALLERGY_CATEGORY: Record<string, string> = {
  peanuts: "peanut",
  "tree-nuts": "tree_nuts",
  dairy: "milk",
  eggs: "egg",
  wheat: "wheat",
  soy: "soy",
  fish: "fish",
  shellfish: "shellfish",
  sesame: "sesame",
}

const API_TO_UI_ALLERGY: Record<string, string> = Object.fromEntries(
  Object.entries(ALLERGY_CATEGORY).map(([ui, api]) => [api, ui]),
)

export type HealthProfile = {
  allergies: string[]
  otherAllergy?: string
  conditions: string[]
  otherCondition?: string
}

function emptyProfile(): HealthProfile {
  return { allergies: [], conditions: [] }
}

export function loadHealthProfile(): HealthProfile {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY)
    if (!raw) return emptyProfile()
    const parsed = JSON.parse(raw) as Partial<HealthProfile>
    return {
      allergies: Array.isArray(parsed.allergies) ? parsed.allergies : [],
      otherAllergy: parsed.otherAllergy || "",
      conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
      otherCondition: parsed.otherCondition || "",
    }
  } catch {
    return emptyProfile()
  }
}

export function saveHealthProfile(profile: HealthProfile) {
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
}

export function allergyCategoriesForApi(profile = loadHealthProfile()): string[] {
  const mapped = profile.allergies
    .map((id) => ALLERGY_CATEGORY[id] || id)
    .filter(Boolean)
  if (profile.otherAllergy?.trim()) mapped.push(profile.otherAllergy.trim())
  return Array.from(new Set(mapped))
}

function authHeaders() {
  const token = getAccessToken()
  if (!token) {
    throw new Error("Please sign in again to sync your health profile.")
  }
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }
}

function profileFromApi(data: any): HealthProfile {
  const allergies: string[] = []
  for (const item of data?.allergies || []) {
    const name = String(item?.allergen_name || "").trim()
    if (!name) continue
    allergies.push(API_TO_UI_ALLERGY[name] || name)
  }
  const conditions = (data?.health_conditions || [])
    .map((item: unknown) => String(item || "").trim())
    .filter((item: string) => item && item !== "none")

  return {
    allergies: Array.from(new Set(allergies)),
    otherAllergy: String(data?.other_allergy || "").trim(),
    conditions: Array.from(new Set(conditions)),
    otherCondition: String(data?.other_condition || "").trim(),
  }
}

/** Pull the signed-in user's profile from the API and cache it locally. */
export async function syncHealthProfileFromServer(): Promise<HealthProfile> {
  const response = await fetch(`${requireApiBaseUrl()}/users/me`, {
    method: "GET",
    headers: authHeaders(),
  })
  const data = await response.json().catch(() => null)
  if (response.status === 401) {
    throw new Error("Please sign in again to sync your health profile.")
  }
  if (!response.ok) {
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : "Could not load your health profile.",
    )
  }
  const profile = profileFromApi(data)
  saveHealthProfile(profile)
  return profile
}

/** Save locally and push to the API so the profile survives restarts. */
export async function persistHealthProfile(
  profile: HealthProfile,
): Promise<HealthProfile> {
  saveHealthProfile(profile)

  const token = getAccessToken()
  if (!token) {
    // Still keep the local cache for guests / offline onboarding.
    return profile
  }

  const allergies = profile.allergies
    .filter((id) => id && id !== "other" && id !== "none")
    .map((id) => ({
      allergen_name: ALLERGY_CATEGORY[id] || id,
      severity: "moderate",
    }))

  const health_conditions = profile.conditions.filter(
    (id) => id && id !== "none" && id !== "other",
  )

  const response = await fetch(`${requireApiBaseUrl()}/users/me`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({
      allergies,
      health_conditions,
      other_allergy: profile.otherAllergy?.trim() || "",
      other_condition: profile.otherCondition?.trim() || "",
    }),
  })
  const data = await response.json().catch(() => null)
  if (response.status === 401) {
    throw new Error("Please sign in again to save your health profile.")
  }
  if (!response.ok) {
    const detail = data?.detail
    const message =
      typeof detail === "string"
        ? detail
        : detail?.error || "Could not save your health profile."
    throw new Error(message)
  }

  const synced = profileFromApi(data)
  saveHealthProfile(synced)
  return synced
}
