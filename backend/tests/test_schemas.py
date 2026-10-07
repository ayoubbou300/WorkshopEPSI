import pytest
from pydantic import ValidationError

from app.schemas import AlertIn, CommandAck, CommandIn, Telemetry

VALID = {
    "schema_version": 1,
    "device_id": "esp-01",
    "boot_id": "boot-001",
    "sequence": 42,
    "timestamp": "2026-10-05T14:00:00Z",
    "temperature": 24.5,
    "humidity": 53.2,
    "gas_raw": 318,
    "motion": False,
}


def test_telemetry_valid():
    t = Telemetry.model_validate(VALID)
    assert t.temperature == 24.5 and t.simulated is False


def test_gas_accepts_full_esp8266_adc_range():
    # analogRead() de l'ESP8266 renvoie 0 à 1024.
    assert Telemetry.model_validate({**VALID, "gas_raw": 1024}).gas_raw == 1024


def test_missing_values_stay_unknown():
    data = {k: v for k, v in VALID.items() if k not in ("temperature", "humidity")}
    data["timestamp"] = None
    t = Telemetry.model_validate(data)
    assert t.temperature is None and t.humidity is None and t.timestamp is None


@pytest.mark.parametrize(
    "override",
    [
        {"schema_version": 2},
        {"device_id": "ESP 01"},
        {"temperature": 500},
        {"humidity": -1},
        {"gas_raw": 4096},
        {"motion": "yes"},
        {"timestamp": "2026-10-05T14:00:00"},  # sans fuseau
        {"unexpected": 1},
    ],
)
def test_telemetry_rejects_invalid(override):
    with pytest.raises(ValidationError):
        Telemetry.model_validate({**VALID, **override})


def test_telemetry_rejects_nan():
    with pytest.raises(ValidationError):
        Telemetry.model_validate_json(b'{"schema_version":1,"device_id":"esp-01","temperature":NaN}')


def test_command_only_known_actions():
    assert CommandIn.model_validate({"action": "set_led", "value": True}).value is True
    with pytest.raises(ValidationError):
        CommandIn.model_validate({"action": "toggle_buzzer", "value": True})
    with pytest.raises(ValidationError):
        CommandIn.model_validate({"action": "set_buzzer", "value": 1})


def test_ack_status():
    CommandAck.model_validate({"command_id": "cmd-1", "device_id": "esp-01", "status": "applied", "buzzer": True})
    with pytest.raises(ValidationError):
        CommandAck.model_validate({"command_id": "cmd-1", "device_id": "esp-01", "status": "ok"})


def test_alert_limits():
    base = {"event_id": "vision-001", "source": "vision", "type": "person_detected", "severity": "warning"}
    AlertIn.model_validate(base)
    with pytest.raises(ValidationError):
        AlertIn.model_validate({**base, "message": "x" * 501})
    with pytest.raises(ValidationError):
        AlertIn.model_validate({**base, "source": "camera"})
