import { requireApiBaseUrl } from "./auth"
import { analyzeOcrText } from "./ocr"
import { getAccessToken } from "./session"

type AllergyList = string[]

const OFF_TIMEOUT_MS = 10_000
const API_TIMEOUT_MS = 20_000

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

function nutritionFromOff(product: any) {
  const n = product?.nutriments || {}
  return {
    energy_kj: n["energy-kj_100g"] ?? n.energy_100g ?? null,
    sugars_g: n.sugars_100g ?? null,
    sat_fat_g: n["saturated-fat_100g"] ?? null,
    sodium_mg: n.sodium_100g != null ? Number(n.sodium_100g) * 1000 : null,
    fiber_g: n.fiber_100g ?? null,
    protein_g: n.proteins_100g ?? null,
  }
}

/** Lightweight client-side match when the Scanity API is asleep or unreachable. */
function localAllergyAnalysis(ingredientNames: string[], userAllergies: AllergyList) {
  const allergy_matches: {
    ingredient: string
    status: string
    matched_category: string | null
    matched_kb_entry: string | null
    reason: string
  }[] = []

  for (const name of ingredientNames) {
    const lower = name.toLowerCase()
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
          reason: `Looks related to your ${needle} profile (offline check). Confirm on the label.`,
        })
        break
      }
    }
  }

  const allergy_flags = allergy_matches
    .filter((item) => item.status === "avoid")
    .map((item) => item.ingredient)
  const verdict = allergy_flags.length ? "avoid" : ingredientNames.length ? "caution" : "caution"
  const safety_score = allergy_flags.length ? 22 : 55

  return {
    allergy_flags,
    allergy_matches,
    verdict,
    safety_score,
    nutri_score_grade: null as string | null,
    explanation: allergy_flags.length
      ? `Avoid. Offline check flagged ${allergy_flags.slice(0, 3).join(", ")} against your saved allergies. Confirm ingredients on the package.`
      : "Caution. Product details came from Open Food Facts. Confirm ingredients if this looks incomplete.",
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

async function lookupViaOpenFoodFacts(barcode: string, userAllergies: AllergyList) {
  const response = await fetchWithTimeout(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "Scanity/1.0 (https://scanity-eta.vercel.app)",
      },
    },
    OFF_TIMEOUT_MS,
  )
  if (!response.ok) {
    throw new Error("Unable to reach the product database. Please try again.")
  }
  const data = await response.json().catch(() => null)
  if (!data || data.status !== 1 || !data.product) {
    throw new Error("__PRODUCT_NOT_FOUND__")
  }

  const product = data.product
  const ingredientNames = ingredientsFromOff(product)
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

  let analysis: any = localAllergyAnalysis(ingredientNames, userAllergies)
  analysis.nutri_score_grade = nutriFromOff

  if (ingredientNames.length && getAccessToken()) {
    try {
      const remote = await analyzeOcrText({
        edited_ingredients: ingredientNames,
        user_allergies: userAllergies,
        product_name: product.product_name || product.product_name_en || "Scanned product",
        extracted_text: product.ingredients_text || ingredientNames.join(", "),
      })
      analysis = {
        allergy_flags: remote.allergy_flags || [],
        allergy_matches: remote.allergy_matches || [],
        verdict: remote.verdict || analysis.verdict,
        safety_score: remote.safety_score ?? analysis.safety_score,
        nutri_score_grade: remote.nutri_score_grade || remote.score || nutriFromOff,
        explanation: remote.explanation || analysis.explanation,
      }
    } catch {
      // Keep offline / OFF analysis so phone scans still succeed.
    }
  }

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
      nutrition: nutritionFromOff(product),
    },
    allergy_flags: analysis.allergy_flags || [],
    allergy_matches: analysis.allergy_matches || [],
    verdict: analysis.verdict || null,
    safety_score: analysis.safety_score ?? null,
    nutri_score_grade: analysis.nutri_score_grade || null,
    explanation: analysis.explanation || null,
    source: "openfoodfacts-fallback",
  }
}

export async function lookupBarcodeProduct(
  barcode: string,
  userAllergies: AllergyList = [],
) {
  const token = getAccessToken()

  // Prefer Scanity API when signed in, but never block scanning if it is down.
  if (token) {
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
          body: JSON.stringify({ barcode, user_allergies: userAllergies }),
        },
        API_TIMEOUT_MS,
      )

      const data = await response.json().catch(() => null)

      if (response.status === 401) {
        // Session expired — still try public Open Food Facts so the scan is not lost.
        console.warn("Barcode API unauthorized; using Open Food Facts fallback.")
        return await lookupViaOpenFoodFacts(barcode, userAllergies)
      }

      if (
        response.status === 404 ||
        data?.found === false ||
        data?.productFound === false ||
        data?.product_found === false ||
        data?.status === "not_found"
      ) {
        return await lookupViaOpenFoodFacts(barcode, userAllergies)
      }

      if (response.status === 400 || response.status === 422) {
        throw new Error(readError(data, "The barcode sent to the server is invalid."))
      }

      if (!response.ok) {
        console.warn(
          "Barcode API failed, using Open Food Facts fallback:",
          readError(data, response.statusText),
        )
        return await lookupViaOpenFoodFacts(barcode, userAllergies)
      }

      if (!data) throw new Error("The server returned an empty response.")
      if (data?.product === null || data?.productInformation === null || data?.data === null) {
        return await lookupViaOpenFoodFacts(barcode, userAllergies)
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
      return await lookupViaOpenFoodFacts(barcode, userAllergies)
    }
  }

  // No session token — Open Food Facts still works for product lookup.
  return await lookupViaOpenFoodFacts(barcode, userAllergies)
}
