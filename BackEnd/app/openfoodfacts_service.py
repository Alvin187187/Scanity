# app/services/openfoodfacts_service.py
"""
OpenFoodFacts external API integration.
Handles request/response, timeout, and error handling for the external call only —
no caching or DB logic here (that lives in barcode_lookup_service.py).
"""
import httpx
from typing import Optional

OPENFOODFACTS_BASE_URL = "https://world.openfoodfacts.org/api/v2/product"
REQUEST_TIMEOUT_SECONDS = 2.5  # Leaves headroom under the 4s hard scan timeout


class OpenFoodFactsError(Exception):
    """Raised when OpenFoodFacts is unreachable or returns an unexpected error."""
    pass


async def fetch_product_by_barcode(barcode: str) -> Optional[dict]:
    """
    Calls OpenFoodFacts for a given barcode.
    Returns the raw product dict if found, None if OpenFoodFacts confirms the
    product doesn't exist, and raises OpenFoodFactsError on timeout/unreachable/
    malformed response — the caller decides how to handle each case differently.
    """
    url = f"{OPENFOODFACTS_BASE_URL}/{barcode}.json"
    
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.get(url)
    except httpx.TimeoutException:
        raise OpenFoodFactsError("OpenFoodFacts request timed out")
    except httpx.RequestError as e:
        raise OpenFoodFactsError(f"OpenFoodFacts unreachable: {e}")

    if response.status_code != 200:
        raise OpenFoodFactsError(f"OpenFoodFacts returned status {response.status_code}")

    try:
        data = response.json()
    except ValueError:
        raise OpenFoodFactsError("OpenFoodFacts returned malformed JSON")

    # OpenFoodFacts uses status: 0 for "not found", status: 1 for "found"
    if data.get("status") != 1:
        return None

    return data.get("product")
