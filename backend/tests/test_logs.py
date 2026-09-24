"""GET /logs e GET /logs/{id}/photo — quem enviou cada foto/placa, de onde, e a foto de resguardo
quando existe. Ver app/routers/logs.py e app/models/upload_log.py."""

from app.models import UploadEndpoint, UploadLog
from app.services.photo_storage import save_photo


def _add_log(db_session, employee, **overrides):
    defaults = {
        "employee_id": employee.id,
        "endpoint": UploadEndpoint.UPLOAD,
        "client_ip": "127.0.0.1",
        "final_plate": "ABC1D23",
    }
    log = UploadLog(**{**defaults, **overrides})
    db_session.add(log)
    db_session.flush()
    db_session.refresh(log)
    return log


def test_lists_logs_newest_first_with_who_sent_and_from_where(authenticated_client, db_session, employee):
    _add_log(db_session, employee, final_plate="AAA1111")
    _add_log(db_session, employee, final_plate="BBB2222")

    response = authenticated_client.get("/logs")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert body[0]["final_plate"] == "BBB2222"  # mais recente primeiro
    assert body[0]["employee_username"] == employee.username
    assert body[0]["client_ip"] == "127.0.0.1"


def test_has_photo_reflects_whether_a_safeguard_photo_was_saved(authenticated_client, db_session, employee):
    _add_log(db_session, employee, endpoint=UploadEndpoint.UPLOAD, photo_path=None)
    _add_log(db_session, employee, endpoint=UploadEndpoint.MANUAL, photo_path="manual_reviews/algumacoisa.jpg")

    body = authenticated_client.get("/logs").json()

    by_endpoint = {entry["endpoint"]: entry["has_photo"] for entry in body}
    assert by_endpoint["upload"] is False
    assert by_endpoint["manual"] is True
    # o caminho em disco em si nunca é exposto na listagem.
    assert not any("photo_path" in entry or "manual_reviews" in str(entry) for entry in body)


def test_limit_and_offset_paginate_the_listing(authenticated_client, db_session, employee):
    for i in range(5):
        _add_log(db_session, employee, final_plate=f"AAA{i:04d}")

    first_page = authenticated_client.get("/logs?limit=2&offset=0").json()
    second_page = authenticated_client.get("/logs?limit=2&offset=2").json()

    assert len(first_page) == 2
    assert len(second_page) == 2
    assert {entry["id"] for entry in first_page}.isdisjoint({entry["id"] for entry in second_page})


def test_limit_is_capped_even_if_a_larger_value_is_requested(authenticated_client, db_session, employee):
    for i in range(3):
        _add_log(db_session, employee, final_plate=f"AAA{i:04d}")

    response = authenticated_client.get("/logs?limit=99999")

    assert response.status_code == 200
    assert len(response.json()) == 3  # não tem 200 registros pra devolver, mas não trava/erra


def test_downloads_the_saved_photo(authenticated_client, db_session, employee, tmp_path, monkeypatch):
    import app.services.photo_storage as photo_storage

    monkeypatch.setattr(photo_storage.settings, "upload_dir", str(tmp_path))
    relative_path = save_photo(b"conteudo-da-foto", "image/jpeg")
    log = _add_log(db_session, employee, endpoint=UploadEndpoint.MANUAL, photo_path=relative_path)

    response = authenticated_client.get(f"/logs/{log.id}/photo")

    assert response.status_code == 200
    assert response.content == b"conteudo-da-foto"
    assert response.headers["content-type"] == "image/jpeg"


def test_returns_404_when_the_log_has_no_photo(authenticated_client, db_session, employee):
    log = _add_log(db_session, employee, photo_path=None)

    response = authenticated_client.get(f"/logs/{log.id}/photo")

    assert response.status_code == 404


def test_returns_404_for_a_nonexistent_log(authenticated_client):
    response = authenticated_client.get("/logs/999999/photo")

    assert response.status_code == 404


def test_returns_404_when_the_photo_file_is_missing_from_disk(authenticated_client, db_session, employee, tmp_path, monkeypatch):
    """O registro aponta pra uma foto que não existe mais em disco — não deve virar erro 500."""
    import app.services.photo_storage as photo_storage

    monkeypatch.setattr(photo_storage.settings, "upload_dir", str(tmp_path))
    log = _add_log(db_session, employee, endpoint=UploadEndpoint.MANUAL, photo_path="manual_reviews/nao-existe.jpg")

    response = authenticated_client.get(f"/logs/{log.id}/photo")

    assert response.status_code == 404
