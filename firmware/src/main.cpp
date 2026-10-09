#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Arduino.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <ESP8266WebServerSecure.h>
#include <ESP8266WiFi.h>
#include <ESP8266mDNS.h>
#include <PubSubClient.h>
extern "C" {
#include "user_interface.h"
}

// Serveur Web sécurisé HTTPS sur le port 443 (BearSSL ECC)
BearSSL::ESP8266WebServerSecure webServer(443);

// ── CERTIFICAT ECC X.509 (server/esp_cert.pem) ──
const char server_cert[] PROGMEM = R"PEM(
-----BEGIN CERTIFICATE-----
MIIBYzCCAQqgAwIBAgIUHN/cmH8FGRDIaYYD6NXYOFlEV2YwCgYIKoZIzj0EAwIw
GDEWMBQGA1UEAwwNZXNwODI2Ni5sb2NhbDAeFw0yNjEwMDgwODA5MjZaFw0zNjEw
MDUwODA5MjZaMBgxFjAUBgNVBAMMDWVzcDgyNjYubG9jYWwwWTATBgcqhkjOPQIB
BggqhkjOPQMBBwNCAATVhoepwtpGbAJSarBPY/ANFVZ7mTFWSTfdsT6sViB+7JKk
JyCLRiPiDgb5xF4yeuU7gd4RjWevTJvbhKbPC6C3ozIwMDAdBgNVHQ4EFgQUqAPV
TPmKcji3a/qvPEEOWf38/zIwDwYDVR0TAQH/BAUwAwEB/zAKBggqhkjOPQQDAgNH
ADBEAiB0HRh8H42OLrMlCNaDQ1OPjL9W62rZtvbYNqYou5n6HgIgI5EG/8PJ+QO6
rSLsSYMICWXAH923nJgd3bzowMoTBPs=
-----END CERTIFICATE-----
)PEM";

// ── CLÉ PRIVÉE ECC (server/esp_key.pem) ──
const char server_key[] PROGMEM = R"PEM(
-----BEGIN EC PARAMETERS-----
BggqhkjOPQMBBw==
-----END EC PARAMETERS-----
-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIOfTMXK1n4PGnOjDi+d1Y2bTTK1nfAqjom3thfxM7P9MoAoGCCqGSM49
AwEHoUQDQgAE1YaHqcLaRmwCUmqwT2PwDRVWe5kxVkk33bE+rFYgfuySpCcgi0Yj
4g4G+cReMnrlO4HeEY1nr0yb24Smzwugtw==
-----END EC PRIVATE KEY-----
)PEM";

// Configuration du Point d'Accès Wi-Fi émis par la carte (SoftAP)
const char *AP_SSID = "SENTINEL-X10-SECURE";
const char *AP_PASS = "P@sSw0rdSG10!?";

// Configuration du Serveur MQTT
const char *MQTT_SERVER = "192.168.4.2"; // IP de ton PC (Mosquitto)
const int MQTT_PORT = 1883;

// ==========================================
// AFFECTATION DES BROCHES (PINOUT ESP8266)
// ==========================================
#define DHTPIN 14 // D5 (GPIO14)
#define DHTTYPE DHT22
#define MQ2PIN A0        // ADC0
#define PIRPIN 13        // D7 (GPIO13)
#define BUZZER_PIN 12    // D6 (GPIO12)
#define LED_RED_PIN 0    // D3 (GPIO0)
#define LED_GREEN_PIN 15 // D8 (GPIO15)

// OLED 0.96 pouces I2C (adresse 0x3C)
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// Capteurs & Services
DHT dht(DHTPIN, DHTTYPE);
WiFiClient espClient;
PubSubClient mqttClient(espClient);

// Variables globales de mesures
float temperature = 0.0;
float humidity = 0.0;
int gasRawValue = 0;
bool motionDetected = false;
bool manualBuzzerState = false;
unsigned long lastPublishTime = 0;

// Filtrage par Adresse MAC : Seule la carte Wi-Fi de ton PC est autorisée
uint8_t ALLOWED_MAC[6] = {0x50, 0x28, 0x4A, 0x01, 0x10, 0x21};

WiFiEventHandler stationConnectedHandler;

void onStationConnected(const WiFiEventSoftAPModeStationConnected &evt) {
  bool isAuthorized = true;
  for (int i = 0; i < 6; i++) {
    if (evt.mac[i] != ALLOWED_MAC[i]) {
      isAuthorized = false;
      break;
    }
  }

  char macStr[18];
  snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
           evt.mac[0], evt.mac[1], evt.mac[2], evt.mac[3], evt.mac[4], evt.mac[5]);

  if (!isAuthorized) {
    Serial.printf("[SÉCURITÉ 🚨] APPAREIL REJETÉ & EXPULSÉ ! MAC non autorisée : %s\n", macStr);
    WiFi.softAPdisconnect(false);
    WiFi.softAP(AP_SSID, AP_PASS, 1, 0);

    if (mqttClient.connected()) {
      StaticJsonDocument<128> doc;
      doc["mac"] = macStr;
      doc["status"] = "REJECTED";
      char buf[128];
      serializeJson(doc, buf);
      mqttClient.publish("sentinel/security/wifi_attempt", buf);
    }
  } else {
    Serial.printf("[SÉCURITÉ ✅] APPAREIL AUTORISÉ CONNECTÉ ! MAC: %s\n", macStr);

    if (mqttClient.connected()) {
      StaticJsonDocument<128> doc;
      doc["mac"] = macStr;
      doc["status"] = "ALLOWED";
      char buf[128];
      serializeJson(doc, buf);
      mqttClient.publish("sentinel/security/wifi_attempt", buf);
    }
  }
}

void setupWiFi() {
  delay(10);
  Serial.println();
  Serial.println("======================");
  Serial.println("SENTINEL-X Booting...");
  Serial.println("======================");

  WiFi.persistent(false);
  WiFi.disconnect(true);
  delay(200);

  stationConnectedHandler =
      WiFi.onSoftAPModeStationConnected(&onStationConnected);

  // Mode Point d'Accès autonome (SoftAP) : Aucun PC ni box requis
  WiFi.mode(WIFI_AP);
  bool apSuccess = WiFi.softAP(AP_SSID, AP_PASS, 1, 0);

  IPAddress apIP = WiFi.softAPIP();

  Serial.print("[WiFi AP] Hotspot autonome '");
  Serial.print(AP_SSID);
  Serial.print("' -> ");
  Serial.println(apSuccess ? "✅ SUCCÈS" : "❌ ÉCHEC");
  Serial.print("[WiFi AP] IP : ");
  Serial.println(apIP);

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("SENTINEL-X READY");
  display.println("Wi-Fi Hotspot :");
  display.println(AP_SSID);
  display.print("IP: ");
  display.println(apIP);
  display.display();
  delay(1500);
}

void mqttCallback(char *topic, byte *payload, unsigned int length) {
  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, payload, length);
  if (error)
    return;

  if (doc.containsKey("buzzer")) {
    manualBuzzerState = doc["buzzer"];
    Serial.print("[MQTT] Commande Buzzer reçue : ");
    Serial.println(manualBuzzerState ? "ACTIVÉ" : "DÉSACTIVÉ");
  }
}

unsigned long lastMQTTAttempt = 0;

void reconnectMQTT() {
  unsigned long now = millis();
  if (now - lastMQTTAttempt > 3000) {
    lastMQTTAttempt = now;
    String clientId = "SentinelX-ESP8266-";
    clientId += String(ESP.getChipId(), HEX);
    if (mqttClient.connect(clientId.c_str())) {
      Serial.println(
          "[MQTT] ✅ Connecté au Broker Mosquitto PC (192.168.4.2:1883)");
      mqttClient.subscribe("sentinel/commands");
    } else {
      Serial.print("[MQTT] ⏳ Attente PC sur 192.168.4.2:1883... (code: ");
      Serial.print(mqttClient.state());
      Serial.println(")");
    }
  }
}

void updateOLED() {
  display.clearDisplay();

  // ── 1. HEADER (Bandeau de titre inversé) ──
  display.fillRect(0, 0, 128, 12, SSD1306_WHITE);
  display.setTextSize(1);
  display.setTextColor(SSD1306_BLACK);
  display.setCursor(3, 2);
  display.print("SENTINEL-X");

  display.setCursor(82, 2);
  if (WiFi.getMode() == WIFI_AP || WiFi.status() == WL_CONNECTED) {
    display.print("[ON]");
  } else {
    display.print("[OFF]");
  }

  // ── 2. TEMPÉRATURE ET HUMIDITÉ (Grand affichage side-by-side) ──
  display.setTextColor(SSD1306_WHITE);

  // Température
  display.setCursor(2, 16);
  display.print("TEMP");
  display.setCursor(2, 26);
  display.setTextSize(2);
  display.print(temperature, 1);
  display.setTextSize(1);
  display.print("C");

  // Ligne de séparation verticale au centre
  display.drawFastVLine(64, 15, 26, SSD1306_WHITE);

  // Humidité
  display.setCursor(70, 16);
  display.print("HUMI");
  display.setCursor(70, 26);
  display.setTextSize(2);
  display.print((int)humidity);
  display.setTextSize(1);
  display.print("%");

  // Ligne de séparation horizontale
  display.drawFastHLine(0, 44, 128, SSD1306_WHITE);

  // ── 3. NIVEAU DE GAZ & BANNIÈRE SÉCURITÉ ──
  display.setTextSize(1);
  display.setCursor(2, 50);
  display.print("GAZ:");
  display.print(gasRawValue);

  if (motionDetected) {
    // Bannière d'alerte inversée en gros à droite
    display.fillRect(52, 47, 76, 17, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK);
    display.setCursor(55, 51);
    display.print("INTRUSION!");
  } else {
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(78, 50);
    display.print("[ SECURE ]");
  }

  display.display();
}

// ── SERVEUR WEB : HANDLERS REST API & DASHBOARD HTML ──
void handleRoot() {
  String html = "<!DOCTYPE html><html><head><meta charset='utf-8'><meta "
                "name='viewport' content='width=device-width,initial-scale=1'>";
  html += "<title>SENTINEL-X Dashboard</title>";
  html += "<style>body{font-family:Segoe "
          "UI,sans-serif;background:#0d1117;color:#c9d1d9;text-align:center;"
          "padding:20px;}";
  html += ".card{background:#161b22;border:1px solid "
          "#30363d;border-radius:12px;padding:18px;margin:12px "
          "auto;max-width:340px;box-shadow:0 4px 12px rgba(0,0,0,0.4);}";
  html += ".val{font-size:2.2em;color:#58a6ff;font-weight:bold;margin:8px 0;}";
  html += "button{background:#da3633;color:#fff;border:none;padding:12px "
          "24px;border-radius:8px;font-size:1em;font-weight:bold;cursor:"
          "pointer;transition:0.2s;}";
  html += "button:hover{background:#f85149;}";
  html += "</style></head><body>";
  html += "<h1>🛡️ SENTINEL-X NODE</h1>";
  html += "<div class='card'><div>Température</div><div class='val' id='t'>" +
          String(temperature, 1) + " °C</div></div>";
  html += "<div class='card'><div>Humidité</div><div class='val' id='h'>" +
          String((int)humidity) + " %</div></div>";
  html += "<div class='card'><div>Qualité d'Air (MQ-2)</div><div class='val' "
          "id='g'>" +
          String(gasRawValue) + "</div></div>";
  html += "<div class='card'><div>État Sécurité (PIR)</div><div class='val' "
          "id='m'>" +
          String(motionDetected ? "⚠️ INTRUSION" : "✅ RAS") + "</div></div>";
  html += "<div class='card'><button "
          "onclick='fetch(\"/api/buzzer\",{method:\"POST\"})'>🔊 TEST "
          "BUZZER</button></div>";
  html +=
      "<script>setInterval(()=>{fetch('/api/data').then(r=>r.json()).then(d=>{";
  html +=
      "document.getElementById('t').innerText=d.temperature.toFixed(1)+' °C';";
  html += "document.getElementById('h').innerText=Math.round(d.humidity)+' %';";
  html += "document.getElementById('g').innerText=d.gas;";
  html +=
      "document.getElementById('m').innerText=d.motion?'⚠️ INTRUSION':'✅ RAS';";
  html += "})},300);</script>";
  html += "</body></html>";
  webServer.send(200, "text/html", html);
}

void handleApiData() {
  StaticJsonDocument<200> doc;
  doc["temperature"] = temperature;
  doc["humidity"] = humidity;
  doc["gas"] = gasRawValue;
  doc["motion"] = motionDetected;
  String json;
  serializeJson(doc, json);
  webServer.send(200, "application/json", json);
}

void handleBuzzer() {
  manualBuzzerState = !manualBuzzerState;
  Serial.print("[HTTPS] Commande Buzzer HTTP reçue : ");
  Serial.println(manualBuzzerState ? "ACTIVÉ" : "DÉSACTIVÉ");
  webServer.send(200, "text/plain",
                 manualBuzzerState ? "BUZZER_ON" : "BUZZER_OFF");
}

void setup() {
  Serial.begin(115200);
  pinMode(PIRPIN, INPUT); // HC-SR501 sort un signal 3.3V actif (HIGH/LOW),
                          // INPUT simple est requis
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_RED_PIN, OUTPUT);
  pinMode(LED_GREEN_PIN, OUTPUT);

  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(LED_GREEN_PIN, HIGH);
  digitalWrite(LED_RED_PIN, LOW);

  dht.begin();
  Wire.begin(4, 5); // SDA = D2(GPIO4), SCL = D1(GPIO5)
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);

  setupWiFi();
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);

  // Configuration du certificat ECC et de la clé privée BearSSL
  webServer.getServer().setECCert(new BearSSL::X509List(server_cert),
                                  BR_KEYTYPE_EC,
                                  new BearSSL::PrivateKey(server_key));

  // Configuration des routes du serveur HTTPS embarqué
  webServer.on("/", handleRoot);
  webServer.on("/api/data", handleApiData);
  webServer.on("/api/buzzer", HTTP_POST, handleBuzzer);
  webServer.begin();
  Serial.println("[HTTPS] Serveur SSL/TLS actif sur le port 443 !");

  if (MDNS.begin("sentinel")) {
    Serial.println("[mDNS] Nom de domaine actif : https://sentinel.local");
  }
}

void loop() {
  MDNS.update();
  webServer.handleClient(); // Traite les requêtes Web des navigateurs (PC /
                            // Téléphone)

  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();

  unsigned long now = millis();
  if (now - lastPublishTime >
      300) { // Mesure ultra-rapide toutes les 300ms (3x par seconde)
    lastPublishTime = now;

    // Lecture réelle des capteurs
    float rawTemp = dht.readTemperature();
    float rawHumi = dht.readHumidity();
    gasRawValue = analogRead(MQ2PIN);
    int pirRaw = digitalRead(PIRPIN);
    motionDetected = (pirRaw == HIGH);

    // Diagnostics DHT
    if (isnan(rawTemp) || isnan(rawHumi)) {
      Serial.print("[DHT] ❌ Echec D5 (fallback 22.5°C/45%) | ");
      temperature = 22.5;
      humidity = 45.0;
    } else {
      temperature = rawTemp;
      humidity = rawHumi;
      Serial.print("[DHT] Temp: ");
      Serial.print(temperature, 1);
      Serial.print("C  Humi: ");
      Serial.print(humidity, 1);
      Serial.print("% | ");
    }

    // Diagnostics PIR & MQ-2
    Serial.print("[PIR D7] raw=");
    Serial.print(pirRaw);
    Serial.print(" (");
    Serial.print(motionDetected ? "MOTION" : "RAS");
    Serial.print(") | ");

    Serial.print("[MQ-2 A0] raw=");
    Serial.println(gasRawValue);

    // Gestion Automatique de l'Alarme (Intrusion PIR, Température >= 45°C, Gaz
    // Élevé ou Commande Manuel)
    bool isAlarmActive = motionDetected || (temperature >= 35.0) ||
                         (gasRawValue > 450) || manualBuzzerState;

    if (isAlarmActive) {
      digitalWrite(LED_RED_PIN, HIGH);
      digitalWrite(LED_GREEN_PIN, LOW);
      digitalWrite(BUZZER_PIN, HIGH);
      tone(BUZZER_PIN, 2000); // 2kHz tone pour buzzer actif et passif
    } else {
      digitalWrite(LED_RED_PIN, LOW);
      digitalWrite(LED_GREEN_PIN, HIGH);
      digitalWrite(BUZZER_PIN, LOW);
      noTone(BUZZER_PIN);
    }

    updateOLED();

    if (mqttClient.connected()) {
      StaticJsonDocument<256> doc;
      doc["device_id"] = "SENTINEL-NODE-01";
      doc["temperature"] = temperature;
      doc["humidity"] = humidity;
      doc["gas"] = gasRawValue;
      doc["motion"] = motionDetected;
      doc["buzzer"] = isAlarmActive;

      char buffer[256];
      serializeJson(doc, buffer);
      mqttClient.publish("sentinel/telemetry", buffer);
    }
  }
}
