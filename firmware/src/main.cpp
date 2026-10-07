#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Arduino.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <ESP8266WebServerSecure.h>
#include <ESP8266WiFi.h>
#include <ESP8266mDNS.h>
#include <PubSubClient.h>
#include <Wire.h>

// Identifiants Wi-Fi, adresse du broker, certificat et clé du serveur HTTPS embarqué :
// définis dans include/secrets.h (non versionné). Modèle : include/secrets.example.h.
#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "include/secrets.h absent : copier include/secrets.example.h et le compléter"
#endif

// Serveur Web sécurisé HTTPS sur le port 443
BearSSL::ESP8266WebServerSecure webServer(443);

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
// NAN = valeur inconnue (lecture DHT22 échouée) : publiée en null, affichée « -- ».
float temperature = NAN;
float humidity = NAN;
int gasRawValue = 0;
bool motionDetected = false;
unsigned long lastPublishTime = 0;

void setupWiFi() {
  delay(10);
  Serial.println();
  Serial.println("======================");
  Serial.println("SENTINEL-X Booting...");
  Serial.println("======================");

  WiFi.persistent(false);
  WiFi.disconnect(true);
  delay(200);

  // Mode station : le boîtier rejoint le Wi-Fi du PC Serveur Local (option B du sujet),
  // seule façon d'atteindre le broker MQTT hébergé sur ce PC.
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("[WiFi] Connexion à '");
  Serial.print(WIFI_SSID);
  Serial.print("'");
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(250);
    Serial.print(".");
  }
  bool connected = WiFi.status() == WL_CONNECTED;
  IPAddress ip = WiFi.localIP();

  Serial.println(connected ? " ✅ SUCCÈS" : " ❌ ÉCHEC (nouvelle tentative automatique)");
  Serial.print("[WiFi] IP : ");
  Serial.println(ip);

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("SENTINEL-X READY");
  display.println("Wi-Fi :");
  display.println(WIFI_SSID);
  display.print("IP: ");
  display.println(connected ? ip.toString() : String("non connecte"));
  display.display();
  delay(1500);
}

void mqttCallback(char *topic, byte *payload, unsigned int length) {
  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, payload, length);
  if (error)
    return;

  if (doc.containsKey("buzzer")) {
    bool buzzerState = doc["buzzer"];
    digitalWrite(BUZZER_PIN, buzzerState ? HIGH : LOW);
  }
  if (doc.containsKey("alert_level")) {
    const char *level = doc["alert_level"];
    if (strcmp(level, "CRITICAL") == 0) {
      digitalWrite(LED_RED_PIN, HIGH);
      digitalWrite(LED_GREEN_PIN, LOW);
    } else {
      digitalWrite(LED_RED_PIN, LOW);
      digitalWrite(LED_GREEN_PIN, HIGH);
    }
  }
}

void reconnectMQTT() {
  while (!mqttClient.connected()) {
    String clientId = "SentinelX-ESP8266-";
    clientId += String(ESP.getChipId(), HEX);
    if (mqttClient.connect(clientId.c_str())) {
      mqttClient.subscribe("sentinel/commands");
    } else {
      delay(2000);
      break;
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
  if (WiFi.status() == WL_CONNECTED) {
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
  if (isnan(temperature))
    display.print("--.-");
  else
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
  if (isnan(humidity))
    display.print("--");
  else
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
String temperatureText() { return isnan(temperature) ? String("--") : String(temperature, 1); }
String humidityText() { return isnan(humidity) ? String("--") : String((int)humidity); }

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
          temperatureText() + " °C</div></div>";
  html += "<div class='card'><div>Humidité</div><div class='val' id='h'>" +
          humidityText() + " %</div></div>";
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
      "document.getElementById('t').innerText=(d.temperature==null?'--':d.temperature.toFixed(1))+' °C';";
  html += "document.getElementById('h').innerText=(d.humidity==null?'--':Math.round(d.humidity))+' %';";
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
  digitalWrite(BUZZER_PIN, HIGH);
  delay(300);
  digitalWrite(BUZZER_PIN, LOW);
  webServer.send(200, "text/plain", "BUZZER_OK");
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

  // Configuration du certificat SSL X.509 et de la clé privée BearSSL
  webServer.getServer().setRSACert(new BearSSL::X509List(server_cert),
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

  if (WiFi.status() == WL_CONNECTED && !mqttClient.connected()) {
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
    temperature = rawTemp;
    humidity = rawHumi;
    if (isnan(rawTemp) || isnan(rawHumi)) {
      Serial.print("[DHT] ❌ Echec D5 (valeur inconnue) | ");
    } else {
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

    updateOLED();

    if (mqttClient.connected()) {
      // NAN -> null dans le JSON : le serveur affiche « valeur inconnue », jamais un faux chiffre.
      StaticJsonDocument<256> doc;
      doc["device_id"] = "SENTINEL-NODE-01";
      doc["temperature"] = temperature;
      doc["humidity"] = humidity;
      doc["gas"] = gasRawValue;
      doc["motion"] = motionDetected;

      char buffer[256];
      serializeJson(doc, buffer);
      mqttClient.publish("sentinel/telemetry", buffer);
    }
  }
}
