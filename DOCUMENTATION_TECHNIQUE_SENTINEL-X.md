# 📘 Documentation Technique & Guide Pas à Pas — Sentinel-X (Option B)

Ce document est le guide technique officiel d'installation, de configuration et d'exécution du système **SENTINEL-X** sous l'**Option B (Topologie Distribuée Edge-to-Server)**.

---

## 🏗️ 1. Architecture Générale (Option B)

En Option B, le **PC Serveur Local** (votre ordinateur portable) héberge le cœur de traitement (Docker, Backend, IA, Dashboard), tandis que le **boîtier physique SENTINEL-X** contient l'ESP8266 et ses capteurs/actionneurs qui communiquent via Wi-Fi en MQTT/HTTP.

```mermaid
flowchart TD
    subgraph Boîtier SENTINEL-X ["Boîtier Physique Edge Node"]
        ESP[ESP8266 NodeMCU v3]
        DHT[Capteur DHT22 Temp/Hum] --> ESP
        MQ2[Capteur MQ-2 Gaz] --> ESP
        PIR[Capteur PIR Mouvement] --> ESP
        ESP --> OLED[Écran OLED I2C 0.96"]
        ESP --> BUZZER[Buzzer Actif]
        ESP --> LED[LED Bicolore]
    end

    subgraph PC Serveur Local ["PC Serveur Local (Windows)"]
        CAM[Webcam USB] --> AI[Script Python Vision IA - YOLOv8]
        ESP -- "Wi-Fi (MQTT 1883 / TLS 8883)" --> MOSQ[Broker MQTT Mosquitto]
        MOSQ --> BACK[Backend API REST & WebSockets]
        AI --> BACK
        BACK --> DB[(Base de Données / Logs)]
        BACK <--> DASH[Dashboard Web Supervision]
    end
```

---

## 📁 2. Structure du Projet

```text
Workshop/
├── DOCUMENTATION_TECHNIQUE_SENTINEL-X.md # Ce document (mis à jour en continu)
├── RESUME_WORKSHOP_SENTINEL-X.md        # Résumé des spécifications du sujet
├── PLAN_ACTION_ET_PRESENTATION_SENTINEL-X.md # Plan de sprint & trame d'oral
├── firmware/                             # Code C++ ESP8266 (PlatformIO)
│   ├── platformio.ini                    # Fichier de config PlatformIO
│   └── src/
│       └── main.cpp                      # Firmware C++ ESP8266 (Sensors + OLED + MQTT)
└── server/                               # Services PC Serveur Local
    ├── docker-compose.yml                # Orchestration Docker Mosquitto
    ├── mosquitto/
    │   └── config/
    │       └── mosquitto.conf            # Configuration Broker MQTT (TCP + WebSockets)
    ├── ai_vision/                        # Module Vision IA Webcam
    │   ├── requirements.txt
    │   └── vision.py                     # Script OpenCV / IA Vision
    └── dashboard/                        # Interface Web de Supervision
        ├── index.html                    # Interface Web responsive
        └── app.js                        # Client MQTT WebSockets & Chart.js
```

---

## 🚀 3. Étape 1 : Lancement de la Stack Serveur (Docker & MQTT)

### 3.1 Fichiers Configurés
* Configuration Mosquitto : [`server/mosquitto/config/mosquitto.conf`](file:///c:/Users/nueve/Documents/EPSI/Workshop/server/mosquitto/config/mosquitto.conf) (Port TCP 1883 + WebSocket 9001).
* Docker Compose : [`server/docker-compose.yml`](file:///c:/Users/nueve/Documents/EPSI/Workshop/server/docker-compose.yml).

### 3.2 Commande de Lancement
Dans un terminal PowerShell ouvert dans le dossier `server/` :
```bash
cd server
docker-compose up -d
```
Vérifier l'état des conteneurs :
```bash
docker-compose ps
```

---

## ⚡ 4. Étape 2 : Câblage & Flashage de l'ESP8266

### 4.1 Plan de Câblage des Broches (Pinout ESP8266 Lolin v3)

| Composant | Broche Composant | Broche ESP8266 (GPIO) | Alimentation / Remarques |
| :--- | :--- | :--- | :--- |
| **DHT22** | DATA | **D5** (GPIO14) | 3.3V |
| **MQ-2** | A0 (Analogique) | **A0** (ADC0) | 5V |
| **PIR HC-SR501**| OUT | **D6** (GPIO12) | 5V |
| **Écran OLED** | SDA / SCL | **D2** (GPIO4) / **D1** (GPIO5) | Adresse I2C `0x3C`, 3.3V |
| **Buzzer** | VCC / SIG | **D7** (GPIO13) | 3.3V |
| **LED Bicolore**| ROUGE / VERT | **D3** (GPIO0) / **D8** (GPIO15) | Cathode commune GND |

### 4.2 Code Source & Compilation
* Code Firmware : [`firmware/src/main.cpp`](file:///c:/Users/nueve/Documents/EPSI/Workshop/firmware/src/main.cpp)
* Configuration : [`firmware/platformio.ini`](file:///c:/Users/nueve/Documents/EPSI/Workshop/firmware/platformio.ini)

**Pour flasher la carte** :
1. Connecter l'ESP8266 via le câble USB-A vers Micro-USB à votre PC.
2. Dans CLion / PlatformIO, exécuter la tâche **Build** puis **Upload**.

---

## 🧠 5. Étape 3 : Module IA Vision (Webcam USB)

### 5.1 Installation des Dépendances Python
```bash
cd server/ai_vision
pip install -r requirements.txt
```

### 5.2 Lancement du Script de Vision
```bash
python vision.py
```
*Le script capte la webcam USB (index 0), redimensionne en 640x480 pour maintenir une latence $<100\text{ ms}$, encadre les intrus détectés et publie une alerte sur le topic MQTT `sentinel/alerts/vision`.*

---

## 📊 6. Étape 4 : Dashboard Web de Supervision

* Fichiers : [`server/dashboard/index.html`](file:///c:/Users/nueve/Documents/EPSI/Workshop/server/dashboard/index.html) et [`server/dashboard/app.js`](file:///c:/Users/nueve/Documents/EPSI/Workshop/server/dashboard/app.js).
* **Ouverture** : Ouvrez directement `server/dashboard/index.html` dans n'importe quel navigateur Web (Chrome, Edge, Firefox).
* Le dashboard se connecte automatiquement au Broker MQTT via WebSocket (`ws://localhost:9001`) et affiche les télémétries en direct (graphiques, métriques, alertes et déclenchement réactif du buzzer).

---

## 🔄 Historique des Modifications
* **v1.1 (Mise à jour complète)** : Implémentation du code C++ ESP8266, configuration Docker Mosquitto, script Python IA Vision et Dashboard Web réactif.
* **v1.0 (Initialisation)** : Création de la documentation technique initiale pour l'Option B.
