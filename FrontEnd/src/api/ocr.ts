import { requireApiBaseUrl } from "./auth"
import { candidateProductTitles, productTitleFromOcr } from "./scan"
import { getAccessToken } from "./session"

function authHeaders() {
  const token = getAccessToken()
  if (!token) {
    throw new Error("Please sign in again to scan products.")
  }
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  }
}

function readError(data: any, fallback: string) {
  const detail = data?.detail
  if (typeof detail === "string" && detail.trim()) return detail
  return detail?.error || data?.message || data?.error || fallback
}

export async function analyzeOcrText(payload: {
  extracted_text?: string
  confirmed_ingredients?: string[]
  edited_ingredients?: string[]
  user_allergies?: string[]
  user_conditions?: string[]
  product_name?: string
}) {
  const response = await fetch(`${requireApiBaseUrl()}/scan/ocr`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
  const data = await response.json().catch(() => null)
  if (response.status === 401) throw new Error("Please sign in again to scan products.")
  if (!response.ok) throw new Error(readError(data, "The server could not analyze this label."))
  return data
}

export const PACKAGE_READ_TIMEOUT_MS = 45_000
const API_PACKAGE_READ_MS = 12_000

let localReader: Promise<any> | null = null

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && /aborted|abort/i.test(error.name + error.message))
  )
}

function isUnreachable(error: unknown) {
  if (isAbortError(error)) return false
  if (!(error instanceof Error)) return false
  return /failed to fetch|networkerror|load failed|err_connection|err_failed/i.test(
    error.message,
  )
}

export async function extractOcrImage(
  file: Blob,
  userAllergies: string[],
  signal?: AbortSignal,
) {
  const token = getAccessToken()
  if (!token) throw new Error("Please sign in again to scan products.")

  const form = new FormData()
  form.append("file", file, "label.jpg")
  form.append("user_allergies", userAllergies.join(","))

  let response: Response
  try {
    response = await fetch(`${requireApiBaseUrl()}/scan/ocr/image`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      body: form,
      signal,
    })
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) {
      throw new Error("Package reading timed out. Hold the name steady and try again.")
    }
    if (isUnreachable(error)) {
      throw new Error("SCANITY_API_UNREACHABLE")
    }
    throw error
  }
  const data = await response.json().catch(() => null)
  if (response.status === 401) throw new Error("Please sign in again to scan products.")
  if (!response.ok) throw new Error(readError(data, "Could not read this package photo."))
  return data
}

async function getLocalReader() {
  if (!localReader) {
    localReader = (async () => {
      const { createWorker, PSM } = await import("tesseract.js")
      const worker = await createWorker("eng", 1)
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      })
      return worker
    })()
  }
  return localReader
}

export async function recognizePackageText(file: Blob | HTMLCanvasElement): Promise<string> {
  const worker = await getLocalReader()
  const result = await worker.recognize(file)
  return String(result?.data?.text || "").trim()
}

export type PackageReadResult = {
  title: string
  raw: string
  candidates: string[]
}

function fromRawText(raw: string, preferred = ""): PackageReadResult | null {
  const text = String(raw || "").trim()
  const title =
    preferred.trim() ||
    productTitleFromOcr(text) ||
    text.split(/\r?\n/).find((line) => line.replace(/[^A-Za-z]/g, "").length >= 3) ||
    ""
  if (!title.trim()) return null
  return {
    title: title.trim(),
    raw: text || title.trim(),
    candidates: candidateProductTitles([preferred, text].filter(Boolean).join("\n")),
  }
}

/** Read a package photo even when the Scanity API is asleep. */
export async function readPackageTitle(
  file: Blob,
  userAllergies: string[],
  signal?: AbortSignal,
): Promise<PackageReadResult> {
  const token = getAccessToken()
  const apiAbort = new AbortController()
  const onParentAbort = () => apiAbort.abort()
  signal?.addEventListener("abort", onParentAbort)
  const apiTimer = window.setTimeout(() => apiAbort.abort(), API_PACKAGE_READ_MS)

  const apiPromise = (
    token
      ? extractOcrImage(file, userAllergies, apiAbort.signal)
          .then((data) =>
            fromRawText(
              String(data?.extracted_text || data?.product_name || ""),
              String(data?.product_name || ""),
            ),
          )
          .catch((error) => {
            if (error instanceof Error && error.message === "Please sign in again to scan products.") {
              throw error
            }
            console.warn("Package API unavailable; reading the photo on this device.", error)
            return null
          })
      : Promise.resolve(null)
  ).finally(() => {
    window.clearTimeout(apiTimer)
    signal?.removeEventListener("abort", onParentAbort)
  })

  const localPromise = recognizePackageText(file)
    .then((text) => fromRawText(text))
    .catch((error) => {
      console.warn("On-device package reading failed.", error)
      return null
    })

  const api = await apiPromise
  if (api?.title) return api

  if (signal?.aborted) {
    throw new Error("Package reading timed out. Hold the name steady and try again.")
  }

  const local = await localPromise
  if (local?.title) return local

  throw new Error("No product name was detected. Hold the name steady and try again in good light.")
}

export async function cleanProductTitle(extractedText: string): Promise<string> {
  const response = await fetch(`${requireApiBaseUrl()}/scan/ai/product-title`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ extracted_text: extractedText }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(readError(data, "Could not clean the package text."))
  return String(data?.product_title || "").trim()
}
