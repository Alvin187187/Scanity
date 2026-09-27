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
    """Straighten, enlarge, and sharpen a gallery photo before recognition."""
    try:
        from PIL import Image, ImageFilter, ImageOps
    except ImportError:
        return image_bytes

    try:
        image = ImageOps.exif_transpose(Image.open(io.BytesIO(image_bytes)))
        image = image.convert("RGB")
    except Exception:
        return image_bytes

    width, height = image.size
    longest = max(width, height) or 1
    if longest < 1200:
        scale = min(2.0, 1800 / longest)
    elif longest > 2000:
        scale = 2000 / longest
    else:
        scale = 1.0
    if scale != 1.0:
        image = image.resize(
            (max(1, int(width * scale)), max(1, int(height * scale))),
            Image.Resampling.LANCZOS,
        )
    image = ImageOps.autocontrast(image, cutoff=1)
    image = image.filter(ImageFilter.SHARPEN)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=92)
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
    """Run RapidOCR PP-OCRv5 on a nutrition-label photo and return plain text."""
    if not image_bytes:
        raise InvalidLabelImageError("The uploaded image was empty.")
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise InvalidLabelImageError("Please upload a label photo smaller than 8 MB.")
    if content_type and content_type.lower() not in ALLOWED_CONTENT_TYPES:
        raise InvalidLabelImageError("Please upload a JPEG, PNG, or WebP photo of the label.")

    try:
        engine = _load_engine()
        result = engine(_prepare_image_bytes(image_bytes))
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
