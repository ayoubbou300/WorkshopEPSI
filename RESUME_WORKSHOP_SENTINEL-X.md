# 🚀 Résumé Complet du Workshop BAC+4 (2026-2027) — Mission SENTINEL-X

Ce document synthétise l'ensemble des documents présents dans le dossier du Workshop (Sujet principal, consignes particulières, fiches composants, guides d'installation et fiches techniques IoT).

---

## 📌 1. Vue d'Ensemble & Contexte du Projet

* **Intitulé du sujet** : **MISSION SENTINEL-X — L'Avant-Poste Industriel du Futur**
* **Public concerné** : Apprenants EPSI (Bac+4 / Mastère 1ère année)
* **Format** : Sprint d'ingénierie intensif de **4 jours** (Lundi au Vendredi) en consortiums pluridisciplinaires (4 à 6 personnes).
* **Contexte fictif (An 2050)** : La multinationale *AetherCorp Industrial Solutions* déploie des micro-centrales énergétiques dans des zones isolées et hostiles. Face à une vague simultanée de cyberattaques, d'intrusions physiques et d'incidents environnementaux (fuites de gaz, surchauffes), elle lance le projet **SENTINEL-X**.
* **Objectif global** : Concevoir un **boîtier de surveillance physique autonome (Edge Node)** connecté sans fil à un **PC Serveur Local** (Centre de Commandement Tactique durci).

---

## 🛠️ 2. Les 4 Piliers Technologiques & Spécifications par Filière

Chaque équipe fonctionne comme un studio d'ingénierie combinant 4 spécialités :

| Filière / Spécialité | Rôle & Réalisations attendues |
| :--- | :--- |
| **1° EISI DEV** (Développement) | **Micrologiciel ESP8266** (C++ via PlatformIO) pour la lecture cadencée des capteurs, affichage sur écran OLED I2C et structuration JSON.<br>**API Backend & REST/WebSocket** (Node.js, Python ou Go) sur le serveur local.<br>**Dashboard de Supervision Web** (React, Vue ou JS natif) affichant métriques temps réel et retour vidéo.<br>**Contrôle réactif** déclenchant les actionneurs (buzzers, LEDs). |
| **2° EISI IA** (Intelligence Artificielle & Data) | **Vision Intelligente** : Script Python sur le PC Serveur analysant le flux webcam USB en temps réel avec inférence (ex: YOLOv8-tiny) pour détecter les intrusions humaines.<br>**Maintenance Prédictive** : Détection d'anomalies cinétiques sur séries temporelles de capteurs avec Scikit-Learn (ex: Isolation Forest). Interdiction des règles `if` statiques.<br>**Optimisation** : Bridage webcam (ex: 640x480) pour un traitement $< 100\text{ ms}$ par trame. |
| **3° EISI INFRA** (Réseaux & Systèmes) | **Virtualisation** : Déploiement automatisé de la stack serveur (Base de données, API Dev, Broker MQTT Mosquitto) sous conteneurs **Docker-Compose** sur le PC Serveur Local.<br>**Routage & Topologie** : Déploiement d'un Point d'Accès Wi-Fi local dédié, plan d'adressage IP étanche et isolation de table. |
| **4° CYBER** (Cybersécurité) | **Sécurisation des Flux** : Chiffrement de bout en bout (TLS pour MQTTS / HTTPS) entre ESP8266 et la stack Docker.<br>**Hardening (Durcissement)** : UFW/iptables, clés SSH asymétriques sans mot de passe, isolation des privilèges Docker.<br>**Audit & Pentest Offensif** : Audit et attaques le jeudi (Nmap, Wireshark, Metasploit, MitM, DoS, injections) contre les autres équipes. |

---

## 💻 3. Architecture Matérielle & Choix de Configuration

Le groupe doit valider dès le lundi matin l'une des deux options d'architecture pour le PC Serveur Local :

* **Option A : Centralisation Embarquée (Raspberry Pi 5)**
  * Le PC Serveur Local est un **Raspberry Pi 5 (4 Go RAM)** placé directement à l'intérieur du boîtier imprimé en 3D.
  * Le Raspberry Pi exécute Docker-Compose et le script IA de vision webcam. L'ESP8266 s'y connecte en Wi-Fi.
* **Option B : Topologie Distribuée Edge-to-Server (PC Apprenant)**
  * Pas de Raspberry Pi. Le rôle de PC Serveur Local est joué par le **PC portable d'un apprenant**.
  * La webcam est branchée sur le PC. Le boîtier SENTINEL-X contient uniquement l'ESP8266 et ses capteurs, communiquant en Wi-Fi avec l'IP du PC.

---

## 🧰 4. Matériel et Composants Électroniques

### Composants Obligatoires
* **Module IoT** : Espressif ESP8266 (ESP-12E NodeMCU Lolin v3) monté sur son boîtier de prototypage avec 2 breadboards 170 pts.
* **Capteurs** :
  * Température & Humidité : **DHT22** (haute précision)
  * Qualité de l'air / Gaz : **MQ-2**
  * Détection de Mouvement : **PIR HC-SR501**
  * Caméra : **Webcam USB Full HD 1080P**
* **Affichage & Alertes** : Écran OLED 0.96" I2C (adresse `0x3C`), Buzzer actif (mono-ton 3V), LED Bicolore Rouge/Vert.

### Composants Optionnels
* Capteurs magnétiques (Effet Hall OH49E, Bilame ILS), Capteur Infra-rouge de proximité, Photo-interrupteur à fourche, Micro-Switch (55mm), Capteur d'inclinaison à bille (Tilt SW-520D), Capteur de déformation (Force).
* Actionneurs : Moteur Pas à Pas 28BYJ-48 (+ driver ULN2003A), Moteur DC (+ driver L298N), Micro-Servo SG90.

### ⚠️ Directives Électriques Critiques & Alimentation
* **Phase Développement** : L'ESP8266 est alimenté **exclusivement par le câble USB** relié à l'ordinateur.
* **Phase Production** : Alimentation via le bloc secteur `220V -> 7.5VDC` connecté sur les broches **VIN** (+) et **G** (-). L'ESP8266 régule cette tension en 3.3V.
* 🚨 **INTERDICTION ABSOLUE** : Ne **JAMAIS** brancher simultanément le bloc d'alimentation 7.5V sur VIN et le câble USB sous peine de détruire la carte ESP8266 ou le port USB du PC !

---

## 📅 5. Planning & Deroulé du Sprint (Semaine)

* **LUNDI** : Kick-off, présentation du cahier des charges, constitution des équipes (4-6 pers.), choix de l'architecture (Option A ou B), validation du schéma réseau avec les coachs, début de modélisation 3D CAO.
* **MARDI** : Câblage des composants sur breadboards, déploiement des conteneurs Docker (INFRA), écriture du firmware ESP8266 & API (DEV), entraînement des modèles IA.
* **MERCREDI** : Intégration globale (flux capteurs -> serveur -> dashboard web), vidéo de vision IA. Après-midi : Tournage du teaser vidéo "Sentinel Drop" sur fond vert.
* **JEUDI** :
  * *Matin* : **Gel du code** et finitions du boîtier au Fablab (impression 3D & gravure laser).
  * *Après-midi* : **Hacking Day & Pentest croisé national** (attaques inter-groupes, rédaction du rapport d'audit).
* **VENDREDI** : Dépôt final des livrables (matin), soutenances locales devant le jury avec démonstration en direct (Live Demo).

---

## 📦 6. Livrables Exigés (Jeudi Soir / Vendredi Matin)

Le dossier déposé doit être nommé `Workshop2026-M1-G<n>` (où `<n>` est le N° de groupe) :
1. **Rapport d'Ingénierie Technique (`...-Dossier.pdf`)** : Schéma réseau, schéma d'interconnexion électronique, matrice de sécurité (TLS, Hardening), documentation IA, rapport d'audit Pentest + Poster format A3 en annexe.
2. **Support de Présentation (`...-Pres.pptx`)** : Support visuel pour la soutenance orale.
3. **Vidéo Teaser "Sentinel Drop" (`...-VidDrop.mp4`)** : Clip promotionnel de **60 secondes chrono** au format vertical (9:16 - Instagram Reel / TikTok / Short) tourné sur fond vert.
   * *0-10s* : Le Hook (mise en scène de la menace).
   * *10-30s* : Présentation du produit physique (boîtier Fablab, gravure laser, écran OLED).
   * *30-50s* : Démonstration incrustée sur fond vert (architecture, code, vision IA YOLO).
   * *50-60s* : Call to Action / Outro ("Sentinel-X : la sécurité à la bordure").
4. **Archive du Code (`...-Code.zip`)** : Dépôt Git nettoyé avec `README.md` complet et sans clés/secrets en clair.
5. **Le Prototype Physique SENTINEL-X** : Boîtier final fonctionnel déposé au myDiL le vendredi matin.

---

## 🏆 7. Modalités d'Évaluation & Barème

* **Note Globale Locale** = `(Note Individuelle Suivi x 1 + Note Collective Jury x 2) / 3`
* **Suivi Hebdomadaire (20 pts, coeff 1)** : Engagement (4pts), Expertise Technique Filière (4pts), Agilité & Autonomie (4pts), Collaboration Transversale (4pts), Rigueur d'Ingénierie & Git (4pts).
* **Soutenance Locale (20 pts, coeff 2)** :
  * Axe 1 : Démo Live & Intégration Globale (5 pts)
  * Axe 2 : Technicité, Innovation & Sécurité (4 pts)
  * Axe 3 : Marketing & Teaser Vidéo (4 pts)
  * Axe 4 : Posture, Storytelling & Pitch (4 pts)
  * Axe 5 : Qualité Documentaire & Q&A (3 pts)
* **Finale Nationale (17 Novembre 2026 sur Teams)** : Les 10 équipes championnes de chaque campus s'affrontent en direct devant un collège national (Démo Live 5 min + Scrutin national croisé sur 43 points).

---

## 🏢 8. Règlements, Fablab & Logistique Campus

* **Horaires** : 09h00 - 13h00 (pause 11h00-11h15) | 14h00 - 17h00 (pause 15h30-15h45). Pause déjeuner obligatoire entre 13h00 et 14h00.
* **Émargement** : Obligatoire 2 fois par jour via **Edusign** ou feuille papier (dans les 15 premières minutes de chaque demi-journée).
* **Salles réservées** : Utilisation stricte des salles attribuées (Amphis 1 & 2, Salles 103, 105, 106, 109, 110, 111, 114, 115). Remise en état des salles chaque soir.
* **Consignes Fablab / myDiL** :
  * Protection des tables : Utilisation obligatoire de plaques de protection pour la découpe au cutter et le collage.
  * Impression 3D : Anticiper les impressions sur Fusion360 / Creality Slicer (épaisseurs de parois max 1.2 mm).
  * Découpe/Gravure Laser : Réalisée sur Creality Falcon / Lightburn / Inkscape.

---

## 💻 9. Guides Techniques & Environnement de Développement (`_Divers`)

Le sous-dossier `_Divers` fournit des guides pour l'installation et la prise en main de l'environnement de développement :

1. **Installation IDE (`EPSI_Installation-IDE-IoT...pdf`)** :
   * Outil préconisé : **CLion (JetBrains)** avec le plugin **PlatformIO**.
   * Nécessite **Python 3.14+** et le script `get-platformio.py`.
2. **Premier Programme IoT (`EPSI_Atelier-IoT_000-MonPremierProgramme...pdf`)** :
   * Tutoriel pas à pas pour créer un projet PlatformIO sous CLion pour ESP8266.
   * Explication de la LED native (`LED_BUILTIN` sur la broche D4 / GPIO2, active à l'état BAS `LOW`).
   * Configuration du fichier `platformio.ini` (déclaration de la carte `esp12e`, du framework `arduino`, et des ports COM CH340).
3. **Cheatsheet Langage C++/Arduino (`EPSI_Fiche-IoT_DEV_Langage-Arduino...pdf`)** :
   * Guide de référence complet de 30 pages sur le C++ appliqué à Arduino :
     * Fonctions I/O (`pinMode`, `digitalRead`, `digitalWrite`, `analogRead`, `analogWrite`, `tone`).
     * Gestion du temps (`delay`, `millis`, `micros`).
     * Types de données (`bool`, `byte`, `int`, `unsigned int`, `long`, `float`, `char`, `String`, `PROGMEM`, `size_t`).
     * Structuration du code (`setup()`, `loop()`, structures conditionnelles, boucles, pointeurs `&` / `*`).
     * Manipulation des bibliothèques externes via PlatformIO (`lib_deps`).
