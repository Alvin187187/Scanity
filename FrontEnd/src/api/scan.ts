import { requireApiBaseUrl } from "./auth"
import { getAccessToken } from "./session"

type AllergyList = string[]

const OFF_TIMEOUT_MS = 12_000
const API_TIMEOUT_MS = 10_000

function readError(data: any, fallback: string) {
  const detail = data?.detail
  if (typeof detail === "string" && detail.trim()) return detail
  return detail?.error || data?.message || data?.error || fallback
}

function cleanIngredientLabel(value: string): string {
  return String(value || "")
    .replace(/\([^)]*\d[^)]*\)/g, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:g|mg|kg|mcg|µg|ug|kcal|kj|%|ml|oz)\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:./()-]+|[\s,;:./()-]+$/g, "")
    .trim()
}

function ingredientsFromOff(product: any): string[] {
  const list = Array.isArray(product?.ingredients) ? product.ingredients : []
  const names = list
    .map((item: any) => cleanIngredientLabel(String(item?.text || item?.id || "")))
    .filter((item: string) => item.length > 1)
  if (names.length) return Array.from(new Set(names)).slice(0, 40)

  const raw = String(product?.ingredients_text || product?.ingredients_text_en || "")
  if (!raw.trim()) return []
  return Array.from(new Set(
    raw
      .split(/[,;\n]+/)
      .map((item) => cleanIngredientLabel(item))
      .filter((item) => item.length > 1 && item.length < 80),
  )).slice(0, 40)
}

const OFF_ALLERGENS: Record<string, { category: string; name: string }> = {
  "en:milk": { category: "milk", name: "Milk" },
  "en:gluten": { category: "wheat", name: "Gluten" },
  "en:soybeans": { category: "soy", name: "Soy" },
  "en:soy": { category: "soy", name: "Soy" },
  "en:nuts": { category: "tree_nuts", name: "Tree nuts" },
  "en:peanuts": { category: "peanut", name: "Peanuts" },
  "en:eggs": { category: "egg", name: "Eggs" },
  "en:egg": { category: "egg", name: "Eggs" },
  "en:fish": { category: "fish", name: "Fish" },
  "en:crustaceans": { category: "shellfish", name: "Shellfish" },
  "en:molluscs": { category: "shellfish", name: "Shellfish" },
  "en:celery": { category: "celery", name: "Celery" },
  "en:mustard": { category: "mustard", name: "Mustard" },
  "en:sesame-seeds": { category: "sesame", name: "Sesame" },
  "en:sulphur-dioxide-and-sulphites": { category: "sulphites", name: "Sulphites" },
  "en:lupin": { category: "lupin", name: "Lupin" },
}

function declaredAllergensFromOff(product: any): { name: string; category: string; trace: boolean }[] {
  const found: { name: string; category: string; trace: boolean }[] = []
  const seen = new Set<string>()
  const take = (tags: unknown, trace: boolean) => {
    const values = Array.isArray(tags) ? tags : String(tags || "").split(",")
    for (const tag of values) {
      const mapped = OFF_ALLERGENS[String(tag).trim().toLowerCase()]
      if (!mapped) continue
      const key = `${mapped.category}:${trace ? 1 : 0}`
      if (seen.has(key)) continue
      seen.add(key)
      found.push({ name: mapped.name, category: mapped.category, trace })
    }
  }
  take(product?.allergens_tags, false)
  take(product?.traces_tags, true)
  return found
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
    return Number(value)
  }
  return null
}

function estimateNutriScoreGrade(nutrition: Record<string, number | null | undefined> | null | undefined): string | null {
  if (!nutrition) return null
  const sugars = asNumber(nutrition.sugars_g)
  const satFat = asNumber(nutrition.sat_fat_g)
  let sodium = asNumber(nutrition.sodium_mg)
  if (sodium != null && sodium <= 5) sodium = sodium * 1000
  const fiber = asNumber(nutrition.fiber_g)
  const protein = asNumber(nutrition.protein_g)
  let energyKj = asNumber(nutrition.energy_kj)
  if (energyKj == null) {
    const kcal = asNumber(nutrition.energy_kcal)
    if (kcal != null) energyKj = kcal * 4.184
  }
  const present = [sugars, satFat, sodium, fiber, protein, energyKj].filter((value) => value != null)
  if (present.length < 3) return null
  let points = 0
  if (energyKj != null) points += energyKj < 335 ? 0 : energyKj < 670 ? 1 : energyKj < 1005 ? 2 : energyKj < 1340 ? 3 : 4
  if (sugars != null) points += sugars < 4.5 ? 0 : sugars < 9 ? 1 : sugars < 13.5 ? 2 : sugars < 18 ? 3 : 4
  if (satFat != null) points += satFat < 1 ? 0 : satFat < 2 ? 1 : satFat < 3 ? 2 : satFat < 4 ? 3 : 4
  if (sodium != null) points += sodium < 90 ? 0 : sodium < 180 ? 1 : sodium < 270 ? 2 : sodium < 360 ? 3 : 4
  if (fiber != null) points -= fiber < 0.9 ? 0 : fiber < 1.9 ? 1 : fiber < 2.8 ? 2 : 3
  if (protein != null) points -= protein < 1.6 ? 0 : protein < 3.2 ? 1 : protein < 4.8 ? 2 : 3
  if (points <= -1) return "a"
  if (points <= 2) return "b"
  if (points <= 10) return "c"
  if (points <= 18) return "d"
  return "e"
}

function officialNutriGrade(value: unknown): string | null {
  const letter = String(value || "").trim().toLowerCase().slice(0, 1)
  return letter === "a" || letter === "b" || letter === "c" || letter === "d" || letter === "e"
    ? letter
    : null
}

function offIngredientsIncomplete(product: any, ingredientNames: string[]): boolean {
  const tags = product?.states_tags || product?.states || ""
  const blob = Array.isArray(tags) ? tags.join(" ") : String(tags)
  if (/ingredients-(incomplete|to-be-completed|missing)/i.test(blob)) return true
  return ingredientNames.length === 0
}

function nutritionFromOff(product: any) {
  const n = product?.nutriments || {}
  const energyKcal =
    asNumber(n["energy-kcal_100g"]) ??
    asNumber(n["energy-kcal"]) ??
    asNumber(n.energy_value)
  const energyKj =
    asNumber(n["energy-kj_100g"]) ??
    asNumber(n["energy-kj"]) ??
    (energyKcal != null ? energyKcal * 4.184 : asNumber(n.energy_100g))
  return {
    energy_kj: energyKj,
    energy_kcal: energyKcal,
    sugars_g: asNumber(n.sugars_100g),
    sat_fat_g: asNumber(n["saturated-fat_100g"]),
    sodium_mg:
      asNumber(n.sodium_100g) != null
        ? Number(n.sodium_100g) * 1000
        : asNumber(n.salt_100g) != null
          ? Number(n.salt_100g) * 400
          : null,
    fiber_g: asNumber(n.fiber_100g),
    protein_g: asNumber(n.proteins_100g),
  }
}

const CONFIRMED_ALLERGEN_WORDS: Record<string, string[]> = {
  peanut: ["peanut", "peanuts", "groundnut", "groundnuts", "arachide"],
  tree_nuts: ["almond", "cashew", "hazelnut", "walnut", "pecan", "pistachio", "macadamia", "brazil nut"],
  milk: ["milk", "lactose", "whey", "casein", "caseinate", "cream", "butter", "cheese", "yogurt"],
  egg: ["egg", "eggs", "albumin", "mayonnaise"],
  wheat: ["wheat", "gluten", "barley", "rye"],
  soy: ["soy", "soya", "soybean", "soybeans"],
  fish: ["fish", "anchovy", "salmon", "tuna", "cod"],
  shellfish: ["shrimp", "prawn", "crab", "lobster", "shellfish"],
  sesame: ["sesame"],
  mustard: ["mustard"],
  celery: ["celery"],
  sulphites: ["sulphite", "sulfite", "sulphites", "sulfites"],
}

function allergenSlug(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .trim()
}

function hasWholeWord(haystack: string, needle: string): boolean {
  const cleaned = needle.trim().toLowerCase()
  if (cleaned.length < 3) return false
  const escaped = cleaned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i").test(haystack)
}

// Offline copy of ai/safety_score.py. Same anchors, same UK front-of-pack
// cut-offs. The server seed match is stricter; this only runs when the API
// did not return a score.
const AVOID_ANCHOR = 32
const AVOID_EXTRA_HIT = 8
const AVOID_RED = 4
const AVOID_AMBER = 2
const AVOID_UNKNOWN_CAP = 4
const UNKNOWN_ANCHOR = 64
const UNKNOWN_STEP = 3
const UNKNOWN_FLOOR = 46
const INCOMPLETE_ANCHOR = 58
const CONDITION_ANCHOR = { none: 58, green: 58, amber: 50, red: 42 } as const
const CONDITION_EXTRA = 4
const CONDITION_FLOOR = 40
const CONDITION_UNKNOWN_CAP = 4
const SAFE_SCORE = 100

function fsaBand(value: number, low: number, high: number): "green" | "amber" | "red" {
  if (value > high) return "red"
  if (value > low) return "amber"
  return "green"
}

function activeConditionSet(conditions: string[]): Set<string> {
  const out = new Set<string>()
  for (const raw of conditions) {
    const name = String(raw || "").toLowerCase()
    if (name.includes("diabetes")) out.add("diabetes")
    if (name.includes("lactose")) out.add("lactose")
    if (name.includes("celiac") || name.includes("coeliac")) out.add("celiac")
    if (name.includes("hypertension") || name.includes("blood pressure")) out.add("hypertension")
    if (name.includes("kidney")) out.add("kidney")
    if (name.includes("heart")) out.add("heart")
    if (name.includes("ibs") || name.includes("crohn")) out.add("ibs")
  }
  return out
}

function evidenceSafetyScore(
  matches: { ingredient: string; status: string; matched_category: string | null }[],
  conditions: string[],
  nutrition: Record<string, number | null | undefined> | undefined,
  ingredientCount: number,
) {
  const active = activeConditionSet(conditions)
  const nutritionLine = /^(sugars|sodium|sat\.?\s*fat)\s+\d/i
  const avoid = matches.filter((item) => item.status === "avoid" && !nutritionLine.test(item.ingredient))
  const unknown = matches.filter((item) => {
    if (item.status !== "caution" || nutritionLine.test(item.ingredient)) return false
    if (/^ingredient list$/i.test(item.ingredient.trim())) return false
    const category = String(item.matched_category || "").toLowerCase()
    return !active.has(category)
  })
  const conditionHits = new Set(
    matches
      .filter((item) => item.status === "caution" && !nutritionLine.test(item.ingredient))
      .map((item) => String(item.matched_category || "").toLowerCase())
      .filter((name) => active.has(name)),
  )
  const sugars = nutrition?.sugars_g
  const sodium = nutrition?.sodium_mg
  const satFat = nutrition?.sat_fat_g
  const bands: { band: "green" | "amber" | "red"; points: number }[] = []
  if (active.has("diabetes") && typeof sugars === "number") {
    const band = fsaBand(sugars, 5, 22.5)
    bands.push({ band, points: band === "red" ? AVOID_RED : band === "amber" ? AVOID_AMBER : 0 })
    if (band === "amber" || band === "red") conditionHits.add("diabetes")
  }
  if ((active.has("hypertension") || active.has("kidney") || active.has("heart")) && typeof sodium === "number") {
    const band = fsaBand(sodium, 120, 600)
    bands.push({ band, points: band === "red" ? AVOID_RED : band === "amber" ? AVOID_AMBER : 0 })
    if (band === "amber" || band === "red") {
      if (active.has("hypertension")) conditionHits.add("hypertension")
      else if (active.has("kidney")) conditionHits.add("kidney")
      else conditionHits.add("heart")
    }
  }
  if (active.has("heart") && typeof satFat === "number") {
    const band = fsaBand(satFat, 1.5, 5)
    bands.push({ band, points: band === "red" ? AVOID_RED : band === "amber" ? AVOID_AMBER : 0 })
    if (band === "amber" || band === "red") conditionHits.add("heart")
  }
  const worst = bands.some((item) => item.band === "red")
    ? "red"
    : bands.some((item) => item.band === "amber")
      ? "amber"
      : bands.some((item) => item.band === "green")
        ? "green"
        : "none"
  const incomplete = ingredientCount === 0 || matches.some((item) => /^ingredient list$/i.test(item.ingredient.trim()))

  let score = SAFE_SCORE
  let summary = `${SAFE_SCORE} because this label did not match the allergies or conditions you saved. Formula: ${SAFE_SCORE}.`
  if (avoid.length) {
    const extra = Math.max(0, avoid.length - 1) * AVOID_EXTRA_HIT
    const nutrient = Math.min(8, bands.reduce((sum, item) => sum + item.points, 0))
    const unknownPoints = Math.min(AVOID_UNKNOWN_CAP, unknown.length)
    const raw = AVOID_ANCHOR - extra - nutrient - unknownPoints
    score = Math.max(0, Math.min(39, raw))
    const formula = [String(AVOID_ANCHOR), extra ? `− ${extra}` : "", nutrient ? `− ${nutrient}` : "", unknownPoints ? `− ${unknownPoints}` : ""]
      .filter(Boolean)
      .join(" ")
    summary = `${score} because ${avoid.length} ingredient${avoid.length === 1 ? "" : "s"} matched an allergy or restriction you saved. Formula: ${formula} = ${score}.`
  } else if (conditionHits.size) {
    const anchor = CONDITION_ANCHOR[worst === "green" ? "green" : worst]
    const extra = Math.max(0, conditionHits.size - 1) * CONDITION_EXTRA
    const unknownPoints = Math.min(CONDITION_UNKNOWN_CAP, unknown.length)
    score = Math.max(CONDITION_FLOOR, Math.min(69, anchor - extra - unknownPoints))
    summary = `${score} because a saved condition applies to this label. Formula: ${anchor}${extra ? ` − ${extra}` : ""}${unknownPoints ? ` − ${unknownPoints}` : ""} = ${score}.`
  } else if (unknown.length) {
    const steps = Math.max(0, unknown.length - 1) * UNKNOWN_STEP
    score = Math.max(UNKNOWN_FLOOR, UNKNOWN_ANCHOR - steps)
    summary = `${score} because ${unknown.length} ingredient${unknown.length === 1 ? "" : "s"} could not be identified. Formula: ${UNKNOWN_ANCHOR}${steps ? ` − ${steps}` : ""} = ${score}.`
  } else if (incomplete) {
    score = INCOMPLETE_ANCHOR
    summary = `${INCOMPLETE_ANCHOR} because this product has no complete ingredient list to check. Formula: ${INCOMPLETE_ANCHOR}.`
  }

  const band = score >= 70 ? "safe" : score >= 40 ? "caution" : "avoid"
  return {
    safety_score: score,
    score_breakdown: {
      score,
      band,
      system: "scanity-evidence-v1",
      summary,
      formula: String(score),
      lines: [{ code: "offline", label: "Offline check", detail: summary }],
      clamped: false,
    },
  }
}

/** Lightweight client-side match when the Scanity API is asleep or unreachable. */
function localDefinition(name: string, plain?: string): string {
  const label = cleanIngredientLabel(name) || name
  const display = label.charAt(0).toUpperCase() + label.slice(1)
  const extra = String(plain || "").replace(/\*\*/g, "").trim()
  if (extra && !/tap ai|check the ai|could not fully/i.test(extra)) return extra
  return `${display} is listed on this product.`
}

function localAllergyAnalysis(
  ingredientNames: string[],
  userAllergies: AllergyList,
  userConditions: AllergyList = [],
  nutrition?: Record<string, number | null | undefined>,
  ingredientsIncomplete = false,
  declaredAllergens: { name: string; category: string; trace: boolean }[] = [],
) {
  const allergy_matches: {
    ingredient: string
    status: string
    matched_category: string | null
    matched_kb_entry: string | null
    reason: string
  }[] = []

  const conditions = userConditions.map((item) => String(item || "").toLowerCase())
  const hasDiabetes = conditions.includes("diabetes")
  const hasLactose = conditions.includes("lactose")
  const sugarWords = [
    "sugar",
    "glucose",
    "fructose",
    "syrup",
    "sucrose",
    "maltodextrin",
    "honey",
    "sucralose",
    "acesulfame",
    "aspartame",
    "saccharin",
    "stevia",
    "sorbitol",
    "mannitol",
    "xylitol",
    "maltitol",
    "e950",
    "e951",
    "e955",
    "e960",
  ]
  const dairyWords = ["milk", "lactose", "whey", "casein", "cream", "butter", "cheese", "yogurt"]

  for (const name of ingredientNames) {
    const lower = name.toLowerCase()
    let matched = false
    for (const allergy of userAllergies) {
      const slug = allergenSlug(allergy).replace(/\s+/g, "_")
      const words = CONFIRMED_ALLERGEN_WORDS[slug] || CONFIRMED_ALLERGEN_WORDS[allergenSlug(allergy).replace(/ /g, "_")] || []
      const direct = allergenSlug(allergy)
      const needles = words.length ? words : direct.length >= 4 ? [direct] : []
      if (needles.some((needle) => hasWholeWord(lower, needle))) {
        allergy_matches.push({
          ingredient: name,
          status: "avoid",
          matched_category: allergy,
          matched_kb_entry: allergy,
          reason: `This looks like **${direct || allergy}**, which you asked Scanity to watch for.`,
        })
        matched = true
        break
      }
    }
    if (matched) continue
    if (hasLactose && dairyWords.some((word) => lower.includes(word))) {
      allergy_matches.push({
        ingredient: name,
        status: "avoid",
        matched_category: "lactose",
        matched_kb_entry: name,
        reason: "This looks like **dairy / lactose**, which you asked Scanity to watch for.",
      })
      continue
    }
    if (hasDiabetes && sugarWords.some((word) => lower.includes(word))) {
      allergy_matches.push({
        ingredient: name,
        status: "caution",
        matched_category: "diabetes",
        matched_kb_entry: name,
        reason: "This adds **sugars / sweet carbs** — worth watching if you manage blood sugar.",
      })
    }
  }

  const sugars = nutrition?.sugars_g
  if (hasDiabetes && typeof sugars === "number" && sugars > 5) {
    const high = sugars > 22.5
    const plain = high
      ? `The nutrition panel lists ${sugars} g of sugars per 100 g, over the UK high line of 22.5 g.`
      : `The nutrition panel lists ${sugars} g of sugars per 100 g, in the UK medium band.`
    const sugarChip = allergy_matches.find((item) => /\bsugars?\b/i.test(item.ingredient))
    if (sugarChip) {
      if (sugarChip.status !== "avoid") sugarChip.status = "caution"
      sugarChip.reason = plain
    } else {
      allergy_matches.push({
        ingredient: "Sugars",
        status: "caution",
        matched_category: "diabetes",
        matched_kb_entry: "sugars",
        reason: plain,
      })
    }
  }

  const covered = new Set(
    allergy_matches
      .map((item) => allergenSlug(String(item.matched_category || "")).replace(/\s+/g, "_"))
      .filter(Boolean),
  )
  for (const declared of declaredAllergens) {
    const category = allergenSlug(declared.category).replace(/\s+/g, "_")
    if (!category || covered.has(category)) continue
    const profileHit = userAllergies.some((allergy) => {
      const slug = allergenSlug(allergy).replace(/\s+/g, "_")
      return slug === category || allergenSlug(allergy) === declared.name.toLowerCase()
    })
    if (profileHit && !declared.trace) {
      allergy_matches.push({
        ingredient: declared.name,
        status: "avoid",
        matched_category: declared.category,
        matched_kb_entry: declared.name,
        reason: `The product label declares ${declared.name.toLowerCase()} as an allergen, which you asked Scanity to watch for.`,
      })
    } else if (profileHit && declared.trace) {
      allergy_matches.push({
        ingredient: declared.name,
        status: "caution",
        matched_category: declared.category,
        matched_kb_entry: declared.name,
        reason: `The label says this product may contain ${declared.name.toLowerCase()}, which you asked Scanity to watch for.`,
      })
    } else {
      allergy_matches.push({
        ingredient: declared.name,
        status: "safe",
        matched_category: declared.category,
        matched_kb_entry: declared.name,
        reason: declared.trace
          ? `The product label says it may contain ${declared.name.toLowerCase()}.`
          : `The product label declares ${declared.name.toLowerCase()} as an allergen.`,
      })
    }
    covered.add(category)
  }

  if (ingredientsIncomplete && !allergy_matches.some((item) => item.status === "avoid")) {
    allergy_matches.push({
      ingredient: "Ingredient list",
      status: "caution",
      matched_category: null,
      matched_kb_entry: null,
      reason: "The ingredient list is incomplete, so a saved allergy may not have reached the check.",
    })
  }

  const allergy_flags = allergy_matches
    .filter((item) => item.status === "avoid")
    .map((item) => item.ingredient)
  const avoidCount = allergy_flags.length
  const cautionCount = allergy_matches.filter((item) => item.status === "caution").length
  const scored = evidenceSafetyScore(
    allergy_matches,
    conditions,
    nutrition,
    ingredientNames.length,
  )
  const safety_score = scored.safety_score
  const verdict = avoidCount ? "avoid" : cautionCount || !ingredientNames.length || ingredientsIncomplete ? "caution" : "safe"

  const label_insights = [...ingredientNames, ...allergy_matches.map((item) => item.ingredient)]
    .filter((name, index, all) => {
      const label = cleanIngredientLabel(name)
      return label.length > 1 && all.findIndex((item) => cleanIngredientLabel(item).toLowerCase() === label.toLowerCase()) === index
    })
    .slice(0, 40)
    .map((name) => {
      const match = allergy_matches.find(
        (item) => cleanIngredientLabel(item.ingredient).toLowerCase() === cleanIngredientLabel(name).toLowerCase(),
      )
      const title = cleanIngredientLabel(name)
      return {
        ingredient: title,
        title,
        category: match?.matched_category ? "Allergen" : "Ingredient",
        what_it_is: localDefinition(title, match?.reason),
        commonly_seen_in: "",
        possible_effects: "",
        affects_allergens: match?.status === "avoid" && match.matched_category ? [match.matched_category] : [],
        affects_diets: [],
        source: "Scanity label note",
        aliases: [],
        needs_ai: false,
      }
    })

  return {
    allergy_flags,
    allergy_matches,
    label_insights,
    verdict,
    safety_score,
    score_breakdown: scored.score_breakdown,
    nutri_score_grade: null as string | null,
    explanation: avoidCount
      ? `**Avoid** — ${allergy_flags.slice(0, 3).map((n) => `**${n}**`).join(", ")} lined up with an allergy or dietary restriction you asked Scanity to watch for.`
      : cautionCount
        ? `**Flagged** — ${cautionCount} item(s) need a closer look for your saved dietary restrictions.`
        : ingredientNames.length && !ingredientsIncomplete
          ? "**Safe** for your saved allergies and dietary restrictions based on this label check."
          : "**Flagged** — product details came through, but the ingredient list looked incomplete.",
    ai_source: "local",
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    window.clearTimeout(timer)
  }
}

async function fetchOffProduct(barcode: string): Promise<any> {
  const headers = {
    Accept: "application/json",
    "User-Agent": "Scanity/1.0 (https://scanity-eta.vercel.app)",
  }
  const urls = [
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
    `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`,
  ]

  let lastError: Error | null = null
  for (const url of urls) {
    try {
      const response = await fetchWithTimeout(url, { headers, mode: "cors" }, OFF_TIMEOUT_MS)
      if (!response.ok) {
        lastError = new Error("Unable to reach the product database. Please try again.")
        continue
      }
      const data = await response.json().catch(() => null)
      if (data && data.status === 1 && data.product) return data
      if (data && data.status === 0) {
        throw new Error("__PRODUCT_NOT_FOUND__")
      }
      lastError = new Error("__PRODUCT_NOT_FOUND__")
    } catch (error) {
      if (error instanceof Error && error.message === "__PRODUCT_NOT_FOUND__") throw error
      lastError =
        error instanceof Error
          ? error
          : new Error("Unable to reach the product database. Please try again.")
    }
  }
  throw lastError || new Error("Unable to reach the product database. Please try again.")
}

async function lookupViaOpenFoodFacts(
  barcode: string,
  userAllergies: AllergyList,
  userConditions: AllergyList = [],
) {
  const data = await fetchOffProduct(barcode)
  const product = data.product
  const ingredientNames = ingredientsFromOff(product)
  const nutrition = nutritionFromOff(product)
  const nutriFromOff = officialNutriGrade(product.nutriscore_grade || product.nutrition_grades)
  const incomplete = offIngredientsIncomplete(product, ingredientNames)

  let analysis: any = localAllergyAnalysis(
    ingredientNames,
    userAllergies,
    userConditions,
    nutrition,
    incomplete,
    declaredAllergensFromOff(product),
  )
  analysis.nutri_score_grade = nutriFromOff || estimateNutriScoreGrade(nutrition)

  // Keep OFF path fast: local rules only. Full server analysis already runs on
  // /scan/barcode when the API is reachable; chip tap still does AI research.
  return {
    product: {
      product_id: `off-${barcode}`,
      barcode,
      product_name: product.product_name || product.product_name_en || "Unknown product",
      brand: String(product.brands || "")
        .split(",")[0]
        ?.trim() || null,
      category: String(product.categories || "")
        .split(",")[0]
        ?.trim() || null,
      image_url: product.image_url || product.image_front_url || null,
      ingredients_raw_text: product.ingredients_text || product.ingredients_text_en || "",
      ingredients: ingredientNames.map((name) => ({ name, is_allergen: false })),
      nutrition,
      ingredients_incomplete: incomplete,
    },
    allergy_flags: analysis.allergy_flags || [],
    allergy_matches: analysis.allergy_matches || [],
    label_insights: analysis.label_insights || [],
    verdict: analysis.verdict || null,
    safety_score: analysis.safety_score ?? null,
    score_breakdown: analysis.score_breakdown || null,
    nutri_score_grade: analysis.nutri_score_grade || null,
    explanation: analysis.explanation || null,
    ai_source: analysis.ai_source || "local",
    source: "openfoodfacts-fallback",
  }
}

const TITLE_NOISE =
  /^(ingredients?|ingredientes?|nutrition|nutritional|contains|allergen|allergens|serving|calories|energy|protein|total|saturated|carbohydrate|sugars?|sodium|fat|dietary|best before|www\.|http|imported|manufactured|net wt|net weight|per 100|may contain|storage|keep|distributed)/i

const TITLE_DESCRIPTION =
  /\b(made with|baked with|perfect for|serving suggestion|delicious|recipe|contains|rich in|source of|for your family|no artificial)\b/i

const GENERIC_TITLE_WORDS = new Set([
  "water",
  "milk",
  "drink",
  "original",
  "natural",
  "fresh",
  "pure",
  "size",
  "net",
  "food",
])

function titleTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !["the", "and", "with", "for"].includes(token))
}

function tokensClose(left: string, right: string): boolean {
  if (left === right) return true
  if (left.length > 3 && (right.includes(left) || left.includes(right))) return true
  if (Math.min(left.length, right.length) < 5 || Math.abs(left.length - right.length) > 1) return false
  let mismatches = 0
  const limit = Math.max(left.length, right.length)
  for (let index = 0; index < limit; index += 1) {
    if (left[index] !== right[index]) mismatches += 1
    if (mismatches > 1) return false
  }
  return mismatches === 1
}

function looksLikeDescription(line: string): boolean {
  if (line.includes(",") || TITLE_DESCRIPTION.test(line)) return true
  return line.split(/\s+/).length > 7
}

/** Drop sizes and pack noise so Open Food Facts can match the printed name. */
export function cleanSearchQuery(name: string): string {
  return String(name || "")
    .replace(/\b\d+([.,]\d+)?\s?(ml|l|g|kg|oz|fl\.?\s?oz|pk|pack)\b/gi, " ")
    .replace(/\b(net\s+wt|net\s+weight|best\s+before)\b/gi, " ")
    .replace(/[_|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function uniqueTitles(values: string[]): string[] {
  const seen = new Set<string>()
  const titles: string[] = []
  for (const value of values) {
    const cleaned = cleanSearchQuery(value)
    const key = cleaned.toLowerCase()
    if (!cleaned || cleaned.length < 3 || seen.has(key)) continue
    seen.add(key)
    titles.push(cleaned.slice(0, 80))
  }
  return titles
}

/** True when the proposed name still uses the words that were read off the package. */
export function titleAgreesWithOcr(title: string, source: string): boolean {
  const wanted = titleTokens(title)
  if (!wanted.length) return false
  const haystack = titleTokens(source)
  const hit = (token: string) => haystack.some((word) => tokensClose(token, word))
  const distinctive = wanted.filter((token) => !GENERIC_TITLE_WORDS.has(token))
  const required = distinctive.length ? distinctive : wanted
  const hits = required.filter(hit).length
  return hits / required.length >= 0.67
}

function productNameScore(query: string, candidate: string): number {
  const wanted = titleTokens(query).filter((token) => !GENERIC_TITLE_WORDS.has(token))
  if (!wanted.length) return 0
  const haystack = titleTokens(candidate)
  if (!haystack.length) return 0
  const hits = wanted.filter((token) => haystack.some((word) => tokensClose(token, word))).length
  return hits / wanted.length
}

function brandsText(brands: unknown): string {
  if (Array.isArray(brands)) {
    return brands.map((part) => String(part || "").trim()).filter(Boolean).join(" ")
  }
  return String(brands || "").trim()
}

function offHitBlob(product: {
  product_name?: string
  brand?: string
  brands?: unknown
}): string {
  return [product.product_name, product.brand, brandsText(product.brands)].filter(Boolean).join(" ")
}

function offHitScore(
  query: string,
  product: { product_name?: string; brand?: string; brands?: unknown; image_url?: string },
): number {
  const wanted = titleTokens(query).filter((token) => !GENERIC_TITLE_WORDS.has(token))
  const haystack = titleTokens(offHitBlob(product))
  if (!wanted.length || !haystack.length) return 0
  const hits = wanted.filter((token) => haystack.some((word) => tokensClose(token, word))).length
  if (wanted.length <= 3 && hits < wanted.length) return 0
  const ratio = hits / wanted.length
  if (ratio < 0.67) return 0
  let score = ratio * 100
  const brand = (product.brand || brandsText(product.brands)).toLowerCase()
  const name = String(product.product_name || "").toLowerCase()
  const needle = query.trim().toLowerCase()
  if (needle && (brand === needle || brand.split(",")[0].trim() === needle || brand.includes(needle))) {
    score += 50
  }
  if (needle && (name === needle || name.startsWith(needle))) score += 30
  if (product.image_url) score += 5
  score -= Math.min(15, haystack.filter((token) => !wanted.includes(token)).length)
  return score
}

function rankOffHits(
  query: string,
  products: any[],
): { code: string; product_name: string; brand?: string; image_url?: string }[] {
  return products
    .map((product) => {
      const code = String(product?.code || product?._id || "").trim()
      const mapped = {
        code,
        product_name: String(product?.product_name || product?.product_name_en || "").trim(),
        brand: brandsText(product?.brands) || String(product?.brand || "").trim() || undefined,
        image_url: String(product?.image_url || product?.image_front_url || "").trim() || undefined,
      }
      return { ...mapped, score: code ? offHitScore(query, mapped) : 0 }
    })
    .filter((product) => product.code && product.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ score: _score, ...product }) => product)
}

function rankTitleLine(line: string, index: number) {
  const words = line.split(/\s+/)
  const genericOnly = words.every((word) => GENERIC_TITLE_WORDS.has(word.toLowerCase().replace(/[.,]/g, "")))
  const singleGeneric = words.length === 1 && genericOnly
  return [singleGeneric ? 2 : genericOnly ? 1 : 0, index, Math.abs(words.length - 3)] as const
}

/** Ranked product-name guesses from noisy package OCR. */
export function candidateProductTitles(text: string): string[] {
  const lines: string[] = []
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").replace(/^[\s.|–—-]+|[\s.|–—-]+$/g, "")
    if (line.length < 3 || line.length > 60) continue
    if (TITLE_NOISE.test(line) || looksLikeDescription(line)) continue
    if (/^[\d\s./%-]+$/.test(line)) continue
    if (line.replace(/[^A-Za-z]/g, "").length < 3) continue
    lines.push(line)
  }
  const ranked = lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => {
      const left = rankTitleLine(a.line, a.index)
      const right = rankTitleLine(b.line, b.index)
      return left[0] - right[0] || left[1] - right[1] || left[2] - right[2]
    })
  return uniqueTitles(ranked.map((item) => item.line)).slice(0, 5)
}

/** Pick the product name near the top of the package, not a short generic word. */
export function productTitleFromOcr(text: string): string {
  return candidateProductTitles(text)[0] || ""
}

async function offSearch(query: string): Promise<{ code: string; product_name: string }[]> {
  const distinctive = titleTokens(query).filter((token) => !GENERIC_TITLE_WORDS.has(token))
  if (distinctive.length === 0) return []
  const urls = [
    "https://search.openfoodfacts.org/search?" +
      new URLSearchParams({ q: query, page_size: "40" }).toString(),
    "https://world.openfoodfacts.org/cgi/search.pl?" +
      new URLSearchParams({
        search_terms: query,
        search_simple: "1",
        action: "process",
        json: "1",
        page_size: "40",
      }).toString(),
  ]
  for (const url of urls) {
    try {
      const response = await fetchWithTimeout(
        url,
        {
          headers: { Accept: "application/json" },
          mode: "cors",
        },
        OFF_TIMEOUT_MS,
      )
      if (!response.ok) continue
      const data = await response.json().catch(() => null)
      const products = Array.isArray(data?.hits)
        ? data.hits
        : Array.isArray(data?.products)
          ? data.products
          : []
      const ranked = rankOffHits(query, products)
      if (ranked.length) return ranked
    } catch {
      // Try the next Open Food Facts host.
    }
  }
  return []
}

async function searchViaScanityApi(query: string): Promise<{ code: string; product_name: string }[]> {
  const token = getAccessToken()
  if (!token) return []
  try {
    const response = await fetchWithTimeout(
      `${requireApiBaseUrl()}/scan/search?q=${encodeURIComponent(query)}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      },
      API_TIMEOUT_MS,
    )
    if (!response.ok) return []
    const data = await response.json().catch(() => null)
    const products = Array.isArray(data?.products) ? data.products : []
    return rankOffHits(query, products)
  } catch {
    return []
  }
}

export async function searchOffByName(name: string): Promise<{ code: string; product_name: string }[]> {
  const query = cleanSearchQuery(name)
  const distinctive = titleTokens(query).filter((token) => !GENERIC_TITLE_WORDS.has(token))
  if (distinctive.length === 0) return []
  const fromApi = await searchViaScanityApi(query)
  if (fromApi.length) return fromApi
  const first = await offSearch(query)
  if (first.length) return first
  const shortened = distinctive.slice(0, 3).join(" ")
  if (shortened.toLowerCase() === query.toLowerCase()) return []
  const fromShortApi = await searchViaScanityApi(shortened)
  if (fromShortApi.length) return fromShortApi
  return offSearch(shortened)
}

export async function lookupBarcodeProduct(
  barcode: string,
  userAllergies: AllergyList = [],
  userConditions: AllergyList = [],
) {
  const token = getAccessToken()
  const clean = barcode.trim()

  // Race: try Scanity API when signed in, but always keep OFF available.
  // Many phones lose scans when Render is cold; OFF is the reliable path.
  const offPromise = lookupViaOpenFoodFacts(clean, userAllergies, userConditions)

  if (!token) {
    return await offPromise
  }

  try {
    const response = await fetchWithTimeout(
      `${requireApiBaseUrl()}/scan/barcode`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          barcode: clean,
          user_allergies: userAllergies,
          user_conditions: userConditions,
        }),
      },
      API_TIMEOUT_MS,
    )

    const data = await response.json().catch(() => null)

    if (response.status === 401) {
      console.warn("Barcode API unauthorized; using Open Food Facts fallback.")
      return await offPromise
    }

    if (
      response.status === 404 ||
      data?.found === false ||
      data?.productFound === false ||
      data?.product_found === false ||
      data?.status === "not_found"
    ) {
      return await offPromise
    }

    if (response.status === 400 || response.status === 422) {
      throw new Error(readError(data, "The barcode sent to the server is invalid."))
    }

    if (!response.ok) {
      console.warn(
        "Barcode API failed, using Open Food Facts fallback:",
        readError(data, response.statusText),
      )
      return await offPromise
    }

    if (!data) throw new Error("The server returned an empty response.")
    if (data?.product === null || data?.productInformation === null || data?.data === null) {
      return await offPromise
    }

    // Prefer API payload, but fill missing nutrition/image from OFF when useful.
    try {
      const off = await Promise.race([
        offPromise.catch(() => null),
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 2500)),
      ])
      if (off?.product) {
        const apiIngredients = Array.isArray(data.product?.ingredients) ? data.product.ingredients : []
        const offIngredients = Array.isArray(off.product?.ingredients) ? off.product.ingredients : []
        const ingredients = apiIngredients.length ? apiIngredients : offIngredients
        const apiNames = apiIngredients
          .map((item: { name?: string }) => String(item?.name || "").trim())
          .filter(Boolean)
        const shownNames = ingredients
          .map((item: { name?: string }) => String(item?.name || "").trim())
          .filter(Boolean)
        data.product = {
          ...off.product,
          ...data.product,
          image_url: data.product?.image_url || off.product.image_url,
          ingredients,
          nutrition: {
            ...(off.product.nutrition || {}),
            ...(data.product?.nutrition || {}),
          },
          ingredients_raw_text:
            data.product?.ingredients_raw_text || off.product.ingredients_raw_text,
        }
        const official =
          officialNutriGrade(off.nutri_score_grade) || officialNutriGrade(data.nutri_score_grade)
        data.nutri_score_grade =
          official || estimateNutriScoreGrade(data.product?.nutrition)
        const apiScored =
          typeof data.safety_score === "number" &&
          Number.isFinite(data.safety_score) &&
          typeof data.verdict === "string" &&
          data.verdict.length > 0
        const ingredientsChanged = shownNames.join("\n") !== apiNames.join("\n")
        // A reached API score stays. Replacing it with the thinner offline
        // matcher made the same product jump between two different numbers.
        if (!apiScored && ingredientsChanged && shownNames.length) {
          const local = localAllergyAnalysis(
            shownNames,
            userAllergies,
            userConditions,
            data.product.nutrition,
            Boolean(off.product.ingredients_incomplete),
            declaredAllergensFromOff(off.product),
          )
          data.allergy_flags = local.allergy_flags
          data.allergy_matches = local.allergy_matches
          data.label_insights = local.label_insights
          data.verdict = local.verdict
          data.safety_score = local.safety_score
          data.score_breakdown = local.score_breakdown
          data.explanation = local.explanation
          data.ai_source = local.ai_source
        } else if (
          off.product.ingredients_incomplete &&
          String(data.verdict || "").toLowerCase() === "safe"
        ) {
          data.verdict = "caution"
          data.safety_score = Math.min(Number(data.safety_score ?? 58), 58)
          data.score_breakdown = {
            score: data.safety_score,
            band: "caution",
            system: "scanity-evidence-v1",
            summary: `${data.safety_score} because the ingredient list is incomplete, so this cannot stay in Safe.`,
            formula: String(data.safety_score),
            lines: [
              {
                code: "incomplete",
                label: "Incomplete label",
                detail: "The ingredient list is incomplete, so Scanity cannot mark this Safe.",
              },
            ],
            clamped: false,
          }
          data.explanation =
            "Flagged — the ingredient list from Open Food Facts is incomplete, so Scanity cannot confirm this product is safe for your saved allergies."
        }
      }
    } catch {
      // ignore enrichment failures
    }

    return data
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.startsWith("The barcode") ||
        error.message === "__PRODUCT_NOT_FOUND__")
    ) {
      throw error
    }
    console.warn("Barcode API unreachable; using Open Food Facts fallback.", error)
    return await offPromise
  }
}
