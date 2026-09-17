"""
RapidOCR label reader using PP-OCRv5.

Issue #173. The LLM never looks at the image — this step extracts text only.
"""

from __future__ import annotations

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


@lru_cache(maxsize=1)
def _load_engine():
    try:
        from rapidocr import EngineType, LangDet, LangRec, ModelType, OCRVersion, RapidOCR
    except ImportError as exc:
        raise OCREngineUnavailableError(
            "RapidOCR is not installed. Add rapidocr and onnxruntime to the backend environment."
        ) from exc

    return RapidOCR(
        params={
            "Det.engine_type": EngineType.ONNXRUNTIME,
            "Det.lang_type": LangDet.CH,
            "Det.model_type": ModelType.MOBILE,
            "Det.ocr_version": OCRVersion.PPOCRV5,
            "Rec.engine_type": EngineType.ONNXRUNTIME,
            "Rec.lang_type": LangRec.CH,
            "Rec.model_type": ModelType.MOBILE,
            "Rec.ocr_version": OCRVersion.PPOCRV5,
        }
    )


def _texts_from_result(result) -> list[str]:
    if result is None:
        return []

    texts = getattr(result, "txts", None)
    if texts:
        return [str(item).strip() for item in texts if str(item).strip()]

    if isinstance(result, (list, tuple)):
        lines = []
        payload = result[0] if result and isinstance(result[0], (list, tuple)) else result
        for item in payload:
            if isinstance(item, str) and item.strip():
                lines.append(item.strip())
            elif isinstance(item, (list, tuple)) and len(item) >= 2:
                text = item[1]
                if isinstance(text, str) and text.strip():
                    lines.append(text.strip())
                elif isinstance(text, (list, tuple)) and text and isinstance(text[0], str):
                    lines.append(text[0].strip())
        return lines

    return []


def extract_text_from_image(image_bytes: bytes, content_type: str | None = None) -> str:
    """Run RapidOCR PP-OCRv5 on a nutrition-label photo and return plain text."""
    if not image_bytes:
        raise InvalidLabelImageError("The uploaded image was empty.")
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise InvalidLabelImageError("Please upload a label photo smaller than 8 MB.")
    if content_type and content_type.lower() not in ALLOWED_CONTENT_TYPES:
        raise InvalidLabelImageError("Please upload a JPEG, PNG, or WebP photo of the label.")

    try:
        engine = _load_engine()
        result = engine(image_bytes)
    except OCREngineUnavailableError:
        raise
    except Exception as exc:
        logger.exception("RapidOCR failed to read the label image.")
        raise OCREngineUnavailableError("RapidOCR could not read this label image.") from exc

    lines = _texts_from_result(result)
    text = "\n".join(lines).strip()
    if not text:
        raise InvalidLabelImageError(
            "No text was detected. Please make sure the nutrition label is clear and readable."
        )
    return text
