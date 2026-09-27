from app.services.rapidocr_service import InvalidLabelImageError, extract_text_from_image
import pytest


def test_empty_image_is_rejected():
    with pytest.raises(InvalidLabelImageError):
        extract_text_from_image(b"")


def test_unsupported_type_is_rejected():
    with pytest.raises(InvalidLabelImageError):
        extract_text_from_image(b"not-an-image", "application/pdf")


def test_rapidocr_timeout_returns_no_name(monkeypatch):
    import app.services.rapidocr_service as rapidocr_service

    monkeypatch.setattr(
        "app.services.product_title_service.title_from_package_photo",
        lambda *args, **kwargs: "",
    )
    monkeypatch.setattr(rapidocr_service, "_rapidocr_text", lambda prepared: "")
    with pytest.raises(InvalidLabelImageError):
        extract_text_from_image(b"not-empty", "image/jpeg")


def test_low_confidence_lines_are_dropped():
    from app.services.rapidocr_service import _texts_from_result

    class Result:
        txts = ("Bravo Biscuits", "illegible")
        scores = (0.91, 0.2)

    assert _texts_from_result(Result()) == ["Bravo Biscuits"]
