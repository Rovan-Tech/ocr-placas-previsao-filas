from app.services.plate_verification import VerificationStatus, get_plate_verifier


def test_default_verifier_states_plate_was_not_checked_in_official_database():
    result = get_plate_verifier().verify("BRA2E19")

    assert result.status is VerificationStatus.NOT_CHECKED
    assert result.source is None
    assert "não verificada" in result.detail
