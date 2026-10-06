# Contrats d'interface Sentinel-X

> **Statut : proposition à valider** avec Dev 1 (firmware) et la personne IA lors de la réunion de
> lancement. Le backend implémente déjà ces formats ; toute modification doit être reportée ici
> **et** dans `backend/app/schemas.py`.

## Conventions générales

| Sujet | Convention |
|---|---|
| Dates | UTC, ISO 8601, suffixe `Z` (ex. `2026-10-05T14:00:00Z`) |
| Température | °C, `-40` à `80` (plage DHT22) |
| Humidité | %, `0` à `100` |
| Gaz | Valeur ADC brute de l'ESP8266, `0` à `1023`, tant qu'aucune calibration n'est définie |
| Valeur manquante | `null` ou champ absent = **inconnue**. Ne jamais envoyer `0` à la place |
| Identifiant boîtier | `^[a-z0-9][a-z0-9-]{0,31}$`, ex. `esp-01`. C'est aussi le nom d'utilisateur MQTT |
| Champs inconnus | Rejetés : un champ non prévu fait refuser tout le message |

## MQTT

Broker : Mosquitto sur le PC serveur.

| Port | Usage | Chiffrement |
|---|---|---|
| `8883` | ESP8266 (publié sur le réseau de table) | TLS 1.2+, certificat signé par la CA locale `infra/certs/ca.crt` |
| `1883` | Backend et simulateur, **réseau Docker interne uniquement** | aucun (non exposé) |

Accès anonyme interdit. Chaque client a son propre compte ; l'ACL (`infra/mosquitto/acl`) limite
chaque boîtier à ses propres topics.

| Topic | Sens | QoS | Retained |
|---|---|---|---|
| `sentinel/devices/<id>/telemetry` | boîtier → serveur | 1 recommandé | non |
| `sentinel/devices/<id>/status` | boîtier → serveur | 1 | **oui** (avec Last Will) |
| `sentinel/devices/<id>/commands` | serveur → boîtier | 1 | **non, jamais** |
| `sentinel/devices/<id>/acks` | boîtier → serveur | 1 | non |

Taille maximale d'un message : 4 Ko côté backend, 8 Ko côté broker.

### Mesure (`telemetry`)

```json
{
  "schema_version": 1,
  "device_id": "esp-01",
  "boot_id": "a1b2c3d4",
  "sequence": 42,
  "timestamp": "2026-10-05T14:00:00Z",
  "temperature": 24.5,
  "humidity": 53.2,
  "gas_raw": 318,
  "motion": false
}
```

- `device_id` doit être identique à `<id>` dans le topic, sinon le message est rejeté.
- `timestamp` : `null` si l'ESP8266 n'a pas encore d'heure NTP. Le backend enregistre toujours
  sa propre heure de réception `received_at`, qu'il utilise pour les courbes.
- `boot_id` : chaîne aléatoire tirée à chaque démarrage du firmware. `sequence` : compteur
  incrémenté à chaque mesure, **qui n'est pas remis à zéro lors d'une reconnexion Wi-Fi/MQTT**.
  Le couple `(device_id, boot_id, sequence)` permet d'ignorer les retransmissions QoS 1.
- `motion` : booléen JSON (`true`/`false`), pas `0`/`1`.
- `simulated` (optionnel, défaut `false`) : réservé à `scripts/simulate.py`.
- Cadence proposée : une mesure toutes les **2 s**. Le DHT22 ne doit pas être lu plus d'une fois
  toutes les 2 s. **À confirmer avec l'IA** selon les besoins du modèle d'anomalies.

### État de connexion (`status`)

```json
{ "online": true }
```

- À la connexion : publier `{"online": true}` avec retained.
- Last Will configuré à la connexion : `{"online": false}`, retained, QoS 1.
- Le dashboard signale aussi les **données périmées** : aucune mesure depuis plus de
  `STALE_AFTER_SECONDS` (15 s par défaut), même si le boîtier reste connecté au broker.

### Commande (`commands`)

```json
{
  "command_id": "cmd-3f2a9c1b7e5d4a6f8b0c",
  "action": "set_buzzer",
  "value": true,
  "expires_at": "2026-10-05T14:00:10Z"
}
```

| `action` | `value` | Effet |
|---|---|---|
| `set_buzzer` | `true` / `false` | Active ou arrête le buzzer |
| `set_led` | `true` / `false` | Allume ou éteint la LED de statut |

Règles pour le firmware :

1. Les actions **définissent un état** (jamais « inverser ») : une retransmission ne doit pas produire l'effet inverse.
2. Doublons : mémoriser les derniers `command_id` traités (ex. les 8 derniers). Pour un doublon,
   renvoyer la confirmation sans rejouer l'action.
3. Expiration : si l'heure NTP est disponible et `now > expires_at`, ne pas exécuter et
   confirmer avec `status: "expired"`. Sans heure fiable, exécuter. **Point à valider avec Dev 1.**
4. Délai de confirmation côté serveur : `COMMAND_TIMEOUT_SECONDS` (10 s par défaut).

### Confirmation (`acks`)

```json
{
  "command_id": "cmd-3f2a9c1b7e5d4a6f8b0c",
  "device_id": "esp-01",
  "status": "applied",
  "buzzer": true,
  "led": false
}
```

| `status` | Signification | État de la commande côté serveur |
|---|---|---|
| `applied` | action exécutée | `confirmed` |
| `rejected` | action refusée (ex. inconnue) | `failed` |
| `expired` | reçue après `expires_at` | `failed` |
| `error` | échec matériel | `failed` |

- `buzzer` / `led` : état **réel** des actionneurs après traitement. Ils sont optionnels mais
  recommandés, car le dashboard affiche cet état comme « état confirmé ».
- `reason` (optionnel, 200 caractères maximum) : explication affichée en cas d'échec.
- Sans confirmation avant `expires_at` (+1 s), la commande passe en `timeout`, c'est-à-dire
  **non confirmée** : l'action a pu être exécutée sans que le retour arrive. Une confirmation
  tardive met à jour l'état observé des actionneurs, mais la commande reste `timeout`.

## API HTTP

Base : `https://<serveur>` (nginx → FastAPI). Documentation interactive : `/docs` sur l'API
(accessible depuis le conteneur uniquement).

### `POST /api/v1/alerts` (service IA)

Authentification : en-tête `X-API-Key: <ALERTS_API_KEY>`. Vérifier le certificat du serveur
avec `infra/certs/ca.crt` (pas de `verify=False`).

```json
{
  "event_id": "vision-20261005T140003Z-001",
  "device_id": "esp-01",
  "source": "vision",
  "type": "person_detected",
  "severity": "warning",
  "timestamp": "2026-10-05T14:00:03Z",
  "score": 0.91,
  "message": "Présence humaine détectée"
}
```

| Champ | Règle |
|---|---|
| `event_id` | Obligatoire et unique : `^[A-Za-z0-9._:-]{1,64}$`. Le renvoyer à l'identique en cas de nouvelle tentative |
| `source` | `sensor`, `vision` ou `anomaly` |
| `type` | `^[a-z0-9_]{1,48}$`, ex. `person_detected`, `env_anomaly` |
| `severity` | `info`, `warning` ou `critical` |
| `timestamp` | Optionnel, ISO 8601 avec fuseau |
| `score` | Optionnel. **Documenter son sens** : confiance YOLO (0-1) ou score d'anomalie Isolation Forest, qui n'est pas une probabilité |
| `message` | Optionnel, 500 caractères maximum |

Réponses : `201` alerte créée · `200` avec `"duplicate": true` si `event_id` est déjà connu · `401` clé invalide ·
`422` format invalide · `413` corps de plus de 16 Ko.

**Temporisation (à fixer avec l'IA)** : ne pas envoyer une alerte à chaque image. Proposition :
une alerte `person_detected` au début d'une présence, puis au plus une toutes les 30 s tant
qu'elle dure.

### Historique pour le modèle d'anomalies

`GET /api/v1/measurements?device_id=esp-01&since=<ISO>&until=<ISO>&limit=<1..2000>` renvoie
les mesures par ordre chronologique. Cette route demande aujourd'hui une session du dashboard.
**À décider avec l'IA** : lecture via cette route avec un compte de service, ou abonnement
direct au topic `telemetry` avec un compte MQTT en lecture seule.

### Flux vidéo

Le service IA est le **seul** propriétaire de la webcam. Il expose un flux MJPEG
(`multipart/x-mixed-replace`) **en local**, avec les détections dessinées sur l'image, par
exemple `http://0.0.0.0:8081/stream`, en 640x480. L'API le relaie au navigateur via
`GET /api/v1/video` derrière la session du dashboard (variable `VIDEO_STREAM_URL`).
Le port du flux ne doit pas être ouvert sur le réseau de table : seul le conteneur API y accède,
via `host.docker.internal`.

### Routes du dashboard (session requise)

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/api/v1/auth/login` / `logout` · GET `/api/v1/auth/me` | Session (cookie HttpOnly, SameSite=Strict) |
| GET | `/health` | État du service et de ses dépendances (sans authentification) |
| GET | `/api/v1/devices` | Boîtiers, dernière mesure, `stale` |
| GET | `/api/v1/devices/{id}` | Un boîtier |
| GET | `/api/v1/measurements` | Historique (voir plus haut) |
| GET | `/api/v1/alerts?source=&severity=&device_id=&before_id=&limit=` | Historique paginé, les plus récentes d'abord |
| POST | `/api/v1/devices/{id}/commands` `{"action","value"}` | Retourne `202` + commande `pending` |
| GET | `/api/v1/commands/{id}` | État : `pending`, `confirmed`, `failed` ou `timeout` |
| WS | `/api/v1/live` | Événements `{"type","data"}` : `measurement`, `device`, `alert`, `command`, `server` |

## Décisions encore ouvertes (section 5 du plan)

- [ ] PC serveur et système d'exploitation
- [ ] Responsable du point d'accès Wi-Fi et du plan d'adressage (ex. `192.168.10.0/24`)
- [ ] Adresse IP fixe du serveur, à utiliser pour `scripts/gen-certs.sh`
- [ ] Cadence des mesures
- [ ] Comportement du firmware sans heure NTP pour `expires_at`
- [ ] Temporisation des alertes vision et sens du `score`
- [ ] Accès de l'IA à l'historique des mesures
- [ ] Port et URL du flux MJPEG
- [ ] Répartition : Docker et TLS, durcissement (UFW, SSH), audit, boîtier Fablab, livrables
