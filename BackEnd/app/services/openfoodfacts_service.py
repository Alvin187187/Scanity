
"""
OpenFoodFacts external API integration.
Handles request/response, timeout, and error handling for the external call only —
no caching or DB logic here (that lives in barcode_lookup_service.py).
"""
import re
from typing import Optional

import httpx

OPENFOODFACTS_BASE_URL = "https://world.openfoodfacts.org/api/v2/product"
OPENFOODFACTS_SEARCH_URL = "https://search.openfoodfacts.org/search"
OPENFOODFACTS_CGI_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl"
REQUEST_TIMEOUT_SECONDS = 12
OPENFOODFACTS_HEADERS = {
    "User-Agent": "Scanity/1.0 (https://scanity-eta.vercel.app)",
}


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
            response = await client.get(url, headers=OPENFOODFACTS_HEADERS)
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


def _brands_text(brands) -> str:
    if isinstance(brands, list):
        return " ".join(str(part).strip() for part in brands if str(part).strip())
    return str(brands or "").strip()


def _tokens(value: str) -> list[str]:
    stop = {"the", "and", "with", "for"}
    return [
        token
        for token in re.sub(r"[^a-z0-9\s]", " ", str(value or "").lower()).split()
        if len(token) > 2 and token not in stop
    ]


def _tokens_close(left: str, right: str) -> bool:
    if left == right:
        return True
    if len(left) > 3 and (left in right or right in left):
        return True
    return False


def _hit_score(query: str, hit: dict) -> float:
    name = str(hit.get("product_name") or hit.get("product_name_en") or "")
    brand = _brands_text(hit.get("brands"))
    blob = f"{name} {brand}"
    wanted = _tokens(query)
    haystack = _tokens(blob)
    if not wanted or not haystack:
        return 0
    hits = sum(1 for token in wanted if any(_tokens_close(token, word) for word in haystack))
    if len(wanted) <= 3 and hits < len(wanted):
        return 0
    ratio = hits / len(wanted)
    if ratio < 0.67:
        return 0
    score = ratio * 100
    brand_l = brand.lower()
    query_l = query.strip().lower()
    name_l = name.lower()
    if query_l and (query_l == brand_l or query_l in brand_l.split(",")[0].strip()):
        score += 50
    if query_l and (name_l == query_l or name_l.startswith(query_l)):
        score += 30
    if hit.get("image_url") or hit.get("image_front_url"):
        score += 5
    extra = [token for token in haystack if token not in wanted]
    score -= min(15, len(extra))
    return score


def _normalize_hits(payload: dict) -> list[dict]:
    raw = payload.get("hits") if isinstance(payload.get("hits"), list) else payload.get("products")
    if not isinstance(raw, list):
        return []
    matches = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        code = str(item.get("code") or item.get("_id") or "").strip()
        if not code or code in seen:
            continue
        seen.add(code)
        name = str(item.get("product_name") or item.get("product_name_en") or "").strip()
        brand = _brands_text(item.get("brands"))
        image = str(item.get("image_url") or item.get("image_front_url") or "").strip()
        matches.append(
            {
                "code": code,
                "product_name": name,
                "brand": brand or None,
                "image_url": image or None,
                "raw": item,
            }
        )
    return matches


async def search_products_by_name(query: str) -> list[dict]:
    """Search Open Food Facts by printed product name / brand."""
    cleaned = " ".join(str(query or "").split())
    if len(cleaned) < 3:
        return []

    headers = {**OPENFOODFACTS_HEADERS, "Accept": "application/json"}
    urls = [
        (
            OPENFOODFACTS_SEARCH_URL,
            {"q": cleaned, "page_size": "40"},
        ),
        (
            OPENFOODFACTS_CGI_SEARCH_URL,
            {
                "search_terms": cleaned,
                "search_simple": "1",
                "action": "process",
                "json": "1",
                "page_size": "40",
            },
        ),
    ]

    last_error: OpenFoodFactsError | None = None
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
        for url, params in urls:
            try:
                response = await client.get(url, headers=headers, params=params)
            except httpx.TimeoutException:
                last_error = OpenFoodFactsError("OpenFoodFacts request timed out")
                continue
            except httpx.RequestError as exc:
                last_error = OpenFoodFactsError(f"OpenFoodFacts unreachable: {exc}")
                continue
            if response.status_code != 200:
                last_error = OpenFoodFactsError(
                    f"OpenFoodFacts returned status {response.status_code}"
                )
                continue
            try:
                candidate = response.json()
            except ValueError:
                last_error = OpenFoodFactsError("OpenFoodFacts returned malformed JSON")
                continue
            ranked = _rank_hits(cleaned, candidate if isinstance(candidate, dict) else {})
            if ranked:
                return ranked

    if last_error:
        raise last_error
    return []


def _rank_hits(query: str, payload: dict) -> list[dict]:
    ranked = []
    for item in _normalize_hits(payload):
        score = _hit_score(
            query,
            {
                "product_name": item.get("product_name"),
                "brands": item.get("brand"),
                "image_url": item.get("image_url"),
            },
        )
        if score <= 0:
            continue
        ranked.append({**item, "score": score})
    ranked.sort(key=lambda item: item["score"], reverse=True)
    return [
        {
            "code": item["code"],
            "product_name": item["product_name"],
            "brand": item["brand"],
            "image_url": item["image_url"],
        }
        for item in ranked[:8]
    ]
