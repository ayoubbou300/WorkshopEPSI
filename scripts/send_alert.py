"""Envoie une alerte de test à POST /api/v1/alerts (bibliothèque standard uniquement).

Usage :
  ALERTS_API_KEY=... python3 scripts/send_alert.py [--url https://localhost] [--event-id ID]
         [--source vision] [--type person_detected] [--severity warning] [--insecure]

--insecure désactive la vérification TLS : à réserver aux essais locaux, jamais au service IA.
Préférer --cafile infra/certs/ca.crt.
"""

import argparse
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="https://localhost")
    parser.add_argument("--cafile", default="infra/certs/ca.crt")
    parser.add_argument("--insecure", action="store_true")
    parser.add_argument("--event-id", default=f"test-{uuid.uuid4().hex[:8]}")
    parser.add_argument("--device-id", default="sim-01")
    parser.add_argument("--source", default="vision", choices=["sensor", "vision", "anomaly"])
    parser.add_argument("--type", default="person_detected")
    parser.add_argument("--severity", default="warning", choices=["info", "warning", "critical"])
    parser.add_argument("--score", type=float, default=0.9)
    parser.add_argument("--message", default="Alerte de test (simulation)")
    args = parser.parse_args()

    key = os.environ.get("ALERTS_API_KEY")
    if not key:
        print("Variable ALERTS_API_KEY manquante", file=sys.stderr)
        return 2

    body = {
        "event_id": args.event_id,
        "device_id": args.device_id,
        "source": args.source,
        "type": args.type,
        "severity": args.severity,
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "score": args.score,
        "message": args.message,
    }
    if args.insecure:
        context = ssl._create_unverified_context()
    else:
        context = ssl.create_default_context(cafile=args.cafile)
    request = urllib.request.Request(
        f"{args.url.rstrip('/')}/api/v1/alerts",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "X-API-Key": key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, context=context, timeout=5) as response:
            print(response.status, response.read().decode())
    except urllib.error.HTTPError as exc:
        print(exc.code, exc.read().decode(), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
