import { requireApiBaseUrl } from "./auth"
import { candidateProductTitles, productTitleFromOcr, titleAgreesWithOcr } from "./scan"
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

const PACKAGE_OCR_MAX_SIDE = 1800

async function getLocalReader() {
  if (!localReader) {
    localReader = (async () => {
      const { createWorker, PSM } = await import("tesseract.js")
      const worker = await createWorker("eng", 1)
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: "1",
      })
      return worker
    })()
  }
  return localReader
}

type OcrWord = {
  text?: string
  confidence?: number
  bbox?: { x0?: number; y0?: number }
}

function readingFromWords(words: OcrWord[], minConfidence: number): { text: string; mean: number } {
  const kept = words.filter((word) => (word.confidence ?? 0) >= minConfidence && String(word.text || "").trim())
  if (!kept.length) return { text: "", mean: 0 }
  const mean = kept.reduce((sum, word) => sum + (word.confidence ?? 0), 0) / kept.length
  const lines: { y: number; parts: { x: number; text: string }[] }[] = []
  for (const word of kept) {
    const y = word.bbox?.y0 ?? 0
    const x = word.bbox?.x0 ?? 0
    const text = String(word.text || "").trim()
    const line = lines.find((item) => Math.abs(item.y - y) < 14)
    if (line) line.parts.push({ x, text })
    else lines.push({ y, parts: [{ x, text }] })
  }
  const text = lines
    .sort((left, right) => left.y - right.y)
    .map((line) => line.parts.sort((left, right) => left.x - right.x).map((part) => part.text).join(" "))
    .join("\n")
    .trim()
  return { text, mean }
}

function preferReading(current: { text: string; mean: number }, next: { text: string; mean: number }) {
  const currentLetters = current.text.replace(/[^A-Za-z]/g, "").length
  const nextLetters = next.text.replace(/[^A-Za-z]/g, "").length
  if (nextLetters < 3) return current
  if (currentLetters < 3) return next
  if (next.mean >= 80 && current.mean < 80) return next
  if (current.mean >= 80 && next.mean < 80) return current
  return next.mean > current.mean ? next : current
}

/** Same preparation for a camera frame and an uploaded package photo. */
export async function preparePackageImage(source: Blob | HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const bitmap = source instanceof HTMLCanvasElement ? null : await createImageBitmap(source)
  try {
    const width = bitmap?.width || (source instanceof HTMLCanvasElement ? source.width : 0)
    const height = bitmap?.height || (source instanceof HTMLCanvasElement ? source.height : 0)
    const longest = Math.max(width, height) || 1
    const scale = Math.min(1, PACKAGE_OCR_MAX_SIDE / longest)
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) throw new Error("Could not read this photo.")
    if (bitmap) context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    else context.drawImage(source, 0, 0, canvas.width, canvas.height)
    sharpenPackageCanvas(context, canvas.width, canvas.height)
    return canvas
  } finally {
    bitmap?.close()
  }
}

function sharpenPackageCanvas(context: CanvasRenderingContext2D, width: number, height: number) {
  const image = context.getImageData(0, 0, width, height)
  const source = image.data
  const gray = new Float32Array(width * height)
  for (let pixel = 0, index = 0; index < source.length; index += 4, pixel += 1) {
    let value = 0.299 * source[index] + 0.587 * source[index + 1] + 0.114 * source[index + 2]
    value = (value - 128) * 1.4 + 128
    gray[pixel] = Math.max(0, Math.min(255, value))
  }
  const output = new Uint8ClampedArray(source.length)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x
      const here = gray[pixel]
      const blur =
        x > 0 && y > 0 && x < width - 1 && y < height - 1
          ? (gray[pixel - width - 1] +
              gray[pixel - width] +
              gray[pixel - width + 1] +
              gray[pixel - 1] +
              here +
              gray[pixel + 1] +
              gray[pixel + width - 1] +
              gray[pixel + width] +
              gray[pixel + width + 1]) /
            9
          : here
      const sharp = Math.max(0, Math.min(255, here + 0.85 * (here - blur)))
      const offset = pixel * 4
      output[offset] = sharp
      output[offset + 1] = sharp
      output[offset + 2] = sharp
      output[offset + 3] = 255
    }
  }
  image.data.set(output)
  context.putImageData(image, 0, 0)
}

export async function recognizePackageText(file: Blob | HTMLCanvasElement): Promise<string> {
  const worker = await getLocalReader()
  const { PSM } = await import("tesseract.js")
  const modes = [PSM.SINGLE_BLOCK, PSM.AUTO]
  let best = { text: "", mean: 0 }
  for (const mode of modes) {
    await worker.setParameters({ tessedit_pageseg_mode: mode })
    const result = await worker.recognize(file)
    const words = (result?.data?.words || []) as OcrWord[]
    const confident = readingFromWords(words, 80)
    const usable = confident.text.replace(/[^A-Za-z]/g, "").length >= 3
      ? confident
      : readingFromWords(words, 55)
    const fallback = {
      text: String(result?.data?.text || "").trim(),
      mean: usable.mean,
    }
    best = preferReading(best, usable.text ? usable : fallback)
    if (best.mean >= 80 && best.text.replace(/[^A-Za-z]/g, "").length >= 3) break
  }
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })
  return best.text.trim()
}

export type PackageReadResult = {
  title: string
  raw: string
  candidates: string[]
}

export function canvasLooksBlank(canvas: HTMLCanvasElement): boolean {
  try {
    if (canvas.width < 8 || canvas.height < 8) return true
    const sample = document.createElement("canvas")
    sample.width = 24
    sample.height = 24
    const context = sample.getContext("2d")
    if (!context) return false
    context.drawImage(canvas, 0, 0, 24, 24)
    const pixels = context.getImageData(0, 0, 24, 24).data
    let count = 0
    let sum = 0
    let sumSquares = 0
    for (let index = 0; index < pixels.length; index += 16) {
      const luminance = 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2]
      sum += luminance
      sumSquares += luminance * luminance
      count += 1
    }
    if (count < 8) return false
    const mean = sum / count
    const variance = sumSquares / count - mean * mean
    return variance < 12
  } catch {
    return false
  }
}

export const INVALID_PACKAGE_PHOTO =
  "This photo does not look like a product package. Upload or take a photo of the package instead."

function packageTextIsUsable(text: string): boolean {
  return text.replace(/[^A-Za-z]/g, "").length >= 3
}

function fromRawText(raw: string, preferred = ""): PackageReadResult | null {
  const text = String(raw || "").trim()
  const title =
    preferred.trim() ||
    productTitleFromOcr(text) ||
    text.split(/\r?\n/).find((line) => line.replace(/[^A-Za-z]/g, "").length >= 3) ||
    ""
  if (!title.trim() || !packageTextIsUsable(title)) return null
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

  if (signal?.aborted) {
    throw new Error("Package reading timed out. Hold the name steady and try again.")
  }

  const local = await localPromise
  if (api?.title && (!local?.title || titleAgreesWithOcr(api.title, local.raw) || titleAgreesWithOcr(api.title, api.raw))) {
    return api
  }
  if (local?.title) return local
  if (api?.title) return api

  throw new Error(INVALID_PACKAGE_PHOTO)
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
