import { requireApiBaseUrl } from "./auth"
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

export async function extractOcrImage(file: Blob, userAllergies: string[]) {
  const token = getAccessToken()
  if (!token) throw new Error("Please sign in again to scan products.")

  const form = new FormData()
  form.append("file", file, "label.jpg")
  form.append("user_allergies", userAllergies.join(","))

  const response = await fetch(`${requireApiBaseUrl()}/scan/ocr/image`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    body: form,
  })
  const data = await response.json().catch(() => null)
  if (response.status === 401) throw new Error("Please sign in again to scan products.")
  if (!response.ok) throw new Error(readError(data, "RapidOCR could not read this nutrition label."))
  return data
}
