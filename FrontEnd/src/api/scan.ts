import { requireApiBaseUrl } from "./auth"
import { analyzeOcrText } from "./ocr"
import { getAccessToken } from "./session"

type AllergyList = string[]

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

async function lookupViaOpenFoodFacts(barcode: string, userAllergies: AllergyList) {
  const response = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "Scanity/1.0 (https://scanity-eta.vercel.app)",
      },
    },
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
  let analysis: any = {
    allergy_flags: [],
    allergy_matches: [],
    verdict: ingredientNames.length ? "caution" : "caution",
    nutri_score_grade: null,
    explanation:
      "Product details came from Open Food Facts. Confirm ingredients if this looks incomplete.",
  }

  if (ingredientNames.length) {
    try {
      analysis = await analyzeOcrText({
        edited_ingredients: ingredientNames,
        user_allergies: userAllergies,
        product_name: product.product_name || product.product_name_en || "Scanned product",
        extracted_text: product.ingredients_text || ingredientNames.join(", "),
      })
    } catch {
      // Keep the product even if allergy analysis is temporarily unavailable.
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
    nutri_score_grade: analysis.nutri_score_grade || analysis.score || null,
    explanation: analysis.explanation || null,
    source: "openfoodfacts-fallback",
  }
}

export async function lookupBarcodeProduct(barcode: string, userAllergies: AllergyList = []) {
  const token = getAccessToken()
  if (!token) {
    throw new Error("Please sign in again to look up products.")
  }

  try {
    const response = await fetch(`${requireApiBaseUrl()}/scan/barcode`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ barcode, user_allergies: userAllergies }),
    })

    const data = await response.json().catch(() => null)

    if (response.status === 401) {
      throw new Error("Please sign in again to look up products.")
    }

    if (
      response.status === 404 ||
      data?.found === false ||
      data?.productFound === false ||
      data?.product_found === false ||
      data?.status === "not_found"
    ) {
      // Backend miss — still try public Open Food Facts before giving up.
      return await lookupViaOpenFoodFacts(barcode, userAllergies)
    }

    if (response.status === 400 || response.status === 422) {
      throw new Error(readError(data, "The barcode sent to the server is invalid."))
    }

    if (!response.ok) {
      // 5xx / DB errors — recover through Open Food Facts so phone scans still work.
      console.warn("Barcode API failed, using Open Food Facts fallback:", readError(data, response.statusText))
      return await lookupViaOpenFoodFacts(barcode, userAllergies)
    }

    if (!data) throw new Error("The server returned an empty response.")
    if (data?.product === null || data?.productInformation === null || data?.data === null) {
      return await lookupViaOpenFoodFacts(barcode, userAllergies)
    }

    return data
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "Please sign in again to look up products." ||
        error.message === "__PRODUCT_NOT_FOUND__" ||
        error.message.startsWith("The barcode")
      ) {
        throw error
      }
    }
    // Network / CORS / sleeping API — last-chance public lookup.
    return await lookupViaOpenFoodFacts(barcode, userAllergies)
  }
}
