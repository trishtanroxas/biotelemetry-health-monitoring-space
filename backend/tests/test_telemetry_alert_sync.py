from copy import deepcopy
from datetime import datetime, timedelta, timezone
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.routes import alerts as alerts_route
from backend.app.routes import telemetry as telemetry_route
from backend.app.services.nasa_baselines import nasa_baselines
from backend.app.services.simulator import simulator


class FakeResult:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    def __init__(self, table_rows):
        self._rows = table_rows
        self._op = "select"
        self._payload = None
        self._filters = []
        self._order_col = None
        self._order_desc = False
        self._limit = None

    def select(self, _cols="*"):
        self._op = "select"
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload
        return self

    def upsert(self, payload, on_conflict=None):
        self._op = "upsert"
        self._payload = (payload, on_conflict or "id")
        return self

    def update(self, patch):
        self._op = "update"
        self._payload = patch
        return self

    def eq(self, col, value):
        self._filters.append(("eq", col, value))
        return self

    def in_(self, col, values):
        self._filters.append(("in", col, set(values)))
        return self

    def order(self, col, desc=False):
        self._order_col = col
        self._order_desc = desc
        return self

    def limit(self, count):
        self._limit = count
        return self

    def _matches(self, row):
        for kind, col, target in self._filters:
            if kind == "eq" and row.get(col) != target:
                return False
            if kind == "in" and row.get(col) not in target:
                return False
        return True

    def execute(self):
        if self._op == "insert":
            items = self._payload if isinstance(self._payload, list) else [self._payload]
            inserted = [deepcopy(item) for item in items]
            self._rows.extend(inserted)
            return FakeResult(deepcopy(inserted))

        if self._op == "upsert":
            payload, conflict_col = self._payload
            items = payload if isinstance(payload, list) else [payload]
            out = []
            for item in items:
                copy_item = deepcopy(item)
                idx = next(
                    (i for i, existing in enumerate(self._rows) if existing.get(conflict_col) == copy_item.get(conflict_col)),
                    None,
                )
                if idx is None:
                    self._rows.append(copy_item)
                else:
                    self._rows[idx].update(copy_item)
                    copy_item = self._rows[idx]
                out.append(deepcopy(copy_item))
            return FakeResult(out)

        if self._op == "update":
            updated = []
            for row in self._rows:
                if self._matches(row):
                    row.update(deepcopy(self._payload))
                    updated.append(deepcopy(row))
            return FakeResult(updated)

        matched = [deepcopy(row) for row in self._rows if self._matches(row)]
        if self._order_col:
            matched.sort(key=lambda r: str(r.get(self._order_col, "")), reverse=self._order_desc)
        if self._limit is not None:
            matched = matched[: self._limit]
        return FakeResult(matched)


class FakeSupabase:
    def __init__(self):
        self.tables = {
            "alerts": [],
            "telemetry_logs": [],
        }

    def table(self, name):
        return FakeQuery(self.tables.setdefault(name, []))


class TelemetryAlertSyncTests(unittest.TestCase):
    def setUp(self):
        alerts_route.in_memory_alerts.clear()
        alerts_route._synced_active_types_by_astronaut.clear()
        simulator.state.clear()
        if hasattr(simulator, "_last_config"):
            simulator._last_config.clear()
        self.fake_db = FakeSupabase()
        self.client = TestClient(app)

    def tearDown(self):
        alerts_route.in_memory_alerts.clear()
        alerts_route._synced_active_types_by_astronaut.clear()
        simulator.state.clear()

    def test_cold_start_stale_supabase_alerts_cleared_on_nominal_telemetry(self):
        stale_ts = (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat()
        self.fake_db.tables["alerts"].extend([
            {
                "id": "stale-hyp-1",
                "astronaut_id": "ASTRO-01",
                "alert_type": "HYPOXIA",
                "severity": "CRITICAL",
                "message": "Critical blood oxygen saturation drop (88.0%).",
                "acknowledged": False,
                "timestamp": stale_ts,
                "trigger_metric": "SpO2 88.0%",
                "recommended_action": "Switch to secondary O2.",
                "hazard_domain": "Atmosphere & Suit",
            },
            {
                "id": "stale-rad-1",
                "astronaut_id": "ASTRO-01",
                "alert_type": "RADIATION_SPIKE",
                "severity": "CRITICAL",
                "message": "High radiation dosage (65.0 uSv/h).",
                "acknowledged": False,
                "timestamp": stale_ts,
                "trigger_metric": "Rad 65.0 uSv/h",
                "recommended_action": "Seek storm shelter.",
                "hazard_domain": "Space Radiation",
            },
        ])

        with patch("backend.app.routes.telemetry.get_supabase", return_value=self.fake_db), \
             patch("backend.app.routes.alerts.get_supabase", return_value=self.fake_db), \
             patch.object(nasa_baselines, "refresh_live_iss_position", new=AsyncMock()):
            tel_res = self.client.get(
                "/api/v1/telemetry/latest",
                params={
                    "astronaut_id": "ASTRO-01",
                    "mission_zone": "LEO_ISS",
                    "mission_day": 14,
                    "shielding": "NOMINAL",
                    "solar_storm": "LIVE_DONKI",
                    "anomaly": "NONE",
                },
            )
            self.assertEqual(tel_res.status_code, 200)
            vitals = tel_res.json()
            self.assertGreater(vitals["spo2"], 94.0)
            self.assertLess(vitals["radiation_rate"], 30.0)

            alerts_res = self.client.get("/api/v1/alerts", params={"astronaut_id": "ASTRO-01"})
            self.assertEqual(alerts_res.status_code, 200)
            active = [a for a in alerts_res.json() if not a["acknowledged"]]
            self.assertEqual(active, [])
            self.assertTrue(all(row["acknowledged"] for row in self.fake_db.tables["alerts"]))

    def test_ongoing_active_alert_updates_trigger_metric_and_severity_in_db_and_endpoint(self):
        stale_ts = (datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat()
        self.fake_db.tables["alerts"].append({
            "id": "old-rad-65",
            "astronaut_id": "ASTRO-01",
            "alert_type": "RADIATION_SPIKE",
            "severity": "CRITICAL",
            "message": "Solar Particle Event / High radiation dosage (65.0 uSv/h).",
            "acknowledged": False,
            "timestamp": stale_ts,
            "trigger_metric": "Rad 65.0 uSv/h",
            "recommended_action": "Seek storm shelter.",
            "hazard_domain": "Space Radiation",
        })

        with patch("backend.app.routes.telemetry.get_supabase", return_value=self.fake_db), \
             patch("backend.app.routes.alerts.get_supabase", return_value=self.fake_db), \
             patch.object(nasa_baselines, "refresh_live_iss_position", new=AsyncMock()):
            # Seed live EXTREME_G5 storm in Mars transit so radiation rises well past 65 uSv/h
            tel_res = self.client.get(
                "/api/v1/telemetry/latest",
                params={
                    "astronaut_id": "ASTRO-01",
                    "mission_zone": "MARS_TRANSIT",
                    "mission_day": 180,
                    "shielding": "UNSHIELDED_EVA",
                    "solar_storm": "EXTREME_G5",
                    "anomaly": "NONE",
                },
            )
            self.assertEqual(tel_res.status_code, 200)
            rad_rate = tel_res.json()["radiation_rate"]
            self.assertGreater(rad_rate, 80.0)

            alerts_res = self.client.get("/api/v1/alerts", params={"astronaut_id": "ASTRO-01"})
            self.assertEqual(alerts_res.status_code, 200)
            active_rad = [a for a in alerts_res.json() if not a["acknowledged"] and a["alert_type"] == "RADIATION_SPIKE"]
            self.assertEqual(len(active_rad), 1)
            self.assertEqual(active_rad[0]["trigger_metric"], f"Rad {rad_rate:.1f} uSv/h")

            db_open_rad = [
                row for row in self.fake_db.tables["alerts"]
                if not row["acknowledged"] and row["alert_type"] == "RADIATION_SPIKE"
            ]
            self.assertEqual(len(db_open_rad), 1)
            self.assertEqual(db_open_rad[0]["trigger_metric"], f"Rad {rad_rate:.1f} uSv/h")

            # De-escalate to LEO storm shelter or nominal warning band and verify DB + endpoint reflect new metric/severity
            tel_down = self.client.get(
                "/api/v1/telemetry/latest",
                params={
                    "astronaut_id": "ASTRO-01",
                    "mission_zone": "DEEP_SPACE",
                    "mission_day": 180,
                    "shielding": "STORM_SHELTER",
                    "solar_storm": "M_FLARE_CME",
                    "anomaly": "NONE",
                },
            )
            self.assertEqual(tel_down.status_code, 200)
            down_rad = tel_down.json()["radiation_rate"]

            alerts_down = self.client.get("/api/v1/alerts", params={"astronaut_id": "ASTRO-01"})
            active_down = [a for a in alerts_down.json() if not a["acknowledged"] and a["alert_type"] == "RADIATION_SPIKE"]
            if down_rad >= 30.0:
                self.assertEqual(len(active_down), 1)
                self.assertEqual(active_down[0]["trigger_metric"], f"Rad {down_rad:.1f} uSv/h")
            else:
                self.assertEqual(active_down, [])

    def test_simulator_snaps_on_config_switch_and_orthostatic_adjusts_hydration(self):
        high = simulator.generate_vitals(
            "ASTRO-01",
            anomaly_mode="NONE",
            mission_zone="MARS_TRANSIT",
            mission_day=365,
            shielding="UNSHIELDED_EVA",
            solar_storm="EXTREME_G5",
        )
        self.assertGreater(high.radiation_rate, 80.0)

        nominal = simulator.generate_vitals(
            "ASTRO-01",
            anomaly_mode="NONE",
            mission_zone="LEO_ISS",
            mission_day=14,
            shielding="NOMINAL",
            solar_storm="LIVE_DONKI",
        )
        # Switching back to LEO nominal must snap radiation below warning threshold without multi-tick decay tail.
        self.assertLess(nominal.radiation_rate, 30.0)

        ortho = simulator.generate_vitals(
            "ASTRO-01",
            anomaly_mode="ORTHOSTATIC",
            mission_zone="LEO_ISS",
            mission_day=14,
            shielding="NOMINAL",
            solar_storm="LIVE_DONKI",
        )
        self.assertLessEqual(ortho.hydration_pct, 84.0)


if __name__ == "__main__":
    unittest.main()
