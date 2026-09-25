import { requireApiBaseUrl } from "./auth"
import { loadHealthProfile } from "./healthProfile"
import { getAccessToken } from "./session"
import type { AllergySignal, StoredScan } from "./scanHistory"

export type AiChatMessage = {
  role: "user" | "assistant"
  content: string
}

function authHeaders() {
  const token = getAccessToken()
  if (!token) {
    throw new Error("Please sign in again to use the AI assistant.")
  }
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }
}

function readError(data: any, fallback: string) {
  const detail = data?.detail
  if (typeof detail === "string" && detail.trim()) return detail
  return detail?.error || data?.message || data?.error || fallback
}

function productPayload(scan: StoredScan | null) {
  if (!scan) {
    return {
      product_name: null,
      brand: null,
      barcode: null,
      verdict: null,
      safety_score: null,
      nutri_score_grade: null,
      explanation: null,
      ingredients: [] as string[],
      ingredients_text: null as string | null,
      allergy_flags: [] as string[],
      allergy_matches: [] as AllergySignal[],
    }
  }
  return {
    product_name: scan.name,
    brand: scan.brand || null,
    barcode: scan.barcode || null,
    verdict: scan.verdict,
    safety_score: scan.score,
    nutri_score_grade: scan.grade,
    explanation: scan.explanation || null,
    ingredients: scan.ingredients || [],
    ingredients_text: scan.ingredientsText || null,
    allergy_flags: scan.allergens || [],
    allergy_matches: scan.allergySignals || [],
    nutrition: scan.nutrition || {},
  }
}

function profilePayload() {
  const profile = loadHealthProfile()
  return {
    allergies: [
      ...profile.allergies,
      ...(profile.otherAllergy?.trim() ? [profile.otherAllergy.trim()] : []),
    ],
    conditions: [
      ...profile.conditions,
      ...(profile.otherCondition?.trim() ? [profile.otherCondition.trim()] : []),
    ],
  }
}

export async function askAiAboutProduct(input: {
  message: string
  scan: StoredScan | null
  history?: AiChatMessage[]
}) {
  const response = await fetch(`${requireApiBaseUrl()}/scan/ai/chat`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      message: input.message,
      product: productPayload(input.scan),
      profile: profilePayload(),
      history: (input.history || []).map((item) => ({
        role: item.role,
        content: item.content,
      })),
    }),
  })
  const data = await response.json().catch(() => null)
  if (response.status === 401) {
    throw new Error("Please sign in again to use the AI assistant.")
  }
  if (!response.ok) {
    throw new Error(readError(data, "The AI assistant could not answer right now."))
  }
  return String(data?.reply || "").trim()
}

export async function requestSafetyReport(input: {
  scan: StoredScan | null
  focus?: string
}) {
  const response = await fetch(`${requireApiBaseUrl()}/scan/ai/safety-report`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      product: productPayload(input.scan),
      profile: profilePayload(),
      focus: input.focus || null,
    }),
  })
  const data = await response.json().catch(() => null)
  if (response.status === 401) {
    throw new Error("Please sign in again to use the AI assistant.")
  }
  if (!response.ok) {
    throw new Error(readError(data, "Could not build a safety report right now."))
  }
  return String(data?.report || "").trim()
}

export async function explainIngredientWithAi(input: {
  ingredient: string
  productName?: string
  conditions?: string[]
  signal?: AbortSignal
}) {
  const response = await fetch(`${requireApiBaseUrl()}/scan/ai/ingredient-explain`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      ingredient: input.ingredient,
      product_name: input.productName || null,
      conditions: input.conditions || profilePayload().conditions,
    }),
    signal: input.signal,
  })
  const data = await response.json().catch(() => null)
  if (response.status === 401) {
    throw new Error("Please sign in again to look up ingredients.")
  }
  if (!response.ok) {
    throw new Error(readError(data, "Could not research this ingredient right now."))
  }
  return {
    title: String(data?.title || input.ingredient),
    category: String(data?.category || ""),
    what_it_is: String(data?.what_it_is || ""),
    commonly_seen_in: String(data?.commonly_seen_in || ""),
    possible_effects: String(data?.possible_effects || ""),
    affects_allergens: Array.isArray(data?.affects_allergens)
      ? data.affects_allergens.map(String)
      : [],
    affects_diets: Array.isArray(data?.affects_diets) ? data.affects_diets.map(String) : [],
    source: String(data?.source || ""),
    aliases: Array.isArray(data?.aliases) ? data.aliases.map(String) : [],
    ai_source: String(data?.ai_source || "template"),
  }
}

export type KnowledgeHit = {
  ingredient_name: string
  aliases: string[]
  category: string
  display_category: string
  what_it_is: string
  commonly_seen_in: string
  possible_effects: string
  affects_allergens: string[]
  affects_diets: string[]
  source: string
}

export async function searchKnowledge(query: string): Promise<KnowledgeHit[]> {
  const response = await fetch(
    `${requireApiBaseUrl()}/knowledge/search?q=${encodeURIComponent(query)}&limit=8`,
    { headers: authHeaders() },
  )
  const data = await response.json().catch(() => null)
  if (response.status === 401) {
    throw new Error("Please sign in again to search Scanity.")
  }
  if (!response.ok) {
    throw new Error(readError(data, "Scanity knowledge is unavailable right now."))
  }
  const rows = Array.isArray(data?.results) ? data.results : []
  return rows.map((row: any) => ({
    ingredient_name: String(row?.ingredient_name || ""),
    aliases: Array.isArray(row?.aliases) ? row.aliases.map(String) : [],
    category: String(row?.category || ""),
    display_category: String(row?.display_category || "Food term"),
    what_it_is: String(row?.what_it_is || ""),
    commonly_seen_in: String(row?.commonly_seen_in || ""),
    possible_effects: String(row?.possible_effects || ""),
    affects_allergens: Array.isArray(row?.affects_allergens) ? row.affects_allergens.map(String) : [],
    affects_diets: Array.isArray(row?.affects_diets) ? row.affects_diets.map(String) : [],
    source: String(row?.source || ""),
  }))
}
