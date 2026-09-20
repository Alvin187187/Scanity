const HISTORY_KEY = "scanityScanHistory"
const ACTIVE_RESULT_KEY = "scanityProductResult"

export type ScanMethod = "Barcode" | "OCR"

export type AllergySignal = {
  name: string
  status: "avoid" | "caution" | "safe" | string
  reason?: string
}

export type StoredScan = {
  id: string
  name: string
  brand?: string
  quantity?: string
  imageUrl?: string
  barcode?: string
  source: "barcode" | "ocr"
  scannedAt: string
  verdict: "safe" | "caution" | "avoid" | null
  grade: "a" | "b" | "c" | "d" | "e" | null
  explanation?: string
  allergens: string[]
  allergySignals?: AllergySignal[]
  ingredients: string[]
  ingredientsText?: string
  nutrition?: Record<string, number | undefined>
  score: number
  favorite?: boolean
}

function readList(): StoredScan[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function loadScanHistory(): StoredScan[] {
  return readList()
}

export function saveActiveScan(scan: StoredScan) {
  window.localStorage.setItem(ACTIVE_RESULT_KEY, JSON.stringify(scan))
}

export function loadActiveScan(): StoredScan | null {
  try {
    const raw = window.localStorage.getItem(ACTIVE_RESULT_KEY)
    if (!raw) return null
    return JSON.parse(raw) as StoredScan
  } catch {
    return null
  }
}

export function appendScanHistory(scan: StoredScan) {
  const next = [scan, ...readList().filter((item) => item.id !== scan.id)].slice(0, 50)
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  saveActiveScan(scan)
  notifyHistoryUpdated()
}

export function markScanFavorite(id: string, favorite = true) {
  const next = readList().map((item) => (item.id === id ? { ...item, favorite } : item))
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  notifyHistoryUpdated()
}

function notifyHistoryUpdated() {
  try {
    window.dispatchEvent(new CustomEvent("scanity-history-updated"))
  } catch {
    // ignore
  }
}

export function removeScanFromHistory(id: string): StoredScan | null {
  const list = readList()
  const removed = list.find((item) => item.id === id) || null
  if (!removed) return null
  window.localStorage.setItem(
    HISTORY_KEY,
    JSON.stringify(list.filter((item) => item.id !== id)),
  )
  try {
    const active = loadActiveScan()
    if (active?.id === id) {
      window.localStorage.removeItem(ACTIVE_RESULT_KEY)
    }
  } catch {
    // ignore
  }
  notifyHistoryUpdated()
  return removed
}

export function restoreScanToHistory(scan: StoredScan, index = 0) {
  const list = readList().filter((item) => item.id !== scan.id)
  const next = [...list]
  const insertAt = Math.max(0, Math.min(index, next.length))
  next.splice(insertAt, 0, scan)
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next.slice(0, 50)))
  notifyHistoryUpdated()
}

export function scoreFromVerdict(verdict: StoredScan["verdict"]): number {
  // Fallback only when the API did not return safety_score.
  // Bands: 0-39 avoid, 40-69 caution, 70-100 safe.
  if (verdict === "safe") return 100
  if (verdict === "caution") return 82
  if (verdict === "avoid") return 22
  return 82
}

export function historyDateLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function historyTimeLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    if (typeof value === "string" && value.trim()) {
      return value.split(",").map((item) => item.trim()).filter(Boolean)
    }
    return []
  }
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim()
      if (item && typeof item === "object") {
        const record = item as { name?: string; ingredient?: string; ingredient_name?: string }
        return (record.name || record.ingredient || record.ingredient_name || "").trim()
      }
      return ""
    })
    .filter(Boolean)
}

function allergySignalsFromUnknown(value: unknown): AllergySignal[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        if (typeof item === "string" && item.trim()) {
          return { name: item.trim(), status: "avoid" as const }
        }
        return null
      }
      const record = item as {
        name?: string
        ingredient?: string
        status?: string
        reason?: string
      }
      const name = (record.name || record.ingredient || "").trim()
      if (!name) return null
      const status = String(record.status || "caution").toLowerCase()
      return {
        name,
        status,
        reason: record.reason,
      }
    })
    .filter(Boolean) as AllergySignal[]
}

export function storedScanFromAnalysis(input: {
  source: "barcode" | "ocr"
  name?: string
  brand?: string
  quantity?: string
  barcode?: string
  imageUrl?: string
  ingredients?: unknown
  ingredientsText?: string
  verdict?: string | null
  grade?: string | null
  explanation?: string
  allergyFlags?: unknown
  allergyMatches?: unknown
  nutrition?: Record<string, number | undefined>
  safetyScore?: number | null
  id?: string
}): StoredScan {
  const verdict = (
    input.verdict === "safe" || input.verdict === "caution" || input.verdict === "avoid"
      ? input.verdict
      : null
  ) as StoredScan["verdict"]
  const grade = (
    input.grade === "a" || input.grade === "b" || input.grade === "c" || input.grade === "d" || input.grade === "e"
      ? input.grade
      : null
  ) as StoredScan["grade"]
  const ingredients = asStringList(input.ingredients)
  const allergySignals = allergySignalsFromUnknown(input.allergyMatches)
  const allergens =
    asStringList(input.allergyFlags).length > 0
      ? asStringList(input.allergyFlags)
      : allergySignals
          .filter((item) => item.status === "avoid")
          .map((item) => item.name)
  const score =
    typeof input.safetyScore === "number" && Number.isFinite(input.safetyScore)
      ? Math.max(0, Math.min(100, Math.round(input.safetyScore)))
      : scoreFromVerdict(verdict)
  return {
    id: input.id || `${input.source}-${input.barcode || input.name || "scan"}-${Date.now()}`,
    name: input.name?.trim() || "Scanned product",
    brand: input.brand?.trim() || undefined,
    quantity: input.quantity,
    imageUrl: input.imageUrl,
    barcode: input.barcode,
    source: input.source,
    scannedAt: new Date().toISOString(),
    verdict,
    grade,
    explanation: input.explanation,
    allergens,
    allergySignals: allergySignals.length ? allergySignals : undefined,
    ingredients,
    ingredientsText: input.ingredientsText || ingredients.join(", "),
    nutrition: input.nutrition,
    score,
  }
}
