# Sentinel-X

Avant-poste de surveillance industrielle, réalisé pour le Workshop EPSI M1 2026-27 (option B :
PC portable comme serveur local).

Un boîtier **ESP8266** (DHT22, MQ-2, PIR, OLED, buzzer, LED) publie ses mesures en **MQTTS**
vers une stack Docker locale. Un service **IA** analyse la webcam USB et les séries temporelles.
Un **dashboard React** affiche le tout en temps réel et permet de commander les actionneurs,
avec confirmation du boîtier.

```
ESP8266 ──MQTTS:8883──► Mosquitto ──► API FastAPI ──► PostgreSQL
   ▲                        │            │   ▲
   └──── commandes ◄────────┘            │   └── POST /api/v1/alerts ◄── Service IA (webcam USB)
                                         │                                   │ MJPEG local
Navigateur ◄──HTTPS/WSS:443── nginx ◄────┘ ◄── /api/v1/video ◄───────────────┘
```

## Contenu du dépôt

| Chemin | Contenu | Responsable |
|---|---|---|
| `backend/` | API FastAPI : REST, WebSocket, pont MQTT, stockage, tests | Dev 2 |
| `backend/migrations/` | Schéma PostgreSQL versionné (appliqué au démarrage) | Dev 2 |
| `frontend/` | Dashboard React + TypeScript (Vite), servi par nginx en HTTPS | Dev 2 |
| `firmware/` | Firmware C++ de l'ESP8266 | Dev 1 |
| `ai/` | Vision (webcam) et détection d'anomalies | IA |
| `infra/mosquitto/` | Configuration du broker, ACL, génération des mots de passe | Partagé |
| `infra/certs/` | Certificats TLS générés localement (clés privées non versionnées) | Partagé |
| `scripts/` | Génération des certificats, simulateur, envoi d'alertes de test | Dev 2 |
| `docs/contracts.md` | **Formats des messages, topics MQTT et API** | Partagé |
| `compose.yaml` | Services, réseau, volumes, healthchecks | Partagé |

## Prérequis

- Docker Desktop (macOS/Windows) ou Docker Engine + Compose v2 (Linux)
- `openssl` (présent par défaut sur macOS et Linux)
- Node.js n'est **pas** nécessaire : le frontend est compilé dans Docker.

> **macOS** : Docker Desktop ne partage par défaut que `/Users`, `/Volumes`, `/private` et `/tmp`.
> Si le dépôt est ailleurs (ex. `/Applications/XAMPP/...`), ajoutez son dossier dans
> *Docker Desktop → Settings → Resources → File sharing*, ou clonez-le dans votre dossier
> personnel. Sinon Mosquitto et nginx ne trouvent ni leur configuration ni les certificats.

## Installation

```sh
# 1. Configuration : copier puis remplacer CHAQUE "change-me" par un secret fort
cp .env.example .env
#    ex. : openssl rand -hex 16   (mots de passe)   openssl rand -hex 32   (SESSION_SECRET)
#    L'API refuse de démarrer si un secret vaut encore "change-me".

# 2. Certificats TLS : IP fixe du PC serveur sur le réseau de table (+ nom DNS facultatif)
scripts/gen-certs.sh 192.168.10.1 sentinel.local

# 3. Lancement
docker compose up -d --build
docker compose ps        # tous les services doivent être "healthy" ou "running"
```

Ouvrir **https://<IP-du-serveur>/** (ou `https://localhost/`) et se connecter avec
`DASHBOARD_USER` / `DASHBOARD_PASSWORD`.

Le navigateur signale un certificat inconnu tant que `infra/certs/ca.crt` n'est pas importé
comme autorité de confiance. Sur macOS : double-cliquer `ca.crt`, puis dans le Trousseau,
*Se fier toujours*. Sous Firefox : *Paramètres → Certificats → Autorités → Importer*.

> **Conflit de ports** : si Apache (XAMPP) ou un autre service occupe déjà 80/443, changez
> `HTTP_PORT` / `HTTPS_PORT` dans `.env` (ex. 8080/8443), puis ouvrez `https://localhost:8443/`.

## Utilisation

### Simulateur (sans matériel)

```sh
docker compose --profile sim up -d simulator
```

Il publie toutes les 2 s des mesures du boîtier `sim-01`, avec le statut et le Last Will, et
confirme les commandes comme le ferait le firmware. Ses mesures portent `"simulated": true` et
le dashboard affiche un bandeau **SIMULATION** : elles ne doivent pas être présentées comme
physiques. Pour l'arrêter : `docker compose stop simulator`.

### Envoyer une alerte de test

```sh
ALERTS_API_KEY=<valeur du .env> python3 scripts/send_alert.py --url https://localhost \
    --cafile infra/certs/ca.crt --source vision --type person_detected
```

Relancer avec le même `--event-id` montre la déduplication (`"duplicate": true`).

### Brancher le vrai boîtier (Dev 1)

- Broker : `<IP-du-serveur>:8883` en TLS, utilisateur `MQTT_DEVICE_ID` (`esp-01`) avec le mot
  de passe `MQTT_DEVICE_PASSWORD`.
- Embarquer `infra/certs/ca.crt` dans le firmware et **vérifier** le certificat du serveur
  (BearSSL `X509List` + `setTrustAnchors`), sans jamais appeler `setInsecure()`. L'heure NTP
  est nécessaire pour valider la date du certificat.
- Formats et règles des messages : [docs/contracts.md](docs/contracts.md).

### Mode compatibilité (ancien firmware)

Tant que le firmware et le script de vision utilisent encore les topics `sentinel/telemetry`,
`sentinel/commands` et `sentinel/alerts/vision`, mettez `LEGACY_MQTT_ENABLED=true` dans `.env`,
puis lancez `docker compose up -d`. Le boîtier se connecte alors en MQTT **non chiffré** sur
`<IP-du-serveur>:1883` et apparaît avec le badge **COMPAT**. Détails et limites :
[docs/contracts.md](docs/contracts.md#mode-compatibilité-temporaire). **Repassez à `false`
avant la démo.**

### Brancher le service IA

- Alertes : `POST https://<serveur>/api/v1/alerts` avec l'en-tête `X-API-Key`, en vérifiant le
  certificat avec `ca.crt`.
- Vidéo : exposer le flux MJPEG annoté sur le PC serveur (par défaut `http://localhost:8081/stream`)
  et régler `VIDEO_STREAM_URL` si besoin. Le dashboard le récupère via l'API, sans ouvrir de
  seconde capture webcam.

## Tests

```sh
docker compose --profile test run --rm --build tests
```

32 tests couvrent la validation des messages, les doublons (mesures et alertes), le cycle complet
des commandes (confirmée, refusée, expirée, confirmation tardive, broker absent), le contrôle
d'accès, la limitation des tentatives de connexion et la taille des requêtes. Ils utilisent
une base `sentinel_test` séparée.

## Exploitation

| Action | Commande |
|---|---|
| Journaux | `docker compose logs -f api` (ou `mosquitto`, `web`, `simulator`) |
| État de santé | `curl --cacert infra/certs/ca.crt https://localhost/health` |
| Redémarrer | `docker compose restart` (l'historique est conservé dans le volume `pgdata`) |
| Arrêter | `docker compose down` (**ne pas** ajouter `-v`, qui supprime la base) |
| Console SQL | `docker compose exec db psql -U sentinel sentinel` |

Les journaux Docker sont limités à 3 fichiers de 10 Mo par service.

## Sécurité mise en place

- **MQTTS** sur 8883 avec une CA locale ; le port 1883 en clair n'est joignable que sur le réseau Docker interne.
- Mosquitto : accès anonyme refusé, un compte par client, ACL limitant chaque boîtier à ses propres topics.
  Les mots de passe sont générés au démarrage depuis `.env`.
- Dashboard en **HTTPS/WSS** (HSTS, CSP, `X-Frame-Options`), session signée en cookie `HttpOnly` +
  `Secure` + `SameSite=Strict`. Aucun secret n'est embarqué dans le bundle React.
- `POST /api/v1/alerts` protégé par clé d'API ; lecture, commandes, WebSocket et vidéo protégés par session.
- 5 tentatives de connexion par minute et par IP, au maximum.
- Validation stricte des entrées (types, bornes, tailles, champs inconnus refusés, actions en liste blanche).
  Corps HTTP limité à 16 Ko, messages MQTT à 4 Ko.
- Requêtes SQL paramétrées ; PostgreSQL non exposé hors du réseau Docker.
- Conteneur API en lecture seule, utilisateur non root, `no-new-privileges`.

Restent à faire avec la personne infra/cyber : pare-feu (UFW), SSH par clé uniquement, isolation
du réseau de table, preuve du chiffrement (capture Wireshark) et audit.

## Limites connues

- Si la base est indisponible, les mesures MQTT reçues pendant la coupure sont **perdues**
  (journalisées). Aucune file de rejeu n'est implémentée.
- Les commandes sont en QoS 1 : un doublon est possible et le firmware doit le gérer
  (`command_id`).
- Le flux vidéo ouvre une connexion vers le service IA par navigateur connecté.
- Un seul compte superviseur, défini dans `.env`.

## Dépannage

| Symptôme | Piste |
|---|---|
| `mosquitto` redémarre en boucle | `docker compose logs mosquitto` : certificats absents, à générer avec `scripts/gen-certs.sh` |
| `api` ne démarre pas : « secret manquant » | Une valeur vaut encore `change-me` dans `.env` |
| `mounts denied` / fichiers introuvables (macOS) | Voir le partage de fichiers dans *Prérequis* |
| L'ESP8266 n'arrive pas à se connecter | IP du certificat différente de celle utilisée par l'ESP (`gen-certs.sh` avec la bonne IP), heure NTP absente, ou port 8883 bloqué par le pare-feu |
| « Données périmées » sur le dashboard | Plus aucune mesure depuis 15 s : vérifier le boîtier et `docker compose logs api` (messages rejetés) |
| Vidéo indisponible | Le service IA ne tourne pas ou `VIDEO_STREAM_URL` est faux |
| Ports 80/443 occupés | Changer `HTTP_PORT` / `HTTPS_PORT` dans `.env` |
