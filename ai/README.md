# Vision IA (webcam USB)

Script de l'équipe IA : détection de personnes avec YOLOv8n sur la webcam USB du PC serveur.
Il publie `{"alert":"HUMAN_DETECTION","count":n,"timestamp":t}` sur `sentinel/alerts/vision`,
que la stack transforme en alerte du dashboard (mode compatibilité, au plus une toutes les 30 s).

```sh
pip install -r requirements.txt
python vision.py          # sur le PC serveur, stack lancée avec LEGACY_MQTT_ENABLED=true
```

| Variable | Défaut | Rôle |
|---|---|---|
| `MQTT_BROKER` | `localhost` | Broker MQTT (port du mode compatibilité) |
| `MQTT_PORT` | `1883` | |
| `YOLO_MODEL` | `yolov8n.pt` à côté du script | Téléchargé automatiquement s'il est absent |

Reste à faire : diffuser le flux annoté en MJPEG (`http://localhost:8081/stream`) pour le
retour webcam du dashboard, envoyer les alertes via `POST /api/v1/alerts`, et ajouter le
modèle d'anomalies environnementales (Isolation Forest) exigé par le sujet.
