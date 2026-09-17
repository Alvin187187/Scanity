import { requireApiBaseUrl } from "./auth"
import { getAccessToken } from "./session"

export async function lookupBarcodeProduct(barcode: string, userAllergies: string[] = []) {
  const token = getAccessToken()
  if (!token) {
    throw new Error("Please sign in again to look up products.")
  }

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
    throw new Error("__PRODUCT_NOT_FOUND__")
  }

  if (response.status === 400 || response.status === 422) {
    throw new Error(
      data?.message || data?.error || data?.detail || "The barcode sent to the server is invalid.",
    )
  }

  if (!response.ok) {
    const detail = data?.detail
    const message =
      (typeof detail === "string" && detail) ||
      detail?.error ||
      data?.message ||
      data?.error ||
      "The server could not retrieve the product information."
    throw new Error(message)
  }

  if (!data) throw new Error("The server returned an empty response.")
  if (data?.product === null || data?.productInformation === null || data?.data === null) {
    throw new Error("__PRODUCT_NOT_FOUND__")
  }

  return data
}
