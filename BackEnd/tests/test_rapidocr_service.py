from app.services.rapidocr_service import InvalidLabelImageError, extract_text_from_image
import pytest


def test_empty_image_is_rejected():
    with pytest.raises(InvalidLabelImageError):
        extract_text_from_image(b"")


def test_unsupported_type_is_rejected():
    with pytest.raises(InvalidLabelImageError):
        extract_text_from_image(b"not-an-image", "application/pdf")


def test_low_confidence_lines_are_dropped():
    from app.services.rapidocr_service import _texts_from_result

    class Result:
        txts = ("Bravo Biscuits", "illegible")
        scores = (0.91, 0.2)

    assert _texts_from_result(Result()) == ["Bravo Biscuits"]
