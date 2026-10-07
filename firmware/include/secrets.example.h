#pragma once
// Modèle : copier ce fichier en include/secrets.h (non versionné) puis le compléter.

// Wi-Fi du PC Serveur Local (point d'accès de la table).
#define WIFI_SSID "nom-du-wifi-de-table"
#define WIFI_PASSWORD "change-me"

// Broker MQTT sur le PC serveur. Port 1883 = mode compatibilité de la stack
// (LEGACY_MQTT_ENABLED=true dans le .env), MQTT non chiffré : provisoire.
#define MQTT_SERVER "192.168.10.1"
#define MQTT_PORT 1883

// Certificat et clé du serveur HTTPS embarqué (port 443). Générer une paire PROPRE au boîtier :
//   openssl req -x509 -newkey rsa:2048 -nodes -days 365 -subj "/CN=sentinel.local" \
//     -keyout esp-key.pem -out esp-cert.pem
// puis coller le contenu des deux fichiers ci-dessous. Ne jamais réutiliser une clé déjà
// publiée dans un dépôt git.
const char server_cert[] PROGMEM = R"PEM(
-----BEGIN CERTIFICATE-----
...
-----END CERTIFICATE-----
)PEM";

const char server_key[] PROGMEM = R"PEM(
-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----
)PEM";
