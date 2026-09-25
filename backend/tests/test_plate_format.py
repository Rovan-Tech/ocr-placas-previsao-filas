import pytest

from app.services.plate_format import PlateFormat, find_plate, normalize, plate_format


@pytest.mark.parametrize(
    ("plate", "expected"),
    [
        ("BRA2E19", PlateFormat.MERCOSUL),
        ("KLM4821", PlateFormat.OLD),
        ("BRA2E1", None),
        ("BRA2E190", None),
        ("1RA2E19", None),
        ("BRAXE19", None),
        ("bra2e19", None),
    ],
)
def test_plate_format(plate, expected):
    assert plate_format(plate) is expected


def test_normalize_removes_hyphen_spaces_and_lowercase():
    assert normalize(" klm-4821. ") == "KLM4821"


@pytest.mark.parametrize(
    ("ocr_text", "plate", "corrections"),
    [
        ("BRA2E19", "BRA2E19", 0),
        ("KLM-4821", "KLM4821", 0),
        ("HJK7L2O", "HJK7L20", 1),
        ("STUOD12", "STU0D12", 1),
        ("TUV6W78", "TUV6W78", 0),
        ("JKLGFO1", "JKL6F01", 2),
        ("8RA2E19", "BRA2E19", 1),
        ("BR ABC1D23", "ABC1D23", 0),
        ("ABC1D23 BRASIL", "ABC1D23", 0),
    ],
)
def test_find_plate_corrects_typical_ocr_confusions(ocr_text, plate, corrections):
    match = find_plate(ocr_text)

    assert match is not None
    assert match.plate == plate
    assert match.corrections == corrections


def test_fifth_character_is_never_changed_because_it_defines_the_format():
    assert find_plate("ABC1O23").plate == "ABC1O23"
    assert find_plate("ABC1023").format is PlateFormat.OLD


@pytest.mark.parametrize("text", ["BRASIL", "SAO PAULO", "SP", "", "1234567", "ABCDEFG"])
def test_rejects_text_that_is_not_a_plate(text):
    assert find_plate(text) is None


def test_rejects_reads_that_need_too_many_corrections():
    assert find_plate("0I2A5B6") is None
    assert find_plate("0I2A5B6", max_corrections=4) is not None
