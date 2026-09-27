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

function ingredientsFromOff(product: any): string[] {
  const list = Array.isArray(product?.ingredients) ? product.ingredients : []
  const names = list
    .map((item: any) => String(item?.text || item?.id || "").trim())
    .filter(Boolean)
  if (names.length) return names.slice(0, 40)

  const raw = String(product?.ingredients_text || product?.ingredients_text_en || "")
  if (!raw.trim()) return []
  return raw
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 1 && item.length < 80)
    .slice(0, 40)
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

/** Lightweight client-side match when the Scanity API is asleep or unreachable. */
function localAllergyAnalysis(
  ingredientNames: string[],
  userAllergies: AllergyList,
  userConditions: AllergyList = [],
  nutrition?: Record<string, number | null | undefined>,
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
      const needle = String(allergy || "")
        .toLowerCase()
        .replace(/_/g, " ")
        .trim()
      if (!needle || needle.length < 3) continue
      if (lower.includes(needle) || lower.includes(needle.replace(/\s+/g, ""))) {
        allergy_matches.push({
          ingredient: name,
          status: "avoid",
          matched_category: allergy,
          matched_kb_entry: allergy,
          reason: `This looks like **${needle}**, which you asked Scanity to watch for.`,
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
  if (hasDiabetes && typeof sugars === "number" && sugars >= 8) {
    allergy_matches.push({
      ingredient: `Sugars ${sugars} g/100g`,
      status: "caution",
      matched_category: "diabetes",
      matched_kb_entry: "sugars",
      reason: `Sugars look **elevated** on the nutrition panel (${sugars} g/100g).`,
    })
  }

  const allergy_flags = allergy_matches
    .filter((item) => item.status === "avoid")
    .map((item) => item.ingredient)
  const avoidCount = allergy_flags.length
  const cautionCount = allergy_matches.filter((item) => item.status === "caution").length
  let safety_score = ingredientNames.length ? 100 : 58
  if (avoidCount) safety_score = Math.max(0, 26 - 7 * (avoidCount - 1))
  else if (cautionCount) safety_score = Math.max(40, 66 - cautionCount * 8)
  if (!ingredientNames.length) safety_score = Math.min(safety_score, 58)
  if (hasDiabetes && typeof sugars === "number") {
    if (sugars >= 22) safety_score = Math.min(safety_score, 48)
    else if (sugars >= 8) safety_score = Math.min(safety_score, 58)
  }
  const verdict = avoidCount ? "avoid" : cautionCount ? "caution" : ingredientNames.length ? "safe" : "caution"

  return {
    allergy_flags,
    allergy_matches,
    verdict,
    safety_score,
    nutri_score_grade: null as string | null,
    explanation: avoidCount
      ? `**Avoid** — ${allergy_flags.slice(0, 3).map((n) => `**${n}**`).join(", ")} lined up with an allergy or dietary restriction you asked Scanity to watch for.`
      : cautionCount
        ? `**Flagged** — ${cautionCount} item(s) need a closer look for your saved dietary restrictions.`
        : ingredientNames.length
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
  const offGrade = String(product.nutriscore_grade || product.nutrition_grades || "")
    .trim()
    .toLowerCase()
  const nutriFromOff =
    offGrade === "a" ||
    offGrade === "b" ||
    offGrade === "c" ||
    offGrade === "d" ||
    offGrade === "e"
      ? offGrade
      : null

  let analysis: any = localAllergyAnalysis(
    ingredientNames,
    userAllergies,
    userConditions,
    nutrition,
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
    },
    allergy_flags: analysis.allergy_flags || [],
    allergy_matches: analysis.allergy_matches || [],
    label_insights: analysis.label_insights || [],
    verdict: analysis.verdict || null,
    safety_score: analysis.safety_score ?? null,
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
  const ratio = hits / wanted.length
  if (wanted.length <= 2 && hits < wanted.length) return 0
  if (wanted.length > 2 && ratio < 0.5) return 0
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
      new URLSearchParams({ q: query, page_size: "50" }).toString(),
    "https://search.openfoodfacts.org/search?" +
      new URLSearchParams({ q: `"${query}"`, page_size: "30" }).toString(),
    "https://world.openfoodfacts.org/cgi/search.pl?" +
      new URLSearchParams({
        search_terms: query,
        search_simple: "1",
        action: "process",
        json: "1",
        page_size: "50",
      }).toString(),
  ]
  const responses = await Promise.allSettled(
    urls.map((url) =>
      fetchWithTimeout(
        url,
        {
          headers: { Accept: "application/json" },
          mode: "cors",
        },
        OFF_TIMEOUT_MS,
      ).then(async (response) => {
        if (!response.ok) return []
        const data = await response.json().catch(() => null)
        if (Array.isArray(data?.hits)) return data.hits
        if (Array.isArray(data?.products)) return data.products
        return []
      }),
    ),
  )
  const merged: any[] = []
  const seen = new Set<string>()
  for (const item of responses) {
    const products = item.status === "fulfilled" ? item.value : []
    for (const product of products) {
      const code = String(product?.code || product?._id || "").trim()
      if (!code || seen.has(code)) continue
      seen.add(code)
      merged.push(product)
    }
  }
  const ranked = rankOffHits(query, merged)
  if (ranked.length) return ranked
  return rankOffHits(distinctive.slice(0, 2).join(" "), merged)
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
    return products
      .map((product: any) => ({
        code: String(product?.code || "").trim(),
        product_name: String(product?.product_name || "").trim(),
        brand: String(product?.brand || "").trim() || undefined,
        image_url: String(product?.image_url || "").trim() || undefined,
      }))
      .filter((product: { code: string }) => product.code)
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

export type PackageNameMatch = {
  code: string
  product_name: string
  brand?: string
  image_url?: string
}

export async function lookupProductByPackageName(
  title: string,
  extraTitles: string[] = [],
  userAllergies: AllergyList = [],
  userConditions: AllergyList = [],
): Promise<{ result: any; match: PackageNameMatch } | null> {
  const guesses = [title, ...extraTitles].filter((item, index, list) => {
    const key = item.trim().toLowerCase()
    return key.length >= 3 && list.findIndex((other) => other.trim().toLowerCase() === key) === index
  })

  for (const guess of guesses.slice(0, 5)) {
    const matches = await searchOffByName(guess)
    const best = matches[0] as PackageNameMatch | undefined
    if (!best?.code) continue
    try {
      const result = await lookupBarcodeProduct(best.code, userAllergies, userConditions)
      if (result) return { result, match: best }
    } catch (error) {
      console.warn("Open Food Facts barcode lookup failed for a name match:", error)
    }
  }
  return null
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
        data.product = {
          ...off.product,
          ...data.product,
          image_url: data.product?.image_url || off.product.image_url,
          nutrition: {
            ...(off.product.nutrition || {}),
            ...(data.product?.nutrition || {}),
          },
          ingredients_raw_text:
            data.product?.ingredients_raw_text || off.product.ingredients_raw_text,
        }
        if (!data.nutri_score_grade) {
          data.nutri_score_grade =
            off.nutri_score_grade || estimateNutriScoreGrade(data.product?.nutrition)
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
