from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


class TestCreateCheckin:
    def test_records_an_authorized_entry_linked_to_a_schedule(self, authenticated_client, employee, make_schedule):
        schedule = make_schedule(employee, plate="ABC1D23")

        response = authenticated_client.post(
            "/checkins", data={"plate": "ABC1D23", "status": "admitted", "schedule_id": schedule.id}
        )

        assert response.status_code == 201
        body = response.json()
        assert body["plate"] == "ABC1D23"
        assert body["status"] == "admitted"
        assert body["schedule_id"] == schedule.id

    def test_rejects_authorizing_without_any_schedule(self, authenticated_client):
        response = authenticated_client.post("/checkins", data={"plate": "ABC1D23", "status": "admitted"})

        assert response.status_code == 422

    def test_rejects_denying_without_any_schedule(self, authenticated_client):
        response = authenticated_client.post("/checkins", data={"plate": "ABC1D23", "status": "cancelled"})

        assert response.status_code == 422

    def test_records_a_denied_entry_linked_to_a_schedule(self, authenticated_client, employee, make_schedule):
        schedule = make_schedule(employee, plate="XYZ9A87")

        response = authenticated_client.post(
            "/checkins", data={"plate": "XYZ9A87", "status": "cancelled", "schedule_id": schedule.id}
        )

        assert response.status_code == 201
        body = response.json()
        assert body["status"] == "cancelled"
        assert body["schedule_id"] == schedule.id

    def test_rejects_an_invalid_plate(self, authenticated_client):
        response = authenticated_client.post("/checkins", data={"plate": "NAO-E-PLACA", "status": "admitted"})

        assert response.status_code == 400

    def test_rejects_the_waiting_status(self, authenticated_client):
        response = authenticated_client.post("/checkins", data={"plate": "ABC1D23", "status": "waiting"})

        assert response.status_code == 422

    def test_rejects_an_unknown_schedule_id(self, authenticated_client):
        response = authenticated_client.post(
            "/checkins", data={"plate": "ABC1D23", "status": "admitted", "schedule_id": 999999}
        )

        assert response.status_code == 404

    def test_requires_authentication(self):
        response = client.post("/checkins", data={"plate": "ABC1D23", "status": "admitted"})

        assert response.status_code == 401

    def test_updates_the_existing_waiting_checkin_instead_of_creating_a_new_one(
        self, authenticated_client, employee, make_schedule, db_session
    ):
        from app.models import CheckIn, CheckInStatus

        schedule = make_schedule(employee, plate="ABC1D23")
        waiting = CheckIn(
            plate="ABC1D23", status=CheckInStatus.WAITING, created_by_id=employee.id, schedule_id=schedule.id
        )
        db_session.add(waiting)
        db_session.flush()
        db_session.refresh(waiting)

        response = authenticated_client.post(
            "/checkins", data={"plate": "ABC1D23", "status": "admitted", "checkin_id": waiting.id}
        )

        assert response.status_code == 201
        body = response.json()
        assert body["id"] == waiting.id
        assert body["status"] == "admitted"
        assert db_session.query(CheckIn).count() == 1

    def test_updating_a_waiting_checkin_sets_its_schedule_when_provided(
        self, authenticated_client, employee, make_schedule, db_session
    ):
        from app.models import CheckIn, CheckInStatus

        schedule = make_schedule(employee, plate="ABC1D23")
        waiting = CheckIn(plate="ABC1D23", status=CheckInStatus.WAITING, created_by_id=employee.id)
        db_session.add(waiting)
        db_session.flush()
        db_session.refresh(waiting)

        response = authenticated_client.post(
            "/checkins",
            data={"plate": "ABC1D23", "status": "admitted", "checkin_id": waiting.id, "schedule_id": schedule.id},
        )

        assert response.status_code == 201
        assert response.json()["schedule_id"] == schedule.id
        db_session.refresh(waiting)
        assert waiting.schedule_id == schedule.id

    def test_rejects_updating_a_waiting_checkin_to_admitted_without_a_schedule(
        self, authenticated_client, employee, db_session
    ):
        from app.models import CheckIn, CheckInStatus

        waiting = CheckIn(plate="ABC1D23", status=CheckInStatus.WAITING, created_by_id=employee.id)
        db_session.add(waiting)
        db_session.flush()
        db_session.refresh(waiting)

        response = authenticated_client.post(
            "/checkins", data={"plate": "ABC1D23", "status": "admitted", "checkin_id": waiting.id}
        )

        assert response.status_code == 422

    def test_rejects_updating_a_waiting_checkin_to_cancelled_without_a_schedule(
        self, authenticated_client, employee, db_session
    ):
        from app.models import CheckIn, CheckInStatus

        waiting = CheckIn(plate="ABC1D23", status=CheckInStatus.WAITING, created_by_id=employee.id)
        db_session.add(waiting)
        db_session.flush()
        db_session.refresh(waiting)

        response = authenticated_client.post(
            "/checkins", data={"plate": "ABC1D23", "status": "cancelled", "checkin_id": waiting.id}
        )

        assert response.status_code == 422

    def test_falls_back_to_creating_when_the_checkin_id_belongs_to_a_different_plate(
        self, authenticated_client, employee, make_schedule, db_session
    ):
        from app.models import CheckIn, CheckInStatus

        schedule = make_schedule(employee, plate="XYZ9A87")
        waiting = CheckIn(plate="ABC1D23", status=CheckInStatus.WAITING, created_by_id=employee.id)
        db_session.add(waiting)
        db_session.flush()
        db_session.refresh(waiting)

        response = authenticated_client.post(
            "/checkins",
            data={"plate": "XYZ9A87", "status": "admitted", "checkin_id": waiting.id, "schedule_id": schedule.id},
        )

        assert response.status_code == 201
        body = response.json()
        assert body["id"] != waiting.id
        assert body["plate"] == "XYZ9A87"

    def test_falls_back_to_creating_when_the_checkin_id_is_already_decided(
        self, authenticated_client, employee, make_schedule, db_session
    ):
        from app.models import CheckIn, CheckInStatus

        schedule = make_schedule(employee, plate="ABC1D23")
        decided = CheckIn(plate="ABC1D23", status=CheckInStatus.ADMITTED, created_by_id=employee.id)
        db_session.add(decided)
        db_session.flush()
        db_session.refresh(decided)

        response = authenticated_client.post(
            "/checkins",
            data={"plate": "ABC1D23", "status": "cancelled", "checkin_id": decided.id, "schedule_id": schedule.id},
        )

        assert response.status_code == 201
        assert response.json()["id"] != decided.id

    def test_falls_back_to_creating_when_the_checkin_id_does_not_exist(
        self, authenticated_client, employee, make_schedule
    ):
        schedule = make_schedule(employee, plate="ABC1D23")

        response = authenticated_client.post(
            "/checkins",
            data={"plate": "ABC1D23", "status": "admitted", "checkin_id": 999999, "schedule_id": schedule.id},
        )

        assert response.status_code == 201


class TestListCheckins:
    def test_lists_recent_checkins_newest_first(self, authenticated_client, employee, make_schedule):
        schedule_abc = make_schedule(employee, plate="ABC1D23")
        schedule_xyz = make_schedule(
            employee, plate="XYZ9A87", driver_document="52998224725", vehicle_chassis="1HGCM82633A004352"
        )
        authenticated_client.post(
            "/checkins", data={"plate": "ABC1D23", "status": "admitted", "schedule_id": schedule_abc.id}
        )
        authenticated_client.post(
            "/checkins", data={"plate": "XYZ9A87", "status": "cancelled", "schedule_id": schedule_xyz.id}
        )

        response = authenticated_client.get("/checkins")

        assert response.status_code == 200
        plates = [row["plate"] for row in response.json()]
        assert plates == ["XYZ9A87", "ABC1D23"]

    def test_breaks_a_tie_in_created_at_by_insertion_order(self, authenticated_client, employee, db_session):
        from datetime import datetime, timezone

        from app.models import CheckIn, CheckInStatus

        same_instant = datetime.now(timezone.utc)
        first = CheckIn(
            plate="ABC1D23", status=CheckInStatus.WAITING, created_by_id=employee.id, created_at=same_instant
        )
        db_session.add(first)
        second = CheckIn(
            plate="XYZ9A87", status=CheckInStatus.WAITING, created_by_id=employee.id, created_at=same_instant
        )
        db_session.add(second)
        db_session.flush()

        response = authenticated_client.get("/checkins")

        plates = [row["plate"] for row in response.json()]
        assert plates == ["XYZ9A87", "ABC1D23"]

    def test_requires_authentication(self):
        response = client.get("/checkins")

        assert response.status_code == 401

    def test_a_decided_checkin_shows_the_actual_wait_it_took(self, authenticated_client, employee, make_schedule):
        schedule = make_schedule(employee, plate="ABC1D23")
        created = authenticated_client.post(
            "/checkins", data={"plate": "ABC1D23", "status": "admitted", "schedule_id": schedule.id}
        ).json()

        response = authenticated_client.get("/checkins")

        row = next(row for row in response.json() if row["id"] == created["id"])
        assert row["estimated_wait_minutes"] is not None
        assert row["estimated_wait_minutes"] >= 0

    def test_a_waiting_checkin_at_the_front_of_the_queue_has_zero_estimated_wait(
        self, authenticated_client, employee, db_session
    ):
        from app.models import CheckIn, CheckInStatus

        waiting = CheckIn(plate="ABC1D23", status=CheckInStatus.WAITING, created_by_id=employee.id)
        db_session.add(waiting)
        db_session.flush()

        response = authenticated_client.get("/checkins")

        row = next(row for row in response.json() if row["plate"] == "ABC1D23")
        assert row["estimated_wait_minutes"] == 0

    def test_a_waiting_checkin_behind_others_has_a_positive_estimated_wait(
        self, authenticated_client, employee, db_session
    ):
        from datetime import datetime, timedelta, timezone

        from app.models import CheckIn, CheckInStatus

        now = datetime.now(timezone.utc)
        first = CheckIn(
            plate="ABC1D23", status=CheckInStatus.WAITING, created_by_id=employee.id, created_at=now
        )
        db_session.add(first)
        second = CheckIn(
            plate="XYZ9A87",
            status=CheckInStatus.WAITING,
            created_by_id=employee.id,
            created_at=now + timedelta(minutes=1),
        )
        db_session.add(second)
        db_session.flush()

        response = authenticated_client.get("/checkins")

        row = next(row for row in response.json() if row["plate"] == "XYZ9A87")
        assert row["estimated_wait_minutes"] > 0
