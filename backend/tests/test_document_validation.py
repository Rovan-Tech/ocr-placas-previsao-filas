from app.services.document_validation import document_number_matches, is_valid_cpf, validate_document_photo


def _document_photo_bytes(text: str) -> bytes:
    import cv2
    import numpy as np
    from PIL import Image, ImageDraw, ImageFont

    image = Image.new("RGB", (600, 200), (255, 255, 255))
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 36)
    draw.text((20, 80), text, font=font, fill=(0, 0, 0))
    array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    ok, encoded = cv2.imencode(".jpg", array)
    assert ok
    return encoded.tobytes()


def test_document_number_matches_ignores_punctuation():
    assert document_number_matches("123.456.789-00", "CPF 123456789 00") is True


def test_document_number_matches_is_false_for_a_different_number():
    assert document_number_matches("123.456.789-00", "CPF 999999999 99") is False


def test_document_number_matches_is_false_for_an_empty_document():
    assert document_number_matches("", "qualquer texto 123456") is False


def test_validate_document_photo_confirms_a_matching_number():
    photo = _document_photo_bytes("CPF: 111.222.333-44")

    is_valid, detail = validate_document_photo("11122233344", photo)

    assert is_valid is True
    assert "confere" in detail


def test_validate_document_photo_flags_a_mismatched_number():
    photo = _document_photo_bytes("CPF: 111.222.333-44")

    is_valid, detail = validate_document_photo("00000000000", photo)

    assert is_valid is False
    assert "não foi encontrado" in detail


def test_is_valid_cpf_accepts_a_real_check_digit():
    assert is_valid_cpf("111.444.777-35") is True


def test_is_valid_cpf_rejects_a_wrong_check_digit():
    assert is_valid_cpf("111.444.777-36") is False


def test_is_valid_cpf_rejects_all_digits_repeated():
    assert is_valid_cpf("111.111.111-11") is False


def test_is_valid_cpf_rejects_a_wrong_length():
    assert is_valid_cpf("111.444.777") is False
