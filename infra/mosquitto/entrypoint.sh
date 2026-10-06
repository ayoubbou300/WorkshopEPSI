#!/bin/sh
# Génère le fichier de mots de passe Mosquitto à partir des variables d'environnement,
# puis démarre le broker. Aucun mot de passe n'est stocké dans le dépôt.
set -eu

for f in ca.crt server.crt server.key; do
  if [ ! -f "/mosquitto/certs/$f" ]; then
    echo "ERREUR : /mosquitto/certs/$f absent. Lancer scripts/gen-certs.sh avant de démarrer." >&2
    exit 1
  fi
done

: "${MQTT_BACKEND_PASSWORD:?manquant}"
: "${MQTT_DEVICE_ID:?manquant}"
: "${MQTT_DEVICE_PASSWORD:?manquant}"
: "${MQTT_SIM_PASSWORD:?manquant}"

PASSWD=/mosquitto/data/passwd
rm -f "$PASSWD"
touch "$PASSWD"
chmod 0700 "$PASSWD"
mosquitto_passwd -b "$PASSWD" backend "$MQTT_BACKEND_PASSWORD"
mosquitto_passwd -b "$PASSWD" "$MQTT_DEVICE_ID" "$MQTT_DEVICE_PASSWORD"
mosquitto_passwd -b "$PASSWD" sim-01 "$MQTT_SIM_PASSWORD"
chown mosquitto:mosquitto "$PASSWD"

exec /usr/sbin/mosquitto -c /mosquitto/config/mosquitto.conf
