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

function nutritionFromOff(product: any) {
  const n = product?.nutriments || {}
  const energyKcal =
    asNumber(n["energy-kcal_100g"]) ??
    asNumber(n["energy-kcal"]) ??
    asNumber(n.energy_value)
  const energyKj =
    asNumber(n["energy-kj_100g"]) ??
    asNumber(n["energy-kj"]) ??
    asNumber(n.energy_100g)
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
  const sugarWords = ["sugar", "glucose", "fructose", "syrup", "sucrose", "maltodextrin", "honey"]
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
          reason: `Matches your ${needle} profile. Confirm on the package.`,
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
        reason: "Dairy / lactose-related for your lactose intolerance profile.",
      })
      continue
    }
    if (hasDiabetes && sugarWords.some((word) => lower.includes(word))) {
      allergy_matches.push({
        ingredient: name,
        status: "caution",
        matched_category: "diabetes",
        matched_kb_entry: name,
        reason: "Added sugar / sweet carb for your diabetes profile.",
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
      reason: "Nutrition sugars are elevated for your diabetes profile.",
    })
  }

  const allergy_flags = allergy_matches
    .filter((item) => item.status === "avoid")
    .map((item) => item.ingredient)
  const avoidCount = allergy_flags.length
  const cautionCount = allergy_matches.filter((item) => item.status === "caution").length
  let safety_score = 96
  if (avoidCount) safety_score = Math.max(0, 26 - 7 * (avoidCount - 1))
  else if (cautionCount) safety_score = Math.max(40, 66 - cautionCount * 8)
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
      ? `**Avoid.** ${allergy_flags.slice(0, 3).join(", ")} matched your saved profile. Confirm the package.`
      : cautionCount
        ? `**Caution.** ${cautionCount} item(s) need a quick check for your saved conditions. Confirm the package.`
        : ingredientNames.length
          ? "**Safe** for your saved allergies/conditions based on this label check. Confirm the package if anything looks incomplete."
          : "**Caution.** Product details came from Open Food Facts, but ingredients were incomplete.",
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
  analysis.nutri_score_grade = nutriFromOff

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
        if (!data.nutri_score_grade && off.nutri_score_grade) {
          data.nutri_score_grade = off.nutri_score_grade
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
