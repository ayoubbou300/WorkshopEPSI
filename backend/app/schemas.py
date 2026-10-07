"""Formats des messages échangés (cf. docs/contracts.md)."""

from typing import Annotated, Literal, Optional

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StrictBool, StringConstraints

DEVICE_ID_PATTERN = r"^[a-z0-9][a-z0-9-]{0,31}$"
DeviceId = Annotated[str, StringConstraints(pattern=DEVICE_ID_PATTERN)]
ShortText = Annotated[str, StringConstraints(min_length=1, max_length=64)]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Telemetry(Strict):
    """Mesure publiée par le boîtier sur sentinel/devices/<id>/telemetry."""

    schema_version: Literal[1]
    device_id: DeviceId
    boot_id: Optional[ShortText] = None
    sequence: Optional[int] = Field(None, ge=0, le=2**53)
    # null si le boîtier n'a pas d'heure fiable : on exploite alors received_at.
    timestamp: Optional[AwareDatetime] = None
    # null = valeur inconnue (lecture capteur échouée), jamais 0.
    temperature: Optional[float] = Field(None, ge=-40, le=80, allow_inf_nan=False)
    humidity: Optional[float] = Field(None, ge=0, le=100, allow_inf_nan=False)
    # Valeur ADC brute de l'ESP8266 (0 à 1024) tant qu'aucune calibration n'est définie.
    gas_raw: Optional[int] = Field(None, ge=0, le=1024)
    motion: Optional[StrictBool] = None
    # Positionné uniquement par scripts/simulate.py.
    simulated: StrictBool = False


class DeviceStatus(Strict):
    """État de connexion publié (retained, Last Will) sur sentinel/devices/<id>/status."""

    online: StrictBool


class CommandAck(Strict):
    """Confirmation publiée par le boîtier sur sentinel/devices/<id>/acks."""

    command_id: ShortText
    device_id: DeviceId
    status: Literal["applied", "rejected", "expired", "error"]
    buzzer: Optional[StrictBool] = None
    led: Optional[StrictBool] = None
    reason: Optional[Annotated[str, StringConstraints(max_length=200)]] = None


class AlertIn(Strict):
    """Corps de POST /api/v1/alerts."""

    event_id: Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9._:-]{1,64}$")]
    device_id: Optional[DeviceId] = None
    source: Literal["sensor", "vision", "anomaly"]
    type: Annotated[str, StringConstraints(pattern=r"^[a-z0-9_]{1,48}$")]
    severity: Literal["info", "warning", "critical"]
    timestamp: Optional[AwareDatetime] = None
    score: Optional[float] = Field(None, allow_inf_nan=False)
    message: Optional[Annotated[str, StringConstraints(max_length=500)]] = None


class LegacyTelemetry(BaseModel):
    """Ancien format publié sur sentinel/telemetry (mode compatibilité)."""

    model_config = ConfigDict(extra="ignore")

    device_id: Annotated[str, StringConstraints(min_length=1, max_length=32)]
    temperature: Optional[float] = Field(None, ge=-40, le=80, allow_inf_nan=False)
    humidity: Optional[float] = Field(None, ge=0, le=100, allow_inf_nan=False)
    gas: Optional[int] = Field(None, ge=0, le=1024)
    motion: Optional[StrictBool] = None


class LegacyVisionAlert(BaseModel):
    """Ancien format publié sur sentinel/alerts/vision par le script de vision."""

    model_config = ConfigDict(extra="ignore")

    alert: Annotated[str, StringConstraints(min_length=1, max_length=48)]
    count: Optional[int] = Field(None, ge=0, le=100)
    timestamp: Optional[float] = Field(None, ge=0, allow_inf_nan=False)


class CommandIn(Strict):
    """Corps de POST /api/v1/devices/<id>/commands."""

    action: Literal["set_buzzer", "set_led"]
    value: StrictBool


class LoginIn(Strict):
    username: Annotated[str, StringConstraints(max_length=64)]
    password: Annotated[str, StringConstraints(max_length=256)]
