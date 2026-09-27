"""
RapidOCR label reader using PP-OCRv5.

Issue #173. The LLM never looks at the image — this step extracts text only.
"""

from __future__ import annotations

import io
import logging
from functools import lru_cache

logger = logging.getLogger(__name__)

MAX_IMAGE_BYTES = 8 * 1024 * 1024
ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/bmp",
    "application/octet-stream",
}


class OCREngineUnavailableError(Exception):
    """Raised when RapidOCR cannot be loaded or fails to run."""


class InvalidLabelImageError(Exception):
    """Raised when the uploaded file is empty or not a usable image."""


def _recognition_language(lang_rec):
    """Prefer the English recognizer so Latin package text is not read as Chinese."""
    for name in ("EN", "LATIN"):
        language = getattr(lang_rec, name, None)
        if language is not None:
            return language
    return lang_rec.CH


def _build_engine(recognition_language):
    from rapidocr import EngineType, LangDet, ModelType, OCRVersion, RapidOCR

    return RapidOCR(
        params={
            "Det.engine_type": EngineType.ONNXRUNTIME,
            "Det.lang_type": LangDet.CH,
            "Det.model_type": ModelType.MOBILE,
            "Det.ocr_version": OCRVersion.PPOCRV5,
            "Rec.engine_type": EngineType.ONNXRUNTIME,
            "Rec.lang_type": recognition_language,
            "Rec.model_type": ModelType.MOBILE,
            "Rec.ocr_version": OCRVersion.PPOCRV5,
        }
    )


@lru_cache(maxsize=1)
def _load_engine():
    try:
        from rapidocr import LangRec
    except ImportError as exc:
        raise OCREngineUnavailableError(
            "RapidOCR is not installed. Add rapidocr and onnxruntime to the backend environment."
        ) from exc

    preferred = _recognition_language(LangRec)
    try:
        return _build_engine(preferred)
    except Exception:
        if preferred == LangRec.CH:
            logger.exception("RapidOCR failed to load.")
            raise OCREngineUnavailableError(
                "RapidOCR is not installed. Add rapidocr and onnxruntime to the backend environment."
            )
        logger.warning("English RapidOCR model failed to load; using the multilingual model.")
        return _build_engine(LangRec.CH)


def _prepare_image_bytes(image_bytes: bytes) -> bytes:
    """Downscale a package photo so vision and OCR stay fast."""
    try:
        from PIL import Image, ImageOps
    except ImportError:
        return image_bytes

    try:
        image = ImageOps.exif_transpose(Image.open(io.BytesIO(image_bytes)))
        image = image.convert("RGB")
    except Exception:
        return image_bytes

    width, height = image.size
    longest = max(width, height) or 1
    if longest > 1024:
        scale = 1024 / longest
        image = image.resize(
            (max(1, int(width * scale)), max(1, int(height * scale))),
            Image.Resampling.BILINEAR,
        )
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=82)
    return buffer.getvalue()


def _keep_line(text: str, score: float | None) -> str | None:
    cleaned = str(text or "").strip()
    if not cleaned:
        return None
    if score is not None and score < 0.45:
        return None
    return cleaned


def _texts_from_result(result) -> list[str]:
    if result is None:
        return []

    texts = getattr(result, "txts", None)
    if texts:
        scores = getattr(result, "scores", None) or []
        lines = []
        for index, item in enumerate(texts):
            score = None
            if index < len(scores):
                try:
                    score = float(scores[index])
                except (TypeError, ValueError):
                    score = None
            kept = _keep_line(str(item), score)
            if kept:
                lines.append(kept)
        return lines

    if isinstance(result, (list, tuple)):
        lines = []
        payload = result[0] if result and isinstance(result[0], (list, tuple)) else result
        for item in payload:
            if isinstance(item, str) and item.strip():
                lines.append(item.strip())
            elif isinstance(item, (list, tuple)) and len(item) >= 2:
                text = item[1]
                score = item[2] if len(item) > 2 and isinstance(item[2], (int, float)) else None
                if isinstance(text, (list, tuple)) and text and isinstance(text[0], str):
                    text = text[0]
                kept = _keep_line(text if isinstance(text, str) else "", score)
                if kept:
                    lines.append(kept)
        return lines

    return []


def extract_text_from_image(image_bytes: bytes, content_type: str | None = None) -> str:
    """Read a package photo and return the product name (or label text)."""
    if not image_bytes:
        raise InvalidLabelImageError("The uploaded image was empty.")
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise InvalidLabelImageError("Please upload a package photo smaller than 8 MB.")
    if content_type and content_type.lower() not in ALLOWED_CONTENT_TYPES:
        raise InvalidLabelImageError("Please upload a JPEG, PNG, or WebP photo of the package.")

    prepared = _prepare_image_bytes(image_bytes)
    mime = (content_type or "image/jpeg").lower()
    if mime not in {"image/jpeg", "image/jpg", "image/png", "image/webp"}:
        mime = "image/jpeg"
    if mime == "image/jpg":
        mime = "image/jpeg"

    try:
        from app.services.product_title_service import title_from_package_photo

        title = title_from_package_photo(prepared, mime)
        if title:
            return title
    except Exception:
        logger.warning("Hosted package reading was unavailable.")

    text = _rapidocr_text(prepared)
    if not text:
        raise InvalidLabelImageError(
            "No product name was detected. Hold the name steady and try again in good light."
        )
    return text


def _rapidocr_text(prepared: bytes) -> str:
    """Local OCR fallback with a hard cap so a cold model load cannot hang the scan."""
    from concurrent.futures import ThreadPoolExecutor
    from concurrent.futures import TimeoutError as FuturesTimeout

    def run() -> str:
        engine = _load_engine()
        result = engine(prepared)
        return "\n".join(_texts_from_result(result)).strip()

    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(run).result(timeout=6)
    except OCREngineUnavailableError:
        raise
    except FuturesTimeout:
        logger.warning("RapidOCR timed out while reading the package photo.")
        return ""
    except Exception as exc:
        logger.exception("RapidOCR failed to read the package photo.")
        raise OCREngineUnavailableError("Could not read this package photo.") from exc
