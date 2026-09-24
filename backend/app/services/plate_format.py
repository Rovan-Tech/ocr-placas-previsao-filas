
import re
from dataclasses import dataclass
from enum import Enum

PLATE_LENGTH = 7

MERCOSUL_PATTERN = re.compile(r"^[A-Z]{3}[0-9][A-Z][0-9]{2}$")
OLD_PATTERN = re.compile(r"^[A-Z]{3}[0-9]{4}$")

LETTER_POSITIONS = (0, 1, 2)
DIGIT_POSITIONS = (3, 5, 6)

DIGIT_TO_LETTER = {"0": "O", "1": "I", "2": "Z", "4": "A", "5": "S", "6": "G", "7": "T", "8": "B"}
LETTER_TO_DIGIT = {
    "O": "0", "Q": "0", "D": "0", "U": "0",
    "I": "1", "L": "1", "J": "1", "T": "1",
    "Z": "2", "A": "4", "S": "5", "G": "6", "B": "8",
}


class PlateFormat(str, Enum):
    MERCOSUL = "mercosul"
    OLD = "antigo"


@dataclass(frozen=True)
class PlateMatch:
    plate: str
    format: PlateFormat
    corrections: int


def normalize(text: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", text.upper())


def plate_format(plate: str) -> PlateFormat | None:
    if MERCOSUL_PATTERN.match(plate):
        return PlateFormat.MERCOSUL
    if OLD_PATTERN.match(plate):
        return PlateFormat.OLD
    return None


def _correct_window(window: str) -> PlateMatch | None:
    chars = list(window)
    corrections = 0
    for position in LETTER_POSITIONS:
        if chars[position].isdigit():
            if chars[position] not in DIGIT_TO_LETTER:
                return None
            chars[position] = DIGIT_TO_LETTER[chars[position]]
            corrections += 1
    for position in DIGIT_POSITIONS:
        if chars[position].isalpha():
            if chars[position] not in LETTER_TO_DIGIT:
                return None
            chars[position] = LETTER_TO_DIGIT[chars[position]]
            corrections += 1

    plate = "".join(chars)
    detected_format = plate_format(plate)
    if detected_format is None:
        return None
    return PlateMatch(plate, detected_format, corrections)


def find_plate(text: str, *, max_corrections: int = 2) -> PlateMatch | None:
    normalized = normalize(text)
    best: PlateMatch | None = None
    for start in range(len(normalized) - PLATE_LENGTH + 1):
        match = _correct_window(normalized[start : start + PLATE_LENGTH])
        if match and match.corrections <= max_corrections:
            if best is None or match.corrections < best.corrections:
                best = match
    return best

