# 📅 Plan d'Action & Trame de Présentation — Mission SENTINEL-X

Ce document constitue la feuille de route opérationnelle complète (Jour par Jour & Rôle par Rôle) ainsi que la trame officielle de soutenance orale et de storyboard vidéo pour le **Workshop BAC+4 EPSI Sentinel-X**.

---

## 🛠️ PARTIE 1 : PLAN D'ACTION OPÉRATIONNEL (SPRINT 4 JOURS)

### 📌 LUNDI — Kick-off, Idéation, Architecture & Modélisation CAO

#### 🎯 Objectif du jour
Constituer le consortium, trancher l'architecture matérielle, valider le schéma réseau auprès des coachs et lancer les modélisations 3D.

* **Collectif (Toute l'équipe)** :
  * [ ] Validation de la répartition des rôles (DEV, IA, INFRA, CYBER).
  * [ ] Choix de l'architecture matérielle (**Option A** : Raspberry Pi 5 embarqué vs **Option B** : PC Apprenant).
  * [ ] Récupération du kit matériel au myDiL (ESP8266, capteurs, webcam, breadboards, câbles).
  * [ ] Rédaction et **validation obligatoire** du schéma d'architecture réseau & flux avec le coach de campus.

* **Par Filière / Rôle** :
  * **EISI INFRA** : Conception du plan d'adressage IP local (ex: sub-network `192.168.10.0/24`), préparation des fichiers de configuration initiales du point d'accès Wi-Fi et préparation de la structure Docker-Compose.
  * **EISI DEV** : Setup des projets PlatformIO sous CLion sur les postes, validation du flashage de l'ESP8266 (programme test blink), définition du contrat d'interface JSON pour `/api/v1/alerts`.
  * **EISI IA** : Test de captation de la webcam USB sur le PC Serveur, benchmarking et choix du modèle de vision (YOLOv8-tiny vs OpenCV).
  * **EISI CYBER** : Définition des règles de sécurité (matrice TLS/MQTTS, plan de chiffrement, politique d'accès SSH par clés).
  * **Responsable Fablab/Design** : Prise de côtes des composants électroniques et lancement de la modélisation CAO du boîtier sous **Fusion 360**.

---

### 💻 MARDI — Développement Core, Câblage & Virtualisation

#### 🎯 Objectif du jour
Monter le matériel physique, faire communiquer l'ESP8266 avec la stack serveur Docker et entraîner les modèles IA.

* **EISI INFRA** :
  * [ ] Déploiement du conteneur **Broker MQTT Mosquitto** et sécurisation du port (1883 / 8883 MQTTS).
  * [ ] Déploiement des conteneurs Base de Données (PostgreSQL/InfluxDB) et API Dev via `docker-compose.yml`.
  * [ ] Validation de la connectivité réseau et de l'étanchéité du sous-réseau de table.

* **EISI DEV** :
  * [ ] Câblage des capteurs sur l'ESP8266 : **DHT22** (Temp/Humidité), **MQ-2** (Gaz), **PIR** (Mouvement), **OLED I2C**, Buzzer, LED Bicolore.
  * [ ] Écriture du micrologiciel ESP8266 C++ : lecture cadencée des capteurs, affichage statut IP/Wi-Fi sur OLED, envoi des trames au serveur.
  * [ ] Développement des endpoints API REST / WebSockets et du squelette du **Dashboard Web** (courbes temps réel, retour visuel).

* **EISI IA** :
  * [ ] Développement du script Python de **Vision Intelligente** (captation webcam, inférence YOLOv8-tiny pour détection humaine, redimensionnement 640x480 pour latence $< 100\text{ ms}$).
  * [ ] Collecte de données capteurs pour l'entraînement du modèle de **Maintenance Prédictive** (Scikit-Learn : Isolation Forest / Random Forest).

* **EISI CYBER** :
  * [ ] Génération des certificats TLS (MQTTS / HTTPS) et intégration sur l'ESP8266 et le broker.
  * [ ] Première passe de durcissement (Hardening) du serveur : configuration UFW/iptables, blocage SSH par mot de passe.

---

### 🎬 MERCREDI — Intégration Globale & Studio Vidéo (Fond Vert)

#### 🎯 Objectif du jour
Connecter toutes les briques logicielles/matérielles en temps réel et tourner le clip vidéo promo "Sentinel Drop".

* **Intégration Technique (Matin)** :
  * [ ] Validation de la chaîne complète : `Capteurs ESP8266 -> Wi-Fi MQTTS -> Broker Docker -> API/IA -> Dashboard Web -> Actionneurs (Buzzer/LEDs)`.
  * [ ] Test d'intégration de la vidéo webcam sur le Dashboard Web avec overlay de détection IA.
  * [ ] Validation du modèle de maintenance prédictive déclenchant les alertes d'anomalie combinée (ex: hausse de température + déviation gaz).

* **Production Vidéo Teaser "Sentinel Drop" (Après-midi)** :
  * [ ] Écriture du script détaillé (voir Partie 3 de ce document).
  * [ ] Tournage en salle **Fond Vert** / Tableau vert (séquences d'incrustation de l'équipe devant les schémas d'architecture et les flux de code).
  * [ ] Prises de vues B-Roll du boîtier, de l'écran OLED et du câblage.
  * [ ] Montage vidéo au format vertical **9:16 (60 secondes max, encodage H.264 MP4)**.

---

### 🛡️ JEUDI — Gel du Code, Finitions Fablab & Hacking Day (Pentest Croisé)

#### 🎯 Objectif du jour
Finaliser l'objet physique au Fablab le matin, mener l'audit de sécurité croisé l'après-midi et assembler les livrables.

* **Fablab & Gel du Code (Matin)** :
  * [ ] **Gel strict du code** (aucun nouveau commit fonctionnel critique).
  * [ ] Impression 3D finale du boîtier (épaisseurs $\le 1.2\text{ mm}$, passe-câbles propres).
  * [ ] Gravure Laser sur la coque : Logo AetherCorp, consignes de sécurité, numéro de série du module.
  * [ ] Assemblage final de l'électronique dans le boîtier.

* **Pentest Croisé & Sécurité (Après-midi)** :
  * [ ] Lancement du **Pentest croisé national** : audit offensif des infrastructures des groupes concurrents (Nmap, Wireshark, Metasploit, MitM, DoS, injections).
  * [ ] Défense et surveillance MCO du PC Serveur face aux attaques des autres équipes.
  * [ ] Rédaction du **Rapport d'Audit Post-Pentest** et de la matrice de sécurité.

* **Dépôt des Livrables Numériques (Avant l'échéance du soir)** :
  * [ ] Compilation du dossier unique `Workshop2026-M1-G<n>` contenant :
    1. `Workshop2026-M1-G<n>-Dossier.pdf` (Rapport technique + Poster A3)
    2. `Workshop2026-M1-G<n>-Pres.pptx` (Support oral)
    3. `Workshop2026-M1-G<n>-VidDrop.mp4` (Vidéo 60s H.264)
    4. `Workshop2026-M1-G<n>-Code.zip` (Code Git propre avec `README.md`, sans secret en clair)

---

### 🏆 VENDREDI — Soutenances Orales & Démo Live devant Jury

* **08h30 - 09h00** : Dépôt du **Prototype Physique SENTINEL-X** au myDiL.
* **Passage Orale (10 min strictes)** : Exécution du chrono officiel (voir Partie 2).

---

## 📢 PARTIE 2 : TRAME DE PRÉSENTATION ORALE & POWERPOINT (10 MIN)

### ⏱️ Chrono de Passage Impératif (Barème Officiel)

```mermaid
gantt
    title Déroulement du Passage Orale (10 Minutes)
    dateFormat  m:s
    axisFormat %M:%S
    Présentation Équipe & Arch. :active, m1, 00:00, 01:00
    Projection Vidéo "Sentinel Drop" :crit, m2, 01:00, 02:00
    Démo Live Locale en Direct :active, m3, 02:00, 05:00
    Pitch Technique & Échange Q&A :m4, 05:00, 10:00
```

---

### 📊 Structure des Diapositives PowerPoint (`...-Pres.pptx`)

#### Slide 1 : Titre & Introduction
* **Visuel** : Logo AetherCorp, visuel du boîtier Sentinel-X, noms des membres du consortium et leurs filières (DEV, IA, INFRA, CYBER).
* **Pitch (Min 0:00 - 1:00)** : "Bonjour à tous. Face aux menaces critiques sur les infrastructures d'AetherCorp en 2050, notre consortium présente SENTINEL-X, l'avant-poste autonome durci. Nous avons retenu l'architecture [Option A : Raspberry Pi 5 embarqué / Option B : Edge-to-Server PC]."

#### Slide 2 : Déclencheur Vidéo Teaser
* **Visuel** : Lecteur vidéo intégré ou écran de transition pour la vidéo vertical `.mp4`.
* **Pitch (Min 1:00 - 2:00)** : "Découvrons en 60 secondes le rapport de produit commercialisé vivant de Sentinel-X." *(Diffusion de la vidéo `Sentinel Drop`)*.

#### Slide 3 : Architecture Système & Schéma Réseau (Live Demo - Min 2:00 - 5:00)
* **Visuel** : Diagramme réseau interactif (Flux ESP8266 -> Broker Mosquitto MQTTS -> API -> IA YOLO -> Dashboard Web).
* **Script Démo Live** :
  1. **Capteurs physiques** : Provoquer une variation de température/gaz ou un passage devant le capteur PIR. Montrer la réactivité immédiate sur l'écran OLED et sur le Dashboard Web.
  2. **Vision IA Webcam** : Passer la main ou une personne devant la webcam USB et montrer l'encadrement en temps réel par l'IA (YOLOv8-tiny) et le déclenchement du buzzer/LED.
  3. **Maintenance Prédictive** : Expliquer la détection d'anomalie cinétique combinée sans `if` statique.

#### Slide 4 : Briques Techniques — DEV & INFRA
* **Visuel** : Capture du Dashboard Web React/Vue + Schéma des conteneurs Docker-Compose.
* **Points Clés** :
  * Firmware C++ ESP8266 structuré et léger.
  * Isolation stricte des services sous Docker (Mosquitto, DB, API REST/WebSockets).
  * Sous-réseau de table IP étanche.

#### Slide 5 : Briques Techniques — IA & CYBER
* **Visuel** : Matrice de confusion / métriques du modèle Scikit-Learn + Matrice de sécurité Pentest.
* **Points Clés** :
  * Modèle d'inférence IA optimisé ($< 100\text{ ms}$/trame sur 640x480).
  * Chiffrement de bout en bout (TLS / MQTTS).
  * Hardening OS (UFW, clés SSH) et résultats de l'audit Pentest du jeudi.

#### Slide 6 : Conception Physique & Fablab
* **Visuel** : Modélisation CAO Fusion360 vs Photos du boîtier final imprimé 3D et gravé au laser.
* **Points Clés** : Intégration ergonomique de l'électronique, écran OLED lisible, finitions industrielles.

#### Slide 7 : Conclusion & Q&A (Min 5:00 - 10:00)
* **Visuel** : Slogan "Sentinel-X : La sécurité à la bordure", synthèse des indicateurs de performance.
* **Pitch** : Clôture du pitch et ouverture de la phase de questions/réponses avec le jury.

---

## 🎬 PARTIE 3 : STORYBOARD DE LA VIDÉO TEASER (60 SECONDES)

Format exige : **Fichier MP4 vertical 9:16**, encodé en H.264, **durée stricte de 60 secondes**.

| Timing | Séquence / Visuel | Audio & Musique | Contenu Pédagogique / Texte |
| :--- | :--- | :--- | :--- |
| **00s - 10s**<br>*(Le Hook Métier)* | Fond sombre, voyants rouges clignotants, ambiance d'alerte dans une centrale AetherCorp. | Son de sirène industrielle, musique dynamique grave. Voix off : *"Zone isolée. Menace imminente."* | Accroche immédiate du jury. Présentation du défi sécuritaire 2050. |
| **10s - 30s**<br>*(Produit Physique)* | Gros plans (B-Roll) fluides sur le boîtier Sentinel-X : gravure laser AetherCorp, écran OLED affichant l'IP, LED bicolore, intégration propre des capteurs DHT22/MQ-2. | Musique synthwave futuriste montée en puissance. | Valorisation de la fabrication Fablab (Fusion360, Impression 3D, Gravure Laser). |
| **30s - 50s**<br>*(Stack Incrustée Fond Vert)* | **Incrustation Fond Vert** : L'équipe debout au 1er plan devant les schémas d'architecture animés, les flux de code C++, les conteneurs Docker et le retour webcam avec le box de détection YOLO. | Voix off / Membres de l'équipe : *"Intelligence embarquée, chiffrement TLS de bout en bout, réaction en $< 100\text{ ms}$."* | Vulgarisation visuelle de l'IA embarquée et de la stack d'ingénierie. |
| **50s - 60s**<br>*(Outro / Call to Action)* | Alignement de l'équipe complète face caméra incarnant le consortium AetherCorp. Logo Sentinel-X à l'écran. | Musique stinger finale puissante.<br>Équipe en cœur : *"Sentinel-X : La sécurité à la bordure."* | Conclusion percutante et signature du produit. |

---

## 🎯 PARTIE 4 : CHECKLIST DE CONFORMITÉ AU RÉFÉRENTIEL

Avant tout dépôt le jeudi soir et toute soutenances le vendredi, cochez cette grille :

- [ ] **Nommage du dossier de dépôt** : `Workshop2026-M1-G<n>` avec votre N° de groupe exact.
- [ ] **Livrable 1** : `Workshop2026-M1-G<n>-Dossier.pdf` (Contient schéma réseau, schéma câblage, matrice TLS/Hardening, doc IA, rapport Pentest et Poster A3 en annexe).
- [ ] **Livrable 2** : `Workshop2026-M1-G<n>-Pres.pptx` (PowerPoint complet).
- [ ] **Livrable 3** : `Workshop2026-M1-G<n>-VidDrop.mp4` (60s vertical H.264 sur fond vert).
- [ ] **Livrable 4** : `Workshop2026-M1-G<n>-Code.zip` (Code Git sans mot de passe ni clé API en clair).
- [ ] **Livrable 5** : Prototype boîtier physique déposé au myDiL le vendredi matin.
- [ ] **Règle Électrique** : Bloc 7.5V branché **UNIQUEMENT** en production (Jamais en même temps que le câble USB).
- [ ] **Présence & Émargement** : Validé sur Edusign dans les 15 minutes chaque matin et après-midi.
