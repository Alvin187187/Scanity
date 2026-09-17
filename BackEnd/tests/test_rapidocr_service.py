from app.services.rapidocr_service import InvalidLabelImageError, extract_text_from_image
import pytest


def test_empty_image_is_rejected():
    with pytest.raises(InvalidLabelImageError):
        extract_text_from_image(b"")


def test_unsupported_type_is_rejected():
    with pytest.raises(InvalidLabelImageError):
        extract_text_from_image(b"not-an-image", "application/pdf")
