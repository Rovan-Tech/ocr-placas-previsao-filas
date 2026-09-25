import re

from app.services.image_preprocessing import resize_to_height, to_gray
from app.services.ocr_service import decode_image, read_raw_text

VALID_DETAIL = "Número do documento confere com a foto."
INVALID_DETAIL = "Número do documento não foi encontrado na foto — confira manualmente."


def extract_text(image_bytes: bytes) -> str:
    image = decode_image(image_bytes)
    gray = resize_to_height(to_gray(image))
    results = read_raw_text(gray)
    return " ".join(text for _, text, _ in results)


def _only_digits(value: str) -> str:
    return re.sub(r"\D", "", value)


def document_number_matches(document_number: str, photo_text: str) -> bool:
    number_digits = _only_digits(document_number)
    if not number_digits:
        return False
    return number_digits in _only_digits(photo_text)


def validate_document_photo(document_number: str, image_bytes: bytes) -> tuple[bool, str]:
    photo_text = extract_text(image_bytes)
    if document_number_matches(document_number, photo_text):
        return True, VALID_DETAIL
    return False, INVALID_DETAIL


def _cpf_check_digit(digits: str) -> str:
    weight = len(digits) + 1
    total = sum(int(digit) * (weight - index) for index, digit in enumerate(digits))
    remainder = total % 11
    return "0" if remainder < 2 else str(11 - remainder)


def is_valid_cpf(cpf: str) -> bool:
    digits = _only_digits(cpf)
    if len(digits) != 11 or digits == digits[0] * 11:
        return False
    first_digit = _cpf_check_digit(digits[:9])
    second_digit = _cpf_check_digit(digits[:9] + first_digit)
    return digits[9:] == first_digit + second_digit
