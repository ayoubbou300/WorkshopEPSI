import cv2
import time
import json
import paho.mqtt.client as mqtt
from ultralytics import YOLO

# Configuration MQTT
MQTT_BROKER = "localhost"  # Docker expose le port 1883 sur localhost
MQTT_PORT = 1883
TOPIC_ALERT = "sentinel/alerts/vision"

def on_connect(client, userdata, flags, rc, properties=None):
    print(f"[IA Vision] Connecté au Broker MQTT (Code : {rc})")

try:
    mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, "SentinelX-AI-Vision")
except Exception:
    mqtt_client = mqtt.Client(client_id="SentinelX-AI-Vision")

mqtt_client.on_connect = on_connect

try:
    mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
    mqtt_client.loop_start()
except Exception:
    print(f"[IA Vision] Connexion MQTT autonome (Broker non démarré).")

def main():
    print("[IA Vision] Chargement du modèle IA YOLOv8n...")
    model = YOLO(r"C:\Users\sandro carneo\Documents\master\Workshop\Workshop\yolov8n.pt")

    print("[IA Vision] Ouverture du flux webcam USB (Index 0)...")
    cap = cv2.VideoCapture(0)
    time.sleep(0.5)

    if not cap.isOpened():
        print("[Erreur] Impossible d'initialiser la webcam USB.")
        return

    # Tentative d'acquisition d'une première trame
    ret, frame = cap.read()
    if not ret or frame is None:
        print("\n" + "="*60)
        print("⚠️ [DIAGNOSTIC WEBCAM] Impossible de lire les images de la webcam.")
        print("Vérifiez les points suivants sur votre PC Windows :")
        print(" 1. Confidentialité Windows : Réglages -> Confidentialité & Sécurité -> Caméra")
        print("    Assurez-vous que 'Autoriser les applications de bureau à accéder à la caméra' est ACTIVÉ.")
        print(" 2. Application en conflit : Vérifiez si Teams, Zoom, Discord ou l'application Caméra n'utilisent pas déjà la webcam.")
        print(" 3. Rebrancher le câble USB : Débranchez et rebranchez le câble USB de la webcam.")
        print("="*60 + "\n")
        cap.release()
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    last_alert_time = 0
    print("[IA Vision] ✅ Webcam active. Fenêtre de vision démarrée.")

    while True:
        ret, frame = cap.read()
        if not ret or frame is None:
            time.sleep(0.05)
            continue

        start_time = time.time()

        # Inférence IA YOLOv8
        results = model(frame, verbose=False, stream=True)
        persons_detected = 0

        for r in results:
            for box in r.boxes:
                cls = int(box.cls[0])
                conf = float(box.conf[0])
                if cls == 0 and conf > 0.45:  # Classe 0 = Personne (Intrus)
                    persons_detected += 1
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
                    cv2.putText(frame, f"INTRUS ({conf*100:.0f}%)", (x1, y1 - 10),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

        proc_time = (time.time() - start_time) * 1000
        status_color = (0, 0, 255) if persons_detected > 0 else (0, 255, 0)
        cv2.putText(frame, f"SENTINEL-X IA | Latence: {proc_time:.1f}ms | Intrus: {persons_detected}",
                    (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, status_color, 2)

        if persons_detected > 0 and (time.time() - last_alert_time > 2.0):
            last_alert_time = time.time()
            payload = {
                "alert": "HUMAN_DETECTION",
                "count": persons_detected,
                "timestamp": time.time()
            }
            try:
                mqtt_client.publish(TOPIC_ALERT, json.dumps(payload))
            except Exception:
                pass

        cv2.imshow("Sentinel-X — Flux Webcam USB & IA Vision", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
