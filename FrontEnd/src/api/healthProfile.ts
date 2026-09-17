const PROFILE_KEY = "scanityHealthProfile"

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
