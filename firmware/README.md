# Firmware ESP8266 (C++ / PlatformIO)

Firmware de l'équipe (Dev 1), intégré à la stack Sentinel-X en **mode compatibilité** :
le boîtier publie sur `sentinel/telemetry` et reçoit ses commandes sur `sentinel/commands`
(voir [docs/contracts.md](../docs/contracts.md#mode-compatibilité-temporaire)).

## Câblage (d'après `src/main.cpp`)

| Composant | Broche ESP8266 |
|---|---|
| DHT22 (data) | D5 / GPIO14 |
| MQ-2 (sortie analogique) | A0 (3,3 V max sur NodeMCU : pont diviseur si le MQ-2 est en 5 V) |
| PIR HC-SR501 (OUT) | D7 / GPIO13 |
| Buzzer | D6 / GPIO12 |
| LED bicolore rouge / verte | D3 / GPIO0 et D8 / GPIO15 |
| OLED SSD1306 SDA / SCL | D2 / GPIO4 et D1 / GPIO5 (adresse 0x3C) |

## Mise en route

1. Côté stack : `LEGACY_MQTT_ENABLED=true` dans le `.env`, puis `docker compose up -d`.
2. `cp include/secrets.example.h include/secrets.h` puis le compléter :
   - Wi-Fi de la table et IP du PC serveur (`MQTT_SERVER`), port `1883` ;
   - nouvelle paire certificat/clé pour le serveur HTTPS embarqué (commande dans le fichier).
   `secrets.h` n'est **jamais** versionné.
3. Vérifier `upload_port` / `monitor_port` dans `platformio.ini` (COM3 sous Windows).
4. `pio run -t upload`, puis `pio device monitor` : la console doit afficher l'IP obtenue,
   et `docker compose logs -f api` doit montrer les mesures de `sentinel-node-01`.

Une lecture DHT22 échouée est publiée en `null` et affichée « -- » : jamais une valeur inventée.

## Reste à faire avant la démo

Le mode compatibilité utilise MQTT **non chiffré**. Le sujet impose MQTTS : passer au port
8883 avec `BearSSL::WiFiClientSecure`, la CA `infra/certs/ca.crt`, l'utilisateur `esp-01`
et le format complet de [docs/contracts.md](../docs/contracts.md) (topics par boîtier,
confirmation des commandes, Last Will).
