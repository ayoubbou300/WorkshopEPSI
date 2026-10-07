#!/bin/sh
# Génère une autorité de certification locale et le certificat du PC serveur.
# Usage : scripts/gen-certs.sh <IP-du-serveur> [nom-dns]
#   ex. : scripts/gen-certs.sh 192.168.10.1 sentinel.local
#
# Fichiers produits dans infra/certs/ :
#   ca.crt      public  : à embarquer dans le firmware ESP8266 et à importer dans le navigateur
#   ca.key      PRIVÉ   : ne jamais versionner ni copier ailleurs
#   server.crt  public  : présenté par Mosquitto (8883) et nginx (443)
#   server.key  PRIVÉ   : ne jamais versionner
set -eu

IP="${1:?Usage : $0 <IP-du-serveur> [nom-dns]}"
DNS="${2:-sentinel.local}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/infra/certs"
DAYS=365

mkdir -p "$DIR"
cd "$DIR"

if [ ! -f ca.key ]; then
  openssl genrsa -out ca.key 2048
  openssl req -x509 -new -key ca.key -sha256 -days "$DAYS" \
    -subj "/CN=Sentinel-X Local CA" -out ca.crt
fi

openssl genrsa -out server.key 2048
openssl req -new -key server.key -subj "/CN=$DNS" -out server.csr
cat > server.ext <<EOF
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
# DNS:$IP en plus d'IP:$IP : BearSSL (ESP8266) ne compare le nom qu'aux entrées DNS.
subjectAltName=IP:$IP,DNS:$IP,DNS:$DNS,DNS:localhost,IP:127.0.0.1
EOF
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -days "$DAYS" -sha256 -extfile server.ext -out server.crt
rm -f server.csr server.ext ca.srl

# Lisible par les conteneurs Mosquitto et nginx (montés en lecture seule).
chmod 0644 ca.crt server.crt server.key
chmod 0600 ca.key

echo "Certificats générés dans $DIR (SAN : IP:$IP, DNS:$IP, DNS:$DNS)"
openssl x509 -in server.crt -noout -subject -enddate
